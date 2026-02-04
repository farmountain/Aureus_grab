import { describe, it, expect } from 'vitest';
import { DAGValidator } from '../src/dag-validator';
import { WorkflowSpec } from '@aureus/kernel';

describe('DAGValidator', () => {
  describe('validateTopology', () => {
    it('should validate a simple linear workflow', () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-1', name: 'Task 1', type: 'action' },
          { id: 'task-2', name: 'Task 2', type: 'action' },
        ],
        dependencies: new Map([
          ['task-2', ['task-1']]
        ]),
      };

      const result = DAGValidator.validateTopology(spec);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.topologicalOrder).toEqual(['task-1', 'task-2']);
    });

    it('should detect cycles in workflow', () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-1', name: 'Task 1', type: 'action' },
          { id: 'task-2', name: 'Task 2', type: 'action' },
        ],
        dependencies: new Map([
          ['task-1', ['task-2']],
          ['task-2', ['task-1']]
        ]),
      };

      const result = DAGValidator.validateTopology(spec);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('cycle');
    });

    it('should detect missing dependencies', () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-1', name: 'Task 1', type: 'action' },
        ],
        dependencies: new Map([
          ['task-1', ['task-nonexistent']]
        ]),
      };

      const result = DAGValidator.validateTopology(spec);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].type).toBe('missing_dependency');
    });

    it('should compute correct topological order for complex DAG', () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [
          { id: 'task-1', name: 'Task 1', type: 'action' },
          { id: 'task-2', name: 'Task 2', type: 'action' },
          { id: 'task-3', name: 'Task 3', type: 'action' },
          { id: 'task-4', name: 'Task 4', type: 'action' },
        ],
        dependencies: new Map([
          ['task-3', ['task-1', 'task-2']],
          ['task-4', ['task-3']]
        ]),
      };

      const result = DAGValidator.validateTopology(spec);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.topologicalOrder).toBeDefined();
      
      // Check that dependencies come before dependents
      const order = result.topologicalOrder!;
      const task1Index = order.indexOf('task-1');
      const task2Index = order.indexOf('task-2');
      const task3Index = order.indexOf('task-3');
      const task4Index = order.indexOf('task-4');
      
      expect(task1Index).toBeLessThan(task3Index);
      expect(task2Index).toBeLessThan(task3Index);
      expect(task3Index).toBeLessThan(task4Index);
    });
  });

  describe('validatePolicy', () => {
    it('should warn about high risk tasks without compensation', () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [
          { 
            id: 'task-1', 
            name: 'Task 1', 
            type: 'action',
            riskTier: 'HIGH'
          },
        ],
        dependencies: new Map(),
      };

      const result = DAGValidator.validatePolicy(spec);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.type === 'risk_tier')).toBe(true);
    });

    it('should warn about critical tasks without permissions', () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [
          { 
            id: 'task-1', 
            name: 'Task 1', 
            type: 'action',
            riskTier: 'CRITICAL'
          },
        ],
        dependencies: new Map(),
      };

      const result = DAGValidator.validatePolicy(spec);

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should validate low risk tasks without issues', () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [
          { 
            id: 'task-1', 
            name: 'Task 1', 
            type: 'action',
            riskTier: 'LOW'
          },
        ],
        dependencies: new Map(),
      };

      const result = DAGValidator.validatePolicy(spec);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateCRVRules', () => {
    it('should provide warnings for high risk tasks', () => {
      const spec: WorkflowSpec = {
        id: 'test-workflow',
        name: 'Test Workflow',
        tasks: [
          { 
            id: 'task-1', 
            name: 'Task 1', 
            type: 'action',
            riskTier: 'HIGH'
          },
        ],
        dependencies: new Map(),
      };

      const result = DAGValidator.validateCRVRules(spec);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
