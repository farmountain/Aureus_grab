import { WorkflowSpec } from '@aureus/kernel';

/**
 * Request to explain why a workflow step is needed
 */
export interface ExplainStepRequest {
  workflowId?: string;
  workflowSpec: WorkflowSpec;
  taskId: string;
  context?: string;
}

/**
 * Response with explanation for a workflow step
 */
export interface ExplainStepResponse {
  taskId: string;
  explanation: string;
  reasoning: {
    purpose: string;
    dependencies: string[];
    risks: string[];
    alternatives?: string[];
  };
  metadata: {
    timestamp: Date;
    prompt: string;
  };
}

/**
 * Request to modify a workflow using natural language
 */
export interface ModifyWorkflowRequest {
  workflowId?: string;
  currentSpec: WorkflowSpec;
  modification: string;
  context?: string;
}

/**
 * Response with workflow modification and structured diff
 */
export interface ModifyWorkflowResponse {
  newSpec: WorkflowSpec;
  diff: WorkflowDiff;
  changeId: string;
  validation: {
    passed: boolean;
    errors?: string[];
  };
  metadata: {
    timestamp: Date;
    prompt: string;
    response: string;
  };
}

/**
 * Structured diff showing changes between workflow versions
 */
export interface WorkflowDiff {
  added: {
    tasks?: string[];
    dependencies?: Array<{ taskId: string; dependsOn: string[] }>;
  };
  removed: {
    tasks?: string[];
    dependencies?: Array<{ taskId: string; dependsOn: string[] }>;
  };
  modified: {
    tasks?: Array<{
      taskId: string;
      changes: Record<string, { old: unknown; new: unknown }>;
    }>;
    name?: { old: string; new: string };
    safetyPolicy?: { old: unknown; new: unknown };
  };
}

/**
 * Request to undo a previous LLM change
 */
export interface UndoChangeRequest {
  workflowId?: string;
  changeId: string;
}

/**
 * Response after undoing a change
 */
export interface UndoChangeResponse {
  success: boolean;
  restoredSpec: WorkflowSpec;
  undoneChangeId: string;
  metadata: {
    timestamp: Date;
  };
}

/**
 * History of LLM-generated changes for a workflow
 */
export interface ChangeHistoryEntry {
  changeId: string;
  timestamp: Date;
  modification: string;
  diff: WorkflowDiff;
  validationPassed: boolean;
  undone: boolean;
}

/**
 * Conversation state for the LLM assistant
 */
export interface ConversationState {
  sessionId: string;
  workflowId?: string;
  currentSpec: WorkflowSpec;
  changeHistory: ChangeHistoryEntry[];
  snapshots: Array<{
    snapshotId: string;
    spec: WorkflowSpec;
    timestamp: Date;
  }>;
  createdAt: Date;
  lastModified: Date;
}
