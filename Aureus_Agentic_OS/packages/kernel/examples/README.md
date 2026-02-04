# Example Task Specifications

This directory contains example task specifications for the Aureus Kernel v0.

## Basic Example

See `basic-workflow.yaml` for a simple three-task workflow with dependencies.

## Running Tasks

```bash
# From the kernel package directory
node dist/cli.js run examples/basic-workflow.yaml

# Or if installed globally/locally
aureus run examples/basic-workflow.yaml
```

## Task Specification Format

```yaml
id: workflow-id
name: Workflow Name
tasks:
  - id: task1
    name: Task Name
    type: action  # action, decision, or parallel
    retry:
      maxAttempts: 3
      backoffMs: 1000
      backoffMultiplier: 2
      jitter: true
    timeoutMs: 5000
    riskTier: LOW  # LOW, MEDIUM, HIGH, CRITICAL
    idempotencyKey: optional-key
    compensation:
      onFailure: cleanup-task
      onTimeout: timeout-handler
dependencies:
  task2:
    - task1  # task2 depends on task1
```

## Event Log

All workflow events are logged to `./var/run/<workflow-id>/events.log` in JSON-lines format.

Event types include:
- `WORKFLOW_STARTED`
- `WORKFLOW_COMPLETED`
- `WORKFLOW_FAILED`
- `TASK_STARTED`
- `TASK_COMPLETED`
- `TASK_FAILED`
- `TASK_RETRY`
- `TASK_TIMEOUT`
- `COMPENSATION_TRIGGERED`
