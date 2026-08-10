// U66 — **추론 과정** 조립. 사용자 지정:
//
//   "어떤 테이블을 찾아서 여기에 어떤 디멘젼으로 분석을 하고 연관된 정보를 찾기 위해서
//    온톨로지맵을 조회해서 이걸 잇고 … 아주 직관적으로 단계별로, 그래서 각 단계에서 어떤
//    쿼리를 사용했고. 이런게 있으면 나중에 검산같은거를 하기 좋잖아."
//
// 목적은 **사람의 교차검증**이다. 답이 맞았는지가 아니라 *가는 길이 맞았는지*를 판단할 수
// 있어야 한다. 그래서 각 단계는 세 가지를 한 자리에 묶는다:
//   ① 무엇을 했나(사람 말)  ② 왜 그렇게 판단했나(LLM의 근거 원문)  ③ 무슨 쿼리를 돌렸나
//
// 재료는 전부 서버 trace에 이미 있다 — 흩어져 있던 것을 순서대로 잇는다:
//   · attempts[].reasoning        LLM이 왜 그 테이블·컬럼을 골랐나(실측: 26/26 존재)
//   · attempts[].tables_used      실제로 읽은 테이블
//   · attempts[].query            돌린 SQL/Gremlin 원문
//   · attempts[].guard            안전 검사 판정(거부면 그 이유)
//   · attempts[].clarify_*        축이 모자라 되물은 것과 사람의 답
//   · final.lineage               어디를 어떤 키로 이었나(조인·서브쿼리·순회)
//   · final.verification          Pandas 교차 재계산 판정
//   · steps[]                     카탈로그·온톨로지 조회 등 실행 이력
//
// 원칙: **trace에 있는 것만 적는다.** 없는 단계를 만들지 않는다 — 검산용 서사에 추측이
// 섞이면 그 서사로 판단한 사람이 틀린 결론에 이른다.

import type { X2Step, X2Trace } from './x2-types';

export interface X2ReasonStep {
  /** 화면 좌측 뱃지 */
  kind: 'discover' | 'ontology' | 'ask' | 'plan' | 'guard' | 'execute'
      | 'join' | 'answer' | 'verify' | 'retry';
  /** 단계 제목 — 사람 말 */
  title: string;
  /** 무엇을 했나(한두 문장, 값은 trace에서만) */
  detail?: string;
  /** LLM이 밝힌 판단 근거 원문 — 검산의 핵심. 요약하지 않고 그대로 보여준다. */
  reasoning?: string;
  /** 이 단계가 돌린 쿼리 원문 */
  query?: string;
  engine?: string;
  /** 이 단계에서 쓴 테이블/차원/키 등 — 뱃지로 나열 */
  chips?: string[];
  /** ok=정상, warn=사람 확인 필요, bad=거부·실패 */
  tone?: 'ok' | 'warn' | 'bad';
  rows?: number;
}

/** discover 하위 단계에서 카탈로그 규모를 뽑는다(있으면). */
function catalogChips(steps: X2Step[]): string[] {
  const out: string[] = [];
  for (const s of steps) {
    if (s.stage !== 'discover') continue;
    const c = s.catalog;
    if (c?.tables) out.push(`테이블 ${c.tables}개`);
    if (c?.graph_labels) out.push(`그래프 라벨 ${c.graph_labels}개`);
    // 노트에 숫자가 실려 오는 경우(테이블 38개 확인 / 용어 28개 병합 …)
    const m = /(\S+)\s+(\d+)개\s*(확인|병합)/.exec(s.note ?? '');
    if (m) out.push(`${m[1]} ${m[2]}개`);
  }
  return [...new Set(out)].slice(0, 6);
}

