import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

/**
 * U1r — ECR cross-region replication (us-east-1 → us-west-2).
 *
 * cg- prefix 리포지토리(cg-agent, cg/bff, cg/frontend-app, cg/*-mcp-svc)를
 * us-west-2로 자동 복제. **us-east-1 registry에 배포**해야 함(replication은 소스 리전 설정).
 *
 * ⚠️ registry replication은 계정/리전당 단일 설정 → 기존 설정이 있으면 병합 주의.
 */
export interface EcrReplicationStackProps extends cdk.StackProps {
  readonly destinationRegion?: string;   // 기본 us-west-2
  readonly repositoryPrefix?: string;    // 기본 cg
}

export class EcrReplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcrReplicationStackProps = {}) {
    super(scope, id, props);

    const destRegion = props.destinationRegion ?? 'us-west-2';
    const prefix = props.repositoryPrefix ?? 'cg';

    new ecr.CfnReplicationConfiguration(this, 'ReplicationConfig', {
      replicationConfiguration: {
        rules: [
          {
            destinations: [{ region: destRegion, registryId: this.account }],
            repositoryFilters: [{ filter: prefix, filterType: 'PREFIX_MATCH' }],
          },
        ],
      },
    });

    new cdk.CfnOutput(this, 'ReplicationDestination', {
      value: `${destRegion} (prefix: ${prefix})`,
    });
  }
}
