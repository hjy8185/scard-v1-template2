import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcStackProps extends cdk.StackProps {
  readonly maxAzs: number;
  readonly natGateways: number;
  readonly corporateCidrs: string[];
}

export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly eksSecurityGroup: ec2.ISecurityGroup;
  public readonly neptuneSecurityGroup: ec2.ISecurityGroup;
  public readonly opensearchSecurityGroup: ec2.ISecurityGroup;
  public readonly albInternalSecurityGroup: ec2.ISecurityGroup;
  public readonly albPublicSecurityGroup: ec2.ISecurityGroup;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    // =========================================
    // VPC — 3-tier subnets
    // =========================================

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: props.maxAzs,
      natGateways: props.natGateways,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'AppPrivate',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'DataPrivate',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // =========================================
    // Security Groups
    // =========================================

    // EKS Worker Nodes (allowAllOutbound includes 443 to VPC Endpoints)
    this.eksSecurityGroup = new ec2.SecurityGroup(this, 'EksWorkersSg', {
      vpc: this.vpc,
      description: 'EKS Worker Nodes Security Group',
      allowAllOutbound: true,
    });

    // Internal ALB → EKS Workers (MCP port 8080 unified)
    this.eksSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('10.0.0.0/16'),
      ec2.Port.tcp(8080),
      'Allow MCP 8080 from VPC (AgentCore Outbound VPC)',
    );

    // Neptune — only 8182 from EKS Workers
    this.neptuneSecurityGroup = new ec2.SecurityGroup(this, 'NeptuneSg', {
      vpc: this.vpc,
      description: 'Neptune Serverless Security Group',
      allowAllOutbound: false,
    });
    this.neptuneSecurityGroup.addIngressRule(
      this.eksSecurityGroup,
      ec2.Port.tcp(8182),
      'Allow Gremlin from EKS Workers',
    );

    // OpenSearch Serverless — only 443 from EKS Workers
    this.opensearchSecurityGroup = new ec2.SecurityGroup(this, 'OpenSearchSg', {
      vpc: this.vpc,
      description: 'OpenSearch Serverless Security Group',
      allowAllOutbound: false,
    });
    this.opensearchSecurityGroup.addIngressRule(
      this.eksSecurityGroup,
      ec2.Port.tcp(443),
      'Allow HTTPS from EKS Workers',
    );

    // Internal ALB — MCP Tools (host-based routing)
    this.albInternalSecurityGroup = new ec2.SecurityGroup(this, 'AlbInternalSg', {
      vpc: this.vpc,
      description: 'Internal ALB Security Group (MCP Tools)',
      allowAllOutbound: true,
    });
    // EKS Workers → Internal ALB (for AgentCore VPC access)
    this.albInternalSecurityGroup.addIngressRule(
      ec2.Peer.ipv4('10.0.0.0/16'),
      ec2.Port.tcp(443),
      'Allow HTTPS from VPC (AgentCore Outbound VPC)',
    );
    // Internal ALB → EKS Workers (MCP port 8080 unified)
    this.eksSecurityGroup.addIngressRule(
      this.albInternalSecurityGroup,
      ec2.Port.tcp(8080),
      'Allow MCP port 8080 from Internal ALB',
    );

    // Public ALB — Frontend + BFF (사내 IP only)
    this.albPublicSecurityGroup = new ec2.SecurityGroup(this, 'AlbPublicSg', {
      vpc: this.vpc,
      description: 'Public ALB Security Group (Frontend + BFF, corporate IP only)',
      allowAllOutbound: true,
    });
    for (const cidr of props.corporateCidrs) {
      this.albPublicSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(cidr),
        ec2.Port.tcp(443),
        `Allow HTTPS from corporate CIDR ${cidr}`,
      );
    }
    // Public ALB → EKS Workers (frontend 3000, bff 8000)
    this.eksSecurityGroup.addIngressRule(
      this.albPublicSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow frontend from Public ALB',
    );
    this.eksSecurityGroup.addIngressRule(
      this.albPublicSecurityGroup,
      ec2.Port.tcp(8000),
      'Allow BFF from Public ALB',
    );

    // =========================================
    // VPC Endpoints
    // =========================================

    // S3 Gateway (free)
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Interface Endpoints
    const interfaceEndpoints: Array<{ id: string; service: ec2.InterfaceVpcEndpointAwsService }> = [
      { id: 'StsEndpoint', service: ec2.InterfaceVpcEndpointAwsService.STS },
      { id: 'EcrEndpoint', service: ec2.InterfaceVpcEndpointAwsService.ECR },
      { id: 'EcrDockerEndpoint', service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER },
      { id: 'CloudWatchLogsEndpoint', service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS },
      { id: 'BedrockEndpoint', service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME },
    ];

    for (const ep of interfaceEndpoints) {
      this.vpc.addInterfaceEndpoint(ep.id, {
        service: ep.service,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      });
    }

    // AgentCore VPC Endpoints (D3 — Private DNS enabled)
    this.vpc.addInterfaceEndpoint('AgentCoreDataEndpoint', {
      service: new ec2.InterfaceVpcEndpointService(
        'com.amazonaws.us-east-1.bedrock-agentcore',
      ),
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    this.vpc.addInterfaceEndpoint('AgentCoreControlEndpoint', {
      service: new ec2.InterfaceVpcEndpointService(
        'com.amazonaws.us-east-1.bedrock-agentcore-control',
      ),
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      privateDnsEnabled: true,
    });

    // =========================================
    // Outputs
    // =========================================

    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
  }
}
