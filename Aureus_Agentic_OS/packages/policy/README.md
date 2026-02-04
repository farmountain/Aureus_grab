# Policy

Goal-guard FSM + permission model + risk tiers + data zones + intents

## Overview

The policy package provides governance and safety controls for AI agent actions. It implements a Goal-Guard FSM (Finite State Machine) that validates actions against risk tiers, permissions, data zones, intents, and allowed tools before allowing execution.

## Features

- **Risk-Based Governance**: Four risk tiers (LOW, MEDIUM, HIGH, CRITICAL)
- **Permission System**: Action-resource-based permissions with intent and data zone support
- **Approval Workflow**: HIGH and CRITICAL risk actions require human approval with tokens
- **Data Zones**: Four security zones (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED)
- **Intent Classification**: Actions classified by intent (READ, WRITE, DELETE, EXECUTE, ADMIN)
- **Tool Validation**: Restrict which tools can be used for specific actions
- **Effort Evaluation**: Cost/risk/value analysis using world-model constraints and observability metrics
- **Full Audit Trail**: All decisions logged with complete context

## Installation

```bash
npm install @aureus/policy
```

## Quick Start

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
} else {
  console.log('Action blocked:', decision.reason);
}
```

## Documentation

See [Policy Guide](../../docs/policy-guide.md) for comprehensive documentation with examples.

For information on the EffortEvaluator module, see [Effort Evaluator Guide](./EFFORT_EVALUATOR.md).

## Integration with Kernel

The policy system integrates with the kernel orchestrator to enforce governance before task execution:

```typescript
import { WorkflowOrchestrator } from '@aureus/kernel';
import { GoalGuardFSM, Principal } from '@aureus/policy';

const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  policyGuard,  // Add policy guard
  principal     // Add principal
);
```

## Testing

```bash
npm test
```

