import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { KubectlV33Layer } from '@aws-cdk/lambda-layer-kubectl-v33';
import { Construct } from 'constructs';
import { RESOURCE_NAMES } from '../config/constants';

export interface EksStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  readonly eksSecurityGroup: ec2.ISecurityGroup;
  readonly neptuneSecurityGroup: ec2.ISecurityGroup;
  readonly opensearchSecurityGroup: ec2.ISecurityGroup;

  // Data Stack resources
  readonly neptuneClusterEndpoint: string;
  readonly neptuneClusterPort: string;
  readonly opensearchCollectionArn: string;
  readonly opensearchCollectionEndpoint: string;
  readonly dataBucket: s3.IBucket;

  // EKS node config
  readonly instanceType: string;
  readonly minSize: number;
  readonly maxSize: number;
  readonly desiredSize: number;
}

export class EksStack extends cdk.Stack {
  public readonly cluster: eks.Cluster;
  public readonly neptuneMcpSa: eks.ServiceAccount;
  public readonly opensearchMcpSa: eks.ServiceAccount;
  public readonly pipelineWorkerSa: eks.ServiceAccount;
  public readonly bffSa: eks.ServiceAccount;

  constructor(scope: Construct, id: string, props: EksStackProps) {
    super(scope, id, props);

    // =========================================
    // ECR Repositories (6종)
    // =========================================

    const ecrRepos = [
      RESOURCE_NAMES.ECR_NEPTUNE_MCP,
      RESOURCE_NAMES.ECR_OPENSEARCH_MCP,
      RESOURCE_NAMES.ECR_GLOSSARY,
      RESOURCE_NAMES.ECR_BFF,
      RESOURCE_NAMES.ECR_FRONTEND,
      RESOURCE_NAMES.ECR_PIPELINE_WORKER,
    ];

    for (const repoName of ecrRepos) {
      new ecr.Repository(this, repoName.replace(/\//g, '-'), {
        repositoryName: repoName,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: true,
      });
    }

    // =========================================
    // EKS Cluster
    // =========================================

    // Masters role — allows admin kubectl access from outside CDK
    const mastersRole = iam.Role.fromRoleName(this, 'MastersRole', 'ClaudeCodeTelegramEC2Role');

    this.cluster = new eks.Cluster(this, 'EksCluster', {
      clusterName: RESOURCE_NAMES.EKS_CLUSTER,
      version: eks.KubernetesVersion.V1_33,
      kubectlLayer: new KubectlV33Layer(this, 'KubectlLayer'),
      vpc: props.vpc,
      vpcSubnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
      securityGroup: props.eksSecurityGroup,
      defaultCapacity: 0,
      endpointAccess: eks.EndpointAccess.PUBLIC_AND_PRIVATE,
      authenticationMode: eks.AuthenticationMode.API,
      mastersRole,
      albController: {
        version: eks.AlbControllerVersion.V2_8_2,
      },
    });

    // Allow EKS cluster SG → Neptune/OpenSearch (avoid circular cross-stack dep)
    const clusterSgId = this.cluster.clusterSecurityGroup.securityGroupId;
    new ec2.CfnSecurityGroupIngress(this, 'NeptuneFromClusterSg', {
      groupId: props.neptuneSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 8182,
      toPort: 8182,
      sourceSecurityGroupId: clusterSgId,
      description: 'Allow Neptune access from EKS cluster SG',
    });
    new ec2.CfnSecurityGroupIngress(this, 'OpenSearchFromClusterSg', {
      groupId: props.opensearchSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 443,
      toPort: 443,
      sourceSecurityGroupId: clusterSgId,
      description: 'Allow OpenSearch access from EKS cluster SG',
    });

    // Managed Node Group
    this.cluster.addNodegroupCapacity('WorkerNodes', {
      instanceTypes: [new ec2.InstanceType(props.instanceType)],
      minSize: props.minSize,
      maxSize: props.maxSize,
      desiredSize: props.desiredSize,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      amiType: eks.NodegroupAmiType.AL2023_X86_64_STANDARD,
    });

    // =========================================
    // Namespace
    // =========================================

    const namespace = this.cluster.addManifest('AppNamespace', {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: RESOURCE_NAMES.EKS_NAMESPACE },
    });

    // =========================================
    // IRSA: neptune-mcp-sa
    // =========================================

