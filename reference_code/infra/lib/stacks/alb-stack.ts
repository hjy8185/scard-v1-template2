import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { RESOURCE_NAMES } from '../config/constants';

export interface AlbStackProps extends cdk.StackProps {
  readonly vpc: ec2.IVpc;
  readonly cluster: eks.ICluster;
  readonly albInternalSecurityGroup: ec2.ISecurityGroup;
  readonly albPublicSecurityGroup: ec2.ISecurityGroup;
}

export class AlbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props);

    // =========================================
    // Route 53 Private Hosted Zone
    // =========================================

    new route53.PrivateHostedZone(this, 'McpHostedZone', {
      zoneName: RESOURCE_NAMES.PRIVATE_HOSTED_ZONE,
      vpc: props.vpc,
      comment: 'MCP Tools internal DNS (ALB Ingress Controller manages A records)',
    });

    // =========================================
    // Internal ALB Ingress (MCP Tools, host-based)
    //
    // Note: ALB Ingress Controller creates the ALB automatically.
    // Route 53 A records for MCP hosts are managed via
    // external-dns or manual alias after ALB creation.
    // =========================================

    const internalIngress = (props.cluster as eks.Cluster).addManifest('McpToolsIngress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'mcp-tools-ingress',
        namespace: RESOURCE_NAMES.EKS_NAMESPACE,
        annotations: {
          'alb.ingress.kubernetes.io/scheme': 'internal',
          'alb.ingress.kubernetes.io/target-type': 'ip',
          'alb.ingress.kubernetes.io/listen-ports': '[{"HTTPS": 443}]',
          'alb.ingress.kubernetes.io/security-groups': props.albInternalSecurityGroup.securityGroupId,
          'alb.ingress.kubernetes.io/healthcheck-path': '/health',
        },
      },
      spec: {
        ingressClassName: 'alb',
        rules: [
          {
            host: RESOURCE_NAMES.MCP_HOSTS.NEPTUNE,
            http: {
              paths: [{
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: 'neptune-mcp-svc', port: { number: 8080 } },
                },
              }],
            },
          },
          {
            host: RESOURCE_NAMES.MCP_HOSTS.OPENSEARCH,
            http: {
              paths: [{
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: 'opensearch-mcp-svc', port: { number: 8080 } },
                },
              }],
            },
          },
          {
            host: RESOURCE_NAMES.MCP_HOSTS.GLOSSARY,
            http: {
              paths: [{
                path: '/',
                pathType: 'Prefix',
                backend: {
                  service: { name: 'glossary-svc', port: { number: 8080 } },
                },
              }],
            },
          },
        ],
      },
    });

    // =========================================
    // Public ALB Ingress (Frontend + BFF, HTTPS)
    // /api → bff:8000, / → frontend-app:3000
    // =========================================

    const publicIngress = (props.cluster as eks.Cluster).addManifest('FrontendIngress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'frontend-ingress',
        namespace: RESOURCE_NAMES.EKS_NAMESPACE,
        annotations: {
          'alb.ingress.kubernetes.io/scheme': 'internet-facing',
          'alb.ingress.kubernetes.io/target-type': 'ip',
          'alb.ingress.kubernetes.io/listen-ports': '[{"HTTPS": 443}]',
          'alb.ingress.kubernetes.io/security-groups': props.albPublicSecurityGroup.securityGroupId,
          'alb.ingress.kubernetes.io/healthcheck-path': '/health',
        },
      },
      spec: {
        ingressClassName: 'alb',
        rules: [
          {
            http: {
              paths: [
                {
                  path: '/api',
                  pathType: 'Prefix',
                  backend: {
                    service: { name: 'bff', port: { number: 8000 } },
                  },
                },
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: { name: 'frontend-app', port: { number: 3000 } },
                  },
                },
              ],
            },
          },
        ],
      },
    });
  }
}
