import { describe, it, expect } from 'vitest';
import { Commit, FailureTaxonomy } from '@aureus/crv';
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

describe('Workflow Validators', () => {
  describe('validateHasTasks', () => {
    it('should pass for workflow with tasks', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateHasTasks(commit);
      expect(result.valid).toBe(true);
    });

    it('should fail for workflow without tasks', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [],
          dependencies: new Map(),
        },
      };

      const result = await validateHasTasks(commit);
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
      expect(result.reason).toContain('at least one task');
    });
  });

  describe('validateUniqueTaskIds', () => {
    it('should pass for workflow with unique task IDs', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateUniqueTaskIds(commit);
      expect(result.valid).toBe(true);
    });

    it('should fail for workflow with duplicate task IDs', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-1', name: 'Task 1 Duplicate', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateUniqueTaskIds(commit);
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
      expect(result.reason).toContain('Duplicate task IDs');
      expect(result.reason).toContain('task-1');
    });
  });

  describe('validateDependenciesExist', () => {
    it('should pass for workflow with valid dependencies', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          ],
          dependencies: new Map([['task-2', ['task-1']]]),
        },
      };

      const result = await validateDependenciesExist(commit);
      expect(result.valid).toBe(true);
    });

    it('should fail when dependency references non-existent task', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          ],
          dependencies: new Map([['task-2', ['task-999']]]),
        },
      };

      const result = await validateDependenciesExist(commit);
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
      expect(result.reason).toContain('non-existent task');
      expect(result.reason).toContain('task-999');
    });

    it('should fail when task in dependencies does not exist', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          ],
          dependencies: new Map([['task-999', ['task-1']]]),
        },
      };

      const result = await validateDependenciesExist(commit);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not exist');
    });
  });

  describe('validateNoCycles', () => {
    it('should pass for workflow without cycles', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-3', name: 'Task 3', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          ],
          dependencies: new Map([
            ['task-2', ['task-1']],
            ['task-3', ['task-2']],
          ]),
        },
      };

      const result = await validateNoCycles(commit);
      expect(result.valid).toBe(true);
    });

    it('should fail for workflow with direct cycle', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          ],
          dependencies: new Map([
            ['task-1', ['task-2']],
            ['task-2', ['task-1']],
          ]),
        },
      };

      const result = await validateNoCycles(commit);
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
      expect(result.reason).toContain('Circular dependency');
    });

    it('should fail for workflow with indirect cycle', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-3', name: 'Task 3', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          ],
          dependencies: new Map([
            ['task-2', ['task-1']],
            ['task-3', ['task-2']],
            ['task-1', ['task-3']],
          ]),
        },
      };

      const result = await validateNoCycles(commit);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Circular dependency');
    });
  });

  describe('validateHighRiskRetries', () => {
    it('should pass for high-risk tasks with retry config', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task-1',
              name: 'High Risk Task',
              type: 'action',
              riskTier: 'HIGH',
              timeoutMs: 30000,
              retry: { maxAttempts: 3, backoffMs: 1000 },
            },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateHighRiskRetries(commit);
      expect(result.valid).toBe(true);
    });

    it('should fail for high-risk tasks without retry config', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task-1',
              name: 'High Risk Task',
              type: 'action',
              riskTier: 'HIGH',
              timeoutMs: 30000,
            },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateHighRiskRetries(commit);
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.POLICY_VIOLATION);
      expect(result.reason).toContain('without retry configuration');
      expect(result.reason).toContain('task-1');
    });

    it('should fail for critical tasks without retry config', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task-1',
              name: 'Critical Task',
              type: 'action',
              riskTier: 'CRITICAL',
              timeoutMs: 30000,
            },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateHighRiskRetries(commit);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('task-1');
    });

    it('should pass for low and medium risk tasks without retry', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            {
              id: 'task-1',
              name: 'Low Risk Task',
              type: 'action',
              riskTier: 'LOW',
              timeoutMs: 30000,
            },
            {
              id: 'task-2',
              name: 'Medium Risk Task',
              type: 'action',
              riskTier: 'MEDIUM',
              timeoutMs: 30000,
            },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateHighRiskRetries(commit);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateTimeouts', () => {
    it('should pass for tasks with valid timeouts', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
            { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 60000 },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateTimeouts(commit);
      expect(result.valid).toBe(true);
    });

    it('should fail for tasks with zero timeout', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 0 },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateTimeouts(commit);
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.POLICY_VIOLATION);
      expect(result.reason).toContain('without valid timeout');
    });

    it('should fail for tasks with negative timeout', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [
            { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: -100 },
          ],
          dependencies: new Map(),
        },
      };

      const result = await validateTimeouts(commit);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateWorkflowName', () => {
    it('should pass for workflow with meaningful name', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Customer Order Processing Workflow',
          tasks: [{ id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 }],
          dependencies: new Map(),
        },
      };

      const result = await validateWorkflowName(commit);
      expect(result.valid).toBe(true);
    });

    it('should fail for workflow with empty name', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: '',
          tasks: [{ id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 }],
          dependencies: new Map(),
        },
      };

      const result = await validateWorkflowName(commit);
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.MISSING_DATA);
      expect(result.reason).toContain('cannot be empty');
    });

    it('should fail for workflow with generic name', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'untitled',
          tasks: [{ id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 }],
          dependencies: new Map(),
        },
      };

      const result = await validateWorkflowName(commit);
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.LOW_CONFIDENCE);
      expect(result.reason).toContain('too generic');
    });

    it('should pass for workflow with descriptive name containing generic word', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Customer Workflow Processing',
          tasks: [{ id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 }],
          dependencies: new Map(),
        },
      };

      const result = await validateWorkflowName(commit);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateBackwardCompatibility', () => {
    it('should pass when no tasks are removed', async () => {
      const oldSpec: WorkflowSpec = {
        id: 'wf-1',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
        ],
        dependencies: new Map(),
      };

      const newSpec: WorkflowSpec = {
        id: 'wf-1',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
        ],
        dependencies: new Map(),
      };

      const commit: Commit = {
        id: 'test-1',
        data: newSpec,
        previousState: oldSpec,
      };

      const result = await validateBackwardCompatibility(commit);
      expect(result.valid).toBe(true);
    });

    it('should pass when removed tasks have no dependents', async () => {
      const oldSpec: WorkflowSpec = {
        id: 'wf-1',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
        ],
        dependencies: new Map(),
      };

      const newSpec: WorkflowSpec = {
        id: 'wf-1',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
        ],
        dependencies: new Map(),
      };

      const commit: Commit = {
        id: 'test-1',
        data: newSpec,
        previousState: oldSpec,
      };

      const result = await validateBackwardCompatibility(commit);
      expect(result.valid).toBe(true);
    });

    it('should fail when removed tasks have dependents', async () => {
      const oldSpec: WorkflowSpec = {
        id: 'wf-1',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
          { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
        ],
        dependencies: new Map([['task-2', ['task-1']]]),
      };

      const newSpec: WorkflowSpec = {
        id: 'wf-1',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-2', name: 'Task 2', type: 'action', riskTier: 'LOW', timeoutMs: 30000 },
        ],
        // task-2 still depends on removed task-1
        dependencies: new Map([['task-2', ['task-1']]]),
      };

      const commit: Commit = {
        id: 'test-1',
        data: newSpec,
        previousState: oldSpec,
      };

      const result = await validateBackwardCompatibility(commit);
      expect(result.valid).toBe(false);
      expect(result.failure_code).toBe(FailureTaxonomy.CONFLICT);
      expect(result.reason).toContain('Backward compatibility issue');
      expect(result.reason).toContain('task-1');
    });

    it('should pass when no previous state exists', async () => {
      const commit: Commit = {
        id: 'test-1',
        data: {
          id: 'wf-1',
          name: 'Test Workflow',
          tasks: [{ id: 'task-1', name: 'Task 1', type: 'action', riskTier: 'LOW', timeoutMs: 30000 }],
          dependencies: new Map(),
        },
      };

      const result = await validateBackwardCompatibility(commit);
      expect(result.valid).toBe(true);
    });
  });
});
