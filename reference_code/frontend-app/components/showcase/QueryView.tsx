'use client';

// U47 — 실행한 쿼리 뷰: 이 답변이 실제로 어떤 Gremlin/SQL/지표 질의를 돌렸는지.
//
// 데모 논지("LLM이 raw 쿼리를 짓지 않는다 — 승인된 템플릿에서 서버가 렌더한다")는
// 실행 쿼리를 보여줘야 증명된다. 그래서 각 카드는 3층으로 읽힌다:
//   ① 무엇을 했나(관람객 언어 purpose) — 기술 지식 없이 이해
//   ② 어디서·얼마나(엔진 · 소요시간 · 행수) — 실제로 돌았다는 증거
//   ③ 쿼리 원문(기본 접힘) + 승인 템플릿 출처 + 바인딩 값 — 개발자용 심층
// 쿼리 텍스트는 서버가 준 원문 그대로 렌더한다(프론트 재구성·정규화 금지).
import { useMemo, useState } from 'react';
import type { ExecutedQuery, PlatformAnnotation } from '@/lib/types';

/** 엔진별 강조색 — 자산 지도의 진영색 체계와 맞춘다(약관=jade, 시장=aqua, 합성=amber). */
const ENGINE_STYLE: Record<string, { color: string; icon: string }> = {
  Neptune: { color: 'var(--jade)', icon: '◈' },          // 그래프
  Athena: { color: 'var(--amber)', icon: '▤' },           // 정형 SQL
  OpenSearch: { color: 'var(--aqua)', icon: '⌕' },        // 문서 검색
};
const METRIC_STYLE = { color: 'var(--flow-solid)', icon: '📐' };  // 시맨틱 레이어

function styleOf(q: ExecutedQuery) {
  if (q.language === 'metric') return METRIC_STYLE;
  return ENGINE_STYLE[q.engine] ?? { color: 'var(--slate)', icon: '·' };
}

const LANG_LABEL: Record<string, string> = {
  gremlin: 'Gremlin', sql: 'SQL', metric: '지표 질의', search: '검색 질의',
};

/** 파라미터 값 표시 — 길면 자른다(카드 폭 보호). */
function paramText(v: unknown): string {
  const s = Array.isArray(v) ? v.join(', ') : String(v ?? '');
  return s.length > 48 ? `${s.slice(0, 46)}…` : s;
}

/** Gremlin을 단계(.step)마다 줄바꿈해 읽기 쉽게 — 텍스트는 그대로, 개행만 넣는다.
 *  첫 스텝은 시작점(`g.V(...)`)과 붙여 둔다 — 떼면 첫 줄이 'g' 한 글자만 남아 어색하다. */
