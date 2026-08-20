import { defineBackend } from '@aws-amplify/backend';
import { FargateStack } from './custom/fargate-resource';

/**
 * @database MongoDB Atlas
 * @description AnyControl Remote Amplify Backend Entrypoint.
 */
const backend = defineBackend({});

// Add the custom Fargate deployment stack to the Amplify backend.
new FargateStack(
  backend.createStack('FargateStack'),
  'FargateStack'
);
