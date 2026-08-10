// ============================================================
// Onedata AI Agent - TypeScript Type Definitions
// ============================================================

// SSE Event from Backend
export type SSEEventType = 'intent' | 'context' | 'sql' | 'sql_generate' | 'execute' | 'execution' | 'answer' | 'done' | 'error';
export type SSEStatus = 'active' | 'done' | 'error';

export interface SSEEvent {
  event_type: SSEEventType;
  status: SSEStatus;
  data?: Record<string, unknown>;
  ms?: number;
}

// Reasoning Trace Steps
export interface ReasoningStep {
  id: SSEEventType;
  label: string;
  labelKo: string;
  status: 'pending' | 'active' | 'done' | 'error';
  data?: Record<string, unknown>;
  durationMs?: number;
  startedAt?: number;
}

// Chat Message
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  reasoning?: ReasoningStep[];
  sql?: string;
  queryResults?: QueryResult;
  error?: string;
}

// SQL Query Result
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionMs?: number;
}

// Ontology Graph Types
export interface OntologyNode {
  id: string;
  label: string;
  type: 'table' | 'column' | 'entity' | 'relationship';
  properties?: Record<string, unknown>;
  x?: number;
  y?: number;
}

export interface OntologyEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: 'has_column' | 'references' | 'belongs_to' | 'derived_from';
}

export interface OntologyGraph {
  nodes: OntologyNode[];
  edges: OntologyEdge[];
}

// Table Anatomy (for visualization)
export interface TableAnatomy {
  name: string;
  schema: string;
  columns: TableColumn[];
  relationships: TableRelationship[];
}

export interface TableColumn {
  name: string;
  type: string;
  description?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  nullable?: boolean;
}

export interface TableRelationship {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  joinColumn: string;
}

// Data Lineage
export interface LineageNode {
  id: string;
  name: string;
  type: 'source' | 'transform' | 'target';
  description?: string;
}

export interface LineageEdge {
  from: string;
  to: string;
  transformType?: string;
}

export interface DataLineage {
  nodes: LineageNode[];
  edges: LineageEdge[];
}

// App State
export interface AppState {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeMessageId: string | null;
  selectedMessage: ChatMessage | null;
  detailView: 'reasoning' | 'sql' | 'results' | 'ontology' | 'lineage';
}
