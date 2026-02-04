# Policy System Documentation

## Overview

The Aureus Agentic OS policy system provides governance and safety controls for AI agent actions through a Goal-Guard FSM (Finite State Machine). It validates actions against risk tiers, permissions, data zones, intents, and allowed tools before allowing execution.

## Core Concepts

### Risk Tiers

Actions are classified into four risk tiers:

- **LOW**: Read-only operations with no side effects
- **MEDIUM**: Reversible changes with moderate impact
- **HIGH**: Significant changes that may require approval
- **CRITICAL**: Irreversible operations that always require human approval

### Data Zones

Resources are organized into security zones:

- **PUBLIC**: Publicly accessible data
- **INTERNAL**: Internal organizational data
- **CONFIDENTIAL**: Sensitive/confidential data
- **RESTRICTED**: Highly restricted data requiring highest permissions

### Intents

Actions are categorized by their intent:

- **READ**: Read-only operations
- **WRITE**: Write/modify operations
- **DELETE**: Delete operations
- **EXECUTE**: Execute/run operations
- **ADMIN**: Administrative operations

### Approval Workflow

For HIGH and CRITICAL risk actions:

1. Action is evaluated by Goal-Guard FSM
2. If risk tier is HIGH or CRITICAL, an approval token is generated
3. Action is blocked with status `PENDING_HUMAN`
4. Human operator must provide the approval token to proceed
5. Token is validated and consumed (single-use only)
6. Action proceeds if token is valid

## Policy Language Examples

### Example 1: Simple Low-Risk Action

```typescript
import { GoalGuardFSM, Principal, Action, RiskTier } from '@aureus/policy';

// Create policy guard
const policyGuard = new GoalGuardFSM();

// Define principal (agent/user/service)
const principal: Principal = {
  id: 'agent-1',
  type: 'agent',
  permissions: [
    { action: 'read', resource: 'database' }
  ]
};

// Define action
const action: Action = {
  id: 'read-users',
  name: 'Read User Data',
  riskTier: RiskTier.LOW,
  requiredPermissions: [
    { action: 'read', resource: 'database' }
  ]
};

// Evaluate action
const decision = await policyGuard.evaluate(principal, action);

if (decision.allowed) {
  console.log('Action approved:', decision.reason);
  // Proceed with action
} else {
  console.log('Action blocked:', decision.reason);
}
```

### Example 2: High-Risk Action with Approval

```typescript
import { GoalGuardFSM, Principal, Action, RiskTier } from '@aureus/policy';

const policyGuard = new GoalGuardFSM();

const principal: Principal = {
  id: 'agent-1',
  type: 'agent',
  permissions: [
    { action: 'write', resource: 'database' }
  ]
};

const action: Action = {
  id: 'delete-users',
  name: 'Delete User Records',
  riskTier: RiskTier.HIGH,
  requiredPermissions: [
    { action: 'write', resource: 'database' }
  ]
};

// Evaluate action
const decision = await policyGuard.evaluate(principal, action);

if (!decision.allowed && decision.requiresHumanApproval) {
  console.log('Approval required:', decision.reason);
  console.log('Approval token:', decision.approvalToken);
  
  // Wait for human approval...
  const approvalToken = decision.approvalToken!;
  
  // Approve with token
  const approved = policyGuard.approveHumanAction(action.id, approvalToken);
  
  if (approved) {
    console.log('Action approved by human');
    // Proceed with action
  } else {
    console.log('Invalid approval token');
  }
}
```

### Example 3: Data Zone Restrictions

```typescript
import { GoalGuardFSM, Principal, Action, RiskTier, DataZone, Intent } from '@aureus/policy';

const policyGuard = new GoalGuardFSM();

// Principal with confidential data access
const principal: Principal = {
  id: 'agent-1',
  type: 'agent',
  permissions: [
    {
      action: 'read',
      resource: 'customer-data',
      dataZone: DataZone.CONFIDENTIAL // Has access to confidential data
    }
  ]
};

// Action requiring confidential data access
const action: Action = {
  id: 'read-customer-pii',
  name: 'Read Customer PII',
  riskTier: RiskTier.MEDIUM,
  requiredPermissions: [
    {
      action: 'read',
      resource: 'customer-data',
      dataZone: DataZone.CONFIDENTIAL
    }
  ],
  dataZone: DataZone.CONFIDENTIAL
};

const decision = await policyGuard.evaluate(principal, action);
console.log('Decision:', decision.allowed ? 'Allowed' : 'Blocked');
```

### Example 4: Tool Validation

