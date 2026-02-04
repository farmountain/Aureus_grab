# How to Debug CRV Failures

This guide helps you understand, diagnose, and fix CRV (Circuit Reasoning Validation) failures in the Aureus Agentic OS.

## Table of Contents

1. [Understanding CRV Failures](#understanding-crv-failures)
2. [Failure Taxonomy](#failure-taxonomy)
3. [Reading Failure Messages](#reading-failure-messages)
4. [Common Failure Scenarios](#common-failure-scenarios)
5. [Debugging Workflow](#debugging-workflow)
6. [Observability and Monitoring](#observability-and-monitoring)

## Understanding CRV Failures

CRV failures occur when validation gates detect that a commit or state change violates safety or correctness constraints. When a failure occurs:

1. **The commit is blocked** (if `blockOnFailure: true`)
2. **A failure code is assigned** from the FailureTaxonomy
3. **Remediation hints are provided** to help fix the issue
4. **Observability events are emitted** for monitoring

### Key Components

- **ValidationResult**: Contains validation outcome, reason, confidence, failure_code, and remediation
- **GateResult**: Contains aggregated validation results with crv_status, failure_code, and remediation
- **FailureTaxonomy**: Standardized failure codes for consistent categorization

## Failure Taxonomy

CRV uses a stable set of failure codes to categorize all validation failures:

### 1. MISSING_DATA

**Description**: Required data fields are missing or null/undefined.

**Common Causes**:
- Input data is null or undefined
- Required fields are missing from objects
- Tool output is incomplete or empty

**Remediation**:
```typescript
// Check input data before validation
if (commit.data == null) {
  console.error('Commit data is null');
}

// Verify all required fields are present
const requiredFields = ['id', 'value', 'timestamp'];
for (const field of requiredFields) {
  if (!(field in commit.data)) {
    console.error(`Missing required field: ${field}`);
  }
}
```

**Example Failure**:
```
CRV Status: blocked
Failure Code: MISSING_DATA
Remediation: Ensure all required data fields are present. Check input schema and data extraction logic.
```

### 2. CONFLICT

**Description**: Data conflicts detected between expected and actual values, or type mismatches.

**Common Causes**:
- Type mismatches (expected string, got number)
- Expected vs actual value differences
- Non-monotonic changes (version decreased)
- Schema validation failures

**Remediation**:
```typescript
// Check data types
console.log('Expected type:', typeof expectedValue);
console.log('Actual type:', typeof actualValue);

// Use CompareOperator to find differences
const comparator = new CompareOperator();
const result = comparator.execute({
  expected: expectedData,
  actual: actualData
});
if (!result.match) {
  console.log('Differences:', result.diff);
}
```

**Example Failure**:
```
CRV Status: blocked
Failure Code: CONFLICT
Remediation: Resolve data conflicts by checking for inconsistencies between expected and actual values.
```

### 3. OUT_OF_SCOPE

**Description**: Data or operation is outside defined boundaries.

**Common Causes**:
- Data size exceeds limits
- Values outside acceptable ranges
- Operations not supported in current context

**Remediation**:
```typescript
// Check data size
const dataSize = JSON.stringify(commit.data).length;
console.log(`Data size: ${dataSize} bytes`);

// Implement data trimming or pagination
if (dataSize > maxSize) {
  // Split into smaller chunks or remove unnecessary data
  commit.data = trimData(commit.data, maxSize);
}
```

**Example Failure**:
```
CRV Status: blocked
Failure Code: OUT_OF_SCOPE
Remediation: Review the operation scope. The data or operation may be outside defined boundaries.
```

### 4. LOW_CONFIDENCE

**Description**: Validation confidence score is below threshold.

**Common Causes**:
- Insufficient context for validation
- Ambiguous data or requirements
- Multiple possible interpretations

**Remediation**:
```typescript
// Provide more context
commit.metadata = {
  ...commit.metadata,
  source: 'trusted-tool',
  validatedBy: 'human-operator'
};

// Use alternative validation methods
const altValidator = Validators.custom(
  'strict-validation',
  (c) => strictCheck(c),
  'Strict validation with high confidence'
);

// Or escalate for human review
const recoveryStrategy: RecoveryStrategy = {
  type: 'escalate',
  reason: 'Low confidence - requires human review'
};
```

**Example Failure**:
```
CRV Status: blocked
Failure Code: LOW_CONFIDENCE
Remediation: Increase confidence by providing more context, using alternative tools, or escalating for human review.
```

### 5. POLICY_VIOLATION

**Description**: Data violates policy constraints or business rules.

**Common Causes**:
- Constraint predicate returns false
- Business rule violations
- Invariant failures

**Remediation**:
```typescript
// Review the constraint that failed
console.log('Failed constraint:', result.metadata?.constraint);

// Check constraint predicate
const constraint = {
  name: 'positive-value',
  predicate: (data: any) => {
    console.log('Testing constraint with:', data);
    return data.value > 0;
  }
};

// Fix data or request policy exception
if (needsPolicyException) {
  // Document why exception is needed
  // Request approval from policy owner
}
```

**Example Failure**:
```
CRV Status: blocked
Failure Code: POLICY_VIOLATION
Remediation: Review policy constraints and ensure compliance. Update data or request policy exception.
```

### 6. TOOL_ERROR

**Description**: Tool execution or constraint evaluation threw an error.

**Common Causes**:
- Tool crashes or exceptions
- Runtime errors in constraint predicates
- Network failures
- Resource unavailability

**Remediation**:
```typescript
// Wrap constraint predicates in error handlers
const safeConstraint = {
  name: 'safe-check',
  predicate: (data: any) => {
    try {
      return data.value > 0 && data.value < 100;
    } catch (error) {
      console.error('Constraint error:', error);
      return false;
    }
  }
};

// Check tool logs
console.log('Tool execution logs:', toolLogs);

// Use retry strategy
const recoveryStrategy: RecoveryStrategy = {
  type: 'retry_alt_tool',
  toolName: 'backup-tool',
  maxRetries: 3
};
```

**Example Failure**:
```
CRV Status: blocked
Failure Code: TOOL_ERROR
Remediation: Check tool execution logs, verify tool configuration, and ensure proper error handling.
```

### 7. NON_DETERMINISM

**Description**: Operation exhibits non-deterministic behavior.

**Common Causes**:
- Idempotence violations in normalize operations
- Inconsistent outputs for same inputs
- Race conditions or timing issues

**Remediation**:
```typescript
// Test idempotence
const normalizer = new NormalizeOperator(normalizeFunc);
const input = testData;
const output1 = normalizer.execute(input);
const output2 = normalizer.execute(output1);
const output3 = normalizer.execute(output2);

console.log('Idempotent:', 
  JSON.stringify(output1) === JSON.stringify(output2) &&
  JSON.stringify(output2) === JSON.stringify(output3)
);

// Make operations deterministic
const deterministicNormalizer = new NormalizeOperator((input: any) => {
  // Sort keys, remove timestamps, use stable transformations
  return {
    ...input,
    timestamp: undefined, // Remove non-deterministic fields
    keys: Object.keys(input).sort() // Stable ordering
  };
});
```

**Example Failure**:
```
CRV Status: blocked
Failure Code: NON_DETERMINISM
Remediation: Investigate sources of non-determinism. Ensure idempotence and consistent input/output behavior.
```

## Reading Failure Messages

When a CRV gate blocks a commit, you'll see output like:

```
CRV Gate "Schema Gate" BLOCKED commit commit-123
CRV Status: blocked
Failure Code: MISSING_DATA
Remediation: Ensure all required data fields are present. Check input schema and data extraction logic.
Validation failures: [
  {
    valid: false,
    reason: 'Missing required field: email',
    confidence: 1,
    failure_code: 'MISSING_DATA',
    remediation: '...'
  }
]
```

**Key Fields**:
- **CRV Status**: `blocked`, `warning`, or `passed`
- **Failure Code**: One of the FailureTaxonomy codes
- **Remediation**: Actionable hint for fixing the issue
- **Validation failures**: Detailed failure information from each validator

## Common Failure Scenarios

### Scenario 1: Schema Mismatch

```typescript
// Problem: Field has wrong type
const commit = {
  id: 'commit-1',
  data: { id: '123', value: '42' } // value should be number
};

// Solution: Fix data type
commit.data = { id: '123', value: 42 };
```

### Scenario 2: Missing Required Data

```typescript
// Problem: Required field missing
const commit = {
  id: 'commit-1',
  data: { id: '123' } // Missing 'value' field
};

// Solution: Add required field
commit.data = { id: '123', value: 42 };
```

### Scenario 3: Constraint Violation

```typescript
// Problem: Value violates constraint
const commit = {
  id: 'commit-1',
  data: { value: -5 } // Must be positive
};

// Solution: Fix value or adjust constraint
commit.data = { value: 5 };

// Or use recovery strategy
const gate = new CRVGate({
  name: 'Value Gate',
  validators: [
    Validators.custom('positive', (c) => (c.data as any).value > 0)
  ],
  blockOnFailure: true,
  recoveryStrategy: {
    type: 'ask_user',
    prompt: 'Value must be positive. Please provide a valid value.'
  }
});
```

## Debugging Workflow

### Step 1: Identify the Failure

Check the failure code and CRV status in the logs:

```typescript
const result = await gate.validate(commit);
console.log('CRV Status:', result.crv_status);
console.log('Failure Code:', result.failure_code);
console.log('Remediation:', result.remediation);
```

### Step 2: Review Validation Results

Examine each validation result:

```typescript
for (const validation of result.validationResults) {
  if (!validation.valid) {
    console.log('Failed validator:', validation.reason);
    console.log('Failure code:', validation.failure_code);
    console.log('Metadata:', validation.metadata);
  }
}
```

### Step 3: Check Input Data

Inspect the commit data:

```typescript
console.log('Commit data:', JSON.stringify(commit.data, null, 2));
console.log('Previous state:', JSON.stringify(commit.previousState, null, 2));
console.log('Metadata:', commit.metadata);
```

### Step 4: Test Validators Individually

Isolate the failing validator:

```typescript
const validator = Validators.schema({ id: 'string', value: 'number' });
const result = await validator(commit);
console.log('Validator result:', result);
```

### Step 5: Apply Remediation

Follow the remediation hint:

```typescript
switch (result.failure_code) {
  case FailureTaxonomy.MISSING_DATA:
    // Add missing fields
    commit.data = { ...commit.data, missingField: defaultValue };
    break;
    
  case FailureTaxonomy.CONFLICT:
    // Fix type or value conflicts
    commit.data = normalizeData(commit.data);
    break;
    
  case FailureTaxonomy.POLICY_VIOLATION:
    // Fix constraint violations or request exception
    commit.data = fixConstraintViolation(commit.data);
    break;
    
  // ... handle other cases
}
```

### Step 6: Re-validate

Test the fix:

```typescript
const retryResult = await gate.validate(commit);
if (retryResult.passed) {
  console.log('✓ Validation passed after remediation');
} else {
  console.log('✗ Still failing:', retryResult.failure_code);
}
```

## Observability and Monitoring

### Monitoring CRV Status

Track CRV validation metrics:

```typescript
import { TelemetryCollector } from '@aureus/observability';

const telemetry = new TelemetryCollector();

// Record CRV status
telemetry.recordMetric('crv.validations.total', 1, {
  status: result.crv_status,
  gate: result.gateName
});

if (result.failure_code) {
  telemetry.recordMetric('crv.failures.total', 1, {
    code: result.failure_code,
    gate: result.gateName
  });
}
```

### Logging Best Practices

Always log CRV results with full context:

```typescript
telemetry.log('info', 'CRV validation completed', {
  commitId: commit.id,
  gateName: result.gateName,
  crv_status: result.crv_status,
  failure_code: result.failure_code,
  remediation: result.remediation,
  validationCount: result.validationResults.length,
  blockedCommit: result.blockedCommit
});
```

### Creating Alerts

Set up alerts for repeated failures:

```typescript
// Alert on high failure rate
if (failureRate > 0.1) {
  telemetry.log('error', 'High CRV failure rate detected', {
    failureRate,
    commonFailureCode: mostCommonFailureCode,
    timeWindow: '5m'
  });
}

// Alert on specific failure types
if (result.failure_code === FailureTaxonomy.TOOL_ERROR) {
  telemetry.log('error', 'Tool error in CRV validation', {
    tool: result.metadata?.tool,
    error: result.metadata?.error
  });
}
```

### Dashboards

Track key metrics:

- **CRV Status Distribution**: blocked, warning, passed
- **Failure Code Distribution**: MISSING_DATA, CONFLICT, etc.
- **Gate Performance**: validation time per gate
- **Recovery Success Rate**: % of recoveries that succeed
- **Top Failing Gates**: which gates block most frequently

## Tips and Best Practices

1. **Always check failure_code**: Don't just look at the reason string
2. **Use structured logging**: Include crv_status, failure_code, and remediation
3. **Test validators in isolation**: Easier to debug individual validators
4. **Review operator invariants**: Understand what guarantees each operator provides
5. **Use property-based tests**: Verify invariants hold for random inputs
6. **Monitor trends**: Track failure codes over time to identify systemic issues
7. **Document recovery strategies**: Explain why each recovery strategy is chosen
8. **Keep validators simple**: Complex validators are harder to debug
9. **Add context to metadata**: Include source, timestamp, validation context
10. **Test recovery strategies**: Ensure recovery actually fixes the issue

## Getting Help

If you're stuck debugging a CRV failure:

1. Check the [CRV README](../README.md) for operator documentation
2. Review property-based tests in `tests/property-based.test.ts`
3. Look at example usage in `examples/crv-usage.ts`
4. Open an issue with:
   - CRV status and failure code
   - Full validation results
   - Commit data (sanitized)
   - Recovery strategy attempted

## Summary

CRV failures are designed to be debuggable:
- **Stable failure codes** for consistent categorization
- **Remediation hints** for actionable guidance
- **Observability fields** for monitoring and alerting
- **Property-based tests** to verify invariants

By following this guide and using the FailureTaxonomy, you can quickly diagnose and fix CRV validation failures.
