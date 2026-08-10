'use client';

// U6 Step 12 — ① Orchestration: RoutePlan steps + AuditTree
import type { RoutePlanView as RoutePlan, AuditSummary } from '@/lib/types';

const STATUS_COLOR: Record<string, string> = {
  ok: 'var(--jade)', done: 'var(--jade)', active: 'var(--aqua)',
  error: 'var(--coral)', skip: 'var(--slate)',
};

export function RoutePlanView({ plan, audit }: { plan?: RoutePlan | null; audit?: AuditSummary }) {
  if (!plan && !audit) {
    return <EmptyPanel label="이 답변은 오케스트레이션 정보가 없습니다." />;
  }
  return (
    <div className="space-y-4 text-sm" data-testid="routeplan-view">
      {plan && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Chip label={`intent: ${plan.intent}`} />
            <Chip label={`planner: ${plan.planner}`} />
            {plan.normalized_query_hash && (
              <span className="font-mono text-[13px]" style={{ color: 'var(--mist)' }}>
                #{plan.normalized_query_hash.slice(0, 10)}
              </span>
            )}
          </div>
          <ol className="space-y-2">
            {plan.steps?.map((s) => (
              <li
                key={s.step_id}
                data-testid={`route-step-${s.step_id}`}
                className="rounded-[var(--r-md)] border p-3"
                style={{ borderColor: 'var(--ink-600)', background: 'var(--ink-700)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    <span className="font-mono text-[13px]" style={{ color: 'var(--mist)' }}>{s.step_id}</span>
                    {'  '}{s.tool}
                    {s.template_id && <span className="font-mono text-[13px]" style={{ color: 'var(--aqua)' }}> · {s.template_id}</span>}
                  </span>
                  <span className="text-[13px]" style={{ color: STATUS_COLOR[s.status ?? 'done'] ?? 'var(--mist)' }}>
                    ● {s.status ?? 'done'}{s.required ? '' : ' (opt)'}
                  </span>
                </div>
                {s.depends_on?.length > 0 && (
                  <div className="mt-1 text-[13px]" style={{ color: 'var(--mist)' }}>
                    ← depends: {s.depends_on.join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {audit && (
        <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: 'var(--ink-600)' }}>
          <div className="mb-1 text-[13px] font-medium" style={{ color: 'var(--mist)' }}>AUDIT</div>
          <div className="font-mono text-[13px] leading-relaxed" style={{ color: 'var(--pearl)' }}>
            <div>request_id: {audit.request_id}</div>
            <div>└ route_id: {audit.route_id}</div>
            <div className="pl-4">planner: {audit.planner_version}</div>
            <div className="pl-4">tool_calls: {audit.tool_calls ?? 0} · errors: {audit.errors ?? 0}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span
      className="rounded-[var(--r-pill)] px-2.5 py-1 text-[13px]"
      style={{ background: 'var(--ink-600)', color: 'var(--pearl)' }}
    >
      {label}
    </span>
  );
}

export function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm" style={{ color: 'var(--mist)' }}>
      {label}
    </div>
  );
}
