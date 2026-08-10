import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as opensearch from 'aws-cdk-lib/aws-opensearchserverless';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * U1r — us-west-2 GraphRAG 데이터 스택 (Neptune + AOSS + S3).
 *
 * cg-smus-vpc(U1f) 공유. 기존 us-east-1 data-stack 이식하되:
 *  - 자체 SG 생성(EKS SG 아직 없으면 VPC CIDR ingress로 시작 — EKS 배포 시 좁힘)
 *  - 리소스명 -west 접미사로 us-east-1과 격리(exportName 충돌 방지)
 * 원본 us-east-1(cg-neptune, card-graphrag-vectors)은 불변.
 */
export interface WestDataStackProps extends cdk.StackProps {
  readonly vpcId: string;                 // cg-smus-vpc
  readonly neptuneMinCapacity: number;
  readonly neptuneMaxCapacity: number;
}

export class WestDataStack extends cdk.Stack {
  public readonly neptuneClusterEndpoint: string;
  public readonly neptuneClusterPort: string;
  public readonly opensearchCollectionEndpoint: string;
  public readonly dataBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: WestDataStackProps) {
    super(scope, id, props);

    // AOSS 정책명 32자 제한(<collection>-access ≤32) → collection ≤25자
    const COLLECTION = 'cg-vectors-west';
    const NEPTUNE_ID = 'cg-neptune-west';

    const vpc = ec2.Vpc.fromLookup(this, 'SmusVpc', { vpcId: props.vpcId });
    const dataSubnets = vpc.selectSubnets({ subnetGroupName: 'DataPrivate' });

    // --- Security Groups (자체 생성) ---
    const neptuneSg = new ec2.SecurityGroup(this, 'NeptuneSg', {
      vpc, description: 'west Neptune SG', allowAllOutbound: true,
    });
    const opensearchSg = new ec2.SecurityGroup(this, 'OpenSearchSg', {
      vpc, description: 'west AOSS VPCE SG', allowAllOutbound: true,
    });
    // VPC 내부에서 접근(EKS/재적재 Job). EKS 배포 후 SG 참조로 좁힐 수 있음.
    neptuneSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(8182), 'Neptune from VPC');
    opensearchSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(443), 'AOSS from VPC');

    // --- Neptune Serverless ---
    const neptuneSubnetGroup = new neptune.CfnDBSubnetGroup(this, 'NeptuneSubnetGroup', {
      dbSubnetGroupDescription: 'west Neptune subnet group',
      dbSubnetGroupName: `${NEPTUNE_ID}-subnet`,
      subnetIds: dataSubnets.subnetIds,
    });
    const neptuneCluster = new neptune.CfnDBCluster(this, 'NeptuneCluster', {
      dbClusterIdentifier: NEPTUNE_ID,
      engineVersion: '1.3.2.1',
      dbSubnetGroupName: neptuneSubnetGroup.dbSubnetGroupName,
      vpcSecurityGroupIds: [neptuneSg.securityGroupId],
      iamAuthEnabled: true,
      storageEncrypted: true,
      serverlessScalingConfiguration: {
        minCapacity: props.neptuneMinCapacity,
        maxCapacity: props.neptuneMaxCapacity,
      },
      backupRetentionPeriod: 1,
      deletionProtection: false,
    });
    neptuneCluster.addDependency(neptuneSubnetGroup);
    const neptuneInstance = new neptune.CfnDBInstance(this, 'NeptuneInstance', {
      dbInstanceIdentifier: `${NEPTUNE_ID}-instance`,
      dbInstanceClass: 'db.serverless',
      dbClusterIdentifier: neptuneCluster.dbClusterIdentifier!,
    });
    neptuneInstance.addDependency(neptuneCluster);
    this.neptuneClusterEndpoint = neptuneCluster.attrEndpoint;
    this.neptuneClusterPort = neptuneCluster.attrPort;

    // --- AOSS (VECTORSEARCH) ---
    const encryptionPolicy = new opensearch.CfnSecurityPolicy(this, 'OSSEncryptionPolicy', {
      name: `${COLLECTION}-enc`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [{ Resource: [`collection/${COLLECTION}`], ResourceType: 'collection' }],
        AWSOwnedKey: true,
      }),
    });
    const ossVpcEndpoint = new opensearch.CfnVpcEndpoint(this, 'OSSVpcEndpoint', {
      name: `${COLLECTION}-vpce`,
      vpcId: vpc.vpcId,
      subnetIds: dataSubnets.subnetIds,
      securityGroupIds: [opensearchSg.securityGroupId],
    });
    const networkPolicy = new opensearch.CfnSecurityPolicy(this, 'OSSNetworkPolicy', {
      name: `${COLLECTION}-net`,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [{ Resource: [`collection/${COLLECTION}`], ResourceType: 'collection' }],
          AllowFromPublic: false,
          SourceVPCEs: [ossVpcEndpoint.attrId],
        },
      ]),
    });
    const collection = new opensearch.CfnCollection(this, 'OSSCollection', {
      name: COLLECTION,
      type: 'VECTORSEARCH',
      description: 'Card ontology vectors (us-west-2 replica)',
    });
    collection.addDependency(encryptionPolicy);
    collection.addDependency(networkPolicy);
    this.opensearchCollectionEndpoint = collection.attrCollectionEndpoint;

    new opensearch.CfnAccessPolicy(this, 'OSSDataAccessPolicy', {
      name: `${COLLECTION}-access`,
      type: 'data',
      policy: JSON.stringify([
        {
          Description: 'Full data access for account IAM roles',
          Rules: [
            { Resource: [`index/${COLLECTION}/*`], Permission: ['aoss:*'], ResourceType: 'index' },
            { Resource: [`collection/${COLLECTION}`], Permission: ['aoss:*'], ResourceType: 'collection' },
          ],
          Principal: [`arn:aws:iam::${this.account}:root`],
        },
      ]),
    });

    // --- S3 ---
    this.dataBucket = new s3.Bucket(this, 'DataBucket', {
      bucketName: `cg-data-west-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- Outputs (재적재 Job/AgentCore가 소비) ---
    new cdk.CfnOutput(this, 'WestNeptuneEndpoint', { value: this.neptuneClusterEndpoint });
    new cdk.CfnOutput(this, 'WestNeptunePort', { value: this.neptuneClusterPort });
    new cdk.CfnOutput(this, 'WestOpenSearchEndpoint', { value: this.opensearchCollectionEndpoint });
    new cdk.CfnOutput(this, 'WestDataBucket', { value: this.dataBucket.bucketName });
  }
}
