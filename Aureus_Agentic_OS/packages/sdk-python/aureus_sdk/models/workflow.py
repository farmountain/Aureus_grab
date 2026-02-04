"""
Workflow specification models matching the TypeScript WorkflowSpec schema.
"""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from aureus_sdk.models.common import DataZone, Intent, Permission, RiskTier


class SandboxType(str, Enum):
    """Sandbox execution types."""

    MOCK = "mock"
    SIMULATION = "simulation"
    CONTAINER = "container"
    VM = "vm"
    PROCESS = "process"


class TaskType(str, Enum):
    """Task types in workflow."""

    ACTION = "action"
    DECISION = "decision"
    PARALLEL = "parallel"


class RetryConfig(BaseModel):
    """Retry configuration for tasks."""

    max_attempts: int = Field(..., ge=1, description="Maximum retry attempts")
    backoff_ms: int = Field(..., ge=1, description="Initial backoff in milliseconds")
    backoff_multiplier: Optional[float] = Field(None, ge=0, description="Backoff multiplier")
    jitter: Optional[bool] = Field(None, description="Enable jitter")


class CompensationAction(BaseModel):
    """Compensation action to run on failure."""

    tool: str = Field(..., description="Tool to execute")
    args: Dict[str, Any] = Field(default_factory=dict, description="Tool arguments")


class CompensationHook(BaseModel):
    """Compensation hooks for task failures."""

    on_failure: Optional[str] = Field(None, description="Action on failure")
    on_timeout: Optional[str] = Field(None, description="Action on timeout")


class SandboxConfig(BaseModel):
    """Sandbox configuration for task execution."""

    enabled: bool = Field(..., description="Enable sandbox")
    type: Optional[SandboxType] = Field(None, description="Sandbox type")
    simulation_mode: Optional[bool] = Field(None, description="Enable simulation mode")
    permissions: Optional[Dict[str, Any]] = Field(None, description="Sandbox permissions")


class TaskSpec(BaseModel):
    """Task specification within a workflow."""

    id: str = Field(..., description="Unique task identifier")
    name: str = Field(..., description="Task name")
    type: TaskType = Field(..., description="Task type")
    inputs: Optional[Dict[str, Any]] = Field(None, description="Task inputs")
    retry: Optional[RetryConfig] = Field(None, description="Retry configuration")
    idempotency_key: Optional[str] = Field(None, description="Idempotency key")
    timeout_ms: Optional[int] = Field(None, ge=1, description="Timeout in milliseconds")
    risk_tier: Optional[RiskTier] = Field(None, description="Risk tier")
    compensation: Optional[CompensationHook] = Field(None, description="Compensation hooks")
    compensation_action: Optional[CompensationAction] = Field(
        None, description="Compensation action"
    )
    tool_name: Optional[str] = Field(None, description="Tool name to execute")
    required_permissions: Optional[List[Permission]] = Field(
        None, description="Required permissions"
    )
    allowed_tools: Optional[List[str]] = Field(None, description="Allowed tools")
    intent: Optional[Intent] = Field(None, description="Task intent")
    data_zone: Optional[DataZone] = Field(None, description="Data zone")
    sandbox_config: Optional[SandboxConfig] = Field(None, description="Sandbox configuration")


class SafetyRule(BaseModel):
    """Safety rule for workflow validation."""

    type: str = Field(..., description="Rule type")
    description: Optional[str] = Field(None, description="Rule description")


class SafetyPolicy(BaseModel):
    """Safety policy for workflow execution."""

    name: str = Field(..., description="Policy name")
    description: Optional[str] = Field(None, description="Policy description")
    rules: List[SafetyRule] = Field(..., description="Safety rules")
    fail_fast: Optional[bool] = Field(None, description="Fail fast on rule violation")


class WorkflowSpec(BaseModel):
    """
    Workflow specification matching the TypeScript WorkflowSpec schema.
    
    This model represents a complete workflow definition with tasks, dependencies,
    and safety policies.
    """

    id: str = Field(..., description="Unique workflow identifier")
    name: str = Field(..., description="Workflow name")
    goal: Optional[str] = Field(None, description="Workflow goal")
    constraints: Optional[List[str]] = Field(None, description="Workflow constraints")
    success_criteria: Optional[List[str]] = Field(None, description="Success criteria")
    tasks: List[TaskSpec] = Field(..., description="List of tasks")
    dependencies: Dict[str, List[str]] = Field(
        ..., description="Task dependencies map (task_id -> [dependent_task_ids])"
    )
    safety_policy: Optional[SafetyPolicy] = Field(None, description="Safety policy")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "example-workflow-001",
                "name": "Example Workflow",
                "goal": "Process data safely",
                "tasks": [
                    {
                        "id": "task1",
                        "name": "Read Data",
                        "type": "action",
                        "tool_name": "read_file",
                        "risk_tier": "LOW",
                    }
                ],
                "dependencies": {"task1": []},
            }
        }
    )
