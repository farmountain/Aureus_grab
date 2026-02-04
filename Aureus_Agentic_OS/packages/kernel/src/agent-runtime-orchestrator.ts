import { 
  WorkflowOrchestrator,
} from './orchestrator';
import { 
  TaskSpec,
  TaskState,
  WorkflowSpec,
  StateStore,
  TaskExecutor,
  EventLog,
  CompensationExecutor,
} from './types';
import { StateStore as WorldModelStateStore } from '@aureus/world-model';
import { CRVGate } from '@aureus/crv';
import { GoalGuardFSM, Principal } from '@aureus/policy';
import { FaultInjector } from './fault-injection';
import { SandboxIntegration } from './sandbox-integration';
import { 
  AgentBlueprint, 
  ReasoningLoopConfig,
  ToolPolicyConstraints,
  MemorySettings,
  GovernanceSettings,
} from './agent-spec-schema';

/**
 * Agent execution context for tracking state across iterations
 */
export interface AgentExecutionContext {
  agentId: string;
  blueprint: AgentBlueprint;
  currentIteration: number;
  maxIterations: number;
  observations: Array<{
    iteration: number;
    timestamp: Date;
    taskId: string;
    outcome: 'success' | 'failure';
    data: unknown;
    reflection?: string;
  }>;
  plans: Array<{
    iteration: number;
    timestamp: Date;
    tasks: TaskSpec[];
    reasoning: string;
  }>;
  reflections: Array<{
    iteration: number;
    timestamp: Date;
    insights: string[];
    adjustments: string[];
  }>;
  goalProgress: {
    achieved: boolean;
    progressPercent: number;
    remainingTasks: string[];
  };
}

/**
 * Agent Runtime Orchestrator
 * 
 * Extends WorkflowOrchestrator with agent-specific capabilities:
 * - Iterative planning and adaptive workflows
 * - Integrated CRV and Goal-Guard policy gates per step
 * - Idempotent side effects and rollback
 * - Memory-guided reasoning and self-reflection
 * - Dynamic tool selection based on context
 */
export class AgentRuntimeOrchestrator extends WorkflowOrchestrator {
  private agentBlueprint?: AgentBlueprint;
  private executionContext?: AgentExecutionContext;
  private reasoningConfig?: ReasoningLoopConfig;

  constructor(
    stateStore: StateStore,
    executor: TaskExecutor,
    eventLog?: EventLog,
    compensationExecutor?: CompensationExecutor,
    worldStateStore?: WorldModelStateStore,
    memoryAPI?: any, // Use any for now since MemoryAPI import is not available
    crvGate?: CRVGate,
    policyGuard?: GoalGuardFSM,
    principal?: Principal,
    telemetry?: any, // Use any for now since TelemetryCollector import is not available
    faultInjector?: FaultInjector,
    hypothesisManager?: any, // Use any for now since HypothesisManager import is not available
    sandboxIntegration?: SandboxIntegration
  ) {
    super(
      stateStore,
      executor,
      eventLog,
      compensationExecutor,
      worldStateStore,
      memoryAPI,
      crvGate,
      policyGuard,
      principal,
      telemetry,
      faultInjector,
      hypothesisManager,
      sandboxIntegration
    );
  }

