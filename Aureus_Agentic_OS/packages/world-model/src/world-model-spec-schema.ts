import { z } from 'zod';

/**
 * World Model Specification Schema
 * Defines the structure for domain models including entities, relations, constraints, and causal rules
 */

// Entity attribute schema
export const EntityAttributeSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'date', 'object', 'array']),
  required: z.boolean().default(false),
  description: z.string().optional(),
  defaultValue: z.unknown().optional(),
  constraints: z.array(z.string()).optional(), // e.g., ["min:0", "max:100", "unique"]
});

// Entity schema
export const EntitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  attributes: z.array(EntityAttributeSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Relation type schema
export const RelationTypeSchema = z.enum([
  'one-to-one',
  'one-to-many',
  'many-to-one',
  'many-to-many',
]);

// Relation schema
export const RelationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  sourceEntity: z.string().min(1), // Entity ID
  targetEntity: z.string().min(1), // Entity ID
  type: RelationTypeSchema,
  cardinality: z.object({
    min: z.number().int().min(0).optional(),
    max: z.number().int().min(0).optional(), // undefined means unbounded
  }).optional(),
  bidirectional: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Constraint type schema
export const ConstraintTypeSchema = z.enum([
  'unique',
  'not-null',
  'check',
  'foreign-key',
  'custom',
  'range',
  'pattern',
]);

// Constraint schema
export const ConstraintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  type: ConstraintTypeSchema,
  entity: z.string().min(1), // Entity ID
  attributes: z.array(z.string()), // Attribute names
  rule: z.string(), // Expression or validation rule
  errorMessage: z.string().optional(),
  severity: z.enum(['error', 'warning']).default('error'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Causal rule condition schema
export const CausalConditionSchema = z.object({
  entity: z.string().min(1), // Entity ID
  attribute: z.string().min(1), // Attribute name
  operator: z.enum(['equals', 'not-equals', 'greater-than', 'less-than', 'contains', 'matches', 'exists', 'not-exists']),
  value: z.unknown(),
});

// Causal rule effect schema
export const CausalEffectSchema = z.object({
  entity: z.string().min(1), // Entity ID
  attribute: z.string().min(1), // Attribute name
  action: z.enum(['set', 'increment', 'decrement', 'append', 'remove', 'compute']),
  value: z.unknown().optional(),
  expression: z.string().optional(), // For computed values
});

// Causal rule schema
export const CausalRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().min(0).default(0), // Higher priority executes first
  conditions: z.array(CausalConditionSchema).min(1),
  effects: z.array(CausalEffectSchema).min(1),
  enabled: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// World model specification schema
export const WorldModelSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
  description: z.string().optional(),
  domain: z.string().min(1), // Domain description or category
  entities: z.array(EntitySchema).min(1),
  relations: z.array(RelationSchema).default([]),
  constraints: z.array(ConstraintSchema).default([]),
  causalRules: z.array(CausalRuleSchema).default([]),
  metadata: z.object({
    author: z.string().optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
});

// Export types
export type EntityAttribute = z.infer<typeof EntityAttributeSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type RelationType = z.infer<typeof RelationTypeSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type ConstraintType = z.infer<typeof ConstraintTypeSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type CausalCondition = z.infer<typeof CausalConditionSchema>;
export type CausalEffect = z.infer<typeof CausalEffectSchema>;
export type CausalRule = z.infer<typeof CausalRuleSchema>;
export type WorldModelSpec = z.infer<typeof WorldModelSpecSchema>;

/**
 * Validate a world model specification
 */
export function validateWorldModelSpec(spec: unknown): { 
  success: boolean; 
  data?: WorldModelSpec; 
  errors?: string[] 
} {
  try {
    const data = WorldModelSpecSchema.parse(spec);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Create a default/empty world model spec
 */
export function createEmptyWorldModelSpec(name: string, domain: string): WorldModelSpec {
  return {
    id: `world-model-${Date.now()}`,
    name,
    version: '1.0.0',
    domain,
    entities: [],
    relations: [],
    constraints: [],
    causalRules: [],
    metadata: {
      createdAt: new Date().toISOString(),
    },
  };
}
