import { Environment } from 'aws-cdk-lib';

export interface EnvironmentConfig {
  readonly env: Environment;
  readonly vpc: {
    readonly maxAzs: number;
    readonly natGateways: number;
  };
  readonly eks: {
    readonly instanceType: string;
    readonly minSize: number;
    readonly maxSize: number;
    readonly desiredSize: number;
  };
  readonly neptune: {
    readonly minCapacity: number;
    readonly maxCapacity: number;
  };
  readonly corporateCidrs: string[];
  readonly tags: Record<string, string>;
}

export const DEV_ENV: EnvironmentConfig = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },

  vpc: {
    maxAzs: 2,
    natGateways: 1,
  },

  eks: {
    instanceType: 'c8i.xlarge',
    minSize: 2,
    maxSize: 5,
    desiredSize: 3,
  },

  neptune: {
    minCapacity: 2.5,
    maxCapacity: 16,
  },

  // 사내 IP CIDR — Public ALB 접근 제한용 (PoC)
  corporateCidrs: ['10.0.0.0/8'],

  tags: {
    Project: 'CardGraphRAG',
    Environment: 'dev',
    ManagedBy: 'CDK',
  },
};

// U1f SMUS Foundation — us-west-2 (IdC org instance 동리전 필수).
// account/idc는 하드코딩 금지: env·cdk context에서 주입(#10).
export interface SmusEnvConfig {
  readonly env: Environment;
  // IdC instance ARN — env SMUS_IDC_INSTANCE_ARN 또는 cdk context `idcInstanceArn`
  readonly idcInstanceArn?: string;
  readonly tags: Record<string, string>;
}

export const WEST_ENV: SmusEnvConfig = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-west-2',
  },
  idcInstanceArn: process.env.SMUS_IDC_INSTANCE_ARN,
  tags: {
    Project: 'CardAIReadyData',
    Environment: 'dev',
    ManagedBy: 'CDK',
  },
};

// U1r GraphRAG Replication (us-west-2) — cg-smus-vpc 공유. 원본 us-east-1 불변.
export interface WestDataConfig {
  readonly env: Environment;
  readonly vpcId?: string;            // cg-smus-vpc (context/env 주입)
  readonly neptune: { readonly minCapacity: number; readonly maxCapacity: number };
}

export const WEST_DATA_ENV: WestDataConfig = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-west-2',
  },
  // cg-smus-vpc id — env SMUS_VPC_ID 또는 cdk context `smusVpcId`
  vpcId: process.env.SMUS_VPC_ID,
  neptune: { minCapacity: 2.5, maxCapacity: 16 },  // 기존 DEV_ENV와 동일
};

// U1a Data Lakehouse (us-west-2) — SMUS environment 산출물 주입(#3, 하드코딩 금지).
// glueDatabase/warehouseS3는 environment provisionedResources에서 조회한 값을
// env(LAKEHOUSE_GLUE_DATABASE/LAKEHOUSE_WAREHOUSE_S3) 또는 cdk context로 주입.
export interface WestLakehouseConfig {
  readonly env: Environment;
  readonly glueDatabase?: string;
  readonly warehouseS3?: string;
  readonly athenaResultsBucket?: string;
}

export const WEST_LAKEHOUSE_ENV: WestLakehouseConfig = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-west-2',
  },
  glueDatabase: process.env.LAKEHOUSE_GLUE_DATABASE,
  warehouseS3: process.env.LAKEHOUSE_WAREHOUSE_S3,
  athenaResultsBucket: process.env.LAKEHOUSE_ATHENA_RESULTS_BUCKET,
};
