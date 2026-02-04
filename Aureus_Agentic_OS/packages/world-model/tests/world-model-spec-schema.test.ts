import { describe, it, expect } from 'vitest';
import {
  WorldModelSpecSchema,
  validateWorldModelSpec,
  createEmptyWorldModelSpec,
  EntityAttributeSchema,
  EntitySchema,
  RelationSchema,
  ConstraintSchema,
  CausalRuleSchema,
} from '../src/world-model-spec-schema';

describe('World Model Spec Schema', () => {
  describe('EntityAttributeSchema', () => {
    it('should validate a valid entity attribute', () => {
      const attr = {
        name: 'username',
        type: 'string',
        required: true,
        description: 'User login name',
      };

      const result = EntityAttributeSchema.safeParse(attr);
      expect(result.success).toBe(true);
    });

    it('should reject invalid attribute type', () => {
      const attr = {
        name: 'age',
        type: 'invalid-type',
        required: false,
      };

      const result = EntityAttributeSchema.safeParse(attr);
      expect(result.success).toBe(false);
    });
  });

  describe('EntitySchema', () => {
    it('should validate a valid entity', () => {
      const entity = {
        id: 'user-entity',
        name: 'User',
        description: 'User entity',
        attributes: [
          { name: 'id', type: 'string', required: true },
          { name: 'email', type: 'string', required: true },
          { name: 'age', type: 'number', required: false },
        ],
      };

      const result = EntitySchema.safeParse(entity);
      expect(result.success).toBe(true);
    });

    it('should require id and name', () => {
      const entity = {
        attributes: [],
      };

      const result = EntitySchema.safeParse(entity);
      expect(result.success).toBe(false);
    });
  });

  describe('RelationSchema', () => {
    it('should validate a valid relation', () => {
      const relation = {
        id: 'user-posts',
        name: 'User Posts',
        sourceEntity: 'user-entity',
        targetEntity: 'post-entity',
        type: 'one-to-many',
        bidirectional: false,
      };

      const result = RelationSchema.safeParse(relation);
      expect(result.success).toBe(true);
    });

    it('should validate relation types', () => {
      const validTypes = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'];
      
      for (const type of validTypes) {
        const relation = {
          id: 'test-rel',
          name: 'Test Relation',
          sourceEntity: 'entity1',
          targetEntity: 'entity2',
          type,
        };
        const result = RelationSchema.safeParse(relation);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('ConstraintSchema', () => {
    it('should validate a valid constraint', () => {
      const constraint = {
        id: 'unique-email',
        name: 'Unique Email',
        type: 'unique',
        entity: 'user-entity',
        attributes: ['email'],
        rule: 'unique(email)',
        severity: 'error',
      };

      const result = ConstraintSchema.safeParse(constraint);
      expect(result.success).toBe(true);
    });

    it('should validate constraint types', () => {
      const validTypes = ['unique', 'not-null', 'check', 'foreign-key', 'custom', 'range', 'pattern'];
      
      for (const type of validTypes) {
        const constraint = {
          id: 'test-constraint',
          name: 'Test Constraint',
          type,
          entity: 'entity1',
          attributes: ['attr1'],
          rule: 'test rule',
        };
        const result = ConstraintSchema.safeParse(constraint);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('CausalRuleSchema', () => {
    it('should validate a valid causal rule', () => {
      const rule = {
        id: 'update-inventory',
        name: 'Update Inventory on Order',
        priority: 1,
        conditions: [
          {
            entity: 'order-entity',
            attribute: 'status',
            operator: 'equals',
            value: 'confirmed',
          },
        ],
        effects: [
          {
            entity: 'product-entity',
            attribute: 'inventory',
            action: 'decrement',
            value: 1,
          },
        ],
      };

      const result = CausalRuleSchema.safeParse(rule);
      expect(result.success).toBe(true);
    });

    it('should require at least one condition and effect', () => {
      const rule = {
        id: 'test-rule',
        name: 'Test Rule',
        conditions: [],
        effects: [],
      };

      const result = CausalRuleSchema.safeParse(rule);
      expect(result.success).toBe(false);
    });
  });

  describe('WorldModelSpecSchema', () => {
    it('should validate a complete world model spec', () => {
      const spec = {
        id: 'ecommerce-model',
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
            id: 'product',
            name: 'Product',
            attributes: [
              { name: 'id', type: 'string', required: true },
              { name: 'price', type: 'number', required: true },
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
            name: 'Unique Customer Email',
            type: 'unique',
            entity: 'customer',
            attributes: ['email'],
            rule: 'unique(email)',
          },
        ],
        causalRules: [
          {
            id: 'order-inventory',
            name: 'Update Inventory',
            conditions: [
              {
                entity: 'order',
                attribute: 'status',
                operator: 'equals',
                value: 'placed',
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

      const result = WorldModelSpecSchema.safeParse(spec);
      expect(result.success).toBe(true);
    });

    it('should require at least one entity', () => {
      const spec = {
        id: 'empty-model',
        name: 'Empty Model',
        version: '1.0.0',
        domain: 'Test',
        entities: [],
      };

      const result = WorldModelSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });

    it('should validate version format', () => {
      const spec = {
        id: 'test-model',
        name: 'Test Model',
        version: 'invalid',
        domain: 'Test',
        entities: [
          {
            id: 'entity1',
            name: 'Entity1',
            attributes: [{ name: 'id', type: 'string', required: true }],
          },
        ],
      };

      const result = WorldModelSpecSchema.safeParse(spec);
      expect(result.success).toBe(false);
    });
  });

  describe('validateWorldModelSpec', () => {
    it('should validate a valid spec', () => {
      const spec = {
        id: 'test-model',
        name: 'Test Model',
        version: '1.0.0',
        domain: 'Test',
        entities: [
          {
            id: 'entity1',
            name: 'Entity1',
            attributes: [{ name: 'id', type: 'string', required: true }],
          },
        ],
      };

      const result = validateWorldModelSpec(spec);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should return errors for invalid spec', () => {
      const spec = {
        id: 'test-model',
        name: 'Test Model',
        version: 'bad-version',
        domain: 'Test',
        entities: [],
      };

      const result = validateWorldModelSpec(spec);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('createEmptyWorldModelSpec', () => {
    it('should create an empty world model spec', () => {
      const spec = createEmptyWorldModelSpec('My Model', 'My Domain');
      
      expect(spec.name).toBe('My Model');
      expect(spec.domain).toBe('My Domain');
      expect(spec.version).toBe('1.0.0');
      expect(spec.entities).toEqual([]);
      expect(spec.relations).toEqual([]);
      expect(spec.constraints).toEqual([]);
      expect(spec.causalRules).toEqual([]);
      expect(spec.metadata?.createdAt).toBeDefined();
    });
  });
});
