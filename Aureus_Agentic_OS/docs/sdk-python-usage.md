# Python SDK Usage Guide

This guide demonstrates how to use the Aureus Python SDK to interact with the Aureus Agentic OS.

## Installation

```bash
cd packages/sdk-python
pip install -e ".[dev]"
```

## Quick Start

### Initialize the Client

```python
from aureus_sdk import AureusClient

# Create client with default settings
client = AureusClient(base_url="http://localhost:3000")

# Or with API key authentication
client = AureusClient(
    base_url="http://localhost:3000",
    api_key="your-api-key",
    timeout=60.0
)

# Use as async context manager (recommended)
async with AureusClient(base_url="http://localhost:3000") as client:
    # Use client here
    pass
```

## Workflow Execution

### Define and Execute a Workflow

```python
from aureus_sdk import (
    AureusClient,
    WorkflowSpec,
    TaskSpec,
    TaskType,
    RiskTier,
    Intent,
    RetryConfig,
)

async def execute_example_workflow():
    async with AureusClient(base_url="http://localhost:3000") as client:
        # Define workflow
        workflow = WorkflowSpec(
            id="data-processing-001",
            name="Data Processing Workflow",
            goal="Process user data safely and reliably",
            constraints=["Must validate all inputs", "Must log all operations"],
            success_criteria=["All tasks complete successfully", "No data loss"],
            tasks=[
                TaskSpec(
                    id="read-data",
                    name="Read Input Data",
                    type=TaskType.ACTION,
                    tool_name="read_file",
                    risk_tier=RiskTier.LOW,
                    intent=Intent.READ,
                    retry=RetryConfig(
                        max_attempts=3,
                        backoff_ms=1000,
                        backoff_multiplier=2.0,
                        jitter=True,
                    ),
                ),
                TaskSpec(
                    id="validate-data",
                    name="Validate Data",
                    type=TaskType.ACTION,
                    tool_name="validate_schema",
                    risk_tier=RiskTier.LOW,
                    intent=Intent.READ,
                ),
                TaskSpec(
                    id="process-data",
                    name="Process Data",
                    type=TaskType.ACTION,
                    tool_name="transform_data",
                    risk_tier=RiskTier.MEDIUM,
                    intent=Intent.WRITE,
                    timeout_ms=30000,
                ),
                TaskSpec(
                    id="save-results",
                    name="Save Results",
                    type=TaskType.ACTION,
                    tool_name="write_file",
                    risk_tier=RiskTier.MEDIUM,
                    intent=Intent.WRITE,
                ),
            ],
            dependencies={
                "read-data": [],
                "validate-data": ["read-data"],
                "process-data": ["validate-data"],
                "save-results": ["process-data"],
            },
        )
        
        # Execute workflow
        result = await client.execute_workflow(
            workflow=workflow,
            context={"user_id": "12345", "batch_id": "batch-001"},
            correlation_id="trace-001",
        )
        
        print(f"Workflow Status: {result.status}")
        print(f"Duration: {result.duration_ms}ms")
        
        for task_id, task_result in result.task_results.items():
            print(f"Task {task_id}: {task_result.status}")
            if task_result.error:
                print(f"  Error: {task_result.error}")
```

### Check Workflow Status

```python
async def check_workflow_status():
    async with AureusClient() as client:
        status = await client.get_workflow_status("data-processing-001")
        print(f"Status: {status}")
```

## CRV (Circuit Reasoning Validation)

### Validate a Commit

```python
from aureus_sdk import (
    AureusClient,
    Commit,
    GateConfig,
    FailureTaxonomy,
)

async def validate_state_change():
    async with AureusClient() as client:
        # Create commit
        commit = Commit(
            id="commit-001",
            data={"balance": 1000, "currency": "USD"},
            previous_state={"balance": 500, "currency": "USD"},
            metadata={"user_id": "user-123"},
        )
        
        # Define gate configuration
        gate_config = GateConfig(
            name="Balance Validation Gate",
            validators=["not_null", "schema_check", "balance_positive"],
            block_on_failure=True,
            required_confidence=0.8,
        )
        
        # Validate commit
        result = await client.validate_commit(commit, gate_config)
        
        if result.passed:
            print("Validation passed!")
        else:
            print(f"Validation failed: {result.crv_status}")
            for validation in result.validation_results:
                if not validation.valid:
                    print(f"  Reason: {validation.reason}")
                    if validation.remediation:
                        print(f"  Remediation: {validation.remediation}")
```

## Policy Evaluation

### Evaluate Policy for an Action

```python
from aureus_sdk import (
    AureusClient,
    Principal,
    Action,
    Permission,
    PolicyContext,
    PolicyRiskTier,
    Intent,
    DataZone,
    GoalGuardState,
)

async def evaluate_action_policy():
    async with AureusClient() as client:
        # Define principal
        principal = Principal(
            id="agent-001",
            type="agent",
            permissions=[
                Permission(
                    action="read",
                    resource="database",
                    intent=Intent.READ,
                    data_zone=DataZone.INTERNAL,
                )
            ],
        )
        
        # Define action
        action = Action(
            id="delete-records",
            name="Delete Database Records",
            risk_tier=PolicyRiskTier.CRITICAL,
            required_permissions=[
                Permission(
                    action="delete",
                    resource="database",
                    intent=Intent.DELETE,
                    data_zone=DataZone.INTERNAL,
                )
            ],
        )
        
        # Create policy context
        context = PolicyContext(
            principal=principal,
            action=action,
            current_state=GoalGuardState.EVALUATING,
            audit_log=[],
        )
        
        # Evaluate policy
        decision = await client.evaluate_policy(context)
        
        if decision.allowed:
            print("Action allowed")
        else:
            print(f"Action denied: {decision.reason}")
            if decision.requires_human_approval:
                print("Human approval required")
```

