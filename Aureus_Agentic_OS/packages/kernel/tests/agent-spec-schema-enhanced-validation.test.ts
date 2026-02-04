import { describe, it, expect } from 'vitest';
import {
  AgentBlueprintSchema,
  AgentGenerationRequestSchema,
  validateAgentBlueprint,
  validateAgentGenerationRequest,
  validateAgentBlueprintComprehensive,
  validateDeploymentTargetRequirements,
  validateCapabilityConsistency,
  AgentBlueprint,
  AgentGenerationRequest,
} from '../src/agent-spec-schema';

describe('Agent Spec Schema Enhanced Validation', () => {
  describe('AgentGenerationRequestSchema - Stricter Validation', () => {
    it('should require domain when deploymentTarget is specified', () => {
      const request = {
        goal: 'Build a robotics agent for warehouse automation',
        deploymentTarget: 'robotics',
        deviceClass: 'robot',
        // domain is missing
      };

      const result = validateAgentGenerationRequest(request);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes('domain'))).toBe(true);
    });

    it('should require deviceClass when deploymentTarget is specified', () => {
      const request = {
        goal: 'Build a robotics agent for warehouse automation',
        deploymentTarget: 'robotics',
        domain: 'robotics',
        // deviceClass is missing
      };

      const result = validateAgentGenerationRequest(request);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes('deviceClass'))).toBe(true);
    });

    it('should accept valid request with all required fields for deploymentTarget', () => {
      const request = {
        goal: 'Build a robotics agent for warehouse automation',
        deploymentTarget: 'robotics',
        domain: 'robotics',
        deviceClass: 'robot',
      };

      const result = validateAgentGenerationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should accept valid request without deploymentTarget', () => {
      const request = {
        goal: 'Build a general-purpose agent',
      };

      const result = validateAgentGenerationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('AgentBlueprintSchema - Stricter Validation', () => {
    it('should require requiredCapabilities when deploymentTarget is specified', () => {
      const blueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        // requiredCapabilities is missing or empty
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes('requiredCapabilities'))).toBe(true);
    });

    it('should accept valid blueprint with deploymentTarget and requiredCapabilities', () => {
      const blueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        requiredCapabilities: ['motors', 'camera', 'lidar'],
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should accept valid blueprint without deploymentTarget', () => {
      const blueprint = {
        id: 'agent-1',
        name: 'General Agent',
        goal: 'Perform general tasks',
        config: {
          prompt: 'General agent prompt',
        },
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('validateDeploymentTargetRequirements', () => {
    it('should validate domain consistency for specialized targets', () => {
      const blueprint: AgentBlueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        domain: 'general', // Inconsistent with specialized target
        requiredCapabilities: ['motors', 'camera'],
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateDeploymentTargetRequirements(blueprint);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('specialized'))).toBe(true);
    });

    it('should validate deviceClass compatibility with deploymentTarget', () => {
      const blueprint: AgentBlueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for this agent',
        deploymentTarget: 'robotics',
        deviceClass: 'mobile', // Incompatible with robotics
        requiredCapabilities: ['motors', 'camera'],
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = validateDeploymentTargetRequirements(blueprint);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.includes('not compatible'))).toBe(true);
    });

    it('should not error when capabilities are not fully provided (warning only)', () => {
      const blueprint: AgentBlueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        requiredCapabilities: [], // Empty capabilities - will cause schema error
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      // This should fail at schema level since deploymentTarget requires capabilities
      const schemaResult = validateAgentBlueprint(blueprint);
      expect(schemaResult.success).toBe(false);
      
      // But validateDeploymentTargetRequirements only checks consistency, not empty
      // Since it's designed for use after schema validation
      const manualBlueprint: AgentBlueprint = {
        ...blueprint,
        requiredCapabilities: ['camera'], // Add at least one
      };
      const result = validateDeploymentTargetRequirements(manualBlueprint);
      expect(result.valid).toBe(true); // No deviceClass incompatibility
    });

    it('should pass validation for compatible deviceClass and deploymentTarget', () => {
      const blueprint: AgentBlueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        deviceClass: 'robot',
        domain: 'robotics',
        requiredCapabilities: ['motors', 'camera', 'lidar'],
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateDeploymentTargetRequirements(blueprint);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should pass validation without deploymentTarget', () => {
      const blueprint: AgentBlueprint = {
        id: 'agent-1',
        name: 'General Agent',
        goal: 'Perform general tasks',
        config: {
          prompt: 'General agent prompt',
        },
      };

      const result = validateDeploymentTargetRequirements(blueprint);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateCapabilityConsistency', () => {
    it('should warn when toolAdapters do not provide required capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for this agent',
        requiredCapabilities: ['camera', 'lidar', 'motors'],
        toolAdapters: [
          {
            adapterId: 'camera-adapter',
            adapterType: 'perception',
            name: 'Camera',
            enabled: true,
            requiredCapabilities: ['camera'], // Missing lidar and motors
          },
        ],
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = validateCapabilityConsistency(blueprint);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('do not provide'))).toBe(true);
    });

    it('should warn when capabilities are specified but no toolAdapters', () => {
      const blueprint: AgentBlueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for this agent',
        requiredCapabilities: ['camera', 'lidar'],
        toolAdapters: [], // Empty
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = validateCapabilityConsistency(blueprint);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('no tool adapters'))).toBe(true);
    });

    it('should warn about unused toolAdapters', () => {
      const blueprint: AgentBlueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for this agent',
        requiredCapabilities: ['camera'],
        toolAdapters: [
          {
            adapterId: 'camera-adapter',
            adapterType: 'perception',
            name: 'Camera',
            enabled: true,
            requiredCapabilities: ['camera'],
          },
          {
            adapterId: 'motor-adapter',
            adapterType: 'actuator',
            name: 'Motor',
            enabled: true,
            requiredCapabilities: ['motors'], // Not in requiredCapabilities
          },
        ],
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = validateCapabilityConsistency(blueprint);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('do not provide any required'))).toBe(true);
    });

    it('should pass validation when toolAdapters match capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for this agent',
        requiredCapabilities: ['camera', 'motors'],
        toolAdapters: [
          {
            adapterId: 'camera-adapter',
            adapterType: 'perception',
            name: 'Camera',
            enabled: true,
            requiredCapabilities: ['camera'],
          },
          {
            adapterId: 'motor-adapter',
            adapterType: 'actuator',
            name: 'Motor',
            enabled: true,
            requiredCapabilities: ['motors'],
          },
        ],
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = validateCapabilityConsistency(blueprint);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should pass validation without capabilities or toolAdapters', () => {
      const blueprint: AgentBlueprint = {
        id: 'agent-1',
        name: 'General Agent',
        goal: 'Perform general tasks',
        config: {
          prompt: 'General agent prompt',
        },
      };

      const result = validateCapabilityConsistency(blueprint);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateAgentBlueprintComprehensive - Enhanced', () => {
    it('should return errors for invalid deployment target requirements', () => {
      const blueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        deviceClass: 'mobile', // Incompatible
        requiredCapabilities: [], // Empty
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should return warnings for capability inconsistencies', () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for this agent',
        requiredCapabilities: ['camera', 'lidar'],
        toolAdapters: [
          {
            adapterId: 'camera-adapter',
            adapterType: 'perception',
            name: 'Camera',
            enabled: true,
            requiredCapabilities: ['camera'], // Missing lidar
          },
        ],
        config: {
          prompt: 'Test prompt for agent',
        },
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      // Since no deploymentTarget, no schema errors, but warnings from capability check
      expect(result.success).toBe(true); // No critical errors
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
      expect(result.warnings!.some(w => w.includes('do not provide'))).toBe(true);
    });

    it('should return both errors and warnings when applicable', () => {
      const blueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        deviceClass: 'mobile', // Incompatible - ERROR
        domain: 'general', // Inconsistent - WARNING
        requiredCapabilities: ['camera'], // At least one capability so schema passes
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
      expect(result.errors!.some(e => e.includes('not compatible'))).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('specialized'))).toBe(true);
    });

    it('should pass comprehensive validation for well-formed blueprint', () => {
      const blueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks in warehouse',
        deploymentTarget: 'robotics',
        deviceClass: 'robot',
        domain: 'robotics',
        requiredCapabilities: ['motors', 'servos', 'camera', 'lidar', 'imu', 'object-detection', 'real-time', 'low-latency'],
        toolAdapters: [
          {
            adapterId: 'camera-adapter',
            adapterType: 'perception',
            name: 'Camera',
            enabled: true,
            requiredCapabilities: ['camera', 'object-detection'],
          },
          {
            adapterId: 'motor-adapter',
            adapterType: 'actuator',
            name: 'Motor Controller',
            enabled: true,
            requiredCapabilities: ['motors', 'servos', 'real-time', 'low-latency'],
          },
          {
            adapterId: 'lidar-adapter',
            adapterType: 'sensor',
            name: 'LIDAR',
            enabled: true,
            requiredCapabilities: ['lidar'],
          },
          {
            adapterId: 'imu-adapter',
            adapterType: 'sensor',
            name: 'IMU',
            enabled: true,
            requiredCapabilities: ['imu'],
          },
        ],
        config: {
          prompt: 'You are a robotics agent for warehouse automation',
        },
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should handle missing deployment target requirements gracefully', () => {
      const blueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        requiredCapabilities: ['camera'], // Missing many required capabilities
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      // Schema passes but compatibility validation should warn about missing capabilities
      expect(result.success).toBe(true); // Schema validation passes
      expect(result.warnings).toBeDefined(); // Missing capabilities warning
      expect(result.warnings!.some(w => w.includes('missing required capabilities'))).toBe(true);
    });
  });

  describe('Cross-field validation integration', () => {
    it('should validate humanoid deployment with all requirements', () => {
      const blueprint = {
        id: 'humanoid-agent',
        name: 'Humanoid Agent',
        goal: 'Interact with humans naturally',
        deploymentTarget: 'humanoid',
        deviceClass: 'humanoid',
        domain: 'robotics',
        requiredCapabilities: [
          'motors', 'servos', 'arms', 'legs', 'camera', 'microphone',
          'speaker', 'imu', 'object-detection', 'face-recognition',
          'speech-recognition', 'gesture-recognition', 'real-time', 'low-latency'
        ],
        config: {
          prompt: 'You are a humanoid robot assistant',
        },
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should validate software deployment with required capabilities', () => {
      const blueprint = {
        id: 'software-agent',
        name: 'Software Agent',
        goal: 'Process data and generate reports',
        deploymentTarget: 'software',
        deviceClass: 'cloud',
        domain: 'general',
        requiredCapabilities: ['http-client', 'database', 'file-system', 'network', 'nlp'],
        config: {
          prompt: 'You are a software agent for data processing',
        },
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should validate retail deployment with appropriate capabilities', () => {
      const blueprint = {
        id: 'retail-agent',
        name: 'Retail Agent',
        goal: 'Assist customers with purchases',
        deploymentTarget: 'retail',
        deviceClass: 'desktop',
        domain: 'retail',
        requiredCapabilities: ['payment-api', 'database', 'http-client', 'camera', 'ocr', 'touchscreen', 'display'],
        config: {
          prompt: 'You are a retail assistant agent',
        },
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });
});
