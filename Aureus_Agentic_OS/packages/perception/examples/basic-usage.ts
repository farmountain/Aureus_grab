/**
 * Example usage of the perception pipeline
 */

import {
  PerceptionPipelineBuilder,
  TextAdapter,
  JsonAdapter,
  EventAdapter,
  SensorAdapter,
  DefaultDataContractValidator,
  InMemorySymbolicStore,
  DefaultContextAggregator,
  GoalAwareContextAggregator,
  RawInput,
} from '../src';
import { CRVGate, Validators } from '@aureus/crv';

/**
 * Basic perception pipeline example
 */
async function basicPipelineExample() {
  console.log('=== Basic Perception Pipeline Example ===\n');

  // Create CRV gate for validation
  const crvGate = new CRVGate({
    name: 'perception-gate',
    validators: [
      Validators.notNull(),
      Validators.schema({ id: 'string' }),
    ],
    blockOnFailure: true,
  });

  // Build perception pipeline
  const pipeline = new PerceptionPipelineBuilder('demo-pipeline')
    .withAdapters(
      new TextAdapter(),
      new JsonAdapter(),
      new EventAdapter(),
      new SensorAdapter()
    )
    .withContractValidator(new DefaultDataContractValidator())
    .withSymbolicStore(new InMemorySymbolicStore())
    .withContextAggregator(new GoalAwareContextAggregator())
    .withCRVValidation(crvGate, 'perception-gate')
    .build();

  // Process different types of inputs
  const inputs: RawInput[] = [
    {
      id: 'input-1',
      source: 'text',
      timestamp: new Date(),
      data: 'What is the status of order #12345?',
    },
    {
      id: 'input-2',
      source: 'json',
      timestamp: new Date(),
      data: {
        orderId: '12345',
        status: 'pending',
        amount: 99.99,
      },
    },
    {
      id: 'input-3',
      source: 'event',
      timestamp: new Date(),
      data: {
        type: 'order.updated',
        payload: {
          orderId: '12345',
          newStatus: 'shipped',
        },
      },
    },
  ];

  for (const input of inputs) {
    console.log(`Processing input: ${input.id} (${input.source})`);
    
    const result = await pipeline.process(input);

    if (result.success) {
      console.log(`✓ Success`);
      console.log(`  Format: ${result.normalizedInput?.format}`);
      console.log(`  Intent: ${result.contract?.intent.type} (confidence: ${result.contract?.intent.confidence})`);
      console.log(`  Entities: ${result.entities?.length}`);
      console.log(`  Context relevance: ${result.context?.relevanceScore.toFixed(2)}`);
    } else {
      console.log(`✗ Failed`);
      console.log(`  Errors: ${result.errors?.map(e => e.message).join(', ')}`);
    }
    console.log();
  }

  // Query symbolic store
  const store = pipeline.getSymbolicStore();
  const allEntities = await store.all();
  console.log(`Total entities stored: ${allEntities.length}\n`);
}

/**
 * Goal-aware context aggregation example
 */
async function goalAwareExample() {
  console.log('=== Goal-Aware Context Aggregation Example ===\n');

  // Create goal-aware aggregator with custom constraints
  const aggregator = new GoalAwareContextAggregator();

  // Register goal-specific constraints
  aggregator.registerGoalConstraints('optimize-query-performance', [
    {
      type: 'has-query-entity',
      description: 'Must have at least one query entity',
      predicate: (context) => {
        return context.entities.some(e => e.type === 'query');
      },
    },
    {
      type: 'recent-entities',
      description: 'All entities must be from last hour',
      predicate: (context) => {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        return context.entities.every(e => e.timestamp.getTime() >= oneHourAgo);
      },
    },
  ]);

  // Build pipeline with goal-aware aggregator
  const pipeline = new PerceptionPipelineBuilder('goal-aware-pipeline')
    .withAdapters(new TextAdapter())
    .withContractValidator(new DefaultDataContractValidator())
    .withSymbolicStore(new InMemorySymbolicStore())
    .withContextAggregator(aggregator)
    .build();

  // Process query input
  const input: RawInput = {
    id: 'input-4',
    source: 'text',
    timestamp: new Date(),
    data: 'How can I optimize the database query performance?',
  };

  const result = await pipeline.process(input);

  if (result.success && result.context) {
    console.log('✓ Context created successfully');
    console.log(`  Goal ID: ${result.context.goalId || 'none'}`);
    console.log(`  Entities: ${result.context.entities.length}`);
    console.log(`  Constraints: ${result.context.constraints.length}`);
    console.log(`  Relevance score: ${result.context.relevanceScore.toFixed(2)}`);

    // Enrich the context
    const enriched = await aggregator.enrich(result.context);
    console.log('\nEnriched context:');
    console.log(`  Avg confidence: ${(enriched.metadata?.avgConfidence as number)?.toFixed(2)}`);
    console.log(`  Temporal pattern: ${enriched.metadata?.temporalPattern}`);
    console.log(`  Constraints satisfied: ${enriched.metadata?.constraintsSatisfied}`);
  }
  console.log();
}