  /**
   * Initialize agent with blueprint
   */
  async initializeAgent(blueprint: AgentBlueprint): Promise<void> {
    this.agentBlueprint = blueprint;
    this.reasoningConfig = blueprint.reasoningLoop;
    
    // Initialize execution context
    this.executionContext = {
      agentId: blueprint.id,
      blueprint,
      currentIteration: 0,
      maxIterations: blueprint.reasoningLoop?.maxIterations || 10,
      observations: [],
      plans: [],
      reflections: [],
      goalProgress: {
        achieved: false,
        progressPercent: 0,
        remainingTasks: [],
      },
    };

    // Initialize world model from blueprint config if present
    await this.initializeWorldModelFromConfig(blueprint);

    // Initialize memory engine from blueprint config if present
    await this.initializeMemoryEngineFromConfig(blueprint);

    // Write initialization to memory
    if (this.getMemoryAPI()) {
      this.writeEpisodicNote(
        blueprint.id,
        'agent-init',
        {
          event: 'agent_initialized',
          agentId: blueprint.id,
          agentName: blueprint.name,
          goal: blueprint.goal,
          timestamp: new Date(),
        },
        {
          tags: ['agent_lifecycle', 'initialized'],
          metadata: { 
            riskProfile: blueprint.riskProfile,
            hasReasoningLoop: !!blueprint.reasoningLoop,
            hasWorldModelConfig: !!(blueprint as any).worldModelConfig,
            hasMemoryEngineConfig: !!(blueprint as any).memoryEngineConfig,
          },
        }
      );
    }
  }

  /**
   * Initialize world model from blueprint config
   * @param blueprint - Agent blueprint with optional world model config
   */
  private async initializeWorldModelFromConfig(blueprint: AgentBlueprint): Promise<void> {
    const extendedBlueprint = blueprint as any;
    
    if (!extendedBlueprint.worldModelConfig) {
      return; // No world model config present
    }

    const worldModelConfig = extendedBlueprint.worldModelConfig;
    const worldStateStore = (this as any).worldStateStore;
    
    if (!worldStateStore) {
      console.warn('World state store not available, skipping world model initialization');
      return;
    }

    try {
      // Initialize world model entities
      if (worldModelConfig.entities && Array.isArray(worldModelConfig.entities)) {
        for (const entity of worldModelConfig.entities) {
          // Create initial state for each entity
          const entityState = {
            id: entity.id,
            name: entity.name,
            attributes: entity.attributes.reduce((acc: any, attr: any) => {
              acc[attr.name] = attr.required ? null : undefined;
              return acc;
            }, {}),
            createdAt: new Date(),
          };
          
          // Store entity state
          await worldStateStore.set(`entity:${entity.id}`, entityState);
        }
      }

      // Store world model metadata
      await worldStateStore.set(`world-model:${blueprint.id}`, {
        id: worldModelConfig.id,
        name: worldModelConfig.name,
        version: worldModelConfig.version,
        domain: worldModelConfig.domain,
        initialized: true,
        timestamp: new Date(),
      });

      console.log(`World model initialized for agent ${blueprint.id}`);
    } catch (error) {
      console.error('Failed to initialize world model:', error);
      // Don't throw - allow agent to continue without world model
    }
  }

  /**
   * Initialize memory engine from blueprint config
   * @param blueprint - Agent blueprint with optional memory engine config
   */
  private async initializeMemoryEngineFromConfig(blueprint: AgentBlueprint): Promise<void> {
    const extendedBlueprint = blueprint as any;
    
    if (!extendedBlueprint.memoryEngineConfig) {
      return; // No memory engine config present
    }

    const memoryEngineConfig = extendedBlueprint.memoryEngineConfig;
    const memoryPolicy = memoryEngineConfig?.policy ?? memoryEngineConfig;
    const memoryAPI = this.getMemoryAPI();
    
    if (!memoryAPI) {
      console.warn('Memory API not available, skipping memory engine initialization');
      return;
    }

    try {
      if (!memoryPolicy) {
        console.warn('Memory policy missing, skipping memory engine initialization');
        return;
      }

      // Apply memory config to the runtime MemoryAPI (and HipCortex if wired)
      const runtimeConfig = memoryEngineConfig?.policy
        ? memoryEngineConfig
        : {
            schemaVersion: '1.0',
            policy: memoryPolicy,
            policyConfig: {
              goals: [],
              riskProfile: blueprint.riskProfile.toLowerCase(),
            },
            generatedAt: new Date().toISOString(),
            generatedBy: 'runtime',
            source: {
              blueprintId: blueprint.id,
              blueprintName: blueprint.name,
              riskProfile: blueprint.riskProfile,
            },
          };

      if (memoryAPI.applyMemoryEngineConfig) {
        memoryAPI.applyMemoryEngineConfig(runtimeConfig);
      }

      // Store memory policy configuration for runtime use
      if (memoryPolicy?.retentionTiers && Array.isArray(memoryPolicy.retentionTiers)) {
        const policyMetadata = {
          policyId: memoryPolicy.id,
          policyName: memoryPolicy.name,
          retentionTiers: memoryPolicy.retentionTiers,
          summarizationSchedule: memoryPolicy.summarizationSchedule,
          indexingStrategy: memoryPolicy.indexingStrategy,
          governanceThresholds: memoryPolicy.governanceThresholds,
          appliedAt: new Date(),
          schemaVersion: runtimeConfig.schemaVersion,
        };

        this.writeEpisodicNote(
          blueprint.id,
          'memory-policy-applied',
          {
            event: 'memory_policy_applied',
            agentId: blueprint.id,
            policyMetadata,
            timestamp: new Date(),
          },
          {
            tags: ['memory_policy', 'configuration'],
            metadata: { policyId: memoryPolicy.id },
          }
        );
      }

      console.log(`Memory engine initialized for agent ${blueprint.id}`);
    } catch (error) {
      console.error('Failed to initialize memory engine:', error);
      // Don't throw - allow agent to continue without memory engine config
    }
  }

