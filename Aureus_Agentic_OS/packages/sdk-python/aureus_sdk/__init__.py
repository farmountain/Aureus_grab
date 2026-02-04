"""
Aureus Python SDK

Python client bindings for Aureus Agentic OS.
"""

from aureus_sdk.client import AureusClient
from aureus_sdk.models.common import DataZone, Intent, Permission, RiskTier
from aureus_sdk.models.crv import (
    Commit,
    FailureTaxonomy,
    GateConfig,
    GateResult,
    RecoveryResult,
    RecoveryStrategy,
    ValidationResult,
)
from aureus_sdk.models.execution import (
    TaskExecutionResult,
    WorkflowExecutionRequest,
    WorkflowExecutionResult,
)
from aureus_sdk.models.observability import (
    LogEntry,
    LogLevel,
    Metric,
    Span,
    TelemetryEvent,
    TelemetryEventType,
)
from aureus_sdk.models.policy import (
    Action,
    ApprovalToken,
    AuditEntry,
    GoalGuardState,
    GuardDecision,
    PolicyContext,
    PolicyRiskTier,
    Principal,
)
from aureus_sdk.models.workflow import (
    CompensationAction,
    CompensationHook,
    RetryConfig,
    SafetyPolicy,
    SafetyRule,
    SandboxConfig,
    SandboxType,
    TaskSpec,
    TaskType,
    WorkflowSpec,
)

__version__ = "0.1.0"

__all__ = [
    # Client
    "AureusClient",
    # Common types
    "RiskTier",
    "Intent",
    "DataZone",
    # Workflow models
    "WorkflowSpec",
    "TaskSpec",
    "RetryConfig",
    "CompensationAction",
    "CompensationHook",
    "SandboxConfig",
    "SafetyPolicy",
    "SafetyRule",
    "SandboxType",
    "TaskType",
    # CRV models
    "ValidationResult",
    "Commit",
    "GateConfig",
    "GateResult",
    "RecoveryStrategy",
    "RecoveryResult",
    "FailureTaxonomy",
    # Policy models
    "Permission",
    "Action",
    "GuardDecision",
    "Principal",
    "PolicyContext",
    "AuditEntry",
    "ApprovalToken",
    "GoalGuardState",
    "PolicyRiskTier",
    # Observability models
    "TelemetryEvent",
    "TelemetryEventType",
    "Metric",
    "Span",
    "LogEntry",
    "LogLevel",
    # Execution models
    "WorkflowExecutionRequest",
    "WorkflowExecutionResult",
    "TaskExecutionResult",
]
