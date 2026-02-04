# Reflexion Policy

## Overview

Reflexion is Aureus Agentic OS's self-healing system that enables agents to learn from failures and automatically propose and test corrective actions. When workflows fail, Reflexion generates structured postmortems, proposes fixes, and validates them in a safe sandbox environment before promoting them to production.

## Architecture

### Components

1. **FailureAnalyzer**: Analyzes failures and generates structured postmortems
2. **SandboxExecutor**: Executes proposed fixes in isolation with comprehensive validation
3. **ReflexionEngine**: Orchestrates the entire reflexion loop
4. **Chaos Tests**: Validate fixes under various failure scenarios

### Data Flow

```
Workflow Failure
    ↓
FailureAnalyzer
    ↓
Structured Postmortem
    ↓
Proposed Fix Generation
    ↓
SandboxExecutor
    ├→ Goal-Guard FSM Validation
    ├→ CRV Validation
    └→ Chaos Tests
        ↓
Fix Promotion Decision
    ↓
Apply Fix (if approved)
```

## Failure Taxonomy

Reflexion classifies failures into the following categories:

1. **TOOL_ERROR**: Tool execution failures
   - **Fix Strategy**: Alternate tool selection
   - **Example**: Replace failed data-fetcher with data-fetcher-v2

2. **LOW_CONFIDENCE**: Results with insufficient confidence
   - **Fix Strategy**: CRV threshold adjustment
   - **Example**: Reduce confidence threshold from 0.8 to 0.72

3. **CONFLICT**: Data conflicts or inconsistencies
   - **Fix Strategy**: CRV threshold adjustment
   - **Example**: Adjust conflict detection sensitivity

4. **NON_DETERMINISM**: Race conditions or timing issues
   - **Fix Strategy**: Workflow step reordering
   - **Example**: Reorder tasks to eliminate race conditions

5. **POLICY_VIOLATION**: Permission or policy issues
   - **Fix Strategy**: Escalate to human
   - **Example**: Request policy exception

6. **MISSING_DATA**: Required data is absent
   - **Fix Strategy**: Alternate tool or data source
   - **Example**: Use fallback data source

7. **OUT_OF_SCOPE**: Operation outside defined boundaries
   - **Fix Strategy**: Escalate or adjust scope
   - **Example**: Request scope expansion

## Proposed Fix Types

### 1. Alternate Tool Selection

**When Used**: Tool execution failures (TOOL_ERROR)

**How It Works**:
- Identifies failed tool from context
- Selects alternative from allowed tools list
- Validates alternative tool has required capabilities

**Safety Constraints**:
- Alternative must be in allowed tools list
- Must pass Goal-Guard approval
- Must be compatible with task requirements

**Example**:
```typescript
{
  fixType: FixType.ALTERNATE_TOOL,
  alternateToolSelection: {
    originalTool: 'http-fetcher',
    alternativeTool: 'http-fetcher-v2',
    reason: 'http-fetcher timeout',
  },
  riskTier: RiskTier.MEDIUM,
  estimatedImpact: 'low'
}
```

### 2. CRV Threshold Modification

**When Used**: Low confidence, conflicts (LOW_CONFIDENCE, CONFLICT)

**How It Works**:
- Identifies validation operator that failed
- Calculates new threshold within policy bounds
- Default: reduces threshold by 10%

**Safety Constraints**:
- Threshold must stay within policy bounds (0.5 to 1.0)
- Modifications outside bounds require HIGH risk approval
- Multiple threshold adjustments tracked

**Policy Bounds**:
```typescript
{
  minMultiplier: 0.8,  // Can reduce by up to 20%
  maxMultiplier: 1.2,  // Can increase by up to 20%
  absoluteMin: 0.5,    // Never below 0.5
  absoluteMax: 1.0     // Never above 1.0
}
```

**Example**:
```typescript
{
  fixType: FixType.MODIFY_CRV_THRESHOLD,
  modifiedCRVThresholds: [{
    operatorName: 'confidence-validator',
    originalThreshold: 0.8,
    newThreshold: 0.72,
    withinPolicyBounds: true,
  }],
  riskTier: RiskTier.MEDIUM,
  estimatedImpact: 'medium'
}
```

### 3. Workflow Step Reordering

**When Used**: Non-deterministic behavior (NON_DETERMINISM)

**How It Works**:
- Analyzes task dependencies
- Proposes new execution order
- Validates no dependency cycles created

