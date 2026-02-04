# Intent Ledger - User Guide

The Intent Ledger is a comprehensive intent tracking system that provides versioning, audit trails, and integration with workflows and hypotheses.

## Overview

An **Intent** represents a user's goal or objective that drives the system's behavior. The Intent Ledger provides:

- **Version Control**: Track changes to intents over time
- **Audit Trail**: Complete history of all intent modifications
- **Workflow Integration**: Link intents to workflows that execute them
- **Hypothesis Integration**: Link intents to hypotheses that explore different approaches
- **Query APIs**: Flexible querying by owner, status, tags, and relationships

## Core Concepts

### Intent States

- `DRAFT`: Intent is being drafted
- `ACTIVE`: Intent is active and can drive executions
- `COMPLETED`: Intent has been fulfilled
- `CANCELLED`: Intent was cancelled
- `SUPERSEDED`: Intent was replaced by a new version

### Intent Versions

Each intent maintains a complete version history. Every update creates a new version with:
- Version number (monotonically increasing)
- Description and parameters
- Status at that version
- Created timestamp and creator
- Change reason

## Basic Usage

### Creating an Intent

```typescript
import { IntentLedger, InMemoryIntentStore, IntentStatus } from '@aureus/kernel';

// Initialize the ledger
const store = new InMemoryIntentStore();
const ledger = new IntentLedger(store);

// Create an intent
const intent = await ledger.createIntent('user-123', {
  description: 'Optimize database query performance',
  createdBy: 'system',
  status: IntentStatus.ACTIVE,
  parameters: {
    targetLatency: '200ms',
    queries: ['SELECT * FROM users', 'SELECT * FROM orders']
  },
  tags: ['performance', 'database']
});

console.log(`Created intent ${intent.id} at version ${intent.currentVersion}`);
```

### Updating an Intent

```typescript
// Update creates a new version
const updated = await ledger.updateIntent(intent.id, {
  description: 'Optimize database query performance (updated)',
  parameters: { targetLatency: '100ms' }, // Merged with existing parameters
  updatedBy: 'user-456',
  changeReason: 'Stricter latency requirements'
});

console.log(`Updated to version ${updated.currentVersion}`);
```

### Completing or Cancelling an Intent

```typescript
// Complete an intent
await ledger.completeIntent(intent.id, 'system');

// Or cancel it
await ledger.cancelIntent(intent.id, 'admin', 'Requirements changed');
```

## Workflow Integration

Link workflows to intents to track execution:

```typescript
// Link a workflow
await ledger.linkWorkflow(intent.id, 'workflow-abc123', 'system');

// Query intents by workflow
const intents = await ledger.getIntentsByWorkflow('workflow-abc123');

// Unlink if needed
await ledger.unlinkWorkflow(intent.id, 'workflow-abc123', 'system');
```

## Hypothesis Integration

Link hypotheses to specific intent versions to explore different approaches:

```typescript
import { HypothesisManager } from '@aureus/kernel';

// Initialize hypothesis manager
const hypothesisManager = new HypothesisManager({
  maxConcurrentHypotheses: 5,
  scoringCriteria: {
    confidenceWeight: 0.3,
    costWeight: 0.2,
    riskWeight: 0.3,
    goalAlignmentWeight: 0.2,
  },
  minAcceptableScore: 0.6,
  autoPrune: false,
  enableTelemetry: false,
});

// Register a goal
hypothesisManager.registerGoal({
  id: 'goal-1',
  description: 'Improve query performance',
  successCriteria: [],
});

// Create a hypothesis linked to the intent
const hypothesis = await hypothesisManager.createHypothesis(
  'goal-1',
  'Add database indexes on frequently queried columns',
  [
    {
      id: 'action-1',
      type: 'database_migration',
      parameters: { 
        table: 'users', 
        columns: ['email', 'created_at'] 
      }
    }
  ],
  {
    intentId: intent.id,
    intentVersion: intent.currentVersion,
  }
);

// Link hypothesis to intent
await ledger.linkHypothesis(intent.id, hypothesis.id, 'system');

// Query intents by hypothesis
const linkedIntents = await ledger.getIntentsByHypothesis(hypothesis.id);
```

## Querying Intents

The ledger provides flexible query APIs:

```typescript
// Get intents by owner
const myIntents = await ledger.getIntentsByOwner('user-123');

// Get intents by status
const activeIntents = await ledger.getIntentsByStatus(IntentStatus.ACTIVE);

// Complex query
const results = await ledger.queryIntents({
  owner: 'user-123',
  status: IntentStatus.ACTIVE,
  tags: ['performance'],
  createdAfter: new Date('2026-01-01'),
  limit: 10,
  offset: 0
});
```

## Audit Trail

Every change to an intent is tracked:

```typescript
// Get audit trail for an intent
const trail = ledger.getAuditTrail(intent.id);

trail.forEach(event => {
  console.log(`${event.type} by ${event.actor} at ${event.timestamp}`);
  console.log('Data:', event.data);
});

// Get all events
const allEvents = ledger.getAllEvents();
```

## Version History

Access any version of an intent:

```typescript
// Get specific version
const version1 = await ledger.getIntentVersion(intent.id, 1);
const version2 = await ledger.getIntentVersion(intent.id, 2);

// Compare versions
console.log('Version 1 description:', version1?.description);
console.log('Version 2 description:', version2?.description);
```

## Persistent Storage

For production use, use the FileSystemIntentStore:

