# Monitoring and Alerting Guide

## Overview

The Aureus Agentic OS provides comprehensive observability through telemetry events, metrics, and distributed tracing. This guide explains how to monitor your agent workflows and set up alerting for critical issues.

## Telemetry Events

The system emits the following telemetry events:

### Step Events

**step_start**
- Emitted when a task/step begins execution
- Contains: `workflowId`, `taskId`, `taskType`, `attempt`, `riskTier`
- Use for: Tracking task initiation, correlating with step_end

**step_end**
- Emitted when a task/step completes (success or failure)
- Contains: `workflowId`, `taskId`, `taskType`, `success`, `duration`, `error`
- Use for: Success/failure tracking, performance monitoring

### Tool Events

**tool_call**
- Emitted when a tool is invoked
- Contains: `workflowId`, `taskId`, `toolName`, `args`
- Use for: Tool usage tracking, debugging tool invocations

### Validation Events

**crv_result**
- Emitted when Circuit Reasoning Validation gate validates a commit
- Contains: `workflowId`, `taskId`, `gateName`, `passed`, `blocked`, `failureCode`
- Use for: Tracking validation failures, identifying problematic commits

**policy_check**
- Emitted when policy guard evaluates an action
- Contains: `workflowId`, `taskId`, `allowed`, `requiresHumanApproval`, `reason`
- Use for: Governance monitoring, human escalation tracking

### State Management Events

**snapshot_commit**
- Emitted when a state snapshot is created
- Contains: `workflowId`, `taskId`, `snapshotId`
- Use for: Tracking state checkpoints, rollback preparation

**rollback**
- Emitted when a rollback operation is performed
- Contains: `workflowId`, `taskId`, `snapshotId`, `reason`
- Use for: Monitoring rollback operations, incident response

## Metrics

### Task Success Rate by Type

**Metric**: `task_success_rate`

Calculates the success rate of tasks grouped by task type (e.g., "action", "query").

```typescript
const aggregator = new MetricsAggregator(telemetryCollector);
const rates = aggregator.calculateTaskSuccessRate();
// Example output: { action: 0.95, query: 0.98 }
```

**Alerting**: Set alerts when success rate drops below threshold (e.g., < 90%)

### Mean Time To Recovery (MTTR)

**Metric**: `mttr`

Calculates the average time from task failure to successful recovery.

```typescript
const mttr = aggregator.calculateMTTR();
// Returns milliseconds
```

**Alerting**: Alert when MTTR exceeds acceptable thresholds (e.g., > 5 minutes)

### Human Escalation Rate

**Metric**: `human_escalation_rate`

Percentage of policy checks that require human approval.

```typescript
const escalationRate = aggregator.calculateHumanEscalationRate();
// Returns value between 0 and 1 (e.g., 0.15 = 15%)
```

**Alerting**: Alert on high escalation rates (e.g., > 20%) indicating potential policy issues

### Cost Per Success

**Metric**: `cost_per_success`

Average execution time per successful task (proxy for resource cost).

```typescript
const costPerSuccess = aggregator.calculateCostPerSuccess();
// Returns average milliseconds per successful task
```

**Alerting**: Alert when cost increases significantly, indicating performance degradation

## Using the CLI Dashboard

### Basic Usage

Display metrics for all time:

```bash
aureus-metrics metrics
```

### Time-Based Filtering

Display metrics for the last 7 days:

```bash
aureus-metrics metrics --last 7d
```

Display metrics for the last 24 hours:

```bash
aureus-metrics metrics --last 24h
```

Display metrics for the last 30 minutes:

```bash
aureus-metrics metrics --last 30m
```

### Dashboard Output

The CLI displays a formatted dashboard with:
- Task success rate by type (with visual bar graphs)
- Mean Time To Recovery (MTTR)
- Human escalation rate (with visual bar)
- Cost per success (time proxy)
- Total events processed
- Time range covered

Example output:

```
╔══════════════════════════════════════════════════════════════╗
║              AUREUS OBSERVABILITY DASHBOARD                  ║
╚══════════════════════════════════════════════════════════════╝

📊 Time Range: Last 7d
📅 Period: 2024-12-24T14:00:00.000Z → 2024-12-31T14:00:00.000Z
📈 Total Events: 1,234

─────────────────────────────────────────────────────────────
🎯 TASK SUCCESS RATE BY TYPE
─────────────────────────────────────────────────────────────
  action               ████████████████░░░░ 85.00%
  query                ███████████████████░ 98.50%
  validation           ███████████████████░ 92.30%

─────────────────────────────────────────────────────────────
⏱️  MEAN TIME TO RECOVERY (MTTR)
─────────────────────────────────────────────────────────────
  3.45m

─────────────────────────────────────────────────────────────
👤 HUMAN ESCALATION RATE
─────────────────────────────────────────────────────────────
  ███░░░░░░░░░░░░░░░░░ 15.50%

─────────────────────────────────────────────────────────────
💰 COST PER SUCCESS (Time Proxy)
─────────────────────────────────────────────────────────────
  2.15s
```

## Integration with Monitoring Systems

### Prometheus Integration

Export metrics to Prometheus:

```typescript
import { TelemetryCollector, MetricsAggregator } from '@aureus/observability';

const collector = new TelemetryCollector();
const aggregator = new MetricsAggregator(collector);

// Periodically export metrics
setInterval(() => {
  const summary = aggregator.getMetricsSummary();
  
  // Export to Prometheus
  prometheusClient.gauge('aureus_task_success_rate', summary.taskSuccessRateByType);
  prometheusClient.gauge('aureus_mttr_ms', summary.mttr);
  prometheusClient.gauge('aureus_human_escalation_rate', summary.humanEscalationRate);
  prometheusClient.gauge('aureus_cost_per_success_ms', summary.costPerSuccess);
}, 60000); // Every minute
```

### DataDog Integration

```typescript
import { StatsD } from 'node-dogstatsd';

const dogstatsd = new StatsD();
const summary = aggregator.getMetricsSummary();

// Send to DataDog
for (const [taskType, rate] of Object.entries(summary.taskSuccessRateByType)) {
  dogstatsd.gauge('aureus.task.success_rate', rate, [`task_type:${taskType}`]);
}

dogstatsd.gauge('aureus.mttr', summary.mttr);
dogstatsd.gauge('aureus.human_escalation_rate', summary.humanEscalationRate);
dogstatsd.gauge('aureus.cost_per_success', summary.costPerSuccess);
```

## Programmatic Usage

### Recording Events

```typescript
import { TelemetryCollector } from '@aureus/observability';

const telemetry = new TelemetryCollector();

// Pass to orchestrator
const orchestrator = new WorkflowOrchestrator(
  stateStore,
  executor,
  eventLog,
  compensationExecutor,
  worldStateStore,
  memoryAPI,
  crvGate,
  policyGuard,
  principal,
  telemetry // Pass telemetry collector
);

// Events are automatically recorded during workflow execution
```

### Querying Events

```typescript
// Get all events
const allEvents = telemetry.getEvents();

// Get events by type
const stepEndEvents = telemetry.getEventsByType(TelemetryEventType.STEP_END);

// Get events in time range
const startTime = new Date(Date.now() - 3600000); // 1 hour ago
const endTime = new Date();
const recentEvents = telemetry.getEventsInTimeRange(startTime, endTime);
```

### Computing Metrics

```typescript
import { MetricsAggregator } from '@aureus/observability';

const aggregator = new MetricsAggregator(telemetry);

// Get complete summary
const summary = aggregator.getMetricsSummary();

// Get summary for last 7 days
const sevenDays = 7 * 24 * 60 * 60 * 1000; // milliseconds
const summary7d = aggregator.getMetricsSummary(sevenDays);

// Get specific metrics
const successRate = aggregator.calculateTaskSuccessRate();
const mttr = aggregator.calculateMTTR();
const escalationRate = aggregator.calculateHumanEscalationRate();
const costPerSuccess = aggregator.calculateCostPerSuccess();
```

## Alerting Best Practices

### Critical Alerts

1. **Task Success Rate < 90%**
   - Indicates systemic issues
   - Trigger: Immediate page
   - Response: Investigate failed tasks, check for common errors

2. **MTTR > 5 minutes**
   - Recovery taking too long
   - Trigger: Page during business hours
   - Response: Review retry logic, check resource availability

3. **Human Escalation Rate > 30%**
   - Policy configuration may be too restrictive
   - Trigger: Notification
   - Response: Review policy rules, check for new task patterns

### Warning Alerts

1. **Task Success Rate < 95%**
   - Degraded performance
   - Trigger: Notification
   - Response: Monitor for trends, investigate if persistent

2. **Cost Per Success increased by 50%**
   - Performance degradation
   - Trigger: Notification
   - Response: Profile task execution, check for resource contention

3. **CRV Block Rate > 10%**
   - Many commits being blocked
   - Trigger: Notification
   - Response: Review validation rules, check for data quality issues

## Troubleshooting

### No Events Showing

1. Ensure telemetry collector is passed to orchestrator
2. Check that events are being persisted (if using persistent storage)
3. Verify time range in queries

### Metrics Don't Match Expectations

1. Check event time ranges
2. Verify task types are being set correctly
3. Ensure step_start and step_end events are paired correctly

### High Memory Usage

1. Events accumulate in memory by default
2. Implement periodic event pruning or export to external storage
3. Consider using event streaming to external systems

## Event Persistence

For production systems, implement event persistence:

```typescript
class PersistentTelemetryCollector extends TelemetryCollector {
  private eventStore: EventStore;

  recordEvent(event: TelemetryEvent): void {
    super.recordEvent(event);
    // Persist to durable storage
    this.eventStore.write(event);
  }
}
```

Store events in:
- Time-series database (InfluxDB, TimescaleDB)
- Log aggregation system (Elasticsearch, Splunk)
- Object storage (S3) with periodic rotation

## Security Considerations

1. **Sensitive Data**: Ensure telemetry events don't contain sensitive data
   - Sanitize tool arguments
   - Redact approval tokens from policy checks

2. **Access Control**: Restrict access to metrics dashboard
   - Require authentication for CLI
   - Use RBAC for programmatic access

3. **Data Retention**: Define retention policies
   - Keep detailed events for 30 days
   - Aggregate older data to summaries
   - Comply with data retention regulations

## Next Steps

1. Set up monitoring dashboard (Grafana, DataDog)
2. Configure alerting rules
3. Establish SLOs for key metrics
4. Create runbooks for common alerts
5. Schedule regular metric reviews

## Support

For questions or issues with observability:
- Check the [README](../README.md)
- Review telemetry event definitions in source code
- See integration tests for usage examples
