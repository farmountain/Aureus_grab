/**
 * Data contract validation with schema and intent extraction
 */

import { Validators, ValidationResult } from '@aureus/crv';
import { NormalizedInput, DataContract, Intent, DataContractValidator } from './types';

/**
 * Schema definitions for different input formats
 */
export interface SchemaDefinition {
  name: string;
  version: string;
  fields: Record<string, {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;
    validator?: (value: unknown) => boolean;
  }>;
}

/**
 * Schema registry for managing data schemas
 */
export class SchemaRegistry {
  private schemas: Map<string, SchemaDefinition> = new Map();

  constructor() {
    // Register default schemas
    this.registerDefaultSchemas();
  }

  /**
   * Register a schema
   */
  register(schema: SchemaDefinition): void {
    this.schemas.set(`${schema.name}-${schema.version}`, schema);
  }

  /**
   * Get a schema by name and version
   */
  get(name: string, version: string): SchemaDefinition | null {
    return this.schemas.get(`${name}-${version}`) || null;
  }

  /**
   * Register default schemas for common formats
   */
  private registerDefaultSchemas(): void {
    // Text schema
    this.register({
      name: 'text',
      version: 'v1',
      fields: {
        text: { type: 'string', required: true },
        length: { type: 'number', required: true },
        wordCount: { type: 'number', required: true },
      },
    });

    // JSON schema
    this.register({
      name: 'json',
      version: 'v1',
      fields: {},
    });

    // Event schema
    this.register({
      name: 'event',
      version: 'v1',
      fields: {
        eventType: { type: 'string', required: true },
        payload: { type: 'object', required: true },
        eventMetadata: { type: 'object', required: true },
      },
    });

    // Sensor schema
    this.register({
      name: 'sensor',
      version: 'v1',
      fields: {
        sensorId: { type: 'string', required: true },
        readings: { type: 'object', required: true },
        timestamp: { type: 'string', required: true },
      },
    });

    // Image schema
    this.register({
      name: 'image',
      version: 'v1',
      fields: {
        content: { type: 'string', required: true },
        format: { type: 'string', required: true },
      },
    });

    // Audio schema
    this.register({
      name: 'audio',
      version: 'v1',
      fields: {
        content: { type: 'string', required: true },
        format: { type: 'string', required: true },
      },
    });

    // Video schema
    this.register({
      name: 'video',
      version: 'v1',
      fields: {
        content: { type: 'string', required: true },
        format: { type: 'string', required: true },
      },
    });
  }
}

/**
 * Default data contract validator implementation
 */
export class DefaultDataContractValidator implements DataContractValidator {
  readonly name = 'DefaultDataContractValidator';
  private schemaRegistry: SchemaRegistry;
  private intentExtractors: Map<string, (input: NormalizedInput) => Promise<Intent>> = new Map();

  constructor() {
    this.schemaRegistry = new SchemaRegistry();
    this.registerDefaultIntentExtractors();
  }

  /**
   * Validate normalized input against schema and extract intent
   */
  async validate(input: NormalizedInput): Promise<DataContract> {
    const validationResults: Array<{
      validator: string;
      passed: boolean;
      message?: string;
    }> = [];

    // Schema validation
    if (input.schema) {
      const [schemaName, schemaVersion] = input.schema.split('-');
      const schema = this.schemaRegistry.get(schemaName, schemaVersion || 'v1');

      if (schema) {
        const schemaValidation = this.validateSchema(input.data, schema);
        validationResults.push({
          validator: 'schema',
          passed: schemaValidation.valid,
          message: schemaValidation.reason,
        });

        if (!schemaValidation.valid) {
          throw new Error(`Schema validation failed: ${schemaValidation.reason}`);
        }
      } else {
        validationResults.push({
          validator: 'schema',
          passed: false,
          message: `Schema not found: ${input.schema}`,
        });
      }
    }

    // CRV validation - not null check
    const notNullValidator = Validators.notNull();
    const notNullResult = await Promise.resolve(notNullValidator({
      id: input.id,
      data: input.data,
      metadata: input.metadata,
    }));

    validationResults.push({
      validator: 'notNull',
      passed: notNullResult.valid,
      message: notNullResult.reason,
    });

    // Extract intent
    const intent = await this.extractIntent(input);

    validationResults.push({
      validator: 'intentExtraction',
      passed: intent.confidence > 0,
      message: `Intent extracted: ${intent.type} (confidence: ${intent.confidence})`,
    });

    return {
      id: `contract-${input.id}`,
      inputId: input.id,
      schema: input.schema || 'unknown',
      schemaVersion: input.schema?.split('-')[1] || 'unknown',
      intent,
      validatedData: input.data,
      timestamp: new Date(),
      validationResults,
    };
  }

