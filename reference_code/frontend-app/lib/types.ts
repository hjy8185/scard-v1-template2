export interface SubgraphNode {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface SubgraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface Subgraph {
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
}

export interface StageEvent {
  stage: string;
  status: string;
  ms: number;
  data?: Record<string, unknown> | null;
}

export interface ValidationStage {
  stage: string;
  passed: boolean;
  issues: string[];
}

export interface MessageAnnotation {
  subgraph?: Subgraph;
  validation?: { passed: boolean; stages: ValidationStage[] };
  tool_calls?: Array<{ tool_name: string; params: Record<string, unknown>; result_summary: string }>;
  correction_count?: number;
}

export type ScenarioStatus = 'pass' | 'judge_strict' | 'fail';

export interface Scenario {
  id: string;
  title: string;
  query: string;
  category: string;
  description?: string;
  status?: ScenarioStatus;
}

// ═══════════════════════════════════════════════════════════════════
// U6 — Platform demo types (신규 데이터모델 0: U5 계약 재사용/표시용)
// ═══════════════════════════════════════════════════════════════════

// DataGrade: source × processing 분리 (#1). 집계가 합성을 가리지 않음.
export type SourceGrade = '공개-실' | '합성' | '추정' | 'unsupported';
export type ProcessingGrade = '원천' | '집계';

export interface ProvenanceItem {
  component: string;                 // graph | sql | rule | metric | doc | plan
  source: SourceGrade;
  processing?: ProcessingGrade;
}

// U5 RoutePlan (Orchestration 탭)
export interface RouteStepView {
  step_id: string;
  tool: string;
  template_id?: string | null;
  action?: string | null;
  depends_on: string[];
  required: boolean;
  status?: string;
  provenance_source?: string;
}
export interface UnderstoodToken { label: string; value: string }
export interface RoutePlanView {
  intent: string;
  planner: string;
  normalized_query_hash: string;
  steps: RouteStepView[];
  selected_tier?: string | null;                 // U8 라우팅 tier
  template_ids?: string[];                        // U14 P1-1: approved template 실행 증거
  understood_tokens?: UnderstoodToken[];          // U14 P1-2: 질문 이해 토큰
}

// U14 P1-3 KPI 타일
export interface KpiTile {
  id: string;
  label: string;
  value: string;
  grade: AssetGrade;
  lightKeys: string[];   // 답변 신호와 대조해 하이라이트
}

// U4 metric evidence (원형 보존, #4)
export interface MetricEvidence {
  metric_name: string;
  value?: number | null;
  grain?: string;
  unit?: string;
  filters?: Record<string, unknown>;
  definition?: string;
  definition_version?: string;
  synthetic_flag?: boolean;
  lineage_refs?: string[];
  source_tables?: string[];
  as_of?: string | null;
  data?: Array<{ dimensions: Record<string, unknown>; value: unknown }>;
}

// U5 Citation (Evidence 탭)
export interface Citation {
  graph_paths?: unknown[];
  sql?: { query: string; row_count: number } | null;
  rule_trace?: Record<string, unknown> | null;
  doc_chunks?: string[];
  metrics?: MetricEvidence[];
  provenance?: ProvenanceItem[];
  chain?: ChainResult | null;   // U37 evidence chain
  queries?: ExecutedQuery[];    // U47 실행 쿼리(gremlin/sql/metric/search)
}

/** U47 — 이 답변이 실제로 실행한 쿼리 1건. 서버가 승인 템플릿에서 렌더한 원문 그대로.
 *  값이 없는 필드는 서버가 안 보낸 것(프론트에서 만들지 않는다 — U38 unavailable 계약). */
export interface ExecutedQuery {
  seq: number;
  tool: string;                 // graph_query | sql_query | metric_query | doc_search
  engine: string;               // Neptune | Athena | Valkey (시맨틱 레이어) | OpenSearch
  language: 'gremlin' | 'sql' | 'metric' | 'search';
  query: string;                // 실행된 쿼리 원문
  template_id?: string | null;
  template_version?: string | null;
  purpose?: string;             // 관람객 언어 한 줄(서버 registry 소유)
  params?: Record<string, unknown>;
  row_count?: number | null;
  latency_ms?: number | null;
  status?: string;              // ok | error
}

// U37 — 온톨로지 evidence chain (multi-hop 결정론 실행 결과)
export interface ChainHop {
  id: string; from_entity: string; edge_type: string; to_entity: string;
  join_key: string; cardinality: string; grade: string;
  summary: string; key_values?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  lineage?: { source_asset?: string };
}
export interface ChainResult {
  status: string; chain_id: string; title: string;
  hops: ChainHop[];
  conclusion: { finding_kind: 'observation' | 'hypothesis'; text: string;
    numbers?: Record<string, unknown>;
    // U40: 백엔드 소유 표시용 highlight — 프런트는 포맷만(의미 해석 금지)
    highlight?: { label: string; value: string | number; unit?: string | null;
      qualifier?: string | null; source?: { hop_id: string; key: string } } | null };
  caveats?: string[];
  n_hops: number; n_datasets: number; sources?: string[];
}

// BFF 보강 (Ontology / Catalog 탭)
export interface OntologyContext {
  categories: Array<{ iri?: string; label?: string; subClassOf?: string | null }>;
  closure_path?: string[];
  crosswalk?: Array<{ from: string; from_scheme: string; from_label?: string; to: string; to_scheme: string; to_label?: string }>;
  source?: string;
}
export interface CatalogContext {
  terms: Array<{ name: string; definition: string; owning_project: string }>;
  lineage?: Array<{ from: string; to: string; kind: string }>;
  source?: string;
}

export interface AuditSummary {
  request_id?: string;
  route_id?: string;
  normalized_query_hash?: string;
  planner_version?: string;
  tool_calls?: number;
  errors?: number;
}

// 확장 annotation (기존 MessageAnnotation 필드 + 플랫폼 필드)
export interface PlatformAnnotation extends MessageAnnotation {
  route_plan?: RoutePlanView | null;
  citation?: Citation;
  audit?: AuditSummary;
  ontology?: OntologyContext | null;
  catalog?: CatalogContext | null;
  disclaimers?: string[];
  unsupported?: boolean;
  insights?: InsightCard[];   // U13 P3: BFF build_insights 산출(완료 후 일괄 렌더)
}

// ── U13 자산 지도 도메인 모델 (FD domain-entities) ──
export type Camp = 'terms' | 'market' | 'synthetic';
// 지도 노드 등급(색): source 등급 + 집계(processing) 통합 — 진영별 대표 신뢰도 표기
export type AssetGrade = '공개-실' | '집계' | '합성' | '추정';

export interface AssetNode {
  id: string;
  label: string;
  camp: Camp;
  scaleText: string;          // 실측 규모(dataset-catalog-detail 출처)
  grade: AssetGrade;
  backingTables: string[];    // SMUS 대조 키(R4a) — 이 노드가 대표하는 물리 테이블
  connected: boolean;         // 런타임 서빙 연결(false=회색 자물쇠)
  lightMapKeys: string[];     // 점등 매핑 키(annotation 신호 → 이 노드)
}

export interface Bridge {
  id: string;
  kind: 'crosswalk' | 'subsumption' | 'rule' | 'metric';
  from: Camp;
  to: Camp;
  /** U27: camp 기본 배선 대신 노드를 명시(동일 camp 내부 다리 등). */
  endpoints?: { source: string; target: string };
  label: string;
  exemplar: string;           // hover 예시
  lightMapKeys: string[];
}

export interface LightingState {
  litNodes: Set<string>;
  litBridges: Set<string>;
  phase: 'idle' | 'streaming' | 'lit';
  unmappedTools: string[];    // 매핑 실패 tool(콘솔 경고용, 전체 dim 금지)
}

export interface GovernanceBadge {
  nodeId: string;
  registeredTables: string[];         // backingTables ∩ SMUS 등록
  status: 'full' | 'partial' | 'none'; // 전부/일부(N of M)/없음
  snapshotLabel: string;              // staleness 툴팁
}

// ReasoningTrace: orchestrated 실보유 데이터만(4중점수 없음, result_summary는 8: annotation에 실재)
export interface ReasoningTraceToolStep {
  tool: string;
  templateId?: string;
  status: string;
  resultSummary?: string;   // rows=N results=M (AuditRecord.to_dict의 row_count/result_count)
}
export interface ReasoningTrace {
  phase: 'streaming' | 'complete';
  intent?: string;
  selectedTier?: string;
  toolSteps: ReasoningTraceToolStep[];
  passed?: boolean;
  disclaimers?: string[];
  durationMs?: number;
}

// InsightCard: BFF build_insights 산출(FD §5.1)
export interface InsightCard {
  kind: 'bar' | 'heatmap' | 'sunburst' | 'compare';
  title: string;
  series: unknown[];        // kind별 스키마(FD §5.1)
  grade: AssetGrade;
}

// /api/catalog 응답(SMUS 거버넌스 뱃지 소스)
export interface CatalogResponse {
  assets: string[];         // 등록 GlueTable 자산명
  terms: string[];          // glossary term
  snapshotDate: string | null;
}

// U6 공통 SSE StageEvent (#4)
export interface PlatformStageEvent {
  event_type: 'route' | 'tool' | 'compose' | 'error' | 'final';
  request_id?: string;
  route_id?: string;
  step_id?: string;
  tool_call_id?: string;
  tool?: string;
  status: 'active' | 'done' | 'error' | 'skip';
  ms?: number;
  payload?: Record<string, unknown> | null;
  error?: string | null;
}

// 시나리오 프리셋 (6 카테고리 × 5)
export interface ScenarioPreset {
  id: string;
  title: string;
  query: string;
  preset_card_id?: string;   // U7: 자격판정 등 카드 컨텍스트
  whatif?: { base_rule: string; cohort: string; delta: Record<string, unknown> };
  v1_failure?: string;       // U12 연결증명: "기존엔 이렇게 실패" 툴팁
}
export interface ScenarioCategory {
  scenario_id: string;
  category_title: string;
  narration: string;
  questions: ScenarioPreset[];
  // v3-anatomy: 연결 해부 유형 축으로 재편(정확도 만점 + S등급 20문항). 여정 모드 폐지.
  group?: 'v2' | 'u10' | 'marketer' | 'connection' | 'anatomy';
  anatomy_type?: 'market' | 'generic' | 'eligibility' | 'metric' | 'txn' | 'complaint';
  accent?: string;         // 그룹 색상(픽커 pill/헤더)
  anatomy_desc?: string;   // 이 유형이 보여주는 연결 한 줄 설명
  // 구 필드(하위호환 — v3에서는 미사용)
  story_id?: string;
  fr?: string;
  required_tools?: string[];
  expected_tabs?: ShowcaseTab[];
  expected_grades?: string[];
}

// DrilldownPanel 라우팅 키 (지도 노드/다리 클릭 → 기존 패널). 구 6탭 id 계승.
export type ShowcaseTab = 'orchestration' | 'evidence' | 'ontology' | 'catalog' | 'metric' | 'graph';
// RightPanelTab 제거(U13: 지도 허브로 탭 시스템 폐기)
