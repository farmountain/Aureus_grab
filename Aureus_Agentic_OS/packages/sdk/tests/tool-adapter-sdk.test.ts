import { describe, it, expect } from 'vitest';
import {
  createToolSpec,
  createToolAction,
  createToolCRVGate,
  createCompensation,
  noCompensation,
  SchemaBuilder,
  SchemaPropertyBuilder,
  SchemaPatterns,
  ToolAdapterSDK,
} from '../src/tool-adapter-sdk';
import { IdempotencyStrategy } from '@aureus/tools';
import { RiskTier, Intent, DataZone } from '@aureus/policy';
import { Validators } from '@aureus/crv';

describe('Tool Adapter SDK', () => {
  describe('createToolSpec', () => {
    it('should create a basic ToolSpec', () => {
      const tool = createToolSpec({
        id: 'test-tool',
        name: 'Test Tool',
        description: 'A test tool',
        sideEffect: false,
        execute: async (params) => ({ result: 'success' }),
      });

      expect(tool.id).toBe('test-tool');
      expect(tool.name).toBe('Test Tool');
      expect(tool.description).toBe('A test tool');
      expect(tool.sideEffect).toBe(false);
      expect(tool.idempotencyStrategy).toBe(IdempotencyStrategy.NATURAL);
    });

    it('should default to CACHE_REPLAY for side-effect tools', () => {
      const tool = createToolSpec({
        id: 'side-effect-tool',
        name: 'Side Effect Tool',
        description: 'A tool with side effects',
        sideEffect: true,
        execute: async (params) => ({ result: 'success' }),
      });

      expect(tool.sideEffect).toBe(true);
      expect(tool.idempotencyStrategy).toBe(IdempotencyStrategy.CACHE_REPLAY);
    });

    it('should include input and output schemas', () => {
      const inputSchema = {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
        required: ['input'],
        additionalProperties: false,
      };

      const outputSchema = {
        type: 'object',
        properties: {
          output: { type: 'string' },
        },
        required: ['output'],
      };

      const tool = createToolSpec({
        id: 'schema-tool',
        name: 'Schema Tool',
        description: 'A tool with schemas',
        inputSchema,
        outputSchema,
        execute: async (params) => ({ output: 'result' }),
      });

      expect(tool.inputSchema).toEqual(inputSchema);
      expect(tool.outputSchema).toEqual(outputSchema);
    });

    it('should include compensation capability', () => {
      const compensation = createCompensation({
        description: 'Undo the operation',
        execute: async (params, result) => {
          console.log('Compensating...');
        },
      });

      const tool = createToolSpec({
        id: 'compensating-tool',
        name: 'Compensating Tool',
        description: 'A tool with compensation',
        sideEffect: true,
        compensation,
        execute: async (params) => ({ result: 'success' }),
      });

      expect(tool.compensation?.supported).toBe(true);
      expect(tool.compensation?.action).toBeDefined();
    });
  });

  describe('createToolAction', () => {
    it('should create a policy action with default permissions', () => {
      const action = createToolAction({
        toolId: 'test-tool',
        toolName: 'Test Tool',
        riskTier: RiskTier.LOW,
      });

      expect(action.id).toBe('action-test-tool');
      expect(action.name).toBe('Execute Test Tool');
      expect(action.riskTier).toBe(RiskTier.LOW);
      expect(action.requiredPermissions).toHaveLength(1);
      expect(action.requiredPermissions[0].action).toBe(Intent.EXECUTE);
      expect(action.allowedTools).toContain('test-tool');
    });

    it('should support custom intent and data zone', () => {
      const action = createToolAction({
        toolId: 'write-tool',
        toolName: 'Write Tool',
        riskTier: RiskTier.MEDIUM,
        intent: Intent.WRITE,
        dataZone: DataZone.CONFIDENTIAL,
      });

      expect(action.intent).toBe(Intent.WRITE);
      expect(action.dataZone).toBe(DataZone.CONFIDENTIAL);
    });

    it('should support custom permissions', () => {
      const customPermissions = [
        { action: 'read', resource: 'database' },
        { action: 'write', resource: 'database' },
      ];

      const action = createToolAction({
        toolId: 'db-tool',
        toolName: 'Database Tool',
        riskTier: RiskTier.HIGH,
        requiredPermissions: customPermissions,
      });

      expect(action.requiredPermissions).toEqual(customPermissions);
    });
  });

  describe('createToolCRVGate', () => {
    it('should create a CRV gate configuration', () => {
      const validators = [Validators.notNull()];
      
      const gate = createToolCRVGate({
        toolName: 'Test Tool',
        validators,
        blockOnFailure: true,
      });

      expect(gate.name).toBe('Test Tool CRV Gate');
      expect(gate.validators).toEqual(validators);
      expect(gate.blockOnFailure).toBe(true);
    });

    it('should support required confidence threshold', () => {
      const gate = createToolCRVGate({
        toolName: 'High Confidence Tool',
        validators: [],
        requiredConfidence: 0.95,
      });

      expect(gate.requiredConfidence).toBe(0.95);
    });

    it('should default blockOnFailure to true', () => {
      const gate = createToolCRVGate({
        toolName: 'Default Gate',
        validators: [],
      });

      expect(gate.blockOnFailure).toBe(true);
    });
  });

  describe('createCompensation', () => {
    it('should create compensation capability', () => {
      const compensation = createCompensation({
        description: 'Undo the write',
        execute: async (params, result) => {},
      });

      expect(compensation.supported).toBe(true);
      expect(compensation.mode).toBe('automatic');
      expect(compensation.action?.description).toBe('Undo the write');
      expect(compensation.action?.maxRetries).toBe(3);
      expect(compensation.action?.timeoutMs).toBe(5000);
    });

    it('should support custom retry and timeout values', () => {
      const compensation = createCompensation({
        description: 'Custom compensation',
        execute: async (params, result) => {},
        maxRetries: 5,
        timeoutMs: 10000,
        mode: 'manual',
      });

      expect(compensation.mode).toBe('manual');
      expect(compensation.action?.maxRetries).toBe(5);
      expect(compensation.action?.timeoutMs).toBe(10000);
    });
  });

  describe('noCompensation', () => {
    it('should create non-supported compensation', () => {
      const compensation = noCompensation();

      expect(compensation.supported).toBe(false);
      expect(compensation.action).toBeUndefined();
    });
  });

  describe('SchemaBuilder', () => {
    it('should build a basic schema', () => {
      const schema = new SchemaBuilder()
        .addString('name', 'User name', true)
        .addNumber('age', 'User age', false)
        .build();

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('age');
      expect(schema.required).toContain('name');
      expect(schema.required).not.toContain('age');
    });

    it('should support all basic types', () => {
      const schema = new SchemaBuilder()
        .addString('str', 'String property')
        .addNumber('num', 'Number property')
        .addBoolean('bool', 'Boolean property')
        .addArray('arr', 'string', 'Array property')
        .build();

      expect(schema.properties?.str?.type).toBe('string');
      expect(schema.properties?.num?.type).toBe('number');
      expect(schema.properties?.bool?.type).toBe('boolean');
      expect(schema.properties?.arr?.type).toBe('array');
    });

    it('should support nested objects', () => {
      const nestedProps = {
        nested1: { type: 'string' as const },
        nested2: { type: 'number' as const },
      };

      const schema = new SchemaBuilder()
        .addObject('nested', nestedProps, 'Nested object', true)
        .build();

      expect(schema.properties?.nested?.type).toBe('object');
      expect(schema.properties?.nested?.properties).toEqual(nestedProps);
      expect(schema.required).toContain('nested');
    });

    it('should support additional properties control', () => {
      const schema1 = new SchemaBuilder()
        .allowAdditionalProperties(true)
        .build();

      const schema2 = new SchemaBuilder()
        .allowAdditionalProperties(false)
        .build();

      expect(schema1.additionalProperties).toBe(true);
      expect(schema2.additionalProperties).toBe(false);
    });
  });

  describe('SchemaPropertyBuilder', () => {
    it('should build a string property with constraints', () => {
      const property = new SchemaPropertyBuilder('string')
        .description('Email address')
        .pattern('^[a-z]+@[a-z]+\\.[a-z]+$')
        .build();

      expect(property.type).toBe('string');
      expect(property.description).toBe('Email address');
      expect(property.pattern).toBeDefined();
    });

    it('should build a number property with range', () => {
      const property = new SchemaPropertyBuilder('number')
        .description('Age')
        .minimum(0)
        .maximum(150)
        .build();

      expect(property.type).toBe('number');
      expect(property.minimum).toBe(0);
      expect(property.maximum).toBe(150);
    });

    it('should build an enum property', () => {
      const property = new SchemaPropertyBuilder('string')
        .description('Status')
        .enum('active', 'inactive', 'pending')
        .build();

      expect(property.enum).toEqual(['active', 'inactive', 'pending']);
    });

    it('should build an array property', () => {
      const property = new SchemaPropertyBuilder('array')
        .items('string')
        .build();

      expect(property.type).toBe('array');
      expect(property.items).toEqual({ type: 'string' });
    });
  });

  describe('SchemaPatterns', () => {
    it('should provide file path pattern', () => {
      const property = SchemaPatterns.filePath('File path');

      expect(property.type).toBe('string');
      expect(property.pattern).toBeDefined();
      expect(property.description).toBe('File path');
    });

    it('should provide URL pattern', () => {
      const property = SchemaPatterns.url();

      expect(property.type).toBe('string');
      expect(property.pattern).toContain('https?://');
    });

    it('should provide email pattern', () => {
      const property = SchemaPatterns.email('Contact email');

      expect(property.type).toBe('string');
      expect(property.pattern).toBeDefined();
      expect(property.description).toBe('Contact email');
    });

    it('should provide positive integer pattern', () => {
      const property = SchemaPatterns.positiveInteger('Count');

      expect(property.type).toBe('number');
      expect(property.minimum).toBe(1);
    });

    it('should provide non-negative integer pattern', () => {
      const property = SchemaPatterns.nonNegativeInteger();

      expect(property.type).toBe('number');
      expect(property.minimum).toBe(0);
    });

    it('should create enum from array', () => {
      const values = ['option1', 'option2', 'option3'];
      const property = SchemaPatterns.enumFromArray(values, 'Options');

      expect(property.type).toBe('string');
      expect(property.enum).toEqual(values);
      expect(property.description).toBe('Options');
    });
  });

  describe('ToolAdapterSDK', () => {
    it('should export all helper functions', () => {
      expect(ToolAdapterSDK.createToolSpec).toBeDefined();
      expect(ToolAdapterSDK.createToolAction).toBeDefined();
      expect(ToolAdapterSDK.createToolCRVGate).toBeDefined();
      expect(ToolAdapterSDK.createCompensation).toBeDefined();
      expect(ToolAdapterSDK.noCompensation).toBeDefined();
      expect(ToolAdapterSDK.SchemaBuilder).toBeDefined();
      expect(ToolAdapterSDK.SchemaPropertyBuilder).toBeDefined();
      expect(ToolAdapterSDK.SchemaPatterns).toBeDefined();
    });
  });
});
