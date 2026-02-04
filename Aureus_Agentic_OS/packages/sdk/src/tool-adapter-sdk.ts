/**
 * Tool Adapter SDK
 * Helper functions for creating ToolSpec adapters with proper schema validation,
 * policy integration, and CRV validation.
 */

import { 
  ToolSpec, 
  ToolSchema, 
  SchemaProperty, 
  IdempotencyStrategy, 
  CompensationCapability 
} from '@aureus/tools';
import { GateConfig, Validator } from '@aureus/crv';
import { Action, RiskTier, Permission, Intent, DataZone } from '@aureus/policy';

/**
 * Options for creating a ToolSpec
 */
export interface ToolSpecOptions {
  id: string;
  name: string;
  description: string;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
  sideEffect?: boolean;
  idempotencyStrategy?: IdempotencyStrategy;
  compensation?: CompensationCapability;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Options for creating policy action
 */
export interface PolicyActionOptions {
  toolId: string;
  toolName: string;
  riskTier: RiskTier;
  intent?: Intent;
  dataZone?: DataZone;
  requiredPermissions?: Permission[];
  allowedTools?: string[];
}

/**
 * Options for creating CRV gate configuration
 */
export interface CRVGateOptions {
  toolName: string;
  validators: Validator[];
  blockOnFailure?: boolean;
  requiredConfidence?: number;
}

/**
 * Schema property builder for type-safe schema generation
 */
export class SchemaPropertyBuilder {
  private property: SchemaProperty;

  constructor(type: string) {
    this.property = { type };
  }

  description(desc: string): this {
    this.property.description = desc;
    return this;
  }

  enum(...values: string[]): this {
    this.property.enum = values;
    return this;
  }

  pattern(pattern: string): this {
    this.property.pattern = pattern;
    return this;
  }

  minimum(min: number): this {
    this.property.minimum = min;
    return this;
  }

  maximum(max: number): this {
    this.property.maximum = max;
    return this;
  }

  items(itemType: string | SchemaProperty): this {
    this.property.items = typeof itemType === 'string' 
      ? { type: itemType } 
      : itemType;
    return this;
  }

  build(): SchemaProperty {
    return { ...this.property };
  }
}

/**
 * Schema builder for creating ToolSchema objects
 */
export class SchemaBuilder {
  private schema: ToolSchema;
  private properties: Record<string, SchemaProperty> = {};
  private requiredFields: string[] = [];

  constructor() {
    this.schema = {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    };
  }

  /**
   * Add a property to the schema
   */
  addProperty(name: string, property: SchemaProperty, required: boolean = false): this {
    this.properties[name] = property;
    if (required) {
      this.requiredFields.push(name);
    }
    return this;
  }

  /**
   * Add a string property
   */
  addString(name: string, description?: string, required: boolean = false): this {
    return this.addProperty(
      name, 
      { type: 'string', ...(description && { description }) }, 
      required
    );
  }

  /**
   * Add a number property
   */
  addNumber(name: string, description?: string, required: boolean = false): this {
    return this.addProperty(
      name, 
      { type: 'number', ...(description && { description }) }, 
      required
    );
  }

  /**
   * Add a boolean property
   */
  addBoolean(name: string, description?: string, required: boolean = false): this {
    return this.addProperty(
      name, 
      { type: 'boolean', ...(description && { description }) }, 
      required
    );
  }

  /**
   * Add an array property
   */
  addArray(name: string, itemType: string | SchemaProperty, description?: string, required: boolean = false): this {
    const items = typeof itemType === 'string' ? { type: itemType } : itemType;
    return this.addProperty(
      name, 
      { type: 'array', items, ...(description && { description }) }, 
      required
    );
  }

  /**
   * Add an object property
   * Note: Uses 'any' cast because SchemaProperty doesn't officially support nested properties
   * in its TypeScript definition, but the runtime validation logic handles them correctly.
   * This is a limitation of the current type definitions, not the runtime behavior.
   */
  addObject(name: string, properties: Record<string, SchemaProperty>, description?: string, required: boolean = false): this {
    return this.addProperty(
      name, 
      { type: 'object', ...(description && { description }), properties } as any, 
      required
    );
  }

  /**
   * Allow additional properties
   */
  allowAdditionalProperties(allow: boolean = true): this {
    this.schema.additionalProperties = allow;
    return this;
  }

