import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface SecurityStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  readonly albDnsName: string;
}

export class SecurityStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly albSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    // =========================================
    // ALB Security Group (CloudFront-only)
    // =========================================

    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbCfOnlySg', {
      vpc: props.vpc,
      securityGroupName: 'cg-alb-cf-only',
      description: 'ALB SG - CloudFront origin-facing traffic only',
      allowAllOutbound: true,
    });

    // Allow HTTP:80 from CloudFront managed prefix list
    this.albSecurityGroup.addIngressRule(
      ec2.Peer.prefixList('pl-3b927c52'), // com.amazonaws.global.cloudfront.origin-facing (us-east-1)
      ec2.Port.tcp(80),
      'CloudFront origin-facing (HTTP)',
    );

    // =========================================
    // CloudFront Distribution
    // =========================================

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Card GraphRAG - CloudFront HTTPS termination',
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: new origins.HttpOrigin(props.albDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          readTimeout: cdk.Duration.seconds(60),
          keepaliveTimeout: cdk.Duration.seconds(60),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
    });

    // =========================================
    // Outputs
    // =========================================

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      exportName: 'CG-CloudFrontDomain',
    });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      exportName: 'CG-CloudFrontDistId',
    });
    new cdk.CfnOutput(this, 'AlbCfSecurityGroupId', {
      value: this.albSecurityGroup.securityGroupId,
      exportName: 'CG-AlbCfSgId',
    });
  }
}
