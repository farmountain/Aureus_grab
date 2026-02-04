import { describe, it, expect, beforeEach } from 'vitest';
import { 
  AgentRuntimeOrchestrator,
  AgentExecutionContext,
} from '../src/agent-runtime-orchestrator';
import { InMemoryStateStore } from '../src/state-store';
import { InMemoryEventLog } from '../src/event-log';
import { TaskExecutor, TaskSpec, TaskState } from '../src/types';
import { AgentBlueprint } from '../src/agent-spec-schema';

describe('Agent Execution Lifecycle Integration Tests', () => {
  let orchestrator: AgentRuntimeOrchestrator;
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let executor: TaskExecutor;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
    
    // Simple executor that always succeeds
    executor = {
      execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
        return { success: true, taskId: task.id };
      },
    };

    orchestrator = new AgentRuntimeOrchestrator(
      stateStore,
      executor,
      eventLog
    );
  });

  describe('Agent Initialization', () => {
    it('should initialize agent with blueprint', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-1',
        name: 'Test Agent',
        version: '1.0.0',
        goal: 'Test agent initialization',
        riskProfile: 'LOW',
        config: {
          prompt: 'Test prompt for agent initialization',
          temperature: 0.7,
        },
        tools: [],
        policies: [],
        workflows: [],
      };

      await orchestrator.initializeAgent(blueprint);
      
      const context = orchestrator.getExecutionContext();
      expect(context).toBeDefined();
      expect(context!.agentId).toBe('test-agent-1');
      expect(context!.currentIteration).toBe(0);
      expect(context!.observations).toEqual([]);
    });

    it('should initialize with reasoning loop config', async () => {
      const blueprint: AgentBlueprint = {
        id: 'test-agent-2',
        name: 'Test Agent with Reasoning',
        version: '1.0.0',
        goal: 'Test reasoning loop initialization',
        riskProfile: 'MEDIUM',
        config: {
          prompt: 'Test prompt with reasoning loop',
          temperature: 0.7,
        },
        tools: [],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 5,
          pattern: 'plan_act_reflect',
          reflectionEnabled: true,
          reflectionTriggers: ['task_completion'],
          planningStrategy: 'adaptive',
        },
      };

      await orchestrator.initializeAgent(blueprint);
      
      const context = orchestrator.getExecutionContext();
      expect(context).toBeDefined();
      expect(context!.maxIterations).toBe(5);
    });
  });

  describe('Agent Execution without Reasoning Loop', () => {
    it('should execute agent without reasoning loop', async () => {
      const blueprint: AgentBlueprint = {
        id: 'simple-agent',
        name: 'Simple Agent',
        version: '1.0.0',
        goal: 'Execute simple workflow',
        riskProfile: 'LOW',
        config: {
          prompt: 'Simple execution test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            enabled: true,
          },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: false,
          maxIterations: 1,
          pattern: 'plan_act_reflect',
          reflectionEnabled: false,
          reflectionTriggers: [],
          planningStrategy: 'sequential',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);
      
      expect(context.goalProgress.achieved).toBe(true);
      expect(context.goalProgress.progressPercent).toBe(100);
    });
  });

  describe('Agent Execution with Reasoning Loop', () => {
    it('should execute agent with iterative planning', async () => {
      const blueprint: AgentBlueprint = {
        id: 'iterative-agent',
        name: 'Iterative Agent',
        version: '1.0.0',
        goal: 'Execute with iterative planning',
        riskProfile: 'MEDIUM',
        config: {
          prompt: 'Iterative execution test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool-1',
            enabled: true,
          },
          {
            toolId: 'tool-2',
            name: 'test-tool-2',
            enabled: true,
          },
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
      
      expect(context.currentIteration).toBeGreaterThan(0);
      expect(context.currentIteration).toBeLessThanOrEqual(3);
      expect(context.observations.length).toBeGreaterThan(0);
      expect(context.plans.length).toBeGreaterThan(0);
    });

    it('should perform reflection when enabled', async () => {
      const blueprint: AgentBlueprint = {
        id: 'reflective-agent',
        name: 'Reflective Agent',
        version: '1.0.0',
        goal: 'Execute with reflection',
        riskProfile: 'LOW',
        config: {
          prompt: 'Reflection test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            enabled: true,
          },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 2,
          pattern: 'plan_act_reflect',
          reflectionEnabled: true,
          reflectionTriggers: ['task_completion', 'failure'],
          planningStrategy: 'sequential',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);
      
      expect(context.reflections.length).toBeGreaterThan(0);
      expect(context.reflections[0].insights).toBeDefined();
      expect(context.reflections[0].adjustments).toBeDefined();
    });

    it('should respect maxIterations limit', async () => {
      const maxIterations = 5;
      const blueprint: AgentBlueprint = {
        id: 'limited-agent',
        name: 'Limited Iterations Agent',
        version: '1.0.0',
        goal: 'Test iteration limits',
        riskProfile: 'LOW',
        config: {
          prompt: 'Iteration limit test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            enabled: true,
          },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations,
          pattern: 'plan_act_reflect',
          reflectionEnabled: false,
          reflectionTriggers: [],
          planningStrategy: 'sequential',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);
      
      expect(context.currentIteration).toBeLessThanOrEqual(maxIterations);
    });
  });

  describe('Planning Strategies', () => {
    it('should use adaptive planning strategy', async () => {
      const blueprint: AgentBlueprint = {
        id: 'adaptive-agent',
        name: 'Adaptive Planning Agent',
        version: '1.0.0',
        goal: 'Test adaptive planning',
        riskProfile: 'MEDIUM',
        config: {
          prompt: 'Adaptive planning test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            enabled: true,
            riskTier: 'LOW',
          },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 2,
          pattern: 'plan_act_reflect',
          reflectionEnabled: true,
          reflectionTriggers: ['task_completion'],
          planningStrategy: 'adaptive',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);
      
      expect(context.plans.length).toBeGreaterThan(0);
      expect(context.plans[0].reasoning).toContain('Adaptive');
    });

    it('should use sequential planning strategy', async () => {
      const blueprint: AgentBlueprint = {
        id: 'sequential-agent',
        name: 'Sequential Planning Agent',
        version: '1.0.0',
        goal: 'Test sequential planning',
        riskProfile: 'LOW',
        config: {
          prompt: 'Sequential planning test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            enabled: true,
          },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 2,
          pattern: 'plan_act_reflect',
          reflectionEnabled: false,
          reflectionTriggers: [],
          planningStrategy: 'sequential',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);
      
      expect(context.plans.length).toBeGreaterThan(0);
      expect(context.plans[0].reasoning).toContain('Sequential');
    });

    it('should use hierarchical planning strategy', async () => {
      const blueprint: AgentBlueprint = {
        id: 'hierarchical-agent',
        name: 'Hierarchical Planning Agent',
        version: '1.0.0',
        goal: 'Test hierarchical planning',
        riskProfile: 'MEDIUM',
        config: {
          prompt: 'Hierarchical planning test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            enabled: true,
          },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 2,
          pattern: 'plan_act_reflect',
          reflectionEnabled: false,
          reflectionTriggers: [],
          planningStrategy: 'hierarchical',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);
      
      expect(context.plans.length).toBeGreaterThan(0);
      expect(context.plans[0].reasoning).toContain('Hierarchical');
    });
  });

  describe('Goal Progress Assessment', () => {
    it('should track goal progress', async () => {
      const blueprint: AgentBlueprint = {
        id: 'progress-agent',
        name: 'Progress Tracking Agent',
        version: '1.0.0',
        goal: 'Test progress tracking',
        riskProfile: 'LOW',
        config: {
          prompt: 'Progress tracking test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            enabled: true,
          },
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
        },
      };

      const context = await orchestrator.executeAgent(blueprint);
      
      expect(context.goalProgress).toBeDefined();
      expect(context.goalProgress.progressPercent).toBeGreaterThanOrEqual(0);
      expect(context.goalProgress.progressPercent).toBeLessThanOrEqual(100);
    });

    it('should mark goal as achieved when progress is high', async () => {
      const blueprint: AgentBlueprint = {
        id: 'achieving-agent',
        name: 'Goal Achieving Agent',
        version: '1.0.0',
        goal: 'Achieve goal successfully',
        riskProfile: 'LOW',
        config: {
          prompt: 'Goal achievement test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'test-tool',
            enabled: true,
          },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 2,
          pattern: 'plan_act_reflect',
          reflectionEnabled: false,
          reflectionTriggers: [],
          planningStrategy: 'sequential',
        },
      };

      const context = await orchestrator.executeAgent(blueprint);
      
      // With our simple executor that always succeeds, goal should be achieved
      expect(context.goalProgress.achieved).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle executor failures gracefully', async () => {
      // Create failing executor
      const failingExecutor: TaskExecutor = {
        execute: async (task: TaskSpec, state: TaskState): Promise<unknown> => {
          throw new Error('Task execution failed');
        },
      };

      const failingOrchestrator = new AgentRuntimeOrchestrator(
        stateStore,
        failingExecutor,
        eventLog
      );

      const blueprint: AgentBlueprint = {
        id: 'failing-agent',
        name: 'Failing Agent',
        version: '1.0.0',
        goal: 'Test error handling',
        riskProfile: 'LOW',
        config: {
          prompt: 'Error handling test',
          temperature: 0.7,
        },
        tools: [
          {
            toolId: 'tool-1',
            name: 'failing-tool',
            enabled: true,
          },
        ],
        policies: [],
        workflows: [],
        reasoningLoop: {
          enabled: true,
          maxIterations: 2,
          pattern: 'plan_act_reflect',
          reflectionEnabled: false,
          reflectionTriggers: [],
          planningStrategy: 'sequential',
        },
      };

      await expect(failingOrchestrator.executeAgent(blueprint)).rejects.toThrow();
    });
  });
});
