import { StateStore, WorkflowState, TaskState } from './types';

/**
 * InMemoryStateStore provides a simple in-memory implementation with tenant isolation
 * In production, this would be replaced with a durable store (e.g., PostgreSQL, Redis)
 */
export class InMemoryStateStore implements StateStore {
  private workflows = new Map<string, WorkflowState>();
  private tasks = new Map<string, Map<string, TaskState>>();

  async saveWorkflowState(state: WorkflowState): Promise<void> {
    // Deep clone to ensure immutability
    this.workflows.set(state.workflowId, JSON.parse(JSON.stringify({
      ...state,
      taskStates: Array.from(state.taskStates.entries()),
    })));
  }

  async loadWorkflowState(workflowId: string, tenantId?: string): Promise<WorkflowState | null> {
    const stored = this.workflows.get(workflowId);
    if (!stored) return null;

    // Reconstruct Map from serialized array
    const parsed = JSON.parse(JSON.stringify(stored)) as any;
    const state = {
      ...parsed,
      taskStates: new Map(parsed.taskStates),
      startedAt: parsed.startedAt ? new Date(parsed.startedAt) : undefined,
      completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
    };

    // Tenant isolation: verify tenant access
    if (tenantId && state.tenantId && state.tenantId !== tenantId) {
      return null; // Deny access to workflows from other tenants
    }

    return state;
  }

  async saveTaskState(workflowId: string, taskState: TaskState): Promise<void> {
    if (!this.tasks.has(workflowId)) {
      this.tasks.set(workflowId, new Map());
    }
    
    const workflowTasks = this.tasks.get(workflowId)!;
    workflowTasks.set(taskState.taskId, JSON.parse(JSON.stringify(taskState)));
  }

  async loadTaskState(workflowId: string, taskId: string, tenantId?: string): Promise<TaskState | null> {
    // First check tenant isolation at workflow level
    if (tenantId) {
      const workflow = await this.loadWorkflowState(workflowId, tenantId);
      if (!workflow) return null; // Tenant doesn't have access to this workflow
    }

    const workflowTasks = this.tasks.get(workflowId);
    if (!workflowTasks) return null;

    const stored = workflowTasks.get(taskId);
    if (!stored) return null;

    const parsed = JSON.parse(JSON.stringify(stored));
    return {
      ...parsed,
      startedAt: parsed.startedAt ? new Date(parsed.startedAt) : undefined,
      completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
    };
  }

  /**
   * List all workflows for a specific tenant
   */
  async listWorkflowsByTenant(tenantId: string): Promise<WorkflowState[]> {
    const workflows: WorkflowState[] = [];
    
    for (const [workflowId, stored] of this.workflows.entries()) {
      const parsed = JSON.parse(JSON.stringify(stored)) as any;
      if (parsed.tenantId === tenantId) {
        workflows.push({
          ...parsed,
          taskStates: new Map(parsed.taskStates),
          startedAt: parsed.startedAt ? new Date(parsed.startedAt) : undefined,
          completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
        });
      }
    }

    return workflows;
  }
}