```typescript
import { FileSystemIntentStore } from '@aureus/kernel';

// Store intents in ./var/intents
const store = new FileSystemIntentStore('./var/intents');
const ledger = new IntentLedger(store);

// All operations work the same way
const intent = await ledger.createIntent('user-123', {
  description: 'Deploy new feature',
  createdBy: 'system',
});
```

## Integration Example

Complete example showing intent, hypothesis, and workflow integration:

```typescript
import { 
  IntentLedger, 
  InMemoryIntentStore, 
  IntentStatus,
  HypothesisManager
} from '@aureus/kernel';

async function main() {
  // Setup
  const intentLedger = new IntentLedger(new InMemoryIntentStore());
  const hypothesisManager = new HypothesisManager({
    maxConcurrentHypotheses: 5,
    scoringCriteria: {
      confidenceWeight: 0.3,
      costWeight: 0.2,
      riskWeight: 0.3,
      goalAlignmentWeight: 0.2,
    },
    minAcceptableScore: 0.6,
    autoPrune: false,
    enableTelemetry: false,
  });

  // 1. Create an intent
  const intent = await intentLedger.createIntent('user-1', {
    description: 'Improve API response time',
    createdBy: 'system',
    status: IntentStatus.ACTIVE,
    parameters: { currentLatency: '500ms', targetLatency: '200ms' },
    tags: ['performance', 'api']
  });

  // 2. Create hypotheses to explore different approaches
  hypothesisManager.registerGoal({
    id: 'goal-1',
    description: 'Reduce API latency',
    successCriteria: [],
  });

  const hyp1 = await hypothesisManager.createHypothesis(
    'goal-1',
    'Add Redis caching',
    [{ id: 'a1', type: 'add_cache', parameters: { type: 'redis' } }],
    { intentId: intent.id, intentVersion: 1 }
  );

  const hyp2 = await hypothesisManager.createHypothesis(
    'goal-1',
    'Optimize database queries',
    [{ id: 'a1', type: 'optimize_db', parameters: {} }],
    { intentId: intent.id, intentVersion: 1 }
  );

  await intentLedger.linkHypothesis(intent.id, hyp1.id, 'system');
  await intentLedger.linkHypothesis(intent.id, hyp2.id, 'system');

  // 3. Link workflow execution
  await intentLedger.linkWorkflow(intent.id, 'workflow-123', 'system');

  // 4. Update intent with new requirements
  const updated = await intentLedger.updateIntent(intent.id, {
    parameters: { targetLatency: '100ms' },
    updatedBy: 'user-1',
    changeReason: 'Stricter SLA requirements'
  });

  // 5. Create new hypothesis for updated intent
  const hyp3 = await hypothesisManager.createHypothesis(
    'goal-1',
    'Combined approach: caching + query optimization',
    [
      { id: 'a1', type: 'add_cache', parameters: { type: 'redis' } },
      { id: 'a2', type: 'optimize_db', parameters: {} }
    ],
    { intentId: updated.id, intentVersion: updated.currentVersion }
  );

  await intentLedger.linkHypothesis(updated.id, hyp3.id, 'system');

  // 6. Query and analyze
  const allHypotheses = await intentLedger.getIntent(intent.id);
  console.log('Intent has', allHypotheses?.hypothesisIds.length, 'linked hypotheses');
  
  const trail = intentLedger.getAuditTrail(intent.id);
  console.log('Audit trail has', trail.length, 'events');
}

main();
```

## Best Practices

1. **Use Meaningful Descriptions**: Make intent descriptions clear and actionable
2. **Tag Appropriately**: Use tags for categorization and easier querying
3. **Version Incrementally**: Create new versions for significant changes
4. **Document Change Reasons**: Always provide a reason when updating
5. **Link Related Entities**: Connect workflows and hypotheses for full traceability
6. **Query Efficiently**: Use filters and pagination for large datasets
7. **Monitor Audit Trail**: Regularly review audit events for compliance
8. **Complete or Cancel**: Always mark intents as completed or cancelled when done

## API Reference

### IntentLedger Methods

- `createIntent(owner, options)`: Create a new intent
- `updateIntent(intentId, options)`: Update and version an intent
- `completeIntent(intentId, completedBy)`: Mark intent as completed
- `cancelIntent(intentId, cancelledBy, reason)`: Cancel an intent
- `linkWorkflow(intentId, workflowId, linkedBy)`: Link a workflow
- `unlinkWorkflow(intentId, workflowId, unlinkedBy)`: Unlink a workflow
- `linkHypothesis(intentId, hypothesisId, linkedBy)`: Link a hypothesis
- `unlinkHypothesis(intentId, hypothesisId, unlinkedBy)`: Unlink a hypothesis
- `getIntent(intentId)`: Get an intent by ID
- `getIntentVersion(intentId, version)`: Get a specific version
- `queryIntents(options)`: Query intents with filters
- `getIntentsByOwner(owner)`: Get intents by owner
- `getIntentsByStatus(status)`: Get intents by status
- `getIntentsByWorkflow(workflowId)`: Get intents linked to workflow
- `getIntentsByHypothesis(hypothesisId)`: Get intents linked to hypothesis
- `getAuditTrail(intentId)`: Get audit trail for an intent
- `getAllEvents()`: Get all audit events

## TypeScript Types

See `packages/kernel/src/intent-ledger.ts` for complete type definitions.

Key types:
- `Intent`: The main intent interface
- `IntentVersion`: A versioned snapshot
- `IntentStatus`: Enum of intent states
- `IntentEvent`: Audit event
- `IntentStore`: Store interface
- `CreateIntentOptions`: Options for creating
- `UpdateIntentOptions`: Options for updating
- `QueryIntentOptions`: Query filters
