"""
Workflow execution models.
"""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from aureus_sdk.models.workflow import WorkflowSpec


class WorkflowExecutionRequest(BaseModel):
    """Request to execute a workflow."""

    workflow: WorkflowSpec = Field(..., description="Workflow specification to execute")
    context: Optional[Dict[str, Any]] = Field(None, description="Execution context")
    correlation_id: Optional[str] = Field(None, description="Correlation ID for tracing")


class TaskExecutionResult(BaseModel):
    """Result of a single task execution."""

    task_id: str = Field(..., description="Task identifier")
    status: str = Field(..., description="Execution status: success, failed, skipped")
    result: Optional[Any] = Field(None, description="Task result")
    error: Optional[str] = Field(None, description="Error message if failed")
    duration_ms: Optional[float] = Field(None, description="Execution duration in milliseconds")


class WorkflowExecutionResult(BaseModel):
    """Result of workflow execution."""

    workflow_id: str = Field(..., description="Workflow identifier")
    status: str = Field(..., description="Overall status: success, failed, partial")
    task_results: Dict[str, TaskExecutionResult] = Field(..., description="Task execution results")
    error: Optional[str] = Field(None, description="Error message if failed")
    duration_ms: Optional[float] = Field(None, description="Total execution duration")
    correlation_id: Optional[str] = Field(None, description="Correlation ID")
