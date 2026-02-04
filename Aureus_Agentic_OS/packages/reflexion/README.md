# @aureus/reflexion

Self-healing system for Aureus Agentic OS that enables agents to learn from failures and automatically propose corrective actions.

## Overview

Reflexion analyzes workflow failures, generates structured postmortems, proposes fixes, and validates them in a safe sandbox environment before promotion.

## Features

- **Structured Postmortems**: Automatic failure classification with taxonomy (TOOL_ERROR, LOW_CONFIDENCE, CONFLICT, etc.)
- **Fix Generation**: Automated proposals for:
  - Alternate tool selection
  - CRV threshold modification (within policy bounds)
  - Workflow step reordering (only if safe)
- **Sandbox Validation**: Comprehensive validation through:
  - Goal-Guard FSM approval
  - CRV validation
  - Chaos testing (idempotency, rollback safety, boundary conditions)
- **Fix Promotion**: Fixes promoted only when all validations pass
- **Telemetry Integration**: Full observability of reflexion operations

## Installation

This package is part of the Aureus Agentic OS monorepo. Install dependencies:

```bash
npm install
```

## Quick Start

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

// Handle workflow failure
try {
  await orchestrator.executeWorkflow(workflow);
} catch (error) {
  const result = await reflexion.handleFailure(
    'workflow-123',
    'task-456',
    error,
    {
      toolName: 'data-fetcher',
      allowedTools: ['data-fetcher', 'data-fetcher-v2'],
    }
  );
  
  if (result.fixPromoted) {
    console.log('Fix promoted:', result.postmortem.proposedFix.description);
    await reflexion.applyFix(
      result.postmortem.proposedFix,
      workflowContext
    );
  } else {
    console.log('Fix rejected:', result.sandboxResult?.promotionReason);
  }
}
```

## Configuration

```typescript
const reflexion = new ReflexionEngine(
  goalGuard,
  crvGate,
  {
    enabled: true,              // Enable/disable reflexion
    minConfidence: 0.6,         // Minimum confidence for fix application
    maxFixAttempts: 3,          // Max attempts per task
    crvThresholdBounds: {
      minMultiplier: 0.8,       // Can reduce threshold by up to 20%
      maxMultiplier: 1.2,       // Can increase threshold by up to 20%
    },
    sandboxEnabled: true,       // Enable sandbox validation
  }
);
```

## Failure Taxonomy

| Taxonomy | Fix Strategy | Example |
|----------|--------------|---------|
| TOOL_ERROR | Alternate tool selection | Replace failed tool with backup |
| LOW_CONFIDENCE | CRV threshold adjustment | Reduce confidence threshold by 10% |
| CONFLICT | CRV threshold adjustment | Adjust conflict detection sensitivity |
| NON_DETERMINISM | Workflow reordering | Reorder tasks to eliminate race conditions |
| POLICY_VIOLATION | Escalate to human | Request policy exception |
| MISSING_DATA | Alternate tool/source | Use fallback data source |
| OUT_OF_SCOPE | Escalate/adjust scope | Request scope expansion |

## Fix Types

### Alternate Tool Selection

```typescript
{
  fixType: FixType.ALTERNATE_TOOL,
  alternateToolSelection: {
    originalTool: 'http-fetcher',
    alternativeTool: 'http-fetcher-v2',
    reason: 'http-fetcher timeout',
  },
  riskTier: RiskTier.MEDIUM,
}
```

### CRV Threshold Modification

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
}
```

### Workflow Step Reordering

```typescript
{
  fixType: FixType.REORDER_WORKFLOW,
  workflowStepReordering: {
    originalOrder: ['fetch', 'process', 'validate'],
    newOrder: ['fetch', 'validate', 'process'],
    safetyCheck: true,
  },
  riskTier: RiskTier.MEDIUM,
}
```

## Custom Chaos Tests

```typescript
reflexion.addChaosScenario({
  name: 'network-resilience',
  description: 'Test fix under network failures',
  execute: async (context) => {
    // Test implementation
    const resilient = testFixUnderNetworkFailure(context.proposedFix);
    
    return {
      scenarioName: 'network-resilience',
      passed: resilient,
      executionTime: Date.now() - start,
      details: resilient ? 'Passed' : 'Failed',
    };
  },
});
```

## Monitoring

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

### Postmortem History

```typescript
// Get all postmortems for a workflow
const postmortems = reflexion.getPostmortemsForWorkflow('workflow-123');

// Get postmortems for a specific task
const taskPostmortems = reflexion.getPostmortemsForTask('workflow-123', 'task-456');

// Get fix attempt count
const attempts = reflexion.getFixAttemptCount('task-456');
```

## Testing

Run tests:

```bash
npm test
```

The package includes 38 comprehensive tests covering:
- Failure analysis (11 tests)
- Sandbox execution (10 tests)
- Reflexion engine (17 tests)

## Documentation

See [docs/reflexion_policy.md](../../docs/reflexion_policy.md) for detailed documentation including:
- Architecture overview
- Failure taxonomy details
- Validation gates
- Best practices
- Security considerations

## API Reference

### ReflexionEngine

Main class for orchestrating reflexion operations.

#### Methods

- `handleFailure(workflowId, taskId, error, contextData?)`: Analyze failure and propose fix
- `applyFix(proposedFix, workflowContext)`: Apply a promoted fix
- `getPostmortem(postmortemId)`: Retrieve postmortem by ID
- `getSandboxResult(fixId)`: Retrieve sandbox result by fix ID
- `getPostmortemsForWorkflow(workflowId)`: Get all postmortems for workflow
- `getPostmortemsForTask(workflowId, taskId)`: Get postmortems for task
- `getFixAttemptCount(taskId)`: Get fix attempt count
- `resetFixAttempts(taskId)`: Reset fix attempt counter
- `getStats()`: Get reflexion statistics
- `clearHistory()`: Clear all reflexion history
- `addChaosScenario(scenario)`: Add custom chaos test

### FailureAnalyzer

Analyzes failures and generates postmortems.

#### Methods

- `analyzeFailure(workflowId, taskId, error, contextData?)`: Generate structured postmortem

### SandboxExecutor

Executes proposed fixes in sandbox with validation.

#### Methods

- `executeFix(proposedFix, workflowId, taskId, originalFailure)`: Execute and validate fix
- `addChaosScenario(scenario)`: Add custom chaos test scenario

## License

Part of Aureus Agentic OS
