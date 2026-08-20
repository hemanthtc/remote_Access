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
const path = __importStar(require("path"));
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
                image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../backend')),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmFyZ2F0ZS1yZXNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImZhcmdhdGUtcmVzb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHlEQUEyQztBQUMzQyx5REFBMkM7QUFDM0MsMEVBQTREO0FBQzVELDJDQUE2QjtBQUU3Qjs7R0FFRztBQUNILE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3pDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsc0NBQXNDO1FBQ3RDLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzdDLE1BQU0sRUFBRSxDQUFDLEVBQUUseURBQXlEO1NBQ3JFLENBQUMsQ0FBQztRQUVILDRCQUE0QjtRQUM1QixNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3pELEdBQUc7U0FDSixDQUFDLENBQUM7UUFFSCxzRUFBc0U7UUFDdEUsTUFBTSxjQUFjLEdBQUcsSUFBSSxXQUFXLENBQUMscUNBQXFDLENBQzFFLElBQUksRUFDSiwwQkFBMEIsRUFDMUI7WUFDRSxPQUFPO1lBQ1AsR0FBRyxFQUFFLEdBQUcsRUFBVSx1REFBdUQ7WUFDekUsY0FBYyxFQUFFLEdBQUcsRUFBRSx3Q0FBd0M7WUFDN0QsWUFBWSxFQUFFLENBQUMsRUFBRyxxQ0FBcUM7WUFDdkQsZ0JBQWdCLEVBQUU7Z0JBQ2hCLDBFQUEwRTtnQkFDMUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLGVBQWUsQ0FBQyxDQUFDO2dCQUMxRSxhQUFhLEVBQUUsSUFBSTtnQkFDbkIsV0FBVyxFQUFFO29CQUNYLFNBQVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsSUFBSSxFQUFFO29CQUN0QyxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxPQUFPLElBQUksWUFBWTtvQkFDNUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLHFDQUFxQztpQkFDNUU7YUFDRjtZQUNELGtCQUFrQixFQUFFLElBQUksRUFBRSxvQ0FBb0M7U0FDL0QsQ0FDRixDQUFDO1FBRUYsdURBQXVEO1FBQ3ZELGNBQWMsQ0FBQyxXQUFXLENBQUMsb0JBQW9CLENBQUM7WUFDOUMsSUFBSSxFQUFFLE9BQU87WUFDYixJQUFJLEVBQUUsTUFBTTtTQUNiLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsVUFBVSxjQUFjLENBQUMsWUFBWSxDQUFDLG1CQUFtQixFQUFFO1lBQ2xFLFdBQVcsRUFBRSx1REFBdUQ7U0FDckUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBakRELG9DQWlEQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcbmltcG9ydCAqIGFzIGVjcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNzJztcbmltcG9ydCAqIGFzIGVjc1BhdHRlcm5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lY3MtcGF0dGVybnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLyoqXG4gKiBDdXN0b20gQ0RLIFN0YWNrIHRvIGRlcGxveSB0aGUgQW55Q29udHJvbCBSZW1vdGUgYmFja2VuZCB0byBBV1MgRUNTL0ZhcmdhdGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBGYXJnYXRlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyAxLiBDcmVhdGUgYSBWUEMgdG8gaG9zdCB0aGUgY2x1c3RlclxuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdBbnlDb250cm9sVnBjJywge1xuICAgICAgbWF4QXpzOiAyLCAvLyBLZWVwIGNvc3QgbWluaW1hbCBieSBkZXBsb3lpbmcgaW4gMiBBdmFpbGFiaWxpdHkgWm9uZXNcbiAgICB9KTtcblxuICAgIC8vIDIuIENyZWF0ZSB0aGUgRUNTIENsdXN0ZXJcbiAgICBjb25zdCBjbHVzdGVyID0gbmV3IGVjcy5DbHVzdGVyKHRoaXMsICdBbnlDb250cm9sQ2x1c3RlcicsIHtcbiAgICAgIHZwYyxcbiAgICB9KTtcblxuICAgIC8vIDMuIERlcGxveSB0aGUgYmFja2VuZCBEb2NrZXIgY29udGFpbmVyIG9udG8gRUNTIEZhcmdhdGUgd2l0aCBhbiBBTEJcbiAgICBjb25zdCBmYXJnYXRlU2VydmljZSA9IG5ldyBlY3NQYXR0ZXJucy5BcHBsaWNhdGlvbkxvYWRCYWxhbmNlZEZhcmdhdGVTZXJ2aWNlKFxuICAgICAgdGhpcyxcbiAgICAgICdBbnlDb250cm9sRmFyZ2F0ZVNlcnZpY2UnLFxuICAgICAge1xuICAgICAgICBjbHVzdGVyLFxuICAgICAgICBjcHU6IDI1NiwgICAgICAgICAvLyBNaW5pbWFsIENQVSBhbGxvY2F0aW9uICgwLjI1IHZDUFUpIGZvciBkZXYgLyB0ZXN0aW5nXG4gICAgICAgIG1lbW9yeUxpbWl0TWlCOiA1MTIsIC8vIE1pbmltYWwgUkFNICg1MTJNQikgZm9yIGRldiAvIHRlc3RpbmdcbiAgICAgICAgZGVzaXJlZENvdW50OiAxLCAgLy8gUnVuIDEgaW5zdGFuY2Ugb2YgdGhlIGJhY2tlbmQgdGFza1xuICAgICAgICB0YXNrSW1hZ2VPcHRpb25zOiB7XG4gICAgICAgICAgLy8gUG9pbnQgdG8gbG9jYWwgYmFja2VuZCBmb2xkZXIgdG8gYnVpbGQgYW5kIHB1c2ggY29udGFpbmVyIGF1dG9tYXRpY2FsbHlcbiAgICAgICAgICBpbWFnZTogZWNzLkNvbnRhaW5lckltYWdlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vYmFja2VuZCcpKSxcbiAgICAgICAgICBjb250YWluZXJQb3J0OiA4MDAxLFxuICAgICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgICBNT05HT19VUkw6IHByb2Nlc3MuZW52Lk1PTkdPX1VSTCB8fCAnJyxcbiAgICAgICAgICAgIERCX05BTUU6IHByb2Nlc3MuZW52LkRCX05BTUUgfHwgJ2FueWNvbnRyb2wnLFxuICAgICAgICAgICAgSldUX1NFQ1JFVDogcHJvY2Vzcy5lbnYuSldUX1NFQ1JFVCB8fCAnY2hhbmdlLW1lLXdpdGgtYS02NC1jaGFyLWhleC1zZWNyZXQnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHB1YmxpY0xvYWRCYWxhbmNlcjogdHJ1ZSwgLy8gRXhwb3NlIHRoZSBsb2FkIGJhbGFuY2VyIHB1YmxpY2x5XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIDQuIENvbmZpZ3VyZSBoZWFsdGggY2hlY2sgb24gdGhlIEZhc3RBUEkgL2FwaS8gcm91dGVcbiAgICBmYXJnYXRlU2VydmljZS50YXJnZXRHcm91cC5jb25maWd1cmVIZWFsdGhDaGVjayh7XG4gICAgICBwYXRoOiAnL2FwaS8nLFxuICAgICAgcG9ydDogJzgwMDEnLFxuICAgIH0pO1xuXG4gICAgLy8gNS4gT3V0cHV0IHRoZSBkZXBsb3ltZW50IFVSTCBmb3IgcmVmZXJlbmNlXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0JhY2tlbmRVUkwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHA6Ly8ke2ZhcmdhdGVTZXJ2aWNlLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJEbnNOYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBETlMgbmFtZSBvZiB0aGUgYmFja2VuZCBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyJyxcbiAgICB9KTtcbiAgfVxufVxuIl19