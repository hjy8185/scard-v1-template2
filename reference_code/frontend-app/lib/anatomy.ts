// U18 — 연결 해부(Data Anatomy) 선정 로직.
// 원리: ①불일치 먼저 ②검산 가능 ③샘플 행 = 답변 속 그 값 ④한 화면 = 한 연결 ⑤비정형은 변환쌍.
// 검산은 프론트 재계산 금지 — table_anatomy.json의 사전 검산값과 annotation 값 대조만.

import type { PlatformAnnotation } from './types';
import { executedActions } from './annotation-utils';

export interface AnatomySchemaCol { col: string; type: string; desc: string }
export interface AnatomyTable {
  id: string; title: string; org: string; grade: string; rows_total: string;
  schema: AnatomySchemaCol[];
  rows: Array<Record<string, string>>;   // 선택된 샘플 행(원리3)
}
export interface AnatomyRef {
  kind: 'crosswalk' | 'subsumption' | 'transform_pair' | 'edge';
  source: string;
  display: string[];       // 렌더 줄(예: "음식점(신한) ←exactMatch 0.9→ 한식·분식…")
  honesty?: string;
}
export interface AnatomyArithmetic {
  parts: Array<{ label: string; value: number }>;
  total: number; unit: string; claim: string;
}
export interface Anatomy {
  key: string;                       // 해부 유형 키(테스트/시연모드 라벨)
  left: AnatomyTable; right: AnatomyTable;
  ref: AnatomyRef;
  subRefs: AnatomyRef[];             // 부 연결 칩(원리4)
  arithmetic?: AnatomyArithmetic;
  mismatchCaption: string;           // 1박 캡션("같은 것을 가리키는 두 언어…")
}

export type AnatomyData = {
  tables: Record<string, { title: string; org: string; grade: string; rows_total: string;
    schema: AnatomySchemaCol[]; sample_pool: Array<{ match: string[]; rows: Array<Record<string, string>> }> }>;
  ontology_refs: Record<string, Record<string, unknown>>;
  arithmetic: Record<string, AnatomyArithmetic>;
};

// annotation에서 매칭 엔티티 추출(원리3 — 답변 속 그 값)
function entitiesOf(ann: PlatformAnnotation): string[] {
  const out: string[] = [];
  for (const t of ann.route_plan?.understood_tokens ?? []) out.push(t.value);
  const onto = ann.ontology ?? (ann.citation as { ontology?: { categories?: Array<{ label?: string }> } } | undefined)?.ontology;
  for (const c of (onto as { categories?: Array<{ label?: string }> } | undefined)?.categories ?? []) if (c.label) out.push(c.label);
  const rows = (ann.citation as { market?: { rows?: Array<Record<string, unknown>> } } | undefined)?.market?.rows ?? [];
  if (rows[0]?.category) out.push(String(rows[0].category));
  return out;
}

function pickRows(data: AnatomyData, tableId: string, entities: string[]): AnatomyTable | null {
  const t = tableOf(data, tableId);
  if (!t) return null;   // U26: 정적 자산 skew — 해당 표 정의 없음
  const pool = t.sample_pool ?? [];
  const hit = pool.find((p) => p.match.length > 0 && p.match.some((m) => entities.some((e) => e.includes(m) || m.includes(e))))
    ?? pool.find((p) => p.match.length === 0) ?? pool[0];
  return { id: tableId, title: t.title, org: t.org, grade: t.grade, rows_total: t.rows_total, schema: t.schema, rows: hit?.rows ?? [] };
}

// U24 P0: 엄격 매칭 — 질의 엔티티와 매칭되는 풀이 있을 때만 행 반환(무매칭 폴백 금지).
// "의료 질의에 한식음식점 행" 같은 자기모순(감사에서 7건)의 원천 차단.
function pickRowsStrict(data: AnatomyData, tableId: string, entities: string[]): AnatomyTable | null {
  const t = tableOf(data, tableId);
  if (!t) return null;   // U26: 정적 자산 skew
  const hit = (t.sample_pool ?? []).find((p) =>
    p.match.length > 0 && p.match.some((m) => entities.some((e) => e.includes(m) || m.includes(e))));
  if (!hit) return null;
  return { id: tableId, title: t.title, org: t.org, grade: t.grade, rows_total: t.rows_total, schema: t.schema, rows: hit.rows };
}

// U24 P1: 시장(crosswalk) 해부의 좌우 표 — live(/api/anatomy 실데이터, 14카테고리 전체) 우선,
// 없으면 정적 풀 엄격 매칭. 둘 다 없으면 null(호출부가 미표시 처리).
// entities는 ref(2박)의 crosswalk 카테고리를 최우선으로 — market.rows 1위 행(항상 음식점)이
// 엔티티에 섞여 슈퍼마켓 질의에 음식점 행이 매칭되던 오염 차단(U24 게이트 ② 발견).
function marketTables(data: AnatomyData, entities: string[], live: LiveAnatomy | null | undefined,
                      isFood: boolean): { left: AnatomyTable; right: AnatomyTable; arithmetic?: AnatomyArithmetic } | null {
  const meta = (tableId: string): AnatomyTable | null => {
    const t = tableOf(data, tableId);   // U26: 정적 자산 skew 방어
    if (!t) return null;
    return { id: tableId, title: t.title, org: t.org, grade: t.grade, rows_total: t.rows_total, schema: t.schema, rows: [] };
  };
  if (live?.benefit_rows?.length && live?.seoul_rows?.length) {
    const mb = meta('r1_benefit');
    const ms = meta('seoul_sales');
    if (!mb || !ms) return null;
    return {
      left: { ...mb, rows: live.benefit_rows.slice(0, 3) },
      right: { ...ms, rows: live.seoul_rows.map((r) => ({ '서비스_업종_코드_명': r.industry, '당월_매출_금액': r.amount })) },
      arithmetic: live.arithmetic ?? undefined,
    };
  }
  const left = pickRowsStrict(data, 'r1_benefit', entities);
  const right = pickRowsStrict(data, 'seoul_sales', entities);
  if (!left || !right) return null;
  return { left, right, arithmetic: isFood ? data.arithmetic.food_market : undefined };
}

