import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as athena from 'aws-cdk-lib/aws-athena';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * U1a Data Lakehouse (us-west-2) — Glue ETL Job + Athena workgroup + staging S3 + Job role.
 *
 * ⚠️ SMUS environment(Glue DB·warehouse·LF)는 CDK 밖. 이 스택은 참조/주입만 하고 새로 만들지 않음(G5).
 * ⚠️ Glue DQ ruleset은 CDK 아님 — 적재 후 loader가 boto3로 생성/평가(#2).
 * Glue 5.0(SMUS+Lakehouse 지원), --extra-py-files zip 번들(#5), 기본 no-VPC(#7).
 */
export interface WestLakehouseStackProps extends cdk.StackProps {
  /** SMUS Glue DB (environment provisionedResources에서 조회, context/env 주입 #3) */
  readonly glueDatabase: string;
  /** SMUS S3 warehouse (glueOutputUri) */
  readonly warehouseS3: string;
  /** Athena 결과 버킷 이름 (기존 U1f 버킷 재사용) */
  readonly athenaResultsBucket: string;
}

export class WestLakehouseStack extends cdk.Stack {
  public readonly glueJobName: string;
  public readonly jobRole: iam.Role;
  public readonly stagingBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: WestLakehouseStackProps) {
    super(scope, id, props);

    // ---- staging S3 (run_id별 prefix, SSE-S3) ----
    this.stagingBucket = new s3.Bucket(this, 'StagingBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
    });

    // ---- Glue Job script + deps (S3 asset) ----
    // glue_load.py 스크립트 + schema_map 등 로컬 의존은 배포 시 asset으로 업로드.
    const scriptAsset = new s3assets.Asset(this, 'GlueScript', {
      path: path.join(__dirname, '../../../pipeline/lakehouse/glue_load.py'),
    });
    // deps zip(schema_map.py 등)은 배포 파이프라인에서 생성해 --extra-py-files로 주입(#5).
    // context로 이미 만들어둔 zip의 S3 URI를 받거나, 기본 asset 경로 사용.
    const depsZipUri = this.node.tryGetContext('lakehouseDepsZipUri') as string | undefined;

    // ---- Glue Job IAM role ----
    this.jobRole = new iam.Role(this, 'GlueJobRole', {
      roleName: 'cg-lakehouse-load-role',
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      description: 'U1a Lakehouse loader Glue Job role',
    });
    this.jobRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSGlueServiceRole'),
    );
    // staging R/W
    this.stagingBucket.grantReadWrite(this.jobRole);
    scriptAsset.grantRead(this.jobRole);
    // warehouse S3 R/W (SMUS 소유 버킷 — 이름만 참조)
    const warehouseBucketName = props.warehouseS3.replace('s3://', '').split('/')[0];
    this.jobRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
      resources: [
        `arn:aws:s3:::${warehouseBucketName}`,
        `arn:aws:s3:::${warehouseBucketName}/*`,
      ],
    }));
    // Glue catalog(대상 DB) + Lake Formation
    this.jobRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'glue:GetDatabase', 'glue:GetTable', 'glue:GetTables', 'glue:CreateTable',
        'glue:UpdateTable', 'glue:BatchCreatePartition', 'glue:GetPartitions',
        'lakeformation:GetDataAccess',
      ],
      resources: ['*'],
    }));
    // Athena 결과 버킷
    this.jobRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetBucketLocation', 's3:GetObject', 's3:PutObject', 's3:ListBucket'],
      resources: [
        `arn:aws:s3:::${props.athenaResultsBucket}`,
        `arn:aws:s3:::${props.athenaResultsBucket}/*`,
      ],
    }));

    // ---- Glue ETL Job (5.0, Iceberg) ----
    const defaultArgs: Record<string, string> = {
      '--datalake-formats': 'iceberg',
      '--glue_database': props.glueDatabase,
      '--warehouse_s3': props.warehouseS3,
      '--staging_s3': this.stagingBucket.s3UrlForObject(),
      '--job-language': 'python',
      '--enable-metrics': 'true',
      '--enable-continuous-cloudwatch-log': 'true',
    };
    if (depsZipUri) {
      defaultArgs['--extra-py-files'] = depsZipUri;
    }

    const job = new glue.CfnJob(this, 'LakehouseLoadJob', {
      name: 'cg-lakehouse-load',
      role: this.jobRole.roleArn,
      glueVersion: '5.0',
      command: {
        name: 'glueetl',
        pythonVersion: '3',
        scriptLocation: scriptAsset.s3ObjectUrl,
      },
      defaultArguments: defaultArgs,
      numberOfWorkers: 4,
      workerType: 'G.1X',
      executionProperty: { maxConcurrentRuns: 1 },
    });
    this.glueJobName = job.name!;

    // ---- Athena workgroup (FK/분포 gate + smoke) ----
    new athena.CfnWorkGroup(this, 'LakehouseWorkgroup', {
      name: 'cg-lakehouse-wg',
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${props.athenaResultsBucket}/lakehouse-wg/`,
        },
        enforceWorkGroupConfiguration: true,
        publishCloudWatchMetricsEnabled: true,
      },
    });

    // ---- Outputs ----
    new cdk.CfnOutput(this, 'GlueJobNameOut', { value: this.glueJobName });
    new cdk.CfnOutput(this, 'JobRoleArnOut', { value: this.jobRole.roleArn });
    new cdk.CfnOutput(this, 'StagingBucketOut', { value: this.stagingBucket.bucketName });
    new cdk.CfnOutput(this, 'ScriptLocationOut', { value: scriptAsset.s3ObjectUrl });
  }
}
