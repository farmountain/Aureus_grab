import { describe, it, expect } from 'vitest';
import {
  AgentBlueprintSchema,
  ReasoningLoopConfigSchema,
  ToolPolicyConstraintsSchema,
  MemorySettingsSchema,
  GovernanceSettingsSchema,
  validateAgentBlueprint,
  AgentBlueprint,
} from '../src/agent-spec-schema';

describe('Agent Blueprint Schema Validation', () => {
  describe('ReasoningLoopConfigSchema', () => {
    it('should validate default reasoning loop config', () => {
      const config = {
        enabled: true,
        maxIterations: 10,
        pattern: 'plan_act_reflect' as const,
        reflectionEnabled: true,
        reflectionTriggers: ['task_completion' as const, 'failure' as const],
        planningStrategy: 'adaptive' as const,
      };

      const result = ReasoningLoopConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid pattern', () => {
      const config = {
        enabled: true,
        maxIterations: 10,
        pattern: 'invalid_pattern',
        reflectionEnabled: true,
        reflectionTriggers: ['task_completion'],
        planningStrategy: 'adaptive',
      };

      const result = ReasoningLoopConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject maxIterations out of range', () => {
      const config = {
        enabled: true,
        maxIterations: 150, // > 100
        pattern: 'plan_act_reflect',
        reflectionEnabled: true,
        reflectionTriggers: ['task_completion'],
        planningStrategy: 'adaptive',
      };

      const result = ReasoningLoopConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should accept minConfidenceThreshold within range', () => {
      const config = {
        enabled: true,
        maxIterations: 10,
        pattern: 'plan_act_reflect' as const,
        reflectionEnabled: true,
        reflectionTriggers: ['task_completion' as const],
        planningStrategy: 'adaptive' as const,
        minConfidenceThreshold: 0.7,
      };

      const result = ReasoningLoopConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('ToolPolicyConstraintsSchema', () => {
    it('should validate tool policy constraints', () => {
      const constraints = {
        allowedTools: ['http-client', 'database'],
        forbiddenTools: ['system-admin'],
        toolRiskThresholds: {
          'database': 'HIGH' as const,
        },
        requireApprovalFor: ['delete'],
        rateLimits: {
          'http-client': {
            maxCallsPerMinute: 60,
          },
        },
      };

      const result = ToolPolicyConstraintsSchema.safeParse(constraints);
      expect(result.success).toBe(true);
    });

    it('should accept empty constraints', () => {
      const constraints = {};
      const result = ToolPolicyConstraintsSchema.safeParse(constraints);
      expect(result.success).toBe(true);
    });
  });

  describe('MemorySettingsSchema', () => {
    it('should validate memory settings', () => {
      const settings = {
        enabled: true,
        persistenceType: 'hybrid' as const,
        retentionPolicy: {
          episodicNotes: '30d',
          artifacts: '90d',
          snapshots: '7d',
        },
        indexingStrategy: 'temporal' as const,
        autoReflection: true,
        reflectionInterval: 'task_completion' as const,
      };

      const result = MemorySettingsSchema.safeParse(settings);
      expect(result.success).toBe(true);
    });

    it('should apply defaults for missing fields', () => {
      const settings = {};
      const result = MemorySettingsSchema.safeParse(settings);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(true);
        expect(result.data.persistenceType).toBe('hybrid');
        expect(result.data.indexingStrategy).toBe('temporal');
      }
    });
  });

  describe('GovernanceSettingsSchema', () => {
    it('should validate governance settings', () => {
      const settings = {
        crvValidation: {
          enabled: true,
          blockOnFailure: true,
          validators: ['schema', 'security', 'logic_consistency'],
        },
        policyEnforcement: {
          enabled: true,
          strictMode: true,
          approvalThresholds: {
            'LOW': 'auto_approve' as const,
            'MEDIUM': 'auto_approve' as const,
            'HIGH': 'human_approval_required' as const,
            'CRITICAL': 'multi_party_approval_required' as const,
          },
        },
        auditLevel: 'verbose' as const,
        rollbackEnabled: true,
      };

      const result = GovernanceSettingsSchema.safeParse(settings);
      expect(result.success).toBe(true);
    });

    it('should apply default approval thresholds', () => {
      const settings = {
        crvValidation: {
          enabled: true,
          blockOnFailure: true,
          validators: ['schema'],
        },
        policyEnforcement: {
          enabled: true,
          strictMode: true,
        },
        auditLevel: 'standard' as const,
        rollbackEnabled: true,
      };

      const result = GovernanceSettingsSchema.safeParse(settings);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.policyEnforcement.approvalThresholds.HIGH).toBe('human_approval_required');
        expect(result.data.policyEnforcement.approvalThresholds.CRITICAL).toBe('multi_party_approval_required');
      }
    });
  });

  describe('AgentBlueprintSchema with new fields', () => {
    it('should validate complete agent blueprint with Manus capabilities', () => {
      const blueprint = {
        id: 'agent-test-1',
        name: 'Test Agent',
        version: '1.0.0',
        description: 'Test agent with Manus capabilities',
        goal: 'Complete test tasks successfully',
        riskProfile: 'MEDIUM' as const,
        config: {
          prompt: 'You are a test agent',
          systemPrompt: 'System prompt for test agent',
          temperature: 0.7,
          maxTokens: 2048,
          model: 'gpt-4',
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'http-client',
            enabled: true,
            permissions: ['read', 'write'],
            riskTier: 'LOW' as const,
          },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 10,
          pattern: 'plan_act_reflect' as const,
          reflectionEnabled: true,
          reflectionTriggers: ['task_completion' as const, 'failure' as const],
          planningStrategy: 'adaptive' as const,
        },
        toolPolicyConstraints: {
          allowedTools: ['http-client'],
          forbiddenTools: ['system-admin'],
          requireApprovalFor: ['delete'],
        },
        memorySettings: {
          enabled: true,
          persistenceType: 'hybrid' as const,
          autoReflection: true,
          reflectionInterval: 'task_completion' as const,
        },
        governanceSettings: {
          crvValidation: {
            enabled: true,
            blockOnFailure: true,
            validators: ['schema', 'security'],
          },
          policyEnforcement: {
            enabled: true,
            strictMode: true,
            approvalThresholds: {
              'LOW': 'auto_approve' as const,
              'MEDIUM': 'auto_approve' as const,
              'HIGH': 'human_approval_required' as const,
              'CRITICAL': 'multi_party_approval_required' as const,
            },
          },
          auditLevel: 'verbose' as const,
          rollbackEnabled: true,
        },
      };

      const result = AgentBlueprintSchema.safeParse(blueprint);
      expect(result.success).toBe(true);
    });

    it('should validate blueprint without optional Manus fields', () => {
      const blueprint = {
        id: 'agent-simple-1',
        name: 'Simple Agent',
        version: '1.0.0',
        goal: 'Simple task execution',
        riskProfile: 'LOW' as const,
        config: {
          prompt: 'You are a simple agent',
          temperature: 0.7,
        },
        tools: [],
        policies: [],
        workflows: [],
      };

      const result = AgentBlueprintSchema.safeParse(blueprint);
      expect(result.success).toBe(true);
    });

    it('should reject blueprint with invalid reasoning loop config', () => {
      const blueprint = {
        id: 'agent-invalid-1',
        name: 'Invalid Agent',
        version: '1.0.0',
        goal: 'Test invalid config',
        riskProfile: 'MEDIUM' as const,
        config: {
          prompt: 'Test prompt',
          temperature: 0.7,
        },
        tools: [],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 200, // Invalid: > 100
          pattern: 'plan_act_reflect' as const,
          reflectionEnabled: true,
          reflectionTriggers: ['task_completion' as const],
          planningStrategy: 'adaptive' as const,
        },
      };

      const result = AgentBlueprintSchema.safeParse(blueprint);
      expect(result.success).toBe(false);
    });
  });

  describe('validateAgentBlueprint helper function', () => {
    it('should return success for valid blueprint', () => {
      const blueprint: AgentBlueprint = {
        id: 'agent-valid-1',
        name: 'Valid Agent',
        version: '1.0.0',
        goal: 'Complete validation test',
        riskProfile: 'MEDIUM',
        config: {
          prompt: 'You are a valid agent',
          temperature: 0.7,
        },
        tools: [],
        policies: [],
        workflows: [],
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should return errors for invalid blueprint', () => {
      const blueprint = {
        id: 'agent-invalid-2',
        name: '', // Invalid: empty name
        goal: 'Test', // Invalid: too short
        config: {
          prompt: 'Short', // Invalid: too short
          temperature: 0.7,
        },
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should include field names in error messages', () => {
      const blueprint = {
        id: 'agent-error-test',
        name: '',
        goal: 'x',
        config: {
          prompt: 'y',
          temperature: 0.7,
        },
      };

      const result = validateAgentBlueprint(blueprint);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      
      const errorString = result.errors!.join(', ');
      expect(errorString).toContain('name');
      expect(errorString).toContain('goal');
      expect(errorString).toContain('prompt');
    });
  });
});
