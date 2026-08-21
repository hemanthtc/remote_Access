import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
/**
 * Custom CDK Stack to deploy the AnyControl Remote backend to AWS ECS/Fargate.
 */
export declare class FargateStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
