"""
Basic usage example for Aureus Python SDK.

This example demonstrates how to:
1. Create a workflow specification
2. Execute a workflow
3. Report telemetry events
4. Validate commits with CRV gates
"""

import asyncio
from datetime import datetime

from aureus_sdk import (
    AureusClient,
    Commit,
    DataZone,
    GateConfig,
    Intent,
    Metric,
    RiskTier,
    TaskSpec,
    TaskType,
    TelemetryEvent,
    TelemetryEventType,
    WorkflowSpec,
)


async def main():
    """Main example function."""
    
    # Create client (connects to Aureus API)
    async with AureusClient(base_url="http://localhost:3000") as client:
        print("✓ Connected to Aureus Agentic OS")
        
        # 1. Define a workflow
        workflow = WorkflowSpec(
            id="example-data-processing",
            name="Data Processing Example",
            goal="Process user data safely and efficiently",
            constraints=[
                "Must validate all inputs",
                "Must log all operations",
                "Must handle errors gracefully",
            ],
            success_criteria=[
                "All tasks complete successfully",
                "No data loss",
                "All validations pass",
            ],
            tasks=[
                TaskSpec(
                    id="read-input",
                    name="Read Input Data",
                    type=TaskType.ACTION,
                    tool_name="read_file",
                    risk_tier=RiskTier.LOW,
                    intent=Intent.READ,
                    data_zone=DataZone.INTERNAL,
                ),
                TaskSpec(
                    id="validate-schema",
                    name="Validate Data Schema",
                    type=TaskType.ACTION,
                    tool_name="validate_schema",
                    risk_tier=RiskTier.LOW,
                    intent=Intent.READ,
                ),
                TaskSpec(
                    id="transform-data",
                    name="Transform Data",
                    type=TaskType.ACTION,
                    tool_name="transform_data",
                    risk_tier=RiskTier.MEDIUM,
                    intent=Intent.WRITE,
                    timeout_ms=30000,
                ),
                TaskSpec(
                    id="save-output",
                    name="Save Output Data",
                    type=TaskType.ACTION,
                    tool_name="write_file",
                    risk_tier=RiskTier.MEDIUM,
                    intent=Intent.WRITE,
                ),
            ],
            dependencies={
                "read-input": [],
                "validate-schema": ["read-input"],
                "transform-data": ["validate-schema"],
                "save-output": ["transform-data"],
            },
        )
        
        print(f"\n✓ Created workflow: {workflow.name}")
        print(f"  - Tasks: {len(workflow.tasks)}")
        print(f"  - Goal: {workflow.goal}")
        
        # 2. Execute the workflow (in a real scenario)
        # Note: This requires a running Aureus API server
        try:
            print("\n→ Attempting to execute workflow...")
            result = await client.execute_workflow(
                workflow=workflow,
                context={"user_id": "user-123", "batch_id": "batch-001"},
                correlation_id="example-trace-001",
            )
            print(f"✓ Workflow executed: {result.status}")
            print(f"  - Duration: {result.duration_ms}ms")
            
            for task_id, task_result in result.task_results.items():
                status_icon = "✓" if task_result.status == "success" else "✗"
                print(f"  {status_icon} {task_id}: {task_result.status}")
                
        except Exception as e:
            print(f"  Note: Could not execute workflow (API not available)")
            print(f"  Error: {e}")
        
        # 3. Report telemetry event
        print("\n→ Reporting telemetry event...")
        event = TelemetryEvent(
            type=TelemetryEventType.STEP_START,
            timestamp=datetime.utcnow().isoformat(),
            workflow_id="example-data-processing",
            task_id="read-input",
            task_type=TaskType.ACTION.value,
            correlation_id="example-trace-001",
            data={
                "step_name": "data_processing",
                "inputs": {"file": "data.csv"},
            },
            tags={
                "env": "development",
                "version": "1.0",
            },
        )
        
        try:
            await client.report_event(event)
            print("✓ Telemetry event reported")
        except Exception as e:
            print(f"  Note: Could not report event (API not available)")
        
        # 4. Report a metric
        print("\n→ Reporting metric...")
        metric = Metric(
            name="task.duration",
            value=1234.5,
            timestamp=datetime.utcnow().isoformat(),
            tags={
                "workflow_id": "example-data-processing",
                "task_id": "read-input",
                "status": "success",
            },
        )
        
        try:
            await client.report_metric(metric)
            print("✓ Metric reported")
        except Exception as e:
            print(f"  Note: Could not report metric (API not available)")
        
        # 5. Validate a commit with CRV gate
        print("\n→ Validating commit with CRV gate...")
        commit = Commit(
            id="commit-001",
            data={
                "balance": 1000,
                "currency": "USD",
                "user_id": "user-123",
            },
            previous_state={
                "balance": 500,
                "currency": "USD",
                "user_id": "user-123",
            },
            metadata={
                "transaction_id": "tx-001",
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        
        gate_config = GateConfig(
            name="Balance Validation Gate",
            validators=["not_null", "schema_check", "balance_positive"],
            block_on_failure=True,
            required_confidence=0.8,
        )
        
        try:
            result = await client.validate_commit(commit, gate_config)
            if result.passed:
                print("✓ CRV validation passed")
            else:
                print(f"✗ CRV validation failed: {result.crv_status}")
                for validation in result.validation_results:
                    if not validation.valid:
                        print(f"  - {validation.reason}")
        except Exception as e:
            print(f"  Note: Could not validate commit (API not available)")
        
        print("\n✓ Example completed!")
        print("\nNote: Some operations require a running Aureus API server.")
        print("See docs/sdk-python-usage.md for more examples.")


if __name__ == "__main__":
    asyncio.run(main())