    this.neptuneMcpSa = this.cluster.addServiceAccount('NeptuneMcpSA', {
      name: RESOURCE_NAMES.NEPTUNE_MCP_SA,
      namespace: RESOURCE_NAMES.EKS_NAMESPACE,
    });
    this.neptuneMcpSa.node.addDependency(namespace);

    this.neptuneMcpSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['neptune-db:*'],
        resources: [`arn:aws:neptune-db:${this.region}:${this.account}:*`],
      }),
    );
    this.neptuneMcpSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    // =========================================
    // IRSA: opensearch-mcp-sa
    // =========================================

    this.opensearchMcpSa = this.cluster.addServiceAccount('OpenSearchMcpSA', {
      name: RESOURCE_NAMES.OPENSEARCH_MCP_SA,
      namespace: RESOURCE_NAMES.EKS_NAMESPACE,
    });
    this.opensearchMcpSa.node.addDependency(namespace);

    this.opensearchMcpSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['aoss:*'],
        resources: [props.opensearchCollectionArn],
      }),
    );
    // Titan V2 only for embedding queries
    this.opensearchMcpSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2*`,
        ],
      }),
    );
    this.opensearchMcpSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    // =========================================
    // IRSA: pipeline-worker-sa
    // =========================================

    this.pipelineWorkerSa = this.cluster.addServiceAccount('PipelineWorkerSA', {
      name: RESOURCE_NAMES.PIPELINE_WORKER_SA,
      namespace: RESOURCE_NAMES.EKS_NAMESPACE,
    });
    this.pipelineWorkerSa.node.addDependency(namespace);

    // S3 read
    props.dataBucket.grantRead(this.pipelineWorkerSa);

    // Neptune write
    this.pipelineWorkerSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['neptune-db:*'],
        resources: [`arn:aws:neptune-db:${this.region}:${this.account}:*`],
      }),
    );

    // AOSS write
    this.pipelineWorkerSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['aoss:*'],
        resources: [props.opensearchCollectionArn],
      }),
    );

    // Bedrock — model ID level restriction
    this.pipelineWorkerSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-sonnet-*`,
          `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2*`,
        ],
      }),
    );

    this.pipelineWorkerSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    // =========================================
    // IRSA: bff-sa
    // =========================================

    this.bffSa = this.cluster.addServiceAccount('BffSA', {
      name: RESOURCE_NAMES.BFF_SA,
      namespace: RESOURCE_NAMES.EKS_NAMESPACE,
    });
    this.bffSa.node.addDependency(namespace);

    // AgentCore InvokeAgent (Unit 5에서 AgentCore 배포 후 리소스 ARN 제한 가능)
    this.bffSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeAgent', 'bedrock:InvokeAgentWithResponseStream'],
        resources: ['*'],
      }),
    );

    // Neptune read (bff → Neptune 직접 읽기 경로)
    this.bffSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['neptune-db:ReadDataViaQuery', 'neptune-db:GetQueryStatus'],
        resources: [`arn:aws:neptune-db:${this.region}:${this.account}:*`],
      }),
    );

    this.bffSa.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    // =========================================
    // ConfigMap
    // =========================================

    const configMap = this.cluster.addManifest('AppConfigMap', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'app-config',
        namespace: RESOURCE_NAMES.EKS_NAMESPACE,
      },
      data: {
        NEPTUNE_ENDPOINT: props.neptuneClusterEndpoint,
        NEPTUNE_PORT: props.neptuneClusterPort,
        OPENSEARCH_ENDPOINT: props.opensearchCollectionEndpoint,
        DATA_BUCKET: props.dataBucket.bucketName,
        AWS_REGION: this.region,
        BEDROCK_REGION: this.region,
        AGENTCORE_ENDPOINT: '', // Populated after AgentCore Runtime creation
        // Cognito (Frontend auth)
        COGNITO_REGION: this.region,
        COGNITO_USER_POOL_ID: 'us-east-1_EXAMPLE01',
        COGNITO_CLIENT_ID: '620pp7i1da1l4j49f0mpo2bfa3',
        COGNITO_DOMAIN: 'https://example-app.auth.us-east-1.amazoncognito.com',
      },
    });
    configMap.node.addDependency(namespace);

    // =========================================
    // Outputs
    // =========================================

    new cdk.CfnOutput(this, 'EksClusterName', {
      value: this.cluster.clusterName,
      exportName: 'EksClusterName',
    });
    new cdk.CfnOutput(this, 'EksClusterEndpoint', {
      value: this.cluster.clusterEndpoint,
    });
  }
}
