import { describe, it, expect, beforeEach } from 'vitest';
import { 
  WorkflowOrchestrator, 
  TaskSpec, 
  WorkflowSpec, 
  TaskExecutor, 
  InMemoryStateStore, 
  InMemoryEventLog 
} from '../src';
import { FeasibilityChecker, ToolRegistry, ToolInfo } from '../src/feasibility';
import { ConstraintEngine, HardConstraint, WorldState } from '@aureus/world-model';

describe('Orchestrator with Feasibility Checks', () => {
  let stateStore: InMemoryStateStore;
  let eventLog: InMemoryEventLog;
  let mockExecutor: TaskExecutor;
  let toolRegistry: ToolRegistry;
  let feasibilityChecker: FeasibilityChecker;
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new InMemoryEventLog();
    mockExecutor = {
      execute: async (task: TaskSpec) => {
        return { taskId: task.id, result: 'success' };
      },
    };
    
    // Setup tool registry
    toolRegistry = new ToolRegistry();
    const availableTool: ToolInfo = {
      name: 'available-tool',
      capabilities: ['http-client', 'json-processing'],
      available: true,
      riskLevel: 'LOW',
    };
    toolRegistry.registerTool(availableTool);

    feasibilityChecker = new FeasibilityChecker(toolRegistry);
    orchestrator = new WorkflowOrchestrator(
      stateStore, 
      mockExecutor, 
      eventLog,
      undefined, // compensationExecutor
      undefined, // worldStateStore
      undefined, // memoryAPI
      undefined, // crvGate
      undefined, // policyGuard
      undefined, // principal
      undefined, // telemetry
      undefined, // faultInjector
      undefined, // hypothesisManager
      undefined, // sandboxIntegration
      feasibilityChecker
    );
  });

  it('should execute workflow when all tasks are feasible', async () => {
    const spec: WorkflowSpec = {
      id: 'test-workflow-1',
      name: 'Feasible Workflow',
      tasks: [
        { 
          id: 'task1', 
          name: 'Task 1', 
          type: 'action',
          toolName: 'available-tool',
        },
        { 
          id: 'task2', 
          name: 'Task 2', 
          type: 'action',
          toolName: 'available-tool',
        },
      ],
      dependencies: new Map([
        ['task2', ['task1']],
      ]),
    };

    const result = await orchestrator.executeWorkflow(spec);
    
    expect(result.status).toBe('completed');
    expect(result.taskStates.size).toBe(2);
    expect(result.taskStates.get('task1')?.status).toBe('completed');
    expect(result.taskStates.get('task2')?.status).toBe('completed');
  });

  it('should fail workflow when task uses unavailable tool', async () => {
    const spec: WorkflowSpec = {
      id: 'test-workflow-2',
      name: 'Infeasible Workflow',
      tasks: [
        { 
          id: 'task1', 
          name: 'Task 1', 
          type: 'action',
          toolName: 'available-tool',
        },
        { 
          id: 'task2', 
          name: 'Task 2 - Unavailable', 
          type: 'action',
          toolName: 'unavailable-tool',
        },
      ],
      dependencies: new Map([
        ['task2', ['task1']],
      ]),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();
    
    const workflowState = await stateStore.loadWorkflowState(spec.id);
    expect(workflowState?.status).toBe('failed');
    expect(workflowState?.taskStates.get('task1')?.status).toBe('completed');
    expect(workflowState?.taskStates.get('task2')?.status).toBe('failed');
    expect(workflowState?.taskStates.get('task2')?.error).toContain('Feasibility check failed');
  });

  it('should log feasibility check events', async () => {
    const spec: WorkflowSpec = {
      id: 'test-workflow-3',
      name: 'Workflow with Events',
      tasks: [
        { 
          id: 'task1', 
          name: 'Task 1', 
          type: 'action',
          toolName: 'available-tool',
        },
      ],
      dependencies: new Map(),
    };

    await orchestrator.executeWorkflow(spec);
    
    const events = await eventLog.read(spec.id);
    const feasibilityEvents = events.filter(
      e => e.type === 'STATE_UPDATED' && e.metadata?.feasibilityCheck
    );
    
    expect(feasibilityEvents.length).toBeGreaterThan(0);
    const feasibilityEvent = feasibilityEvents[0];
    expect(feasibilityEvent.metadata?.feasibilityCheck).toBeDefined();
    expect(feasibilityEvent.metadata?.feasibilityCheck.feasible).toBe(true);
  });

  it('should block task when tool risk exceeds task risk tier', async () => {
    const highRiskTool: ToolInfo = {
      name: 'high-risk-tool',
      capabilities: ['database-write'],
      available: true,
      riskLevel: 'HIGH',
    };
    toolRegistry.registerTool(highRiskTool);

    const spec: WorkflowSpec = {
      id: 'test-workflow-4',
      name: 'Risk Mismatch Workflow',
      tasks: [
        { 
          id: 'task1', 
          name: 'Low Risk Task', 
          type: 'action',
          toolName: 'high-risk-tool',
          riskTier: 'LOW', // Task expects low risk, but tool is high risk
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();
    
    const workflowState = await stateStore.loadWorkflowState(spec.id);
    expect(workflowState?.status).toBe('failed');
    expect(workflowState?.taskStates.get('task1')?.error).toContain('risk level');
  });

  it('should validate against hard constraints', async () => {
    const worldState: WorldState = {
      id: 'world-1',
      entities: new Map(),
      relationships: [],
      constraints: [],
      timestamp: new Date(),
    };

    const constraintEngine = new ConstraintEngine();
    const hardConstraint: HardConstraint = {
      id: 'no-delete-constraint',
      description: 'Deletion operations are not allowed',
      category: 'policy',
      severity: 'hard',
      predicate: (state, action) => action !== 'delete-tool',
      violationMessage: 'Deletion operations are forbidden by policy',
    };
    constraintEngine.addHardConstraint(hardConstraint);

    const checkerWithConstraints = new FeasibilityChecker(
      toolRegistry,
      constraintEngine,
      worldState
    );

    const orchestratorWithConstraints = new WorkflowOrchestrator(
      stateStore,
      mockExecutor,
      eventLog,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      checkerWithConstraints
    );

    const deleteTool: ToolInfo = {
      name: 'delete-tool',
      capabilities: ['file-deletion'],
      available: true,
      riskLevel: 'HIGH',
    };
    toolRegistry.registerTool(deleteTool);

    const spec: WorkflowSpec = {
      id: 'test-workflow-5',
      name: 'Constraint Violation Workflow',
      tasks: [
        { 
          id: 'task1', 
          name: 'Delete Task', 
          type: 'action',
          toolName: 'delete-tool',
          riskTier: 'HIGH',
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestratorWithConstraints.executeWorkflow(spec)).rejects.toThrow();
    
    const workflowState = await stateStore.loadWorkflowState(spec.id);
    expect(workflowState?.status).toBe('failed');
    expect(workflowState?.taskStates.get('task1')?.error).toContain('Hard constraint violations');
  });

  it('should handle tasks without toolName (no feasibility check)', async () => {
    const spec: WorkflowSpec = {
      id: 'test-workflow-6',
      name: 'Workflow without Tool',
      tasks: [
        { 
          id: 'task1', 
          name: 'Task 1', 
          type: 'action',
          // No toolName specified
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(spec);
    
    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task1')?.status).toBe('completed');
  });

  it('should reject tasks with null/undefined inputs', async () => {
    const spec: WorkflowSpec = {
      id: 'test-workflow-7',
      name: 'Invalid Inputs Workflow',
      tasks: [
        { 
          id: 'task1', 
          name: 'Task with Invalid Inputs', 
          type: 'action',
          toolName: 'available-tool',
          inputs: {
            validParam: 'value',
            invalidParam: null,
          },
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();
    
    const workflowState = await stateStore.loadWorkflowState(spec.id);
    expect(workflowState?.status).toBe('failed');
    expect(workflowState?.taskStates.get('task1')?.error).toContain('null or undefined');
  });

  it('should enforce allowed tools list', async () => {
    const restrictedTool: ToolInfo = {
      name: 'restricted-tool',
      capabilities: ['special-operation'],
      available: true,
      riskLevel: 'MEDIUM',
    };
    toolRegistry.registerTool(restrictedTool);

    const spec: WorkflowSpec = {
      id: 'test-workflow-8',
      name: 'Restricted Tool Workflow',
      tasks: [
        { 
          id: 'task1', 
          name: 'Task with Restricted Tool', 
          type: 'action',
          toolName: 'restricted-tool',
          allowedTools: ['available-tool', 'another-allowed-tool'], // restricted-tool not in list
        },
      ],
      dependencies: new Map(),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();
    
    const workflowState = await stateStore.loadWorkflowState(spec.id);
    expect(workflowState?.status).toBe('failed');
    expect(workflowState?.taskStates.get('task1')?.error).toContain('not in the list of allowed tools');
  });

  it('should allow tasks when tool is in allowed tools list', async () => {
    const spec: WorkflowSpec = {
      id: 'test-workflow-9',
      name: 'Allowed Tool Workflow',
      tasks: [
        { 
          id: 'task1', 
          name: 'Task with Allowed Tool', 
          type: 'action',
          toolName: 'available-tool',
          allowedTools: ['available-tool', 'another-allowed-tool'],
        },
      ],
      dependencies: new Map(),
    };

    const result = await orchestrator.executeWorkflow(spec);
    
    expect(result.status).toBe('completed');
    expect(result.taskStates.get('task1')?.status).toBe('completed');
  });

  it('should handle feasibility check for multiple dependent tasks', async () => {
    const tool2: ToolInfo = {
      name: 'tool-2',
      capabilities: ['processing'],
      available: true,
      riskLevel: 'LOW',
    };
    toolRegistry.registerTool(tool2);

    const spec: WorkflowSpec = {
      id: 'test-workflow-10',
      name: 'Multi-Task Workflow',
      tasks: [
        { 
          id: 'task1', 
          name: 'Task 1', 
          type: 'action',
          toolName: 'available-tool',
        },
        { 
          id: 'task2', 
          name: 'Task 2', 
          type: 'action',
          toolName: 'tool-2',
        },
        { 
          id: 'task3', 
          name: 'Task 3 - Infeasible', 
          type: 'action',
          toolName: 'nonexistent-tool',
        },
      ],
      dependencies: new Map([
        ['task2', ['task1']],
        ['task3', ['task2']],
      ]),
    };

    await expect(orchestrator.executeWorkflow(spec)).rejects.toThrow();
    
    const workflowState = await stateStore.loadWorkflowState(spec.id);
    expect(workflowState?.status).toBe('failed');
    expect(workflowState?.taskStates.get('task1')?.status).toBe('completed');
    expect(workflowState?.taskStates.get('task2')?.status).toBe('completed');
    expect(workflowState?.taskStates.get('task3')?.status).toBe('failed');
  });

  it('should get and set feasibility checker', () => {
    const checker = orchestrator.getFeasibilityChecker();
    expect(checker).toBeDefined();
    expect(checker).toBe(feasibilityChecker);

    const newChecker = new FeasibilityChecker(new ToolRegistry());
    orchestrator.setFeasibilityChecker(newChecker);
    expect(orchestrator.getFeasibilityChecker()).toBe(newChecker);
  });
});
