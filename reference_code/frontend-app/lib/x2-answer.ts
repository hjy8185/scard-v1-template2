// U66 — v2 답변 조립 규칙. v1 `lib/answer-composition.ts`와 **같은 역할**이지만 입력이 다르다.
//
// v1은 `buildPathLine`이 `switch (intent)`로 12분기한다. 그 `intent`는 semantic router가
// 승인 템플릿을 고를 때 나오는 부산물이다 — v2는 라우터도 템플릿도 없앤 것이 실험의 전제라
// `intent`가 존재하지 않는다. 그래서 **같은 정보를 다른 원천에서** 만든다: 실행한 쿼리에서
// 뽑은 `lineage`(어느 테이블을 어떤 키로 이었나)가 v1 hop 타임라인과 같은 정보다.
//
// 원칙: **trace에 있는 것만 쓴다.** 없으면 null을 돌려 그 층을 생략한다(지어내지 않는다).

import type { X2Trace } from './x2-types';

export interface X2PathLine {
  /** 교차 검증이 일치했는가 — v1의 `verified`(승인 템플릿 실행)에 대응하는 v2의 신뢰 신호 */
  verified: boolean;
  text: string;
  /** 클릭 시 열 상세 탭 */
  tab: 'lineage' | 'query';
}

/** 연결 경로 한 줄. v1 `buildPathLine`의 v2 대응물 — 원천이 intent가 아니라 lineage다. */
export function buildX2PathLine(trace: X2Trace | null | undefined): X2PathLine | null {
  const f = trace?.final;
  if (!f || f.status === 'abstained') return null;
  const verified = f.verification?.verdict === 'match';

  // ★★★ U97 — 결과가 여러 건이면 **쿼리 이름을 앞에 붙여** 요약한다.
  //
  // ⚠️ 종전에는 `f.lineage` 하나만 읽었다(계획서가 실측으로 지적: `x2-answer.ts:24`).
  // 그러면 축이 둘인 답변에서 **한 축의 경로만 보인다** — 사용자가 나머지를 못 본다.
  //
  // ★ 실패한 축도 이름을 밝힌다. 숨기면 "그 축은 0이다"로 읽는다.
  const rs = f.results ?? [];
  if (rs.length > 1) {
    const parts = rs.map((r) => {
      if (r.execution_status === 'ok') {
        const n = r.row_count ?? 0;
        return `${r.name}(${r.engine} ${n}행)`;
      }
      if (r.execution_status === 'empty') return `${r.name}(0행)`;
      return `${r.name}(실패)`;
    });
    const bad = rs.filter((r) => r.execution_status !== 'ok'
                                 && r.execution_status !== 'empty');
    const tail = bad.length
      ? ` — ${bad.map((r) => r.name).join('·')}는 조회하지 못했어요`
      : '';
    return {
      verified,
      text: `${rs.length}개 축을 각각 조회했어요: ${parts.join(' + ')}${tail}`,
      tab: 'lineage',
    };
  }

  // ── 단건 — 기존 로직 그대로 ────────────────────────────────────────────
  // ★ 1건이면 서버가 `f.lineage`를 채운다(`to_legacy_json`). v1 fixture도 여기 온다.
  const lg = f.lineage ?? rs[0]?.lineage;

  if (lg?.engine === 'neptune') {
    const steps = lg.steps ?? [];
    if (!steps.length) return null;
    // 순회를 그대로 읽는다: BenefitCategory → HAS_CATEGORY → …
    const path = [lg.start || '시작', ...steps.map((s) => s.edge || '?')].join(' → ');
    return {
      verified,
      text: `온톨로지 ${steps.length}홉 순회 — ${path}`,
      tab: 'lineage',
    };
  }

  if (lg?.engine === 'athena') {
    const joins = lg.joins ?? [];
    const srcs = lg.sources ?? [];
    if (joins.length) {
      const j = joins[0];
      const more = joins.length > 1 ? ` 외 ${joins.length - 1}건` : '';
      return {
        verified,
        text: `${j.left} ⋈ ${j.right} — ${j.on} 키로 이어 계산했어요${more}`,
        tab: 'lineage',
      };
    }
    if ((lg.subqueries ?? 0) > 0 && srcs.length >= 2) {
      return {
        verified,
        text: `${srcs.slice(0, 2).join(' + ')} — 서브쿼리로 두 원천을 이어 계산했어요`,
        tab: 'lineage',
      };
    }
    if (srcs.length) {
      const ctes = lg.ctes ?? [];
      const step = ctes.length ? ` (중간 단계 ${ctes.length}개)` : '';
      return {
        verified,
        text: `${srcs.join(' · ')}에서 직접 조회했어요${step}`,
        tab: 'lineage',
      };
    }
  }

  // lineage가 없어도 쿼리는 있다 — 그 사실만 밝힌다
  if ((trace?.attempts ?? []).some((a) => a.query)) {
    return { verified, text: '실행한 쿼리 보기', tab: 'query' };
  }
  return null;
}

