# CRV (Circuit Reasoning Validation)

Circuit reasoning validation operators & gates for ensuring safe and verified AI agent execution.

## Overview

The CRV package provides a comprehensive validation framework for AI agents that guarantees commits and state changes meet safety and correctness criteria before being applied. It implements the **Verification** invariant (invariant 3) which states: "CRV gates block invalid commits."

## Documentation

- **[Debugging CRV Failures](./docs/debugging-crv-failures.md)** - Complete guide to understanding, diagnosing, and fixing CRV validation failures
- **[Property-Based Tests](./tests/property-based.test.ts)** - Examples of invariant testing

## Core Concepts

### Operators

Operators are the building blocks of CRV validation pipelines. Each operator implements the `Operator` interface and defines:

- **Input Schema**: JSON schema defining expected input format
- **Output Schema**: JSON schema defining output format
- **Invariants**: Rules that must hold during operator execution
- **Oracle Checks**: Deterministic validators that verify operator output

### Gates

Gates are validation checkpoints that run validators on commits. When configured with `blockOnFailure: true`, gates prevent invalid commits from being applied to the system.

### Verification Pipelines

Verification pipelines execute a sequence of operators with recovery strategies. They run after each step/tool response to validate output and apply recovery when validation fails.

## Failure Taxonomy

CRV uses a stable set of failure codes to categorize validation failures:

- **MISSING_DATA**: Required data fields are missing or null/undefined
- **CONFLICT**: Data conflicts or type mismatches detected
- **OUT_OF_SCOPE**: Data or operation outside defined boundaries
- **LOW_CONFIDENCE**: Validation confidence score below threshold
- **POLICY_VIOLATION**: Data violates policy constraints or business rules
- **TOOL_ERROR**: Tool execution or constraint evaluation threw an error
- **NON_DETERMINISM**: Operation exhibits non-deterministic behavior

Each failure code includes remediation hints to help fix the issue. See [Debugging CRV Failures](./docs/debugging-crv-failures.md) for detailed guidance.

## CRV Taxonomy

### Core Operators

#### 1. Extract Operator
Extracts data from tool responses or commits.

**Purpose**: Parse and extract relevant data from complex tool outputs.

**Invariants**:
- Input must not be null or undefined

**Oracle Checks**:
- Extracted data should not be empty

