"""
Tests for client functionality.
"""

import json
from unittest.mock import Mock, patch

import httpx
import pytest

from aureus_sdk import (
    AureusClient,
    Commit,
    GateConfig,
    Metric,
    TaskSpec,
    TaskType,
    TelemetryEvent,
    TelemetryEventType,
    WorkflowSpec,
)


@pytest.fixture
def client():
    """Create a test client."""
    return AureusClient(base_url="http://localhost:3000", timeout=10.0)


@pytest.fixture
def sample_workflow():
    """Create a sample workflow."""
    return WorkflowSpec(
        id="test-workflow",
        name="Test Workflow",
        tasks=[
            TaskSpec(
                id="task1",
                name="Test Task",
                type=TaskType.ACTION,
            )
        ],
        dependencies={"task1": []},
    )


@pytest.mark.asyncio
async def test_client_context_manager():
    """Test client as context manager."""
    async with AureusClient(base_url="http://localhost:3000") as client:
        assert client.base_url == "http://localhost:3000"
        assert client.timeout == 30.0


@pytest.mark.asyncio
async def test_client_with_api_key():
    """Test client with API key."""
    client = AureusClient(
        base_url="http://localhost:3000",
        api_key="test-key",
    )
    
    assert "Authorization" in client.headers
    assert client.headers["Authorization"] == "Bearer test-key"
    
    await client.close()


@pytest.mark.asyncio
async def test_execute_workflow(client, sample_workflow):
    """Test workflow execution."""
    with patch.object(client._client, "post") as mock_post:
        mock_response = Mock()
        mock_response.json.return_value = {
            "workflow_id": "test-workflow",
            "status": "success",
            "task_results": {
                "task1": {
                    "task_id": "task1",
                    "status": "success",
                    "duration_ms": 100.0,
                }
            },
            "duration_ms": 100.0,
        }
        mock_post.return_value = mock_response
        
        result = await client.execute_workflow(sample_workflow)
        
        assert result.workflow_id == "test-workflow"
        assert result.status == "success"
        assert "task1" in result.task_results
        
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert call_args[1]["json"]["workflow"]["id"] == "test-workflow"


@pytest.mark.asyncio
async def test_get_workflow_status(client):
    """Test getting workflow status."""
    with patch.object(client._client, "get") as mock_get:
        mock_response = Mock()
        mock_response.json.return_value = {
            "workflow_id": "test-workflow",
            "status": "running",
            "progress": 0.5,
        }
        mock_get.return_value = mock_response
        
        status = await client.get_workflow_status("test-workflow")
        
        assert status["workflow_id"] == "test-workflow"
        assert status["status"] == "running"
        
        mock_get.assert_called_once_with("/api/v1/workflows/test-workflow/status")


@pytest.mark.asyncio
async def test_validate_commit(client):
    """Test CRV commit validation."""
    commit = Commit(
        id="commit-123",
        data={"value": 100},
    )
    
    gate_config = GateConfig(
        name="Test Gate",
        validators=["not_null"],
        block_on_failure=True,
    )
    
    with patch.object(client._client, "post") as mock_post:
        mock_response = Mock()
        mock_response.json.return_value = {
            "passed": True,
            "gate_name": "Test Gate",
            "validation_results": [
                {"valid": True, "reason": "All checks passed"}
            ],
            "blocked_commit": False,
            "timestamp": "2024-01-01T00:00:00Z",
            "crv_status": "passed",
        }
        mock_post.return_value = mock_response
        
        result = await client.validate_commit(commit, gate_config)
        
        assert result.passed is True
        assert result.gate_name == "Test Gate"
        assert result.crv_status == "passed"


@pytest.mark.asyncio
async def test_report_event(client):
    """Test reporting telemetry event."""
    event = TelemetryEvent(
        type=TelemetryEventType.STEP_START,
        timestamp="2024-01-01T00:00:00Z",
        workflow_id="test-workflow",
        data={"step": "start"},
    )
    
    with patch.object(client._client, "post") as mock_post:
        mock_response = Mock()
        mock_post.return_value = mock_response
        
        await client.report_event(event)
        
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert call_args[0][0] == "/api/v1/observability/events"


@pytest.mark.asyncio
async def test_report_metric(client):
    """Test reporting metric."""
    metric = Metric(
        name="task.duration",
        value=123.45,
        timestamp="2024-01-01T00:00:00Z",
        tags={"workflow_id": "test-workflow"},
    )
    
    with patch.object(client._client, "post") as mock_post:
        mock_response = Mock()
        mock_post.return_value = mock_response
        
        await client.report_metric(metric)
        
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert call_args[0][0] == "/api/v1/observability/metrics"


@pytest.mark.asyncio
async def test_get_metrics(client):
    """Test querying metrics."""
    with patch.object(client._client, "get") as mock_get:
        mock_response = Mock()
        mock_response.json.return_value = [
            {
                "name": "task.duration",
                "value": 123.45,
                "timestamp": "2024-01-01T00:00:00Z",
                "tags": {"workflow_id": "test-workflow"},
            }
        ]
        mock_get.return_value = mock_response
        
        metrics = await client.get_metrics(
            metric_name="task.duration",
            tags={"workflow_id": "test-workflow"},
        )
        
        assert len(metrics) == 1
        assert metrics[0].name == "task.duration"
        assert metrics[0].value == 123.45


@pytest.mark.asyncio
async def test_check_permission(client):
    """Test checking permission."""
    from aureus_sdk import Action, Permission, Principal, PolicyRiskTier
    
    principal = Principal(
        id="user-001",
        type="human",
        permissions=[],
    )
    
    action = Action(
        id="read-data",
        name="Read Data",
        risk_tier=PolicyRiskTier.LOW,
        required_permissions=[],
    )
    
    with patch.object(client._client, "post") as mock_post:
        mock_response = Mock()
        mock_response.json.return_value = {"allowed": True}
        mock_post.return_value = mock_response
        
        allowed = await client.check_permission(principal, action)
        
        assert allowed is True


@pytest.mark.asyncio
async def test_close_client(client):
    """Test closing the client."""
    with patch.object(client._client, "aclose") as mock_close:
        await client.close()
        mock_close.assert_called_once()
