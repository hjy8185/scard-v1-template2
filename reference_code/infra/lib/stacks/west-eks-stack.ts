import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { KubectlV35Layer } from '@aws-cdk/lambda-layer-kubectl-v35';
import { Construct } from 'constructs';

/**
 * U1r — us-west-2 EKS (재적재 Job 실행용). cg-smus-vpc 공유.
 *
 * 재적재(reload_neptune + aoss_index)를 cg-smus-vpc 내부 pod에서 실행 →
 * 프라이빗 Neptune/AOSS 접근 가능. IRSA: pipeline-worker-sa(neptune-db/aoss/bedrock/s3).
 * 원본 us-east-1 EKS(cg-cluster)는 불변.
 */
export interface WestEksStackProps extends cdk.StackProps {
  readonly vpcId: string;
  readonly instanceType: string;
  readonly minSize: number;
  readonly maxSize: number;
  readonly desiredSize: number;
}

export class WestEksStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;

  constructor(scope: Construct, id: string, props: WestEksStackProps) {
    super(scope, id, props);

    const NS = 'card-graphrag';
    const vpc = ec2.Vpc.fromLookup(this, 'SmusVpc', { vpcId: props.vpcId });

    this.cluster = new eks.Cluster(this, 'EksCluster', {
      clusterName: 'cg-cluster-west',
      version: eks.KubernetesVersion.V1_35,
      kubectlLayer: new KubectlV35Layer(this, 'KubectlLayer'),
      vpc,
      vpcSubnets: [{ subnetGroupName: 'AppPrivate' }],
      defaultCapacity: 0,
    });

    this.cluster.addNodegroupCapacity('DefaultNg', {
      instanceTypes: [new ec2.InstanceType(props.instanceType)],
      minSize: props.minSize,
      maxSize: props.maxSize,
      desiredSize: props.desiredSize,
      subnets: { subnetGroupName: 'AppPrivate' },
      // K8s 1.33+는 AL2 미지원 → AL2023 필수
      amiType: eks.NodegroupAmiType.AL2023_X86_64_STANDARD,
    });

    const namespace = this.cluster.addManifest('AppNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: NS },
    });

    // IRSA: pipeline-worker-sa (재적재 워크로드)
    const workerSa = this.cluster.addServiceAccount('PipelineWorkerSA', {
      name: 'pipeline-worker-sa',
      namespace: NS,
    });
    workerSa.node.addDependency(namespace);

    workerSa.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['neptune-db:*'],
      resources: [`arn:aws:neptune-db:${this.region}:${this.account}:*`],
    }));
    workerSa.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['aoss:*'],
      resources: ['*'],   // west collection (ARN은 배포 후 확정 — 데모 범위 account scope)
    }));
    workerSa.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-sonnet-*`,
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2*`,
      ],
    }));
    workerSa.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:ListBucket'],
      resources: [
        `arn:aws:s3:::cg-data-west-${this.account}`,
        `arn:aws:s3:::cg-data-west-${this.account}/*`,
      ],
    }));

    new cdk.CfnOutput(this, 'ClusterName', { value: this.cluster.clusterName });
    new cdk.CfnOutput(this, 'WorkerSaRoleArn', { value: workerSa.role.roleArn });
  }
}
