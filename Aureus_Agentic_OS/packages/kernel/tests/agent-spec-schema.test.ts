import { describe, it, expect } from 'vitest';
import {
  AgentBlueprintSchema,
  AgentGenerationRequestSchema,
  validateAgentBlueprint,
  validateAgentGenerationRequest,
  validateAgentValidationRequest,
  validateAgentSimulationRequest,
  validateAgentDeploymentRequest,
  validateDeploymentTargetCompatibility,
  validateToolAdapterCapabilities,
  validateAgentBlueprintComprehensive,
  getRequiredCapabilities,
  AgentBlueprint,
} from '../src/agent-spec-schema';

describe('Agent Spec Schema', () => {
  describe('AgentBlueprint validation', () => {
    it('should validate a complete agent blueprint', () => {
      const blueprint: AgentBlueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        version: '1.0.0',
        description: 'A test agent',
        goal: 'Test goal for the agent',
        riskProfile: 'MEDIUM',
        config: {
          prompt: 'You are a test agent',
          systemPrompt: 'System prompt',
          temperature: 0.7,
          maxTokens: 2048,
          model: 'gpt-4',
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'http-client',
            enabled: true,
            permissions: ['read'],
            riskTier: 'LOW',
          },
        ],
        policies: [
          {
            policyId: 'policy-1',
            name: 'Safety Policy',
            enabled: true,
            rules: [
              {
                type: 'rate_limit',
                description: 'Rate limiting',
              },
            ],
          },
        ],
        workflows: [
          {
            workflowId: 'workflow-1',
            name: 'Main Workflow',
            description: 'Primary workflow',
          },
        ],
        constraints: ['Constraint 1', 'Constraint 2'],
        maxExecutionTime: 300000,
        maxRetries: 3,
        successCriteria: ['Criterion 1', 'Criterion 2'],
        tags: ['test', 'agent'],
        owner: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should reject agent blueprint with missing required fields', () => {
      const invalidBlueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        // Missing goal
        config: {
          prompt: 'Test',
        },
      };

      const result = validateAgentBlueprint(invalidBlueprint);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should reject agent blueprint with invalid risk profile', () => {
      const invalidBlueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal',
        riskProfile: 'INVALID',
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = validateAgentBlueprint(invalidBlueprint);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should apply default values for optional fields', () => {
      const minimalBlueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for agent',
        config: {
          prompt: 'You are a test agent',
        },
      };

      const result = validateAgentBlueprint(minimalBlueprint);
      expect(result.success).toBe(true);
      expect(result.data?.version).toBe('1.0.0');
      expect(result.data?.riskProfile).toBe('MEDIUM');
      expect(result.data?.tools).toEqual([]);
      expect(result.data?.policies).toEqual([]);
      expect(result.data?.workflows).toEqual([]);
    });

    it('should validate agent config temperature range', () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for agent',
        config: {
          prompt: 'Test prompt',
          temperature: 3.0, // Invalid: > 2
        },
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('temperature'))).toBe(true);
    });
  });

  describe('AgentGenerationRequest validation', () => {
    it('should validate a valid generation request', () => {
      const request = {
        goal: 'Build an agent to monitor system logs',
        constraints: ['Must be read-only', 'Must not access PII'],
        preferredTools: ['http-client', 'file-reader'],
        riskProfile: 'MEDIUM',
        additionalContext: 'Additional context here',
        policyRequirements: ['Rate limiting', 'Timeout enforcement'],
      };

      const result = validateAgentGenerationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should reject request with short goal', () => {
      const request = {
        goal: 'Short', // Too short
        riskProfile: 'MEDIUM',
      };

      const result = validateAgentGenerationRequest(request);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('goal'))).toBe(true);
    });

    it('should apply default risk profile', () => {
      const request = {
        goal: 'Build a test agent for monitoring',
      };

      const result = validateAgentGenerationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data?.riskProfile).toBe('MEDIUM');
    });

    it('should validate with minimal required fields', () => {
      const request = {
        goal: 'Monitor and alert on critical system events',
      };

      const result = validateAgentGenerationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data?.goal).toBe('Monitor and alert on critical system events');
    });
  });

  describe('AgentValidationRequest validation', () => {
    it('should validate a validation request', () => {
      const request = {
        blueprint: {
          id: 'agent-1',
          name: 'Test Agent',
          goal: 'Test agent goal',
          config: {
            prompt: 'Test prompt',
          },
        },
        validatePolicies: true,
        validateTools: true,
        validateWorkflows: true,
      };

      const result = validateAgentValidationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data?.validatePolicies).toBe(true);
    });

    it('should apply default validation flags', () => {
      const request = {
        blueprint: {
          id: 'agent-1',
          name: 'Test Agent',
          goal: 'Test agent goal',
          config: {
            prompt: 'Test prompt',
          },
        },
      };

      const result = validateAgentValidationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data?.validatePolicies).toBe(true);
      expect(result.data?.validateTools).toBe(true);
      expect(result.data?.validateWorkflows).toBe(true);
    });
  });

  describe('AgentSimulationRequest validation', () => {
    it('should validate a simulation request', () => {
      const request = {
        blueprint: {
          id: 'agent-1',
          name: 'Test Agent',
          goal: 'Test agent goal',
          config: {
            prompt: 'Test prompt',
          },
        },
        testScenario: {
          description: 'Test scenario',
          inputs: {
            test: 'value',
          },
          expectedOutputs: {
            result: 'expected',
          },
        },
        dryRun: true,
      };

      const result = validateAgentSimulationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data?.dryRun).toBe(true);
    });

    it('should apply default dryRun value', () => {
      const request = {
        blueprint: {
          id: 'agent-1',
          name: 'Test Agent',
          goal: 'Test agent goal',
          config: {
            prompt: 'Test prompt',
          },
        },
        testScenario: {
          description: 'Test scenario',
          inputs: {},
        },
      };

      const result = validateAgentSimulationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data?.dryRun).toBe(true);
    });
  });

  describe('AgentDeploymentRequest validation', () => {
    it('should validate a deployment request', () => {
      const request = {
        blueprint: {
          id: 'agent-1',
          name: 'Test Agent',
          goal: 'Test agent goal',
          config: {
            prompt: 'Test prompt',
          },
        },
        environment: 'staging',
        autoPromote: false,
        approvalRequired: true,
      };

      const result = validateAgentDeploymentRequest(request);
      expect(result.success).toBe(true);
      expect(result.data?.environment).toBe('staging');
      expect(result.data?.approvalRequired).toBe(true);
    });

    it('should apply default deployment values', () => {
      const request = {
        blueprint: {
          id: 'agent-1',
          name: 'Test Agent',
          goal: 'Test agent goal',
          config: {
            prompt: 'Test prompt',
          },
        },
      };

      const result = validateAgentDeploymentRequest(request);
      expect(result.success).toBe(true);
      expect(result.data?.environment).toBe('development');
      expect(result.data?.autoPromote).toBe(false);
      expect(result.data?.approvalRequired).toBe(true);
    });

    it('should validate environment options', () => {
      const request = {
        blueprint: {
          id: 'agent-1',
          name: 'Test Agent',
          goal: 'Test agent goal',
          config: {
            prompt: 'Test prompt',
          },
        },
        environment: 'invalid-env',
      };

      const result = validateAgentDeploymentRequest(request);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Tool and Policy configurations', () => {
    it('should validate tool configurations', () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test agent goal',
        config: {
          prompt: 'Test prompt',
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'http-client',
            enabled: true,
            permissions: ['read', 'write'],
            parameters: {
              timeout: 30000,
              retries: 3,
            },
            riskTier: 'MEDIUM',
          },
        ],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data?.tools).toHaveLength(1);
      expect(result.data?.tools[0].name).toBe('http-client');
    });

    it('should validate policy configurations with rules', () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test agent goal',
        config: {
          prompt: 'Test prompt',
        },
        policies: [
          {
            policyId: 'policy-1',
            name: 'Rate Limiting Policy',
            enabled: true,
            rules: [
              {
                type: 'rate_limit',
                description: 'Limit actions per minute',
                parameters: {
                  maxActionsPerMinute: 60,
                },
              },
              {
                type: 'timeout_enforcement',
                description: 'Enforce timeouts',
              },
            ],
            failFast: true,
          },
        ],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data?.policies).toHaveLength(1);
      expect(result.data?.policies[0].rules).toHaveLength(2);
      expect(result.data?.policies[0].failFast).toBe(true);
    });

    it('should validate workflow references', () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test agent goal',
        config: {
          prompt: 'Test prompt',
        },
        workflows: [
          {
            workflowId: 'workflow-1',
            name: 'Primary Workflow',
            description: 'Main execution workflow',
            triggerConditions: ['agent_initialized', 'goal_received'],
            priority: 1,
          },
        ],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data?.workflows).toHaveLength(1);
      expect(result.data?.workflows[0].priority).toBe(1);
    });
  });

  describe('Deployment Target and Capabilities', () => {
    it('should validate agent blueprint with deployment target and capabilities', () => {
      const blueprint = {
        id: 'robot-agent-1',
        name: 'Robotics Agent',
        goal: 'Navigate and manipulate objects',
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
          prompt: 'You are a robotics agent',
        },
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data?.domain).toBe('robotics');
      expect(result.data?.deviceClass).toBe('robot');
      expect(result.data?.deploymentTarget).toBe('robotics');
      expect(result.data?.requiredCapabilities).toHaveLength(8);
    });

    it('should validate agent blueprint with tool adapters', () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test agent with adapters',
        config: {
          prompt: 'Test prompt',
        },
        toolAdapters: [
          {
            adapterId: 'camera-adapter',
            adapterType: 'perception',
            name: 'RGB Camera Adapter',
            enabled: true,
            requiredCapabilities: ['camera', 'object-detection'],
            configuration: {
              fps: 30,
              resolution: '1920x1080',
            },
          },
          {
            adapterId: 'motor-adapter',
            adapterType: 'actuator',
            name: 'Motor Controller',
            enabled: true,
            requiredCapabilities: ['motors', 'real-time'],
          },
        ],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data?.toolAdapters).toHaveLength(2);
      expect(result.data?.toolAdapters?.[0].adapterType).toBe('perception');
      expect(result.data?.toolAdapters?.[1].adapterType).toBe('actuator');
    });

    it('should get required capabilities for deployment target', () => {
      const roboticsCapabilities = getRequiredCapabilities('robotics');
      expect(roboticsCapabilities).toContain('motors');
      expect(roboticsCapabilities).toContain('camera');
      expect(roboticsCapabilities).toContain('lidar');
      expect(roboticsCapabilities).toContain('object-detection');

      const humanoidCapabilities = getRequiredCapabilities('humanoid');
      expect(humanoidCapabilities).toContain('arms');
      expect(humanoidCapabilities).toContain('legs');
      expect(humanoidCapabilities).toContain('face-recognition');
      expect(humanoidCapabilities).toContain('speech-recognition');
    });

    it('should validate deployment target compatibility - compatible', () => {
      const blueprint: AgentBlueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
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
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateDeploymentTargetCompatibility(blueprint);
      expect(result.compatible).toBe(true);
      expect(result.missingCapabilities).toBeUndefined();
    });

    it('should validate deployment target compatibility - missing capabilities', () => {
      const blueprint: AgentBlueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        requiredCapabilities: ['camera'], // Missing many required capabilities
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateDeploymentTargetCompatibility(blueprint);
      expect(result.compatible).toBe(false);
      expect(result.missingCapabilities).toBeDefined();
      expect(result.missingCapabilities!.length).toBeGreaterThan(0);
      expect(result.errors).toBeDefined();
    });

    it('should validate tool adapter capabilities', () => {
      const toolAdapters = [
        {
          adapterId: 'camera-adapter',
          adapterType: 'perception' as const,
          name: 'Camera',
          enabled: true,
          requiredCapabilities: ['camera', 'object-detection'],
        },
        {
          adapterId: 'motor-adapter',
          adapterType: 'actuator' as const,
          name: 'Motor',
          enabled: true,
          requiredCapabilities: ['motors', 'real-time'],
        },
      ];

      const requiredCapabilities = ['camera', 'object-detection', 'motors', 'real-time'];

      const result = validateToolAdapterCapabilities(toolAdapters, requiredCapabilities as any);
      expect(result.compatible).toBe(true);
      expect(result.missingCapabilities).toBeUndefined();
    });

    it('should detect missing capabilities in tool adapters', () => {
      const toolAdapters = [
        {
          adapterId: 'camera-adapter',
          adapterType: 'perception' as const,
          name: 'Camera',
          enabled: true,
          requiredCapabilities: ['camera'],
        },
      ];

      const requiredCapabilities = ['camera', 'lidar', 'motors'];

      const result = validateToolAdapterCapabilities(toolAdapters, requiredCapabilities as any);
      expect(result.compatible).toBe(false);
      expect(result.missingCapabilities).toContain('lidar' as any);
      expect(result.missingCapabilities).toContain('motors' as any);
    });

    it('should perform comprehensive validation with warnings', () => {
      const blueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        requiredCapabilities: ['camera'], // Missing capabilities
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = validateAgentBlueprintComprehensive(blueprint);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });

    it('should apply default values for domain and capabilities', () => {
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test agent goal',
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data?.domain).toBe('general');
      expect(result.data?.requiredCapabilities).toEqual([]);
      expect(result.data?.toolAdapters).toEqual([]);
    });
  });

  describe('Runtime Adapter Validation', () => {
    it('should validate blueprint against runtime adapter registry', async () => {
      // Import the function
      const { validateAgentBlueprintWithRuntime } = await import('../src/agent-spec-schema');
      
      // Mock registry
      const mockRegistry = {
        validateBlueprint: async (blueprint: any) => {
          if (blueprint.deploymentTarget === 'robotics') {
            return {
              valid: true,
              compatibleAdapters: ['robotics-adapter-1'],
              recommendedAdapter: 'robotics-adapter-1',
            };
          }
          return {
            valid: false,
            errors: ['Unsupported deployment target'],
          };
        },
      };

      const blueprint = {
        id: 'robot-agent',
        name: 'Robot Agent',
        goal: 'Perform robotics tasks',
        deploymentTarget: 'robotics',
        requiredCapabilities: ['motors', 'camera'],
        config: {
          prompt: 'Robotics agent prompt',
        },
      };

      const result = await validateAgentBlueprintWithRuntime(blueprint, mockRegistry);
      expect(result.success).toBe(true);
      expect(result.runtimeValidation).toBeDefined();
      expect(result.runtimeValidation?.compatibleAdapters).toContain('robotics-adapter-1');
      expect(result.runtimeValidation?.recommendedAdapter).toBe('robotics-adapter-1');
    });

    it('should reject blueprint with unsupported runtime', async () => {
      const { validateAgentBlueprintWithRuntime } = await import('../src/agent-spec-schema');
      
      const mockRegistry = {
        validateBlueprint: async (blueprint: any) => {
          return {
            valid: false,
            errors: ['Deployment target not supported by runtime'],
          };
        },
      };

      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for this agent',
        deploymentTarget: 'robotics', // Valid enum but unsupported by mock runtime
        requiredCapabilities: ['camera'], // Must have capabilities when deploymentTarget is set
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = await validateAgentBlueprintWithRuntime(blueprint, mockRegistry);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Deployment target not supported');
    });

    it('should work without runtime registry', async () => {
      const { validateAgentBlueprintWithRuntime } = await import('../src/agent-spec-schema');
      
      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for this agent',
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = await validateAgentBlueprintWithRuntime(blueprint);
      expect(result.success).toBe(true);
      expect(result.runtimeValidation).toBeUndefined();
    });

    it('should handle runtime validation errors gracefully', async () => {
      const { validateAgentBlueprintWithRuntime } = await import('../src/agent-spec-schema');
      
      const mockRegistry = {
        validateBlueprint: async () => {
          throw new Error('Registry error');
        },
      };

      const blueprint = {
        id: 'agent-1',
        name: 'Test Agent',
        goal: 'Test goal for this agent',
        config: {
          prompt: 'Test prompt',
        },
      };

      const result = await validateAgentBlueprintWithRuntime(blueprint, mockRegistry);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Runtime validation error');
    });
  });
});
