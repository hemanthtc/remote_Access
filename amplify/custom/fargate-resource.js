"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FargateStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const ecsPatterns = __importStar(require("aws-cdk-lib/aws-ecs-patterns"));
/**
 * Custom CDK Stack to deploy the AnyControl Remote backend to AWS ECS/Fargate.
 */
class FargateStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'AnyControlFargateService', {
            cluster,
            cpu: 256, // Minimal CPU allocation (0.25 vCPU) for dev / testing
            memoryLimitMiB: 512, // Minimal RAM (512MB) for dev / testing
            desiredCount: 1, // Run 1 instance of the backend task
            taskImageOptions: {
                // Point to local backend folder to build and push container automatically
                image: ecs.ContainerImage.fromAsset('../backend'),
                containerPort: 8001,
                environment: {
                    MONGO_URL: process.env.MONGO_URL || '',
                    DB_NAME: process.env.DB_NAME || 'anycontrol',
                    JWT_SECRET: process.env.JWT_SECRET || 'change-me-with-a-64-char-hex-secret',
                },
            },
            publicLoadBalancer: true, // Expose the load balancer publicly
        });
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
exports.FargateStack = FargateStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmFyZ2F0ZS1yZXNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImZhcmdhdGUtcmVzb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsMEVBQTREO0FBVzVEOztHQUVHO0FBQ0gsTUFBYSxZQUFhLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixzQ0FBc0M7UUFDdEMsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDN0MsTUFBTSxFQUFFLENBQUMsRUFBRSx5REFBeUQ7U0FDckUsQ0FBQyxDQUFDO1FBRUgsNEJBQTRCO1FBQzVCLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDekQsR0FBRztTQUNKLENBQUMsQ0FBQztRQUVILHNFQUFzRTtRQUN0RSxNQUFNLGNBQWMsR0FBRyxJQUFJLFdBQVcsQ0FBQyxxQ0FBcUMsQ0FDMUUsSUFBSSxFQUNKLDBCQUEwQixFQUMxQjtZQUNFLE9BQU87WUFDUCxHQUFHLEVBQUUsR0FBRyxFQUFVLHVEQUF1RDtZQUN6RSxjQUFjLEVBQUUsR0FBRyxFQUFFLHdDQUF3QztZQUM3RCxZQUFZLEVBQUUsQ0FBQyxFQUFHLHFDQUFxQztZQUN2RCxnQkFBZ0IsRUFBRTtnQkFDaEIsMEVBQTBFO2dCQUMxRSxLQUFLLEVBQUUsR0FBRyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDO2dCQUNqRCxhQUFhLEVBQUUsSUFBSTtnQkFDbkIsV0FBVyxFQUFFO29CQUNYLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsSUFBSSxFQUFFO29CQUN0QyxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksWUFBWTtvQkFDNUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLHFDQUFxQztpQkFDNUU7YUFDRjtZQUNELGtCQUFrQixFQUFFLElBQUksRUFBRSxvQ0FBb0M7U0FDL0QsQ0FDRixDQUFDO1FBRUYsdURBQXVEO1FBQ3ZELGNBQWMsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUM7WUFDOUMsSUFBSSxFQUFFLE9BQU87WUFDYixJQUFJLEVBQUUsTUFBTTtTQUNiLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsVUFBVSxjQUFjLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFO1lBQ2xFLFdBQVcsRUFBRSx1REFBdUQ7U0FDckUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBakRELG9DQWlEQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XHJcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcclxuaW1wb3J0ICogYXMgZWNzUGF0dGVybnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjcy1wYXR0ZXJucyc7XHJcblxyXG5kZWNsYXJlIGNvbnN0IHByb2Nlc3M6IHtcclxuICBlbnY6IHtcclxuICAgIE1PTkdPX1VSTD86IHN0cmluZztcclxuICAgIERCX05BTUU/OiBzdHJpbmc7XHJcbiAgICBKV1RfU0VDUkVUPzogc3RyaW5nO1xyXG4gICAgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkO1xyXG4gIH07XHJcbn07XHJcblxyXG4vKipcclxuICogQ3VzdG9tIENESyBTdGFjayB0byBkZXBsb3kgdGhlIEFueUNvbnRyb2wgUmVtb3RlIGJhY2tlbmQgdG8gQVdTIEVDUy9GYXJnYXRlLlxyXG4gKi9cclxuZXhwb3J0IGNsYXNzIEZhcmdhdGVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgLy8gMS4gQ3JlYXRlIGEgVlBDIHRvIGhvc3QgdGhlIGNsdXN0ZXJcclxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdBbnlDb250cm9sVnBjJywge1xyXG4gICAgICBtYXhBenM6IDIsIC8vIEtlZXAgY29zdCBtaW5pbWFsIGJ5IGRlcGxveWluZyBpbiAyIEF2YWlsYWJpbGl0eSBab25lc1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gMi4gQ3JlYXRlIHRoZSBFQ1MgQ2x1c3RlclxyXG4gICAgY29uc3QgY2x1c3RlciA9IG5ldyBlY3MuQ2x1c3Rlcih0aGlzLCAnQW55Q29udHJvbENsdXN0ZXInLCB7XHJcbiAgICAgIHZwYyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIDMuIERlcGxveSB0aGUgYmFja2VuZCBEb2NrZXIgY29udGFpbmVyIG9udG8gRUNTIEZhcmdhdGUgd2l0aCBhbiBBTEJcclxuICAgIGNvbnN0IGZhcmdhdGVTZXJ2aWNlID0gbmV3IGVjc1BhdHRlcm5zLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VkRmFyZ2F0ZVNlcnZpY2UoXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgICdBbnlDb250cm9sRmFyZ2F0ZVNlcnZpY2UnLFxyXG4gICAgICB7XHJcbiAgICAgICAgY2x1c3RlcixcclxuICAgICAgICBjcHU6IDI1NiwgICAgICAgICAvLyBNaW5pbWFsIENQVSBhbGxvY2F0aW9uICgwLjI1IHZDUFUpIGZvciBkZXYgLyB0ZXN0aW5nXHJcbiAgICAgICAgbWVtb3J5TGltaXRNaUI6IDUxMiwgLy8gTWluaW1hbCBSQU0gKDUxMk1CKSBmb3IgZGV2IC8gdGVzdGluZ1xyXG4gICAgICAgIGRlc2lyZWRDb3VudDogMSwgIC8vIFJ1biAxIGluc3RhbmNlIG9mIHRoZSBiYWNrZW5kIHRhc2tcclxuICAgICAgICB0YXNrSW1hZ2VPcHRpb25zOiB7XHJcbiAgICAgICAgICAvLyBQb2ludCB0byBsb2NhbCBiYWNrZW5kIGZvbGRlciB0byBidWlsZCBhbmQgcHVzaCBjb250YWluZXIgYXV0b21hdGljYWxseVxyXG4gICAgICAgICAgaW1hZ2U6IGVjcy5Db250YWluZXJJbWFnZS5mcm9tQXNzZXQoJy4uL2JhY2tlbmQnKSxcclxuICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwMDEsXHJcbiAgICAgICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgICAgICBNT05HT19VUkw6IHByb2Nlc3MuZW52Lk1PTkdPX1VSTCB8fCAnJyxcclxuICAgICAgICAgICAgREJfTkFNRTogcHJvY2Vzcy5lbnYuREJfTkFNRSB8fCAnYW55Y29udHJvbCcsXHJcbiAgICAgICAgICAgIEpXVF9TRUNSRVQ6IHByb2Nlc3MuZW52LkpXVF9TRUNSRVQgfHwgJ2NoYW5nZS1tZS13aXRoLWEtNjQtY2hhci1oZXgtc2VjcmV0JyxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICBwdWJsaWNMb2FkQmFsYW5jZXI6IHRydWUsIC8vIEV4cG9zZSB0aGUgbG9hZCBiYWxhbmNlciBwdWJsaWNseVxyXG4gICAgICB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIDQuIENvbmZpZ3VyZSBoZWFsdGggY2hlY2sgb24gdGhlIEZhc3RBUEkgL2FwaS8gcm91dGVcclxuICAgIGZhcmdhdGVTZXJ2aWNlLnRhcmdldEdyb3VwLmNvbmZpZ3VyZUhlYWx0aENoZWNrKHtcclxuICAgICAgcGF0aDogJy9hcGkvJyxcclxuICAgICAgcG9ydDogJzgwMDEnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gNS4gT3V0cHV0IHRoZSBkZXBsb3ltZW50IFVSTCBmb3IgcmVmZXJlbmNlXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQmFja2VuZFVSTCcsIHtcclxuICAgICAgdmFsdWU6IGBodHRwOi8vJHtmYXJnYXRlU2VydmljZS5sb2FkQmFsYW5jZXIubG9hZEJhbGFuY2VyRG5zTmFtZX1gLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBETlMgbmFtZSBvZiB0aGUgYmFja2VuZCBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyJyxcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=