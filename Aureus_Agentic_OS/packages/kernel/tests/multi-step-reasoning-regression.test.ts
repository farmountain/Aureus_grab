import { describe, it, expect, beforeEach } from 'vitest';
import { 
  AgentRuntimeOrchestrator,
} from '../src/agent-runtime-orchestrator';
import { InMemoryStateStore } from '../src/state-store';
import { InMemoryEventLog } from '../src/event-log';
import { TaskExecutor, TaskSpec, TaskState } from '../src/types';
import { AgentBlueprint } from '../src/agent-spec-schema';

describe('Multi-Step Reasoning Regression Tests', () => {
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
  });

  describe('Reasoning Pattern: Plan-Act-Reflect', () => {
    it('should complete full plan-act-reflect cycle', async () => {
      let executionCount = 0;
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          executionCount++;
          return { 
            success: true, 
            taskId: task.id,
            executionNumber: executionCount,
          };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'plan-act-reflect-agent',
        name: 'Plan-Act-Reflect Agent',
        version: '1.0.0',
        goal: 'Test full reasoning cycle',
        riskProfile: 'LOW',
        config: {
          prompt: 'Execute plan-act-reflect pattern',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'analyzer', enabled: true },
          { toolId: 'tool-2', name: 'processor', enabled: true },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 3,
          pattern: 'plan_act_reflect',
          reflectionEnabled: true,
          reflectionTriggers: ['task_completion'],
          planningStrategy: 'adaptive',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);

      // Verify complete cycle
      expect(context.plans.length).toBeGreaterThan(0);
      expect(context.observations.length).toBeGreaterThan(0);
      expect(context.reflections.length).toBeGreaterThan(0);
      
      // Each iteration should have plan, observations, and reflection
      expect(context.currentIteration).toBeGreaterThan(0);
      expect(context.plans.length).toBe(context.currentIteration);
    });

    it('should adapt plans based on previous observations', async () => {
      let failureCount = 0;
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          // Fail first 3 executions to trigger adaptation
          if (failureCount < 3) {
            failureCount++;
            throw new Error('Simulated failure to test adaptation');
          }
          return { success: true, taskId: task.id };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'adaptive-agent',
        name: 'Adaptive Agent',
        version: '1.0.0',
        goal: 'Test adaptive planning',
        riskProfile: 'MEDIUM',
        config: {
          prompt: 'Adapt based on failures',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'unreliable-tool', enabled: true, riskTier: 'HIGH' },
          { toolId: 'tool-2', name: 'reliable-tool', enabled: true, riskTier: 'LOW' },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 5,
          pattern: 'plan_act_reflect',
          reflectionEnabled: true,
          reflectionTriggers: ['failure'],
          planningStrategy: 'adaptive',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);

      // Verify adaptation occurred
      expect(context.observations.some(o => o.outcome === 'failure')).toBe(true);
      expect(context.reflections.length).toBeGreaterThan(0);
      
      // Check if reflections mention failures
      const hasFailureInsight = context.reflections.some(r => 
        r.insights.some(i => i.toLowerCase().includes('failure'))
      );
      expect(hasFailureInsight).toBe(true);
    });
  });

  describe('Reasoning Pattern: Reason-Act', () => {
    it('should execute reason-act pattern without reflection', async () => {
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          return { success: true, taskId: task.id };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'reason-act-agent',
        name: 'Reason-Act Agent',
        version: '1.0.0',
        goal: 'Test reason-act pattern',
        riskProfile: 'LOW',
        config: {
          prompt: 'Execute reason-act pattern',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'reasoning-tool', enabled: true },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 2,
          pattern: 'reason_act',
          reflectionEnabled: false,
          reflectionTriggers: [],
          planningStrategy: 'sequential',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);

      // Verify no reflections occurred
      expect(context.reflections.length).toBe(0);
      
      // But plans and observations should exist
      expect(context.plans.length).toBeGreaterThan(0);
      expect(context.observations.length).toBeGreaterThan(0);
    });
  });

  describe('Reasoning Pattern: OODA Loop', () => {
    it('should execute observe-orient-decide-act pattern', async () => {
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          return { 
            success: true, 
            taskId: task.id,
            observation: 'Task completed',
          };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'ooda-agent',
        name: 'OODA Loop Agent',
        version: '1.0.0',
        goal: 'Test OODA loop pattern',
        riskProfile: 'MEDIUM',
        config: {
          prompt: 'Execute OODA loop',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'sensor', enabled: true },
          { toolId: 'tool-2', name: 'decision-maker', enabled: true },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 3,
          pattern: 'observe_orient_decide_act',
          reflectionEnabled: true,
          reflectionTriggers: ['milestone'],
          planningStrategy: 'adaptive',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);

      // Verify OODA components
      expect(context.observations.length).toBeGreaterThan(0); // Observe
      expect(context.plans.length).toBeGreaterThan(0); // Orient + Decide
      expect(context.currentIteration).toBeGreaterThan(0); // Act
    });
  });

  describe('Reflection Triggers', () => {
    it('should trigger reflection on task completion', async () => {
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          return { success: true, taskId: task.id };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'completion-reflection-agent',
        name: 'Completion Reflection Agent',
        version: '1.0.0',
        goal: 'Test completion-triggered reflection',
        riskProfile: 'LOW',
        config: {
          prompt: 'Reflect on task completion',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'task-tool', enabled: true },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 2,
          pattern: 'plan_act_reflect',
          reflectionEnabled: true,
          reflectionTriggers: ['task_completion'],
          planningStrategy: 'sequential',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);

      // Should have reflections after each iteration
      expect(context.reflections.length).toBeGreaterThan(0);
      expect(context.reflections.length).toBe(context.currentIteration);
    });

    it('should trigger reflection on failures', async () => {
      let attemptCount = 0;
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error('Deliberate failure to trigger reflection');
          }
          return { success: true, taskId: task.id };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'failure-reflection-agent',
        name: 'Failure Reflection Agent',
        version: '1.0.0',
        goal: 'Test failure-triggered reflection',
        riskProfile: 'LOW',
        config: {
          prompt: 'Reflect on failures',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'failing-tool', enabled: true },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 3,
          pattern: 'plan_act_reflect',
          reflectionEnabled: true,
          reflectionTriggers: ['failure'],
          planningStrategy: 'adaptive',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);

      // Should have reflection after failure
      expect(context.reflections.length).toBeGreaterThan(0);
      
      // Should have failure observations
      const hasFailure = context.observations.some(o => o.outcome === 'failure');
      expect(hasFailure).toBe(true);
    });
  });

  describe('Planning Strategy Consistency', () => {
    it('should maintain strategy consistency across iterations', async () => {
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          return { success: true, taskId: task.id };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'consistent-strategy-agent',
        name: 'Consistent Strategy Agent',
        version: '1.0.0',
        goal: 'Test strategy consistency',
        riskProfile: 'LOW',
        config: {
          prompt: 'Maintain consistent strategy',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'test-tool', enabled: true },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 4,
          pattern: 'plan_act_reflect',
          reflectionEnabled: false,
          reflectionTriggers: [],
          planningStrategy: 'hierarchical',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);

      // All plans should use hierarchical strategy
      expect(context.plans.length).toBeGreaterThan(0);
      context.plans.forEach(plan => {
        expect(plan.reasoning).toContain('Hierarchical');
      });
    });
  });

  describe('Confidence Thresholds', () => {
    it('should respect minimum confidence threshold', async () => {
      let executionCount = 0;
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          executionCount++;
          // Fail frequently to reduce confidence
          if (executionCount % 2 === 0) {
            throw new Error('Confidence reduction failure');
          }
          return { success: true, taskId: task.id };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'confidence-agent',
        name: 'Confidence Threshold Agent',
        version: '1.0.0',
        goal: 'Test confidence thresholds',
        riskProfile: 'HIGH',
        config: {
          prompt: 'Maintain confidence threshold',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'unreliable-tool', enabled: true },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 10,
          pattern: 'plan_act_reflect',
          reflectionEnabled: true,
          reflectionTriggers: ['failure'],
          planningStrategy: 'adaptive',
          minConfidenceThreshold: 0.8, // High threshold
        },
      };

      // Should fail due to low confidence
      await expect(orchestrator.executeAgent(blueprint)).rejects.toThrow(/confidence/i);
    });

    it('should succeed when confidence is above threshold', async () => {
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          // Always succeed to maintain high confidence
          return { success: true, taskId: task.id };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'high-confidence-agent',
        name: 'High Confidence Agent',
        version: '1.0.0',
        goal: 'Maintain high confidence',
        riskProfile: 'LOW',
        config: {
          prompt: 'Execute with high confidence',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'reliable-tool', enabled: true },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 3,
          pattern: 'plan_act_reflect',
          reflectionEnabled: false,
          reflectionTriggers: [],
          planningStrategy: 'sequential',
          minConfidenceThreshold: 0.7,
        },
      };

      const context = await orchestrator.executeAgent(blueprint);

      // Should complete successfully with high confidence
      expect(context.goalProgress.achieved).toBe(true);
    });
  });

  describe('Memory Integration', () => {
    it('should write episodic notes during execution', async () => {
      const executor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          return { success: true, taskId: task.id };
        },
      };

      const orchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        executor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'memory-agent',
        name: 'Memory Integration Agent',
        version: '1.0.0',
        goal: 'Test memory integration',
        riskProfile: 'LOW',
        config: {
          prompt: 'Record episodic memories',
          temperature: 0.7,
        },
        tools: [
          { toolId: 'tool-1', name: 'memory-tool', enabled: true },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 2,
          pattern: 'plan_act_reflect',
          reflectionEnabled: true,
          reflectionTriggers: ['task_completion'],
          planningStrategy: 'sequential',
        },
        memorySettings: {
          enabled: true,
          persistenceType: 'episodic',
          autoReflection: true,
          reflectionInterval: 'task_completion',
          indexingStrategy: 'temporal',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);

      // Verify execution completed
      expect(context.currentIteration).toBeGreaterThan(0);
      
      // Memory writes would be captured in the eventLog
      const events = await eventLog.getAllEvents();
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