```typescript
import { GoalGuardFSM, Principal, Action, RiskTier } from '@aureus/policy';

const policyGuard = new GoalGuardFSM();

const principal: Principal = {
  id: 'agent-1',
  type: 'agent',
  permissions: [
    { action: 'execute', resource: 'compute' }
  ]
};

// Action with tool restrictions
const action: Action = {
  id: 'run-analysis',
  name: 'Run Data Analysis',
  riskTier: RiskTier.MEDIUM,
  requiredPermissions: [
    { action: 'execute', resource: 'compute' }
  ],
  allowedTools: ['pandas', 'numpy', 'sklearn'] // Only these tools allowed
};

// Attempt with allowed tool
const decision1 = await policyGuard.evaluate(principal, action, 'pandas');
console.log('Pandas:', decision1.allowed); // true

// Attempt with disallowed tool
const decision2 = await policyGuard.evaluate(principal, action, 'requests');
console.log('Requests:', decision2.allowed); // false
console.log('Reason:', decision2.reason); // Tool not allowed
```

### Example 5: Intent-Based Permissions

```typescript
import { GoalGuardFSM, Principal, Action, RiskTier, Intent } from '@aureus/policy';

const policyGuard = new GoalGuardFSM();

// Principal with write intent
const principal: Principal = {
  id: 'agent-1',
  type: 'agent',
  permissions: [
    {
      action: 'modify',
      resource: 'documents',
      intent: Intent.WRITE
    }
  ]
};

// Action requiring write intent
const writeAction: Action = {
  id: 'update-doc',
  name: 'Update Document',
  riskTier: RiskTier.MEDIUM,
  requiredPermissions: [
    {
      action: 'modify',
      resource: 'documents',
      intent: Intent.WRITE
    }
  ],
  intent: Intent.WRITE
};

// Action requiring delete intent (not granted)
const deleteAction: Action = {
  id: 'delete-doc',
  name: 'Delete Document',
  riskTier: RiskTier.HIGH,
  requiredPermissions: [
    {
      action: 'modify',
      resource: 'documents',
      intent: Intent.DELETE
    }
  ],
  intent: Intent.DELETE
};

const writeDecision = await policyGuard.evaluate(principal, writeAction);
console.log('Write:', writeDecision.allowed); // true

const deleteDecision = await policyGuard.evaluate(principal, deleteAction);
console.log('Delete:', deleteDecision.allowed); // false - intent mismatch
```

## Kernel Integration

The policy system integrates seamlessly with the kernel orchestrator to enforce governance before task execution.

### Integration Example

```typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { InMemoryStateStore } from '@aureus/kernel';
import { GoalGuardFSM, Principal } from '@aureus/policy';

// Create components
const stateStore = new InMemoryStateStore();
const policyGuard = new GoalGuardFSM();

// Define principal for workflow
const principal: Principal = {
  id: 'workflow-agent',
  type: 'agent',
  permissions: [
    { action: 'read', resource: 'data' },
    { action: 'write', resource: 'data' }
  ]
};

// Create orchestrator with policy guard
const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  undefined, // eventLog
  undefined, // compensationExecutor
  undefined, // worldStateStore
  undefined, // memoryAPI
  undefined, // crvGate
  policyGuard, // Policy guard
  principal   // Principal
);

// Define workflow with risk-classified tasks
const workflow: WorkflowSpec = {
  id: 'data-processing',
  name: 'Data Processing Workflow',
  tasks: [
    {
      id: 'read-data',
      name: 'Read Input Data',
      type: 'action',
      riskTier: 'LOW', // Low risk - automatically approved
      requiredPermissions: [{ action: 'read', resource: 'data' }]
    },
    {
      id: 'process-data',
      name: 'Process Data',
      type: 'action',
      riskTier: 'MEDIUM', // Medium risk - automatically approved with monitoring
      requiredPermissions: [{ action: 'write', resource: 'data' }]
    },
    {
      id: 'delete-temp',
      name: 'Delete Temporary Files',
      type: 'action',
      riskTier: 'HIGH', // High risk - requires approval
      requiredPermissions: [{ action: 'write', resource: 'data' }]
    }
  ],
  dependencies: new Map([
    ['process-data', ['read-data']],
    ['delete-temp', ['process-data']]
  ])
};

// Execute workflow - policy checks happen automatically
try {
  const result = await orchestrator.executeWorkflow(workflow);
  console.log('Workflow completed:', result.status);
} catch (error) {
  console.error('Workflow failed:', error.message);
  // Check if failure was due to policy block
  if (error.message.includes('Policy gate blocked')) {
    // Extract approval token from error message if present
    console.log('Approval required');
  }
}
```

### Policy Check Points

