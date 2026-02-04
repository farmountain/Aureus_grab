"""
Tests for workflow models.
"""

import pytest
from pydantic import ValidationError

from aureus_sdk.models.workflow import (
    CompensationAction,
    CompensationHook,
    DataZone,
    Intent,
    Permission,
    RetryConfig,
    RiskTier,
    SafetyPolicy,
    SafetyRule,
    SandboxConfig,
    SandboxType,
    TaskSpec,
    TaskType,
    WorkflowSpec,
)


def test_workflow_spec_minimal():
    """Test creating a minimal workflow spec."""
    workflow = WorkflowSpec(
        id="test-workflow",
        name="Test Workflow",
        tasks=[
            TaskSpec(
                id="task1",
                name="First Task",
                type=TaskType.ACTION,
            )
        ],
        dependencies={"task1": []},
    )
    
    assert workflow.id == "test-workflow"
    assert workflow.name == "Test Workflow"
    assert len(workflow.tasks) == 1
    assert workflow.tasks[0].id == "task1"


def test_workflow_spec_full():
    """Test creating a full workflow spec with all fields."""
    workflow = WorkflowSpec(
        id="test-workflow",
        name="Test Workflow",
        goal="Process data safely",
        constraints=["Must validate inputs", "Must log operations"],
        success_criteria=["All tasks succeed", "No errors"],
        tasks=[
            TaskSpec(
                id="task1",
                name="First Task",
                type=TaskType.ACTION,
                tool_name="test_tool",
                risk_tier=RiskTier.LOW,
                intent=Intent.READ,
                retry=RetryConfig(
                    max_attempts=3,
                    backoff_ms=1000,
                    backoff_multiplier=2.0,
                    jitter=True,
                ),
                timeout_ms=5000,
                required_permissions=[
                    Permission(
                        action="read",
                        resource="test_resource",
                        intent=Intent.READ,
                        data_zone=DataZone.INTERNAL,
                    )
                ],
                sandbox_config=SandboxConfig(
                    enabled=True,
                    type=SandboxType.CONTAINER,
                    simulation_mode=False,
                ),
            )
        ],
        dependencies={"task1": []},
        safety_policy=SafetyPolicy(
            name="Test Policy",
            description="Test safety policy",
            rules=[
                SafetyRule(type="validation", description="Validate inputs")
            ],
            fail_fast=True,
        ),
    )
    
    assert workflow.goal == "Process data safely"
    assert len(workflow.constraints) == 2
    assert len(workflow.success_criteria) == 2
    assert workflow.tasks[0].risk_tier == RiskTier.LOW
    assert workflow.tasks[0].retry.max_attempts == 3
    assert workflow.safety_policy.name == "Test Policy"


def test_task_spec_validation():
    """Test task spec validation."""
    # Valid task
    task = TaskSpec(
        id="task1",
        name="Test Task",
        type=TaskType.ACTION,
    )
    assert task.id == "task1"
    
    # Invalid timeout (negative)
    with pytest.raises(ValidationError):
        TaskSpec(
            id="task1",
            name="Test Task",
            type=TaskType.ACTION,
            timeout_ms=-1,
        )


def test_retry_config():
    """Test retry configuration."""
    retry = RetryConfig(
        max_attempts=5,
        backoff_ms=1000,
        backoff_multiplier=2.0,
        jitter=True,
    )
    
    assert retry.max_attempts == 5
    assert retry.backoff_ms == 1000
    assert retry.backoff_multiplier == 2.0
    assert retry.jitter is True


def test_compensation_action():
    """Test compensation action."""
    action = CompensationAction(
        tool="rollback_tool",
        args={"transaction_id": "tx-123"},
    )
    
    assert action.tool == "rollback_tool"
    assert action.args["transaction_id"] == "tx-123"


def test_compensation_hook():
    """Test compensation hook."""
    hook = CompensationHook(
        on_failure="rollback",
        on_timeout="cancel",
    )
    
    assert hook.on_failure == "rollback"
    assert hook.on_timeout == "cancel"


def test_sandbox_config():
    """Test sandbox configuration."""
    config = SandboxConfig(
        enabled=True,
        type=SandboxType.CONTAINER,
        simulation_mode=False,
        permissions={"network": "allowed", "filesystem": "read-only"},
    )
    
    assert config.enabled is True
    assert config.type == SandboxType.CONTAINER
    assert config.permissions["network"] == "allowed"


def test_workflow_spec_serialization():
    """Test workflow spec serialization to JSON."""
    workflow = WorkflowSpec(
        id="test-workflow",
        name="Test Workflow",
        tasks=[
            TaskSpec(
                id="task1",
                name="First Task",
                type=TaskType.ACTION,
            )
        ],
        dependencies={"task1": []},
    )
    
    # Serialize to dict
    workflow_dict = workflow.model_dump()
    assert workflow_dict["id"] == "test-workflow"
    assert workflow_dict["name"] == "Test Workflow"
    
    # Serialize to JSON
    workflow_json = workflow.model_dump_json()
    assert "test-workflow" in workflow_json


def test_workflow_spec_deserialization():
    """Test workflow spec deserialization from JSON."""
    workflow_data = {
        "id": "test-workflow",
        "name": "Test Workflow",
        "tasks": [
            {
                "id": "task1",
                "name": "First Task",
                "type": "action",
            }
        ],
        "dependencies": {"task1": []},
    }
    
    workflow = WorkflowSpec.model_validate(workflow_data)
    assert workflow.id == "test-workflow"
    assert workflow.name == "Test Workflow"
    assert len(workflow.tasks) == 1


def test_enum_values():
    """Test enum values."""
    assert RiskTier.LOW.value == "LOW"
    assert Intent.READ.value == "read"
    assert DataZone.INTERNAL.value == "internal"
    assert SandboxType.CONTAINER.value == "container"
    assert TaskType.ACTION.value == "action"