// ── 대표 차트 ────────────────────────────────────────────────────────────────
// v1은 `bff/enrich.py::build_insights`가 citation 형태별로 8종을 만든다(서버). v2는
// citation이 없고 `rows_sample`(실행 결과 행)만 있으므로 **행에서 직접** 만든다.
//
// ⚠️ v1 `InsightCardList`를 재사용하지 않는다: 그 막대의 `fmtEok`가 **억원 고정**이라
// v2의 원·명·퍼센트 값을 넣으면 `551,582원`이 "55만억"으로 표시된다(실측 위험).

export interface X2Chart {
  title: string;
  unit: string;
  rows: Array<{ name: string; value: number }>;
  /** ★ U97 — 이 차트가 어느 축에서 나왔나. 다건일 때만 채운다(단건은 종전과 동일). */
  source?: string;
}

/** 숫자로 읽을 수 있으면 숫자로. 문자열 '1,234'도 받는다(Athena는 전부 문자열로 온다). */
function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.replace(/,/g, '').trim();
    if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 컬럼명에서 단위를 읽는다 — 추측하지 않고 이름에 있는 것만. */
function unitOf(col: string): string {
  const c = col.toLowerCase();
  if (c.includes('krw') || c.includes('amount') || c.includes('won')) return '원';
  if (c.includes('pct') || c.includes('ratio') || c.includes('rate')) return '%';
  if (c.includes('pop') || c.includes('person')) return '명';
  if (c.startsWith('n_') || c.includes('count') || c === 'n') return '건';
  return '';
}

/** 라벨 후보: 숫자가 아닌 짧은 문자열 컬럼. 라벨이 없으면 차트를 만들지 않는다. */
const MAX_BARS = 10;

/** ★★★ U97 — 다건일 때 **축마다 따로** 차트를 만든다.
 *
 * ## 계획서가 이것을 별 항목으로 둔 이유
 *
 * > ★ **차트는 서로 다른 스키마의 결과행을 한 표로 합치지 않는다**
 *
 * 합치면 무엇이 되는가: `beauty_cover`가 `{category, n_cards}` 48행, `cosmetics_yoy`가
 * `{yoy_pct}` 1행일 때 두 행 집합을 이어붙이면 **컬럼이 겹치지 않는 행들이 한 막대그래프에**
 * 들어간다. `labelCol`·`valueCol`은 **첫 행**을 보고 고르므로 뒤쪽 축의 행은 전부
 * `continue`로 버려지고(값이 `null`), 화면에는 "첫 축만 있는 차트"가 **전체인 것처럼**
 * 남는다 — 이 저장소가 가장 경계하는 "그럴듯한 거짓"이다.
 *
 * 그래서 축마다 독립으로 만들고, 만들 수 없는 축은 그냥 없다(지어내지 않는다).
 */