  /**
   * Execute agent with iterative planning and reflection
   */
  async executeAgent(blueprint: AgentBlueprint): Promise<AgentExecutionContext> {
    await this.initializeAgent(blueprint);

    if (!this.executionContext) {
      throw new Error('Agent execution context not initialized');
    }

    const context = this.executionContext;

    // Check if reasoning loop is enabled
    if (!blueprint.reasoningLoop?.enabled) {
      // Execute as a single workflow without iteration
      const workflow = await this.generateInitialWorkflow(blueprint);
      await this.executeWorkflow(workflow);
      context.goalProgress.achieved = true;
      context.goalProgress.progressPercent = 100;
      return context;
    }

    // Iterative execution loop: PLAN → ACT → OBSERVE → REFLECT
    while (context.currentIteration < context.maxIterations && !context.goalProgress.achieved) {
      context.currentIteration++;

      try {
        // PLAN: Generate or adapt execution plan
        const workflow = await this.planIteration(context);
        
        // ACT: Execute the planned tasks
        const workflowState = await this.executeWorkflow(workflow);
        
        // OBSERVE: Collect outcomes and update context
        await this.observeExecution(context, workflow, workflowState);
        
        // REFLECT: Analyze results and update strategy
        if (blueprint.reasoningLoop.reflectionEnabled) {
          await this.reflectOnExecution(context);
        }
        
        // Check if goal is achieved
        await this.assessGoalProgress(context);

        // If goal is achieved, break the loop
        if (context.goalProgress.achieved) {
          break;
        }

        // Check confidence threshold if configured
        if (blueprint.reasoningLoop.minConfidenceThreshold !== undefined) {
          const confidence = this.calculateConfidence(context);
          if (confidence < blueprint.reasoningLoop.minConfidenceThreshold) {
            throw new Error(
              `Confidence ${confidence} below threshold ${blueprint.reasoningLoop.minConfidenceThreshold}`
            );
          }
        }
      } catch (error) {
        // Handle iteration failure
        await this.handleIterationFailure(context, error);
        
        // Decide whether to retry or abort
        if (context.currentIteration >= context.maxIterations) {
          throw new Error(`Agent execution failed after ${context.maxIterations} iterations: ${error}`);
        }
      }
    }

    // Write final state to memory
    if (this.getMemoryAPI()) {
      this.writeEpisodicNote(
        blueprint.id,
        'agent-complete',
        {
          event: 'agent_completed',
          agentId: blueprint.id,
          iterations: context.currentIteration,
          goalAchieved: context.goalProgress.achieved,
          timestamp: new Date(),
        },
        {
          tags: ['agent_lifecycle', 'completed'],
          metadata: {
            progressPercent: context.goalProgress.progressPercent,
            totalObservations: context.observations.length,
            totalReflections: context.reflections.length,
          },
        }
      );
    }

    return context;
  }

