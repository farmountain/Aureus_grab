# Agent DevOps Guide

This guide describes the operational lifecycle for agents in Aureus, including how to gate changes, observe runtime behavior, and ensure traceability from generation through rollback.

## Agent lifecycle

The recommended lifecycle for agents is:

1. **Generate**
   - Produce an agent blueprint from a goal prompt, existing template, or code-based configuration.
   - Capture input prompts, model/version metadata, and the generation context for later audit.
2. **Validate**
   - Run schema validation and policy checks (CRV, Goal-Guard FSM, permission checks).
   - Confirm tool capability permissions and risk tiers align to organizational policy.
3. **Simulate**
   - Execute sandbox simulations with representative inputs.
   - Collect telemetry, outputs, and evaluation harness results.
4. **Deploy**
   - Register and stage the agent blueprint for a target environment.
   - Run smoke tests or canary execution paths.
   - Gate promotion based on approvals and test outcomes.
5. **Monitor**
   - Observe success metrics, policy denials, CRV failures, cost/latency, and rollback rates.
   - Correlate telemetry with the originating blueprint version.
6. **Rollback**
   - Restore to the last verified snapshot or a prior approved agent version.
   - Record root cause analysis and update guardrails before re-promotion.

## Approval flows and policy gating

Agent changes should be blocked or routed for approval when they cross risk thresholds. Recommended gating layers:

- **Policy checks (Goal-Guard FSM)**
  - Evaluate intent, tool usage, and risk tier compliance.
  - Enforce explicit approvals for high-risk actions or policy exceptions.
- **CRV validation gates**
  - Block deployments that introduce invalid state transitions or schema regressions.
  - Require clean validation results before promotion.
- **Human approval workflows**
  - Use approval tokens for gated actions (e.g., destructive writes, production deploy).
  - Log approver identity, timestamp, and decision reasoning.

**Suggested flow**: Generate → validate → simulate → submit for approval → deploy to staging → run tests → approve promotion → deploy to production.

## Observability and evaluation harness

Operational visibility must include both runtime telemetry and evaluation results:

- **Telemetry**
  - Emit structured events for lifecycle stages (generation, validation, simulation, deploy, rollback).
  - Track latency, costs, policy denials, CRV failures, and tool usage.
- **Metrics and dashboards**
  - Maintain dashboards for success rate, MTTR, human escalation rate, and cost per success.
  - Alert on spikes in CRV failures, policy denials, or rollback frequency.
- **Evaluation harness**
  - Define success criteria per agent or workflow.
  - Run pre-production evaluations in simulation and compare baseline vs. candidate versions.
  - Persist evaluation outputs alongside telemetry for audit-ready evidence.

## Deployment pipeline integration and rollback steps

Integrate the agent lifecycle into CI/CD pipelines with clear artifacts and rollback pathways:

- **Pipeline integration**
  - Version blueprint artifacts, tool adapters, and policy configurations.
  - Register immutable build metadata (git SHA, build number, model version).
  - Deploy to staging first, execute smoke tests, then promote to production.
- **Rollback steps**
  1. Stop or pause the active agent deployment.
  2. Restore the last known-good blueprint or snapshot.
  3. Re-run validation checks and smoke tests.
  4. Resume traffic and monitor for recovery.
  5. Record the rollback event and link to the incident report.

## Traceability and audit requirements

To ensure end-to-end traceability:

- **Versioned artifacts**
  - Maintain immutable agent blueprint versions with signed metadata.
  - Store tool configuration, policy configuration, and runtime environment details.
- **Audit logs**
  - Log lifecycle events (generate, validate, simulate, deploy, approve, rollback).
  - Capture actor identity (human or system), timestamp, and decision reasoning.
- **Evidence capture**
  - Store validation reports, simulation results, and evaluation harness outputs.
  - Link telemetry traces to the originating blueprint version.
- **Retention and access**
  - Apply retention policies for audit logs and evaluation data.
  - Restrict access to approval actions and audit trails with role-based controls.

## Related documentation

- [DevOps Guide](./devops.md)
- [Policy Guide](./policy-guide.md)
- [Sandbox Execution](./sandbox-execution.md)
- [Monitoring Dashboard Guide](./MONITORING_DASHBOARD_GUIDE.md)
