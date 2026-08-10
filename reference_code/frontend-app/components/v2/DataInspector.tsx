'use client';

// U38 — 데이터 인스펙터: "무엇을 썼고 어떻게 관리되나"(계획 v2 §3.4).
// master(자산 목록) → detail(선택 자산 상세). 답변 없으면 전체 자산 지도(기존 유지).
// 사용 행/예시 행 구분·미제공 명시 — DataAssetEvidence 계약(Stage 0) 소비.
import { useMemo, useState } from 'react';
import type { PlatformAnnotation } from '@/lib/types';
import { buildAssetEvidence, type DataAssetEvidence, type SourceKind } from '@/lib/asset-evidence';
import { AssetMap } from '@/components/graph/AssetMap';
import { IDLE_LIGHTING } from '@/lib/asset-map';
import { KpiStrip } from '@/components/showcase/KpiStrip';

// U41fix(#185): ReactFlow props 참조 안정화
const EMPTY_BADGES = new Map();
const NOOP = () => {};

const KIND_LABEL: Record<SourceKind, { text: string; color: string }> = {
  'public-real': { text: '공개 실데이터', color: 'var(--jade)' },
  aggregate: { text: '공개 집계', color: 'var(--aqua)' },
  synthetic: { text: '합성', color: 'var(--amber)' },
  estimated: { text: '추정', color: 'var(--coral)' },
  unknown: { text: '미확인', color: 'var(--slate)' },
};

export function DataInspector({ annotation }: { annotation: PlatformAnnotation | undefined }) {
  const assets = useMemo(() => buildAssetEvidence(annotation), [annotation]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);

  // 답변 전 or 전체 보기: 기존 자산 지도 + KPI (제거 0 — 기존 정보 보존)
  if (!annotation || showMap) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="v2-data-map">
        <KpiStrip highlighted={new Set()} />
        {annotation && (
          <button onClick={() => setShowMap(false)} className="min-h-11 shrink-0 px-3 text-left"
            style={{ fontSize: 'var(--fs-meta)', color: 'var(--flow-solid)' }}>
            ← 이 답변이 사용한 자산으로
          </button>
        )}
        <div className="min-h-0 flex-1">
          <AssetMap lighting={IDLE_LIGHTING} badges={EMPTY_BADGES} selectedBridge={null}
            onNodeClick={NOOP} onBridgeClick={NOOP} />
        </div>
      </div>
    );
  }

  const sel = assets.find((a) => a.assetId === selected) ?? null;
  const kinds = [...new Set(assets.map((a) => a.source.sourceKind))];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" data-testid="v2-data">
      {/* 상단 요약 */}
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 'var(--fs-meta)' }}>
          이 답변이 사용한 자산 <strong style={{ color: 'var(--jade)', fontSize: 'var(--fs-body)' }}>{assets.length}종</strong>
          {' · '}
          {kinds.map((k) => (
            <span key={k} className="mr-1" style={{ color: KIND_LABEL[k].color }}>{KIND_LABEL[k].text}</span>
          ))}
        </span>
        <button onClick={() => setShowMap(true)} className="min-h-11 shrink-0 px-2"
          style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }} data-testid="v2-data-showmap">
          전체 자산 지도 →
        </button>
      </div>

      {/* master: 자산 목록 */}
      <ul className="space-y-1.5">
        {assets.map((a) => {
          const kind = KIND_LABEL[a.source.sourceKind];
          const active = selected === a.assetId;
          return (
            <li key={a.assetId}>
              <button onClick={() => setSelected(active ? null : a.assetId)}
                className="w-full rounded-[var(--r-md)] border p-3 text-left"
                style={{ borderColor: active ? 'var(--flow-solid)' : 'var(--ink-600)', background: 'var(--ink-800)' }}
                data-testid={`v2-asset-${a.assetId}`} aria-expanded={active}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium" style={{ fontSize: 'var(--fs-body)' }}>
                    {a.displayName}
                  </span>
                  <span className="shrink-0 rounded-[var(--r-pill)] px-2 py-0.5"
                    style={{ background: 'var(--ink-600)', color: kind.color, fontSize: 'var(--fs-fine)' }}>
                    {kind.text}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3" style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>
                  <span>{a.roleInAnswer}</span>
                  {a.scale?.displayText && <span>{a.scale.displayText}</span>}
                  <span>{a.freshness?.asOf ?? 'as_of 미제공'}</span>
                </div>

                {/* detail: 선택 시 펼침 */}
                {active && (
                  <div className="mt-2 space-y-2 border-t pt-2" style={{ borderColor: 'var(--ink-600)' }}>
                    {a.source.provider && (
                      <div style={{ fontSize: 'var(--fs-meta)' }}>
                        출처: <span style={{ color: 'var(--pearl)' }}>{a.source.provider}</span>
                        {a.source.processing && <span style={{ color: 'var(--mist)' }}> · {a.source.processing === 'raw' ? '원천' : '집계'}</span>}
                      </div>
                    )}
                    {a.sampleRows?.length ? (
                      <div>
                        <div style={{ fontSize: 'var(--fs-fine)', color: a.sampleKind === 'used-in-answer' ? 'var(--jade)' : 'var(--mist)' }}>
                          {a.sampleKind === 'used-in-answer' ? '✓ 답변에 실제 사용된 행' : '대표 예시 행'}
                        </div>
                        <div className="mt-1 overflow-x-auto rounded-[var(--r-md)] p-2 font-mono"
                          style={{ background: 'var(--ink-900)', fontSize: 'var(--fs-fine)' }}>
                          {a.sampleRows.map((r, i) => (
                            <div key={i} className="truncate" style={{ color: 'var(--pearl)' }}>
                              {Object.entries(r).slice(0, 4).map(([k, v]) => `${k}=${String(v)}`).join(' · ')}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 'var(--fs-fine)', color: 'var(--slate)' }}>샘플 행: 이 응답에는 미제공</div>
                    )}
                    {a.governance?.note && (
                      <div style={{ fontSize: 'var(--fs-fine)', color: 'var(--mist)' }}>{a.governance.note}</div>
                    )}
                    {a.unavailable.length > 0 && (
                      <div style={{ fontSize: 'var(--fs-fine)', color: 'var(--slate)' }}>
                        미제공: {a.unavailable.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {sel === null && assets.length === 0 && (
        <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--mist)' }}>이 답변에는 자산 증거가 없습니다.</p>
      )}
    </div>
  );
}
