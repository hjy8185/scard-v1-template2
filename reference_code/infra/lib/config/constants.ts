export const PROJECT_PREFIX = 'cg'; // card-graphrag

export const STACK_NAMES = {
  VPC: `${PROJECT_PREFIX}-vpc`,
  DATA: `${PROJECT_PREFIX}-data`,
  EKS: `${PROJECT_PREFIX}-eks`,
  ALB: `${PROJECT_PREFIX}-alb`,
  SECURITY: `${PROJECT_PREFIX}-security`,
  // U1f SMUS Foundation (us-west-2)
  SMUS_VPC: `${PROJECT_PREFIX}-smus-vpc`,
  SMUS_FOUNDATION: `${PROJECT_PREFIX}-smus-foundation`,
  // U1r GraphRAG Replication (us-west-2)
  WEST_DATA: `${PROJECT_PREFIX}-west-data`,
  ECR_REPLICATION: `${PROJECT_PREFIX}-ecr-replication`,
  // U1a Data Lakehouse (us-west-2)
  WEST_LAKEHOUSE: `${PROJECT_PREFIX}-west-lakehouse`,
  // U4 metric cache (us-west-2)
  WEST_CACHE: `${PROJECT_PREFIX}-west-cache`,
} as const;

// U1f SMUS Foundation — 도메인/프로젝트/Lakehouse (us-west-2)
export const SMUS = {
  DOMAIN_NAME: 'card-ai-ready-domain',
  GLUE_DATABASE: 'card_lakehouse',
  // §10.1 프로젝트 6종 (필수 2 + optional 4). card-kb-safe→card-curated-search 개명(Bedrock KB 혼동 방지).
  PROJECTS: [
    { name: 'card-data-engineering', required: true },
    { name: 'card-catalog-stewardship', required: true },
    { name: 'card-risk-analytics', required: false },
    { name: 'card-ai-apps', required: false },
    { name: 'card-curated-search', required: false },
    { name: 'card-bi-consumption', required: false },
  ],
} as const;

export const RESOURCE_NAMES = {
  // Neptune
  NEPTUNE_CLUSTER: `${PROJECT_PREFIX}-neptune`,
  NEPTUNE_SUBNET_GROUP: `${PROJECT_PREFIX}-neptune-subnet`,

  // OpenSearch Serverless
  OPENSEARCH_COLLECTION: 'card-graphrag-vectors',
  OPENSEARCH_INDEX: 'card-nodes',

  // S3
  DATA_BUCKET: `${PROJECT_PREFIX}-data`,

  // EKS
  EKS_CLUSTER: `${PROJECT_PREFIX}-cluster`,
  EKS_NAMESPACE: 'card-graphrag',

  // IRSA Service Accounts
  NEPTUNE_MCP_SA: 'neptune-mcp-sa',
  OPENSEARCH_MCP_SA: 'opensearch-mcp-sa',
  PIPELINE_WORKER_SA: 'pipeline-worker-sa',
  BFF_SA: 'bff-sa',

  // ECR Repositories
  ECR_NEPTUNE_MCP: `${PROJECT_PREFIX}/neptune-mcp-svc`,
  ECR_OPENSEARCH_MCP: `${PROJECT_PREFIX}/opensearch-mcp-svc`,
  ECR_GLOSSARY: `${PROJECT_PREFIX}/glossary-svc`,
  ECR_BFF: `${PROJECT_PREFIX}/bff`,
  ECR_FRONTEND: `${PROJECT_PREFIX}/frontend-app`,
  ECR_PIPELINE_WORKER: `${PROJECT_PREFIX}/pipeline-worker`,

  // ALB / Route 53
  PRIVATE_HOSTED_ZONE: 'card-graphrag.internal',
  MCP_HOSTS: {
    NEPTUNE: 'neptune-mcp.card-graphrag.internal',
    OPENSEARCH: 'opensearch-mcp.card-graphrag.internal',
    GLOSSARY: 'glossary.card-graphrag.internal',
  },
} as const;

export const DEFAULT_TAGS: Record<string, string> = {
  Project: 'CardGraphRAG',
  ManagedBy: 'CDK',
};

export const VECTOR_DIMENSION = 1024; // Bedrock Titan Embed V2
