#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/stacks/vpc-stack';
import { DataStack } from '../lib/stacks/data-stack';
import { EksStack } from '../lib/stacks/eks-stack';
import { AlbStack } from '../lib/stacks/alb-stack';
import { SecurityStack } from '../lib/stacks/security-stack';
import { SmusVpcStack } from '../lib/stacks/smus-vpc-stack';
import { SmusFoundationStack } from '../lib/stacks/smus-foundation-stack';
import { WestDataStack } from '../lib/stacks/west-data-stack';
import { WestEksStack } from '../lib/stacks/west-eks-stack';
import { WestLakehouseStack } from '../lib/stacks/west-lakehouse-stack';
import { WestCacheStack } from '../lib/stacks/west-cache-stack';
import { EcrReplicationStack } from '../lib/stacks/ecr-replication-stack';
import { STACK_NAMES, DEFAULT_TAGS } from '../lib/config/constants';
import { DEV_ENV, WEST_ENV, WEST_DATA_ENV, WEST_LAKEHOUSE_ENV } from '../lib/config/environments';

const app = new cdk.App();

// Global tags
for (const [key, value] of Object.entries({ ...DEFAULT_TAGS, ...DEV_ENV.tags })) {
  cdk.Tags.of(app).add(key, value);
}

// =========================================
// Stack 1: VPC (Foundation)
// =========================================
const vpcStack = new VpcStack(app, STACK_NAMES.VPC, {
  env: DEV_ENV.env,
  maxAzs: DEV_ENV.vpc.maxAzs,
  natGateways: DEV_ENV.vpc.natGateways,
  corporateCidrs: DEV_ENV.corporateCidrs,
});

// =========================================
// Stack 2: Data (Neptune + AOSS + S3)
// Depends on: VPC
// =========================================
const dataStack = new DataStack(app, STACK_NAMES.DATA, {
  env: DEV_ENV.env,
  vpc: vpcStack.vpc,
  neptuneSecurityGroup: vpcStack.neptuneSecurityGroup,
  opensearchSecurityGroup: vpcStack.opensearchSecurityGroup,
  neptuneMinCapacity: DEV_ENV.neptune.minCapacity,
  neptuneMaxCapacity: DEV_ENV.neptune.maxCapacity,
  ossVpcEndpointId: app.node.tryGetContext('ossVpcEndpointId'),
});
dataStack.addDependency(vpcStack);

// =========================================
// Stack 3: EKS (Cluster + IRSA + ConfigMap + ECR)
// Depends on: VPC, Data
// =========================================
const eksStack = new EksStack(app, STACK_NAMES.EKS, {
  env: DEV_ENV.env,
  vpc: vpcStack.vpc,
  eksSecurityGroup: vpcStack.eksSecurityGroup,
  neptuneSecurityGroup: vpcStack.neptuneSecurityGroup,
  opensearchSecurityGroup: vpcStack.opensearchSecurityGroup,

  neptuneClusterEndpoint: dataStack.neptuneClusterEndpoint,
  neptuneClusterPort: dataStack.neptuneClusterPort,
  opensearchCollectionArn: dataStack.opensearchCollectionArn,
  opensearchCollectionEndpoint: dataStack.opensearchCollectionEndpoint,
  dataBucket: dataStack.dataBucket,

  instanceType: DEV_ENV.eks.instanceType,
  minSize: DEV_ENV.eks.minSize,
  maxSize: DEV_ENV.eks.maxSize,
  desiredSize: DEV_ENV.eks.desiredSize,
});
eksStack.addDependency(vpcStack);
eksStack.addDependency(dataStack);

// =========================================
// Stack 4: ALB (Internal MCP + Public Frontend)
// Depends on: VPC, EKS
// =========================================
const albStack = new AlbStack(app, STACK_NAMES.ALB, {
  env: DEV_ENV.env,
  vpc: vpcStack.vpc,
  cluster: eksStack.cluster,
  albInternalSecurityGroup: vpcStack.albInternalSecurityGroup,
  albPublicSecurityGroup: vpcStack.albPublicSecurityGroup,
});
albStack.addDependency(vpcStack);
albStack.addDependency(eksStack);

// =========================================
// Stack 5: Security (CloudFront HTTPS + ALB SG)
// Depends on: VPC
// Note: ALB DNS는 K8s Ingress Controller가 생성 후 확인.
//   cdk deploy cg-security -c albDnsName=<ALB_DNS>
// =========================================
const securityStack = new SecurityStack(app, STACK_NAMES.SECURITY, {
  env: DEV_ENV.env,
  vpc: vpcStack.vpc,
  albDnsName: app.node.tryGetContext('albDnsName') ?? 'k8s-cardgrap-frontend-2c3e03234a-1247812082.us-east-1.elb.amazonaws.com',
});
securityStack.addDependency(vpcStack);

