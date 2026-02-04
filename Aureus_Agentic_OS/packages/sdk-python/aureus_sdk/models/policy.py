"""
Policy models matching the TypeScript policy types.
"""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from aureus_sdk.models.common import DataZone, Intent, Permission


class PolicyRiskTier(str, Enum):
    """Risk tiers for action classification (lowercase values for policy API)."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class GoalGuardState(str, Enum):
    """FSM state for goal-guard."""

    IDLE = "idle"
    EVALUATING = "evaluating"
    APPROVED = "approved"
    REJECTED = "rejected"
    PENDING_HUMAN = "pending_human"


class Action(BaseModel):
    """Action definition with risk classification."""

    id: str = Field(..., description="Action identifier")
    name: str = Field(..., description="Action name")
    risk_tier: PolicyRiskTier = Field(..., description="Risk tier")
    required_permissions: List[Permission] = Field(..., description="Required permissions")
    intent: Optional[Intent] = Field(None, description="Action intent")
    data_zone: Optional[DataZone] = Field(None, description="Data zone")
    allowed_tools: Optional[List[str]] = Field(None, description="Allowed tools")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class GuardDecision(BaseModel):
    """Goal-guard decision result."""

    allowed: bool = Field(..., description="Whether action is allowed")
    reason: str = Field(..., description="Decision reason")
    requires_human_approval: bool = Field(..., description="Whether human approval is required")
    approval_token: Optional[str] = Field(None, description="Approval token if required")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class Principal(BaseModel):
    """Principal (actor) attempting an action."""

    id: str = Field(..., description="Principal identifier")
    type: str = Field(..., description="Principal type: agent, human, or service")
    permissions: List[Permission] = Field(..., description="Principal permissions")


class StateTransition(BaseModel):
    """State transition information."""

    from_state: GoalGuardState = Field(..., alias="from", description="Source state")
    to_state: GoalGuardState = Field(..., alias="to", description="Target state")

    model_config = ConfigDict(populate_by_name=True)


class AuditEntry(BaseModel):
    """Audit entry for action tracking."""

    timestamp: str = Field(..., description="Timestamp of entry")
    principal: Principal = Field(..., description="Principal who performed action")
    action: Action = Field(..., description="Action performed")
    decision: GuardDecision = Field(..., description="Guard decision")
    state_transition: Optional[StateTransition] = Field(None, description="State transition")
    approval_token: Optional[str] = Field(None, description="Approval token used")


class PolicyContext(BaseModel):
    """Context for policy evaluation."""

    principal: Principal = Field(..., description="Principal requesting action")
    action: Action = Field(..., description="Action to evaluate")
    current_state: GoalGuardState = Field(..., description="Current guard state")
    audit_log: List[AuditEntry] = Field(..., description="Audit log entries")


class ApprovalToken(BaseModel):
    """Approval token for HIGH/CRITICAL risk actions."""

    token: str = Field(..., description="Token string")
    action_id: str = Field(..., description="Action identifier")
    principal: Principal = Field(..., description="Principal who requested")
    expires_at: str = Field(..., description="Expiration timestamp")
    used: bool = Field(..., description="Whether token has been used")
