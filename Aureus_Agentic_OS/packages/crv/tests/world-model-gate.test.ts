import { describe, it, expect } from 'vitest';
import { WorldModelCRVGate, validateWorldModelWithCRV } from '../src/world-model-gate';
import { WorldModelSpec } from '@aureus/world-model';

describe('WorldModelCRVGate', () => {
  describe('Schema Validation', () => {
    it('should pass validation for a valid world model spec', async () => {
      const spec: WorldModelSpec = {
        id: 'test-model',
        name: 'Test Model',
        version: '1.0.0',
        domain: 'Testing',
        entities: [
          {
            id: 'user',
            name: 'User',
            attributes: [
              { name: 'id', type: 'string', required: true },
              { name: 'email', type: 'string', required: true },
            ],
          },
        ],
        relations: [],
        constraints: [],
        causalRules: [],
      };

      const gate = WorldModelCRVGate.createGate();
      const commit = {
        id: 'test-commit',
        data: spec,
      };

      const result = await gate.validate(commit);
      expect(result.passed).toBe(true);
      expect(result.blockedCommit).toBe(false);
    });

    it('should fail validation for missing spec', async () => {
      const gate = WorldModelCRVGate.createGate();
      const commit = {
        id: 'test-commit',
        data: null,
      };

      const result = await gate.validate(commit);
      expect(result.passed).toBe(false);
      expect(result.blockedCommit).toBe(true);
    });
  });

  describe('Constraint Consistency Validation', () => {
    it('should pass when no constraints are present', async () => {
      const spec: WorldModelSpec = {
        id: 'test-model',
        name: 'Test Model',
        version: '1.0.0',
        domain: 'Testing',
        entities: [
          {
            id: 'user',
            name: 'User',
            attributes: [{ name: 'id', type: 'string', required: true }],
          },
        ],
        relations: [],
        constraints: [],
        causalRules: [],
      };

      const gate = WorldModelCRVGate.createGate();
      const commit = { id: 'test', data: spec };
      const result = await gate.validate(commit);
      
      expect(result.passed).toBe(true);
    });

    it('should detect conflicting constraints', async () => {
      const spec: WorldModelSpec = {
        id: 'test-model',
        name: 'Test Model',
        version: '1.0.0',
        domain: 'Testing',
        entities: [
          {
            id: 'user',
            name: 'User',
            attributes: [{ name: 'email', type: 'string', required: true }],
          },
        ],
        relations: [],
        constraints: [
          {
            id: 'not-null-email',
            name: 'Email Not Null',
            type: 'not-null',
            entity: 'user',
            attributes: ['email'],
            rule: 'NOT NULL',
          },
          {
            id: 'check-email',
            name: 'Check Email',
            type: 'check',
            entity: 'user',
            attributes: ['email'],
            rule: 'email IS NULL OR email != ""',
          },
        ],
        causalRules: [],
      };

      const gate = WorldModelCRVGate.createGate();
      const commit = { id: 'test', data: spec };
      const result = await gate.validate(commit);
      
      // Should detect potential conflict between not-null and check that allows null
      expect(result.passed).toBe(false);
      expect(result.blockedCommit).toBe(true);
    });
  });

  describe('Causal Graph Validation', () => {
    it('should pass when no causal rules are present', async () => {
      const spec: WorldModelSpec = {
        id: 'test-model',
        name: 'Test Model',
        version: '1.0.0',
        domain: 'Testing',
        entities: [
          {
            id: 'user',
            name: 'User',
            attributes: [{ name: 'id', type: 'string', required: true }],
          },
        ],
        relations: [],
        constraints: [],
        causalRules: [],
      };

      const gate = WorldModelCRVGate.createGate();
      const commit = { id: 'test', data: spec };
      const result = await gate.validate(commit);
      
      expect(result.passed).toBe(true);
    });

    it('should detect references to non-existent entities', async () => {
      const spec: WorldModelSpec = {
        id: 'test-model',
        name: 'Test Model',
        version: '1.0.0',
        domain: 'Testing',
        entities: [
          {
            id: 'user',
            name: 'User',
            attributes: [{ name: 'status', type: 'string', required: true }],
          },
        ],
        relations: [],
        constraints: [],
        causalRules: [
          {
            id: 'update-inventory',
            name: 'Update Inventory',
            conditions: [
              {
                entity: 'order', // This entity doesn't exist
                attribute: 'status',
                operator: 'equals',
                value: 'confirmed',
              },
            ],
            effects: [
              {
                entity: 'product', // This entity doesn't exist
                attribute: 'inventory',
                action: 'decrement',
              },
            ],
          },
        ],
      };

      const gate = WorldModelCRVGate.createGate();
      const commit = { id: 'test', data: spec };
      const result = await gate.validate(commit);
      
      expect(result.passed).toBe(false);
      expect(result.blockedCommit).toBe(true);
    });

    it('should pass for valid causal rules', async () => {
      const spec: WorldModelSpec = {
        id: 'test-model',
        name: 'Test Model',
        version: '1.0.0',
        domain: 'Testing',
        entities: [
          {
            id: 'order',
            name: 'Order',
            attributes: [{ name: 'status', type: 'string', required: true }],
          },
          {
            id: 'product',
            name: 'Product',
            attributes: [{ name: 'inventory', type: 'number', required: true }],
          },
        ],
        relations: [],
        constraints: [],
        causalRules: [
          {
            id: 'update-inventory',
            name: 'Update Inventory',
            conditions: [
              {
                entity: 'order',
                attribute: 'status',
                operator: 'equals',
                value: 'confirmed',
              },
            ],
            effects: [
              {
                entity: 'product',
                attribute: 'inventory',
                action: 'decrement',
              },
            ],
          },
        ],
      };

      const gate = WorldModelCRVGate.createGate();
      const commit = { id: 'test', data: spec };
      const result = await gate.validate(commit);
      
      expect(result.passed).toBe(true);
    });
  });

  describe('validateWorldModelWithCRV', () => {
    it('should validate a complete valid world model', async () => {
      const spec: WorldModelSpec = {
        id: 'ecommerce',
        name: 'E-commerce Model',
        version: '1.0.0',
        domain: 'E-commerce',
        entities: [
          {
            id: 'customer',
            name: 'Customer',
            attributes: [
              { name: 'id', type: 'string', required: true },
              { name: 'email', type: 'string', required: true },
            ],
          },
          {
            id: 'order',
            name: 'Order',
            attributes: [
              { name: 'id', type: 'string', required: true },
              { name: 'status', type: 'string', required: true },
            ],
          },
        ],
        relations: [
          {
            id: 'customer-orders',
            name: 'Customer Orders',
            sourceEntity: 'customer',
            targetEntity: 'order',
            type: 'one-to-many',
          },
        ],
        constraints: [
          {
            id: 'unique-email',
            name: 'Unique Email',
            type: 'unique',
            entity: 'customer',
            attributes: ['email'],
            rule: 'unique(email)',
          },
        ],
        causalRules: [],
      };

      const result = await validateWorldModelWithCRV(spec);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.crvResults).toBeDefined();
    });

    it('should return errors for invalid world model', async () => {
      const spec: WorldModelSpec = {
        id: 'invalid-model',
        name: 'Invalid Model',
        version: '1.0.0',
        domain: 'Testing',
        entities: [
          {
            id: 'user',
            name: 'User',
            attributes: [{ name: 'id', type: 'string', required: true }],
          },
        ],
        relations: [],
        constraints: [],
        causalRules: [
          {
            id: 'bad-rule',
            name: 'Bad Rule',
            conditions: [
              {
                entity: 'nonexistent',
                attribute: 'attr',
                operator: 'equals',
                value: 'value',
              },
            ],
            effects: [
              {
                entity: 'user',
                attribute: 'id',
                action: 'set',
              },
            ],
          },
        ],
      };

      const result = await validateWorldModelWithCRV(spec);
      expect(result.valid).toBe(false);
      // With confidence 0.9, this could be warnings or errors
      expect(result.errors || result.warnings).toBeDefined();
      const allIssues = [...(result.errors || []), ...(result.warnings || [])];
      expect(allIssues.length).toBeGreaterThan(0);
    });

    it('should collect warnings for low confidence validations', async () => {
      const spec: WorldModelSpec = {
        id: 'warning-model',
        name: 'Warning Model',
        version: '1.0.0',
        domain: 'Testing',
        entities: [
          {
            id: 'user',
            name: 'User',
            attributes: [{ name: 'email', type: 'string', required: true }],
          },
        ],
        relations: [],
        constraints: [
          {
            id: 'not-null-email',
            name: 'Email Not Null',
            type: 'not-null',
            entity: 'user',
            attributes: ['email'],
            rule: 'NOT NULL',
          },
          {
            id: 'check-email',
            name: 'Check Email',
            type: 'check',
            entity: 'user',
            attributes: ['email'],
            rule: 'email IS NULL OR email != ""',
          },
        ],
        causalRules: [],
      };

      const result = await validateWorldModelWithCRV(spec);
      expect(result.valid).toBe(false);
      // Constraint conflict has confidence 0.8, so it should be a warning
      expect(result.warnings).toBeDefined();
    });
  });
});
