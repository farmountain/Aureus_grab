import { Pool } from 'pg';
import { StateStore, WorkflowState, TaskState } from './types';
import { createDatabasePool, DatabaseConfig } from './db-config';

/**
 * Safely parse JSON from database, handling both string and object types
 */
function safeJsonParse<T = unknown>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value as T;
}

/**
 * PostgresStateStore provides a PostgreSQL-backed implementation with tenant isolation
 * Implements persistent state storage for workflows and tasks with ACID guarantees
 */
export class PostgresStateStore implements StateStore {
  private pool: Pool;

  constructor(config?: DatabaseConfig) {
    this.pool = createDatabasePool(config);
  }

  /**
   * Initialize the database schema (run migrations)
   */
  async initialize(schemaSQL?: string): Promise<void> {
    if (schemaSQL) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(schemaSQL);
        await client.query('COMMIT');
        console.log('PostgresStateStore: Database schema initialized');
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('PostgresStateStore: Schema initialization failed:', error);
        throw error;
      } finally {
        client.release();
      }
    }
  }

  async saveWorkflowState(state: WorkflowState): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Serialize task states map to JSON
      const taskStatesArray = Array.from(state.taskStates.entries());
      const data = {
        taskStates: taskStatesArray,
      };

      await client.query(
        `INSERT INTO workflow_states (workflow_id, tenant_id, status, started_at, completed_at, checkpoint_id, data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (workflow_id) 
         DO UPDATE SET 
           status = EXCLUDED.status,
           started_at = EXCLUDED.started_at,
           completed_at = EXCLUDED.completed_at,
           checkpoint_id = EXCLUDED.checkpoint_id,
           data = EXCLUDED.data,
           updated_at = CURRENT_TIMESTAMP`,
        [
          state.workflowId,
          state.tenantId || null,
          state.status,
          state.startedAt || null,
          state.completedAt || null,
          state.checkpointId || null,
          JSON.stringify(data),
        ]
      );
    } finally {
      client.release();
    }
  }

  async loadWorkflowState(workflowId: string, tenantId?: string): Promise<WorkflowState | null> {
    const client = await this.pool.connect();
    try {
      // Build query with tenant isolation at database level
      const whereConditions = ['workflow_id = $1'];
      const params: any[] = [workflowId];
      
      if (tenantId) {
        // Filter by tenant_id at database level for security
        whereConditions.push('tenant_id = $2');
        params.push(tenantId);
      }

      const result = await client.query(
        `SELECT workflow_id, tenant_id, status, started_at, completed_at, checkpoint_id, data
         FROM workflow_states
         WHERE ${whereConditions.join(' AND ')}`,
        params
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      // Deserialize task states from JSON
      const data = safeJsonParse<{ taskStates: [string, TaskState][] }>(row.data);
      const taskStates = new Map<string, TaskState>(data.taskStates || []);

      return {
        workflowId: row.workflow_id,
        tenantId: row.tenant_id,
        status: row.status,
        startedAt: row.started_at ? new Date(row.started_at) : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        checkpointId: row.checkpoint_id,
        taskStates,
      };
    } finally {
      client.release();
    }
  }

  async saveTaskState(workflowId: string, taskState: TaskState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO task_states (workflow_id, task_id, status, attempt, result, error, started_at, completed_at, timed_out, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (workflow_id, task_id)
         DO UPDATE SET
           status = EXCLUDED.status,
           attempt = EXCLUDED.attempt,
           result = EXCLUDED.result,
           error = EXCLUDED.error,
           started_at = EXCLUDED.started_at,
           completed_at = EXCLUDED.completed_at,
           timed_out = EXCLUDED.timed_out,
           metadata = EXCLUDED.metadata,
           updated_at = CURRENT_TIMESTAMP`,
        [
          workflowId,
          taskState.taskId,
          taskState.status,
          taskState.attempt,
          taskState.result ? JSON.stringify(taskState.result) : null,
          taskState.error || null,
          taskState.startedAt || null,
          taskState.completedAt || null,
          taskState.timedOut || false,
          JSON.stringify(taskState.metadata || {}),
        ]
      );
    } finally {
      client.release();
    }
  }

  async loadTaskState(workflowId: string, taskId: string, tenantId?: string): Promise<TaskState | null> {
    // First check tenant isolation at workflow level
    if (tenantId) {
      const workflow = await this.loadWorkflowState(workflowId, tenantId);
      if (!workflow) return null; // Tenant doesn't have access to this workflow
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT task_id, status, attempt, result, error, started_at, completed_at, timed_out, metadata
         FROM task_states
         WHERE workflow_id = $1 AND task_id = $2`,
        [workflowId, taskId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        taskId: row.task_id,
        status: row.status,
        attempt: row.attempt,
        result: row.result ? safeJsonParse(row.result) : undefined,
        error: row.error || undefined,
        startedAt: row.started_at ? new Date(row.started_at) : undefined,
        completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
        timedOut: row.timed_out || false,
        metadata: row.metadata ? safeJsonParse(row.metadata) : undefined,
      };
    } finally {
      client.release();
    }
  }

  /**
   * List all workflows for a specific tenant
   */
  async listWorkflowsByTenant(tenantId: string): Promise<WorkflowState[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT workflow_id, tenant_id, status, started_at, completed_at, checkpoint_id, data
         FROM workflow_states
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      );

      return result.rows.map(row => {
        const data = safeJsonParse<{ taskStates: [string, TaskState][] }>(row.data);
        const taskStates = new Map<string, TaskState>(data.taskStates || []);

        return {
          workflowId: row.workflow_id,
          tenantId: row.tenant_id,
          status: row.status,
          startedAt: row.started_at ? new Date(row.started_at) : undefined,
          completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
          checkpointId: row.checkpoint_id,
          taskStates,
        };
      });
    } finally {
      client.release();
    }
  }

  /**
   * Close the database pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
