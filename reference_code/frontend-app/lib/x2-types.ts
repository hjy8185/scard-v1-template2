// U64 — v2 실험(NL2Query) 응답 타입. 서버 trace와 1:1로 맞춘다(프론트 재구성 금지).
export interface X2Guard {
  ok: boolean;
  category: string;
  reason: string;
  tables: string[];
  unknown_tables: string[];
}

export interface X2Attempt {
  n: number;
  engine?: string;
  query?: string;
  reasoning?: string;
  tables_used?: string[];
  guard?: X2Guard | null;
  exec?: { status: string; error?: string; row_count?: number; latency_ms?: number };
  insufficient_reason?: string;
  /** ⚠️ 단건은 문자열, U97 다건은 `{type, detail}` dict다 — 둘 다 온다. */
  error?: string | { type?: string; detail?: string; repair_note?: string };
  latency_ms?: number;
  gen_latency_ms?: number;
  // U65 S4 — 되묻기. 서버가 engine="clarify"로 멈췄을 때 무엇을 물었는지.
  clarify_question?: string;
  clarify_options?: string[];
  clarify_answer?: string;
  clarify_error?: string;
  // U66 — 이 시도의 연결 경로(재시도마다 다를 수 있다)
  lineage?: X2Lineage;
  graph_nodes?: X2GraphNode[];
  lineage_error?: string;
  // ★ U97 다건 — `_answer_multi`가 축마다 한 줄씩 쌓는다. 필드가 평평하다(`exec` 없음).
  //   단건 경로의 `exec.status`와 이름을 겹치지 않게 둔다 — 섞으면 어느 축의 상태인지
  //   흐려지고, 그것이 "무엇이 실패했나"를 못 답하게 만든다.
  name?: string;
  purpose?: string;
  status?: string;
  row_count?: number;
  attempts?: number;
  /** 다건 선언이 거부돼 단건으로 폴백한 사유(engine="multi" 줄에만 있다). */
  multi_rejected?: string;
}

/** U66 — 연결 경로. 서버(bff_v2/lineage.py)가 **실행한 쿼리에서 뽑은** 것이다.
 *
 * v1은 chain_sql이 hop을 순차 실행해 ChainResult.hops[]를 만들지만 v2는 LLM이 SQL 하나에
 * 조인으로 표현한다 — 그래서 쿼리를 파싱한다. 쿼리 원문에 있는 것만 온다(추론 없음).
 */
export interface X2Lineage {
  engine: string;
  // SQL
  sources?: string[];                                   // 읽은 실재 테이블/뷰
  joins?: Array<{ left: string; right: string; on: string }>;
  ctes?: string[];                                      // 중간 단계(v1 hop에 가장 가깝다)
  subqueries?: number;                                  // 상관 서브쿼리 수
  // Gremlin
  start?: string;
  labels?: string[];
  steps?: Array<{ dir: string; edge: string }>;          // 순회 = 경로
}

export interface X2GraphNode {
  id: string;
  label: string;
  name: string;
}

/** U66 — 진행 단계. bff-v2가 잡 상태의 `steps`에 쌓고 프론트가 폴링으로 읽는다.
 *
 * ⚠️ AgentCore invoke는 스트리밍이 아니라 runtime 내부 진행이 실시간으로 오지 않는다.
 * 그래서 화면 경로는 "runtime 호출 중"만 먼저 보이고, 끝난 뒤 실제 단계로 교체된다.
 * 로컬 경로(engine_path=local)는 같은 프로세스라 실시간으로 흐른다.
 */
export interface X2Step {
  stage: 'dispatch' | 'discover' | 'generate' | 'guard' | 'execute'
       | 'retry' | 'clarify' | 'answer' | 'verify' | string;
  t?: number;                 // epoch seconds(서버 기준)
  note?: string;
  target?: string;            // 어디서 도는가 — "Athena (workgroup cg-v2-wg)" 등
  engine?: string;
  query?: string;             // 실행 중인 실제 쿼리
  attempt?: number;
  rows?: number;
  reason?: string;
  options?: string[];
  catalog?: { tables: number; graph_labels: number };
  // dispatch 단계에서만: runtime이 수행할 단계 목록(스트리밍이 아니어서 실시간으로 못 받는다)
  expected?: string[];
}