**Safety Constraints**:
- Must preserve all task dependencies
- No cyclic dependencies allowed
- Safety check must pass before promotion

**Dependency Validation**:
- For each task, all dependencies must execute before it
- Task order indices: dependency_index < dependent_index
- Comprehensive safety check before application

**Example**:
```typescript
{
  fixType: FixType.REORDER_WORKFLOW,
  workflowStepReordering: {
    originalOrder: ['fetch-data', 'process-data', 'validate-data'],
    newOrder: ['fetch-data', 'validate-data', 'process-data'],
    safetyCheck: true,
  },
  riskTier: RiskTier.MEDIUM,
  estimatedImpact: 'low'
}
```

## Sandbox Validation

All proposed fixes must pass three validation gates before promotion:

### 1. Goal-Guard FSM Validation

**Purpose**: Ensure fix complies with governance policies

**Process**:
- Creates principal for reflexion system
- Defines action based on fix type
- Evaluates with Goal-Guard FSM
- Respects risk tier requirements

**Risk Tiers**:
- LOW: Auto-approved
- MEDIUM: Auto-approved with monitoring
- HIGH: Requires human approval
- CRITICAL: Always requires human approval

### 2. CRV Validation

**Purpose**: Ensure fix meets circuit reasoning validation criteria

**Process**:
- Creates commit representing the fix
- Validates with CRV gate
- Checks all validation operators
- Blocks if any validator fails

**Validators**:
- Not null: Ensures fix has required data
- Schema: Validates fix structure
- Custom: Domain-specific checks

### 3. Chaos Tests

**Purpose**: Verify fix resilience under failure scenarios

**Default Scenarios**:

1. **Idempotency Test**
   - Verifies fix can be applied multiple times safely
   - Ensures no side effects from reapplication

2. **Rollback Safety Test**
   - Confirms fix can be safely rolled back
   - Validates reversibility

3. **Boundary Conditions Test**
   - Checks CRV thresholds within policy bounds
   - Validates edge cases

**Custom Scenarios**:
- Teams can add domain-specific chaos tests
- Scenarios run in sandbox environment
- All must pass for fix promotion

## Fix Promotion Criteria

A fix is promoted if and only if:

```
✓ Goal-Guard FSM approves
✓ CRV validation passes
✓ All chaos tests pass
```

If any validation fails, the fix is rejected with detailed reasoning.

## Configuration

### ReflexionConfig

```typescript
{
  enabled: true,                    // Enable/disable reflexion
  minConfidence: 0.6,               // Minimum confidence for fix application
  maxFixAttempts: 3,                // Max attempts per task
  crvThresholdBounds: {
    minMultiplier: 0.8,             // Min threshold multiplier (80%)
    maxMultiplier: 1.2,             // Max threshold multiplier (120%)
  },
  chaosTestScenarios: [             // Chaos tests to run
    'idempotency',
    'rollback-safety',
    'boundary-conditions'
  ],
  sandboxEnabled: true              // Enable sandbox validation
}
```

## Usage

### Basic Usage

```typescript
import { ReflexionEngine } from '@aureus/reflexion';
import { GoalGuardFSM } from '@aureus/policy';
import { CRVGate, Validators } from '@aureus/crv';

// Setup
const goalGuard = new GoalGuardFSM();
const crvGate = new CRVGate({
  name: 'validation-gate',
  validators: [Validators.notNull()],
  blockOnFailure: true,
});

const reflexion = new ReflexionEngine(goalGuard, crvGate);

// Handle failure
try {
  // ... workflow execution ...
} catch (error) {
  const result = await reflexion.handleFailure(
    workflowId,
    taskId,
    error,
    {
      toolName: 'data-fetcher',
      allowedTools: ['data-fetcher', 'data-fetcher-v2'],
    }
  );
  
  if (result.fixPromoted) {
    // Apply the promoted fix
    await reflexion.applyFix(
      result.postmortem.proposedFix,
      workflowContext
    );
  }
}
```

### Custom Configuration

```typescript
const reflexion = new ReflexionEngine(
  goalGuard,
  crvGate,
  {
    minConfidence: 0.7,
    maxFixAttempts: 5,
    sandboxEnabled: true,
  }
);
```

### Adding Custom Chaos Tests

