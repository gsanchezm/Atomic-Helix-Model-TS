#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AhmPipelineStack } from '../pipeline-stack';

const app = new cdk.App();

new AhmPipelineStack(app, 'AhmExecutionPipelineStack', {
  // These four props have no safe default for a repo with no AWS account/GitHub
  // CodeStar connection provisioned yet — supply real values via `cdk.context.json`,
  // `-c` flags, or environment variables before ever running `cdk deploy` for real.
  codeStarConnectionArn: app.node.tryGetContext('codeStarConnectionArn') ?? process.env.AHM_CODESTAR_CONNECTION_ARN ?? '',
  githubOwner: app.node.tryGetContext('githubOwner') ?? process.env.AHM_GITHUB_OWNER ?? 'gsanchezm',
  githubRepo: app.node.tryGetContext('githubRepo') ?? process.env.AHM_GITHUB_REPO ?? 'Atomic-Helix-Model-TS',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