/** U65 S2 — 교차 패러다임 검증(SQL ↔ Pandas) 판정. */
export interface X2Verification {
  // ★ U98: `pending`은 **비동기 검증이 아직 안 끝난** 상태다(`unverified`와 다르다).
  //   서버가 답변을 먼저 주고 검증을 백그라운드로 돌린다.
  // ★ U99: `assumption_differs`는 **전제가 달랐다** — `mismatch`(값이 갈렸다)와 다르다.
  verdict: 'match' | 'mismatch' | 'rank_match' | 'assumption_differs'
         | 'unverified' | 'skipped' | 'pending';
  reason?: string;
  pandas_result?: unknown;
  pandas_code?: string;
  assumption?: string;
  verified_tables?: string[];
  source_rows?: Record<string, number>;
  latency_ms?: number;
}

/** ★ U97 — 쿼리 한 건의 실행 결과. 서버 `QueryExecutionResult`와 같은 필드명이다.
 *
 * 이름을 맞추는 이유: 서버가 필드를 늘릴 때 화면이 조용히 놓치지 않게 한다.
 * (U85가 도구 반환에 키를 추가했을 때 어댑터 화이트리스트가 그것을 버린 전례가 있다.)
 */
export interface X2QueryResult {
  name: string;
  engine: string;
  query: string;
  purpose?: string;
  /** ok · empty · guard_rejected · exec_error · obqc_blocked · unverified */
  execution_status: string;
  row_count: number;
  rows_sample?: Array<Record<string, unknown>>;
  columns?: string[];
  source_truncated?: boolean;
  lineage?: X2Lineage;
  attempts?: number;
  error?: { type?: string; detail?: string; repair_note?: string };
  /** 정규형 대조용 — 화면은 쓰지 않지만 서버가 보내므로 타입에 둔다(U93 evidence). */
  result_sha256?: string;
  /** ★ 정수다 — 서버 `canonical.NORMALIZATION_VERSION = 1`. 문자열로 쓰면 대조가 어긋난다. */
  normalization_version?: number;
}

/** ★★★ U98 OBQC — 서버 `agent/obqc.Verdict`의 화면 계약. */
export interface X2Obqc {
  /** `allow` · `blocked` · `unverified`. ★ `unverified`는 실패가 아니다. */
  status: string;
  reason?: string;
  /** 검사한 홉 수. `unverified`면 0일 수 있다. */
  hops?: number;
  /** 방향이 반대일 때의 힌트. ⚠️ 서버는 **자동 적용하지 않는다** — 표시만 한다. */
  repair_hint?: string;
}

/** ★ U96 — 이 요청이 실제로 주입한 의미 문서. `selected`가 비면 주입이 없었다.
 *
 * ⚠️ **`selected`는 객체 배열이다** — 라이브 응답 실측:
 * `[{id:'core', sha256:'75fe95d6…', bytes:2735}, {id:'card', …}]`.
 *
 * 초안이 `string[]`으로 잡아 `join(' · ')`이 `[object Object]`를 뿌렸다. 게이트는
 * 통과했다 — **픽스처가 문자열이었기 때문**이다. 이 세션에서 "게이트 통과인데 결함"을
 * 여섯 번째로 밟은 자리이고, 원인은 늘 같다: **픽스처가 서버 실물과 다르다.**
 */
export interface X2SemanticDoc {
  id: string;
  sha256?: string;
  bytes?: number;
}

export interface X2Semantics {
  requested_domain?: string | null;
  selected?: X2SemanticDoc[];
  reason?: string;
  /** ★ 0이면 주입이 없었다 — `selected`가 비어 있을 때와 함께 봐야 한다. */
  injected_bytes?: number;
  /** ★ `'missing'`이면 탐색 전에 반환된 경로다(서버 `_semantics_default`). */
  sha256?: string;
}

