# Agent Studio Enhancements

## Overview

This document describes the enhancements made to the Agent Studio feature to integrate CRV (Circuit Reasoning Validation) and policy evaluation before accepting generated agent specifications.

## Changes Made

### 1. Enhanced Agent Builder (`src/agent-builder.ts`)

#### New Methods

**`validateWithCRV(blueprint: AgentBlueprint): Promise<AgentCRVResult>`**
- Validates agent blueprints using CRV gates before acceptance
- Performs three validation checks:
  - Schema validation (95% confidence threshold)
  - Security checks (90% confidence threshold) - ensures CRITICAL risk profiles have policies
  - Logic consistency (85% confidence threshold) - validates tool configurations
- Blocks blueprints for HIGH and CRITICAL risk profiles if validation fails
- Logs validation events to the event log for auditability

**`evaluateWithPolicy(blueprint: AgentBlueprint, principal?: Principal): Promise<AgentPolicyResult>`**
- Evaluates agent blueprints against policy guard rules
- Creates appropriate action context with:
  - Intent: WRITE (for agent creation)
  - DataZone: INTERNAL
  - Required permissions based on blueprint risk profile
- Logs policy evaluation decisions to the event log
- Returns approval/denial decision with reason

**`validateAgentComprehensive(blueprint: AgentBlueprint, principal?: Principal)`**
- Combines basic validation, CRV validation, and policy evaluation
- Returns comprehensive results including:
  - Overall validity status
  - All validation issues (errors, warnings, info)
  - CRV validation results
  - Policy evaluation results
- Used by the validation API endpoint to provide complete feedback

#### Constructor Changes
- Now accepts optional `policyGuard` parameter for policy evaluation
- Signature: `constructor(eventLog?: EventLog, policyGuard?: GoalGuardFSM)`

### 2. Updated API Server (`src/api-server.ts`)

#### Modified Endpoint: `POST /api/agents/validate`
- Now uses `validateAgentComprehensive()` instead of basic `validateAgent()`
- Extracts principal from session for policy evaluation
- Returns enhanced response including:
  - `crvResult`: CRV validation details
  - `policyResult`: Policy evaluation details
  - `issues`: Combined validation issues
- Enables UI to display comprehensive validation feedback

### 3. Enhanced UI (`src/ui/agent-studio.html`)

#### Updated `displayValidationResults()` Function
- Now displays CRV validation results with:
  - Overall CRV pass/fail status
  - Individual validation check results
  - Confidence scores for each check
- Shows policy evaluation results with:
  - Approval/denial decision
  - Reason for the decision
- Groups validation feedback into logical sections:
  - CRV Validation
  - Policy Evaluation
  - Configuration Issues

### 4. Enhanced Tests (`tests/agent-builder.test.ts`)

#### New Test Suite: `CRV and Policy Validation`
- Tests CRV validation functionality
- Tests policy evaluation (with and without policy guard)
- Tests comprehensive validation
- Tests failure scenarios
- Tests event logging for both CRV and policy operations

## Integration Points

### CRV Integration
- Uses `@aureus/crv` package for validation gates
- Creates `Commit` objects from agent blueprints
- Configures validators as async functions
- Blocks invalid commits based on risk profile

### Policy Integration
- Uses `@aureus/policy` package for authorization
- Creates `Action` objects with proper intent and data zone
- Evaluates against `GoalGuardFSM` policy guard
- Respects principal permissions and attributes

## Event Logging

All validation and evaluation activities are logged to the event log:

**CRV Validation Events**
```typescript
{
  type: 'STATE_SNAPSHOT',
  workflowId: `agent-${blueprint.id}`,
  metadata: {
    crvGateResult: {
      passed: boolean,
      gateName: string,
      blockedCommit: boolean,
    },
    crvBlocked: boolean,
  }
}
```

**Policy Evaluation Events**
```typescript
{
  type: 'STATE_SNAPSHOT',
  workflowId: `agent-${blueprint.id}`,
  metadata: {
    policyDecision: {
      allowed: boolean,
      reason: string,
      requiresHumanApproval: boolean,
      approvalToken?: string,
    },
    policyBlocked: boolean,
  }
}
```

## Usage Example

```typescript
// Initialize with dependencies
const eventLog = new EventLog(stateStore);
const policyGuard = new GoalGuardFSM(/* ... */);
const agentBuilder = new AgentBuilder(eventLog, policyGuard);

// Generate agent blueprint
const { blueprint } = await agentBuilder.generateAgent(request);

// Comprehensive validation
const result = await agentBuilder.validateAgentComprehensive(
  blueprint, 
  principal
);

if (!result.valid) {
  console.log('Validation failed:', result.issues);
  console.log('CRV result:', result.crvResult);
  console.log('Policy result:', result.policyResult);
}
```

## Benefits

1. **Safety**: Agent blueprints are validated before deployment
2. **Security**: Policy evaluation ensures compliance with organizational rules
3. **Auditability**: All validation events are logged
4. **Transparency**: UI displays detailed validation feedback
5. **Flexibility**: CRV gates can be configured per risk profile
6. **Governance**: Policy guard enforces authorization rules

## Future Enhancements

1. Configurable CRV validators for different agent types
2. Custom policy rules for specific agent categories
3. Integration with external validation services
4. Real-time validation feedback during agent creation
5. Validation history and analytics dashboard