export function buildX2Charts(trace: X2Trace | null | undefined): X2Chart[] {
  const rs = trace?.final?.results ?? [];
  if (rs.length > 1) {
    const out: X2Chart[] = [];
    for (const r of rs) {
      // ★ 실패 축은 그리지 않는다 — 없는 데이터로 막대를 세우면 그것이 환각이다.
      if (r.execution_status !== 'ok') continue;
      const c = chartFromRows(r.rows_sample);
      if (c) out.push({ ...c, source: r.name });
    }
    return out;
  }
  const one = buildX2Chart(trace);
  return one ? [one] : [];
}

/** 단건 차트. ★ **기존 호출부·테스트가 이 이름을 쓴다** — 시그니처를 바꾸지 않는다. */
export function buildX2Chart(trace: X2Trace | null | undefined): X2Chart | null {
  const f = trace?.final;
  // ★ 1건이면 서버가 `rows_sample`을 채운다(`to_legacy_json`). 2건 이상이면 비운다.
  const rows = f?.rows_sample
    ?? ((f?.results ?? []).length === 1 ? f?.results?.[0]?.rows_sample : undefined);
  return chartFromRows(rows);
}

function chartFromRows(
  rows: Array<Record<string, unknown>> | undefined,
): X2Chart | null {
  if (!Array.isArray(rows) || rows.length < 2) return null;   // 1행은 표가 낫다
  const first = rows[0];
  if (!first || typeof first !== 'object') return null;
  const cols = Object.keys(first as Record<string, unknown>);
  if (cols.length < 2) return null;

  const r0 = first as Record<string, unknown>;
  const labelCol = cols.find((c) => toNum(r0[c]) === null && typeof r0[c] === 'string'
                                    && String(r0[c]).length <= 40);
  if (!labelCol) return null;
  // 첫 숫자 컬럼. 순위·연월·**식별 코드** 같은 축 컬럼은 값으로 쓰지 않는다.
  //
  // ⚠️ 두 함정을 실측으로 확인했다:
  //   · `_year$`로 뭉뚱그리면 안 된다 — `krw_per_person_year`는 연도가 아니라 "연간 금액"이다.
  //   · **코드 컬럼을 값으로 그리면 안 된다.** 실측: `adstrd_name × adstrd_cd` 막대가
  //     행정동 코드(1156·1168…)를 크기로 그려 의미 없는 그래프가 나왔다(캡처로 확인).
  const AXIS = /^(rank|year|month|yearmonth|ym|년|월|순위)$/i;
  const AXIS_SUFFIX = /_(rank|ym|yearmonth)$/i;
  const CODE = /(^|_)(cd|code|id|key|no)$/i;      // adstrd_cd·card_id·mcc_code …
  const valueCol = cols.find((c) => c !== labelCol && toNum(r0[c]) !== null
                                    && !AXIS.test(c) && !AXIS_SUFFIX.test(c) && !CODE.test(c)
                                    && !/^(year_month|year|month)$/i.test(c));
  if (!valueCol) return null;

  const out: Array<{ name: string; value: number }> = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const v = toNum(rec[valueCol]);
    const n = rec[labelCol];
    if (v === null || typeof n !== 'string' || !n) continue;
    out.push({ name: n, value: v });
    if (out.length >= MAX_BARS) break;
  }
  if (out.length < 2) return null;

  return { title: `${labelCol} × ${valueCol}`, unit: unitOf(valueCol), rows: out };
}

/** 큰 수를 사람이 읽는 형태로. 단위는 컬럼명에서 온 것만 붙인다. */
export function fmtX2(v: number, unit: string): string {
  const abs = Math.abs(v);
  if (unit === '%') return `${v.toFixed(1)}%`;
  let s: string;
  if (abs >= 1e12) s = `${(v / 1e12).toFixed(1)}조`;
  else if (abs >= 1e8) s = `${(v / 1e8).toFixed(abs >= 1e9 ? 0 : 1)}억`;
  else if (abs >= 1e4) s = `${(v / 1e4).toFixed(abs >= 1e5 ? 0 : 1)}만`;
  else s = v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return unit ? s + unit : s;
}