export interface X2Trace {
  question: string;
  context_stats?: Record<string, number>;
  /** ★ U96 — 주입된 의미 문서. 실측 38/38 문항에 있으나 화면이 안 읽고 있었다. */
  semantics?: X2Semantics;
  attempts: X2Attempt[];
  final: {
    status: string;
    answer?: string;
    engine?: string | null;
    row_count?: number;
    zero_rows?: boolean;
    rows_sample?: Array<Record<string, unknown>>;
    // U65 S4 — status='awaiting_input'일 때 사용자에게 물을 것
    clarify?: { question: string; options: string[] };
    // U65 S2 — 교차 검증 판정(verify=true로 요청했을 때만)
    verification?: X2Verification;
    // ★★★ U98 — 온톨로지 검증 판정(Neptune 경로만). `null`이면 검사 대상이 아니다.
    //
    // ⚠️ **`blocked`를 표시하지 않으면 "데이터 없음"으로 오독된다** — 그 경우 쿼리가
    // 실행되지 않았고(`exec.status='not_run'`) 화면에는 빈 결과만 남는다. U70-B가
    // 겪은 *"0행을 장애로 읽는다"*의 반대 계열이다(차단을 0행으로 읽는다).
    //
    // ★ `unverified`는 **실패가 아니다** — 홉을 파싱하지 못해 판정을 못 한 것이다.
    //   실측 R3에서 5/15가 이것이었다. 실패로 표시하면 정상 쿼리를 의심하게 된다.
    obqc?: X2Obqc | null;
    // ★★ U93 — 단건 경로의 잘림. 서버가 `final.update(_evidence_of(...))`로 **평평하게**
    // 넣는다(다건은 `results[].source_truncated`에 축마다 따로 있다).
    //
    // ⚠️ 이것이 참인데 감추면 **부분 데이터를 전체로 읽는다**: "1위는 X"라고 답했지만
    // 실은 잘린 앞부분의 1위일 수 있다. `zero_rows`와 같은 계열의 오독이다.
    source_truncated?: boolean;
    // U66 — 연결 경로·그래프 노드·읽은 테이블(서버가 쿼리에서 뽑은 것)
    lineage?: X2Lineage;
    graph_nodes?: X2GraphNode[];
    tables_used?: string[];
    // ★★★ U97 — 축이 다른 분석 N건. 서버가 `queries`를 2건 이상 받으면 채운다.
    //
    // ⚠️ **위 단일 필드(engine·row_count·lineage)는 그대로 둔다** — 1건일 때는
    // 서버가 그것을 채우고(`FinalResult.to_legacy_json`) v1 fixture도 계속 렌더링돼야
    // 한다. 2건 이상이면 서버가 단일 필드를 **비운다** — 첫 결과만 보고 전부라고
    // 오해하는 것을 막기 위해서다.
    results?: X2QueryResult[];
    // 실패한 축 — ★ 숨기면 사용자가 "그 축은 0이다"로 읽는다
    degraded?: Array<{ name: string; source?: string; reason?: string }>;
    // 소비자가 분기하는 근거. 2면 results[]가 있다
    response_schema_version?: number;
  };
  retry_count: number;
  // U65 S4 — 되묻기 이력. 남용 여부를 화면에서도 볼 수 있게 노출한다.
  // answered_by: 'user'=화면에서 사람이 골랐다, 'auto'=배치 자동응답. 검산 시 둘을 섞으면
  // "사람이 개입한 결과"와 "무개입 측정"을 구분할 수 없다.
  clarifications?: Array<{ question: string; options: string[]; answer: string;
                           answered_by?: 'user' | 'auto' }>;
  clarify_count?: number;
  // U66 — 진행 단계(끝난 뒤에도 무엇을 했는지 남는다)
  steps?: X2Step[];
  tokens?: { in: number; out: number; cost_usd: number };
  latency_ms_total?: number;
  prompt_sha256?: string;
  model_id?: string;
  error?: string;
}

export interface X2Context {
  database?: string;
  stats?: {
    n_tables?: number;
    n_tables_in_smus?: number;
    n_tables_with_desc?: number;
    n_columns?: number;
    n_columns_with_comment?: number;
    n_terms?: number;
    n_terms_with_def?: number;
    ontology_labels?: number;
  };
  model?: string;
  prompt_sha256?: string;
  tables?: Array<{
    name: string; description: string; in_smus_listing: boolean;
    n_columns: number; n_col_comments: number;
  }>;
  glossary_terms?: Array<{ name: string; description: string }>;
  ontology?: { labels?: string[]; edge_labels?: string[]; error?: string | null };
  error?: string;
}

