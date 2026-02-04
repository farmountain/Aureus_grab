import { describe, it, expect, beforeEach } from 'vitest';
import { IntegratedToolWrapper, createActionForTool, createCRVConfigForTool } from '../src/integrated-wrapper';
import { ToolSpec, IdempotencyStrategy, InMemoryToolResultCache } from '../src/index';
import { GoalGuardFSM, Principal, RiskTier, Intent, DataZone } from '@aureus/policy';
import { CRVGate, Validators } from '@aureus/crv';

describe('Integrated Tool Wrapper - Policy + CRV Integration', () => {
  let cache: InMemoryToolResultCache;
  let policyGuard: GoalGuardFSM;
  let principal: Principal;

  beforeEach(() => {
    cache = new InMemoryToolResultCache();
    policyGuard = new GoalGuardFSM();
    
    principal = {
      id: 'agent-1',
      type: 'agent',
      permissions: [
        { action: 'read', resource: 'tool' },
        { action: 'write', resource: 'tool' },
      ],
    };
  });

  describe('Policy Integration', () => {
    it('should pass LOW risk tool through policy gate', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-read',
        name: 'Mock Read Tool',
        description: 'A mock read tool',
        parameters: [],
        sideEffect: false,
        execute: async () => ({ data: 'test' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      const action = createActionForTool(mockTool);
      
      const result = await wrapper.execute(
        {},
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
        }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'test' });
    });

    it('should block tool when policy denies access', async () => {
      const restrictedTool: ToolSpec = {
        id: 'restricted-tool',
        name: 'Restricted Tool',
        description: 'A restricted tool',
        parameters: [],
        sideEffect: true,
        execute: async () => ({ data: 'restricted' }),
      };

      const wrapper = new IntegratedToolWrapper(restrictedTool);
      
      // Create action that requires admin permission
      const action = createActionForTool(restrictedTool, { riskTier: RiskTier.HIGH });
      action.requiredPermissions = [
        { action: 'admin', resource: 'tool' }, // Principal doesn't have this
      ];
      
      const result = await wrapper.execute(
        {},
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Policy violation');
    });

    it('should validate tool against allowed tools list', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-tool',
        name: 'Mock Tool',
        description: 'A mock tool',
        parameters: [],
        execute: async () => ({ data: 'test' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      // Create action that only allows specific tools
      const action = createActionForTool(mockTool, {
        allowedTools: ['Different Tool'], // This tool is not allowed
      });
      
      const result = await wrapper.execute(
        {},
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed for this action');
    });
  });

  describe('CRV Integration', () => {
    it('should validate tool inputs with CRV gate', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-tool',
        name: 'Mock Tool',
        description: 'A mock tool',
        parameters: [{ name: 'value', type: 'number', required: true }],
        sideEffect: false, // Make it LOW risk
        execute: async (params) => ({ result: params.value }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      const action = createActionForTool(mockTool, { riskTier: RiskTier.LOW });
      
      // Create CRV gate that validates data is not null (works for both input and output)
      const crvConfig = createCRVConfigForTool(mockTool, {
        validators: [
          Validators.notNull(),
        ],
        blockOnFailure: true,
      });
      const crvGate = new CRVGate(crvConfig);
      
      // Valid input
      const validResult = await wrapper.execute(
        { value: 42 },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          crvGate,
        }
      );

      expect(validResult.success).toBe(true);
      expect(validResult.metadata?.crvPassed).toBe(true);
    });

    it('should block tool execution when CRV input validation fails', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-tool',
        name: 'Mock Tool',
        description: 'A mock tool',
        parameters: [{ name: 'value', type: 'number', required: true }],
        sideEffect: false, // Make it LOW risk
        execute: async (params) => ({ result: params.value }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      const action = createActionForTool(mockTool, { riskTier: RiskTier.LOW });
      
      // Create CRV gate that validates input schema
      const crvConfig = createCRVConfigForTool(mockTool, {
        validators: [
          Validators.schema({ value: 'number' }),
        ],
        blockOnFailure: true,
      });
      const crvGate = new CRVGate(crvConfig);
      
      // Invalid input (string instead of number)
      const invalidResult = await wrapper.execute(
        { value: 'not a number' },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          crvGate,
        }
      );

      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain('CRV input validation failed');
      expect(invalidResult.metadata?.crvStatus).toBeDefined();
    });

    it('should validate tool outputs with CRV gate', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-tool',
        name: 'Mock Tool',
        description: 'A mock tool',
        parameters: [],
        sideEffect: false, // Make it LOW risk
        execute: async () => null, // Returns null (invalid output)
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      const action = createActionForTool(mockTool, { riskTier: RiskTier.LOW });
      
      // Create CRV gate that validates output must not be null
      const crvConfig = createCRVConfigForTool(mockTool, {
        validators: [
          (commit) => ({
            valid: commit.data !== null,
            reason: commit.data === null ? 'Output must not be null' : 'Valid',
            confidence: 1.0,
          }),
        ],
        blockOnFailure: true,
      });
      const crvGate = new CRVGate(crvConfig);
      
      const result = await wrapper.execute(
        {},
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          crvGate,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('CRV output validation failed');
      expect(result.data).toBeNull(); // Data still included
    });
  });

  describe('Full Integration (Policy + CRV + Idempotency)', () => {
    it('should pass tool through all gates successfully', async () => {
      let executionCount = 0;
      
      const mockTool: ToolSpec = {
        id: 'full-integration',
        name: 'Full Integration Tool',
        description: 'A tool that goes through all gates',
        parameters: [{ name: 'value', type: 'number', required: true }],
        sideEffect: true,
        idempotencyStrategy: IdempotencyStrategy.CACHE_REPLAY,
        execute: async (params) => {
          executionCount++;
          return { result: (params.value as number) * 2 };
        },
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      const action = createActionForTool(mockTool, { riskTier: RiskTier.LOW });
      
      const crvConfig = createCRVConfigForTool(mockTool, {
        validators: [
          Validators.notNull(),
          // Only validate that data exists, not its structure
          // Input validation checks { value: number }, output is { result: number }
        ],
        blockOnFailure: true,
      });
      const crvGate = new CRVGate(crvConfig);
      
      const context = {
        taskId: 'task-1',
        stepId: 'step-1',
        workflowId: 'workflow-1',
        cache,
        principal,
        action,
        policyGuard,
        crvGate,
      };
      
      // First execution - should pass all gates
      const result1 = await wrapper.execute({ value: 21 }, context);
      
      expect(result1.success).toBe(true);
      expect(result1.data).toEqual({ result: 42 });
      expect(result1.metadata?.crvPassed).toBe(true);
      expect(executionCount).toBe(1);
      
      // Second execution - should use cache (idempotency)
      const result2 = await wrapper.execute({ value: 21 }, context);
      
      expect(result2.success).toBe(true);
      expect(result2.data).toEqual({ result: 42 });
      expect(result2.metadata?.replayed).toBe(true);
      expect(executionCount).toBe(1); // Should not increment
    });

    it('should fail at policy gate before reaching CRV', async () => {
      let executionCount = 0;
      
      const mockTool: ToolSpec = {
        id: 'policy-fail-tool',
        name: 'Policy Fail Tool',
        description: 'A tool that fails policy check',
        parameters: [],
        execute: async () => {
          executionCount++;
          return { result: 'executed' };
        },
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      // Create action with permissions principal doesn't have
      const action = createActionForTool(mockTool);
      action.requiredPermissions = [
        { action: 'admin', resource: 'tool' },
      ];
      
      const crvConfig = createCRVConfigForTool(mockTool, {
        validators: [Validators.notNull()],
        blockOnFailure: true,
      });
      const crvGate = new CRVGate(crvConfig);
      
      const result = await wrapper.execute(
        {},
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          crvGate,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Policy violation');
      expect(executionCount).toBe(0); // Should not execute
    });

    it('should fail at CRV gate before execution', async () => {
      let executionCount = 0;
      
      const mockTool: ToolSpec = {
        id: 'crv-fail-tool',
        name: 'CRV Fail Tool',
        description: 'A tool that fails CRV check',
        parameters: [{ name: 'value', type: 'number', required: true }],
        sideEffect: false, // Make it LOW risk
        execute: async () => {
          executionCount++;
          return { result: 'executed' };
        },
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      const action = createActionForTool(mockTool, { riskTier: RiskTier.LOW });
      
      const crvConfig = createCRVConfigForTool(mockTool, {
        validators: [
          Validators.schema({ value: 'number' }), // Expect number
        ],
        blockOnFailure: true,
      });
      const crvGate = new CRVGate(crvConfig);
      
      const result = await wrapper.execute(
        { value: 'not a number' }, // Invalid input
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          crvGate,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('CRV input validation failed');
      expect(executionCount).toBe(0); // Should not execute
    });
  });

  describe('Failure Injection Tests', () => {
    it('should handle tool execution failure gracefully', async () => {
      const failingTool: ToolSpec = {
        id: 'failing-tool',
        name: 'Failing Tool',
        description: 'A tool that fails',
        parameters: [],
        sideEffect: false, // Make it LOW risk
        execute: async () => {
          throw new Error('Simulated tool failure');
        },
      };

      const wrapper = new IntegratedToolWrapper(failingTool);
      const action = createActionForTool(failingTool, { riskTier: RiskTier.LOW });
      
      const result = await wrapper.execute(
        {},
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Simulated tool failure');
    });

    it('should handle policy evaluation failure', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-tool',
        name: 'Mock Tool',
        description: 'A mock tool',
        parameters: [],
        execute: async () => ({ result: 'test' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      // Create action with conflicting permissions
      const action = createActionForTool(mockTool);
      action.requiredPermissions = [
        { action: 'read', resource: 'tool', dataZone: DataZone.RESTRICTED },
      ];
      
      // Principal only has PUBLIC access
      const restrictedPrincipal: Principal = {
        id: 'agent-2',
        type: 'agent',
        permissions: [
          { action: 'read', resource: 'tool', dataZone: DataZone.PUBLIC },
        ],
      };
      
      const result = await wrapper.execute(
        {},
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal: restrictedPrincipal,
          action,
          policyGuard,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Policy violation');
    });

    it('should handle CRV validation exception gracefully', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-tool',
        name: 'Mock Tool',
        description: 'A mock tool',
        parameters: [],
        sideEffect: false, // Make it LOW risk
        execute: async () => ({ result: 'test' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      const action = createActionForTool(mockTool, { riskTier: RiskTier.LOW });
      
      // Create CRV gate with validator that throws
      const crvConfig = createCRVConfigForTool(mockTool, {
        validators: [
          async () => {
            throw new Error('Validator exception');
          },
        ],
        blockOnFailure: true,
      });
      const crvGate = new CRVGate(crvConfig);
      
      // Should handle the exception
      await expect(
        wrapper.execute(
          {},
          {
            taskId: 'task-1',
            stepId: 'step-1',
            workflowId: 'workflow-1',
            cache,
            principal,
            action,
            policyGuard,
            crvGate,
          }
        )
      ).rejects.toThrow('Validator exception');
    });
  });
});
