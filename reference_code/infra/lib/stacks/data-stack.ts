import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as neptune from 'aws-cdk-lib/aws-neptune';
import * as opensearch from 'aws-cdk-lib/aws-opensearchserverless';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { RESOURCE_NAMES } from '../config/constants';

export interface DataStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  readonly neptuneSecurityGroup: ec2.ISecurityGroup;
  readonly opensearchSecurityGroup: ec2.ISecurityGroup;
  readonly neptuneMinCapacity: number;
  readonly neptuneMaxCapacity: number;
  readonly ossVpcEndpointId?: string;
}

export class DataStack extends cdk.Stack {
  public readonly neptuneCluster: neptune.CfnDBCluster;
  public readonly neptuneClusterEndpoint: string;
  public readonly neptuneClusterPort: string;
  public readonly opensearchCollectionArn: string;
  public readonly opensearchCollectionEndpoint: string;
  public readonly dataBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const dataSubnets = props.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    });

    // =========================================
    // Neptune Serverless
    // =========================================

    const neptuneSubnetGroup = new neptune.CfnDBSubnetGroup(this, 'NeptuneSubnetGroup', {
      dbSubnetGroupDescription: 'Neptune Serverless subnet group',
      dbSubnetGroupName: RESOURCE_NAMES.NEPTUNE_SUBNET_GROUP,
      subnetIds: dataSubnets.subnetIds,
    });

    this.neptuneCluster = new neptune.CfnDBCluster(this, 'NeptuneCluster', {
      dbClusterIdentifier: RESOURCE_NAMES.NEPTUNE_CLUSTER,
      engineVersion: '1.3.2.1',
      dbSubnetGroupName: neptuneSubnetGroup.dbSubnetGroupName,
      vpcSecurityGroupIds: [props.neptuneSecurityGroup.securityGroupId],
      iamAuthEnabled: true,
      storageEncrypted: true,
      serverlessScalingConfiguration: {
        minCapacity: props.neptuneMinCapacity,
        maxCapacity: props.neptuneMaxCapacity,
      },
      backupRetentionPeriod: 1,
      deletionProtection: false,
    });
    this.neptuneCluster.addDependency(neptuneSubnetGroup);

    const neptuneInstance = new neptune.CfnDBInstance(this, 'NeptuneInstance', {
      dbInstanceIdentifier: `${RESOURCE_NAMES.NEPTUNE_CLUSTER}-instance`,
      dbInstanceClass: 'db.serverless',
      dbClusterIdentifier: this.neptuneCluster.dbClusterIdentifier!,
    });
    neptuneInstance.addDependency(this.neptuneCluster);

    this.neptuneClusterEndpoint = this.neptuneCluster.attrEndpoint;
    this.neptuneClusterPort = this.neptuneCluster.attrPort;

    // =========================================
    // OpenSearch Serverless (VECTORSEARCH)
    // =========================================

    // Encryption Policy
    const encryptionPolicy = new opensearch.CfnSecurityPolicy(this, 'OSSEncryptionPolicy', {
      name: `${RESOURCE_NAMES.OPENSEARCH_COLLECTION}-enc`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            Resource: [`collection/${RESOURCE_NAMES.OPENSEARCH_COLLECTION}`],
            ResourceType: 'collection',
          },
        ],
        AWSOwnedKey: true,
      }),
    });

    // VPC Endpoint
    let vpceId: string;
    if (props.ossVpcEndpointId) {
      vpceId = props.ossVpcEndpointId;
    } else {
      const ossVpcEndpoint = new opensearch.CfnVpcEndpoint(this, 'OSSVpcEndpoint', {
        name: `${RESOURCE_NAMES.OPENSEARCH_COLLECTION}-vpce`,
        vpcId: props.vpc.vpcId,
        subnetIds: dataSubnets.subnetIds,
        securityGroupIds: [props.opensearchSecurityGroup.securityGroupId],
      });
      vpceId = ossVpcEndpoint.attrId;
    }

    // Network Policy
    const networkPolicy = new opensearch.CfnSecurityPolicy(this, 'OSSNetworkPolicy', {
      name: `${RESOURCE_NAMES.OPENSEARCH_COLLECTION}-net`,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              Resource: [`collection/${RESOURCE_NAMES.OPENSEARCH_COLLECTION}`],
              ResourceType: 'collection',
            },
          ],
          AllowFromPublic: false,
          SourceVPCEs: [vpceId],
        },
      ]),
    });

    // Collection
    const collection = new opensearch.CfnCollection(this, 'OSSCollection', {
      name: RESOURCE_NAMES.OPENSEARCH_COLLECTION,
      type: 'VECTORSEARCH',
      description: 'Card ontology vector embeddings (Nori + kNN 1024D)',
    });
    collection.addDependency(encryptionPolicy);
    collection.addDependency(networkPolicy);

    this.opensearchCollectionArn = collection.attrArn;
    this.opensearchCollectionEndpoint = collection.attrCollectionEndpoint;

    // Data Access Policy — account-level access (IRSA roles in this account)
    new opensearch.CfnAccessPolicy(this, 'OSSDataAccessPolicy', {
      name: `${RESOURCE_NAMES.OPENSEARCH_COLLECTION}-access`,
      type: 'data',
      policy: JSON.stringify([
        {
          Description: 'Full data access for IRSA roles',
          Rules: [
            {
              Resource: [`index/${RESOURCE_NAMES.OPENSEARCH_COLLECTION}/*`],
              Permission: ['aoss:*'],
              ResourceType: 'index',
            },
            {
              Resource: [`collection/${RESOURCE_NAMES.OPENSEARCH_COLLECTION}`],
              Permission: ['aoss:*'],
              ResourceType: 'collection',
            },
          ],
          Principal: [`arn:aws:iam::${this.account}:root`],
        },
      ]),
    });

    // =========================================
    // S3 Bucket
    // =========================================

    this.dataBucket = new s3.Bucket(this, 'DataBucket', {
      bucketName: `${RESOURCE_NAMES.DATA_BUCKET}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // =========================================
    // Outputs
    // =========================================

    new cdk.CfnOutput(this, 'NeptuneClusterEndpoint', {
      value: this.neptuneClusterEndpoint,
      exportName: 'NeptuneClusterEndpoint',
    });
    new cdk.CfnOutput(this, 'NeptuneClusterPort', {
      value: this.neptuneClusterPort,
      exportName: 'NeptuneClusterPort',
    });
    new cdk.CfnOutput(this, 'OpenSearchCollectionEndpoint', {
      value: this.opensearchCollectionEndpoint,
      exportName: 'OpenSearchCollectionEndpoint',
    });
    new cdk.CfnOutput(this, 'DataBucketName', {
      value: this.dataBucket.bucketName,
      exportName: 'DataBucketName',
    });
  }
}
