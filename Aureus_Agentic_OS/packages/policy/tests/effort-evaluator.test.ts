import { describe, it, expect, beforeEach } from 'vitest';
import {
  EffortEvaluator,
  EffortEvaluatorConfig,
  EffortEvaluationContext,
  RiskTier,
  Principal,
  Action,
} from '../src';
import { ConstraintEngine, SoftConstraint, WorldState } from '@aureus/world-model';
import { TelemetryCollector, MetricsAggregator } from '@aureus/observability';

describe('EffortEvaluator', () => {
  let evaluator: EffortEvaluator;
  let principal: Principal;
  let action: Action;
  let worldState: WorldState;

  beforeEach(() => {
    evaluator = new EffortEvaluator();
    
    principal = {
      id: 'agent-1',
      type: 'agent',
      permissions: [
        { action: 'read', resource: 'database' },
        { action: 'write', resource: 'database' },
      ],
    };

    action = {
      id: 'read-1',
      name: 'Read Data',
      riskTier: RiskTier.LOW,
      requiredPermissions: [{ action: 'read', resource: 'database' }],
      intent: 'read',
    };

    worldState = {
      id: 'state-1',
      entities: new Map(),
      relationships: [],
      constraints: [],
      timestamp: new Date(),
    };
  });

  describe('Basic Evaluation', () => {
    it('should evaluate a basic tool request without constraints', async () => {
      const context: EffortEvaluationContext = {
        principal,
        action,
        toolName: 'readDatabase',
        params: { table: 'users' },
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation).toMatchObject({
        decisionScore: expect.any(Number),
        costScore: expect.any(Number),
        riskScore: expect.any(Number),
        valueScore: expect.any(Number),
        timeScore: expect.any(Number),
        recommendation: expect.stringMatching(/^(approve|review|reject)$/),
        reason: expect.any(String),
      });

      expect(evaluation.decisionScore).toBeGreaterThanOrEqual(0);
      expect(evaluation.decisionScore).toBeLessThanOrEqual(1);
    });

    it('should recommend approval for low risk actions', async () => {
      const context: EffortEvaluationContext = {
        principal,
        action: {
          ...action,
          riskTier: RiskTier.LOW,
        },
        toolName: 'readDatabase',
        params: { table: 'users' },
      };

      const evaluation = await evaluator.evaluate(context);

      // Low risk actions should generally be approved or reviewed (not rejected)
      expect(['approve', 'review']).toContain(evaluation.recommendation);
      expect(evaluation.riskScore).toBeGreaterThanOrEqual(0.7); // Low risk should have high risk score
    });

    it('should recommend review or reject for high risk actions', async () => {
      const context: EffortEvaluationContext = {
        principal,
        action: {
          ...action,
          riskTier: RiskTier.HIGH,
        },
        toolName: 'deleteDatabase',
        params: { table: 'users' },
      };

      const evaluation = await evaluator.evaluate(context);

      expect(['review', 'reject']).toContain(evaluation.recommendation);
      expect(evaluation.riskScore).toBeLessThan(0.5); // High risk should have low risk score
    });

    it('should handle critical risk actions with lowest scores', async () => {
      const context: EffortEvaluationContext = {
        principal,
        action: {
          ...action,
          riskTier: RiskTier.CRITICAL,
        },
        toolName: 'dropDatabase',
        params: { database: 'production' },
      };

      const evaluation = await evaluator.evaluate(context);

      // Critical risk should not be approved
      expect(['review', 'reject']).toContain(evaluation.recommendation);
      expect(evaluation.riskScore).toBeLessThanOrEqual(0.3); // Critical risk should have very low risk score
    });
  });

  describe('World Model Integration', () => {
    it('should incorporate soft constraint scores from world model', async () => {
      const constraintEngine = new ConstraintEngine();

      // Add a cost constraint
      const costConstraint: SoftConstraint = {
        id: 'cost-1',
        description: 'Minimize database query cost',
        category: 'cost',
        severity: 'soft',
        weight: 1.0,
        score: (state, action, params) => {
          // Higher score for read operations (cheaper)
          return action === 'Read Data' ? 0.9 : 0.5;
        },
      };
      constraintEngine.addSoftConstraint(costConstraint);

      evaluator.setConstraintEngine(constraintEngine);

      const context: EffortEvaluationContext = {
        principal,
        action,
        toolName: 'readDatabase',
        params: { table: 'users' },
        worldState,
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.costScore).toBeGreaterThan(0.7); // Should reflect the high cost constraint score
      expect(evaluation.breakdown.worldModelScore).toBeDefined();
    });

    it('should incorporate risk constraint scores from world model', async () => {
      const constraintEngine = new ConstraintEngine();

      // Add a risk constraint
      const riskConstraint: SoftConstraint = {
        id: 'risk-1',
        description: 'Minimize operation risk',
        category: 'risk',
        severity: 'soft',
        weight: 1.0,
        score: (state, action, params) => {
          // Lower score for delete operations (riskier)
          return action === 'Read Data' ? 0.9 : 0.3;
        },
      };
      constraintEngine.addSoftConstraint(riskConstraint);

      evaluator.setConstraintEngine(constraintEngine);

      const context: EffortEvaluationContext = {
        principal,
        action,
        toolName: 'readDatabase',
        params: { table: 'users' },
        worldState,
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.riskScore).toBeGreaterThan(0.7); // Should reflect the high risk constraint score
    });

    it('should incorporate time constraint scores from world model', async () => {
      const constraintEngine = new ConstraintEngine();

      // Add a time constraint
      const timeConstraint: SoftConstraint = {
        id: 'time-1',
        description: 'Optimize for quick operations',
        category: 'time',
        severity: 'soft',
        weight: 1.0,
        score: (state, action, params) => {
          // Higher score for operations expected to be fast
          return action === 'Read Data' ? 0.8 : 0.4;
        },
      };
      constraintEngine.addSoftConstraint(timeConstraint);

      evaluator.setConstraintEngine(constraintEngine);

      const context: EffortEvaluationContext = {
        principal,
        action,
        toolName: 'readDatabase',
        params: { table: 'users' },
        worldState,
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.timeScore).toBeGreaterThan(0.6); // Should reflect the time constraint score
    });
  });

  describe('Observability Integration', () => {
    it('should incorporate observability metrics', async () => {
      const telemetry = new TelemetryCollector();
      
      // Record some successful events with low cost
      for (let i = 0; i < 5; i++) {
        telemetry.recordStepEnd('wf-1', `task-${i}`, 'read', true, 100);
      }

      const metricsAggregator = new MetricsAggregator(telemetry);
      evaluator.setMetricsAggregator(metricsAggregator);

      const context: EffortEvaluationContext = {
        principal,
        action,
        toolName: 'readDatabase',
        params: { table: 'users' },
        workflowId: 'wf-1',
        taskId: 'task-1',
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.breakdown.observabilityScore).toBeDefined();
      expect(evaluation.breakdown.observabilityScore).toBeGreaterThan(0);
    });

    it('should factor in cost per success from metrics', async () => {
      const telemetry = new TelemetryCollector();
      
      // Record events with varying costs
      telemetry.recordStepEnd('wf-1', 'task-1', 'read', true, 50); // Low cost
      telemetry.recordStepEnd('wf-1', 'task-2', 'write', true, 500); // Higher cost

      const metricsAggregator = new MetricsAggregator(telemetry);
      evaluator.setMetricsAggregator(metricsAggregator);

      const context: EffortEvaluationContext = {
        principal,
        action,
        toolName: 'readDatabase',
        params: { table: 'users' },
        workflowId: 'wf-1',
        taskId: 'task-3',
      };

      const evaluation = await evaluator.evaluate(context);

      // Cost score should be influenced by historical costs
      expect(evaluation.costScore).toBeGreaterThanOrEqual(0);
      expect(evaluation.costScore).toBeLessThanOrEqual(1);
    });

    it('should factor in human escalation rate', async () => {
      const telemetry = new TelemetryCollector();
      
      // Record policy checks with escalations
      telemetry.recordPolicyCheck('wf-1', 'task-1', true, false); // No escalation
      telemetry.recordPolicyCheck('wf-1', 'task-2', false, true); // Escalation
      telemetry.recordPolicyCheck('wf-1', 'task-3', true, false); // No escalation

      const metricsAggregator = new MetricsAggregator(telemetry);
      evaluator.setMetricsAggregator(metricsAggregator);

      const context: EffortEvaluationContext = {
        principal,
        action,
        toolName: 'readDatabase',
        params: { table: 'users' },
        workflowId: 'wf-1',
        taskId: 'task-4',
      };

      const evaluation = await evaluator.evaluate(context);

      // Risk score should be influenced by escalation rate
      expect(evaluation.riskScore).toBeGreaterThanOrEqual(0);
      expect(evaluation.riskScore).toBeLessThanOrEqual(1);
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration weights', () => {
      const config: EffortEvaluatorConfig = {
        costWeight: 0.4,
        riskWeight: 0.4,
        valueWeight: 0.1,
        timeWeight: 0.1,
      };

      evaluator = new EffortEvaluator(config);
      const currentConfig = evaluator.getConfig();

      expect(currentConfig.costWeight).toBe(0.4);
      expect(currentConfig.riskWeight).toBe(0.4);
      expect(currentConfig.valueWeight).toBe(0.1);
      expect(currentConfig.timeWeight).toBe(0.1);
    });

    it('should use custom approval and rejection thresholds', async () => {
      const config: EffortEvaluatorConfig = {
        approvalThreshold: 0.8, // Very high threshold
        rejectionThreshold: 0.2,
      };

      evaluator = new EffortEvaluator(config);

      const context: EffortEvaluationContext = {
        principal,
        action: {
          ...action,
          riskTier: RiskTier.MEDIUM,
        },
        toolName: 'updateDatabase',
        params: { table: 'users' },
      };

      const evaluation = await evaluator.evaluate(context);

      // With high approval threshold, medium risk might require review
      expect(['approve', 'review']).toContain(evaluation.recommendation);
    });

    it('should allow updating configuration', () => {
      evaluator.updateConfig({ costWeight: 0.5, riskWeight: 0.5 });
      
      const config = evaluator.getConfig();
      expect(config.costWeight).toBe(0.5);
      expect(config.riskWeight).toBe(0.5);
    });
  });

  describe('Value Scoring', () => {
    it('should assign higher value scores to write operations', async () => {
      const writeAction: Action = {
        id: 'write-1',
        name: 'Write Data',
        riskTier: RiskTier.MEDIUM,
        requiredPermissions: [{ action: 'write', resource: 'database' }],
        intent: 'write',
      };

      const context: EffortEvaluationContext = {
        principal,
        action: writeAction,
        toolName: 'writeDatabase',
        params: { table: 'users', data: { name: 'test' } },
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.valueScore).toBeGreaterThan(0.5);
    });

    it('should assign moderate value scores to read operations', async () => {
      const context: EffortEvaluationContext = {
        principal,
        action: {
          ...action,
          intent: 'read',
        },
        toolName: 'readDatabase',
        params: { table: 'users' },
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.valueScore).toBeGreaterThanOrEqual(0.5);
      expect(evaluation.valueScore).toBeLessThanOrEqual(0.7);
    });

    it('should assign highest value scores to execute operations', async () => {
      const executeAction: Action = {
        id: 'execute-1',
        name: 'Execute Process',
        riskTier: RiskTier.MEDIUM,
        requiredPermissions: [{ action: 'execute', resource: 'system' }],
        intent: 'execute',
      };

      const context: EffortEvaluationContext = {
        principal,
        action: executeAction,
        toolName: 'executeProcess',
        params: { process: 'batch-job' },
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.valueScore).toBeGreaterThan(0.7);
    });
  });

  describe('Combined Scenarios', () => {
    it('should produce high decision score for favorable conditions', async () => {
      const constraintEngine = new ConstraintEngine();
      
      // Add favorable constraints
      const costConstraint: SoftConstraint = {
        id: 'cost-1',
        description: 'Low cost operation',
        category: 'cost',
        severity: 'soft',
        weight: 1.0,
        score: () => 0.9,
      };
      constraintEngine.addSoftConstraint(costConstraint);

      const telemetry = new TelemetryCollector();
      telemetry.recordStepEnd('wf-1', 'task-1', 'read', true, 50);
      telemetry.recordStepEnd('wf-1', 'task-2', 'read', true, 50);
      
      const metricsAggregator = new MetricsAggregator(telemetry);

      evaluator.setConstraintEngine(constraintEngine);
      evaluator.setMetricsAggregator(metricsAggregator);

      const context: EffortEvaluationContext = {
        principal,
        action: {
          ...action,
          riskTier: RiskTier.LOW,
        },
        toolName: 'readDatabase',
        params: { table: 'users' },
        worldState,
        workflowId: 'wf-1',
        taskId: 'task-3',
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.decisionScore).toBeGreaterThan(0.6);
      expect(evaluation.recommendation).toBe('approve');
    });

    it('should produce low decision score for unfavorable conditions', async () => {
      const constraintEngine = new ConstraintEngine();
      
      // Add unfavorable constraints
      const riskConstraint: SoftConstraint = {
        id: 'risk-1',
        description: 'High risk operation',
        category: 'risk',
        severity: 'soft',
        weight: 1.0,
        score: () => 0.2, // Low score = high risk
      };
      constraintEngine.addSoftConstraint(riskConstraint);

      evaluator.setConstraintEngine(constraintEngine);

      const context: EffortEvaluationContext = {
        principal,
        action: {
          ...action,
          riskTier: RiskTier.CRITICAL,
        },
        toolName: 'dropDatabase',
        params: { database: 'production' },
        worldState,
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.decisionScore).toBeLessThan(0.45);
      expect(['review', 'reject']).toContain(evaluation.recommendation);
    });
  });

  describe('Metadata', () => {
    it('should include detailed breakdown in evaluation', async () => {
      const context: EffortEvaluationContext = {
        principal,
        action,
        toolName: 'readDatabase',
        params: { table: 'users' },
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.breakdown).toBeDefined();
      expect(evaluation.breakdown.baseRiskScore).toBeDefined();
      expect(evaluation.metadata).toBeDefined();
      expect(evaluation.metadata?.toolName).toBe('readDatabase');
      expect(evaluation.metadata?.actionId).toBe('read-1');
    });

    it('should include configuration in metadata', async () => {
      const context: EffortEvaluationContext = {
        principal,
        action,
        toolName: 'readDatabase',
        params: { table: 'users' },
      };

      const evaluation = await evaluator.evaluate(context);

      expect(evaluation.metadata?.config).toBeDefined();
      expect(evaluation.metadata?.config).toMatchObject({
        costWeight: expect.any(Number),
        riskWeight: expect.any(Number),
        valueWeight: expect.any(Number),
        timeWeight: expect.any(Number),
      });
    });
  });
});
