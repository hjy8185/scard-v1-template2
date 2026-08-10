#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { OnedataStack } from "../lib/onedata-stack";

const app = new cdk.App();

const env = app.node.tryGetContext("onedata:environment") || "dev";
const region = app.node.tryGetContext("onedata:region") || "ap-northeast-2";

new OnedataStack(app, `OnedataAgent-${env}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: region,
  },
  tags: {
    Project: "onedata-agent",
    Environment: env,
    Team: "ai-platform",
    ManagedBy: "cdk",
  },
});

app.synth();
