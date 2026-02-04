# Sandbox Integration in Agent Builder

## Overview

The Agent Builder now integrates with the `SandboxIntegration` component from `@aureus/kernel` to provide real sandbox execution for agent tool testing. This integration enables:

- **Real Sandbox Runs**: Execute tools in isolated sandbox environments
- **Policy Enforcement**: Apply actual policy checks before tool execution  
- **CRV Validation**: Validate tool outputs with real CRV gates
- **Side Effect Capture**: Track side effects through sandbox isolation in both dry-run and live modes

## Architecture

### Components

1. **SandboxIntegration** (`@aureus/kernel`): Manages sandbox lifecycle, execution, and result logging
2. **GoalGuardFSM** (`@aureus/policy`): Evaluates policy decisions for tool execution
3. **CRVGate** (`@aureus/crv`): Validates tool outputs against verification rules
4. **TelemetryCollector** (`@aureus/observability`): Records metrics and events
5. **MemoryAPI** (`@aureus/memory-hipcortex`): Stores audit logs of sandbox executions

### Integration Flow

```
Agent Simulation Request
  ↓
Validate Blueprint (CRV + Policy)
  ↓
For Each Tool:
  ├─ Check if Real Sandbox Available
  │   ├─ YES: Execute in Sandbox
  │   │   ├─ Create TaskSpec with sandbox config
  │   │   ├─ Execute through SandboxIntegration
  │   │   ├─ Run CRV validation on output
  │   │   ├─ Log results to HipCortex
  │   │   └─ Capture side effects
  │   └─ NO: Legacy Simulation Mode
  │       ├─ Run policy check
  │       ├─ Simulate execution
  │       └─ Mock side effects
  └─
Complete Simulation
  ↓
Return Results
```

## Usage

See the test file `tests/agent-builder-sandbox-integration.test.ts` for comprehensive usage examples.

## Features

### 1. Real Sandbox Execution

When `sandboxIntegration` is provided and `dryRun` is `false`, tools execute in isolated sandbox environments.

### 2. Policy Enforcement

Real policy checks using `GoalGuardFSM` evaluate principal permissions against action requirements.

### 3. CRV Validation

Real CRV validation runs on tool outputs, blocking tools when validation fails.

### 4. Side Effect Capture

Side effects are captured through sandbox isolation in both dry-run and live modes.

## Testing

Integration tests are located in `tests/agent-builder-sandbox-integration.test.ts`.

Run tests:

```bash
cd apps/console
npm test agent-builder-sandbox-integration.test.ts
```

## See Also

- [Sandbox Implementation Summary](../../../SANDBOX_IMPLEMENTATION_SUMMARY.md)
- [CRV Implementation Summary](../../../CRV_IMPLEMENTATION_SUMMARY.md)
