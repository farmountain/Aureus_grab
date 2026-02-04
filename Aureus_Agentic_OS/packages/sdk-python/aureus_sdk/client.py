"""
Aureus SDK client for interacting with Aureus Agentic OS.
"""

import json
from typing import Any, Dict, List, Optional

import httpx

from aureus_sdk.models.crv import Commit, GateConfig, GateResult, ValidationResult
from aureus_sdk.models.execution import WorkflowExecutionRequest, WorkflowExecutionResult
from aureus_sdk.models.observability import Metric, Span, TelemetryEvent
from aureus_sdk.models.policy import Action, GuardDecision, PolicyContext, Principal
from aureus_sdk.models.workflow import WorkflowSpec


class AureusClient:
    """
    Client for interacting with Aureus Agentic OS.
    
    Provides methods for workflow execution, CRV validation, policy evaluation,
    and observability reporting.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ):
        """
        Initialize the Aureus client.
        
        Args:
            base_url: Base URL of the Aureus API
            api_key: Optional API key for authentication
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.headers = {"Content-Type": "application/json"}
        
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"
        
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=self.headers,
            timeout=timeout,
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    async def __aenter__(self) -> "AureusClient":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.close()

    # Workflow Execution Methods

    async def execute_workflow(
        self,
        workflow: WorkflowSpec,
        context: Optional[Dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
    ) -> WorkflowExecutionResult:
        """
        Execute a workflow.
        
        Args:
            workflow: Workflow specification to execute
            context: Optional execution context
            correlation_id: Optional correlation ID for tracing
            
        Returns:
            WorkflowExecutionResult with execution details
        """
        request = WorkflowExecutionRequest(
            workflow=workflow,
            context=context,
            correlation_id=correlation_id,
        )
        
        response = await self._client.post(
            "/api/v1/workflows/execute",
            json=json.loads(request.model_dump_json()),
        )
        response.raise_for_status()
        
        return WorkflowExecutionResult.model_validate(response.json())

    async def get_workflow_status(self, workflow_id: str) -> Dict[str, Any]:
        """
        Get the status of a workflow execution.
        
        Args:
            workflow_id: Workflow identifier
            
        Returns:
            Workflow status information
        """
        response = await self._client.get(f"/api/v1/workflows/{workflow_id}/status")
        response.raise_for_status()
        return response.json()

    async def cancel_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """
        Cancel a running workflow.
        
        Args:
            workflow_id: Workflow identifier
            
        Returns:
            Cancellation result
        """
        response = await self._client.post(f"/api/v1/workflows/{workflow_id}/cancel")
        response.raise_for_status()
        return response.json()

    # CRV Methods

    async def validate_commit(
        self,
        commit: Commit,
        gate_config: GateConfig,
    ) -> GateResult:
        """
        Validate a commit through a CRV gate.
        
        Args:
            commit: Commit to validate
            gate_config: Gate configuration
            
        Returns:
            GateResult with validation details
        """
        payload = {
            "commit": json.loads(commit.model_dump_json()),
            "gate_config": json.loads(gate_config.model_dump_json()),
        }
        
        response = await self._client.post("/api/v1/crv/validate", json=payload)
        response.raise_for_status()
        
        return GateResult.model_validate(response.json())

    async def register_validator(
        self,
        validator_id: str,
        validator_config: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Register a custom CRV validator.
        
        Args:
            validator_id: Unique validator identifier
            validator_config: Validator configuration
            
        Returns:
            Registration result
        """
        payload = {"validator_id": validator_id, "config": validator_config}
        response = await self._client.post("/api/v1/crv/validators", json=payload)
        response.raise_for_status()
        return response.json()

    # Policy Methods

    async def evaluate_policy(
        self,
        context: PolicyContext,
    ) -> GuardDecision:
        """
        Evaluate a policy decision.
        
        Args:
            context: Policy evaluation context
            
        Returns:
            GuardDecision with evaluation result
        """
        response = await self._client.post(
            "/api/v1/policy/evaluate",
            json=json.loads(context.model_dump_json()),
        )
        response.raise_for_status()
        
        return GuardDecision.model_validate(response.json())

    async def check_permission(
        self,
        principal: Principal,
        action: Action,
    ) -> bool:
        """
        Check if a principal has permission for an action.
        
        Args:
            principal: Principal to check
            action: Action to evaluate
            
        Returns:
            True if permitted, False otherwise
        """
        payload = {
            "principal": json.loads(principal.model_dump_json()),
            "action": json.loads(action.model_dump_json()),
        }
        
        response = await self._client.post("/api/v1/policy/check", json=payload)
        response.raise_for_status()
        
        result = response.json()
        return result.get("allowed", False)

    async def request_approval(
        self,
        action: Action,
        principal: Principal,
        reason: str,
    ) -> str:
        """
        Request approval for a high-risk action.
        
        Args:
            action: Action requiring approval
            principal: Principal requesting approval
            reason: Reason for the request
            
        Returns:
            Approval token
        """
        payload = {
            "action": json.loads(action.model_dump_json()),
            "principal": json.loads(principal.model_dump_json()),
            "reason": reason,
        }
        
        response = await self._client.post("/api/v1/policy/approval", json=payload)
        response.raise_for_status()
        
        result = response.json()
        return result.get("approval_token", "")

    # Observability Methods

    async def report_event(self, event: TelemetryEvent) -> None:
        """
        Report a telemetry event.
        
        Args:
            event: Telemetry event to report
        """
        await self._client.post(
            "/api/v1/observability/events",
            json=json.loads(event.model_dump_json()),
        )

    async def report_metric(self, metric: Metric) -> None:
        """
        Report a metric.
        
        Args:
            metric: Metric to report
        """
        await self._client.post(
            "/api/v1/observability/metrics",
            json=json.loads(metric.model_dump_json()),
        )

    async def report_span(self, span: Span) -> None:
        """
        Report a trace span.
        
        Args:
            span: Span to report
        """
        await self._client.post(
            "/api/v1/observability/spans",
            json=json.loads(span.model_dump_json()),
        )

    async def get_metrics(
        self,
        metric_name: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        tags: Optional[Dict[str, str]] = None,
    ) -> List[Metric]:
        """
        Query metrics.
        
        Args:
            metric_name: Optional metric name filter
            start_time: Optional start time filter
            end_time: Optional end time filter
            tags: Optional tag filters
            
        Returns:
            List of matching metrics
        """
        params: Dict[str, Any] = {}
        if metric_name:
            params["name"] = metric_name
        if start_time:
            params["start_time"] = start_time
        if end_time:
            params["end_time"] = end_time
        if tags:
            params["tags"] = json.dumps(tags)
        
        response = await self._client.get("/api/v1/observability/metrics", params=params)
        response.raise_for_status()
        
        return [Metric.model_validate(m) for m in response.json()]

    async def get_trace(self, trace_id: str) -> List[Span]:
        """
        Get a complete trace by ID.
        
        Args:
            trace_id: Trace identifier
            
        Returns:
            List of spans in the trace
        """
        response = await self._client.get(f"/api/v1/observability/traces/{trace_id}")
        response.raise_for_status()
        
        return [Span.model_validate(s) for s in response.json()]
