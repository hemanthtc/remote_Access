import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as path from 'path';

/**
 * Custom CDK Stack to deploy the AnyControl Remote backend to AWS ECS/Fargate.
 */
export class FargateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Create a VPC to host the cluster
    const vpc = new ec2.Vpc(this, 'AnyControlVpc', {
      maxAzs: 2, // Keep cost minimal by deploying in 2 Availability Zones
    });

    // 2. Create the ECS Cluster
    const cluster = new ecs.Cluster(this, 'AnyControlCluster', {
      vpc,
    });

    // 3. Deploy the backend Docker container onto ECS Fargate with an ALB
    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this,
      'AnyControlFargateService',
      {
        cluster,
        cpu: 256,         // Minimal CPU allocation (0.25 vCPU) for dev / testing
        memoryLimitMiB: 512, // Minimal RAM (512MB) for dev / testing
        desiredCount: 1,  // Run 1 instance of the backend task
        taskImageOptions: {
          // Point to local backend folder to build and push container automatically
          image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../backend')),
          containerPort: 8001,
          environment: {
            MONGO_URL: process.env.MONGO_URL || '',
            DB_NAME: process.env.DB_NAME || 'anycontrol',
            JWT_SECRET: process.env.JWT_SECRET || 'change-me-with-a-64-char-hex-secret',
          },
        },
        publicLoadBalancer: true, // Expose the load balancer publicly
      }
    );

    // 4. Configure health check on the FastAPI /api/ route
    fargateService.targetGroup.configureHealthCheck({
      path: '/api/',
      port: '8001',
    });

    // 5. Output the deployment URL for reference
    new cdk.CfnOutput(this, 'BackendURL', {
      value: `http://${fargateService.loadBalancer.loadBalancerDnsName}`,
      description: 'The DNS name of the backend Application Load Balancer',
    });
  }
}