### Check Permission

```python
async def check_user_permission():
    async with AureusClient() as client:
        principal = Principal(
            id="user-001",
            type="human",
            permissions=[
                Permission(
                    action="read",
                    resource="reports",
                    intent=Intent.READ,
                )
            ],
        )
        
        action = Action(
            id="view-report",
            name="View Report",
            risk_tier=PolicyRiskTier.LOW,
            required_permissions=[
                Permission(
                    action="read",
                    resource="reports",
                    intent=Intent.READ,
                )
            ],
        )
        
        allowed = await client.check_permission(principal, action)
        print(f"Permission allowed: {allowed}")
```

## Observability

### Report Telemetry Events

```python
from datetime import datetime
from aureus_sdk import (
    AureusClient,
    TelemetryEvent,
    TelemetryEventType,
)

async def report_events():
    async with AureusClient() as client:
        # Report step start
        event = TelemetryEvent(
            type=TelemetryEventType.STEP_START,
            timestamp=datetime.utcnow().isoformat(),
            workflow_id="workflow-001",
            task_id="task-001",
            task_type="action",
            correlation_id="trace-001",
            data={
                "step_name": "data_processing",
                "inputs": {"file": "data.csv"},
            },
            tags={"env": "production", "version": "1.0"},
        )
        
        await client.report_event(event)
```

### Report Metrics

```python
from datetime import datetime
from aureus_sdk import AureusClient, Metric

async def report_metrics():
    async with AureusClient() as client:
        metric = Metric(
            name="task.duration",
            value=1234.5,
            timestamp=datetime.utcnow().isoformat(),
            tags={
                "workflow_id": "workflow-001",
                "task_id": "task-001",
                "status": "success",
            },
        )
        
        await client.report_metric(metric)
```

### Report Trace Spans

```python
from datetime import datetime
from aureus_sdk import AureusClient, Span

async def report_span():
    async with AureusClient() as client:
        span = Span(
            id="span-001",
            trace_id="trace-001",
            parent_id="span-000",
            name="process_data",
            start_time=datetime.utcnow().isoformat(),
            end_time=datetime.utcnow().isoformat(),
            duration=1234.5,
            tags={"workflow_id": "workflow-001", "task_id": "task-001"},
        )
        
        await client.report_span(span)
```

### Query Metrics

```python
async def query_metrics():
    async with AureusClient() as client:
        metrics = await client.get_metrics(
            metric_name="task.duration",
            start_time="2024-01-01T00:00:00Z",
            end_time="2024-01-02T00:00:00Z",
            tags={"workflow_id": "workflow-001"},
        )
        
        for metric in metrics:
            print(f"{metric.name}: {metric.value} at {metric.timestamp}")
```

### Get Trace

```python
async def get_trace_details():
    async with AureusClient() as client:
        spans = await client.get_trace("trace-001")
        
        for span in spans:
            print(f"Span: {span.name} ({span.duration}ms)")
```

## Error Handling

```python
import httpx
from aureus_sdk import AureusClient

async def handle_errors():
    async with AureusClient() as client:
        try:
            result = await client.execute_workflow(workflow)
        except httpx.HTTPStatusError as e:
            print(f"HTTP error: {e.response.status_code}")
            print(f"Error details: {e.response.json()}")
        except httpx.TimeoutException:
            print("Request timed out")
        except Exception as e:
            print(f"Unexpected error: {e}")
```

## Advanced Usage

### Custom Validators

```python
async def register_custom_validator():
    async with AureusClient() as client:
        validator_config = {
            "type": "custom",
            "validation_logic": "check_business_rules",
            "parameters": {
                "min_amount": 100,
                "max_amount": 10000,
            },
        }
        
        result = await client.register_validator(
            validator_id="business_rules_validator",
            validator_config=validator_config,
        )
        
        print(f"Validator registered: {result}")
```

### Request Approval for Critical Actions

```python
async def request_critical_action_approval():
    async with AureusClient() as client:
        action = Action(
            id="delete-all-data",
            name="Delete All Data",
            risk_tier=PolicyRiskTier.CRITICAL,
            required_permissions=[
                Permission(
                    action="delete",
                    resource="database",
                    intent=Intent.DELETE,
                )
            ],
        )
        
        principal = Principal(
            id="agent-001",
            type="agent",
            permissions=[],
        )
        
        approval_token = await client.request_approval(
            action=action,
            principal=principal,
            reason="Emergency cleanup required",
        )
        
        print(f"Approval token: {approval_token}")
```

## Testing

See the `tests/` directory for comprehensive test examples.

## API Reference

For detailed API documentation, see the inline docstrings in the SDK modules:

- `aureus_sdk.client.AureusClient`: Main client class
- `aureus_sdk.models.workflow`: Workflow specification models
- `aureus_sdk.models.crv`: CRV validation models
- `aureus_sdk.models.policy`: Policy evaluation models
- `aureus_sdk.models.observability`: Observability models
