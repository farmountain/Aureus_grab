# Agent Blueprint Schema Examples

This document demonstrates how to use the enhanced Agent Blueprint schema with deployment targets and capability matrices.

## Basic Agent Blueprint

```typescript
import {
  AgentBlueprint,
  validateAgentBlueprint,
  validateAgentBlueprintComprehensive,
} from '@aureus/kernel';

// Define a basic software agent
const softwareAgent: Partial<AgentBlueprint> = {
  id: 'data-processor-1',
  name: 'Data Processing Agent',
  goal: 'Process and analyze data from multiple sources',
  domain: 'general',
  deviceClass: 'cloud',
  deploymentTarget: 'software',
  requiredCapabilities: [
    'http-client',
    'database',
    'file-system',
    'network',
    'nlp',
  ],
  config: {
    prompt: 'You are a data processing agent. Fetch, process, and analyze data efficiently.',
    temperature: 0.7,
    model: 'gpt-4',
  },
};

// Validate the blueprint
const result = validateAgentBlueprint(softwareAgent);
if (result.success) {
  console.log('Agent blueprint is valid!');
} else {
  console.error('Validation errors:', result.errors);
}
```

## Robotics Agent with Tool Adapters

```typescript
import {
  AgentBlueprint,
  validateAgentBlueprintComprehensive,
  getRequiredCapabilities,
} from '@aureus/kernel';

// Get required capabilities for robotics deployment
const requiredCapabilities = getRequiredCapabilities('robotics');
console.log('Required capabilities for robotics:', requiredCapabilities);
// Output: ['motors', 'servos', 'camera', 'lidar', 'imu', 'object-detection', 'real-time', 'low-latency']

// Define a robotics agent with complete tool adapters
const roboticsAgent: Partial<AgentBlueprint> = {
  id: 'nav-robot-1',
  name: 'Navigation Robot',
  goal: 'Navigate autonomously in dynamic environments',
  domain: 'robotics',
  deviceClass: 'robot',
  deploymentTarget: 'robotics',
  requiredCapabilities: [
    'motors',
    'servos',
    'camera',
    'lidar',
    'imu',
    'object-detection',
    'real-time',
    'low-latency',
  ],
  toolAdapters: [
    {
      adapterId: 'camera-adapter',
      adapterType: 'perception',
      name: 'RGB Camera',
      enabled: true,
      requiredCapabilities: ['camera', 'object-detection'],
      configuration: {
        fps: 30,
        resolution: '1920x1080',
      },
    },
    {
      adapterId: 'lidar-adapter',
      adapterType: 'sensor',
      name: 'LiDAR Scanner',
      enabled: true,
      requiredCapabilities: ['lidar'],
      configuration: {
        scanRate: 10,
        range: 30,
      },
    },
    {
      adapterId: 'imu-adapter',
      adapterType: 'sensor',
      name: 'IMU Sensor',
      enabled: true,
      requiredCapabilities: ['imu'],
    },
    {
      adapterId: 'motor-controller',
      adapterType: 'actuator',
      name: 'Motor Controller',
      enabled: true,
      requiredCapabilities: ['motors', 'servos', 'real-time', 'low-latency'],
    },
  ],
  config: {
    prompt: 'You are a navigation robot. Navigate safely while avoiding obstacles.',
    temperature: 0.3,
  },
  policies: [
    {
      policyId: 'safety-policy',
      name: 'Robot Safety Policy',
      enabled: true,
      rules: [
        {
          type: 'collision_avoidance',
          description: 'Prevent collisions with obstacles',
        },
        {
          type: 'emergency_stop',
          description: 'Enable emergency stop capability',
        },
      ],
    },
  ],
};

// Comprehensive validation with capability checks
const result = validateAgentBlueprintComprehensive(roboticsAgent);
if (result.success) {
  console.log('Agent blueprint is valid!');
  if (result.warnings) {
    console.warn('Warnings:', result.warnings);
  }
} else {
  console.error('Validation errors:', result.errors);
}
```

## Humanoid Agent

```typescript
import { AgentBlueprint } from '@aureus/kernel';

const humanoidAgent: Partial<AgentBlueprint> = {
  id: 'humanoid-assistant-1',
  name: 'Humanoid Assistant',
  goal: 'Assist humans with physical tasks and social interaction',
  domain: 'robotics',
  deviceClass: 'humanoid',
  deploymentTarget: 'humanoid',
  requiredCapabilities: [
    'motors',
    'servos',
    'arms',
    'legs',
    'camera',
    'microphone',
    'speaker',
    'imu',
    'object-detection',
    'face-recognition',
    'speech-recognition',
    'gesture-recognition',
    'real-time',
    'low-latency',
  ],
  toolAdapters: [
    {
      adapterId: 'vision-system',
      adapterType: 'perception',
      name: 'Vision System',
      enabled: true,
      requiredCapabilities: ['camera', 'object-detection', 'face-recognition', 'gesture-recognition'],
    },
    {
      adapterId: 'audio-system',
      adapterType: 'perception',
      name: 'Audio System',
      enabled: true,
      requiredCapabilities: ['microphone', 'speaker', 'speech-recognition'],
    },
    {
      adapterId: 'motion-control',
      adapterType: 'actuator',
      name: 'Motion Controller',
      enabled: true,
      requiredCapabilities: ['motors', 'servos', 'arms', 'legs', 'real-time', 'low-latency'],
    },
    {
      adapterId: 'imu-system',
      adapterType: 'sensor',
      name: 'IMU System',
      enabled: true,
      requiredCapabilities: ['imu'],
    },
  ],
  config: {
    prompt: 'You are a humanoid robot assistant. Interact naturally with humans and assist with tasks.',
    temperature: 0.7,
  },
};
```

