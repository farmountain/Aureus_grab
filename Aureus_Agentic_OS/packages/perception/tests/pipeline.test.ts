/**
 * Integration tests for perception pipeline
 */

import { describe, it, expect } from 'vitest';
import {
  PerceptionPipelineBuilder,
  TextAdapter,
  JsonAdapter,
  EventAdapter,
  DefaultDataContractValidator,
  InMemorySymbolicStore,
  DefaultContextAggregator,
  RawInput,
} from '../src';
import { CRVGate, Validators } from '@aureus/crv';

describe('Perception Pipeline Integration', () => {
  it('should process text input through full pipeline', async () => {
    const pipeline = new PerceptionPipelineBuilder('test-pipeline')
      .withAdapters(new TextAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(new InMemorySymbolicStore())
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    const input: RawInput = {
      id: 'input-1',
      source: 'text',
      timestamp: new Date(),
      data: 'What is the status of order #12345?',
    };

    const result = await pipeline.process(input);

    expect(result.success).toBe(true);
    expect(result.normalizedInput).toBeDefined();
    expect(result.contract).toBeDefined();
    expect(result.entities).toBeDefined();
    expect(result.context).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it('should process JSON input through full pipeline', async () => {
    const pipeline = new PerceptionPipelineBuilder('test-pipeline')
      .withAdapters(new JsonAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(new InMemorySymbolicStore())
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    const input: RawInput = {
      id: 'input-2',
      source: 'json',
      timestamp: new Date(),
      data: {
        orderId: '12345',
        status: 'pending',
        amount: 99.99,
      },
    };

    const result = await pipeline.process(input);

    expect(result.success).toBe(true);
    expect(result.normalizedInput?.format).toBe('json');
    expect(result.contract?.intent.type).toBe('data');
    expect(result.entities).toHaveLength(1);
  });

  it('should process event input through full pipeline', async () => {
    const pipeline = new PerceptionPipelineBuilder('test-pipeline')
      .withAdapters(new EventAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(new InMemorySymbolicStore())
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    const input: RawInput = {
      id: 'input-3',
      source: 'event',
      timestamp: new Date(),
      data: {
        type: 'user.signup',
        payload: {
          userId: 'user-123',
          email: 'test@example.com',
        },
      },
    };

    const result = await pipeline.process(input);

    expect(result.success).toBe(true);
    expect(result.normalizedInput?.format).toBe('event');
    expect(result.contract?.intent.type).toBe('event');
    expect(result.entities).toHaveLength(1);
    expect(result.entities?.[0].type).toBe('event');
  });

  it('should enforce CRV validation at each stage', async () => {
    const gate = new CRVGate({
      name: 'strict-gate',
      validators: [
        Validators.notNull(),
        Validators.custom('confidence-check', (commit) => {
          const data = commit.data as { confidence?: number };
          if (data.confidence !== undefined && data.confidence < 0.9) {
            return {
              valid: false,
              reason: 'Confidence too low (< 0.9)',
              confidence: 0.0,
            };
          }
          return { valid: true };
        }),
      ],
      blockOnFailure: true,
    });

    const pipeline = new PerceptionPipelineBuilder('crv-pipeline')
      .withAdapters(new TextAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(new InMemorySymbolicStore())
      .withContextAggregator(new DefaultContextAggregator())
      .withCRVValidation(gate, 'strict-gate')
      .build();

    const input: RawInput = {
      id: 'input-4',
      source: 'text',
      timestamp: new Date(),
      data: 'Test input',
    };

    const result = await pipeline.process(input);

    // Pipeline should complete successfully as long as validation passes
    expect(result.success).toBe(true);
  });

  it('should store entities in symbolic store', async () => {
    const store = new InMemorySymbolicStore();
    const pipeline = new PerceptionPipelineBuilder('test-pipeline')
      .withAdapters(new TextAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(store)
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    const input: RawInput = {
      id: 'input-5',
      source: 'text',
      timestamp: new Date(),
      data: 'Store this message',
    };

    const result = await pipeline.process(input);

    expect(result.success).toBe(true);

    // Check that entity is stored
    const allEntities = await store.all();
    expect(allEntities.length).toBeGreaterThan(0);
    expect(allEntities[0].source).toBe('input-5');
  });

  it('should handle multiple adapters and select appropriate one', async () => {
    const pipeline = new PerceptionPipelineBuilder('multi-adapter-pipeline')
      .withAdapters(new TextAdapter(), new JsonAdapter(), new EventAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(new InMemorySymbolicStore())
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    // Process text input
    const textInput: RawInput = {
      id: 'input-6',
      source: 'text',
      timestamp: new Date(),
      data: 'Text message',
    };

    const textResult = await pipeline.process(textInput);
    expect(textResult.success).toBe(true);
    expect(textResult.normalizedInput?.format).toBe('text');

    // Process JSON input
    const jsonInput: RawInput = {
      id: 'input-7',
      source: 'json',
      timestamp: new Date(),
      data: { key: 'value' },
    };

    const jsonResult = await pipeline.process(jsonInput);
    expect(jsonResult.success).toBe(true);
    expect(jsonResult.normalizedInput?.format).toBe('json');
  });

  it('should fail gracefully with unsupported input source', async () => {
    const pipeline = new PerceptionPipelineBuilder('test-pipeline')
      .withAdapters(new TextAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(new InMemorySymbolicStore())
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    const input: RawInput = {
      id: 'input-8',
      source: 'unsupported-source',
      timestamp: new Date(),
      data: 'Test data',
    };

    const result = await pipeline.process(input);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].message).toContain('No adapter found');
  });

  it('should aggregate context from multiple entities', async () => {
    const store = new InMemorySymbolicStore();
    const pipeline = new PerceptionPipelineBuilder('test-pipeline')
      .withAdapters(new TextAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(store)
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    // Process multiple inputs
    const inputs: RawInput[] = [
      {
        id: 'input-9',
        source: 'text',
        timestamp: new Date(),
        data: 'First message',
      },
      {
        id: 'input-10',
        source: 'text',
        timestamp: new Date(),
        data: 'Second message',
      },
    ];

    for (const input of inputs) {
      const result = await pipeline.process(input);
      expect(result.success).toBe(true);
    }

    // Check stored entities
    const allEntities = await store.all();
    expect(allEntities.length).toBeGreaterThanOrEqual(2);
  });

  it('should validate schema constraints', async () => {
    const validator = new DefaultDataContractValidator();
    const pipeline = new PerceptionPipelineBuilder('test-pipeline')
      .withAdapters(new TextAdapter())
      .withContractValidator(validator)
      .withSymbolicStore(new InMemorySymbolicStore())
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    const input: RawInput = {
      id: 'input-11',
      source: 'text',
      timestamp: new Date(),
      data: 'Valid text input',
    };

    const result = await pipeline.process(input);

    expect(result.success).toBe(true);
    expect(result.contract?.validationResults).toBeDefined();
    expect(result.contract?.validationResults.every(r => r.passed)).toBe(true);
  });

  it('should extract and validate intent', async () => {
    const pipeline = new PerceptionPipelineBuilder('test-pipeline')
      .withAdapters(new TextAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(new InMemorySymbolicStore())
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    // Test query intent
    const queryInput: RawInput = {
      id: 'input-12',
      source: 'text',
      timestamp: new Date(),
      data: 'What is the weather like today?',
    };

    const queryResult = await pipeline.process(queryInput);
    expect(queryResult.success).toBe(true);
    expect(queryResult.contract?.intent.type).toBe('query');

    // Test command intent
    const commandInput: RawInput = {
      id: 'input-13',
      source: 'text',
      timestamp: new Date(),
      data: 'Run the backup script',
    };

    const commandResult = await pipeline.process(commandInput);
    expect(commandResult.success).toBe(true);
    expect(commandResult.contract?.intent.type).toBe('command');
  });

  it('should build context with relevance scoring', async () => {
    const pipeline = new PerceptionPipelineBuilder('test-pipeline')
      .withAdapters(new TextAdapter())
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(new InMemorySymbolicStore())
      .withContextAggregator(new DefaultContextAggregator())
      .build();

    const input: RawInput = {
      id: 'input-14',
      source: 'text',
      timestamp: new Date(),
      data: 'Test message for context building',
    };

    const result = await pipeline.process(input);

    expect(result.success).toBe(true);
    expect(result.context).toBeDefined();
    expect(result.context?.relevanceScore).toBeGreaterThan(0);
    expect(result.context?.relevanceScore).toBeLessThanOrEqual(1);
  });
});