// U24: ref(2박)가 말하는 crosswalk 출발 카테고리 — 표(1박) 행 매칭의 최우선 신호(자기일치).
function crosswalkFromLabels(ann: PlatformAnnotation): string[] {
  const onto = ann.ontology ?? (ann.citation as { ontology?: unknown } | undefined)?.ontology as
    { crosswalk?: Array<{ from_label?: string }> } | undefined;
  return [...new Set((onto?.crosswalk ?? []).map((x) => x.from_label).filter(Boolean))] as string[];
}

// U19: 이 답변의 실제 crosswalk(annotation.ontology)에서 동적 ref — 정적 3벌 고착 해소.
function dynamicCrosswalkRef(ann: PlatformAnnotation): AnatomyRef | null {
  const onto = ann.ontology ?? (ann.citation as { ontology?: unknown } | undefined)?.ontology as
    { crosswalk?: Array<{ from_label?: string; to_label?: string; from_scheme?: string; to_scheme?: string }> } | undefined;
  const xw = onto?.crosswalk ?? [];
  if (!xw.length) return null;
  const from = [...new Set(xw.map((x) => x.from_label).filter(Boolean))].slice(0, 2) as string[];
  const tos = [...new Set(xw.map((x) => x.to_label).filter(Boolean))].slice(0, 6) as string[];
  if (!from.length || !tos.length) return null;
  // U22 A6: 매핑 수 고정문자("43매핑") 제거 — 실값은 citation.market.meta.crosswalk_note 참조
  const note = (ann.citation as { market?: { meta?: { crosswalk_note?: string } } } | undefined)
    ?.market?.meta?.crosswalk_note;
  return {
    kind: 'crosswalk',
    source: `D0 crosswalk_mapping (이 답변의 연결 — crosswalk.ttl 큐레이션${note ? ` · ${note}` : ''})`,
    display: [`${from.join('·')} (신한 혜택)`, '←exactMatch→', `${tos.join('·')} (서울 업종)`],
  };
}

// U26: 정적 자산(table_anatomy.json) skew 방어 — 키가 없으면 throw 대신 null.
// 배포 중 브라우저가 구 JSON을 캐시한 채 신 anatomy.ts를 돌리면 U24/U25 신규 키
// (transform_condition·txn_crosswalk·metric_value 등)가 없어 렌더 중 throw → 앱 전체
// ErrorBoundary 폴백(마케터 여정 크래시)이던 것을 해당 해부만 미표시로 격리.
function tableOf(data: AnatomyData, id: string): AnatomyData['tables'][string] | null {
  return data.tables?.[id] ?? null;
}

function refOf(data: AnatomyData, key: string): AnatomyRef | null {
  const r = data.ontology_refs?.[key];
  if (!r) return null;
  const kind = r.kind as AnatomyRef['kind'];
  let display: string[] = [];
  if (kind === 'crosswalk') {
    const from = r.from as { scheme: string; value: string };
    const to = r.to as { scheme: string; values: string[] };
    display = [`${from.value} (${from.scheme})`, `←${r.relation as string}→`, `${to.values.join('·')} (${to.scheme})`];
  } else if (kind === 'subsumption') {
    display = [(r.path as string[]).join(' ⊑ ')];
  } else if (kind === 'transform_pair') {
    display = [`원문: "${r.raw as string}"`, '↓ 온톨로지 정형화', JSON.stringify(r.structured)];
  } else {
    display = [(r.triple as string[]).join(' —')];
  }
  return { kind, source: r.source as string, display, honesty: r.honesty as string | undefined };
}

