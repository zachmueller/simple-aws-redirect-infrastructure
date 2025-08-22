import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

export class RedirectInfrastructureStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// S3 bucket to store redirect configuration
		const redirectConfigBucket = new s3.Bucket(this, 'RedirectConfigBucket', {
			bucketName: `redirect-config-${this.account}-${this.region}`,
			versioned: true,
			encryption: s3.BucketEncryption.S3_MANAGED,
			blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
			removalPolicy: cdk.RemovalPolicy.RETAIN,
		});

		// Create a directory for processed Lambda code
		const processedLambdaPath = path.join(__dirname, '../lambda-processed');
		if (!fs.existsSync(processedLambdaPath)) {
			fs.mkdirSync(processedLambdaPath, { recursive: true });
		}

		// Read the Lambda function code and replace placeholders
		const lambdaSourcePath = path.join(__dirname, '../lambda/index.js');
		let lambdaCode = fs.readFileSync(lambdaSourcePath, 'utf8');
		
		// Replace placeholder values with actual values
		lambdaCode = lambdaCode.replace(/{{REDIRECT_CONFIG_BUCKET}}/g, redirectConfigBucket.bucketName);
		lambdaCode = lambdaCode.replace(/{{REDIRECT_CONFIG_KEY}}/g, 'redirects.json');
		
		// Write the processed Lambda code to the processed directory
		const processedLambdaFilePath = path.join(processedLambdaPath, 'index.js');
		fs.writeFileSync(processedLambdaFilePath, lambdaCode);

		// Lambda@Edge function for handling redirects (without environment variables)
		const redirectFunction = new lambda.Function(this, 'RedirectFunction', {
			runtime: lambda.Runtime.NODEJS_18_X,
			handler: 'index.handler',
			code: lambda.Code.fromAsset(processedLambdaPath),
			timeout: cdk.Duration.seconds(5),
			memorySize: 128,
		});

		// Grant Lambda function read access to S3 bucket
		redirectConfigBucket.grantRead(redirectFunction);

		// CloudFront distribution
		const distribution = new cloudfront.Distribution(this, 'RedirectDistribution', {
			defaultBehavior: {
				origin: new origins.HttpOrigin('example.com'), // Dummy origin, won't be used
				viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
				cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
				edgeLambdas: [
					{
						functionVersion: redirectFunction.currentVersion,
						eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
					},
				],
			},
			priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US, Canada, Europe
			comment: 'Personal domain redirect infrastructure',
		});

		// Deploy initial redirect configuration
		new s3deploy.BucketDeployment(this, 'DeployRedirectConfig', {
			sources: [s3deploy.Source.asset(path.join(__dirname, '../config'))],
			destinationBucket: redirectConfigBucket,
		});

		// Outputs
		new cdk.CfnOutput(this, 'CloudFrontDomainName', {
			value: distribution.distributionDomainName,
			description: 'CloudFront distribution domain name',
		});

		new cdk.CfnOutput(this, 'RedirectConfigBucketName', {
			value: redirectConfigBucket.bucketName,
			description: 'S3 bucket name for redirect configuration',
		});
	}
}