The kernel orchestrator performs policy checks at two critical points:

1. **Before Tool Execution**: Validates action against risk tier, permissions, data zones, intents, and allowed tools
2. **Before Commit**: CRV gates validate the result before committing (policy check happens first)

### Event Logging

Policy decisions are logged in the event log with full audit trail:

```typescript
{
  timestamp: Date,
  type: 'STATE_UPDATED',
  workflowId: 'workflow-1',
  taskId: 'task-1',
  metadata: {
    policyDecision: {
      allowed: false,
      reason: 'High risk action requires explicit human approval',
      requiresHumanApproval: true,
      approvalToken: 'approval-task-1-1234567890-abc123'
    },
    policyBlocked: true
  }
}
```

## Audit Log

All policy decisions are automatically recorded in the audit log:

```typescript
const auditLog = policyGuard.getAuditLog();

auditLog.forEach(entry => {
  console.log('Timestamp:', entry.timestamp);
  console.log('Principal:', entry.principal.id);
  console.log('Action:', entry.action.name);
  console.log('Decision:', entry.decision.allowed ? 'Allowed' : 'Blocked');
  console.log('Reason:', entry.decision.reason);
  if (entry.approvalToken) {
    console.log('Approval Token:', entry.approvalToken);
  }
});
```

## Best Practices

### 1. Assign Minimum Permissions

Always grant the minimum permissions required:

```typescript
const principal: Principal = {
  id: 'agent-1',
  type: 'agent',
  permissions: [
    // Only grant read permission if that's all that's needed
    { action: 'read', resource: 'database' }
  ]
};
```

### 2. Use Appropriate Risk Tiers

- Use **LOW** for read-only operations
- Use **MEDIUM** for operations that can be reversed
- Use **HIGH** for operations with significant impact
- Use **CRITICAL** for irreversible operations (e.g., delete database)

### 3. Leverage Data Zones

Organize resources by sensitivity:

```typescript
// Production data = RESTRICTED
{ action: 'read', resource: 'prod-db', dataZone: DataZone.RESTRICTED }

// Development data = INTERNAL
{ action: 'read', resource: 'dev-db', dataZone: DataZone.INTERNAL }

// Public APIs = PUBLIC
{ action: 'read', resource: 'public-api', dataZone: DataZone.PUBLIC }
```

### 4. Validate Tools

Restrict which tools can be used for specific actions:

```typescript
const action: Action = {
  id: 'data-export',
  name: 'Export Data',
  riskTier: RiskTier.HIGH,
  requiredPermissions: [{ action: 'read', resource: 'database' }],
  allowedTools: ['pg_dump', 'mysqldump'] // Only these tools allowed
};
```

### 5. Handle Approval Tokens Securely

- Store approval tokens securely
- Never log approval tokens in plain text
- Tokens are single-use and expire after 1 hour
- Validate tokens before using them

## API Reference

### GoalGuardFSM

Main class for policy enforcement.

#### Methods

- `evaluate(principal: Principal, action: Action, toolName?: string): Promise<GuardDecision>`
  - Evaluates an action against policy rules
  - Returns decision with allowed/blocked status and reason

- `approveHumanAction(actionId: string, token: string): boolean`
  - Approves a pending HIGH/CRITICAL risk action with approval token
  - Returns true if approval successful, false otherwise

- `rejectHumanAction(): void`
  - Rejects a pending action

- `getState(): GoalGuardState`
  - Returns current FSM state

- `getAuditLog(): AuditEntry[]`
  - Returns audit log of all decisions

- `reset(): void`
  - Resets FSM to idle state

### Types

#### Principal

```typescript
interface Principal {
  id: string;
  type: 'agent' | 'human' | 'service';
  permissions: Permission[];
}
```

#### Action

```typescript
interface Action {
  id: string;
  name: string;
  riskTier: RiskTier;
  requiredPermissions: Permission[];
  intent?: Intent;
  dataZone?: DataZone;
  allowedTools?: string[];
  metadata?: Record<string, unknown>;
}
```

#### Permission

```typescript
interface Permission {
  action: string;
  resource: string;
  intent?: Intent;
  dataZone?: DataZone;
  conditions?: Record<string, unknown>;
}
```

#### GuardDecision

```typescript
interface GuardDecision {
  allowed: boolean;
  reason: string;
  requiresHumanApproval: boolean;
  approvalToken?: string;
  metadata?: Record<string, unknown>;
}
```

## Conclusion

The Aureus policy system provides comprehensive governance for AI agent actions. By combining risk tiers, permissions, data zones, intents, and tool validation, it ensures safe and controlled execution of automated workflows while maintaining full auditability.
