import { WorkflowSpec, TaskSpec } from '@aureus/kernel';
import { CRVGate, Validator, Commit, ValidationResult } from '@aureus/crv';
import { AuditLog, HipCortex, Snapshot } from '@aureus/memory-hipcortex';
import {
  ExplainStepRequest,
  ExplainStepResponse,
  ModifyWorkflowRequest,
  ModifyWorkflowResponse,
  UndoChangeRequest,
  UndoChangeResponse,
  WorkflowDiff,
  ConversationState,
  ChangeHistoryEntry,
} from './types';

// Type for validation result
interface ValidationSuccess {
  success: true;
  data?: any;
  error?: never;
}

interface ValidationFailure {
  success: false;
  data?: never;
  error?: { errors: Array<{ message: string }> };
  errors?: string[];
}

type ValidationResult2 = ValidationSuccess | ValidationFailure;

/**
 * Simple schema validation for workflow spec
 * Uses duck typing to validate basic structure
 */
function validateWorkflowSpecBasic(spec: any): ValidationResult2 {
  const errors: string[] = [];

  if (!spec || typeof spec !== 'object') {
    errors.push('Spec must be an object');
  } else {
    if (!spec.id || typeof spec.id !== 'string') {
      errors.push('Spec must have a string id');
    }
    if (!spec.name || typeof spec.name !== 'string') {
      errors.push('Spec must have a string name');
    }
    if (!Array.isArray(spec.tasks)) {
      errors.push('Spec must have a tasks array');
    }
    if (!(spec.dependencies instanceof Map) && typeof spec.dependencies !== 'object') {
      errors.push('Spec must have dependencies (Map or object)');
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: spec };
}

/**
 * LLM Assistant Service for workflow creation and operations
 * Provides schema-bound, audited, and validated LLM interactions
 */
export class LLMAssistantService {
  private auditLog: AuditLog;
  private memory: HipCortex;
  private crvGate: CRVGate;
  private conversations: Map<string, ConversationState> = new Map();

  constructor(auditLog: AuditLog, memory: HipCortex, crvGate: CRVGate) {
    this.auditLog = auditLog;
    this.memory = memory;
    this.crvGate = crvGate;
  }

  /**
   * Explain why a specific workflow step is needed
   */
  async explainStep(request: ExplainStepRequest): Promise<ExplainStepResponse> {
    const timestamp = new Date();

    // Find the task to explain
    const task = request.workflowSpec.tasks.find(t => t.id === request.taskId);
    if (!task) {
      throw new Error(`Task ${request.taskId} not found in workflow`);
    }

    // Build prompt for explanation
    const prompt = this.buildExplanationPrompt(request.workflowSpec, task, request.context);

    // Log the prompt for audit
    this.auditLog.append(
      'llm-assistant',
      'EXPLAIN_STEP_PROMPT',
      null,
      { prompt, request },
      {
        metadata: { taskId: request.taskId, workflowId: request.workflowId },
        provenance: {
          task_id: 'llm-assistant',
          step_id: 'explain-step',
          timestamp,
        },
      }
    );

    // Call LLM (mock for now)
    const llmResponse = await this.mockLLMExplain(request.workflowSpec, task);

    // Log the response for audit
    this.auditLog.append(
      'llm-assistant',
      'EXPLAIN_STEP_RESPONSE',
      null,
      { response: llmResponse },
      {
        metadata: { taskId: request.taskId, workflowId: request.workflowId },
        provenance: {
          task_id: 'llm-assistant',
          step_id: 'explain-step',
          timestamp,
        },
      }
    );

    return {
      taskId: request.taskId,
      explanation: llmResponse.explanation,
      reasoning: llmResponse.reasoning,
      metadata: {
        timestamp,
        prompt,
      },
    };
  }

  /**
   * Modify a workflow based on natural language request
   * Includes diff tracking, CRV validation, and undo capability
   */
  async modifyWorkflow(request: ModifyWorkflowRequest): Promise<ModifyWorkflowResponse> {
    const timestamp = new Date();
    const changeId = this.generateChangeId();

    // Get or create conversation state
    const sessionId = request.workflowId || 'default-session';
    let conversation = this.conversations.get(sessionId);
    
    if (!conversation) {
      conversation = this.initializeConversation(sessionId, request.currentSpec);
      this.conversations.set(sessionId, conversation);
    }

    // Create snapshot before modification
    const snapshot = await this.memory.createSnapshot(request.currentSpec, {
      workflowId: request.workflowId,
      changeId,
    });

    // Build prompt for modification
    const prompt = this.buildModificationPrompt(request.currentSpec, request.modification, request.context);

    // Log the prompt for audit
    this.auditLog.append(
      'llm-assistant',
      'MODIFY_WORKFLOW_PROMPT',
      request.currentSpec,
      { prompt, request },
      {
        metadata: { workflowId: request.workflowId, changeId },
        provenance: {
          task_id: 'llm-assistant',
          step_id: 'modify-workflow',
          timestamp,
        },
      }
    );

    // Call LLM to generate modified spec (mock for now)
    const llmResponse = await this.mockLLMModify(request.currentSpec, request.modification);

    // Parse and validate the modified spec
    let newSpec: WorkflowSpec;
    try {
      newSpec = this.parseModifiedSpec(llmResponse);
    } catch (error) {
      // Log parsing error
      this.auditLog.append(
        'llm-assistant',
        'MODIFY_WORKFLOW_PARSE_ERROR',
        null,
        { error: error instanceof Error ? error.message : 'Unknown error', llmResponse },
        {
          metadata: { workflowId: request.workflowId, changeId },
          provenance: {
            task_id: 'llm-assistant',
            step_id: 'modify-workflow',
            timestamp,
          },
        }
      );
      
      throw new Error(`Failed to parse LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate schema using basic validation
    const schemaValidation = validateWorkflowSpecBasic(newSpec);

    // Run CRV validation on the change
    const commit: Commit = {
      id: changeId,
      data: newSpec,
      previousState: request.currentSpec,
      metadata: {
        workflowId: request.workflowId,
        taskId: 'llm-modify-workflow',
        modification: request.modification,
      },
    };

    const crvResult = await this.crvGate.validate(commit);

    const validationPassed = schemaValidation.success && crvResult.passed;

    // Log the response and validation results for audit
    this.auditLog.append(
      'llm-assistant',
      'MODIFY_WORKFLOW_RESPONSE',
      request.currentSpec,
      newSpec,
      {
        metadata: {
          workflowId: request.workflowId,
          changeId,
          validationPassed,
          schemaValidation,
          crvResult,
        },
        provenance: {
          task_id: 'llm-assistant',
          step_id: 'modify-workflow',
          timestamp,
        },
      }
    );

    // Compute structured diff
    const diff = this.computeDiff(request.currentSpec, newSpec);

    // Update conversation state
    const historyEntry: ChangeHistoryEntry = {
      changeId,
      timestamp,
      modification: request.modification,
      diff,
      validationPassed,
      undone: false,
    };
    conversation.changeHistory.push(historyEntry);
    conversation.currentSpec = newSpec;
    conversation.lastModified = timestamp;
    conversation.snapshots.push({
      snapshotId: snapshot.id,
      spec: newSpec,
      timestamp,
    });

    return {
      newSpec,
      diff,
      changeId,
      validation: {
        passed: validationPassed,
        errors: this.extractValidationErrors(schemaValidation, crvResult),
      },
      metadata: {
        timestamp,
        prompt,
        response: JSON.stringify(llmResponse),
      },
    };
  }

  /**
   * Undo a previous LLM-generated change
   */
  async undoChange(request: UndoChangeRequest): Promise<UndoChangeResponse> {
    const timestamp = new Date();
    const sessionId = request.workflowId || 'default-session';
    const conversation = this.conversations.get(sessionId);

    if (!conversation) {
      throw new Error('No conversation found for this workflow');
    }

    // Find the change in history
    const changeEntry = conversation.changeHistory.find(h => h.changeId === request.changeId);
    if (!changeEntry) {
      throw new Error(`Change ${request.changeId} not found in history`);
    }

    if (changeEntry.undone) {
      throw new Error(`Change ${request.changeId} has already been undone`);
    }

    // Find the snapshot before this change
    const changeIndex = conversation.changeHistory.indexOf(changeEntry);
    const snapshotIndex = changeIndex; // Each change creates a snapshot at the same index
    
    let restoredSpec: WorkflowSpec;
    if (snapshotIndex > 0) {
      // Restore from previous snapshot
      restoredSpec = conversation.snapshots[snapshotIndex - 1].spec;
    } else if (snapshotIndex === 0 && conversation.snapshots.length > 0) {
      // First change - need to rollback using memory system if available
      const snapshot = conversation.snapshots[0];
      try {
        const rollbackResult = await this.memory.rollback(snapshot.snapshotId);
        restoredSpec = rollbackResult.restoredState as WorkflowSpec;
      } catch (error) {
        throw new Error('Cannot undo first change: no previous state available');
      }
    } else {
      throw new Error('No snapshot available to restore');
    }

    // Mark change as undone
    changeEntry.undone = true;
    conversation.currentSpec = restoredSpec;
    conversation.lastModified = timestamp;

    // Log the undo operation for audit
    this.auditLog.append(
      'llm-assistant',
      'UNDO_CHANGE',
      null,
      { changeId: request.changeId, restoredSpec },
      {
        metadata: { workflowId: request.workflowId },
        provenance: {
          task_id: 'llm-assistant',
          step_id: 'undo-change',
          timestamp,
        },
      }
    );

    return {
      success: true,
      restoredSpec,
      undoneChangeId: request.changeId,
      metadata: {
        timestamp,
      },
    };
  }

  /**
   * Get change history for a workflow
   */
  getChangeHistory(workflowId?: string): ChangeHistoryEntry[] {
    const sessionId = workflowId || 'default-session';
    const conversation = this.conversations.get(sessionId);
    return conversation ? [...conversation.changeHistory] : [];
  }

  /**
   * Get current conversation state
   */
  getConversationState(workflowId?: string): ConversationState | undefined {
    const sessionId = workflowId || 'default-session';
    return this.conversations.get(sessionId);
  }

  // Private helper methods

  private initializeConversation(sessionId: string, initialSpec: WorkflowSpec): ConversationState {
    return {
      sessionId,
      currentSpec: initialSpec,
      changeHistory: [],
      snapshots: [],
      createdAt: new Date(),
      lastModified: new Date(),
    };
  }

  private buildExplanationPrompt(spec: WorkflowSpec, task: TaskSpec, context?: string): string {
    const parts = [
      'Explain why the following task is needed in this workflow:',
      '',
      `Workflow: ${spec.name}`,
      `Task ID: ${task.id}`,
      `Task Name: ${task.name}`,
      `Task Type: ${task.type}`,
      `Risk Tier: ${task.riskTier}`,
    ];

    if (task.toolName) {
      parts.push(`Tool: ${task.toolName}`);
    }

    // Add dependencies - tasks that this task depends on
    const dependencies = spec.dependencies.get(task.id) || [];
    
    if (dependencies.length > 0) {
      const depNames = dependencies.map(depId => {
        const depTask = spec.tasks.find(t => t.id === depId);
        return depTask ? `${depId} (${depTask.name})` : depId;
      });
      parts.push('', `Dependencies: ${depNames.join(', ')}`);
    }

    if (context) {
      parts.push('', `Additional Context: ${context}`);
    }

    parts.push(
      '',
      'Provide:',
      '1. A clear explanation of the task\'s purpose',
      '2. Why this task depends on its prerequisites',
      '3. Risks associated with this task',
      '4. Alternative approaches if applicable'
    );

    return parts.join('\n');
  }

  private buildModificationPrompt(currentSpec: WorkflowSpec, modification: string, context?: string): string {
    const parts = [
      'Modify the following workflow specification based on the user request:',
      '',
      'Current Workflow:',
      JSON.stringify(this.workflowSpecToJSON(currentSpec), null, 2),
      '',
      `User Request: ${modification}`,
    ];

    if (context) {
      parts.push('', `Additional Context: ${context}`);
    }

    parts.push(
      '',
      'Requirements:',
      '1. Maintain workflow schema compliance',
      '2. Preserve task dependencies integrity',
      '3. Keep risk tiers appropriate',
      '4. Return valid JSON workflow specification',
      '5. Ensure all IDs are unique',
      '',
      'Return the modified workflow specification as valid JSON.'
    );

    return parts.join('\n');
  }

  private async mockLLMExplain(spec: WorkflowSpec, task: TaskSpec): Promise<{
    explanation: string;
    reasoning: {
      purpose: string;
      dependencies: string[];
      risks: string[];
      alternatives?: string[];
    };
  }> {
    // Mock implementation - in production, call actual LLM API
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get tasks that this task depends on
    const dependencies = spec.dependencies.get(task.id) || [];
    const depNames = dependencies.map(depId => {
      const depTask = spec.tasks.find(t => t.id === depId);
      return depTask ? `${depId} (${depTask.name})` : depId;
    });

    return {
      explanation: `Task ${task.name} is essential for ${spec.name}. It performs ${task.type} operations with ${task.riskTier} risk level.`,
      reasoning: {
        purpose: `This task handles ${task.type} operations required to achieve the workflow goal.`,
        dependencies: depNames.length > 0 ? depNames : ['None - this is an initial task'],
        risks: [
          `Risk Level: ${task.riskTier}`,
          task.toolName ? `Tool dependency on ${task.toolName}` : 'No external tool dependencies',
        ],
        alternatives: task.riskTier === 'HIGH' || task.riskTier === 'CRITICAL' 
          ? ['Consider breaking into smaller tasks', 'Add additional validation steps']
          : undefined,
      },
    };
  }

  private async mockLLMModify(currentSpec: WorkflowSpec, modification: string): Promise<any> {
    // Mock implementation - in production, call actual LLM API
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simple mock: return the current spec with a note about the modification
    const modifiedSpec = JSON.parse(JSON.stringify(this.workflowSpecToJSON(currentSpec)));
    
    // Mock modification: add a new task if modification includes "add"
    if (modification.toLowerCase().includes('add')) {
      const newTaskId = `task-${modifiedSpec.tasks.length + 1}`;
      modifiedSpec.tasks.push({
        id: newTaskId,
        name: `New Task: ${modification.substring(0, 30)}`,
        type: 'action',
        riskTier: 'MEDIUM',
        timeoutMs: 30000,
      });
      
      // Add dependency on last task
      if (modifiedSpec.tasks.length > 1) {
        const lastTaskId = modifiedSpec.tasks[modifiedSpec.tasks.length - 2].id;
        modifiedSpec.dependencies[newTaskId] = [lastTaskId];
      }
    }

    return modifiedSpec;
  }

  private parseModifiedSpec(llmResponse: any): WorkflowSpec {
    // Convert JSON response back to WorkflowSpec with Map for dependencies
    const dependenciesMap = new Map<string, string[]>();
    if (llmResponse.dependencies) {
      Object.entries(llmResponse.dependencies).forEach(([key, value]) => {
        dependenciesMap.set(key, value as string[]);
      });
    }

    return {
      id: llmResponse.id,
      name: llmResponse.name,
      tasks: llmResponse.tasks,
      dependencies: dependenciesMap,
      safetyPolicy: llmResponse.safetyPolicy,
    };
  }

  private workflowSpecToJSON(spec: WorkflowSpec): any {
    // Convert Map to object for JSON serialization
    const dependencies: Record<string, string[]> = {};
    spec.dependencies.forEach((value, key) => {
      dependencies[key] = value;
    });

    return {
      id: spec.id,
      name: spec.name,
      tasks: spec.tasks,
      dependencies,
      safetyPolicy: spec.safetyPolicy,
    };
  }

  private computeDiff(oldSpec: WorkflowSpec, newSpec: WorkflowSpec): WorkflowDiff {
    const diff: WorkflowDiff = {
      added: {},
      removed: {},
      modified: {},
    };

    // Compare tasks
    const oldTaskIds = new Set(oldSpec.tasks.map(t => t.id));
    const newTaskIds = new Set(newSpec.tasks.map(t => t.id));

    // Find added tasks
    const addedTaskIds = [...newTaskIds].filter(id => !oldTaskIds.has(id));
    if (addedTaskIds.length > 0) {
      diff.added.tasks = addedTaskIds;
    }

    // Find removed tasks
    const removedTaskIds = [...oldTaskIds].filter(id => !newTaskIds.has(id));
    if (removedTaskIds.length > 0) {
      diff.removed.tasks = removedTaskIds;
    }

    // Find modified tasks
    const modifiedTasks: Array<{ taskId: string; changes: Record<string, { old: unknown; new: unknown }> }> = [];
    for (const taskId of [...oldTaskIds].filter(id => newTaskIds.has(id))) {
      const oldTask = oldSpec.tasks.find(t => t.id === taskId)!;
      const newTask = newSpec.tasks.find(t => t.id === taskId)!;
      
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      for (const key of Object.keys(oldTask) as Array<keyof TaskSpec>) {
        if (JSON.stringify(oldTask[key]) !== JSON.stringify(newTask[key])) {
          changes[key] = { old: oldTask[key], new: newTask[key] };
        }
      }
      
      if (Object.keys(changes).length > 0) {
        modifiedTasks.push({ taskId, changes });
      }
    }
    if (modifiedTasks.length > 0) {
      diff.modified.tasks = modifiedTasks;
    }

    // Compare name
    if (oldSpec.name !== newSpec.name) {
      diff.modified.name = { old: oldSpec.name, new: newSpec.name };
    }

    // Compare dependencies
    const addedDeps: Array<{ taskId: string; dependsOn: string[] }> = [];
    const removedDeps: Array<{ taskId: string; dependsOn: string[] }> = [];

    for (const [taskId, newDeps] of newSpec.dependencies.entries()) {
      const oldDeps = oldSpec.dependencies.get(taskId) || [];
      const added = newDeps.filter(d => !oldDeps.includes(d));
      if (added.length > 0) {
        addedDeps.push({ taskId, dependsOn: added });
      }
    }

    for (const [taskId, oldDeps] of oldSpec.dependencies.entries()) {
      const newDeps = newSpec.dependencies.get(taskId) || [];
      const removed = oldDeps.filter(d => !newDeps.includes(d));
      if (removed.length > 0) {
        removedDeps.push({ taskId, dependsOn: removed });
      }
    }

    if (addedDeps.length > 0) {
      diff.added.dependencies = addedDeps;
    }
    if (removedDeps.length > 0) {
      diff.removed.dependencies = removedDeps;
    }

    return diff;
  }

  private generateChangeId(): string {
    // Use crypto for better uniqueness if available, otherwise fall back to Math.random
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `change-${crypto.randomUUID()}`;
    }
    return `change-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private extractValidationErrors(schemaValidation: ValidationResult2, crvResult: any): string[] {
    const errors: string[] = [];
    
    // Extract schema validation errors
    if (!schemaValidation.success) {
      if (schemaValidation.errors) {
        errors.push(...schemaValidation.errors);
      } else if (schemaValidation.error?.errors) {
        errors.push(...schemaValidation.error.errors.map((e: any) => e.message));
      }
    }
    
    // Extract CRV validation errors
    if (!crvResult.passed) {
      errors.push(...crvResult.validationResults
        .filter((r: any) => !r.valid)
        .map((r: any) => r.reason || 'Validation failed'));
    }
    
    return errors;
  }
}