export function prettyQuery(q: ExecutedQuery): string {
  if (q.language !== 'gremlin') return q.query;
  return q.query
    .replace(/\.(?=[a-zA-Z_]+\()/g, '\n  .')   // .out( / .path( 앞에서 개행
    .replace(/^g\n\s+\./, 'g.');               // g + 첫 스텝은 한 줄로
}

export function QueryView({ annotation }: { annotation: PlatformAnnotation | undefined }) {
  const queries = useMemo(
    () => ((annotation?.citation as { queries?: ExecutedQuery[] } | undefined)?.queries ?? []),
    [annotation],
  );
  const [open, setOpen] = useState<Set<number>>(new Set());
  const allOpen = queries.length > 0 && open.size === queries.length;

  const toggle = (seq: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(seq)) next.delete(seq); else next.add(seq);
    return next;
  });
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(queries.map((q) => q.seq)));

  if (queries.length === 0) {
    // 정직 표기: market/ontology/chain 답변은 정적 인덱스 조회라 쿼리가 없다(없는 것을 만들지 않는다).
    return (
      <div className="flex h-full items-center justify-center p-6 text-center" data-testid="query-view-empty">
        <p className="max-w-sm leading-relaxed" style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>
          이 답변은 그래프·SQL 쿼리 없이 만들어졌습니다 —
          빌드 시점에 집계해 둔 온톨로지 인덱스를 읽었기 때문입니다.
          <br />
          어떤 데이터를 읽었는지는 <strong style={{ color: 'var(--pearl)' }}>데이터 흐름</strong> 탭에서 볼 수 있어요.
        </p>
      </div>
    );
  }

  const totalMs = queries.reduce((a, q) => a + (q.latency_ms ?? 0), 0);
  const totalRows = queries.reduce((a, q) => a + (q.row_count ?? 0), 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4" data-testid="query-view">
      {/* 헤더 — 무엇을 몇 건 돌렸나 + 모두 펼치기 */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>
          이 답을 만들며 실행한 쿼리{' '}
          <strong style={{ color: 'var(--pearl)' }}>{queries.length}건</strong>
          {totalMs > 0 && <> · 합계 {totalMs.toLocaleString()}ms</>}
          {totalRows > 0 && <> · {totalRows.toLocaleString()}행</>}
          {/* U63c: chain(멀티홉) 조회는 registry 템플릿이 아니라 코드에 고정된 SQL이다
              (template_id 없음). "모든 쿼리가 승인된 템플릿"이라 단정하면 부정확하므로
              구성에 따라 문구를 나눈다 — 어느 쪽이든 'AI가 쿼리문을 짓지 않는다'는 유지. */}
          <div className="mt-0.5" style={{ fontSize: 'var(--fs-fine)' }}>
            {queries.every((q) => q.template_id)
              ? '모든 쿼리는 승인된 템플릿에서 서버가 렌더했습니다 — AI가 쿼리문을 직접 짓지 않습니다.'
              : '쿼리는 승인된 템플릿 또는 코드에 고정된 멀티홉 조회문입니다 — 어느 경우든 AI가 쿼리문을 직접 짓지 않습니다.'}
          </div>
        </div>
        <button onClick={toggleAll}
          className="min-h-11 shrink-0 rounded-[var(--r-pill)] px-3"
          style={{ background: 'var(--ink-700)', color: 'var(--mist)', fontSize: 'var(--fs-meta)' }}
          data-testid="query-toggle-all">
          {allOpen ? '모두 접기' : '모두 펼치기'}
        </button>
      </div>

      <ol className="space-y-2">
        {queries.map((q) => {
          const st = styleOf(q);
          const isOpen = open.has(q.seq);
          const failed = q.status === 'error';
          const params = Object.entries(q.params ?? {});
          return (
            <li key={q.seq}>
              <div className="rounded-[var(--r-md)] border-l-[3px] border-y border-r p-3"
                style={{ borderLeftColor: failed ? 'var(--coral)' : st.color,
                         borderTopColor: 'var(--ink-600)', borderRightColor: 'var(--ink-600)',
                         borderBottomColor: 'var(--ink-600)', background: 'var(--ink-800)' }}
                data-testid={`query-card-${q.seq}`}>
                {/* ① 헤더 행: 순서 · 엔진 · 언어 — 오른쪽에 실행 결과 */}
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span style={{ color: st.color, fontWeight: 700, fontSize: 'var(--fs-meta)' }}>
                      {'①②③④⑤⑥⑦⑧⑨'[q.seq - 1] ?? q.seq}
                    </span>
                    <span className="truncate font-medium" style={{ fontSize: 'var(--fs-meta)', color: 'var(--pearl)' }}>
                      <span style={{ color: st.color }}>{st.icon}</span> {q.engine}
                      <span style={{ color: 'var(--mist)' }}> · {LANG_LABEL[q.language] ?? q.language}</span>
                    </span>
                  </div>
                  <div className="shrink-0 tabular-nums" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
                    {q.latency_ms != null && <>{q.latency_ms.toLocaleString()}ms</>}
                    {q.row_count != null && <> · {q.row_count.toLocaleString()}행</>}
                    {failed
                      ? <span style={{ color: 'var(--coral)' }}> · 실패</span>
                      : <span style={{ color: 'var(--jade)' }}> ✓</span>}
                  </div>
                </div>

                {/* ② 무엇을 했나 — 관람객 언어(서버 registry 소유) */}
                {q.purpose && (
                  <div className="mt-1" style={{ fontSize: 'var(--fs-meta)', color: 'var(--pearl)' }}>
                    {q.purpose}
                  </div>
                )}

                {/* ③ 승인 템플릿 출처 */}
                {q.template_id && (
                  <div className="mt-1 font-mono" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}
                    data-testid={`query-template-${q.seq}`}>
                    template: {q.template_id}
                    {q.template_version && <> · {q.template_version}</>}
                  </div>
                )}

                {/* 바인딩된 파라미터 — 질문에서 채워진 값 */}
                {params.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1" data-testid={`query-params-${q.seq}`}>
                    {params.map(([k, v]) => (
                      <span key={k} className="rounded-[var(--r-pill)] px-2 py-0.5 font-mono"
                        style={{ background: 'var(--ink-700)', color: 'var(--mist)', fontSize: 'var(--fs-fine)' }}>
                        <span style={{ color: st.color }}>{k}</span>={paramText(v)}
                      </span>
                    ))}
                  </div>
                )}

                {/* ④ 쿼리 원문 — 기본 접힘(관람객은 요약만, 개발자는 펼쳐서) */}
                <button onClick={() => toggle(q.seq)}
                  className="mt-2 min-h-11 text-left"
                  style={{ fontSize: 'var(--fs-fine)', color: 'var(--aqua)' }}
                  aria-expanded={isOpen}
                  data-testid={`query-toggle-${q.seq}`}>
                  {isOpen ? '▴ 쿼리 접기' : '▾ 쿼리 보기'}
                </button>
                {isOpen && (
                  <pre className="mt-1 overflow-x-auto rounded-[var(--r-md)] p-2.5 leading-relaxed"
                    style={{ background: 'var(--ink-900)', border: '1px solid var(--ink-600)',
                             fontSize: 'var(--fs-fine)', color: 'var(--pearl)' }}
                    data-testid={`query-text-${q.seq}`}>
                    <code>{prettyQuery(q)}</code>
                  </pre>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 leading-relaxed" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
        쿼리 본문은 템플릿에 있고, 질문에서 온 값만 파라미터로 바인딩됩니다 —
        그래서 AI가 접근 범위를 넘는 쿼리를 만들 수 없습니다(읽기 전용 · 행수 상한도 템플릿이 소유).
      </p>
    </div>
  );
}
