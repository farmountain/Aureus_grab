# Aureus Python SDK

Python client bindings for Aureus Agentic OS, providing typed interfaces for workflow execution, CRV validation, policy evaluation, and observability reporting.

## Installation

```bash
pip install aureus-sdk
```

Or for development:

```bash
cd packages/sdk-python
pip install -e ".[dev]"
```

## Features

- **Workflow Execution**: Execute workflows with typed WorkflowSpec models
- **CRV Validation**: Circuit Reasoning Validation with gates and validators
- **Policy Evaluation**: Goal-guard FSM and permission-based policy checks
- **Observability**: Telemetry events, metrics, spans, and distributed tracing

## Quick Start

See [docs/sdk-python-usage.md](../../docs/sdk-python-usage.md) for detailed usage examples.

```python
from aureus_sdk import AureusClient, WorkflowSpec, TaskSpec, TaskType

# Create client
client = AureusClient(base_url="http://localhost:3000")

# Define workflow
workflow = WorkflowSpec(
    id="example-workflow",
    name="Example Workflow",
    tasks=[
        TaskSpec(
            id="task1",
            name="First Task",
            type=TaskType.ACTION,
            tool_name="example_tool"
        )
    ],
    dependencies={"task1": []}
)

# Execute workflow
result = await client.execute_workflow(workflow)
print(f"Workflow result: {result}")
```

## Development

Run tests:

```bash
pytest
```

Type checking:

```bash
mypy aureus_sdk
```

Format code:

```bash
black aureus_sdk tests
```

## License

MIT
