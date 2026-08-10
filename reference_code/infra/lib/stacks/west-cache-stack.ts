import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

/**
 * U4 metric cache — ElastiCache Serverless (Valkey), cg-smus-vpc.
 * metric MCP(EKS)가 read-through 캐시로 사용. Athena 지연(~0.75s) → ~5ms.
 * engine=valkey (Redis보다 저렴, 프로토콜 호환). 원본 us-east-1 불변.
 */
export interface WestCacheStackProps extends cdk.StackProps {
  readonly vpcId: string;
}

export class WestCacheStack extends cdk.Stack {
  public readonly cacheEndpoint: string;

  constructor(scope: Construct, id: string, props: WestCacheStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, 'SmusVpc', { vpcId: props.vpcId });

    // SG: EKS 노드(cg-cluster-west)에서 6379 인바운드 허용(같은 VPC)
    const sg = new ec2.SecurityGroup(this, 'CacheSg', {
      vpc, description: 'metric cache valkey from EKS', allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(6379),
      'valkey from cg-smus-vpc');

    const privateSubnetIds = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    }).subnetIds;

    const cache = new elasticache.CfnServerlessCache(this, 'MetricCache', {
      serverlessCacheName: 'cg-metric-cache',
      engine: 'valkey',
      securityGroupIds: [sg.securityGroupId],
      subnetIds: privateSubnetIds,
      description: 'U4 metric semantic layer cache',
    });

    this.cacheEndpoint = cache.attrEndpointAddress;
    new cdk.CfnOutput(this, 'MetricCacheEndpoint', { value: this.cacheEndpoint });
    new cdk.CfnOutput(this, 'MetricCachePort', { value: '6379' });
  }
}