```typescript
reflexion.addChaosScenario({
  name: 'custom-resilience-test',
  description: 'Tests fix under network failures',
  execute: async (context) => {
    // Simulate network failure
    const networkDown = simulateNetworkFailure();
    
    // Test if fix handles it
    const resilient = testFixUnderCondition(
      context.proposedFix,
      networkDown
    );
    
    return {
      scenarioName: 'custom-resilience-test',
      passed: resilient,
      executionTime: Date.now() - start,
      details: resilient ? 'Fix is resilient' : 'Fix failed under network failure',
    };
  },
});
```

## Monitoring

### Telemetry Events

Reflexion emits the following telemetry events:

- `reflexion.postmortem.generated`: Postmortem created
- `reflexion.low_confidence`: Postmortem below confidence threshold
- `reflexion.sandbox.executed`: Sandbox execution completed
- `reflexion.fix.promoted`: Fix passed all validations
- `reflexion.fix.rejected`: Fix failed validation
- `reflexion.fix.applied`: Fix applied to workflow

### Statistics

```typescript
const stats = reflexion.getStats();
console.log({
  totalPostmortems: stats.totalPostmortems,
  promotedFixes: stats.promotedFixes,
  rejectedFixes: stats.rejectedFixes,
  averageConfidence: stats.averageConfidence,
});
```

## Best Practices

### 1. Set Appropriate Confidence Thresholds

- **High-stakes workflows**: 0.8 or higher
- **Standard workflows**: 0.6-0.7
- **Experimental workflows**: 0.5-0.6

### 2. Provide Rich Context

Always provide context data for better analysis:

```typescript
const contextData = {
  toolName: 'failing-tool',
  allowedTools: ['tool-a', 'tool-b', 'tool-c'],
  threshold: 0.8,
  operatorName: 'confidence-validator',
  taskOrder: ['task-1', 'task-2', 'task-3'],
  dependencies: taskDependencyMap,
};
```

### 3. Use Custom Chaos Tests

Add domain-specific chaos tests for your workflows:

```typescript
// Test database connection failures
reflexion.addChaosScenario(databaseFailureTest);

// Test rate limiting scenarios
reflexion.addChaosScenario(rateLimitTest);

// Test concurrent execution
reflexion.addChaosScenario(concurrencyTest);
```

### 4. Monitor Fix Attempts

```typescript
const attempts = reflexion.getFixAttemptCount(taskId);
if (attempts > 2) {
  console.warn(`Task ${taskId} has ${attempts} fix attempts`);
}
```

### 5. Periodic History Cleanup

```typescript
// Clear history periodically to prevent memory growth
setInterval(() => {
  const stats = reflexion.getStats();
  if (stats.totalPostmortems > 1000) {
    reflexion.clearHistory();
  }
}, 3600000); // Every hour
```

## Security Considerations

### 1. Sandbox Isolation

- All fixes execute in isolated sandbox
- No production state modified during validation
- Rollback available if issues detected

### 2. Policy Enforcement

- Goal-Guard FSM enforces governance
- High-risk fixes require human approval
- Policy bounds strictly enforced

### 3. Audit Trail

- All postmortems logged
- Sandbox results stored
- Fix applications tracked

### 4. CRV Threshold Bounds

- Thresholds cannot be reduced below 0.5
- Modifications outside bounds require HIGH risk tier
- Multiple modifications tracked and audited

## Limitations

### 1. Fix Attempt Limits

- Default: 3 attempts per task
- Prevents infinite loops
- Manual intervention required after limit

### 2. Confidence Requirements

- Low confidence postmortems not executed
- Minimum threshold enforced
- Prevents unreliable fixes

### 3. Dependency Preservation

- Workflow reordering preserves dependencies
- Cyclic dependencies rejected
- Safety checks mandatory

### 4. Tool Availability

- Alternate tools must be in allowed list
- No dynamic tool discovery
- Tool capabilities not verified automatically

## Future Enhancements

1. **Machine Learning Integration**: Learn from successful fixes over time
2. **Distributed Reflexion**: Share fixes across agent instances
3. **Fix Libraries**: Reusable fix templates for common failures
4. **Advanced Analytics**: Pattern detection in failure modes
5. **Automated Testing**: Generate test cases from postmortems

## Conclusion

Reflexion enables Aureus Agentic OS to self-heal from failures by:

1. Analyzing failures with structured taxonomy
2. Proposing safe, validated fixes
3. Testing fixes in sandbox with comprehensive validation
4. Promoting only fixes that pass all gates

This approach maintains system reliability while enabling autonomous recovery from failures.