/** 상태 코드 → 사람이 읽는 한 줄. 실패 사유를 감추지 않는다. */
export function statusLabel(status: string): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  if (status === 'ok') return { text: '실행 성공', tone: 'ok' };
  if (status === 'abstained') return { text: '기권 — 카탈로그에 근거 없음', tone: 'warn' };
  if (status.startsWith('guard_')) {
    const c = status.slice(6);
    const ko: Record<string, string> = {
      unknown_table: '가드 거부 — 없는 테이블을 지어냄',
      write_statement: '가드 거부 — 쓰기 구문',
      not_select: '가드 거부 — SELECT/g.V()가 아님',
      multi_statement: '가드 거부 — 다중 문장',
      no_table: '가드 거부 — 읽는 테이블 없음',
      empty: '가드 거부 — 빈 쿼리',
    };
    return { text: ko[c] ?? `가드 거부 — ${c}`, tone: 'bad' };
  }
  // U65 S4 — 되묻기로 멈춘 상태. 실패가 아니라 **입력 대기**다.
  if (status === 'awaiting_input') {
    return { text: '되묻는 중 — 선택이 필요합니다', tone: 'warn' };
  }
  if (status === 'clarify_failed') {
    return { text: '되묻기 응답 실패', tone: 'bad' };
  }
  // ★★ U97 다건 — `FinalResult.outcome`이 온다. 없으면 이 함수가 원문을 그대로 뱉고
  //    화면에 `partial`이라는 영어가 노출된다(실측으로 확인한 누락).
  if (status === 'partial') {
    return { text: '일부 축만 조회됨 — 실패한 축은 값을 쓰지 않았습니다', tone: 'warn' };
  }
  // ★★★ U98 — 온톨로지 검증이 막았다. **결과 0건과 전혀 다르다**(쿼리를 아예 안 돌렸다).
  //
  // ⚠️ 이 분기가 없으면 화면에 `obqc_blocked`라는 영어가 그대로 뜬다(위 `partial`이
  //    실측으로 밟은 것과 같은 결함이다).
  if (status === 'obqc_blocked') {
    return { text: '온톨로지 검증 거부 — 쿼리를 실행하지 않았습니다', tone: 'bad' };
  }
  // ⚠️ `empty`는 **실패가 아니다** — 정상 조회에 결과가 0건인 것이다(U70-B: 뒤집힘 22%).
  if (status === 'empty') return { text: '조회 성공 — 결과 0건', tone: 'warn' };
  if (status === 'failed') return { text: '모든 축이 실패', tone: 'bad' };
  if (status === 'exec_error') return { text: '실행 실패 — 재시도 소진', tone: 'bad' };
  if (status === 'generate_failed') return { text: '쿼리 생성 실패', tone: 'bad' };
  if (status === 'answer_failed') return { text: '답변 생성 실패', tone: 'bad' };
  return { text: status, tone: 'warn' };
}

/** ⚠️ U97 — `attempt.error`는 단건이 문자열, 다건이 `{type, detail}` dict다.
 *
 * ★ 실측 결함: 화면이 `{a.error}`로 그대로 렌더하고 있었다. React는 plain object를
 * 자식으로 받으면 던진다("Objects are not valid as a React child") — 다건 경로가
 * `attempts`에 dict를 쌓기 시작하면 화면 전체가 깨진다. 여기서 문자열로 좁힌다.
 *
 * ⚠️ **컴포넌트가 아니라 여기 둔다** — 클라이언트 컴포넌트에서 export하면 순수 헬퍼
 * 하나 쓰려고 그 컴포넌트를 끌어오게 되고, 서버 컴포넌트에서 못 쓴다.
 */
export function errText(e: X2Attempt['error']): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const head = [e.type, e.detail].filter(Boolean).join(': ');
  return e.repair_note ? `${head} (${e.repair_note})` : head;
}

