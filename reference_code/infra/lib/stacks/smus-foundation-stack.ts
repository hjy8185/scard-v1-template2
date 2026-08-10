import * as cdk from 'aws-cdk-lib';
import * as datazone from 'aws-cdk-lib/aws-datazone';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { SMUS } from '../config/constants';

/**
 * U1f SMUS Foundation Stack (us-west-2).
 *
 * SMUS(=DataZone V2) 도메인 + 프로젝트 6종 + DataLake blueprint 활성화.
 * SSO(IAM Identity Center) 연동. 도메인은 us-west-2 IdC org instance와 동리전 필수.
 *
 * ⚠️ CDK L1(aws-datazone) 우선. Lakehouse environment·membership·glossary 등
 *    유동 부분은 boto3(pipeline/smus/bootstrap.py)로 보완(설계 Q3/#3).
 *    CDK 2.244 스펙 기준: CfnDomain.{domainVersion,singleSignOn}, CfnProject.{name,projectProfileId} 확인됨.
 */
export interface SmusFoundationStackProps extends cdk.StackProps {
  /** IAM Identity Center instance ARN (env/context 주입, 하드코딩 금지 #10). 없으면 SSO 비활성으로 synth. */
  readonly idcInstanceArn?: string;
  /**
   * root domain unit owner로 추가할 DataZone user profile id (context 주입).
   * CDK가 만든 SSO 도메인은 root unit owner가 내부 group profile이라 CreateProject가 막힘 →
   * bootstrap 실행 주체(예: claude-admin)의 user profile을 owner로 추가해 해소.
   */
  readonly ownerUserProfileId?: string;
}

export class SmusFoundationStack extends cdk.Stack {
  public readonly domain: datazone.CfnDomain;

  constructor(scope: Construct, id: string, props: SmusFoundationStackProps = {}) {
    super(scope, id, props);

    // =========================================
    // IAM: domain role (execution=service 동일 역할)
    // 근거: 계정 내 실동작 V2 도메인(smus-demo-datazone-domain-execution)의 구성 확인.
    //   trust: datazone/glue/cloudformation/sagemaker/redshift, managed: 5종.
    // =========================================
    const domainRole = new iam.Role(this, 'DomainExecutionRole', {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('datazone.amazonaws.com'),
        new iam.ServicePrincipal('sagemaker.amazonaws.com'),
        new iam.ServicePrincipal('glue.amazonaws.com'),
        new iam.ServicePrincipal('cloudformation.amazonaws.com'),
        new iam.ServicePrincipal('redshift.amazonaws.com'),
      ),
      description: 'SMUS DataZone V2 domain role for card AI Ready Data',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonDataZoneDomainExecutionRolePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonDataZoneGlueManageAccessRolePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDataZoneRedshiftGlueProvisioningPolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDataZoneSageMakerProvisioningRolePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDataZoneSageMakerManageAccessRolePolicy'),
      ],
    });
    // datazone control이 TagSession도 필요
    domainRole.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        actions: ['sts:TagSession'],
        principals: [
          new iam.ServicePrincipal('datazone.amazonaws.com'),
          new iam.ServicePrincipal('sagemaker.amazonaws.com'),
        ],
      }),
    );

    // =========================================
    // SMUS Domain (V2) + SSO
    // =========================================
    // idcInstanceArn 있으면 SSO(IAM_IDC), 없으면 미지정(부트스트랩 전 synth 허용).
    const singleSignOn: datazone.CfnDomain.SingleSignOnProperty | undefined = props.idcInstanceArn
      ? { type: 'IAM_IDC', idcInstanceArn: props.idcInstanceArn, userAssignment: 'MANUAL' }
      : undefined;

    this.domain = new datazone.CfnDomain(this, 'Domain', {
      name: SMUS.DOMAIN_NAME,
      domainVersion: 'V2',
      domainExecutionRole: domainRole.roleArn,
      serviceRole: domainRole.roleArn,
      description: 'Card AI Ready Data Platform SMUS foundation (us-west-2)',
      singleSignOn,
    });

    // =========================================
    // Root domain unit owner 추가 (CreateProject 권한 해소)
    // =========================================
    // CDK가 만든 SSO 도메인의 root unit owner는 내부 group profile(SSO 미매핑)이라
    // bootstrap 주체가 프로젝트를 못 만듦 → 실행 주체 user profile을 owner로 추가.
    if (props.ownerUserProfileId) {
      const owner = new datazone.CfnOwner(this, 'RootUnitOwner', {
        domainIdentifier: this.domain.attrId,
        entityType: 'DOMAIN_UNIT',
        entityIdentifier: this.domain.attrRootDomainUnitId,
        owner: { user: { userIdentifier: props.ownerUserProfileId } },
      });
      owner.addDependency(this.domain);
    }

    // =========================================
    // Blueprint 활성화 + Projects × 6 → boto3 bootstrap으로 이관 (CDK/boto3 하이브리드, #3)
    // =========================================
    // ⚠️ 배포 시 확인된 SMUS V2 제약(#3 스펙 변동 실증):
    //   1) blueprint identifier는 도메인별 동적 id (예: 'DataLake' 이름의 blueprint id는
    //      도메인 생성 후 list_environment_blueprints로 조회) — 정적 'DefaultDataLake' 불가.
    //   2) V2 프로젝트는 projectProfileId 필수 — profile은 도메인 런타임에서 조회/생성.
    //   → blueprint 활성화·project profile·프로젝트 6종은 pipeline/smus/bootstrap.py가
    //     도메인 생성 후 boto3로 처리(idempotent). CDK 스택은 도메인+역할까지만.

    // =========================================
    // Outputs (bootstrap/verify가 소비)
    // =========================================
    new cdk.CfnOutput(this, 'DomainId', { value: this.domain.attrId });
    new cdk.CfnOutput(this, 'DomainArn', { value: this.domain.attrArn });
    new cdk.CfnOutput(this, 'PortalUrl', { value: this.domain.attrPortalUrl });
    new cdk.CfnOutput(this, 'DomainExecutionRoleArn', { value: domainRole.roleArn });
    new cdk.CfnOutput(this, 'GlueDatabase', { value: SMUS.GLUE_DATABASE });
  }
}