  /**
   * Build the final schema
   */
  build(): ToolSchema {
    return {
      ...this.schema,
      properties: { ...this.properties },
      required: [...this.requiredFields],
    };
  }
}

/**
 * Helper to determine default idempotency strategy based on side effects
 */
function getDefaultIdempotencyStrategy(hasSideEffects: boolean): IdempotencyStrategy {
  return hasSideEffects ? IdempotencyStrategy.CACHE_REPLAY : IdempotencyStrategy.NATURAL;
}

/**
 * Create a ToolSpec with type-safe helpers
 */
export function createToolSpec(options: ToolSpecOptions): ToolSpec {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    parameters: options.parameters || [],
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    sideEffect: options.sideEffect ?? false,
    idempotencyStrategy: options.idempotencyStrategy || 
      getDefaultIdempotencyStrategy(options.sideEffect ?? false),
    compensation: options.compensation,
    execute: options.execute,
  };
}

/**
 * Create a policy action for a tool
 */
export function createToolAction(options: PolicyActionOptions): Action {
  const defaultPermissions: Permission[] = options.requiredPermissions || [
    {
      action: options.intent || Intent.EXECUTE,
      resource: 'tool',
    },
  ];

  return {
    id: `action-${options.toolId}`,
    name: `Execute ${options.toolName}`,
    riskTier: options.riskTier,
    requiredPermissions: defaultPermissions,
    intent: options.intent,
    dataZone: options.dataZone,
    allowedTools: options.allowedTools || [options.toolId],
  };
}

/**
 * Create a CRV gate configuration for a tool
 */
export function createToolCRVGate(options: CRVGateOptions): GateConfig {
  return {
    name: `${options.toolName} CRV Gate`,
    validators: options.validators,
    blockOnFailure: options.blockOnFailure ?? true,
    requiredConfidence: options.requiredConfidence,
  };
}

/**
 * Create compensation capability for a tool
 */
export interface CompensationOptions {
  description: string;
  execute: (originalParams: Record<string, unknown>, result: unknown) => Promise<void>;
  maxRetries?: number;
  timeoutMs?: number;
  mode?: 'automatic' | 'manual';
}

export function createCompensation(options: CompensationOptions): CompensationCapability {
  return {
    supported: true,
    mode: options.mode || 'automatic',
    action: {
      description: options.description,
      execute: options.execute,
      maxRetries: options.maxRetries || 3,
      timeoutMs: options.timeoutMs || 5000,
    },
  };
}

/**
 * Helper to create a no-compensation capability
 */
export function noCompensation(): CompensationCapability {
  return {
    supported: false,
  };
}

/**
 * Common schema patterns
 */
export const SchemaPatterns = {
  /**
   * File path schema property
   * Note: This provides basic validation against null bytes.
   * Production systems should implement additional security checks:
   * - Path traversal prevention (check resolved paths are within allowed directories)
   * - Length limits
   * - Character allowlist based on platform
   * - Sandbox/chroot environment for file operations
   */
  filePath(description?: string): SchemaProperty {
    return {
      type: 'string',
      description: description || 'File path',
      pattern: '^[^\\0]+$', // No null bytes
    };
  },

  /**
   * URL schema property
   */
  url(description?: string): SchemaProperty {
    return {
      type: 'string',
      description: description || 'URL',
      pattern: '^https?://.+',
    };
  },

  /**
   * Email schema property
   */
  email(description?: string): SchemaProperty {
    return {
      type: 'string',
      description: description || 'Email address',
      pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
    };
  },

  /**
   * Positive integer schema property
   */
  positiveInteger(description?: string): SchemaProperty {
    return {
      type: 'number',
      description: description || 'Positive integer',
      minimum: 1,
    };
  },

  /**
   * Non-negative integer schema property
   */
  nonNegativeInteger(description?: string): SchemaProperty {
    return {
      type: 'number',
      description: description || 'Non-negative integer',
      minimum: 0,
    };
  },

  /**
   * Enum from array of strings
   */
  enumFromArray(values: string[], description?: string): SchemaProperty {
    return {
      type: 'string',
      description,
      enum: values,
    };
  },
};

/**
 * Tool Adapter SDK - Main export
 */
export const ToolAdapterSDK = {
  createToolSpec,
  createToolAction,
  createToolCRVGate,
  createCompensation,
  noCompensation,
  SchemaBuilder,
  SchemaPropertyBuilder,
  SchemaPatterns,
};