/** 쿼리에서 분석 차원(GROUP BY·필터 축)을 뽑는다 — "어떤 디멘젼으로 분석했나"의 답. */
export function analysisDimensions(sql: string): string[] {
  if (!sql) return [];
  const out: string[] = [];
  // GROUP BY의 컬럼(숫자 위치 지정은 SELECT에서 되짚지 않는다 — 추측이 되므로 생략).
  //
  // ⚠️ 두 함정을 실측으로 확인했다:
  //   · `s`(dotAll) 플래그는 tsconfig target(es2017)에서 쓸 수 없다.
  //   · `[^)]*?`로 끊으면 **CTE 안의 GROUP BY**를 놓친다(실측 POP1: `GROUP BY adstrd_name )`
  //     에서 닫는 괄호가 먼저 와 축이 빈다). 그래서 절 경계 키워드로만 끊는다.
  // GROUP BY가 여러 번 나올 수 있으므로(CTE + 본문) 전부 모은다.
  //
  // ⚠️ `)`를 절 종료로 쓰면 **함수 인자의 닫는 괄호**에서 끊긴다(실측:
  // `GROUP BY date_trunc('month', ts), region`이 `ts`에서 멈춰 `region`을 놓쳤다).
  // CTE 종료는 `)` 앞에 공백이 오는 형태(` )`)로 좁힌다.
  for (const gb of sql.matchAll(
    /group\s+by\s+([\s\S]*?)(?:\border\s+by\b|\bhaving\b|\blimit\b|\bunion\b|\s\)|;|$)/gi)) {
    for (const p of gb[1].split(',')) {
      const t = p.trim().replace(/^["`]|["`]$/g, '');
      // 함수 호출·표현식은 축 이름이 아니다(추측 금지). 인자 조각('month' 등)도 버린다.
      if (t && !/^\d+$/.test(t) && /^[\w".]+$/.test(t)) out.push(t.split('.').pop()!);
    }
  }
  // WHERE의 등호·IN 필터 축(값이 아니라 **축 이름**만 — 값은 쿼리 원문에 있다)
  for (const m of sql.matchAll(/\b(\w+)\s*(?:=|\bin\b)\s*[('"\d]/gi)) {
    const c = m[1].toLowerCase();
    if (['and', 'or', 'on', 'where', 'select', 'when', 'then', 'case'].includes(c)) continue;
    out.push(c);
  }
  return [...new Set(out)].slice(0, 8);
}

/** trace → 단계별 추론 과정. 순서는 실제 실행 순서다. */
export function buildX2Reasoning(trace: X2Trace | null | undefined): X2ReasonStep[] {
  if (!trace) return [];
  const steps = trace.steps ?? [];
  const out: X2ReasonStep[] = [];

  // ① 카탈로그를 읽었다 — 무엇을 볼 수 있었는지가 판단의 출발점이다
  const cchips = catalogChips(steps);
  if (cchips.length || steps.some((s) => s.stage === 'discover')) {
    out.push({
      kind: 'discover',
      title: '쓸 수 있는 데이터를 먼저 확인했습니다',
      detail: 'Glue 카탈로그에서 테이블·컬럼 설명을 읽고, SMUS 비즈니스 용어를 병합했습니다. '
            + '이 목록 밖의 테이블은 쓸 수 없습니다(가드가 거부).',
      chips: cchips,
      tone: 'ok',
    });
    // ② 온톨로지 — 표만으로는 못 잇는 연결을 그래프에서 찾는다
    const onto = steps.find((s) => (s.note ?? '').includes('온톨로지')
                                || (s.note ?? '').includes('그래프 라벨'));
    if (onto) {
      out.push({
        kind: 'ontology',
        title: '표끼리 안 붙는 연결은 온톨로지에서 찾았습니다',
        detail: '노드 라벨·엣지·엣지 커버리지를 그래프에서 직접 조회했습니다. '
              + '어느 경로가 실제로 데이터를 가지고 있는지(커버리지)까지 확인합니다.',
        chips: catalogChips([onto]),
        tone: 'ok',
      });
    }
  }

  // ③ 되묻기 이력 — **재개**된 질의는 attempts에 clarify_question이 없다(그 시도는 앞선
  // 잡에서 끝났다). 서버가 `clarifications`에 남겨주므로 그것으로 단계를 만든다.
  // 검산에는 이게 핵심이다: 어느 축으로 고정했는지 모르면 답의 옳고 틀림을 판단할 수 없다.
  for (const c of trace.clarifications ?? []) {
    const auto = (c as { answered_by?: string }).answered_by === 'auto';
    out.push({
      kind: 'ask',
      title: auto
        ? '분석 축이 정해지지 않아 물었습니다(배치 자동응답)'
        : '분석 축이 정해지지 않아 사람에게 물었습니다',
      detail: c.question,
      chips: [`${auto ? '자동' : '사람'}이 고른 축: ${c.answer}`],
      tone: 'warn',
    });
  }

  // ④~ 시도별로 — 계획·되묻기·가드·실행
  for (const a of trace.attempts ?? []) {
    const n = trace.attempts.length > 1 ? ` (시도 ${a.n})` : '';

    // 되묻기: 축이 모자라 물었다.
    // ⚠️ `clarifications`에 이미 같은 질문이 있으면 두 번 그리지 않는다(자동응답 경로는
    // attempts와 clarifications 양쪽에 남는다 — 실측).
    if (a.clarify_question) {
      const dup = (trace.clarifications ?? []).some((c) => c.question === a.clarify_question);
      if (!dup) {
        out.push({
          kind: 'ask',
          title: `분석 축이 정해지지 않아 되물었습니다${n}`,
          detail: a.clarify_question,
          reasoning: a.reasoning,
          chips: a.clarify_answer ? [`고른 축: ${a.clarify_answer}`] : a.clarify_options,
          tone: 'warn',
        });
      }
      continue;
    }

    // 기권
    if (a.insufficient_reason) {
      out.push({
        kind: 'plan',
        title: `답할 데이터가 없다고 판단했습니다${n}`,
        detail: a.insufficient_reason,
        reasoning: a.reasoning,
        tone: 'warn',
      });
      continue;
    }

    // 계획: 어느 테이블을 어떤 차원으로 볼지
    if (a.query || a.reasoning) {
      const dims = analysisDimensions(a.query ?? '');
      out.push({
        kind: 'plan',
        title: `어떤 표를 어떤 축으로 볼지 정했습니다${n}`,
        detail: a.tables_used?.length
          ? `읽을 표: ${a.tables_used.join(', ')}`
          : undefined,
        reasoning: a.reasoning,
        chips: dims.length ? dims.map((d) => `축: ${d}`) : undefined,
        tone: 'ok',
      });
    }

    // 가드
    if (a.guard) {
      const g = a.guard;
      out.push({
        kind: 'guard',
        title: g.ok ? `안전 검사를 통과했습니다${n}` : `안전 검사가 이 쿼리를 거부했습니다${n}`,
        detail: g.ok
          ? '읽기 전용이고, 카탈로그에 실재하는 표만 참조합니다.'
          : g.reason,
        chips: g.unknown_tables?.length
          ? g.unknown_tables.map((t) => `지어낸 표: ${t}`)
          : g.tables?.map((t) => `확인: ${t}`),
        tone: g.ok ? 'ok' : 'bad',
      });
    }

    // 실행
    if (a.query) {
      const e = a.exec;
      const failed = e?.status === 'error';
      out.push({
        kind: 'execute',
        title: failed ? `실행이 실패했습니다${n}` : `쿼리를 실행했습니다${n}`,
        detail: failed ? e?.error
          : `${a.engine === 'neptune' ? 'Neptune' : 'Athena'}에서 ${e?.row_count ?? 0}행을 받았습니다`
            + (e?.latency_ms != null ? ` (${(e.latency_ms / 1000).toFixed(1)}초)` : ''),
        query: a.query,
        engine: a.engine,
        rows: e?.row_count,
        tone: failed ? 'bad' : (e?.row_count === 0 ? 'warn' : 'ok'),
      });
      if (failed) {
        out.push({
          kind: 'retry',
          title: '실패 사유를 그대로 되돌려 다시 작성했습니다',
          detail: '에러 원문을 프롬프트에 넣어 같은 실수를 반복하지 않게 합니다(최대 2회).',
          tone: 'warn',
        });
      }
    }

    // 연결(조인·순회) — "이걸 잇고"에 해당하는 단계
    const lg = a.lineage;
    if (lg) {
      if (lg.engine === 'athena' && (lg.joins?.length || (lg.subqueries ?? 0) > 0)) {
        out.push({
          kind: 'join',
          title: '서로 다른 표를 키로 이었습니다',
          detail: lg.joins?.length
            ? lg.joins.map((j) => `${j.left} ⋈ ${j.right} — ${j.on}`).join(' / ')
            : `상관 서브쿼리 ${lg.subqueries}개로 두 원천을 이었습니다`,
          chips: lg.ctes?.length ? lg.ctes.map((c) => `중간 단계: ${c}`) : undefined,
          tone: 'ok',
        });
      }
      if (lg.engine === 'neptune' && lg.steps?.length) {
        out.push({
          kind: 'join',
          title: `온톨로지를 ${lg.steps.length}홉 따라갔습니다`,
          detail: [lg.start || '시작', ...lg.steps.map((s) => s.edge)].join(' → '),
          chips: lg.steps.map((s) => `${s.dir}('${s.edge}')`),
          tone: 'ok',
        });
      }
    }
  }

  // 답변
  const f = trace.final;
  if (f?.status === 'ok') {
    out.push({
      kind: 'answer',
      title: '받은 행만으로 답을 썼습니다',
      detail: `${f.row_count ?? 0}행을 근거로 작성했습니다. 결과에 없는 수치는 쓰지 않습니다.`,
      tone: f.zero_rows ? 'warn' : 'ok',
      rows: f.row_count,
    });
  }

  // 교차 검증 — 검산의 마지막 고리
  const v = f?.verification;
  if (v) {
    const label: Record<string, string> = {
      match: '다른 방법으로 다시 계산해 값이 같았습니다',
      rank_match: '다른 방법으로 계산해 순위가 같았습니다(값은 축 차이로 다름)',
      mismatch: '다른 방법으로 계산한 값이 달랐습니다 — 사람이 확인해야 합니다',
      unverified: '교차 계산을 완료하지 못했습니다',
      skipped: '이 질문은 교차 계산 대상이 아닙니다',
    };
    out.push({
      kind: 'verify',
      title: label[v.verdict] ?? v.verdict,
      detail: v.reason,
      query: v.pandas_code,
      engine: 'pandas',
      chips: v.verified_tables?.map((t) => `대조: ${t}`),
      tone: v.verdict === 'match' || v.verdict === 'rank_match' ? 'ok'
          : v.verdict === 'mismatch' ? 'bad' : 'warn',
    });
  }

  return out;
}
