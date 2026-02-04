import { describe, it, expect } from 'vitest';
import {
  AgentBlueprint,
  validateAgentBlueprint,
  getRequiredCapabilities,
  validateDeploymentTargetCompatibility,
  validateAgentBlueprintComprehensive,
  DeploymentTargetCapabilitiesMap,
} from '../src/agent-spec-schema';

/**
 * Comprehensive unit tests for agent blueprint schemas
 * Covers deployment targets, capabilities, and domain-specific validation
 */
describe('Agent Blueprint Domain-Specific Tests', () => {
  
  describe('Robotics Domain', () => {
    it('should validate robotics agent with required capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'robot-001',
        name: 'Mobile Robot Agent',
        version: '1.0.0',
        goal: 'Navigate warehouse and transport items autonomously',
        riskProfile: 'HIGH',
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
        config: {
          prompt: 'You are a warehouse robot that navigates safely and efficiently',
          temperature: 0.3,
          model: 'gpt-4',
        },
        tools: [
          {
            toolId: 'motor-controller',
            name: 'Motor Controller',
            enabled: true,
            permissions: ['write'],
            riskTier: 'HIGH',
          },
          {
            toolId: 'camera-feed',
            name: 'Camera Feed',
            enabled: true,
            permissions: ['read'],
            riskTier: 'LOW',
          },
        ],
        toolAdapters: [
          {
            adapterId: 'lidar-adapter',
            adapterType: 'sensor',
            name: 'LiDAR Sensor',
            enabled: true,
            requiredCapabilities: ['lidar', 'real-time'],
          },
        ],
        policies: [
          {
            policyId: 'safety-zone',
            name: 'Safety Zone Policy',
            enabled: true,
            rules: [
              {
                type: 'geofence',
                description: 'Restrict movement to warehouse area',
                parameters: { zone: 'warehouse-floor-1' },
              },
            ],
          },
        ],
        workflows: [],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data?.domain).toBe('robotics');
      expect(result.data?.deploymentTarget).toBe('robotics');
    });

    it('should validate robotics deployment target compatibility', () => {
      const blueprint: AgentBlueprint = {
        id: 'robot-002',
        name: 'Basic Robot',
        version: '1.0.0',
        goal: 'Perform basic robotic tasks',
        riskProfile: 'MEDIUM',
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
        config: {
          prompt: 'You are a robot assistant',
          temperature: 0.5,
        },
        tools: [],
        policies: [],
        workflows: [],
      };

      const compatResult = validateDeploymentTargetCompatibility(blueprint);
      expect(compatResult.compatible).toBe(true);
      expect(compatResult.missingCapabilities).toHaveLength(0);
    });

    it('should detect missing robotics capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'robot-003',
        name: 'Incomplete Robot',
        version: '1.0.0',
        goal: 'Robot with missing capabilities',
        riskProfile: 'MEDIUM',
        deploymentTarget: 'robotics',
        requiredCapabilities: ['camera', 'motors'], // Missing many required capabilities
        config: {
          prompt: 'Robot with missing capabilities',
          temperature: 0.5,
        },
        tools: [],
        policies: [],
        workflows: [],
      };

      const compatResult = validateDeploymentTargetCompatibility(blueprint);
      expect(compatResult.compatible).toBe(false);
      expect(compatResult.missingCapabilities.length).toBeGreaterThan(0);
      expect(compatResult.missingCapabilities).toContain('lidar');
      expect(compatResult.missingCapabilities).toContain('imu');
    });
  });

  describe('Retail Domain', () => {
    it('should validate retail agent with payment and POS capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'retail-001',
        name: 'Retail Assistant Agent',
        version: '1.0.0',
        goal: 'Assist customers with checkout and payment processing',
        riskProfile: 'HIGH',
        domain: 'retail',
        deviceClass: 'mobile',
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
        config: {
          prompt: 'You are a retail assistant helping customers with purchases',
          temperature: 0.4,
          model: 'gpt-4',
        },
        tools: [
          {
            toolId: 'payment-processor',
            name: 'Payment Processor',
            enabled: true,
            permissions: ['write'],
            riskTier: 'CRITICAL',
          },
          {
            toolId: 'inventory-db',
            name: 'Inventory Database',
            enabled: true,
            permissions: ['read', 'write'],
            riskTier: 'MEDIUM',
          },
        ],
        toolAdapters: [
          {
            adapterId: 'ocr-adapter',
            adapterType: 'perception',
            name: 'OCR Scanner',
            enabled: true,
            requiredCapabilities: ['camera', 'ocr'],
          },
        ],
        policies: [
          {
            policyId: 'payment-verification',
            name: 'Payment Verification Policy',
            enabled: true,
            rules: [
              {
                type: 'approval_required',
                description: 'Require approval for payments over $1000',
                parameters: { threshold: 1000 },
              },
            ],
          },
        ],
        workflows: [],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data?.domain).toBe('retail');
      
      const compatResult = validateDeploymentTargetCompatibility(blueprint);
      expect(compatResult.compatible).toBe(true);
    });
  });

  describe('Travel Domain', () => {
    it('should validate travel agent with GPS and map capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'travel-001',
        name: 'Travel Assistant Agent',
        version: '1.0.0',
        goal: 'Provide navigation and travel recommendations',
        riskProfile: 'MEDIUM',
        domain: 'travel',
        deviceClass: 'mobile',
        deploymentTarget: 'travel',
        requiredCapabilities: [
          'gps',
          'map-api',
          'http-client',
          'payment-api',
          'camera',
          'touchscreen',
          'display',
        ],
        config: {
          prompt: 'You are a travel assistant providing navigation and recommendations',
          temperature: 0.6,
          model: 'gpt-4',
        },
        tools: [
          {
            toolId: 'maps-service',
            name: 'Maps Service',
            enabled: true,
            permissions: ['read'],
            riskTier: 'LOW',
          },
          {
            toolId: 'booking-api',
            name: 'Booking API',
            enabled: true,
            permissions: ['write'],
            riskTier: 'HIGH',
          },
        ],
        toolAdapters: [
          {
            adapterId: 'gps-adapter',
            adapterType: 'sensor',
            name: 'GPS Sensor',
            enabled: true,
            requiredCapabilities: ['gps'],
          },
        ],
        policies: [
          {
            policyId: 'booking-limit',
            name: 'Booking Limit Policy',
            enabled: true,
            rules: [
              {
                type: 'rate_limit',
                description: 'Limit bookings to 10 per hour',
                parameters: { maxPerHour: 10 },
              },
            ],
          },
        ],
        workflows: [],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      
      const compatResult = validateDeploymentTargetCompatibility(blueprint);
      expect(compatResult.compatible).toBe(true);
    });
  });

  describe('Smartphone Domain', () => {
    it('should validate smartphone agent with mobile capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'smartphone-001',
        name: 'Mobile Assistant Agent',
        version: '1.0.0',
        goal: 'Provide smart assistance on mobile device',
        riskProfile: 'MEDIUM',
        domain: 'general',
        deviceClass: 'mobile',
        deploymentTarget: 'smartphone',
        requiredCapabilities: [
          'camera',
          'microphone',
          'speaker',
          'gps',
          'touchscreen',
          'display',
          'http-client',
          'network',
          'nlp',
        ],
        config: {
          prompt: 'You are a mobile assistant helping users with daily tasks',
          temperature: 0.7,
          model: 'gpt-4',
        },
        tools: [
          {
            toolId: 'voice-recognition',
            name: 'Voice Recognition',
            enabled: true,
            permissions: ['read'],
            riskTier: 'LOW',
          },
          {
            toolId: 'notification-sender',
            name: 'Notification Sender',
            enabled: true,
            permissions: ['write'],
            riskTier: 'LOW',
          },
        ],
        toolAdapters: [
          {
            adapterId: 'speech-adapter',
            adapterType: 'perception',
            name: 'Speech Recognition',
            enabled: true,
            requiredCapabilities: ['microphone', 'nlp'],
          },
        ],
        policies: [
          {
            policyId: 'privacy-protection',
            name: 'Privacy Protection Policy',
            enabled: true,
            rules: [
              {
                type: 'data_protection',
                description: 'Encrypt sensitive data',
                parameters: { encryptionLevel: 'high' },
              },
            ],
          },
        ],
        workflows: [],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      
      const compatResult = validateDeploymentTargetCompatibility(blueprint);
      expect(compatResult.compatible).toBe(true);
    });
  });

  describe('Deployment Target Capability Requirements', () => {
    it('should return correct required capabilities for each deployment target', () => {
      const targets = [
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
      ] as const;

      targets.forEach(target => {
        const capabilities = getRequiredCapabilities(target);
        expect(capabilities).toBeDefined();
        expect(Array.isArray(capabilities)).toBe(true);
        expect(capabilities.length).toBeGreaterThan(0);
        
        // Verify capabilities match the map
        expect(capabilities).toEqual(DeploymentTargetCapabilitiesMap[target]);
      });
    });

    it('should validate humanoid deployment with comprehensive capabilities', () => {
      const humanoidCapabilities = getRequiredCapabilities('humanoid');
      
      // Humanoid should have the most comprehensive set of capabilities
      expect(humanoidCapabilities).toContain('motors');
      expect(humanoidCapabilities).toContain('servos');
      expect(humanoidCapabilities).toContain('arms');
      expect(humanoidCapabilities).toContain('legs');
      expect(humanoidCapabilities).toContain('camera');
      expect(humanoidCapabilities).toContain('microphone');
      expect(humanoidCapabilities).toContain('speaker');
      expect(humanoidCapabilities).toContain('object-detection');
      expect(humanoidCapabilities).toContain('face-recognition');
      expect(humanoidCapabilities).toContain('speech-recognition');
      expect(humanoidCapabilities).toContain('gesture-recognition');
      expect(humanoidCapabilities).toContain('real-time');
      expect(humanoidCapabilities).toContain('low-latency');
    });
  });

  describe('Tool Adapter Validation', () => {
    it('should validate tool adapters provide required capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'adapter-test-001',
        name: 'Tool Adapter Test Agent',
        version: '1.0.0',
        goal: 'Test tool adapter capability validation',
        riskProfile: 'MEDIUM',
        deploymentTarget: 'robotics',
        requiredCapabilities: ['camera', 'lidar', 'object-detection'],
        config: {
          prompt: 'Test agent for adapter validation',
          temperature: 0.5,
        },
        tools: [],
        policies: [],
        workflows: [],
        toolAdapters: [
          {
            adapterId: 'camera-adapter-1',
            adapterType: 'perception',
            name: 'Camera Adapter',
            enabled: true,
            requiredCapabilities: ['camera', 'object-detection'],
          },
          {
            adapterId: 'lidar-adapter-1',
            adapterType: 'sensor',
            name: 'LiDAR Adapter',
            enabled: true,
            requiredCapabilities: ['lidar'],
          },
        ],
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      expect(result.valid).toBe(true);
      
      // Check that tool adapters are validated
      const adapterValidation = result.details.toolAdapters;
      expect(adapterValidation).toBeDefined();
      expect(adapterValidation?.valid).toBe(true);
    });

    it('should detect when tool adapters do not provide required capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'adapter-test-002',
        name: 'Missing Adapter Capabilities',
        version: '1.0.0',
        goal: 'Test missing adapter capabilities',
        riskProfile: 'MEDIUM',
        deploymentTarget: 'robotics',
        requiredCapabilities: ['camera', 'lidar', 'object-detection', 'motors'],
        config: {
          prompt: 'Test agent for missing adapter capabilities',
          temperature: 0.5,
        },
        tools: [],
        policies: [],
        workflows: [],
        toolAdapters: [
          {
            adapterId: 'camera-adapter-2',
            adapterType: 'perception',
            name: 'Basic Camera',
            enabled: true,
            requiredCapabilities: ['camera'], // Missing object-detection
          },
        ],
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      
      // Should have warnings about missing capabilities
      expect(result.warnings.length).toBeGreaterThan(0);
      const missingCapWarning = result.warnings.find(w => 
        w.includes('missing') || w.includes('capability')
      );
      expect(missingCapWarning).toBeDefined();
    });
  });

  describe('Comprehensive Blueprint Validation', () => {
    it('should provide comprehensive validation with deployment compatibility check', () => {
      const blueprint: AgentBlueprint = {
        id: 'comprehensive-001',
        name: 'Comprehensive Test Agent',
        version: '1.0.0',
        goal: 'Test comprehensive validation',
        riskProfile: 'MEDIUM',
        domain: 'robotics',
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
        config: {
          prompt: 'Comprehensive test agent for validation',
          temperature: 0.5,
          model: 'gpt-4',
        },
        tools: [
          {
            toolId: 'motor-control',
            name: 'Motor Control',
            enabled: true,
            permissions: ['write'],
            riskTier: 'HIGH',
          },
        ],
        policies: [
          {
            policyId: 'safety-policy',
            name: 'Safety Policy',
            enabled: true,
            rules: [
              {
                type: 'emergency_stop',
                description: 'Emergency stop capability',
              },
            ],
          },
        ],
        workflows: [
          {
            workflowId: 'navigation-wf',
            name: 'Navigation Workflow',
            triggerConditions: ['manual', 'scheduled'],
          },
        ],
        toolAdapters: [
          {
            adapterId: 'perception-suite',
            adapterType: 'perception',
            name: 'Perception Suite',
            enabled: true,
            requiredCapabilities: ['camera', 'lidar', 'object-detection'],
          },
        ],
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      
      expect(result.valid).toBe(true);
      expect(result.details.schema.valid).toBe(true);
      expect(result.details.deploymentCompatibility.compatible).toBe(true);
      expect(result.details.tools.valid).toBe(true);
      expect(result.details.policies.valid).toBe(true);
      expect(result.details.workflows.valid).toBe(true);
      expect(result.details.toolAdapters?.valid).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle agent without deployment target', () => {
      const blueprint: AgentBlueprint = {
        id: 'no-target-001',
        name: 'No Deployment Target Agent',
        version: '1.0.0',
        goal: 'Agent without deployment target specification',
        riskProfile: 'LOW',
        config: {
          prompt: 'Generic agent without deployment target',
          temperature: 0.7,
        },
        tools: [],
        policies: [],
        workflows: [],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      
      // Deployment compatibility should handle undefined target
      const compatResult = validateDeploymentTargetCompatibility(blueprint);
      expect(compatResult.compatible).toBe(true);
      expect(compatResult.missingCapabilities).toHaveLength(0);
    });

    it('should handle empty capabilities array', () => {
      const blueprint: AgentBlueprint = {
        id: 'empty-caps-001',
        name: 'Empty Capabilities Agent',
        version: '1.0.0',
        goal: 'Agent with empty capabilities',
        riskProfile: 'LOW',
        deploymentTarget: 'software',
        requiredCapabilities: [],
        config: {
          prompt: 'Agent with no specified capabilities',
          temperature: 0.7,
        },
        tools: [],
        policies: [],
        workflows: [],
      };

      // Schema validation should fail when deploymentTarget is set but requiredCapabilities is empty
      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes('requiredCapabilities'))).toBe(true);
    });

    it('should validate all domain types are valid', () => {
      const domains = [
        'general',
        'robotics',
        'healthcare',
        'finance',
        'retail',
        'manufacturing',
        'logistics',
        'education',
        'entertainment',
        'travel',
        'industrial',
        'custom',
      ] as const;

      domains.forEach(domain => {
        const blueprint: AgentBlueprint = {
          id: `domain-test-${domain}`,
          name: `${domain} Agent`,
          version: '1.0.0',
          goal: `Test agent for ${domain} domain`,
          riskProfile: 'MEDIUM',
          domain: domain,
          config: {
            prompt: `Agent for ${domain} domain`,
            temperature: 0.5,
          },
          tools: [],
          policies: [],
          workflows: [],
        };

        const result = validateAgentBlueprint(blueprint);
        expect(result.success).toBe(true);
        expect(result.data?.domain).toBe(domain);
      });
    });
  });
});
