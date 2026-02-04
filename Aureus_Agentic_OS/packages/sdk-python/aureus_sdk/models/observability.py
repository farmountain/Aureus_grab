"""
Observability models matching the TypeScript telemetry types.
"""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TelemetryEventType(str, Enum):
    """Telemetry event types."""

    STEP_START = "step_start"
    STEP_END = "step_end"
    TOOL_CALL = "tool_call"
    CRV_RESULT = "crv_result"
    POLICY_CHECK = "policy_check"
    SNAPSHOT_COMMIT = "snapshot_commit"
    ROLLBACK = "rollback"
    CUSTOM = "custom"


class LogLevel(str, Enum):
    """Log levels."""

    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"


class TelemetryEvent(BaseModel):
    """Telemetry event for tracking agent operations."""

    type: TelemetryEventType = Field(..., description="Event type")
    timestamp: str = Field(..., description="Event timestamp")
    workflow_id: Optional[str] = Field(None, description="Workflow identifier")
    task_id: Optional[str] = Field(None, description="Task identifier")
    task_type: Optional[str] = Field(None, description="Task type")
    correlation_id: Optional[str] = Field(None, description="Correlation ID for distributed tracing")
    data: Dict[str, Any] = Field(..., description="Event data")
    tags: Optional[Dict[str, str]] = Field(None, description="Event tags")


class Metric(BaseModel):
    """Metric for observability."""

    name: str = Field(..., description="Metric name")
    value: float = Field(..., description="Metric value")
    timestamp: str = Field(..., description="Metric timestamp")
    tags: Optional[Dict[str, str]] = Field(None, description="Metric tags")


class LogEntry(BaseModel):
    """Log entry."""

    timestamp: str = Field(..., description="Log timestamp")
    level: LogLevel = Field(..., description="Log level")
    message: str = Field(..., description="Log message")
    context: Optional[Dict[str, Any]] = Field(None, description="Log context")


class Span(BaseModel):
    """Trace span for distributed tracing."""

    id: str = Field(..., description="Span identifier")
    trace_id: str = Field(..., description="Trace identifier")
    parent_id: Optional[str] = Field(None, description="Parent span identifier")
    name: str = Field(..., description="Span name")
    start_time: str = Field(..., description="Start timestamp")
    end_time: Optional[str] = Field(None, description="End timestamp")
    duration: Optional[float] = Field(None, description="Duration in milliseconds")
    tags: Optional[Dict[str, str]] = Field(None, description="Span tags")
    logs: Optional[List[LogEntry]] = Field(None, description="Span logs")