// =========================================
// Stack 6: SMUS Foundation (us-west-2) — U1f
// 기존 us-east-1 스택과 독립. IdC instance ARN은 env/context 주입(하드코딩 금지).
//   SMUS_IDC_INSTANCE_ARN=<arn> cdk deploy cg-smus-foundation
//   또는 -c idcInstanceArn=<arn>
// =========================================
const smusVpcStack = new SmusVpcStack(app, STACK_NAMES.SMUS_VPC, {
  env: WEST_ENV.env,
});
const smusFoundationStack = new SmusFoundationStack(app, STACK_NAMES.SMUS_FOUNDATION, {
  env: WEST_ENV.env,
  idcInstanceArn: WEST_ENV.idcInstanceArn ?? app.node.tryGetContext('idcInstanceArn'),
  ownerUserProfileId: process.env.SMUS_OWNER_USER_PROFILE_ID ?? app.node.tryGetContext('ownerUserProfileId'),
});
for (const stack of [smusVpcStack, smusFoundationStack]) {
  for (const [key, value] of Object.entries(WEST_ENV.tags)) {
    cdk.Tags.of(stack).add(key, value);
  }
}

// =========================================
// Stack 7: U1r GraphRAG Replication (us-west-2)
// cg-smus-vpc 공유. 원본 us-east-1 불변. vpcId는 env/context 주입(fromLookup).
// =========================================
// vpcId는 concrete여야 함(Vpc.fromLookup Token 불가) → env/context 필수.
// 미주입 시 west-data 스택 스킵(다른 스택 배포엔 영향 없음).
const smusVpcId = process.env.SMUS_VPC_ID ?? app.node.tryGetContext('smusVpcId');
if (smusVpcId) {
  const westDataStack = new WestDataStack(app, STACK_NAMES.WEST_DATA, {
    env: WEST_DATA_ENV.env,
    vpcId: smusVpcId,
    neptuneMinCapacity: WEST_DATA_ENV.neptune.minCapacity,
    neptuneMaxCapacity: WEST_DATA_ENV.neptune.maxCapacity,
  });
  for (const [key, value] of Object.entries(WEST_ENV.tags)) {
    cdk.Tags.of(westDataStack).add(key, value);
  }

  // us-west-2 EKS (재적재 Job 실행). cg-smus-vpc 공유.
  const westEksStack = new WestEksStack(app, `${STACK_NAMES.WEST_DATA}-eks`, {
    env: WEST_DATA_ENV.env,
    vpcId: smusVpcId,
    instanceType: DEV_ENV.eks.instanceType,
    minSize: 1,
    maxSize: 3,
    desiredSize: 2,
  });
  for (const [key, value] of Object.entries(WEST_ENV.tags)) {
    cdk.Tags.of(westEksStack).add(key, value);
  }

  // U4 metric cache — ElastiCache Serverless(Valkey), cg-smus-vpc
  const westCacheStack = new WestCacheStack(app, STACK_NAMES.WEST_CACHE, {
    env: WEST_DATA_ENV.env,
    vpcId: smusVpcId,
  });
  for (const [key, value] of Object.entries(WEST_ENV.tags)) {
    cdk.Tags.of(westCacheStack).add(key, value);
  }
}

// =========================================
// Stack 8: U1a Data Lakehouse (us-west-2)
// SMUS environment 산출물(glueDatabase/warehouseS3)을 주입받아 Glue Job 정의.
// 미주입 시 스킵(다른 스택 배포 무영향). SMUS DB/warehouse는 CDK가 생성 안 함(G5).
//   LAKEHOUSE_GLUE_DATABASE=<db> LAKEHOUSE_WAREHOUSE_S3=<s3://..> \
//   LAKEHOUSE_ATHENA_RESULTS_BUCKET=<bkt> cdk deploy cg-west-lakehouse
// =========================================
const lakehouseGlueDb = WEST_LAKEHOUSE_ENV.glueDatabase ?? app.node.tryGetContext('lakehouseGlueDatabase');
const lakehouseWarehouse = WEST_LAKEHOUSE_ENV.warehouseS3 ?? app.node.tryGetContext('lakehouseWarehouseS3');
const lakehouseAthenaBucket = WEST_LAKEHOUSE_ENV.athenaResultsBucket
  ?? app.node.tryGetContext('lakehouseAthenaResultsBucket')
  ?? `aws-athena-query-results-${process.env.CDK_DEFAULT_ACCOUNT}-us-west-2`;
if (lakehouseGlueDb && lakehouseWarehouse) {
  const westLakehouseStack = new WestLakehouseStack(app, STACK_NAMES.WEST_LAKEHOUSE, {
    env: WEST_LAKEHOUSE_ENV.env,
    glueDatabase: lakehouseGlueDb,
    warehouseS3: lakehouseWarehouse,
    athenaResultsBucket: lakehouseAthenaBucket,
  });
  for (const [key, value] of Object.entries(WEST_ENV.tags)) {
    cdk.Tags.of(westLakehouseStack).add(key, value);
  }
}

// ECR cross-region replication — us-east-1 registry에 배포(소스 리전 설정)
const ecrReplicationStack = new EcrReplicationStack(app, STACK_NAMES.ECR_REPLICATION, {
  env: DEV_ENV.env,   // us-east-1 (소스 registry)
  destinationRegion: 'us-west-2',
  repositoryPrefix: 'cg',
});
ecrReplicationStack;

// AgentCore 설정은 Unit 5 (Agent 배포)에서 CLI/SDK로 수행합니다.
// - AgentCore Runtime 생성
// - VPC 연결 (Option C: Outbound VPC 또는 Option B: NLB+PrivateLink)
// - MCP Tool 등록 (neptune/opensearch/glossary 엔드포인트)

app.synth();