  /**
   * Generate initial workflow from agent blueprint
   */
  private async generateInitialWorkflow(blueprint: AgentBlueprint): Promise<WorkflowSpec> {
    // Convert agent blueprint workflows into WorkflowSpec
    const tasks: TaskSpec[] = [];
    
    // Generate tasks from tools and workflows
    if (blueprint.tools.length > 0) {
      blueprint.tools.forEach((tool: any, index: number) => {
        tasks.push({
          id: `task-${index + 1}`,
          name: tool.name,
          type: 'action',
          toolName: tool.name,
          riskTier: tool.riskTier || blueprint.riskProfile,
          retry: {
            maxAttempts: blueprint.maxRetries || 3,
            backoffMs: 1000,
          },
          timeoutMs: blueprint.maxExecutionTime,
        });
      });
    }

    return {
      id: `${blueprint.id}-workflow-1`,
      name: `${blueprint.name} Execution`,
      tasks,
      dependencies: new Map(),
    };
  }

  /**
   * Plan iteration: generate or adapt execution plan
   */
  private async planIteration(context: AgentExecutionContext): Promise<WorkflowSpec> {
    const blueprint = context.blueprint;
    
    // Determine planning strategy
    const strategy = blueprint.reasoningLoop?.planningStrategy || 'adaptive';
    
    let tasks: TaskSpec[];
    let reasoning: string;
    
    switch (strategy) {
      case 'adaptive':
        // Use past observations to adapt the plan
        ({ tasks, reasoning } = await this.generateAdaptivePlan(context));
        break;
      case 'hierarchical':
        // Decompose goal into hierarchical sub-goals
        ({ tasks, reasoning } = await this.generateHierarchicalPlan(context));
        break;
      case 'sequential':
        // Simple sequential execution
        ({ tasks, reasoning } = await this.generateSequentialPlan(context));
        break;
      default:
        throw new Error(`Unknown planning strategy: ${strategy}`);
    }

    // Record the plan
    context.plans.push({
      iteration: context.currentIteration,
      timestamp: new Date(),
      tasks,
      reasoning,
    });

    // Write plan to memory
    if (this.getMemoryAPI()) {
      this.writeEpisodicNote(
        blueprint.id,
        `plan-${context.currentIteration}`,
        {
          event: 'plan_generated',
          iteration: context.currentIteration,
          strategy,
          taskCount: tasks.length,
          reasoning,
          timestamp: new Date(),
        },
        {
          tags: ['planning', strategy],
          metadata: { iteration: context.currentIteration },
        }
      );
    }

    return {
      id: `${blueprint.id}-workflow-${context.currentIteration}`,
      name: `${blueprint.name} Iteration ${context.currentIteration}`,
      tasks,
      dependencies: new Map(),
    };
  }

  /**
   * Generate adaptive plan based on past observations
   */
  private async generateAdaptivePlan(context: AgentExecutionContext): Promise<{
    tasks: TaskSpec[];
    reasoning: string;
  }> {
    const blueprint = context.blueprint;
    
    // Analyze past observations
    const recentFailures = context.observations
      .filter(obs => obs.outcome === 'failure')
      .slice(-3);
    
    const recentSuccesses = context.observations
      .filter(obs => obs.outcome === 'success')
      .slice(-3);

    // Adjust plan based on patterns
    const tasks: TaskSpec[] = [];
    let reasoning = `Adaptive planning (iteration ${context.currentIteration}). `;
    
    if (recentFailures.length > recentSuccesses.length) {
      reasoning += 'Recent failures detected - using conservative approach. ';
      // Use safer tools with more retries
      blueprint.tools
        .filter((tool: any) => tool.riskTier !== 'HIGH' && tool.riskTier !== 'CRITICAL')
        .forEach((tool: any, index: number) => {
          tasks.push({
            id: `task-adaptive-${index + 1}`,
            name: tool.name,
            type: 'action',
            toolName: tool.name,
            riskTier: tool.riskTier || 'LOW',
            retry: { maxAttempts: 5, backoffMs: 2000 },
          });
        });
    } else {
      reasoning += 'Recent successes - proceeding with normal execution. ';
      // Use all available tools
      blueprint.tools.forEach((tool: any, index: number) => {
        tasks.push({
          id: `task-adaptive-${index + 1}`,
          name: tool.name,
          type: 'action',
          toolName: tool.name,
          riskTier: tool.riskTier || blueprint.riskProfile,
          retry: { maxAttempts: 3, backoffMs: 1000 },
        });
      });
    }

    return { tasks, reasoning };
  }

