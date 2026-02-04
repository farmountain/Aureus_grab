/**
 * Integration test demonstrating the Agent Blueprint schema
 * with deployment targets and capability matrices
 */

import { describe, it, expect } from 'vitest';
import {
  AgentBlueprint,
  validateAgentBlueprintComprehensive,
  getRequiredCapabilities,
  DeploymentTarget,
} from '@aureus/kernel';

describe('Agent Blueprint Integration with Capability Matrices', () => {
  it('should create a valid robotics agent blueprint', () => {
    const roboticsBlueprint: Partial<AgentBlueprint> = {
      id: 'robot-nav-agent',
      name: 'Navigation Robot Agent',
      goal: 'Navigate autonomously and avoid obstacles',
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
        },
        {
          adapterId: 'lidar-adapter',
          adapterType: 'sensor',
          name: 'LiDAR Scanner',
          enabled: true,
          requiredCapabilities: ['lidar'],
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
        prompt: 'You are a navigation robot. Your goal is to navigate safely while avoiding obstacles.',
        temperature: 0.3,
        model: 'gpt-4',
      },
      policies: [
        {
          policyId: 'safety-policy',
          name: 'Robot Safety Policy',
          enabled: true,
          rules: [
            {
              type: 'collision_avoidance',
              description: 'Prevent collisions',
            },
            {
              type: 'emergency_stop',
              description: 'Enable emergency stop',
            },
          ],
        },
      ],
    };

    const result = validateAgentBlueprintComprehensive(roboticsBlueprint);
    expect(result.success).toBe(true);
    expect(result.data?.deploymentTarget).toBe('robotics');
    expect(result.warnings).toBeUndefined(); // No warnings for complete blueprint
  });

  it('should create a valid software agent blueprint', () => {
    const softwareBlueprint: Partial<AgentBlueprint> = {
      id: 'data-processor-agent',
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
      toolAdapters: [
        {
          adapterId: 'http-client',
          adapterType: 'api',
          name: 'HTTP Client',
          enabled: true,
          requiredCapabilities: ['http-client', 'network'],
        },
        {
          adapterId: 'database-connector',
          adapterType: 'api',
          name: 'Database Connector',
          enabled: true,
          requiredCapabilities: ['database'],
        },
      ],
      config: {
        prompt: 'You are a data processing agent. Fetch, process, and analyze data.',
        temperature: 0.7,
      },
    };

    const result = validateAgentBlueprintComprehensive(softwareBlueprint);
    expect(result.success).toBe(true);
    expect(result.data?.deploymentTarget).toBe('software');
  });

  it('should create a valid retail agent blueprint', () => {
    const retailBlueprint: Partial<AgentBlueprint> = {
      id: 'retail-assistant-agent',
      name: 'Retail Assistant Agent',
      goal: 'Assist customers with purchases and provide product recommendations',
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

    const result = validateAgentBlueprintComprehensive(retailBlueprint);
    expect(result.success).toBe(true);
    expect(result.data?.deploymentTarget).toBe('retail');
  });

  it('should warn about missing capabilities for deployment target', () => {
    const incompleteBlueprint: Partial<AgentBlueprint> = {
      id: 'incomplete-robot',
      name: 'Incomplete Robot',
      goal: 'Navigate but missing sensors',
      deploymentTarget: 'robotics',
      requiredCapabilities: ['camera'], // Missing many required capabilities
      config: {
        prompt: 'Incomplete robot agent',
      },
    };

    const result = validateAgentBlueprintComprehensive(incompleteBlueprint);
    expect(result.success).toBe(true);
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.length).toBeGreaterThan(0);
    expect(result.warnings![0]).toContain('missing required capabilities');
  });

  it('should get required capabilities for each deployment target', () => {
    const targets: DeploymentTarget[] = [
      'robotics',
      'humanoid',
      'software',
      'travel',
      'retail',
      'industrial',
      'smartphone',
      'desktop',
      'smart-glasses',
      'cloud',
      'edge',
    ];

    targets.forEach((target) => {
      const capabilities = getRequiredCapabilities(target);
      expect(Array.isArray(capabilities)).toBe(true);
      expect(capabilities.length).toBeGreaterThan(0);
    });

    // Verify specific capabilities for robotics
    const roboticsCapabilities = getRequiredCapabilities('robotics');
    expect(roboticsCapabilities).toContain('motors');
    expect(roboticsCapabilities).toContain('camera');
    expect(roboticsCapabilities).toContain('object-detection');

    // Verify specific capabilities for humanoid
    const humanoidCapabilities = getRequiredCapabilities('humanoid');
    expect(humanoidCapabilities).toContain('arms');
    expect(humanoidCapabilities).toContain('legs');
    expect(humanoidCapabilities).toContain('face-recognition');
  });

  it('should validate humanoid agent with complete capabilities', () => {
    const humanoidBlueprint: Partial<AgentBlueprint> = {
      id: 'humanoid-assistant',
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
          adapterId: 'imu-system',
          adapterType: 'sensor',
          name: 'IMU System',
          enabled: true,
          requiredCapabilities: ['imu'],
        },
        {
          adapterId: 'motion-control',
          adapterType: 'actuator',
          name: 'Motion Controller',
          enabled: true,
          requiredCapabilities: ['motors', 'servos', 'arms', 'legs', 'real-time', 'low-latency'],
        },
      ],
      config: {
        prompt: 'You are a humanoid robot assistant. Interact naturally with humans.',
        temperature: 0.7,
      },
    };

    const result = validateAgentBlueprintComprehensive(humanoidBlueprint);
    expect(result.success).toBe(true);
    expect(result.data?.deploymentTarget).toBe('humanoid');
    expect(result.warnings).toBeUndefined();
  });
});
