import { describe, it, expect, beforeEach } from 'vitest';
import { IntegratedToolWrapper } from '../src/integrated-wrapper';
import { ToolSpec, InMemoryToolResultCache } from '../src/index';
import { GoalGuardFSM, Principal, RiskTier, EffortEvaluator, EffortEvaluatorConfig } from '@aureus/policy';
import { ConstraintEngine, SoftConstraint, WorldState } from '@aureus/world-model';
import { TelemetryCollector, MetricsAggregator } from '@aureus/observability';

describe('Integrated Tool Wrapper - Effort Evaluator Integration', () => {
  let cache: InMemoryToolResultCache;
  let policyGuard: GoalGuardFSM;
  let effortEvaluator: EffortEvaluator;
  let principal: Principal;
  let worldState: WorldState;

  beforeEach(() => {
    cache = new InMemoryToolResultCache();
    policyGuard = new GoalGuardFSM();
    effortEvaluator = new EffortEvaluator();
    
    principal = {
      id: 'agent-1',
      type: 'agent',
      permissions: [
        { action: 'read', resource: 'tool' },
        { action: 'write', resource: 'tool' },
      ],
    };

    worldState = {
      id: 'state-1',
      entities: new Map(),
      relationships: [],
      constraints: [],
      timestamp: new Date(),
    };
  });

  describe('Effort Evaluation Before Policy', () => {
    it('should execute tool when effort evaluation approves', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-read',
        name: 'Mock Read Tool',
        description: 'A mock read tool',
        parameters: [],
        sideEffect: false,
        execute: async () => ({ data: 'test' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      const action = {
        id: 'read-1',
        name: 'Read Data',
        riskTier: RiskTier.LOW,
        requiredPermissions: [{ action: 'read', resource: 'tool' }],
        intent: 'read' as const,
      };
      
      const result = await wrapper.execute(
        { table: 'users' },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          effortEvaluator,
          worldState,
        }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'test' });
    });

    it('should block tool when effort evaluation rejects', async () => {
      // Configure effort evaluator with very high rejection threshold
      const config: EffortEvaluatorConfig = {
        approvalThreshold: 0.95, // Very high
        rejectionThreshold: 0.9,  // Very high
      };
      effortEvaluator = new EffortEvaluator(config);

      const mockTool: ToolSpec = {
        id: 'mock-delete',
        name: 'Mock Delete Tool',
        description: 'A mock delete tool',
        parameters: [],
        sideEffect: true,
        execute: async () => ({ data: 'deleted' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      const action = {
        id: 'delete-1',
        name: 'Delete Data',
        riskTier: RiskTier.CRITICAL, // Critical risk
        requiredPermissions: [{ action: 'write', resource: 'tool' }],
        intent: 'delete' as const,
      };
      
      const result = await wrapper.execute(
        { table: 'users' },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          effortEvaluator,
          worldState,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Effort evaluation rejected');
      expect(result.metadata?.effortEvaluation).toBeDefined();
      expect(result.metadata?.phase).toBe('effort-evaluation');
    });

    it('should continue to policy validation when effort evaluation recommends review', async () => {
      // Configure effort evaluator with moderate thresholds
      const config: EffortEvaluatorConfig = {
        approvalThreshold: 0.7,
        rejectionThreshold: 0.3,
      };
      effortEvaluator = new EffortEvaluator(config);

      const mockTool: ToolSpec = {
        id: 'mock-write',
        name: 'Mock Write Tool',
        description: 'A mock write tool',
        parameters: [],
        sideEffect: true,
        execute: async () => ({ data: 'written' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      const action = {
        id: 'write-1',
        name: 'Write Data',
        riskTier: RiskTier.MEDIUM,
        requiredPermissions: [{ action: 'write', resource: 'tool' }],
        intent: 'write' as const,
      };
      
      const result = await wrapper.execute(
        { table: 'users', data: { name: 'test' } },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          effortEvaluator,
          worldState,
        }
      );

      // Should succeed because policy allows MEDIUM risk
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'written' });
    });
  });

  describe('Effort Evaluation with World Model Constraints', () => {
    it('should incorporate world model cost constraints', async () => {
      const constraintEngine = new ConstraintEngine();
      
      // Add a favorable cost constraint
      const costConstraint: SoftConstraint = {
        id: 'cost-1',
        description: 'Low cost operation',
        category: 'cost',
        severity: 'soft',
        weight: 1.0,
        score: () => 0.9, // High score = low cost
      };
      constraintEngine.addSoftConstraint(costConstraint);

      effortEvaluator.setConstraintEngine(constraintEngine);

      const mockTool: ToolSpec = {
        id: 'mock-read',
        name: 'Mock Read Tool',
        description: 'A mock read tool',
        parameters: [],
        sideEffect: false,
        execute: async () => ({ data: 'test' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      const action = {
        id: 'read-1',
        name: 'Read Data',
        riskTier: RiskTier.LOW,
        requiredPermissions: [{ action: 'read', resource: 'tool' }],
        intent: 'read' as const,
      };
      
      const result = await wrapper.execute(
        { table: 'users' },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          effortEvaluator,
          worldState,
        }
      );

      expect(result.success).toBe(true);
    });

    it('should incorporate world model risk constraints', async () => {
      const constraintEngine = new ConstraintEngine();
      
      // Add an unfavorable risk constraint
      const riskConstraint: SoftConstraint = {
        id: 'risk-1',
        description: 'High risk operation',
        category: 'risk',
        severity: 'soft',
        weight: 2.0, // Higher weight
        score: () => 0.1, // Low score = high risk
      };
      constraintEngine.addSoftConstraint(riskConstraint);

      const config: EffortEvaluatorConfig = {
        approvalThreshold: 0.8,
        rejectionThreshold: 0.5,
      };
      effortEvaluator = new EffortEvaluator(config);
      effortEvaluator.setConstraintEngine(constraintEngine);

      const mockTool: ToolSpec = {
        id: 'mock-delete',
        name: 'Mock Delete Tool',
        description: 'A mock delete tool',
        parameters: [],
        sideEffect: true,
        execute: async () => ({ data: 'deleted' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      const action = {
        id: 'delete-1',
        name: 'Delete Data',
        riskTier: RiskTier.HIGH,
        requiredPermissions: [{ action: 'write', resource: 'tool' }],
        intent: 'delete' as const,
      };
      
      const result = await wrapper.execute(
        { table: 'users' },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          effortEvaluator,
          worldState,
        }
      );

      // Should be rejected by effort evaluation due to high risk
      expect(result.success).toBe(false);
      expect(result.error).toContain('Effort evaluation rejected');
    });
  });

  describe('Effort Evaluation with Observability Metrics', () => {
    it('should incorporate observability metrics in evaluation', async () => {
      const telemetry = new TelemetryCollector();
      
      // Record some successful operations with low cost
      for (let i = 0; i < 5; i++) {
        telemetry.recordStepEnd('workflow-1', `task-${i}`, 'read', true, 100);
      }
      
      const metricsAggregator = new MetricsAggregator(telemetry);
      effortEvaluator.setMetricsAggregator(metricsAggregator);

      const mockTool: ToolSpec = {
        id: 'mock-read',
        name: 'Mock Read Tool',
        description: 'A mock read tool',
        parameters: [],
        sideEffect: false,
        execute: async () => ({ data: 'test' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      const action = {
        id: 'read-1',
        name: 'Read Data',
        riskTier: RiskTier.LOW,
        requiredPermissions: [{ action: 'read', resource: 'tool' }],
        intent: 'read' as const,
      };
      
      const result = await wrapper.execute(
        { table: 'users' },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          effortEvaluator,
          worldState,
        }
      );

      expect(result.success).toBe(true);
    });

    it('should consider human escalation rate in risk scoring', async () => {
      const telemetry = new TelemetryCollector();
      
      // Record policy checks with high escalation rate
      for (let i = 0; i < 10; i++) {
        const requiresApproval = i < 8; // 80% escalation rate
        telemetry.recordPolicyCheck('workflow-1', `task-${i}`, !requiresApproval, requiresApproval);
      }
      
      const metricsAggregator = new MetricsAggregator(telemetry);
      
      const config: EffortEvaluatorConfig = {
        approvalThreshold: 0.7,
        rejectionThreshold: 0.4,
      };
      effortEvaluator = new EffortEvaluator(config);
      effortEvaluator.setMetricsAggregator(metricsAggregator);

      const mockTool: ToolSpec = {
        id: 'mock-write',
        name: 'Mock Write Tool',
        description: 'A mock write tool',
        parameters: [],
        sideEffect: true,
        execute: async () => ({ data: 'written' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      const action = {
        id: 'write-1',
        name: 'Write Data',
        riskTier: RiskTier.MEDIUM,
        requiredPermissions: [{ action: 'write', resource: 'tool' }],
        intent: 'write' as const,
      };
      
      const result = await wrapper.execute(
        { table: 'users', data: { name: 'test' } },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          effortEvaluator,
          worldState,
        }
      );

      // High escalation rate may influence the decision
      // But policy should still allow MEDIUM risk actions
      expect(result.success).toBe(true);
    });
  });

  describe('Integration Flow', () => {
    it('should execute full flow: effort eval -> policy -> tool execution', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-read',
        name: 'Mock Read Tool',
        description: 'A mock read tool',
        parameters: [],
        sideEffect: false,
        execute: async (params) => ({ data: 'test', params }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      const action = {
        id: 'read-1',
        name: 'Read Data',
        riskTier: RiskTier.LOW,
        requiredPermissions: [{ action: 'read', resource: 'tool' }],
        intent: 'read' as const,
      };
      
      const result = await wrapper.execute(
        { table: 'users' },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          effortEvaluator,
          worldState,
        }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'test', params: { table: 'users' } });
    });

    it('should work without effort evaluator (optional integration)', async () => {
      const mockTool: ToolSpec = {
        id: 'mock-read',
        name: 'Mock Read Tool',
        description: 'A mock read tool',
        parameters: [],
        sideEffect: false,
        execute: async () => ({ data: 'test' }),
      };

      const wrapper = new IntegratedToolWrapper(mockTool);
      
      const action = {
        id: 'read-1',
        name: 'Read Data',
        riskTier: RiskTier.LOW,
        requiredPermissions: [{ action: 'read', resource: 'tool' }],
        intent: 'read' as const,
      };
      
      // No effort evaluator provided
      const result = await wrapper.execute(
        { table: 'users' },
        {
          taskId: 'task-1',
          stepId: 'step-1',
          workflowId: 'workflow-1',
          cache,
          principal,
          action,
          policyGuard,
          // effortEvaluator not provided
        }
      );

      // Should still work without effort evaluator
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'test' });
    });
  });
});