  /**
   * Generate hierarchical plan
   */
  private async generateHierarchicalPlan(context: AgentExecutionContext): Promise<{
    tasks: TaskSpec[];
    reasoning: string;
  }>  {
    // Placeholder for hierarchical planning
    // In production, this would use LLM or knowledge graph to decompose goals
    const tasks: TaskSpec[] = context.blueprint.tools.map((tool: any, index: number) => ({
      id: `task-hierarchical-${index + 1}`,
      name: tool.name,
      type: 'action',
      toolName: tool.name,
      riskTier: tool.riskTier || context.blueprint.riskProfile,
    }));

    const reasoning = `Hierarchical decomposition (iteration ${context.currentIteration})`;
    return { tasks, reasoning };
  }

  /**
   * Generate sequential plan
   */
  private async generateSequentialPlan(context: AgentExecutionContext): Promise<{
    tasks: TaskSpec[];
    reasoning: string;
  }> {
    const tasks: TaskSpec[] = context.blueprint.tools.map((tool: any, index: number) => ({
      id: `task-sequential-${index + 1}`,
      name: tool.name,
      type: 'action',
      toolName: tool.name,
      riskTier: tool.riskTier || context.blueprint.riskProfile,
    }));

    const reasoning = `Sequential execution (iteration ${context.currentIteration})`;
    return { tasks, reasoning };
  }

  /**
   * Observe execution outcomes
   */
  private async observeExecution(
    context: AgentExecutionContext,
    workflow: WorkflowSpec,
    workflowState: any
  ): Promise<void> {
    // Extract observations from workflow execution
    for (const task of workflow.tasks) {
      const taskState = workflowState.taskStates.get(task.id);
      if (taskState) {
        context.observations.push({
          iteration: context.currentIteration,
          timestamp: new Date(),
          taskId: task.id,
          outcome: taskState.status === 'completed' ? 'success' : 'failure',
          data: taskState.result || taskState.error,
        });
      }
    }

    // Write observations to memory
    if (this.getMemoryAPI()) {
      this.writeEpisodicNote(
        context.blueprint.id,
        `observe-${context.currentIteration}`,
        {
          event: 'execution_observed',
          iteration: context.currentIteration,
          observations: context.observations.slice(-workflow.tasks.length),
          timestamp: new Date(),
        },
        {
          tags: ['observation'],
          metadata: { iteration: context.currentIteration },
        }
      );
    }
  }

