import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/**
 * SMUS VPC Stack (us-west-2) — ontology-demo-vpc 유사 구조.
 *
 * 10.0.0.0/16, 2 AZ, 서브넷 그룹 3종:
 *   - Public (IGW)           /24 ×2
 *   - AppPrivate (NAT)       /24 ×2  ← SMUS project profile/environment용
 *   - DataPrivate (isolated) /24 ×2  ← 데이터 리소스용
 * NAT ×1 (데모 비용 절감). DNS hostnames/support on.
 *
 * SMUS Lakehouse/Tooling environment는 멀티 AZ 프라이빗 서브넷을 요구 → AppPrivate 사용.
 */
export class SmusVpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: cdk.StackProps = {}) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: 'card-smus-vpc',
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'AppPrivate', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'DataPrivate', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // SMUS/Glue/Athena가 프라이빗에서 S3 접근 → Gateway endpoint(비용 0)
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Outputs — project profile/environment VPC 설정에 사용
    const appPrivate = this.vpc.selectSubnets({ subnetGroupName: 'AppPrivate' });
    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });
    new cdk.CfnOutput(this, 'AppPrivateSubnetIds', {
      value: appPrivate.subnetIds.join(','),
    });
  }
}
