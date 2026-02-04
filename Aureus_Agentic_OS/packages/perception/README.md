# @aureus/perception

Perception pipeline for input normalization, validation, and entity extraction in Aureus Agentic OS.

## Overview

The perception package provides a modular pipeline for processing raw inputs through multiple stages:

1. **Perception Adapter** - Normalizes raw input from different sources (text, JSON, events, sensors)
2. **Data Contract** - Validates schema and extracts intent from normalized input
3. **Symbolic Store** - Stores structured entities extracted from validated data
4. **Hypothesis Context** - Aggregates entities and relationships for hypothesis reasoning

All stages support CRV (Circuit Reasoning Validation) for enforcing validation constraints.

## Architecture

```
Raw Input → Perception Adapter → Data Contract → Entity Extraction → Symbolic Store → Context Aggregation
                                       ↓                 ↓                                      ↓
                                    CRV Gate         CRV Gate                              CRV Gate
```

## Installation

```bash
npm install @aureus/perception
```

## Usage

### Basic Pipeline Setup

```typescript
import {
  PerceptionPipelineBuilder,
  TextAdapter,
  JsonAdapter,
  DefaultDataContractValidator,
  InMemorySymbolicStore,
  DefaultContextAggregator,
  RawInput,
} from '@aureus/perception';
import { CRVGate, Validators } from '@aureus/crv';

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
const pipeline = new PerceptionPipelineBuilder('main-pipeline')
  .withAdapters(new TextAdapter(), new JsonAdapter())
  .withContractValidator(new DefaultDataContractValidator())
  .withSymbolicStore(new InMemorySymbolicStore())
  .withContextAggregator(new DefaultContextAggregator())
  .withCRVValidation(crvGate, 'perception-gate')
  .build();

// Process raw input
const rawInput: RawInput = {
  id: 'input-1',
  source: 'text',
  timestamp: new Date(),
  data: 'What is the status of order #12345?',
};

const result = await pipeline.process(rawInput);

if (result.success) {
  console.log('Normalized Input:', result.normalizedInput);
  console.log('Data Contract:', result.contract);
  console.log('Extracted Entities:', result.entities);
  console.log('Hypothesis Context:', result.context);
} else {
  console.error('Pipeline errors:', result.errors);
}
```

### Custom Adapter

```typescript
import { CustomAdapter, RawInput, NormalizedInput } from '@aureus/perception';

const customAdapter = new CustomAdapter(
  'MyCustomAdapter',
  ['custom-source'],
  async (input: RawInput): Promise<NormalizedInput> => {
    // Custom normalization logic
    return {
      id: input.id,
      source: input.source,
      timestamp: input.timestamp,
      format: 'custom',
      data: {
        processed: input.data,
        customField: 'custom value',
      },
      schema: 'custom-v1',
      metadata: input.metadata,
    };
  }
);

pipeline.getAdapterRegistry().register(customAdapter);
```

### Custom Schema and Intent Extraction

```typescript
import { DefaultDataContractValidator, SchemaDefinition } from '@aureus/perception';

const validator = new DefaultDataContractValidator();

// Register custom schema
const customSchema: SchemaDefinition = {
  name: 'order',
  version: 'v1',
  fields: {
    orderId: { type: 'string', required: true },
    status: { type: 'string', required: true },
    amount: { type: 'number', required: false },
  },
};

validator.registerSchema(customSchema);

// Register custom intent extractor
validator.registerIntentExtractor('custom', async (input) => {
  return {
    type: 'custom-intent',
    confidence: 0.9,
    parameters: { data: input.data },
    description: 'Custom intent extraction',
  };
});
```

### Goal-Aware Context Aggregation

```typescript
import { GoalAwareContextAggregator } from '@aureus/perception';

const aggregator = new GoalAwareContextAggregator();

// Register goal-specific constraints
aggregator.registerGoalConstraints('optimize-query', [
  {
    type: 'performance-requirement',
    description: 'Query entities must have performance metrics',
    predicate: (context) => {
      return context.entities.some(e => 
        e.type === 'query' && 
        e.properties.performanceMetrics !== undefined
      );
    },
  },
]);

// Use in pipeline
const pipeline = new PerceptionPipelineBuilder('goal-aware-pipeline')
  .withAdapters(new JsonAdapter())
  .withContractValidator(new DefaultDataContractValidator())
  .withSymbolicStore(new InMemorySymbolicStore())
  .withContextAggregator(aggregator)
  .build();
```

### StateStore-backed Symbolic Store

```typescript
import { StateStoreSymbolicStore } from '@aureus/perception';
import { InMemoryStateStore } from '@aureus/world-model';

// Create state store
const stateStore = new InMemoryStateStore();

// Create symbolic store backed by state store
const symbolicStore = new StateStoreSymbolicStore(stateStore);

const pipeline = new PerceptionPipelineBuilder('persisted-pipeline')
  .withAdapters(new JsonAdapter())
  .withContractValidator(new DefaultDataContractValidator())
  .withSymbolicStore(symbolicStore)
  .withContextAggregator(new DefaultContextAggregator())
  .build();
```