  /**
   * Reflect on execution and extract insights
   */
  private async reflectOnExecution(context: AgentExecutionContext): Promise<void> {
    const insights: string[] = [];
    const adjustments: string[] = [];

    // Analyze recent observations
    const recentObs = context.observations.slice(-10);
    const successCount = recentObs.filter(obs => obs.outcome === 'success').length;
    const failureCount = recentObs.filter(obs => obs.outcome === 'failure').length;

    // Extract insights
    if (failureCount > successCount) {
      insights.push('High failure rate detected - need to adjust strategy');
      adjustments.push('Switch to more reliable tools or increase retry attempts');
    }

    if (successCount === recentObs.length) {
      insights.push('Consistent success - current strategy is effective');
      adjustments.push('Continue with current approach');
    }

    // Check for specific failure patterns
    const failedTaskIds = recentObs
      .filter(obs => obs.outcome === 'failure')
      .map(obs => obs.taskId);
    
    const repeatedFailures = failedTaskIds.filter(
      (id, index) => failedTaskIds.indexOf(id) !== index
    );

    if (repeatedFailures.length > 0) {
      insights.push(`Repeated failures detected for tasks: ${repeatedFailures.join(', ')}`);
      adjustments.push('Consider alternative tools or approaches for failing tasks');
    }

    // Record reflection
    context.reflections.push({
      iteration: context.currentIteration,
      timestamp: new Date(),
      insights,
      adjustments,
    });

    // Write reflection to memory
    if (this.getMemoryAPI()) {
      this.writeEpisodicNote(
        context.blueprint.id,
        `reflect-${context.currentIteration}`,
        {
          event: 'reflection_completed',
          iteration: context.currentIteration,
          insights,
          adjustments,
          timestamp: new Date(),
        },
        {
          tags: ['reflection', 'learning'],
          metadata: { iteration: context.currentIteration },
        }
      );
    }
  }

  /**
   * Assess progress toward goal
   */
  private async assessGoalProgress(context: AgentExecutionContext): Promise<void> {
    // Calculate progress based on successful observations
    const totalObs = context.observations.length;
    const successfulObs = context.observations.filter(obs => obs.outcome === 'success').length;
    
    const progressPercent = totalObs > 0 ? (successfulObs / totalObs) * 100 : 0;
    
    // Simple heuristic: goal is achieved if we have high success rate and completed at least one full iteration
    const goalAchieved = progressPercent >= 80 && context.currentIteration > 0;

    context.goalProgress = {
      achieved: goalAchieved,
      progressPercent,
      remainingTasks: goalAchieved ? [] : context.blueprint.tools.map((t: any) => t.name),
    };

    // Write progress update to memory
    if (this.getMemoryAPI()) {
      this.writeEpisodicNote(
        context.blueprint.id,
        `progress-${context.currentIteration}`,
        {
          event: 'goal_progress_assessed',
          iteration: context.currentIteration,
          progressPercent,
          goalAchieved,
          timestamp: new Date(),
        },
        {
          tags: ['progress'],
          metadata: { iteration: context.currentIteration },
        }
      );
    }
  }

  /**
   * Calculate confidence score based on execution history
   */
  private calculateConfidence(context: AgentExecutionContext): number {
    if (context.observations.length === 0) {
      return 0.5; // Neutral confidence
    }

    const recentObs = context.observations.slice(-10);
    const successCount = recentObs.filter(obs => obs.outcome === 'success').length;
    
    return successCount / recentObs.length;
  }

  /**
   * Handle iteration failure
   */
  private async handleIterationFailure(
    context: AgentExecutionContext,
    error: unknown
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Write failure to memory
    if (this.getMemoryAPI()) {
      this.writeEpisodicNote(
        context.blueprint.id,
        `failure-${context.currentIteration}`,
        {
          event: 'iteration_failed',
          iteration: context.currentIteration,
          error: errorMessage,
          timestamp: new Date(),
        },
        {
          tags: ['failure', 'error'],
          metadata: { 
            iteration: context.currentIteration,
            errorType: error instanceof Error ? error.name : 'unknown',
          },
        }
      );
    }

    // Record as observation
    context.observations.push({
      iteration: context.currentIteration,
      timestamp: new Date(),
      taskId: `iteration-${context.currentIteration}`,
      outcome: 'failure',
      data: errorMessage,
    });
  }

  /**
   * Get agent execution context
   */
  getExecutionContext(): AgentExecutionContext | undefined {
    return this.executionContext;
  }

  /**
   * Get agent blueprint
   */
  getAgentBlueprint(): AgentBlueprint | undefined {
    return this.agentBlueprint;
  }
}
