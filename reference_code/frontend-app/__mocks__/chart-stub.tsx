// jest 스텁: 시각화 라이브러리(@nivo/*, recharts, @xyflow/react)를 렌더 없는 더미로 대체.
// 이유: ESM 패키지라 jest 변환 부담 + 차트 내부는 단위테스트 대상 아님(데이터 매핑은 BFF build_insights 테스트로 커버).
import React from 'react';

const Stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;

export const ResponsiveContainer = Stub;
export const BarChart = Stub;
export const Bar = Stub;
export const XAxis = Stub;
export const YAxis = Stub;
export const Tooltip = Stub;
export const Cell = Stub;
export const ResponsiveHeatMap = Stub;
export const ResponsiveSunburst = Stub;
export const ReactFlow = Stub;
export const Background = Stub;
export const Handle = Stub;
export const Position = { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' };
export const ReactFlowProvider = Stub;
export const useReactFlow = () => ({ fitView: () => {}, setCenter: () => {} });

export default Stub;
