import { describe, it, expect, beforeEach } from 'vitest';
import { LLMAssistantService } from '../src/api/llm/service';
import { AuditLog, HipCortex } from '@aureus/memory-hipcortex';
import { CRVGate } from '@aureus/crv';
import { WorkflowSpec, TaskSpec } from '@aureus/kernel';
import {
  validateHasTasks,
  validateUniqueTaskIds,
  validateDependenciesExist,
  validateNoCycles,
  validateHighRiskRetries,
  validateTimeouts,
  validateWorkflowName,
  validateBackwardCompatibility,
} from '../src/api/llm/validators';

describe('LLMAssistantService', () => {
  let service: LLMAssistantService;
  let auditLog: AuditLog;
  let memory: HipCortex;
  let crvGate: CRVGate;
  let sampleWorkflow: WorkflowSpec;

  beforeEach(() => {
    auditLog = new AuditLog();
    memory = new HipCortex();
    crvGate = new CRVGate({
      name: 'workflow-validation-gate',
      validators: [
        validateHasTasks,
        validateUniqueTaskIds,
        validateDependenciesExist,
        validateNoCycles,
        validateTimeouts,
        validateWorkflowName,
      ],
      blockOnFailure: true,
    });
    service = new LLMAssistantService(auditLog, memory, crvGate);

    // Create a sample workflow for testing
    sampleWorkflow = {
      id: 'test-workflow-1',
      name: 'Sample Data Processing Workflow',
      tasks: [
        {
          id: 'task-1',
          name: 'Initialize',
          type: 'action',
          riskTier: 'LOW',
          timeoutMs: 30000,
        },
        {
          id: 'task-2',
          name: 'Process Data',
          type: 'action',
          riskTier: 'MEDIUM',
          timeoutMs: 60000,
        },
        {
          id: 'task-3',
          name: 'Validate Results',
          type: 'decision',
          riskTier: 'HIGH',
          timeoutMs: 30000,
          retry: {
            maxAttempts: 3,
            backoffMs: 1000,
          },
        },
      ],
      dependencies: new Map([
        ['task-2', ['task-1']],
        ['task-3', ['task-2']],
      ]),
      safetyPolicy: {
        name: 'default-policy',
        description: 'Default safety rules',
        rules: [],
        failFast: false,
      },
    };
  });

  describe('explainStep', () => {
    it('should explain a workflow step with grounded reasoning', async () => {
      const result = await service.explainStep({
        workflowSpec: sampleWorkflow,
        taskId: 'task-2',
      });

      expect(result).toBeDefined();
      expect(result.taskId).toBe('task-2');
      expect(result.explanation).toBeDefined();
      expect(result.explanation.length).toBeGreaterThan(0);
      expect(result.reasoning).toBeDefined();
      expect(result.reasoning.purpose).toBeDefined();
      expect(result.reasoning.dependencies).toBeDefined();
      expect(result.reasoning.risks).toBeDefined();
      expect(result.metadata.timestamp).toBeInstanceOf(Date);
      expect(result.metadata.prompt).toBeDefined();
    });

    it('should include dependency information in explanation', async () => {
      const result = await service.explainStep({
        workflowSpec: sampleWorkflow,
        taskId: 'task-3',
      });

      expect(result.reasoning.dependencies).toBeDefined();
      expect(result.reasoning.dependencies.length).toBeGreaterThan(0);
    });

    it('should throw error for non-existent task', async () => {
      await expect(
        service.explainStep({
          workflowSpec: sampleWorkflow,
          taskId: 'non-existent-task',
        })
      ).rejects.toThrow('Task non-existent-task not found');
    });

    it('should log prompt and response to audit log', async () => {
      await service.explainStep({
        workflowSpec: sampleWorkflow,
        taskId: 'task-1',
      });

      const entries = auditLog.getAll();
      expect(entries.length).toBeGreaterThanOrEqual(2);

      const promptEntry = entries.find(e => e.action === 'EXPLAIN_STEP_PROMPT');
      const responseEntry = entries.find(e => e.action === 'EXPLAIN_STEP_RESPONSE');

      expect(promptEntry).toBeDefined();
      expect(responseEntry).toBeDefined();
      expect(promptEntry?.provenance?.task_id).toBe('llm-assistant');
      expect(promptEntry?.provenance?.step_id).toBe('explain-step');
    });
  });

  describe('modifyWorkflow', () => {
    it('should modify workflow and return structured diff', async () => {
      const result = await service.modifyWorkflow({
        currentSpec: sampleWorkflow,
        modification: 'Add a new task for data cleanup',
      });

      expect(result).toBeDefined();
      expect(result.newSpec).toBeDefined();
      expect(result.diff).toBeDefined();
      expect(result.changeId).toBeDefined();
      expect(result.validation).toBeDefined();
      expect(result.metadata.timestamp).toBeInstanceOf(Date);
    });

    it('should track added tasks in diff', async () => {
      const result = await service.modifyWorkflow({
        currentSpec: sampleWorkflow,
        modification: 'Add a new cleanup task',
      });

      expect(result.diff.added).toBeDefined();
      if (result.diff.added.tasks) {
        expect(result.diff.added.tasks.length).toBeGreaterThan(0);
      }
    });

    it('should validate modified workflow with CRV', async () => {
      const result = await service.modifyWorkflow({
        currentSpec: sampleWorkflow,
        modification: 'Add a new task',
      });

      expect(result.validation).toBeDefined();
      expect(result.validation.passed).toBeDefined();
    });

    it('should create snapshot before modification', async () => {
      const snapshotsBefore = memory.listSnapshots().length;

      await service.modifyWorkflow({
        currentSpec: sampleWorkflow,
        modification: 'Add a new task',
      });

      const snapshotsAfter = memory.listSnapshots().length;
      expect(snapshotsAfter).toBeGreaterThan(snapshotsBefore);
    });

    it('should log modification to audit log', async () => {
      await service.modifyWorkflow({
        currentSpec: sampleWorkflow,
        modification: 'Add a new task',
      });

      const entries = auditLog.getAll();
      const modifyPrompt = entries.find(e => e.action === 'MODIFY_WORKFLOW_PROMPT');
      const modifyResponse = entries.find(e => e.action === 'MODIFY_WORKFLOW_RESPONSE');

      expect(modifyPrompt).toBeDefined();
      expect(modifyResponse).toBeDefined();
      expect(modifyResponse?.stateAfter).toBeDefined();
    });

    it('should update conversation state', async () => {
      await service.modifyWorkflow({
        workflowId: 'test-workflow-1',
        currentSpec: sampleWorkflow,
        modification: 'Add a new task',
      });

      const state = service.getConversationState('test-workflow-1');
      expect(state).toBeDefined();
      expect(state?.changeHistory.length).toBe(1);
      expect(state?.snapshots.length).toBe(1);
    });

    it('should include change in history', async () => {
      const result = await service.modifyWorkflow({
        workflowId: 'test-workflow-1',
        currentSpec: sampleWorkflow,
        modification: 'Add validation step',
      });

      const history = service.getChangeHistory('test-workflow-1');
      expect(history.length).toBe(1);
      expect(history[0].changeId).toBe(result.changeId);
      expect(history[0].modification).toBe('Add validation step');
    });
  });

  describe('undoChange', () => {
    it('should undo a previous change', async () => {
      // First make a change
      const modifyResult = await service.modifyWorkflow({
        workflowId: 'test-workflow-1',
        currentSpec: sampleWorkflow,
        modification: 'Add a new task',
      });

      // Then undo it
      const undoResult = await service.undoChange({
        workflowId: 'test-workflow-1',
        changeId: modifyResult.changeId,
      });

      expect(undoResult.success).toBe(true);
      expect(undoResult.undoneChangeId).toBe(modifyResult.changeId);
      expect(undoResult.restoredSpec).toBeDefined();
    });

    it('should mark change as undone in history', async () => {
      // Make a change
      const modifyResult = await service.modifyWorkflow({
        workflowId: 'test-workflow-1',
        currentSpec: sampleWorkflow,
        modification: 'Add a new task',
      });

      // Undo it
      await service.undoChange({
        workflowId: 'test-workflow-1',
        changeId: modifyResult.changeId,
      });

      const history = service.getChangeHistory('test-workflow-1');
      expect(history[0].undone).toBe(true);
    });

    it('should throw error for non-existent change', async () => {
      await expect(
        service.undoChange({
          workflowId: 'test-workflow-1',
          changeId: 'non-existent-change',
        })
      ).rejects.toThrow();
    });

    it('should throw error if change already undone', async () => {
      // Make and undo a change
      const modifyResult = await service.modifyWorkflow({
        workflowId: 'test-workflow-1',
        currentSpec: sampleWorkflow,
        modification: 'Add a new task',
      });

      await service.undoChange({
        workflowId: 'test-workflow-1',
        changeId: modifyResult.changeId,
      });

      // Try to undo again
      await expect(
        service.undoChange({
          workflowId: 'test-workflow-1',
          changeId: modifyResult.changeId,
        })
      ).rejects.toThrow('already been undone');
    });

    it('should log undo operation to audit log', async () => {
      // Make a change
      const modifyResult = await service.modifyWorkflow({
        workflowId: 'test-workflow-1',
        currentSpec: sampleWorkflow,
        modification: 'Add a new task',
      });

      // Undo it
      await service.undoChange({
        workflowId: 'test-workflow-1',
        changeId: modifyResult.changeId,
      });

      const entries = auditLog.getAll();
      const undoEntry = entries.find(e => e.action === 'UNDO_CHANGE');
      expect(undoEntry).toBeDefined();
      expect(undoEntry?.provenance?.step_id).toBe('undo-change');
    });
  });

  describe('getChangeHistory', () => {
    it('should return empty history for new workflow', () => {
      const history = service.getChangeHistory('new-workflow');
      expect(history).toEqual([]);
    });

    it('should return all changes for a workflow', async () => {
      // Make multiple changes
      await service.modifyWorkflow({
        workflowId: 'test-workflow-1',
        currentSpec: sampleWorkflow,
        modification: 'First change',
      });

      const state = service.getConversationState('test-workflow-1');
      const currentSpec = state?.currentSpec || sampleWorkflow;

      await service.modifyWorkflow({
        workflowId: 'test-workflow-1',
        currentSpec,
        modification: 'Second change',
      });

      const history = service.getChangeHistory('test-workflow-1');
      expect(history.length).toBe(2);
      expect(history[0].modification).toBe('First change');
      expect(history[1].modification).toBe('Second change');
    });
  });

  describe('getConversationState', () => {
    it('should return undefined for non-existent conversation', () => {
      const state = service.getConversationState('non-existent');
      expect(state).toBeUndefined();
    });

    it('should return conversation state after modifications', async () => {
      await service.modifyWorkflow({
        workflowId: 'test-workflow-1',
        currentSpec: sampleWorkflow,
        modification: 'Add task',
      });

      const state = service.getConversationState('test-workflow-1');
      expect(state).toBeDefined();
      expect(state?.sessionId).toBe('test-workflow-1');
      expect(state?.changeHistory.length).toBe(1);
      expect(state?.createdAt).toBeInstanceOf(Date);
      expect(state?.lastModified).toBeInstanceOf(Date);
    });
  });

  describe('schema validation integration', () => {
    it('should pass validation for valid workflow modifications', async () => {
      const result = await service.modifyWorkflow({
        currentSpec: sampleWorkflow,
        modification: 'Add a new task',
      });

      expect(result.validation.passed).toBe(true);
      expect(result.validation.errors).toEqual([]);
    });

    it('should provide helpful error messages for validation failures', async () => {
      // Create an invalid workflow (missing timeout)
      const invalidWorkflow: WorkflowSpec = {
        ...sampleWorkflow,
        tasks: [
          {
            id: 'task-1',
            name: 'Test',
            type: 'action',
            riskTier: 'LOW',
            timeoutMs: 0, // Invalid
          },
        ],
      };

      const result = await service.modifyWorkflow({
        currentSpec: invalidWorkflow,
        modification: 'Update task',
      });

      // Should fail validation
      expect(result.validation.passed).toBe(false);
      if (result.validation.errors) {
        expect(result.validation.errors.length).toBeGreaterThan(0);
      }
    });
  });
});
