import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

export class DynamicHtmlAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. S3 Bucket for Static Assets (optional, can be used for images/CSS)
    const bucket = new s3.Bucket(this, 'WebAppBucket', {
      publicReadAccess: false, // Important: Keep this private.  CloudFront will access it.
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Enforce no public access
    });

    // 2. Lambda Function to Generate Dynamic HTML
    const dynamicHtmlFunction = new lambda.Function(this, 'DynamicHtmlFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'), // Assumes lambda code is in the 'lambda' directory
      environment: {
        SSM_PARAMETER_NAME: '/dynamic-html/string', // Name of the SSM Parameter
      },
    });

    // Allow the Lambda function to read the SSM Parameter
    dynamicHtmlFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/dynamic-html/string`],
    }));


    // 3. API Gateway to Trigger the Lambda Function
    const api = new apigateway.LambdaRestApi(this, 'DynamicHtmlApi', {
      handler: dynamicHtmlFunction,
      proxy: false, // Disable default integration to define explicitly
    });

    const htmlResource = api.root.addResource('html');
    htmlResource.addMethod('GET'); // Expose GET method


    // 4. CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'WebAppDistribution', {
      defaultBehavior: {
        origin: new cloudfront_origins.HttpOrigin(`${api.restApiId}.execute-api.${this.region}.amazonaws.com`, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY, // Enforce HTTPS
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS, // Redirect HTTP to HTTPS
      },
      defaultRootObject: 'html', //  API Gateway endpoint
    });


    // 5.  SSM Parameter to store the dynamic string
    new StringParameter(this, 'DynamicStringParameter', {
      parameterName: '/dynamic-html/string',
      stringValue: 'Initial Dynamic String', // Default value
    });

    // Output the CloudFront URL
    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: distribution.domainName,
    });

  }
}