## Core Concepts

### Perception Adapter

Adapters normalize raw inputs from different sources into a standard format. Built-in adapters:

- **TextAdapter**: Text-based inputs (console, CLI, strings)
- **JsonAdapter**: JSON data from APIs, webhooks
- **EventAdapter**: Event streams, message queues
- **SensorAdapter**: IoT sensors, robotics telemetry
- **CustomAdapter**: User-defined adapters

### Data Contract

Validates normalized input against schemas and extracts intent. Features:

- Schema validation with type checking
- CRV validator integration
- Intent extraction (query, command, observation, event)
- Confidence scoring

### Symbolic Store

Stores extracted entities in a structured format. Implementations:

- **InMemorySymbolicStore**: Fast in-memory storage
- **StateStoreSymbolicStore**: Persistent storage backed by world-model StateStore

Query capabilities:
- By type
- By source
- By relationships
- Find related entities

### Hypothesis Context

Aggregates entities and relationships for hypothesis reasoning. Features:

- Entity aggregation
- Relationship extraction
- Constraint validation
- Relevance scoring
- Temporal pattern analysis
- Context enrichment

## Integration with Hypothesis Package

```typescript
import { HypothesisManager } from '@aureus/hypothesis';
import { PerceptionPipeline } from '@aureus/perception';

// Create perception pipeline
const pipeline = new PerceptionPipelineBuilder('hypothesis-integration')
  .withAdapters(new JsonAdapter())
  .withContractValidator(new DefaultDataContractValidator())
  .withSymbolicStore(new InMemorySymbolicStore())
  .withContextAggregator(new DefaultContextAggregator())
  .build();

// Create hypothesis manager
const hypothesisManager = new HypothesisManager({
  maxConcurrentHypotheses: 3,
});

// Register goal
hypothesisManager.registerGoal({
  id: 'goal-1',
  description: 'Process customer orders',
  successCriteria: [
    {
      id: 'sc-1',
      description: 'All orders validated',
      validator: (state) => true,
      weight: 1.0,
    },
  ],
});

// Process input and use context for hypothesis
const result = await pipeline.process(rawInput);

if (result.success && result.context) {
  // Create hypothesis with context
  const hypothesis = await hypothesisManager.createHypothesis(
    'goal-1',
    'Process order using context',
    [
      {
        id: 'action-1',
        type: 'process-order',
        parameters: {
          context: result.context,
          entities: result.entities,
        },
      },
    ]
  );
}
```

## CRV Validation

The pipeline integrates with CRV at every stage:

```typescript
import { CRVGate, Validators } from '@aureus/crv';

// Create comprehensive CRV gate
const gate = new CRVGate({
  name: 'perception-gate',
  validators: [
    Validators.notNull(),
    Validators.schema({
      id: 'string',
      data: 'object',
    }),
    Validators.custom('confidence-check', (commit) => {
      const data = commit.data as { confidence?: number };
      if (data.confidence !== undefined && data.confidence < 0.5) {
        return {
          valid: false,
          reason: 'Confidence too low',
          confidence: 0.0,
        };
      }
      return { valid: true };
    }),
  ],
  blockOnFailure: true,
  requiredConfidence: 0.8,
});

const pipeline = new PerceptionPipelineBuilder('validated-pipeline')
  .withAdapters(new TextAdapter())
  .withContractValidator(new DefaultDataContractValidator())
  .withSymbolicStore(new InMemorySymbolicStore())
  .withContextAggregator(new DefaultContextAggregator())
  .withCRVValidation(gate, 'perception-gate')
  .build();
```

## API Reference

### Types

- `RawInput` - Raw input from any source
- `NormalizedInput` - Normalized input after adapter processing
- `Intent` - Extracted intent from input
- `DataContract` - Validated data with schema and intent
- `SymbolicEntity` - Structured entity with properties and relationships
- `HypothesisContext` - Aggregated context for hypothesis reasoning

### Classes

- `PerceptionPipeline` - Main pipeline orchestrator
- `PerceptionPipelineBuilder` - Builder for constructing pipelines
- `AdapterRegistry` - Registry for managing adapters
- `DefaultDataContractValidator` - Default contract validator
- `DefaultEntityExtractor` - Default entity extractor
- `InMemorySymbolicStore` - In-memory entity storage
- `StateStoreSymbolicStore` - Persistent entity storage
- `DefaultContextAggregator` - Default context aggregator
- `GoalAwareContextAggregator` - Goal-aware context aggregator

## Testing

```bash
npm test
```

## License

See root LICENSE file.
