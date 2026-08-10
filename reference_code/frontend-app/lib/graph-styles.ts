/** 15-node-type styles matching graph_types.py NodeType enum. */

export interface NodeStyle {
  color: string;
  shape: string;
  size: number;
}

export interface EdgeStyle {
  color: string;
  lineStyle: 'solid' | 'dashed';
}

export const NODE_STYLES: Record<string, NodeStyle> = {
  CARD_Product:        { color: '#2563EB', shape: 'ellipse',           size: 50 },
  CARD_BenefitGroup:   { color: '#3B82F6', shape: 'round-rectangle',   size: 30 },
  CARD_Benefit:        { color: '#60A5FA', shape: 'round-rectangle',   size: 30 },
  CARD_Condition:      { color: '#F59E0B', shape: 'diamond',           size: 30 },
  CARD_BenefitLimit:   { color: '#EF4444', shape: 'diamond',           size: 30 },
  CARD_Exclusion:      { color: '#DC2626', shape: 'triangle',          size: 30 },
  CARD_SpendTier:      { color: '#8B5CF6', shape: 'hexagon',           size: 30 },
  CARD_SpendExclusion: { color: '#7C3AED', shape: 'triangle',          size: 30 },
  CARD_AnnualFee:      { color: '#10B981', shape: 'diamond',           size: 30 },
  CARD_GiftOption:     { color: '#EC4899', shape: 'round-rectangle',   size: 25 },
  CARD_AddonService:   { color: '#6366F1', shape: 'round-rectangle',   size: 25 },
  CARD_Notice:         { color: '#9CA3AF', shape: 'round-rectangle',   size: 25 },
  CARD_Family:         { color: '#14B8A6', shape: 'round-rectangle',   size: 25 },
  MERCHANT:            { color: '#F97316', shape: 'ellipse',           size: 30 },
  CATEGORY:            { color: '#FB923C', shape: 'hexagon',           size: 30 },
};

const CONSTRAINT_EDGES = new Set([
  'HAS_CONDITION', 'HAS_LIMIT', 'HAS_EXCLUSION', 'HAS_SPEND_EXCLUSION',
]);

export const EDGE_TYPES = [
  'HAS_FEE', 'HAS_BENEFIT_GROUP', 'HAS_BENEFIT', 'APPLIES_TO',
  'HAS_CONDITION', 'HAS_LIMIT', 'HAS_EXCLUSION', 'HAS_SPEND_TIER',
  'HAS_SPEND_EXCLUSION', 'HAS_GIFT_OPTION', 'HAS_ADDON', 'HAS_NOTICE',
  'BELONGS_TO', 'BELONGS_TO_CATEGORY',
] as const;

export function getNodeStyle(nodeType: string): NodeStyle {
  return NODE_STYLES[nodeType] ?? { color: '#9CA3AF', shape: 'ellipse', size: 25 };
}

export function getEdgeStyle(edgeType: string): EdgeStyle {
  const isConstraint = CONSTRAINT_EDGES.has(edgeType);
  return {
    color: isConstraint ? '#EF4444' : '#93C5FD',
    lineStyle: isConstraint ? 'dashed' : 'solid',
  };
}