## Retail Agent

```typescript
import { AgentBlueprint } from '@aureus/kernel';

const retailAgent: Partial<AgentBlueprint> = {
  id: 'retail-assistant-1',
  name: 'Retail Assistant',
  goal: 'Assist customers with purchases and product recommendations',
  domain: 'retail',
  deviceClass: 'desktop',
  deploymentTarget: 'retail',
  requiredCapabilities: [
    'payment-api',
    'database',
    'http-client',
    'camera',
    'ocr',
    'touchscreen',
    'display',
  ],
  toolAdapters: [
    {
      adapterId: 'payment-processor',
      adapterType: 'api',
      name: 'Payment Processor',
      enabled: true,
      requiredCapabilities: ['payment-api'],
    },
    {
      adapterId: 'product-database',
      adapterType: 'api',
      name: 'Product Database',
      enabled: true,
      requiredCapabilities: ['database', 'http-client'],
    },
    {
      adapterId: 'camera-ocr',
      adapterType: 'perception',
      name: 'Camera with OCR',
      enabled: true,
      requiredCapabilities: ['camera', 'ocr'],
    },
  ],
  config: {
    prompt: 'You are a retail assistant. Help customers find products and complete purchases.',
    temperature: 0.8,
  },
};
```

## Using Capability Matrices

```typescript
import { getRequiredCapabilities } from '@aureus/kernel';
import {
  validateRoboticsCapabilities,
  RoboticsCapability,
} from '@aureus/robotics';
import {
  validateToolCapabilities,
  getRecommendedToolCapabilities,
} from '@aureus/tools';
import {
  validatePerceptionCapabilities,
  getRecommendedPerceptionCapabilities,
} from '@aureus/perception';

// Check required capabilities for different deployment targets
const roboticsCapabilities = getRequiredCapabilities('robotics');
const smartphoneCapabilities = getRequiredCapabilities('smartphone');
const travelCapabilities = getRequiredCapabilities('travel');

console.log('Robotics needs:', roboticsCapabilities);
console.log('Smartphone needs:', smartphoneCapabilities);
console.log('Travel needs:', travelCapabilities);

// Validate robotics capabilities
const roboticsValidation = validateRoboticsCapabilities(
  'mobile-robot',
  ['motors', 'camera', 'lidar', 'imu', 'object-detection', 'real-time']
);

if (!roboticsValidation.valid) {
  console.log('Missing robotics capabilities:', roboticsValidation.missingCapabilities);
  console.log('Recommendations:', roboticsValidation.recommendations);
}

// Get recommended tool capabilities
const cloudToolCapabilities = getRecommendedToolCapabilities('cloud');
console.log('Recommended tools for cloud:', cloudToolCapabilities);

// Get recommended perception capabilities
const smartGlassesPerception = getRecommendedPerceptionCapabilities('smart-glasses');
console.log('Recommended perception for smart-glasses:', smartGlassesPerception);
```

## Validating Tool Adapter Capabilities

```typescript
import {
  validateToolAdapterCapabilities,
  validateDeploymentTargetCompatibility,
} from '@aureus/kernel';

// Check if tool adapters provide required capabilities
const toolAdapters = [
  {
    adapterId: 'http-client',
    adapterType: 'api' as const,
    name: 'HTTP Client',
    enabled: true,
    requiredCapabilities: ['http-client', 'network'],
  },
  {
    adapterId: 'database-connector',
    adapterType: 'api' as const,
    name: 'Database Connector',
    enabled: true,
    requiredCapabilities: ['database'],
  },
];

const requiredCapabilities = ['http-client', 'database', 'file-system'];

const validation = validateToolAdapterCapabilities(
  toolAdapters,
  requiredCapabilities as any
);

if (!validation.compatible) {
  console.log('Missing capabilities from adapters:', validation.missingCapabilities);
}

// Check deployment target compatibility
const agent = {
  id: 'test-agent',
  name: 'Test Agent',
  goal: 'Test deployment compatibility',
  deploymentTarget: 'robotics' as const,
  requiredCapabilities: ['camera', 'motors'], // Missing some required capabilities
  config: {
    prompt: 'Test prompt',
  },
};

const targetValidation = validateDeploymentTargetCompatibility(agent as any);
if (!targetValidation.compatible) {
  console.log('Missing capabilities for deployment target:', targetValidation.missingCapabilities);
}
```

## Schema Types

The following types are available for use:

- `Domain`: Agent domain specialization
- `DeviceClass`: Target device class
- `DeploymentTarget`: Deployment environment/target
- `Capability`: Required capability for agent operation
- `ToolAdapter`: Tool adapter configuration
- `AgentBlueprint`: Complete agent blueprint schema

## Deployment Targets

Supported deployment targets:
- `robotics`: General purpose robots
- `humanoid`: Humanoid robots
- `software`: Software-only agents (cloud/server)
- `travel`: Travel and navigation applications
- `retail`: Retail and point-of-sale systems
- `industrial`: Industrial automation
- `smartphone`: Mobile phone applications
- `desktop`: Desktop applications
- `smart-glasses`: Augmented reality glasses
- `cloud`: Cloud-based services
- `edge`: Edge computing devices

Each deployment target has a pre-defined set of required capabilities that can be retrieved using `getRequiredCapabilities(target)`.
