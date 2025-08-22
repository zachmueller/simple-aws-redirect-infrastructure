// Configuration values (replaced during CDK deployment)
const REDIRECT_CONFIG_BUCKET = '{{REDIRECT_CONFIG_BUCKET}}';
const REDIRECT_CONFIG_KEY = '{{REDIRECT_CONFIG_KEY}}';

const AWS = require('aws-sdk');
const s3 = new AWS.S3({ region: 'us-east-1' }); // Lambda@Edge runs in us-east-1

let redirectConfig = null;
let configLastModified = null;

exports.handler = async (event) => {
	const request = event.Records[0].cf.request;
	const uri = request.uri;
	
	try {
		// Extract slug from URI (remove leading slash)
		const slug = uri.substring(1);
		
		// If no slug provided, return a default response
		if (!slug || slug === '') {
			return {
				status: '200',
				statusDescription: 'OK',
				headers: {
					'content-type': [{
						key: 'Content-Type',
						value: 'text/html'
					}],
				},
				body: '<html><body><h1>Personal Redirect Service</h1><p>Provide a valid slug in the URL path.</p></body></html>',
			};
		}

		// Load redirect configuration from S3
		await loadRedirectConfig();
		
		// Check if slug exists in configuration
		if (redirectConfig && redirectConfig[slug]) {
			const redirectInfo = redirectConfig[slug];
			const statusCode = getStatusCode(redirectInfo.type);
			
			return {
				status: statusCode,
				statusDescription: getStatusDescription(redirectInfo.type),
				headers: {
					'location': [{
						key: 'Location',
						value: redirectInfo.target
					}],
					'cache-control': [{
						key: 'Cache-Control',
						value: 'max-age=300' // 5 minutes cache
					}],
				},
			};
		} else {
			// Slug not found, return 404
			return {
				status: '404',
				statusDescription: 'Not Found',
				headers: {
					'content-type': [{
						key: 'Content-Type',
						value: 'text/html'
					}],
				},
				body: '<html><body><h1>404 - Not Found</h1><p>The requested slug was not found.</p></body></html>',
			};
		}
	} catch (error) {
		console.error('Error processing redirect:', error);
		
		// Return error response
		return {
			status: '500',
			statusDescription: 'Internal Server Error',
			headers: {
				'content-type': [{
					key: 'Content-Type',
					value: 'text/html'
				}],
			},
			body: '<html><body><h1>500 - Internal Server Error</h1><p>An error occurred processing your request.</p></body></html>',
		};
	}
};

async function loadRedirectConfig() {
	try {
		// Use the hardcoded values that will be replaced during deployment
		const bucketName = REDIRECT_CONFIG_BUCKET;
		const key = REDIRECT_CONFIG_KEY;
		
		// Get object metadata to check if it's been modified
		const headResult = await s3.headObject({
			Bucket: bucketName,
			Key: key
		}).promise();
		
		// Only reload if config has been modified or we don't have it cached
		if (!redirectConfig || !configLastModified || 
			headResult.LastModified > configLastModified) {
			
			const result = await s3.getObject({
				Bucket: bucketName,
				Key: key
			}).promise();
			
			redirectConfig = JSON.parse(result.Body.toString());
			configLastModified = headResult.LastModified;
			
			console.log('Loaded redirect configuration:', Object.keys(redirectConfig).length, 'slugs');
		}
	} catch (error) {
		console.error('Error loading redirect configuration:', error);
		throw error;
	}
}

function getStatusCode(redirectType) {
	switch (redirectType?.toLowerCase()) {
		case 'permanent':
		case '301':
			return '301';
		case 'temporary':
		case '302':
			return '302';
		case 'see-other':
		case '303':
			return '303';
		case 'temporary-redirect':
		case '307':
			return '307';
		case 'permanent-redirect':
		case '308':
			return '308';
		default:
			return '302'; // Default to temporary redirect
	}
}

function getStatusDescription(redirectType) {
	switch (redirectType?.toLowerCase()) {
		case 'permanent':
		case '301':
			return 'Moved Permanently';
		case 'temporary':
		case '302':
			return 'Found';
		case 'see-other':
		case '303':
			return 'See Other';
		case 'temporary-redirect':
		case '307':
			return 'Temporary Redirect';
		case 'permanent-redirect':
		case '308':
			return 'Permanent Redirect';
		default:
			return 'Found';
	}
}