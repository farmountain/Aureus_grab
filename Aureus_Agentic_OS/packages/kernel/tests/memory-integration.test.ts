import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowOrchestrator } from '../src/orchestrator';
import { WorkflowSpec, TaskSpec, TaskState, StateStore, TaskExecutor } from '../src/types';
import { MemoryAPI } from '@aureus/memory-hipcortex';

describe('Memory Integration', () => {
  let orchestrator: WorkflowOrchestrator;
  let memoryAPI: MemoryAPI;
  let stateStore: StateStore;
  let executor: TaskExecutor;

  beforeEach(() => {
    // Create in-memory state store
    const workflowStates = new Map();
    const taskStates = new Map();

    stateStore = {
      async saveWorkflowState(state) {
        workflowStates.set(state.workflowId, state);
      },
      async loadWorkflowState(workflowId) {
        return workflowStates.get(workflowId) || null;
      },
      async saveTaskState(workflowId, taskState) {
        const key = `${workflowId}:${taskState.taskId}`;
        taskStates.set(key, taskState);
      },
      async loadTaskState(workflowId, taskId) {
        const key = `${workflowId}:${taskId}`;
        return taskStates.get(key) || null;
      },
    };

    // Create simple task executor
    executor = {
      async execute(task: TaskSpec, state: TaskState) {
        return { success: true, taskId: task.id };
      },
    };

    // Create memory API
    memoryAPI = new MemoryAPI();

    // Create orchestrator with memory API
    orchestrator = new WorkflowOrchestrator(
      stateStore,
      executor,
      undefined,
      undefined,
      undefined,
      memoryAPI
    );
  });

  it('should write episodic notes with provenance', async () => {
    const workflow: WorkflowSpec = {
      id: 'workflow-1',
      name: 'Test Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'Test Task',
          type: 'action',
        },
      ],
      dependencies: new Map(),
    };

    await orchestrator.executeWorkflow(workflow);

    // Check that episodic notes were written
    const timeline = memoryAPI.list_timeline('workflow-1');
    expect(timeline.length).toBeGreaterThan(0);

    // Check that notes have proper provenance
    const startNote = timeline.find(entry => 
      (entry.content as any).event === 'task_started'
    );
    expect(startNote).toBeDefined();
    expect(startNote?.provenance.task_id).toBe('workflow-1');
    expect(startNote?.provenance.step_id).toBe('task-1');
    expect(startNote?.type).toBe('episodic_note');
    expect(startNote?.tags).toContain('task_lifecycle');
    expect(startNote?.tags).toContain('started');

    const completedNote = timeline.find(entry =>
      (entry.content as any).event === 'task_completed'
    );
    expect(completedNote).toBeDefined();
    expect(completedNote?.provenance.task_id).toBe('workflow-1');
    expect(completedNote?.provenance.step_id).toBe('task-1');
    expect(completedNote?.tags).toContain('completed');
  });

  it('should write episodic notes for multiple tasks', async () => {
    const workflow: WorkflowSpec = {
      id: 'workflow-2',
      name: 'Multi-Task Workflow',
      tasks: [
        { id: 'task-1', name: 'Task 1', type: 'action' },
        { id: 'task-2', name: 'Task 2', type: 'action' },
      ],
      dependencies: new Map([['task-2', ['task-1']]]),
    };

    await orchestrator.executeWorkflow(workflow);

    const timeline = memoryAPI.list_timeline('workflow-2');
    
    // Should have entries for both tasks
    const task1Entries = timeline.filter(e => e.provenance.step_id === 'task-1');
    const task2Entries = timeline.filter(e => e.provenance.step_id === 'task-2');

    expect(task1Entries.length).toBeGreaterThan(0);
    expect(task2Entries.length).toBeGreaterThan(0);

    // Timeline should be in chronological order
    expect(timeline[0].provenance.timestamp.getTime()).toBeLessThanOrEqual(
      timeline[timeline.length - 1].provenance.timestamp.getTime()
    );
  });

  it('should allow manual episodic note writes', () => {
    const entry = orchestrator.writeEpisodicNote(
      'workflow-3',
      'step-1',
      { message: 'Custom note' },
      {
        tags: ['custom', 'important'],
        metadata: { category: 'manual' },
      }
    );

    expect(entry).toBeDefined();
    expect(entry?.type).toBe('episodic_note');
    expect(entry?.provenance.task_id).toBe('workflow-3');
    expect(entry?.provenance.step_id).toBe('step-1');
    expect(entry?.tags).toContain('custom');

    // Verify it was written to memory
    const timeline = memoryAPI.list_timeline('workflow-3');
    expect(timeline).toHaveLength(1);
    expect(timeline[0].id).toBe(entry?.id);
  });

  it('should allow artifact writes with provenance', () => {
    const entry = orchestrator.writeArtifact(
      'workflow-4',
      'step-1',
      { filename: 'report.pdf', size: 1024 },
      {
        tags: ['report', 'output'],
        metadata: { format: 'pdf' },
      }
    );

    expect(entry).toBeDefined();
    expect(entry?.type).toBe('artifact');
    expect(entry?.provenance.task_id).toBe('workflow-4');
    expect(entry?.provenance.step_id).toBe('step-1');

    // Verify it was written
    const artifacts = memoryAPI.getArtifacts('workflow-4');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].id).toBe(entry?.id);
  });

  it('should allow snapshot writes with provenance', () => {
    const entry = orchestrator.writeSnapshot(
      'workflow-5',
      'step-1',
      { state: { counter: 42 } },
      {
        tags: ['state_checkpoint'],
      }
    );

    expect(entry).toBeDefined();
    expect(entry?.type).toBe('snapshot');
    expect(entry?.provenance.task_id).toBe('workflow-5');

    // Verify it was written
    const snapshots = memoryAPI.getSnapshots('workflow-5');
    expect(snapshots).toHaveLength(1);
  });

  it('should get memory timeline for workflow', async () => {
    const workflow: WorkflowSpec = {
      id: 'workflow-6',
      name: 'Test Timeline',
      tasks: [
        { id: 'task-1', name: 'Task 1', type: 'action' },
      ],
      dependencies: new Map(),
    };

    await orchestrator.executeWorkflow(workflow);

    // Add manual entry
    orchestrator.writeEpisodicNote(
      'workflow-6',
      'manual-step',
      { message: 'Manual entry' }
    );

    const timeline = orchestrator.getMemoryTimeline('workflow-6');
    expect(timeline.length).toBeGreaterThan(0);

    // Should include both automatic and manual entries
    const manualEntry = timeline.find(e => e.provenance.step_id === 'manual-step');
    expect(manualEntry).toBeDefined();
  });

  it('should handle missing memory API gracefully', () => {
    // Create orchestrator without memory API
    const noMemoryOrchestrator = new WorkflowOrchestrator(
      stateStore,
      executor
    );

    // Should not throw error
    const entry = noMemoryOrchestrator.writeEpisodicNote(
      'workflow-7',
      'step-1',
      { message: 'Test' }
    );

    expect(entry).toBeUndefined();

    const timeline = noMemoryOrchestrator.getMemoryTimeline('workflow-7');
    expect(timeline).toEqual([]);
  });

  it('should maintain audit trail in memory API', async () => {
    const workflow: WorkflowSpec = {
      id: 'workflow-8',
      name: 'Audit Test',
      tasks: [
        { id: 'task-1', name: 'Task 1', type: 'action' },
      ],
      dependencies: new Map(),
    };

    await orchestrator.executeWorkflow(workflow);

    // Check audit log
    const auditLog = memoryAPI.getAuditLog();
    const entries = auditLog.queryByTaskId('workflow-8');

    expect(entries.length).toBeGreaterThan(0);
    entries.forEach(entry => {
      expect(entry.contentHash).toBeDefined();
      expect(entry.provenance).toBeDefined();
      expect(entry.provenance?.task_id).toBe('workflow-8');
    });
  });

  it('should include risk tier in episodic note metadata', async () => {
    const workflow: WorkflowSpec = {
      id: 'workflow-9',
      name: 'Risk Tier Test',
      tasks: [
        {
          id: 'task-1',
          name: 'High Risk Task',
          type: 'action',
          riskTier: 'HIGH',
        },
      ],
      dependencies: new Map(),
    };

    await orchestrator.executeWorkflow(workflow);

    const timeline = memoryAPI.list_timeline('workflow-9');
    const taskEntry = timeline.find(e =>
      (e.content as any).event === 'task_started'
    );

    expect(taskEntry?.metadata?.riskTier).toBe('HIGH');
  });
});
