'use client';

// U13 P3: Insight 카드 목록. 순수 props(annotation.insights[]). 완료 후 일괄 렌더(R3, I2).
// 없으면 렌더 안 함(I1). 읽기 전용(I4). 등급색 보존(I3).

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { ResponsiveSunburst } from '@nivo/sunburst';
import type { InsightCard, AssetGrade } from '@/lib/types';

const GRADE_COLOR: Record<AssetGrade, string> = {
  '공개-실': '#2BE8A5', '집계': '#38C7E0', '합성': '#F5B544', '추정': '#FF6B6B',
};

function CardShell({ title, grade, children }: { title: string; grade: AssetGrade; children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-[var(--r-md)] p-2.5" style={{ background: 'var(--ink-800)', border: '1px solid var(--ink-600)' }}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--pearl)' }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: GRADE_COLOR[grade] }} />
        {title}
      </div>
      <div style={{ height: 180 }}>{children}</div>
    </div>
  );
}

// 억원 값 → 사람이 읽는 축약(15만억 → "15.1조", 2800억 → "2,800억")
function fmtEok(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}조`;
  return `${Math.round(v).toLocaleString()}억`;
}

function BarInsight({ card }: { card: InsightCard }) {
  const data = card.series as Array<{ name: string; value: number; unit?: string }>;
  const color = GRADE_COLOR[card.grade];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
        <XAxis type="number" tick={{ fill: '#8CA3AD', fontSize: 12 }} tickFormatter={fmtEok} />
        <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#8CA3AD', fontSize: 12 }} />
        <Tooltip contentStyle={{ background: '#0C1319', border: '1px solid #1B2A33', fontSize: 12 }}
          formatter={(v) => [fmtEok(Number(v)) + '원', '매출']} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => <Cell key={i} fill={color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function HeatmapInsight({ card }: { card: InsightCard }) {
  // series: {row, col, value}[] → nivo heatmap 포맷
  const rows = card.series as Array<{ row: string; col: string; value: number }>;
  const byRow = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (!byRow.has(r.row)) byRow.set(r.row, {});
    byRow.get(r.row)![r.col] = r.value;
  }
  const data = [...byRow.entries()].map(([id, cols]) => ({
    id, data: Object.entries(cols).map(([x, y]) => ({ x, y })),
  }));
  return (
    <ResponsiveHeatMap data={data} margin={{ top: 20, right: 20, bottom: 20, left: 70 }}
      colors={{ type: 'sequential', scheme: 'blues' }}
      theme={{ text: { fill: '#8CA3AD', fontSize: 12 }, tooltip: { container: { background: '#0C1319', fontSize: 12 } } }}
      emptyColor="#121D24" enableLabels={false} />
  );
}

function SunburstInsight({ card }: { card: InsightCard }) {
  // series: {id, parentId, label}[] → nivo 계층. 단순 변환(children 트리).
  const flat = card.series as Array<{ id: string; parentId?: string; label: string }>;
  type Tree = { name: string; loc?: number; children?: Tree[] };
  const build = (pid?: string): Tree[] =>
    flat.filter((n) => n.parentId === pid).map((n) => {
      const children = build(n.id);
      return children.length ? { name: n.label, children } : { name: n.label, loc: 1 };
    });
  const roots = build(undefined);
  const data: Tree = roots.length === 1 ? roots[0] : { name: '카테고리', children: roots };
  return (
    <ResponsiveSunburst data={data as never} id="name" value="loc"
      cornerRadius={2} borderColor="#0C1319"
      colors={['#2BE8A5', '#38C7E0', '#F5B544', '#5C7080']}
      theme={{ text: { fill: '#EAF4F2', fontSize: 12 }, tooltip: { container: { background: '#0C1319', fontSize: 12 } } }} />
  );
}

function CompareInsight({ card }: { card: InsightCard }) {
  // series: {axis, left:{label,value,grade}, right:{label,value,grade}}[]
  const rows = card.series as Array<{
    axis: string;
    left: { label: string; value: number; grade: AssetGrade };
    right: { label: string; value: number; grade: AssetGrade };
  }>;
  if (!rows.length) return null;
  const data = rows.map((r) => ({ axis: r.axis, left: r.left.value, right: r.right.value }));
  const leftColor = GRADE_COLOR[rows[0].left.grade];
  const rightColor = GRADE_COLOR[rows[0].right.grade];
  // U22 B1: 시장(억원)과 지표(%)처럼 단위·스케일이 다른 시리즈 → 이중 Y축(한 축이면 작은 쪽이 안 보임)
  const maxL = Math.max(...data.map((d) => d.left));
  const maxR = Math.max(...data.map((d) => d.right));
  const dual = maxL > 0 && maxR > 0 && (maxL / maxR > 50 || maxR / maxL > 50);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
        <XAxis dataKey="axis" tick={{ fill: '#8CA3AD', fontSize: 12 }} />
        <YAxis yAxisId="l" tick={{ fill: leftColor, fontSize: 12 }} tickFormatter={maxL >= 10000 ? fmtEok : undefined} />
        {dual && <YAxis yAxisId="r" orientation="right" tick={{ fill: rightColor, fontSize: 12 }} />}
        <Tooltip contentStyle={{ background: '#0C1319', border: '1px solid #1B2A33', fontSize: 12 }} />
        <Bar yAxisId="l" dataKey="left" fill={leftColor} name={rows[0].left.label} radius={[3, 3, 0, 0]} />
        <Bar yAxisId={dual ? 'r' : 'l'} dataKey="right" fill={rightColor} name={rows[0].right.label} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function InsightCardView({ card }: { card: InsightCard }) {
  return (
    <CardShell title={card.title} grade={card.grade}>
      {card.kind === 'bar' && <BarInsight card={card} />}
      {card.kind === 'heatmap' && <HeatmapInsight card={card} />}
      {card.kind === 'sunburst' && <SunburstInsight card={card} />}
      {card.kind === 'compare' && <CompareInsight card={card} />}
    </CardShell>
  );
}

export function InsightCardList({ insights }: { insights?: InsightCard[] }) {
  if (!insights || insights.length === 0) return null;
  return <>{insights.map((c, i) => <InsightCardView key={i} card={c} />)}</>;
}