// 주 연결 자동 선정 — buildPathLine과 동일 우선순위(원리4: 한 화면 = 한 연결)
export function buildAnatomy(ann: PlatformAnnotation | undefined, data: AnatomyData | null,
                             live?: LiveAnatomy | null): Anatomy | null {
  if (!ann?.route_plan || !data) return null;
  const intent = ann.route_plan.intent;
  const entities = entitiesOf(ann);
  const has = (kw: string) => entities.some((e) => e.includes(kw) || kw.includes(e));

  // 00) U49 chain 해부 — 멀티홉 답변에 '연결 해부' 탭이 없던 것 수리.
  // 원인: chain 답변의 intent는 market_consumption인데 아래 1번 crosswalk 분기가
  // annotation.ontology.crosswalk를 요구한다(chain 경로는 그걸 안 채운다) → null.
  // chain은 hop 자체가 "무엇을 무엇과 어떻게 이었나"의 완전한 소재이므로 그것으로 구성한다.
  // 대상 hop = 실제 조인이 일어난 것(join_key + rows) 중 마지막 — 결론에 가장 가까운 연결.
  {
    const ch = (ann.citation as { chain?: {
      status?: string; chain_id?: string;
      hops?: Array<{ id: string; from_entity: string; edge_type: string; to_entity: string;
        join_key: string; cardinality: string; grade: string; summary: string;
        rows?: Array<Record<string, unknown>>;
        lineage?: { source_asset?: string } }>;
    } } | undefined)?.chain;
    const hops = ch?.status === 'ok' ? (ch.hops ?? []) : [];
    const joined = hops.filter((h) => h.rows?.length && h.join_key);
    if (joined.length >= 2) {
      // 좌 = 앞 hop의 실제 행(원천), 우 = 마지막 hop의 실제 행(결론 직전 산출)
      const src = joined[joined.length - 2];
      const dst = joined[joined.length - 1];
      const toTable = (h: typeof src, id: string): AnatomyTable => {
        const cols = Object.keys(h.rows![0]).slice(0, 4);
        return {
          id, title: h.to_entity || h.from_entity,
          org: h.lineage?.source_asset ?? '온톨로지 인덱스',
          grade: h.grade ?? '공개-실',
          rows_total: `${h.rows!.length}건(이 답변에 사용)`,
          schema: cols.map((c) => ({ col: c, type: '', desc: '' })),
          rows: h.rows!.slice(0, 4).map((r) => Object.fromEntries(
            cols.map((c) => [c, String(r[c] ?? '')]))),
        };
      };
      return {
        key: `chain:${ch!.chain_id}:${dst.id}`,
        left: toTable(src, `chain_${src.id}`),
        right: toTable(dst, `chain_${dst.id}`),
        ref: {
          kind: 'edge',
          source: `${dst.edge_type} — 조인 키 ${dst.join_key} (${dst.cardinality})`,
          display: [dst.summary],
        },
        subRefs: [],
        mismatchCaption:
          `'${src.from_entity}'와 '${dst.to_entity}'는 서로 다른 데이터에 서로 다른 축으로 담겨 있어 `
          + `직접 join할 수 없습니다 — 온톨로지 연결(${dst.edge_type})이 그 사이를 잇습니다`,
      };
    }
  }

  // 0) U27 생활인구×소비 — AreaMapping(edge) 해부. crosswalk 분기보다 먼저 판정
  // (같은 intent=market_consumption인데 crosswalk가 아니라 지역 코드 다리가 주인공).
  const mkAction = (ann.citation as { market?: { action?: string } } | undefined)?.market?.action;
  if (['pop_vs_sales', 'penetration', 'pop_by_age'].includes(mkAction ?? '')) {
    const left = pickRows(data, 'living_pop', []);
    const right = pickRows(data, 'seoul_sales_area', []);
    if (!left || !right) return null;   // 정적 자산 미배포(skew) — 정직하게 미표시 (U26)
    return {
      key: `population:${mkAction}`,
      left, right,
      ref: {
        kind: 'edge',
        source: 'AreaMapping 25건 (상권영역 shapefile TRDAR_CD_N↔ADSTRD_CD, 검수 verified)',
        display: ['여의도역(여의도) —AreaMapping→ 여의동(11560540)'],
      },
      subRefs: [],
      arithmetic: data.arithmetic.yeouido_pop,
      mismatchCaption: '행정동코드 8자리 vs 상권코드 7자리 — 같은 서울인데 지역 축이 달라 직접 join할 수 없습니다',
    };
  }

  // 0b) U28 시장 시계열 — KOSIS 상품군↔혜택 카테고리 curated 매핑 해부.
  if (mkAction === 'trend' || mkAction === 'market_total') {
    const left = pickRows(data, 'kosis_online', entities);
    const right = pickRows(data, 'r1_benefit', entities.length ? entities : ['화장품']);
    if (!left || !right) return null;   // 정적 자산 skew — 미표시 (U26)
    const refRaw = data.ontology_refs.kosis_crosswalk as
      { kind?: string; source?: string; display?: string[] } | undefined;
    if (!refRaw?.display) return null;
    return {
      key: `trend:${mkAction}`,
      left, right,
      ref: { kind: 'crosswalk', source: refRaw.source ?? '', display: refRaw.display },
      subRefs: [],
      arithmetic: data.arithmetic.kosis_mapping,
      mismatchCaption: "통계청 '상품군' 26종 vs 신한 '혜택 카테고리' 19종 — 분류 체계가 달라 직접 join할 수 없습니다",
    };
  }

  // 0e) U30 crosswalk_meta 2층 해부 — 정부 공식 레이어 × 우리 큐레이션 (S4a 화면).
  // v4 B그룹 2문항(x4-04·XW1): official_bridge(U29 build_18) 완비인데 화면 부재.
  {
    const mk = (ann.citation as { market?: { action?: string;
      official_bridge?: { official?: { n_rows?: number; structure?: string; version_gap?: string;
        samples?: Array<{ nts_code: string; ksic_major: string; ksic_leaf: string }> };
        curated?: Record<string, string>; source?: string };
      crosswalk_summary?: { n_mappings?: number; confidence?: number; coverage_pct?: number;
        review_status?: string };
      trust?: { lifecycle?: string; n_promoted?: number; n_reviewed?: number;
        bridges?: Array<{ bridge?: string; validation?: string; status?: string;
          coverage_pct?: number | null }> } } } | undefined)?.market;
    if (mk?.action === 'crosswalk_meta' && mk.official_bridge?.official) {
      const off = mk.official_bridge.official;
      const cs = mk.crosswalk_summary ?? {};
      const left: AnatomyTable = {
        id: 'official_bridge', title: '정부 공식 연계표 [공개-실]',
        org: mk.official_bridge.source ?? '국세청 업종코드↔KSIC 11차(홈택스 공개 CSV)',
        grade: '공개-실', rows_total: `${(off.n_rows ?? 0).toLocaleString()}행`,
        schema: [{ col: 'nts_code', type: 'id', desc: '국세청 업종코드' },
                 { col: 'ksic', type: 'text', desc: 'KSIC 11차' }],
        rows: (off.samples ?? []).slice(0, 3).map((s) => ({
          nts_code: s.nts_code, ksic: s.ksic_leaf || s.ksic_major })),
      };
      const right: AnatomyTable = {
        id: 'curated_bridge', title: '우리 큐레이션 crosswalk',
        org: 'D0 — 서울 62업종 ↔ 신한 19카테고리 (사람 검수)', grade: '집계',
        rows_total: `${cs.n_mappings ?? '?'}매핑 · 커버 ${cs.coverage_pct ?? '?'}%`,
        schema: [{ col: 'field', type: 'text', desc: '' }, { col: 'value', type: 'text', desc: '' }],
        rows: [
          { field: 'confidence', value: String(cs.confidence ?? '') },
          { field: 'review', value: String(cs.review_status ?? '') },
          { field: '커버리지', value: `서울 매출 ${cs.coverage_pct ?? '?'}%` },
          // U36: 엣지 라이프사이클 — 관계는 검증·승격으로 운영된다
          ...(mk.trust?.n_promoted != null
            ? [{ field: '라이프사이클',
                 value: `promoted ${mk.trust.n_promoted} · reviewed ${mk.trust.n_reviewed}` }]
            : []),
        ],
      };
      // U36: 다리별 조인 검증 실측(상권↔행정동 25/25 등) — "추정 아닌 검증된 연결"
      const joinProof = (mk.trust?.bridges ?? [])
        .filter((b) => b.coverage_pct != null)
        .slice(0, 2)
        .map((b) => `✓ ${b.bridge}: ${b.validation}`);
      return {
        key: 'crosswalk_meta:two_layer',
        left, right,
        ref: {
          kind: 'crosswalk',
          source: '2층 신뢰 구조 — 공식 연계표(존재하되 버전이 갈라짐) + 큐레이션(confidence·검수·미매핑 정직)',
          display: [off.version_gap ?? '소진공=KSIC 10차 vs 국세청 연계표=11차 — 버전 갈림',
                    ...joinProof],
        },
        subRefs: [],
        arithmetic: {
          parts: [{ label: '공식 연계표', value: off.n_rows ?? 0 },
                  { label: '우리 큐레이션', value: cs.n_mappings ?? 0 }],
          total: (off.n_rows ?? 0) + (cs.n_mappings ?? 0),
          unit: '매핑 행',
          claim: '공식 연계표조차 버전이 갈라져 있다 — 그것을 잇는 것이 온톨로지 연결',
        },
        mismatchCaption: '정부 공식 분류들끼리도 버전(10차/11차)이 달라 직접 붙지 않습니다 — 신뢰는 출처·검수·한계의 명시에서 나옵니다',
      };
    }
  }

  // 0f) U30 benchmark 앵커 해부 — 합성 분포 × 외부 실측 (S4b 화면).
  // v4 B그룹 2문항(CMP1·CMP2): anchors(U29 build_17) 완비인데 화면 부재.
  {
    const om = (ann.citation as { ontology?: { action?: string;
      by_issue?: Record<string, number>;
      anchors?: { style?: { n_categories?: number; benefit_share_pct?: number; source?: string };
        volume?: { card_complaints_h1_2025?: number; yoy_pct?: number; source?: string };
        external_benchmark?: { total?: number; age_distribution_pct?: Record<string, number>;
          online_mobile_share_pct?: number; source?: string } } } } | undefined)?.ontology;
    if (om?.action === 'complaint_benchmark' && om.anchors) {
      const an = om.anchors;
      const issues = Object.entries(om.by_issue ?? {}).slice(0, 3);
      const left: AnatomyTable = {
        id: 'our_complaints', title: '우리 민원 분포 [합성 — 혜택 과표집]',
        org: 'D7 합성 민원 503건 (온톨로지 추적 가능 유형 중심)', grade: '합성',
        rows_total: '503건 (원장연결 203)',
        schema: [{ col: 'issue', type: 'text', desc: '유형' }, { col: 'n', type: 'count', desc: '건수' }],
        rows: issues.map(([k, v]) => ({ issue: k, n: `${v}건` })),
      };
      const right: AnatomyTable = {
        id: 'external_anchors', title: '외부 실측 3중 앵커 [공개-실]',
        org: '하나카드 상담·금감원 공시·소비자원', grade: '공개-실',
        rows_total: '3원천',
        schema: [{ col: 'anchor', type: 'text', desc: '' }, { col: 'value', type: 'text', desc: '' }],
        rows: [
          { anchor: '실 상담 유형(하나카드)', value: `${an.style?.n_categories ?? '?'}종 — 혜택/포인트 ~${an.style?.benefit_share_pct ?? '?'}%` },
          { anchor: '카드사 민원(금감원)', value: `${(an.volume?.card_complaints_h1_2025 ?? 0).toLocaleString()}건 (+${an.volume?.yoy_pct ?? '?'}%)` },
          { anchor: '피해구제(소비자원)', value: `${(an.external_benchmark?.total ?? 0).toLocaleString()}건 · 30대 ${an.external_benchmark?.age_distribution_pct?.['30대'] ?? '?'}%` },
        ],
      };
      return {
        key: 'complaint:benchmark',
        left, right,
        ref: {
          kind: 'transform_pair',
          source: '3중 앵커 — 문체·볼륨·유형 체계를 실측에 고정하되, 분포 괴리(혜택 과표집)는 숨기지 않음',
          display: ['합성 30% 혜택 민원 ↔ 실 상담 ~2% — 괴리를 그대로 표시(정직성 원칙)'],
        },
        subRefs: [],
        mismatchCaption: '우리 민원은 합성 — 그러나 무엇이 실측이고 무엇이 합성인지, 어디가 다른지를 전부 표시하는 것이 신뢰의 방식입니다',
      };
    }
  }

  // 0c) U30 coverage 해부 — 시장 수요(집계) × 커버 카드 수(그래프)의 갭.
  // v4 B그룹 8문항(P3 계열·TRD2·x1-03·u19-04): citation.coverage가 완비인데 화면 유형이 없던 것.
  // crosswalk 해부(아래 1번)보다 먼저 — coverage evidence가 있으면 갭이 주인공.
  {
    const cov = (ann.citation as { coverage?: { strong?: Array<{ category: string; card_count: number }>;
      weak?: Array<{ category: string; card_count: number }>; uncovered?: string[];
      total_categories?: number; market_gap?: Array<{ category: string; market_billion?: number; card_count: number }>;
      market_source?: string } } | undefined)?.coverage;
    if (cov?.total_categories && (cov.market_gap?.length || cov.weak?.length || cov.strong?.length)) {
      const gapRows = (cov.market_gap ?? []).slice(0, 3).map((g) => ({
        category: g.category, 시장소비: g.market_billion != null ? `${g.market_billion}억` : '',
        커버카드: `${g.card_count}장`,
      }));
      const strongRows = (cov.strong ?? []).slice(0, 3).map((s) => ({
        category: s.category, 커버카드: `${s.card_count}장`, 진단: '풍부',
      }));
      const left: AnatomyTable = {
        id: 'coverage_market', title: '시장 수요 (집계)',
        org: cov.market_source ?? '서울 추정매출 × crosswalk', grade: '집계',
        rows_total: `카테고리 ${cov.total_categories}종`,
        schema: [{ col: 'category', type: 'text', desc: '혜택 카테고리' },
                 { col: '시장소비', type: 'krw', desc: 'crosswalk 집계' }],
        rows: gapRows.length ? gapRows : strongRows,
      };
      const right: AnatomyTable = {
        id: 'coverage_cards', title: '우리 커버 (혜택 카드 수)',
        org: '신한 694장 × HAS_CATEGORY(그래프)', grade: '공개-실',
        rows_total: `강 ${cov.strong?.length ?? 0} · 약 ${cov.weak?.length ?? 0} · 전무 ${cov.uncovered?.length ?? 0}`,
        schema: [{ col: 'category', type: 'text', desc: '카테고리' },
                 { col: '커버카드', type: 'count', desc: '혜택 카드 수' }],
        rows: (cov.weak ?? cov.strong ?? []).slice(0, 3).map((w) => ({
          category: w.category, 커버카드: `${w.card_count}장` })),
      };
      const gap0 = cov.market_gap?.[0];
      return {
        key: 'coverage:gap',
        left, right,
        ref: {
          kind: 'crosswalk',
          source: 'D0 crosswalk(시장 축) × HAS_CATEGORY(커버 축) — 같은 카테고리 체계로 양쪽을 집계',
          display: gap0
            ? [`'${gap0.category}': 시장 ${gap0.market_billion ?? '?'}억 ↔ 커버 ${gap0.card_count}장 — 갭`]
            : [`카테고리 ${cov.total_categories}종 양축 집계`],
        },
        subRefs: [],
        arithmetic: {
          parts: [
            { label: '풍부(강)', value: cov.strong?.length ?? 0 },
            { label: '약함', value: cov.weak?.length ?? 0 },
            { label: '전무', value: cov.uncovered?.length ?? 0 },
          ],
          total: cov.total_categories,
          unit: '카테고리',
          claim: `강+약+전무 = ${cov.total_categories} ✓`,
        },
        mismatchCaption: '시장 수요는 통계어(업종), 커버는 약관어(혜택) — 카테고리 체계가 양쪽을 같은 축으로 만들어야 갭이 보입니다',
      };
    }
  }

  // 0d) U30 simulation 해부 — what-if baseline vs scenario (rule_delta가 다리).
  // v4 B그룹 6문항(P1-07/08/09·MKT-6·MKT2-6·TRD3): citation.simulation 완비인데 화면 부재.
  {
    const sim = (ann.citation as { simulation?: { baseline?: Record<string, number>;
      scenario?: Record<string, number>; delta?: Record<string, number>;
      cap_binding?: { monthly_reward_cap?: number; note?: string };
      portfolio_scale?: { category?: string; monthly_txn_count?: number;
        monthly_delta_krw?: number; basis?: string };
      rule_source?: string } } | undefined)?.simulation;
    if (sim?.baseline && sim.scenario && sim.delta) {
      const fmt = (d: Record<string, number>) => ([
        { 항목: '리워드 총액', 값: `${(d.total_reward ?? 0).toLocaleString()}원` },
        { 항목: '혜택 대상', 값: `${d.eligible ?? 0}건` },
        { 항목: '거절', 값: `${d.denied ?? 0}건` },
      ]);
      const left: AnatomyTable = {
        id: 'sim_baseline', title: '변경 전 (baseline)', org: 'U3 규칙엔진 — 대표 cohort [합성]',
        grade: '합성', rows_total: 'cohort 10건',
        schema: [{ col: '항목', type: 'text', desc: '' }, { col: '값', type: 'text', desc: '' }],
        rows: fmt(sim.baseline),
      };
      const right: AnatomyTable = {
        id: 'sim_scenario', title: '변경 후 (scenario)', org: '동일 규칙엔진 재계산',
        grade: '합성', rows_total: '동일 cohort',
        schema: [{ col: '항목', type: 'text', desc: '' }, { col: '값', type: 'text', desc: '' }],
        rows: fmt(sim.scenario),
      };
      const dr = sim.delta.total_reward ?? 0;
      return {
        key: 'simulation:whatif',
        left, right,
        ref: {
          kind: 'edge',
          source: 'rule_delta — 자격판정과 동일한 규칙엔진으로 양쪽을 계산(LLM 계산 없음)',
          display: [
            sim.cap_binding
              ? `Δ리워드 ${dr >= 0 ? '+' : ''}${dr.toLocaleString()}원 — ⚠️ ${sim.cap_binding.note ?? '월 상한이 지배'}`
              : `Δ리워드 ${dr >= 0 ? '+' : ''}${dr.toLocaleString()}원 · Δ대상 ${sim.delta.eligible ?? 0}건`,
            // U35: 포트폴리오 규모 확장(카테고리 월 거래량 기반) + base 규칙 출처
            ...(sim.portfolio_scale?.monthly_txn_count
              ? [`포트폴리오 규모: '${sim.portfolio_scale.category}' 월 ${sim.portfolio_scale.monthly_txn_count.toLocaleString()}건 기준 ≈ ${(sim.portfolio_scale.monthly_delta_krw ?? 0) >= 0 ? '+' : ''}${(sim.portfolio_scale.monthly_delta_krw ?? 0).toLocaleString()}원/월 [합성]`]
              : []),
            ...(sim.rule_source?.includes('실약관') ? ['base 규칙: 이 카드의 실약관 조립 [공개-실]'] : []),
          ],
        },
        subRefs: [],
        arithmetic: {
          parts: [
            { label: 'baseline 리워드', value: sim.baseline.total_reward ?? 0 },
            { label: 'scenario 리워드', value: sim.scenario.total_reward ?? 0 },
          ],
          total: dr,
          unit: '원(Δ)',
          claim: `scenario − baseline = ${dr >= 0 ? '+' : ''}${dr.toLocaleString()}원 ✓`,
        },
        mismatchCaption: '규칙 하나를 바꾸면 얼마가 움직이는가 — 추측이 아니라 같은 엔진의 재계산으로 답합니다',
      };
    }
  }

  // 1) market/coverage — crosswalk 해부 (오프닝 유형).
  // U19: 이 답변의 실제 crosswalk(annotation)로 동적 구성 — 어떤 카테고리든 그 답의 연결을 해부.
  // U24 P0/P1: 표의 행은 live(/api/anatomy 실데이터) 우선, 없으면 정적 풀 — 단 정적 풀도
  // 질의 카테고리와 매칭될 때만(무매칭 폴백 금지). 행을 못 구하면 정직하게 미표시.
  if (['market_consumption', 'coverage_gap', 'targeting'].includes(intent)) {
    const dynRef = dynamicCrosswalkRef(ann);
    if (!dynRef) return null;   // 이 답변에 crosswalk 없음 — 정직하게 미표시
    const refCats = crosswalkFromLabels(ann);
    const matchKeys = refCats.length ? refCats : entities;
    const isFood = matchKeys.some((e) => e.includes('음식점') || e.includes('외식'));
    const tables = marketTables(data, matchKeys, live, isFood);
    if (!tables) return null;   // 질의 카테고리의 행이 없음(live 미가용+정적 미매칭) — 미표시
    return {
      key: `market:crosswalk:${dynRef.display[0]}`,
      left: tables.left, right: tables.right,
      ref: dynRef,
      subRefs: [],
      arithmetic: tables.arithmetic,
      mismatchCaption: '같은 것을 가리키는 두 언어 — 약관의 혜택명은 서울 통계 어디에도 없습니다',
    };
  }

  // 2) eligibility — 비정형 변환쌍 + ⊑ (자격판정 유형).
  // U25: 좌(약관)·다리(변환쌍)·우(판정)를 전부 **이 답변의 실데이터**로 —
  //   좌 = rule_trace.source_conditions(판정에 실제 쓰인 이 카드의 약관 조항 원문)
  //   다리 = 그 조항 → 파싱된 규칙 필드(rule_trace의 숫자들)
  //   우 = 규칙엔진 판정 trace(실규칙 graph:eligibility_paths 조립)
  // 실 trace가 없거나(판정 미실행) 소재가 없으면 미표시가 정직 —
  // 정적 "월 4회…" 픽스처가 모든 자격 질의에 그려지던 문제(U25 진단) 폐지.
  if (intent === 'eligibility') {
    const rt = (ann.citation as { rule_trace?: Record<string, unknown> } | undefined)?.rule_trace;
    const srcConds = (rt?.source_conditions as string[] | undefined) ?? [];
    const ruleSource = String(rt?.rule_source ?? '');
    const realRule = ruleSource.startsWith('graph:');
    if (!rt || !realRule || !srcConds.length) return null;   // 실판정 소재 없음 — 정직 미표시

    const subRefs: AnatomyRef[] = [];
    const onto = ann.ontology ?? (ann.citation as { ontology?: unknown } | undefined)?.ontology as
      { closure_path?: string[] } | undefined;
    const closure = onto?.closure_path ?? [];
    if (closure.length >= 2) {
      subRefs.push({ kind: 'subsumption', source: 'taxonomy.ttl subClassOf (이 답변의 분류 경로)',
        display: [closure.join(' ⊑ ')] });
    }

    // 좌: 이 카드의 실제 약관 조항(판정에 쓰인 그 문장) — 스키마는 정적 메타 재사용
    const leftMeta = tableOf(data, 'r2_benefit_condition');
    const rightMeta = tableOf(data, 'r3_spend_tier');
    if (!leftMeta || !rightMeta) return null;   // U26: 정적 자산 skew — 미표시
    const left: AnatomyTable = {
      id: 'r2_benefit_condition', title: '이 카드의 약관 조항(판정 근거)', org: leftMeta.org,
      grade: leftMeta.grade, rows_total: leftMeta.rows_total, schema: leftMeta.schema,
      rows: srcConds.slice(0, 2).map((t) => ({ raw_text: String(t).slice(0, 200) })),
    };

    // 우: 규칙엔진 판정 trace(이 답변) — 내부 키 제외하고 핵심 판정값만
    const HIDE = new Set(['rule_source', 'source_conditions', 'benefit_id']);
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(rt)) {
      if (HIDE.has(k) || v == null) continue;
      row[k] = String(v).slice(0, 40);
      if (Object.keys(row).length >= 4) break;
    }
    const right: AnatomyTable = {
      id: 'r3_spend_tier', title: '규칙엔진 판정(이 답변)', org: '규칙엔진(U3)',
      grade: rightMeta.grade, rows_total: rightMeta.rows_total, schema: rightMeta.schema,
      rows: [row],
    };

    // 다리: 실조항 → 파싱된 규칙 필드(판정 trace의 그 숫자)
    const parsedBits: string[] = [];
    for (const k of ['rate_pct', 'prior_month_tier', 'monthly_count_limit', 'per_txn_cap']) {
      if (rt[k] != null) parsedBits.push(`${k}: ${rt[k]}`);
    }
    const staticRef = refOf(data, 'transform_condition');   // honesty(파싱 25% 한계) 승계용 — 없으면 생략
    const ref: AnatomyRef = {
      kind: 'transform_pair',
      source: 'R2 약관 파싱 → 규칙엔진(이 카드의 실조항 — graph:eligibility_paths)',
      display: [`원문: "${String(srcConds[0]).slice(0, 60)}"`, '↓ 온톨로지 정형화', `{${parsedBits.join(', ')}}`],
      honesty: staticRef?.honesty,
    };
    return {
      key: `eligibility:transform:${entities[0] ?? ''}`,
      left,
      right,
      ref,
      subRefs,
      mismatchCaption: '약관은 문장(비정형), 판정은 숫자 — 사람이 읽던 조항을 기계가 판정하려면 정형화가 필요합니다',
    };
  }

  // 2.5) U19 R1: 민원 추적 — 민원문(비정형)→원장(정형)→약관조건 3단 (G6/G9 하이라이트).
  // 판별: ontology_map intent + 실행 action(complaint_trace/search). search는 목록이라 trace만 해부.
  // U22 A1: tool_calls[].action만 보던 판별을 executedActions(template_ids 합집합)로 — 도달 불가 수리.
  const acts = executedActions(ann);
  if (intent === 'ontology_map' && acts.has('complaint_trace')) {
    const left = pickRows(data, 'd7_complaint', entities);
    const right = pickRows(data, 'd6_reward_ledger', entities);
    const ref = refOf(data, 'complaint_chain');
    if (!left || !right || !ref) return null;   // U26: 정적 자산 skew — 미표시
    const sub = refOf(data, 'transform_condition');
    // U29 S5 4박: 실측 앵커 카드("이 합성 민원이 왜 진짜같은가") — 정적 자산에 있으면 동반
    const anchor = refOf(data, 'complaint_anchor');
    const subRefs = [sub, anchor].filter(Boolean) as AnatomyRef[];
    return {
      key: 'complaint:trace',
      left, right, ref,
      subRefs,
      mismatchCaption: '민원은 사람의 말(비정형), 원장은 거래 기록(정형) — 텍스트와 숫자는 원래 서로를 모릅니다',
    };
  }

  // 2.6) U24 P2a: self_metric — 지표 정의(시맨틱 레이어) × 원천 원장(D5/D6) 해부.
  //      "이 숫자는 어떻게/어디서" 질의 20건(감사 최다 미표시 계열)의 올바른 조합:
  //      좌=원장(원천 데이터), 우=지표(정의된 계산) — 다리는 metric registry 정의·계보.
  if (intent === 'self_metric') {
    const cit = ann.citation as { metrics?: Array<{ metric_name?: string; value?: unknown;
      definition?: string; definition_version?: string; grain?: string;
      source_tables?: unknown; data?: Array<{ dimensions: Record<string, unknown>; value: unknown }> }>;
      metric_meta?: { metric_name?: string; metadata?: Record<string, unknown> } } | undefined;
    // U30 metric:lineage — 메타 질의("정의/버전/출처/영향")는 값 대신 registry 정의가 우측.
    // v4 원인분석 B그룹 최대 축(13문항): P4 계열·MKT-8·x4-01·u19-05 등이 해부 0점이던 것.
    const mm = cit?.metric_meta;
    if (mm?.metadata && mm.metric_name) {
      const md = mm.metadata as { definition?: string; formula?: string; unit?: string;
        definition_version?: string; source_cols?: string[]; grain?: string[];
        synthetic_flag?: boolean; source_tables?: string[]; dbt_node_id?: string[] };
      const left = pickRows(data, 'd6_reward_ledger_src', entities);
      if (!left) return null;   // skew — 미표시(U26)
      const right: AnatomyTable = {
        id: 'metric_registry', title: '시맨틱 레이어 정의 (registry)',
        org: 'U4 metric registry — 사람 확정 계약', grade: '공개-실',
        rows_total: '지표 7종', schema: [
          { col: 'field', type: 'text', desc: '정의 요소' },
          { col: 'value', type: 'text', desc: '등록 값' }],
        rows: [
          { field: 'definition', value: md.definition ?? '(미등록)' },
          { field: 'formula', value: md.formula ?? '' },
          { field: 'version', value: String(md.definition_version ?? '') },
          { field: 'source', value: (md.source_cols ?? md.source_tables ?? []).join(', ') },
        ].filter((r) => r.value),
      };
      const lineage = (md.dbt_node_id ?? []).join(' · ');
      return {
        key: `metric:lineage:${mm.metric_name}`,
        left, right,
        ref: {
          kind: 'edge',
          source: `metric registry v${String(md.definition_version ?? '1.0').split(':')[0]}${md.synthetic_flag ? ' · 값=합성/정의=실' : ''}`,
          display: [`원장(${(md.source_cols ?? []).join('·') || 'd5/d6'})`,
            lineage ? `→ dbt(${lineage}) →` : '→ 정의된 집계 →',
            `${mm.metric_name}`],
        },
        subRefs: [],
        mismatchCaption: '지표 이름은 말(비즈니스 용어), 원장은 컬럼(물리 데이터) — 정의·버전·계보가 등록돼야 같은 질문에 같은 숫자가 나옵니다',
      };
    }
    const m = (cit?.metrics ?? []).find((x) => x.metric_name);
    if (!m) return null;   // metric evidence 없음 — 미표시
    const left = pickRows(data, 'd6_reward_ledger_src', entities);
    // 우측: 이 답변의 실제 지표 값(세그먼트면 상위 3행)
    const right = pickRows(data, 'metric_value', entities);
    if (!left || !right) return null;   // U26: 정적 자산 skew — 미표시
    const rows: Array<Record<string, string>> = [];
    if (m.data?.length) {
      for (const dpt of m.data.slice(0, 3)) {
        const dim = Object.values(dpt.dimensions ?? {}).join('·');
        rows.push({ metric: m.metric_name!, ...(dim ? { segment: dim } : {}), value: String(dpt.value) });
      }
    } else if (m.value != null) {
      rows.push({ metric: m.metric_name!, value: String(m.value), grain: m.grain ?? '' });
    }
    if (rows.length) right.rows = rows;
    const srcTables = Array.isArray(m.source_tables) ? (m.source_tables as string[]).join('·') : 'd5/d6 원장';
    const ref: AnatomyRef = {
      kind: 'edge',
      source: `U4 metric registry — ${m.metric_name}${m.definition_version ? ` (정의 v${String(m.definition_version).split(':')[0]})` : ''}`,
      display: [`원장(${srcTables})`, '→ 정의된 집계(dbt) →',
        m.definition ? `${m.metric_name} = ${m.definition}` : String(m.metric_name)],
    };
    return {
      key: `metric:lineage:${m.metric_name}`,
      left, right, ref,
      subRefs: [],
      mismatchCaption: '원장의 수백만 행과 답변의 지표 하나 — 정의(시맨틱 레이어) 없이는 같은 질문에 다른 숫자가 나옵니다',
    };
  }

  // 2.7) U24 P2c: txn_rollup — 내부 거래(D4) × 혜택 카테고리 해부.
  //      "우리 고객이 실제로 어디에 쓰나" — 외부 통계를 잇던 그 crosswalk가 내부 거래에도 같은 다리.
  if (intent === 'ontology_map' && acts.has('txn_rollup')) {
    const cit = ann.citation as { ontology?: { rows?: Array<Record<string, unknown>> } } | undefined;
    const rollRows = (cit?.ontology?.rows ?? []).slice(0, 3);
    const left = pickRows(data, 'd4_transaction', entities);
    const right = pickRows(data, 'r1_benefit', entities);
    const ref = refOf(data, 'txn_crosswalk');
    if (!left || !right || !ref) return null;   // U26: 정적 자산 skew — 미표시
    if (rollRows.length) {
      left.rows = rollRows.map((r) => ({
        category: String(r.category ?? ''),
        krw: `${(Number(r.krw ?? 0) / 1e8).toFixed(1)}억`,
        top_age_band: r.top_age_band ? `${r.top_age_band}대` : '',
      }));
    }
    return {
      key: 'txn:rollup',
      left, right, ref,
      subRefs: [],
      mismatchCaption: '거래 명세의 가맹점명과 약관의 혜택 카테고리는 다른 언어 — 외부 통계를 잇던 crosswalk가 내부 거래도 잇습니다',
    };
  }

  // 3) merchant/card 조회 — 가맹점 정규화 (스타벅스 유형)
  if (['merchant_reverse', 'card_benefit_specific', 'card_benefit_all'].includes(intent) && (has('스타벅스') || has('커피'))) {
    const left = pickRows(data, 'r4_merchant_reference', entities);
    const right = pickRows(data, 'seoul_sales', entities);
    const ref = refOf(data, 'merchant_edge');
    if (!left || !right || !ref) return null;   // U26: 정적 자산 skew — 미표시
    const sub = refOf(data, 'crosswalk_coffee');
    return {
      key: 'merchant:normalize',
      left, right, ref,
      subRefs: sub ? [sub] : [],
      mismatchCaption: '상호명(스타벅스)과 업종 통계(커피-음료)는 다른 체계 — 개념 정규화 없이는 못 잇습니다',
    };
  }

  // 4) U19 일반화 → U24 정직화: 온톨로지를 참조한 카드/카테고리 계열 질의만 crosswalk 해부.
  //    감사(U24) 결과 지표/시뮬레이션/포트폴리오 질문까지 "카드혜택×서울매출"로 그려져
  //    유형 불일치 7건 — 이 유형들은 전용 해부(위 4.5/4.6)가 담당하거나 미표시가 정직.
  const GENERIC_OK = ['category_search', 'card_benefit_all', 'card_benefit_specific',
    'merchant_reverse', 'ontology_map', 'card_comparison', 'eligibility'];
  const dynRef2 = dynamicCrosswalkRef(ann);
  const onto2 = ann.ontology ?? (ann.citation as { ontology?: unknown } | undefined)?.ontology as
    { closure_path?: string[] } | undefined;
  const closure2 = onto2?.closure_path ?? [];
  if (GENERIC_OK.includes(intent) && (dynRef2 || closure2.length >= 2)) {
    // U24 P0: 행은 live 우선, 정적은 엄격 매칭만 — 무매칭 폴백(자기모순 카드) 금지.
    // 매칭 신호는 ref의 crosswalk 카테고리 우선(시장 1위 행 오염 차단).
    const refCats2 = crosswalkFromLabels(ann);
    const matchKeys2 = refCats2.length ? refCats2 : entities;
    const tables = marketTables(data, matchKeys2, live,
      matchKeys2.some((e) => e.includes('음식점') || e.includes('외식')));
    if (!tables) return null;   // 질의 카테고리의 행 없음 → 정직하게 미표시
    const ref = dynRef2 ?? {
      kind: 'subsumption' as const,
      source: 'taxonomy.ttl subClassOf (이 답변의 분류 경로)',
      display: [closure2.join(' ⊑ ')],
    };
    return {
      key: `generic:${intent}`,
      left: tables.left, right: tables.right, ref,
      subRefs: closure2.length >= 2 && dynRef2
        ? [{ kind: 'subsumption', source: 'taxonomy.ttl subClassOf', display: [closure2.join(' ⊑ ')] }]
        : [],
      arithmetic: tables.arithmetic,
      mismatchCaption: '이 답변이 참조한 온톨로지 연결 — 서로 다른 체계의 데이터가 이 규칙으로 이어졌습니다',
    };
  }

  return null;   // 온톨로지 참조 없음/행 없음 — "연결 해부 없음" 정직 표기(뷰가 처리)
}

