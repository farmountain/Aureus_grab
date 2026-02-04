import { describe, it, expect } from 'vitest';
import {
  validateWorkflowSpec,
  validateGenerationRequest,
  WorkflowSpecSchema,
  WorkflowGenerationRequestSchema,
} from '@aureus/kernel';

describe('Workflow Spec Schema Validation', () => {
  describe('WorkflowGenerationRequest validation', () => {
    it('should validate a valid generation request', () => {
      const request = {
        goal: 'Reconcile bank transactions with internal ledger',
        constraints: ['Complete within 5 minutes', 'No external API calls'],
        preferredTools: ['database', 'email'],
        riskTolerance: 'MEDIUM' as const,
      };

      const result = validateGenerationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data).toEqual(request);
    });

    it('should reject a request with too short goal', () => {
      const request = {
        goal: 'Too short',
      };

      const result = validateGenerationRequest(request);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.includes('at least 10 characters'))).toBe(true);
    });

    it('should accept request without optional fields', () => {
      const request = {
        goal: 'This is a valid goal with enough characters',
      };

      const result = validateGenerationRequest(request);
      expect(result.success).toBe(true);
      expect(result.data?.goal).toBe(request.goal);
      expect(result.data?.riskTolerance).toBe('MEDIUM'); // default value
    });

    it('should validate risk tolerance enum', () => {
      const request = {
        goal: 'This is a valid goal with enough characters',
        riskTolerance: 'INVALID' as any,
      };

      const result = validateGenerationRequest(request);
      expect(result.success).toBe(false);
    });
  });

  describe('WorkflowSpec validation', () => {
    it('should validate a complete workflow spec', () => {
      const spec = {
        id: 'workflow-123',
        name: 'Test Workflow',
        description: 'A test workflow',
        goal: 'Accomplish something',
        constraints: ['Constraint 1'],
        successCriteria: ['Success criterion 1'],
        tasks: [
          {
            id: 'task-1',
            name: 'First Task',
            type: 'action' as const,
            riskTier: 'LOW' as const,
            toolName: 'database',
            retry: {
              maxAttempts: 3,
              backoffMs: 1000,
            },
          },
          {
            id: 'task-2',
            name: 'Second Task',
            type: 'decision' as const,
            riskTier: 'MEDIUM' as const,
          },
        ],
        dependencies: {
          'task-2': ['task-1'],
        },
      };

      const result = validateWorkflowSpec(spec);
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('workflow-123');
      expect(result.data?.tasks).toHaveLength(2);
    });

    it('should reject spec without required fields', () => {
      const spec = {
        name: 'Test Workflow',
        tasks: [],
      };

      const result = validateWorkflowSpec(spec);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should validate task types', () => {
      const spec = {
        id: 'workflow-123',
        name: 'Test Workflow',
        tasks: [
          {
            id: 'task-1',
            name: 'Invalid Task',
            type: 'invalid-type' as any,
          },
        ],
        dependencies: {},
      };

      const result = validateWorkflowSpec(spec);
      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.includes('type'))).toBe(true);
    });

    it('should validate risk tiers', () => {
      const spec = {
        id: 'workflow-123',
        name: 'Test Workflow',
        tasks: [
          {
            id: 'task-1',
            name: 'Task with invalid risk tier',
            type: 'action' as const,
            riskTier: 'INVALID' as any,
          },
        ],
        dependencies: {},
      };

      const result = validateWorkflowSpec(spec);
      expect(result.success).toBe(false);
    });

    it('should validate nested retry config', () => {
      const spec = {
        id: 'workflow-123',
        name: 'Test Workflow',
        tasks: [
          {
            id: 'task-1',
            name: 'Task with retry',
            type: 'action' as const,
            retry: {
              maxAttempts: -1, // Invalid: must be positive
              backoffMs: 1000,
            },
          },
        ],
        dependencies: {},
      };

      const result = validateWorkflowSpec(spec);
      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.includes('maxAttempts'))).toBe(true);
    });

    it('should validate safety policy structure', () => {
      const spec = {
        id: 'workflow-123',
        name: 'Test Workflow',
        tasks: [
          {
            id: 'task-1',
            name: 'Task',
            type: 'action' as const,
          },
        ],
        dependencies: {},
        safetyPolicy: {
          name: 'test-policy',
          rules: [
            { type: 'max_retries', description: 'Limit retries' },
          ],
          failFast: true,
        },
      };

      const result = validateWorkflowSpec(spec);
      expect(result.success).toBe(true);
      expect(result.data?.safetyPolicy?.name).toBe('test-policy');
    });
  });

  describe('Complex nested structures', () => {
    it('should validate permissions array', () => {
      const spec = {
        id: 'workflow-123',
        name: 'Test Workflow',
        tasks: [
          {
            id: 'task-1',
            name: 'Task with permissions',
            type: 'action' as const,
            requiredPermissions: [
              {
                action: 'read',
                resource: 'database',
                intent: 'read' as const,
                dataZone: 'internal' as const,
              },
              {
                action: 'write',
                resource: 'file',
              },
            ],
          },
        ],
        dependencies: {},
      };

      const result = validateWorkflowSpec(spec);
      expect(result.success).toBe(true);
      expect(result.data?.tasks[0].requiredPermissions).toHaveLength(2);
    });

    it('should validate sandbox config', () => {
      const spec = {
        id: 'workflow-123',
        name: 'Test Workflow',
        tasks: [
          {
            id: 'task-1',
            name: 'Task with sandbox',
            type: 'action' as const,
            sandboxConfig: {
              enabled: true,
              type: 'container' as const,
              simulationMode: true,
            },
          },
        ],
        dependencies: {},
      };

      const result = validateWorkflowSpec(spec);
      expect(result.success).toBe(true);
      expect(result.data?.tasks[0].sandboxConfig?.enabled).toBe(true);
    });

    it('should validate compensation actions', () => {
      const spec = {
        id: 'workflow-123',
        name: 'Test Workflow',
        tasks: [
          {
            id: 'task-1',
            name: 'Task with compensation',
            type: 'action' as const,
            compensationAction: {
              tool: 'rollback-tool',
              args: {
                target: 'task-1',
              },
            },
          },
        ],
        dependencies: {},
      };

      const result = validateWorkflowSpec(spec);
      expect(result.success).toBe(true);
      expect(result.data?.tasks[0].compensationAction?.tool).toBe('rollback-tool');
    });
  });
});
