"""
Tests for CRV models.
"""

import pytest

from aureus_sdk.models.crv import (
    AskUserStrategy,
    Commit,
    EscalateStrategy,
    FailureTaxonomy,
    GateConfig,
    GateResult,
    IgnoreStrategy,
    RecoveryResult,
    RetryAltToolStrategy,
    ValidationResult,
)


def test_validation_result():
    """Test validation result model."""
    result = ValidationResult(
        valid=True,
        reason="All checks passed",
        confidence=0.95,
        metadata={"checks_run": 5},
    )
    
    assert result.valid is True
    assert result.reason == "All checks passed"
    assert result.confidence == 0.95
    assert result.metadata["checks_run"] == 5


def test_validation_result_with_failure():
    """Test validation result with failure."""
    result = ValidationResult(
        valid=False,
        reason="Missing required field",
        confidence=1.0,
        failure_code=FailureTaxonomy.MISSING_DATA,
        remediation="Ensure all required data fields are present",
    )
    
    assert result.valid is False
    assert result.failure_code == FailureTaxonomy.MISSING_DATA
    assert result.remediation is not None


def test_commit():
    """Test commit model."""
    commit = Commit(
        id="commit-123",
        data={"balance": 1000, "currency": "USD"},
        previous_state={"balance": 500, "currency": "USD"},
        metadata={"user_id": "user-123"},
    )
    
    assert commit.id == "commit-123"
    assert commit.data["balance"] == 1000
    assert commit.previous_state["balance"] == 500


def test_retry_alt_tool_strategy():
    """Test retry alternative tool strategy."""
    strategy = RetryAltToolStrategy(
        tool_name="backup_tool",
        max_retries=3,
    )
    
    assert strategy.type == "retry_alt_tool"
    assert strategy.tool_name == "backup_tool"
    assert strategy.max_retries == 3


def test_ask_user_strategy():
    """Test ask user strategy."""
    strategy = AskUserStrategy(
        prompt="Please confirm this action",
    )
    
    assert strategy.type == "ask_user"
    assert strategy.prompt == "Please confirm this action"


def test_escalate_strategy():
    """Test escalate strategy."""
    strategy = EscalateStrategy(
        reason="Critical error requires human review",
    )
    
    assert strategy.type == "escalate"
    assert strategy.reason == "Critical error requires human review"


def test_ignore_strategy():
    """Test ignore strategy."""
    strategy = IgnoreStrategy(
        justification="Known issue, safe to ignore",
    )
    
    assert strategy.type == "ignore"
    assert strategy.justification == "Known issue, safe to ignore"


def test_gate_config():
    """Test gate configuration."""
    config = GateConfig(
        name="Validation Gate",
        validators=["not_null", "schema_check"],
        block_on_failure=True,
        required_confidence=0.8,
    )
    
    assert config.name == "Validation Gate"
    assert len(config.validators) == 2
    assert config.block_on_failure is True
    assert config.required_confidence == 0.8


def test_gate_result():
    """Test gate result."""
    result = GateResult(
        passed=False,
        gate_name="Validation Gate",
        validation_results=[
            ValidationResult(
                valid=False,
                reason="Schema mismatch",
                failure_code=FailureTaxonomy.CONFLICT,
            )
        ],
        blocked_commit=True,
        timestamp="2024-01-01T00:00:00Z",
        crv_status="blocked",
        failure_code=FailureTaxonomy.CONFLICT,
    )
    
    assert result.passed is False
    assert result.blocked_commit is True
    assert result.crv_status == "blocked"
    assert result.failure_code == FailureTaxonomy.CONFLICT


def test_recovery_result():
    """Test recovery result."""
    result = RecoveryResult(
        success=True,
        strategy={"type": "retry_alt_tool", "tool_name": "backup_tool"},
        message="Successfully recovered using alternative tool",
        recovered_data={"balance": 1000},
    )
    
    assert result.success is True
    assert result.strategy["type"] == "retry_alt_tool"
    assert result.recovered_data["balance"] == 1000


def test_failure_taxonomy_values():
    """Test failure taxonomy enum values."""
    assert FailureTaxonomy.MISSING_DATA.value == "MISSING_DATA"
    assert FailureTaxonomy.CONFLICT.value == "CONFLICT"
    assert FailureTaxonomy.OUT_OF_SCOPE.value == "OUT_OF_SCOPE"
    assert FailureTaxonomy.LOW_CONFIDENCE.value == "LOW_CONFIDENCE"
    assert FailureTaxonomy.POLICY_VIOLATION.value == "POLICY_VIOLATION"
    assert FailureTaxonomy.TOOL_ERROR.value == "TOOL_ERROR"
    assert FailureTaxonomy.NON_DETERMINISM.value == "NON_DETERMINISM"


def test_validation_result_serialization():
    """Test validation result serialization."""
    result = ValidationResult(
        valid=True,
        reason="All checks passed",
        confidence=0.95,
    )
    
    result_dict = result.model_dump()
    assert result_dict["valid"] is True
    assert result_dict["confidence"] == 0.95


def test_gate_config_serialization():
    """Test gate config serialization."""
    config = GateConfig(
        name="Test Gate",
        validators=["validator1"],
        block_on_failure=True,
    )
    
    config_json = config.model_dump_json()
    assert "Test Gate" in config_json
    assert "validator1" in config_json