// U19: /api/anatomy 실데이터(카테고리별 실 혜택행·서울행·검산 — 서버 계산). 실패 시 null(정적 폴백).
export interface LiveAnatomy {
  benefit_rows: Array<Record<string, string>>;
  seoul_rows: Array<{ industry: string; amount: string }>;
  crosswalk: { from: string; to: string[]; note?: string } | null;
  arithmetic: AnatomyArithmetic | null;
  merchant_rows: Array<Record<string, string>>;
}
const _liveCache = new Map<string, LiveAnatomy | null>();
export async function fetchLiveAnatomy(category?: string, merchant?: string): Promise<LiveAnatomy | null> {
  const key = `${category ?? ''}|${merchant ?? ''}`;
  if (!category && !merchant) return null;
  if (_liveCache.has(key)) return _liveCache.get(key)!;
  try {
    const qs = new URLSearchParams();
    if (category) qs.set('category', category);
    if (merchant) qs.set('merchant', merchant);
    const res = await fetch(`/api/anatomy?${qs}`);
    const data = res.ok ? await res.json() : null;
    _liveCache.set(key, data);
    return data;
  } catch { _liveCache.set(key, null); return null; }
}

// annotation에서 해부 대상 엔티티(카테고리/가맹점) 추출 — 전 intent 공통
export function anatomyEntities(ann: PlatformAnnotation | undefined): { category?: string; merchant?: string } {
  if (!ann) return {};
  const toks = ann.route_plan?.understood_tokens ?? [];
  const category = toks.find((t) => t.label === '카테고리')?.value
    ?? (ann.ontology?.categories ?? [])[0]?.label
    ?? ((ann.citation as { ontology?: { categories?: Array<{ label?: string }> } } | undefined)?.ontology?.categories ?? [])[0]?.label;
  const merchant = toks.find((t) => t.label === '가맹점')?.value;
  return { category, merchant };
}

let _cache: AnatomyData | null = null;
export async function fetchAnatomyData(): Promise<AnatomyData | null> {
  if (_cache) return _cache;
  try {
    const res = await fetch('/table_anatomy.json');
    if (!res.ok) return null;
    _cache = await res.json();
    return _cache;
  } catch { return null; }
}