/** U65 S2 — 교차 검증 판정 → 사람이 읽는 한 줄. */
export function verificationLabel(v: string): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  if (v === 'match') return { text: 'Pandas 재계산과 일치', tone: 'ok' };
  if (v === 'rank_match') {
    return { text: '순위는 일치 · 절대값 불일치(입도 차이 가능)', tone: 'warn' };
  }
  if (v === 'mismatch') return { text: '갈렸습니다 — 아래 두 수치를 비교하세요', tone: 'bad' };
  // ★★★ U99 — **전제가 달랐다.** `mismatch`(같은 것을 계산했는데 값이 갈렸다)와 다른
  // 사건이다.
  //
  // R4 실측: `mismatch` 5건 중 5건이 이것이었고 **4건은 채점 PASS**였다. 검증자가 다른
  // 축·연도·정의를 계산한 것이지 답이 틀린 것이 아니다.
  //
  // ⚠️ **tone을 'bad'로 두지 않는다** — `mismatch`와 같은 색이면 "답이 틀렸다"로 읽고,
  // 그것이 정확히 R4에서 일어난 오독이다(mismatch 5를 보고 정확도 악화를 의심했다).
  if (v === 'assumption_differs') {
    return { text: '검증자가 다른 전제로 계산했습니다 — 값 비교가 성립하지 않습니다',
             tone: 'warn' };
  }
  if (v === 'unverified') return { text: '검증 불가', tone: 'warn' };
  // ★★ U98 — 비동기 검증이 **아직 안 끝난** 상태. `unverified`(검증 실패)와 다르다.
  //
  // 서버가 답변을 먼저 주고 검증을 백그라운드로 돌린다(`api/jobs._finish_verification`).
  // 이것을 "검증 대상 아님"으로 표시하면 **끝나지 않은 것을 안 하는 것으로** 읽는다.
  if (v === 'pending') return { text: '교차 검증 중…', tone: 'warn' };
  return { text: '검증 대상 아님', tone: 'warn' };
}

/** ★ 검증 판정의 **짧은 배지 문구**. 칩·요약줄처럼 한 줄이 좁은 자리에 쓴다.
 *
 * ⚠️ `verificationLabel`은 문장이라 배지에 안 들어간다. 그래서 화면이 **판정 원문을
 * 그대로 뿌렸고**(`검증 mismatch`) 영어가 노출됐다 — U97 `partial`이 밟은 것과 같은 계열.
 *
 * ★ `assumption_differs`는 특히 길어서 배지에 그대로 쓰면 줄이 깨진다.
 */
export function verificationBadge(v: string): string {
  const ko: Record<string, string> = {
    match: '일치',
    rank_match: '순위 일치',
    mismatch: '갈림',
    assumption_differs: '전제 차이',   // ★ 오답이 아니다 — 두 계산의 전제가 달랐다
    unverified: '검증 불가',
    skipped: '대상 아님',
    pending: '검증 중',
  };
  return ko[v] ?? v;
}

/** ★★★ U98 OBQC 판정 → 사람이 읽는 한 줄.
 *
 * ## 세 상태가 **서로 다른 것**이다 — 섞으면 오독한다
 *
 * ```
 * allow       T-Box의 domain/range와 홉 방향이 맞다
 * blocked     맞지 않는다 → block 모드면 쿼리를 안 돌린다  ★ 0건이 아니다
 * unverified  홉을 파싱하지 못해 판정을 못 했다            ★ 실패가 아니다
 * ```
 *
 * ⚠️ `unverified`를 실패로 표시하면 **정상 쿼리를 의심하게 된다** — 실측 R3에서
 * 15건 중 5건이 이것이었고(파서 커버리지 7/12), 그 전부가 정상 실행이었다.
 */
export function obqcLabel(status: string): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  if (status === 'allow') return { text: '온톨로지 검증 통과', tone: 'ok' };
  if (status === 'blocked') {
    return { text: '온톨로지 위반 — T-Box의 방향과 맞지 않습니다', tone: 'bad' };
  }
  // ★ 판정을 **못 한 것**이지 틀린 것이 아니다.
  if (status === 'unverified') {
    return { text: '검증 판정 보류 — 탐색 경로를 해석하지 못했습니다', tone: 'warn' };
  }
  return { text: status, tone: 'warn' };
}
