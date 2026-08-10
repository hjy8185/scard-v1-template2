import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as neptune from "aws-cdk-lib/aws-neptune";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as opensearchserverless from "aws-cdk-lib/aws-opensearchserverless";
import { Construct } from "constructs";

export class OnedataStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =========================================================================
    // VPC
    // =========================================================================
    const vpc = new ec2.Vpc(this, "OnedataVpc", {
      vpcName: "onedata-agent-vpc",
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: "Isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // =========================================================================
    // Security Groups
    // =========================================================================
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc,
      securityGroupName: "onedata-alb-sg",
      description: "Security group for Application Load Balancer",
      allowAllOutbound: true,
    });
    albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP"
    );
    albSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS"
    );

    const backendSg = new ec2.SecurityGroup(this, "BackendSg", {
      vpc,
      securityGroupName: "onedata-backend-sg",
      description: "Security group for backend ECS tasks",
      allowAllOutbound: true,
    });
    backendSg.addIngressRule(
      albSg,
      ec2.Port.tcp(8000),
      "Allow traffic from ALB"
    );

    const frontendSg = new ec2.SecurityGroup(this, "FrontendSg", {
      vpc,
      securityGroupName: "onedata-frontend-sg",
      description: "Security group for frontend ECS tasks",
      allowAllOutbound: true,
    });
    frontendSg.addIngressRule(
      albSg,
      ec2.Port.tcp(3000),
      "Allow traffic from ALB"
    );

    const neptuneSg = new ec2.SecurityGroup(this, "NeptuneSg", {
      vpc,
      securityGroupName: "onedata-neptune-sg",
      description: "Security group for Neptune cluster",
      allowAllOutbound: false,
    });
    neptuneSg.addIngressRule(
      backendSg,
      ec2.Port.tcp(8182),
      "Allow Neptune access from backend"
    );

    // =========================================================================
    // Neptune Cluster (Graph Database)
    // =========================================================================
    const neptuneSubnetGroup = new neptune.CfnDBSubnetGroup(
      this,
      "NeptuneSubnetGroup",
      {
        dbSubnetGroupDescription: "Subnet group for Neptune cluster",
        dbSubnetGroupName: "onedata-neptune-subnet-group",
        subnetIds: vpc.selectSubnets({
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }).subnetIds,
      }
    );

    const neptuneCluster = new neptune.CfnDBCluster(this, "NeptuneCluster", {
      dbClusterIdentifier: "onedata-agent-neptune",
      engineVersion: "1.3.1.0",
      iamAuthEnabled: true,
      storageEncrypted: true,
      vpcSecurityGroupIds: [neptuneSg.securityGroupId],
      dbSubnetGroupName: neptuneSubnetGroup.dbSubnetGroupName,
      deletionProtection: false,
      tags: [
        { key: "Project", value: "onedata-agent" },
      ],
    });
    neptuneCluster.addDependency(neptuneSubnetGroup);

    const neptuneInstance = new neptune.CfnDBInstance(
      this,
      "NeptuneInstance",
      {
        dbInstanceClass: "db.t3.medium",
        dbClusterIdentifier: neptuneCluster.dbClusterIdentifier!,
        dbInstanceIdentifier: "onedata-agent-neptune-instance-1",
        availabilityZone: vpc.availabilityZones[0],
      }
    );
    neptuneInstance.addDependency(neptuneCluster);

    // =========================================================================
    // OpenSearch Serverless Collection
    // =========================================================================
    const opensearchEncryptionPolicy =
      new opensearchserverless.CfnSecurityPolicy(
        this,
        "OpenSearchEncryptionPolicy",
        {
          name: "onedata-encryption",
          type: "encryption",
          policy: JSON.stringify({
            Rules: [
              {
                ResourceType: "collection",
                Resource: ["collection/onedata-ontology"],
              },
            ],
            AWSOwnedKey: true,
          }),
        }
      );

    const opensearchNetworkPolicy =
      new opensearchserverless.CfnSecurityPolicy(
        this,
        "OpenSearchNetworkPolicy",
        {
          name: "onedata-network",
          type: "network",
          policy: JSON.stringify([
            {
              Rules: [
                {
                  ResourceType: "collection",
                  Resource: ["collection/onedata-ontology"],
                },
                {
                  ResourceType: "dashboard",
                  Resource: ["collection/onedata-ontology"],
                },
              ],
              AllowFromPublic: false,
              SourceVPCEs: [],
            },
          ]),
        }
      );

    const opensearchCollection =
      new opensearchserverless.CfnCollection(this, "OpenSearchCollection", {
        name: "onedata-ontology",
        type: "VECTORSEARCH",
        description:
          "Semantic search index for Onedata ontology and table metadata",
      });
    opensearchCollection.addDependency(opensearchEncryptionPolicy);
    opensearchCollection.addDependency(opensearchNetworkPolicy);

    // =========================================================================
    // IAM Roles
    // =========================================================================
    const backendTaskRole = new iam.Role(this, "BackendTaskRole", {
      roleName: "onedata-backend-task-role",
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "IAM role for backend ECS task",
    });

    // Neptune access
    backendTaskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["neptune-db:connect", "neptune-db:ReadDataViaQuery"],
        resources: [
          `arn:aws:neptune-db:${this.region}:${this.account}:${neptuneCluster.attrClusterResourceId}/*`,
        ],
      })
    );

    // OpenSearch Serverless access
    backendTaskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["aoss:APIAccessAll"],
        resources: [opensearchCollection.attrArn],
      })
    );

    // Athena access
    backendTaskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "athena:StartQueryExecution",
          "athena:GetQueryExecution",
          "athena:GetQueryResults",
          "athena:StopQueryExecution",
        ],
        resources: ["*"],
      })
    );

    // Glue catalog access (for Athena)
    backendTaskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "glue:GetDatabase",
          "glue:GetDatabases",
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetPartitions",
        ],
        resources: [
          `arn:aws:glue:${this.region}:${this.account}:catalog`,
          `arn:aws:glue:${this.region}:${this.account}:database/ai_ready_v2`,
          `arn:aws:glue:${this.region}:${this.account}:table/ai_ready_v2/*`,
        ],
      })
    );

    // S3 access for Athena results and data
    backendTaskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
        resources: [
          "arn:aws:s3:::onedata-athena-results",
          "arn:aws:s3:::onedata-athena-results/*",
          "arn:aws:s3:::onedata-datalake",
          "arn:aws:s3:::onedata-datalake/*",
        ],
      })
    );

    // Bedrock access
    backendTaskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/anthropic.*`,
        ],
      })
    );

    const taskExecutionRole = new iam.Role(this, "TaskExecutionRole", {
      roleName: "onedata-task-execution-role",
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy"
        ),
      ],
    });

    // =========================================================================
    // ECS Cluster
    // =========================================================================
    const cluster = new ecs.Cluster(this, "EcsCluster", {
      clusterName: "onedata-agent-cluster",
      vpc,
      containerInsights: true,
    });

    // =========================================================================
    // Backend Fargate Service
    // =========================================================================
    const backendTaskDef = new ecs.FargateTaskDefinition(
      this,
      "BackendTaskDef",
      {
        family: "onedata-backend",
        cpu: 1024,
        memoryLimitMiB: 2048,
        taskRole: backendTaskRole,
        executionRole: taskExecutionRole,
      }
    );

    const backendContainer = backendTaskDef.addContainer("backend", {
      image: ecs.ContainerImage.fromRegistry(
        `${this.account}.dkr.ecr.${this.region}.amazonaws.com/onedata-agent-backend:latest`
      ),
      containerName: "onedata-backend",
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "onedata-backend",
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment: {
        AWS_REGION: this.region,
        NEPTUNE_ENDPOINT: `https://${neptuneCluster.attrEndpoint}:8182`,
        OPENSEARCH_ENDPOINT: opensearchCollection.attrCollectionEndpoint,
        OPENSEARCH_INDEX: "onedata-ontology",
        ATHENA_DATABASE: "ai_ready_v2",
        ATHENA_OUTPUT_BUCKET: "s3://onedata-athena-results/",
        ATHENA_WORKGROUP: "primary",
        BEDROCK_MODEL_ID: "anthropic.claude-sonnet-4-20250514",
        APP_PORT: "8000",
        SQL_READ_ONLY: "true",
      },
      portMappings: [{ containerPort: 8000 }],
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:8000/health || exit 1",
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    const backendService = new ecs.FargateService(this, "BackendService", {
      serviceName: "onedata-backend",
      cluster,
      taskDefinition: backendTaskDef,
      desiredCount: 2,
      securityGroups: [backendSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // =========================================================================
    // Frontend Fargate Service
    // =========================================================================
    const frontendTaskDef = new ecs.FargateTaskDefinition(
      this,
      "FrontendTaskDef",
      {
        family: "onedata-frontend",
        cpu: 512,
        memoryLimitMiB: 1024,
        executionRole: taskExecutionRole,
      }
    );

    frontendTaskDef.addContainer("frontend", {
      image: ecs.ContainerImage.fromRegistry(
        `${this.account}.dkr.ecr.${this.region}.amazonaws.com/onedata-agent-frontend:latest`
      ),
      containerName: "onedata-frontend",
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "onedata-frontend",
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment: {
        NEXT_PUBLIC_API_URL: "/api",
        NODE_ENV: "production",
      },
      portMappings: [{ containerPort: 3000 }],
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:3000/ || exit 1",
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    const frontendService = new ecs.FargateService(this, "FrontendService", {
      serviceName: "onedata-frontend",
      cluster,
      taskDefinition: frontendTaskDef,
      desiredCount: 2,
      securityGroups: [frontendSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // =========================================================================
    // Application Load Balancer with Path-Based Routing
    // =========================================================================
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      loadBalancerName: "onedata-agent-alb",
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const listener = alb.addListener("HttpListener", {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    // Backend target group
    const backendTarget = listener.addTargets("BackendTarget", {
      targetGroupName: "onedata-backend-tg",
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [backendService],
      healthCheck: {
        path: "/health",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyHttpCodes: "200",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      priority: 10,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(["/api/*", "/health"]),
      ],
    });

    // Frontend target group (default action)
    const frontendTarget = listener.addTargets("FrontendTarget", {
      targetGroupName: "onedata-frontend-tg",
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [frontendService],
      healthCheck: {
        path: "/",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyHttpCodes: "200",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // =========================================================================
    // Outputs
    // =========================================================================
    new cdk.CfnOutput(this, "AlbDnsName", {
      value: alb.loadBalancerDnsName,
      description: "Application Load Balancer DNS name",
      exportName: "onedata-alb-dns",
    });

    new cdk.CfnOutput(this, "NeptuneEndpoint", {
      value: neptuneCluster.attrEndpoint,
      description: "Neptune cluster endpoint",
      exportName: "onedata-neptune-endpoint",
    });

    new cdk.CfnOutput(this, "OpenSearchEndpoint", {
      value: opensearchCollection.attrCollectionEndpoint,
      description: "OpenSearch Serverless collection endpoint",
      exportName: "onedata-opensearch-endpoint",
    });

    new cdk.CfnOutput(this, "VpcId", {
      value: vpc.vpcId,
      description: "VPC ID",
      exportName: "onedata-vpc-id",
    });
  }
}