/**
 * Custom adapter example
 */
async function customAdapterExample() {
  console.log('=== Custom Adapter Example ===\n');

  // Register custom adapter
  const validator = new DefaultDataContractValidator();

  // Register custom schema
  validator.registerSchema({
    name: 'order',
    version: 'v1',
    fields: {
      orderId: { type: 'string', required: true },
      status: { type: 'string', required: true },
      amount: { type: 'number', required: false },
    },
  });

  // Register custom intent extractor
  validator.registerIntentExtractor('custom', async (input) => {
    const data = input.data as { action?: string };
    return {
      type: 'custom-action',
      confidence: 0.95,
      parameters: { action: data.action || 'unknown' },
      description: 'Custom intent extraction',
    };
  });

  const pipeline = new PerceptionPipelineBuilder('custom-pipeline')
    .withAdapters(new JsonAdapter())
    .withContractValidator(validator)
    .withSymbolicStore(new InMemorySymbolicStore())
    .withContextAggregator(new DefaultContextAggregator())
    .build();

  const input: RawInput = {
    id: 'input-5',
    source: 'json',
    timestamp: new Date(),
    data: {
      orderId: 'ORD-789',
      status: 'processing',
      amount: 149.99,
    },
  };

  const result = await pipeline.process(input);

  if (result.success) {
    console.log('✓ Custom processing successful');
    console.log(`  Schema: ${result.contract?.schema}`);
    console.log(`  Intent: ${result.contract?.intent.type}`);
    console.log(`  Validated data:`, result.contract?.validatedData);
  }
  console.log();
}

/**
 * Multi-source aggregation example
 */
async function multiSourceAggregationExample() {
  console.log('=== Multi-Source Aggregation Example ===\n');

  const store = new InMemorySymbolicStore();
  const pipeline = new PerceptionPipelineBuilder('multi-source-pipeline')
    .withAdapters(
      new TextAdapter(),
      new JsonAdapter(),
      new EventAdapter(),
      new SensorAdapter()
    )
    .withContractValidator(new DefaultDataContractValidator())
    .withSymbolicStore(store)
    .withContextAggregator(new DefaultContextAggregator())
    .build();

  // Process inputs from different sources
  const inputs: RawInput[] = [
    {
      id: 'input-6',
      source: 'sensor',
      timestamp: new Date(),
      data: {
        sensorId: 'temp-sensor-1',
        readings: { temperature: 22.5, humidity: 60 },
      },
    },
    {
      id: 'input-7',
      source: 'event',
      timestamp: new Date(),
      data: {
        type: 'alert.temperature',
        payload: { sensorId: 'temp-sensor-1', threshold: 25 },
      },
    },
    {
      id: 'input-8',
      source: 'text',
      timestamp: new Date(),
      data: 'Check temperature sensor readings',
    },
  ];

  console.log('Processing inputs from multiple sources...\n');

  for (const input of inputs) {
    const result = await pipeline.process(input);
    if (result.success) {
      console.log(`✓ Processed ${input.source} input (${input.id})`);
    }
  }

  // Query stored entities
  console.log('\nQuerying stored entities:');
  
  const sensorEntities = await store.queryByType('observation');
  console.log(`  Sensor observations: ${sensorEntities.length}`);

  const eventEntities = await store.queryByType('event');
  console.log(`  Events: ${eventEntities.length}`);

  const queryEntities = await store.queryByType('query');
  console.log(`  Queries: ${queryEntities.length}`);

  const allEntities = await store.all();
  console.log(`  Total entities: ${allEntities.length}`);

  // Aggregate all entities into a context
  const aggregator = pipeline.getContextAggregator();
  const context = await aggregator.aggregate(allEntities);
  
  console.log('\nAggregated context:');
  console.log(`  Entity count: ${context.entities.length}`);
  console.log(`  Relevance score: ${context.relevanceScore.toFixed(2)}`);
  console.log(`  Entity types:`, context.metadata?.entityTypes);
  console.log();
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    await basicPipelineExample();
    await goalAwareExample();
    await customAdapterExample();
    await multiSourceAggregationExample();
    
    console.log('=== All examples completed successfully ===');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runExamples();
}

export {
  basicPipelineExample,
  goalAwareExample,
  customAdapterExample,
  multiSourceAggregationExample,
};