**Example**:
\`\`\`typescript
const extractor = new ExtractOperator((input: any) => ({
  id: input.response.id,
  value: input.response.value
}));
\`\`\`

#### 2. Normalize Operator
Normalizes data to a standard format.

**Purpose**: Ensure data consistency across different sources and formats.

**Invariants**:
- Idempotence: Normalizing twice produces same result

**Oracle Checks**:
- Output matches expected normalized format

**Example**:
\`\`\`typescript
const normalizer = new NormalizeOperator((input: any) => ({
  id: String(input.id),
  value: Number(input.value),
  timestamp: new Date(input.timestamp).toISOString()
}));
\`\`\`

#### 3. Compare Operator
Compares expected vs actual data.

**Purpose**: Detect differences between expected and actual states.

**Invariants**:
- Symmetry: Compare(A, B) inverse of Compare(B, A)

**Oracle Checks**:
- Match flag consistent with data equality

**Example**:
\`\`\`typescript
const comparator = new CompareOperator();
const result = comparator.execute({
  expected: { value: 42 },
  actual: { value: 99 }
});
// result: { match: false, diff: { expected: {...}, actual: {...} } }
\`\`\`

#### 4. Decide Operator
Makes decisions based on validation results.

**Purpose**: Determine whether to allow, block, or escalate based on validation outcomes.

**Invariants**:
- Decision determinism: Same inputs produce same decision

**Oracle Checks**:
- Decision has non-empty reason

**Default Logic**:
- Low confidence (< 0.5) → Escalate
- Has invalid results → Block
- All valid → Allow

**Example**:
\`\`\`typescript
const decider = new DecideOperator();
const decision = decider.execute([
  { valid: true, confidence: 1.0 },
  { valid: false, reason: 'Schema mismatch', confidence: 1.0 }
]);
// decision: { decision: 'block', reason: 'Validation failed: Schema mismatch' }
\`\`\`

#### 5. VerifySchema Operator
Enhanced schema validation with detailed reporting.

**Purpose**: Validate data against JSON schemas with comprehensive error messages.

**Example**:
\`\`\`typescript
const verifier = new VerifySchemaOperator();
const result = verifier.execute({
  data: { id: '123', value: 42 },
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      value: { type: 'number' }
    },
    required: ['id', 'value']
  }
});
\`\`\`

#### 6. VerifyConstraints Operator
Validates invariants and constraints.

**Purpose**: Check that data satisfies business logic constraints.

**Example**:
\`\`\`typescript
const verifier = new VerifyConstraintsOperator();
const result = verifier.execute({
  data: { min: 10, max: 20 },
  constraints: [
    {
      name: 'min-less-than-max',
      predicate: (data: any) => data.min < data.max
    },
    {
      name: 'positive-values',
      predicate: (data: any) => data.min > 0 && data.max > 0
    }
  ]
});
\`\`\`

## Recovery Strategies

When validation fails, CRV can apply recovery strategies:

### 1. Retry with Alternative Tool
Retry the operation using an alternative tool.

\`\`\`typescript
{
  type: 'retry_alt_tool',
  toolName: 'alternative-tool',
  maxRetries: 3
}
\`\`\`

### 2. Ask User
Prompt the user for input or clarification.

\`\`\`typescript
{
  type: 'ask_user',
  prompt: 'Validation failed. Please provide correct data.'
}
\`\`\`

### 3. Escalate
Escalate to human operator for review.

\`\`\`typescript
{
  type: 'escalate',
  reason: 'Critical constraint violation detected'
}
\`\`\`

### 4. Ignore
Proceed despite validation failure (with justification).

\`\`\`typescript
{
  type: 'ignore',
  justification: 'Non-critical validation - proceeding anyway'
}
\`\`\`

## Built-in Validators

CRV provides a rich set of built-in validators accessible through the `Validators` class. All validators return confidence scores and structured failure metadata.

### Basic Validators

#### `notNull()`
Validates that commit data is not null or undefined.

**Returns**: Confidence 1.0
**Failure Code**: `MISSING_DATA`

\`\`\`typescript
Validators.notNull()
\`\`\`

#### `schema(expectedSchema: Record<string, string>)`
Validates that commit data matches expected schema.

**Returns**: Confidence 1.0
**Failure Code**: `MISSING_DATA` or `CONFLICT`

\`\`\`typescript
Validators.schema({
  id: 'string',
  value: 'number',
  timestamp: 'string'
})
\`\`\`

#### `monotonic()`
Validates that commit represents a monotonic change (no data loss). Simple version field check.

**Returns**: Confidence 0.9
**Failure Code**: `CONFLICT`

\`\`\`typescript
Validators.monotonic()
\`\`\`

#### `maxSize(maxBytes: number)`
Validates that data size is within limits.

**Returns**: Confidence 1.0
**Failure Code**: `OUT_OF_SCOPE`

\`\`\`typescript
Validators.maxSize(1024) // Max 1KB
\`\`\`

#### `custom(name, predicate, reason?, failureCode?)`
Custom validator from predicate function.

**Returns**: Confidence 1.0
**Failure Code**: Configurable (default: `POLICY_VIOLATION`)

\`\`\`typescript
Validators.custom(
  'positive-value',
  (commit) => (commit.data as any).value > 0,
  'Value must be positive'
)
\`\`\`

### Advanced Validators

#### `statisticalBounds(field: string, bounds: { min?, max?, mean?, stddev?, tolerance? })`
Validates that numeric field values are within statistical bounds. Supports both absolute (min/max) and statistical (mean ± σ) bounds.

**Returns**: 
- Confidence 1.0 for min/max violations
- Variable confidence (0-1) for statistical bound violations based on z-score
**Failure Code**: `OUT_OF_SCOPE`, `MISSING_DATA`, or `CONFLICT`
**Metadata**: `{ field, value, bounds, zScore?, violation? }`

\`\`\`typescript
// Absolute bounds
Validators.statisticalBounds('temperature', {
  min: 0,
  max: 100
})

// Statistical bounds (mean ± 3σ by default)
Validators.statisticalBounds('responseTime', {
  mean: 250,      // milliseconds
  stddev: 50,     // milliseconds
  tolerance: 3    // number of standard deviations (default: 3)
})

// Combined bounds
Validators.statisticalBounds('price', {
  min: 0,
  max: 1000,
  mean: 500,
  stddev: 100,
  tolerance: 2
})
\`\`\`

**Confidence Scoring**: For statistical bounds, confidence decreases as the value moves further outside the tolerance range.

#### `anomalyDetection(field: string, historicalData: number[], threshold: number = 3.0)`
Validates that a numeric field value is not an anomaly using z-score detection.

**Returns**: 
- Confidence 0.5 for insufficient data
- Variable confidence (0.7-1.0) for normal values
- Variable confidence (0-1) for anomalies based on z-score distance
**Failure Code**: `OUT_OF_SCOPE`, `MISSING_DATA`, or `CONFLICT`
**Metadata**: `{ field, value, mean, stddev, zScore, threshold, historicalDataSize }`

\`\`\`typescript
const historicalResponseTimes = [245, 250, 248, 252, 249, 251];

Validators.anomalyDetection(
  'responseTime',
  historicalResponseTimes,
  3.0  // z-score threshold (default: 3.0)
)
\`\`\`

**Z-Score Threshold**: 
- 2.0 = ~95% of values (more sensitive)
- 3.0 = ~99.7% of values (balanced)
- 4.0 = ~99.99% of values (less sensitive)

**Confidence Scoring**: 
- For anomalies: Confidence decreases as z-score increases beyond threshold
- For normal values: Confidence is high (0.7-1.0) based on how close to mean

#### `crossFieldConsistency(rules: Array<{ name, fields, predicate, message? }>)`
Validates consistency between related fields using custom rules.

**Returns**: Confidence 1.0 for deterministic rules, 0.5 for rule evaluation errors
**Failure Code**: `CONFLICT`, `MISSING_DATA`, or `TOOL_ERROR`
**Metadata**: `{ rule, fields, values, missingFields? }`

\`\`\`typescript
Validators.crossFieldConsistency([
  {
    name: 'start-before-end',
    fields: ['startDate', 'endDate'],
    predicate: (values) => {
      const start = new Date(values.startDate as string).getTime();
      const end = new Date(values.endDate as string).getTime();
      return start < end;
    },
    message: 'Start date must be before end date'
  },
  {
    name: 'total-equals-sum',
    fields: ['item1', 'item2', 'total'],
    predicate: (values) => 
      (values.item1 as number) + (values.item2 as number) === (values.total as number),
    message: 'Total must equal sum of items'
  },
  {
    name: 'price-within-range',
    fields: ['price', 'minPrice', 'maxPrice'],
    predicate: (values) => {
      const p = values.price as number;
      const min = values.minPrice as number;
      const max = values.maxPrice as number;
      return p >= min && p <= max;
    }
  }
])
\`\`\`

**Use Cases**:
- Date range validation
- Financial calculation verification
- Business rule enforcement
- Referential integrity checks

#### `temporalMonotonic(options?: { timestampField?, versionField?, allowEqual?, maxTimeDrift? })`
Enhanced monotonic validator with timestamp validation and drift detection.

**Returns**: 
- Confidence 1.0 for first commit or clear violations
- Confidence 0.95 for valid temporal progression
- Confidence 0.8 for time drift violations
**Failure Code**: `CONFLICT` or `NON_DETERMINISM`
**Metadata**: `{ prevVersion?, currVersion?, prevTimestamp?, currTimestamp?, timeDiff?, drift?, isFirstCommit? }`

\`\`\`typescript
// Default configuration (checks 'version' and 'timestamp' fields)
Validators.temporalMonotonic()

// Custom timestamp field
Validators.temporalMonotonic({
  timestampField: 'createdAt',
  versionField: 'revision'
})

// Allow equal timestamps (non-strict monotonic)
Validators.temporalMonotonic({
  timestampField: 'updatedAt',
  allowEqual: true
})

// Detect excessive time drift
Validators.temporalMonotonic({
  timestampField: 'timestamp',
  maxTimeDrift: 60000  // 60 seconds max
})
\`\`\`

**Timestamp Support**:
- ISO 8601 strings: `'2024-01-01T00:00:00Z'`
- Date objects: `new Date()`
- Unix timestamps: `1609459200000`

**Options**:
- `timestampField`: Field name for timestamp (default: `'timestamp'`)
- `versionField`: Field name for version (default: `'version'`)
- `allowEqual`: Allow equal timestamps/versions (default: `false`)
- `maxTimeDrift`: Maximum allowed time drift in milliseconds (default: `undefined`)

**Use Cases**:
- Event ordering validation
- Audit trail verification
- Clock synchronization checks
- Preventing time-based attacks

## Usage Examples

### Basic Gate with Validators

\`\`\`typescript
import { CRVGate, Validators } from '@aureus/crv';

const gate = new CRVGate({
  name: 'State Validation',
  validators: [
    Validators.notNull(),
    Validators.schema({ id: 'string', value: 'number' }),
    Validators.monotonic()
  ],
  blockOnFailure: true
});

const result = await gate.validate(commit);
if (result.blockedCommit) {
  console.log('Commit blocked:', result.validationResults);
}
\`\`\`

### Verification Pipeline

\`\`\`typescript
import { 
  VerificationPipeline,
  ExtractOperator,
  VerifySchemaOperator,
  DecideOperator,
  MockRecoveryExecutor
} from '@aureus/crv';

const pipeline = new VerificationPipeline(
  {
    name: 'Tool Response Validation',
    operators: [
      new ExtractOperator((input: any) => input.tool_response),
      new VerifySchemaOperator(),
      new DecideOperator()
    ],
    recoveryStrategy: {
      type: 'retry_alt_tool',
      toolName: 'backup-tool',
      maxRetries: 3
    },
    stopOnFirstFailure: true
  },
  new MockRecoveryExecutor()
);

const result = await pipeline.verify(commit);
\`\`\`

### Advanced Validators in Action

#### Statistical Bounds Validation
\`\`\`typescript
import { CRVGate, Validators } from '@aureus/crv';

const gate = new CRVGate({
  name: 'Temperature Monitoring',
  validators: [
    Validators.statisticalBounds('temperature', {
      min: -40,
      max: 125,
      mean: 22,
      stddev: 5,
      tolerance: 3  // ±3σ from mean
    })
  ],
  blockOnFailure: true,
  requiredConfidence: 0.8
});

const commit = {
  id: 'sensor-reading-1',
  data: { temperature: 45 }  // Unusual but within 3σ
};

const result = await gate.validate(commit);
// result.validationResults[0].metadata contains:
// { field, value, bounds, zScore, lowerBound, upperBound }
\`\`\`

#### Anomaly Detection
\`\`\`typescript
import { CRVGate, Validators } from '@aureus/crv';

// Historical API response times in milliseconds
const historicalResponseTimes = [245, 250, 248, 252, 249, 251, 247];

const gate = new CRVGate({
  name: 'Response Time Anomaly Detection',
  validators: [
    Validators.anomalyDetection('responseTime', historicalResponseTimes, 2.5)
  ],
  blockOnFailure: true,
  requiredConfidence: 0.7
});

const commit = {
  id: 'api-call-1',
  data: { responseTime: 450 }  // Potential anomaly
};

const result = await gate.validate(commit);
// result.validationResults[0] contains:
// { valid, confidence, metadata: { zScore, mean, stddev, ... } }
\`\`\`

#### Cross-Field Consistency
\`\`\`typescript
import { CRVGate, Validators } from '@aureus/crv';

const gate = new CRVGate({
  name: 'Order Validation',
  validators: [
    Validators.crossFieldConsistency([
      {
        name: 'subtotal-plus-tax',
        fields: ['subtotal', 'tax', 'total'],
        predicate: (v) => 
          Math.abs((v.subtotal as number) + (v.tax as number) - (v.total as number)) < 0.01,
        message: 'Total must equal subtotal plus tax'
      },
      {
        name: 'positive-amounts',
        fields: ['subtotal', 'tax', 'total'],
        predicate: (v) => 
          (v.subtotal as number) >= 0 && 
          (v.tax as number) >= 0 && 
          (v.total as number) >= 0,
        message: 'All amounts must be non-negative'
      }
    ])
  ],
  blockOnFailure: true
});

const commit = {
  id: 'order-1',
  data: {
    subtotal: 100.00,
    tax: 8.50,
    total: 108.50
  }
};

const result = await gate.validate(commit);
\`\`\`

#### Temporal Monotonicity
\`\`\`typescript
import { CRVGate, Validators } from '@aureus/crv';

const gate = new CRVGate({
  name: 'Event Stream Validation',
  validators: [
    Validators.temporalMonotonic({
      timestampField: 'eventTime',
      versionField: 'sequenceNumber',
      allowEqual: false,
      maxTimeDrift: 5000  // 5 seconds max drift
    })
  ],
  blockOnFailure: true
});

const commit = {
  id: 'event-42',
  data: {
    eventTime: '2024-01-02T10:30:00Z',
    sequenceNumber: 42,
    payload: { /* ... */ }
  },
  previousState: {
    eventTime: '2024-01-02T10:29:55Z',
    sequenceNumber: 41
  }
};

const result = await gate.validate(commit);
// result.validationResults[0].metadata contains:
// { prevTimestamp, currTimestamp, timeDiff, prevVersion, currVersion }
\`\`\`

### Combining Multiple Advanced Validators
\`\`\`typescript
import { CRVGate, Validators } from '@aureus/crv';

const gate = new CRVGate({
  name: 'Comprehensive Data Validation',
  validators: [
    // Schema check
    Validators.schema({
      userId: 'string',
      timestamp: 'string',
      temperature: 'number',
      humidity: 'number'
    }),
    // Statistical bounds
    Validators.statisticalBounds('temperature', {
      min: -40,
      max: 125,
      mean: 22,
      stddev: 5
    }),
    // Anomaly detection
    Validators.anomalyDetection('humidity', [45, 47, 48, 46, 49], 2.5),
    // Cross-field consistency
    Validators.crossFieldConsistency([
      {
        name: 'humidity-temp-relationship',
        fields: ['temperature', 'humidity'],
        predicate: (v) => {
          // High temp usually means lower humidity
          const temp = v.temperature as number;
          const humid = v.humidity as number;
          if (temp > 30 && humid > 80) return false;
          return true;
        }
      }
    ]),
    // Temporal monotonicity
    Validators.temporalMonotonic({
      timestampField: 'timestamp'
    })
  ],
  blockOnFailure: true,
  requiredConfidence: 0.8
});
\`\`\`

### Gate Chain

\`\`\`typescript
import { CRVGate, GateChain, Validators } from '@aureus/crv';

const chain = new GateChain();

chain.addGate(new CRVGate({
  name: 'Schema Gate',
  validators: [Validators.schema({ /* ... */ })],
  blockOnFailure: true
}));

chain.addGate(new CRVGate({
  name: 'Constraint Gate',
  validators: [
    Validators.custom('positive', (commit) => {
      return (commit.data as any).value > 0;
    })
  ],
  blockOnFailure: true
}));

const results = await chain.validate(commit);
if (chain.wouldBlock(results)) {
  console.log('Commit blocked by gate chain');
}
\`\`\`

## Authoring Custom Operators

To create a custom operator, extend `BaseOperator`:

\`\`\`typescript
import { BaseOperator, JSONSchema, Invariant, OracleCheck } from '@aureus/crv';

class MyCustomOperator extends BaseOperator<MyInput, MyOutput> {
  constructor() {
    super(
      'MyOperator',
      'Description of what this operator does',
      // Input schema
      {
        type: 'object',
        properties: { /* ... */ },
        required: ['field1']
      },
      // Output schema
      {
        type: 'object',
        properties: { /* ... */ }
      },
      // Invariants
      [
        {
          name: 'my-invariant',
          description: 'Invariant description',
          predicate: (input, output) => {
            // Return true if invariant holds
            return true;
          }
        }
      ],
      // Oracle checks
      [
        {
          name: 'my-check',
          description: 'Check description',
          check: (input, output) => ({
            valid: true,
            reason: 'Check passed',
            confidence: 1.0
          })
        }
      ]
    );
  }

  execute(input: MyInput): MyOutput {
    // Validate input
    const validation = this.validateInput(input);
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    // Your operator logic here
    const output = { /* ... */ };

    return output;
  }
}
\`\`\`

## Integration with Kernel

To integrate CRV gates into the kernel commit path, add validation before state commits:

\`\`\`typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { CRVGate, Validators } from '@aureus/crv';

// Create CRV gate
const crvGate = new CRVGate({
  name: 'Pre-Commit Validation',
  validators: [
    Validators.notNull(),
    Validators.schema({ /* expected state schema */ })
  ],
  blockOnFailure: true,
  recoveryStrategy: {
    type: 'escalate',
    reason: 'State validation failed'
  }
});

// In orchestrator, validate before commit
const commit = {
  id: 'commit-1',
  data: taskState.result,
  previousState: oldState
};

const gateResult = await crvGate.validate(commit);
if (gateResult.blockedCommit) {
  // Handle blocked commit - apply recovery strategy
  throw new Error(\`Commit blocked: \${gateResult.validationResults.map(r => r.reason).join(', ')}\`);
}

// Proceed with commit
await stateStore.saveTaskState(workflowId, taskState);
\`\`\`

## Testing

The package includes comprehensive tests demonstrating:

- Failing schema validation cases
- Constraint violation detection
- Recovery strategy application
- Operator invariant checking
- Oracle check validation
- Pipeline execution with recovery

Run tests with:

\`\`\`bash
npm test
\`\`\`

## Best Practices

1. **Always define schemas**: Explicit input/output schemas catch errors early
2. **Use meaningful invariants**: Invariants document operator assumptions
3. **Provide clear oracle checks**: Deterministic checks ensure operator correctness
4. **Choose appropriate recovery**: Match recovery strategy to failure severity
5. **Test failure cases**: Validate that operators correctly detect and report failures
6. **Chain gates carefully**: Order gates from cheapest to most expensive validation
7. **Log blocked commits**: Ensure auditability by logging all blocked commits

## License

MIT