  /**
   * Extract intent from the input data
   */
  async extractIntent(input: NormalizedInput): Promise<Intent> {
    const extractor = this.intentExtractors.get(input.format);
    
    if (extractor) {
      return extractor(input);
    }

    // Default intent extraction
    return {
      type: 'observation',
      confidence: 0.5,
      parameters: {},
      description: `Default intent for ${input.format} format`,
    };
  }

  /**
   * Validate data against schema
   */
  private validateSchema(data: unknown, schema: SchemaDefinition): ValidationResult {
    if (!data || typeof data !== 'object') {
      return {
        valid: false,
        reason: 'Data must be an object',
      };
    }

    const dataObj = data as Record<string, unknown>;

    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      const fieldValue = dataObj[fieldName];

      // Check required fields
      if (fieldDef.required && (fieldValue === undefined || fieldValue === null)) {
        return {
          valid: false,
          reason: `Required field missing: ${fieldName}`,
        };
      }

      // Check field type
      if (fieldValue !== undefined && fieldValue !== null) {
        const actualType = Array.isArray(fieldValue) ? 'array' : typeof fieldValue;
        if (actualType !== fieldDef.type) {
          return {
            valid: false,
            reason: `Field ${fieldName} has wrong type: expected ${fieldDef.type}, got ${actualType}`,
          };
        }

        // Custom validator
        if (fieldDef.validator && !fieldDef.validator(fieldValue)) {
          return {
            valid: false,
            reason: `Field ${fieldName} failed custom validation`,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Register default intent extractors
   */
  private registerDefaultIntentExtractors(): void {
    // Text intent extraction
    this.intentExtractors.set('text', async (input: NormalizedInput) => {
      const data = input.data as { text: string };
      const text = data.text.toLowerCase();

      // Simple heuristic-based intent detection
      if (text.includes('?')) {
        return {
          type: 'query',
          confidence: 0.7,
          parameters: { text: data.text },
          description: 'Question detected',
        };
      } else if (text.match(/^(do|run|execute|perform|start|stop)/)) {
        return {
          type: 'command',
          confidence: 0.8,
          parameters: { text: data.text },
          description: 'Command detected',
        };
      } else {
        return {
          type: 'observation',
          confidence: 0.6,
          parameters: { text: data.text },
          description: 'General observation',
        };
      }
    });

    // Event intent extraction
    this.intentExtractors.set('event', async (input: NormalizedInput) => {
      const data = input.data as { eventType: string; payload: unknown };
      return {
        type: 'event',
        confidence: 0.9,
        parameters: {
          eventType: data.eventType,
          payload: data.payload,
        },
        description: `Event: ${data.eventType}`,
      };
    });

    // Sensor intent extraction
    this.intentExtractors.set('sensor', async (input: NormalizedInput) => {
      const data = input.data as { sensorId: string; readings: Record<string, number> };
      return {
        type: 'observation',
        confidence: 0.95,
        parameters: {
          sensorId: data.sensorId,
          readings: data.readings,
        },
        description: `Sensor reading from ${data.sensorId}`,
      };
    });

    // JSON intent extraction
    this.intentExtractors.set('json', async (input: NormalizedInput) => {
      return {
        type: 'data',
        confidence: 0.7,
        parameters: { data: input.data },
        description: 'Structured data input',
      };
    });

    // Image intent extraction
    this.intentExtractors.set('image', async (input: NormalizedInput) => {
      const data = input.data as { format: string; content: string };
      return {
        type: 'observation',
        confidence: 0.85,
        parameters: {
          format: data.format,
          contentType: 'image',
        },
        description: 'Image input for visual analysis',
      };
    });

    // Audio intent extraction
    this.intentExtractors.set('audio', async (input: NormalizedInput) => {
      const data = input.data as { format: string; content: string; duration?: number };
      return {
        type: 'observation',
        confidence: 0.85,
        parameters: {
          format: data.format,
          contentType: 'audio',
          duration: data.duration,
        },
        description: 'Audio input for auditory analysis',
      };
    });

    // Video intent extraction
    this.intentExtractors.set('video', async (input: NormalizedInput) => {
      const data = input.data as { format: string; content: string; duration?: number };
      return {
        type: 'observation',
        confidence: 0.85,
        parameters: {
          format: data.format,
          contentType: 'video',
          duration: data.duration,
        },
        description: 'Video input for visual and temporal analysis',
      };
    });
  }

  /**
   * Register custom schema
   */
  registerSchema(schema: SchemaDefinition): void {
    this.schemaRegistry.register(schema);
  }

  /**
   * Register custom intent extractor
   */
  registerIntentExtractor(
    format: string,
    extractor: (input: NormalizedInput) => Promise<Intent>
  ): void {
    this.intentExtractors.set(format, extractor);
  }
}
