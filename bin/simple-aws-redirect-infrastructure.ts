#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RedirectInfrastructureStack } from '../lib/simple-aws-redirect-infrastructure-stack';

const app = new cdk.App();
new RedirectInfrastructureStack(app, 'RedirectInfrastructureStack', {
	env: {
		account: process.env.CDK_DEFAULT_ACCOUNT,
		region: process.env.CDK_DEFAULT_REGION,
	},
});