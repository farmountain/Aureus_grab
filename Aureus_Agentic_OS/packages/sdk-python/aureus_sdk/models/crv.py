"""
CRV (Circuit Reasoning Validation) models matching the TypeScript CRV types.
"""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field


class FailureTaxonomy(str, Enum):
    """Failure taxonomy for CRV validation failures."""

    MISSING_DATA = "MISSING_DATA"
    CONFLICT = "CONFLICT"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    POLICY_VIOLATION = "POLICY_VIOLATION"
    TOOL_ERROR = "TOOL_ERROR"
    NON_DETERMINISM = "NON_DETERMINISM"


class ValidationResult(BaseModel):
    """Validation result from CRV operators."""

    valid: bool = Field(..., description="Whether validation passed")
    reason: Optional[str] = Field(None, description="Reason for validation result")
    confidence: Optional[float] = Field(None, ge=0, le=1, description="Confidence score (0-1)")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")
    failure_code: Optional[FailureTaxonomy] = Field(
        None, description="Stable failure code for categorization"
    )
    remediation: Optional[str] = Field(None, description="Remediation hint for the failure")


class Commit(BaseModel):
    """Commit or state change to be validated."""

    id: str = Field(..., description="Commit identifier")
    data: Any = Field(..., description="Commit data")
    previous_state: Optional[Any] = Field(None, description="Previous state")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class RetryAltToolStrategy(BaseModel):
    """Retry with alternative tool strategy."""

    type: Literal["retry_alt_tool"] = "retry_alt_tool"
    tool_name: str = Field(..., description="Alternative tool name")
    max_retries: int = Field(..., ge=1, description="Maximum retries")


class AskUserStrategy(BaseModel):
    """Ask user for input strategy."""

    type: Literal["ask_user"] = "ask_user"
    prompt: str = Field(..., description="Prompt for user")


class EscalateStrategy(BaseModel):
    """Escalate to human strategy."""

    type: Literal["escalate"] = "escalate"
    reason: str = Field(..., description="Escalation reason")


class IgnoreStrategy(BaseModel):
    """Ignore validation failure strategy."""

    type: Literal["ignore"] = "ignore"
    justification: str = Field(..., description="Justification for ignoring")


# Union type for recovery strategies
RecoveryStrategy = Union[RetryAltToolStrategy, AskUserStrategy, EscalateStrategy, IgnoreStrategy]


class RecoveryResult(BaseModel):
    """Recovery action result."""

    success: bool = Field(..., description="Whether recovery succeeded")
    strategy: Dict[str, Any] = Field(..., description="Strategy that was applied")
    message: str = Field(..., description="Result message")
    recovered_data: Optional[Any] = Field(None, description="Recovered data")


class GateConfig(BaseModel):
    """Gate configuration for blocking invalid commits."""

    name: str = Field(..., description="Gate name")
    validators: List[str] = Field(..., description="List of validator identifiers")
    block_on_failure: bool = Field(..., description="Block commit on validation failure")
    required_confidence: Optional[float] = Field(
        None, ge=0, le=1, description="Minimum confidence threshold"
    )
    recovery_strategy: Optional[Dict[str, Any]] = Field(
        None, description="Strategy to apply on failure"
    )


class GateResult(BaseModel):
    """Gate result with detailed information."""

    passed: bool = Field(..., description="Whether gate passed")
    gate_name: str = Field(..., description="Name of the gate")
    validation_results: List[ValidationResult] = Field(..., description="Validation results")
    blocked_commit: bool = Field(..., description="Whether commit was blocked")
    timestamp: str = Field(..., description="Timestamp of gate execution")
    recovery_strategy: Optional[Dict[str, Any]] = Field(None, description="Applied recovery strategy")
    crv_status: str = Field(..., description="CRV status: passed, blocked, or warning")
    failure_code: Optional[FailureTaxonomy] = Field(None, description="Failure code if failed")
    remediation: Optional[str] = Field(None, description="Remediation hint")
