# Observability

Comprehensive telemetry, metrics, and distributed tracing for Aureus Agentic OS with OpenTelemetry and Prometheus exporters.

## Features

- **Telemetry Events**: Capture all key agent operations
  - `step_start` / `step_end`: Task lifecycle tracking
  - `tool_call`: Tool invocation monitoring
  - `crv_result`: Validation gate results
  - `policy_check`: Policy evaluation tracking
  - `snapshot_commit`: State checkpoint tracking
  - `rollback`: Rollback operation monitoring

- **Correlation IDs**: Distributed tracing across services
  - Automatic propagation through all events
  - Support for W3C Trace Context
  - Cross-service request tracking

- **Configurable Sinks**: Export to multiple backends
  - **OpenTelemetry**: OTLP HTTP/gRPC protocol support
  - **Prometheus**: /metrics endpoint for scraping
  - **Console**: Formatted console output
  - **File**: JSON-formatted log files
  - **Custom**: Bring your own exporter

- **Advanced Metrics**:
  - Task success rate by type
  - Mean Time To Recovery (MTTR)
  - Human escalation rate
  - Cost per success (time proxy)

- **CLI Dashboard**: `aureus-metrics metrics --last 7d`
  - Visual metrics display
  - Time-based filtering
  - Export-ready format

## Installation

```bash
npm install @aureus/observability
```

## Quick Start

### Basic Usage with Correlation IDs

```typescript
import { TelemetryCollector } from '@aureus/observability';
import { WorkflowOrchestrator } from '@aureus/kernel';

// Create collector with correlation ID
const telemetry = new TelemetryCollector(undefined, 'request-abc-123');

// Pass to orchestrator for automatic event collection
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
  telemetry
);

// Events are automatically recorded with correlation ID
await orchestrator.executeWorkflow(spec);
```

### OpenTelemetry Integration

```typescript
import { TelemetryCollector, SinkManager } from '@aureus/observability';

// Configure sink manager
const sinkManager = new SinkManager();

// Add OpenTelemetry sink
sinkManager.addSink('otlp', {
  type: 'opentelemetry',
  enabled: true,
  options: {
    endpoint: 'http://localhost:4318',
    protocol: 'http',
    serviceName: 'aureus-agentic-os',
    serviceVersion: '0.1.0',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
    },
  },
});

// Create collector with sink manager
const telemetry = new TelemetryCollector(sinkManager);

// Events are automatically exported to OpenTelemetry
telemetry.recordStepStart('wf-1', 'task-1', 'action');
```

### Prometheus Integration

```typescript
import { SinkManager } from '@aureus/observability';

const sinkManager = new SinkManager();

// Add Prometheus sink
sinkManager.addSink('prometheus', {
  type: 'prometheus',
  enabled: true,
  options: {
    port: 9090,
    path: '/metrics',
    prefix: 'aureus',
    labels: {
      environment: 'production',
      region: 'us-east-1',
    },
  },
});

// Metrics are now available at http://localhost:9090/metrics
```

### Multiple Sinks

```typescript
const sinkManager = new SinkManager();

// Console for development
sinkManager.addSink('console', {
  type: 'console',
  enabled: true,
  options: { pretty: true, colors: true },
});

// OpenTelemetry for production tracing
sinkManager.addSink('otlp', {
  type: 'opentelemetry',
  enabled: true,
  options: { endpoint: 'http://otel-collector:4318' },
});

// Prometheus for metrics
sinkManager.addSink('prometheus', {
  type: 'prometheus',
  enabled: true,
  options: { port: 9090 },
});

// File for audit logs
sinkManager.addSink('file', {
  type: 'file',
  enabled: true,
  options: { path: '/var/log/aureus/telemetry.log' },
});

// Create collector with all sinks
const telemetry = new TelemetryCollector(sinkManager, 'correlation-id');
```

### Computing Metrics

```typescript
import { MetricsAggregator } from '@aureus/observability';

const aggregator = new MetricsAggregator(telemetry);

// Get metrics summary
const summary = aggregator.getMetricsSummary();

console.log('Task Success Rates:', summary.taskSuccessRateByType);
console.log('MTTR:', summary.mttr, 'ms');
console.log('Human Escalation Rate:', summary.humanEscalationRate);
console.log('Cost Per Success:', summary.costPerSuccess, 'ms');
```

### Using the CLI

Display metrics dashboard:

```bash
# All time
aureus-metrics metrics

# Last 7 days
aureus-metrics metrics --last 7d

# Last 24 hours
aureus-metrics metrics --last 24h

# Last 30 minutes
aureus-metrics metrics --last 30m
```

## Telemetry Events

### step_start

Emitted when a task begins execution.

```typescript
telemetry.recordStepStart(workflowId, taskId, taskType, {
  attempt: 1,
  riskTier: 'MEDIUM',
});
```

### step_end

Emitted when a task completes.

```typescript
telemetry.recordStepEnd(workflowId, taskId, taskType, success, duration, error);
```

### tool_call

Emitted when a tool is invoked.

```typescript
telemetry.recordToolCall(workflowId, taskId, toolName, args);
```

### crv_result

Emitted when CRV gate validates a commit.

```typescript
telemetry.recordCRVResult(workflowId, taskId, gateName, passed, blocked, failureCode);
```

### policy_check

Emitted when policy guard evaluates an action.

```typescript
telemetry.recordPolicyCheck(workflowId, taskId, allowed, requiresHumanApproval, reason);
```

### snapshot_commit

Emitted when a state snapshot is created.

```typescript
telemetry.recordSnapshotCommit(workflowId, taskId, snapshotId);
```

### rollback

Emitted when a rollback operation occurs.

```typescript
telemetry.recordRollback(workflowId, taskId, snapshotId, reason);
```

## Metrics

### Task Success Rate

Calculate success rate grouped by task type:

```typescript
const rates = aggregator.calculateTaskSuccessRate();
// { action: 0.95, query: 0.98, validation: 0.92 }

// Filter by specific task type
const actionRate = aggregator.calculateTaskSuccessRate('action');
```

### Mean Time To Recovery (MTTR)

Average time from failure to recovery:

```typescript
const mttr = aggregator.calculateMTTR();
// Returns milliseconds
```

### Human Escalation Rate

Percentage of policy checks requiring human approval:

```typescript
const rate = aggregator.calculateHumanEscalationRate();
// Returns 0.0 to 1.0 (e.g., 0.15 = 15%)
```

### Cost Per Success

Average execution time per successful task:

```typescript
const cost = aggregator.calculateCostPerSuccess();
// Returns average milliseconds
```

## Querying Events

### Get All Events

```typescript
const events = telemetry.getEvents();
```

### Filter by Type

```typescript
import { TelemetryEventType } from '@aureus/observability';

const stepEndEvents = telemetry.getEventsByType(TelemetryEventType.STEP_END);
```

### Filter by Time Range

```typescript
const startTime = new Date(Date.now() - 3600000); // 1 hour ago
const endTime = new Date();
const recentEvents = telemetry.getEventsInTimeRange(startTime, endTime);
```

## Integration Examples

### Prometheus

```typescript
const summary = aggregator.getMetricsSummary();

prometheusClient.gauge('aureus_task_success_rate', summary.taskSuccessRateByType);
prometheusClient.gauge('aureus_mttr_ms', summary.mttr);
prometheusClient.gauge('aureus_human_escalation_rate', summary.humanEscalationRate);
```

### DataDog

```typescript
import { StatsD } from 'node-dogstatsd';

const dogstatsd = new StatsD();
const summary = aggregator.getMetricsSummary();

for (const [taskType, rate] of Object.entries(summary.taskSuccessRateByType)) {
  dogstatsd.gauge('aureus.task.success_rate', rate, [`task_type:${taskType}`]);
}
```

## Distributed Tracing

Track operations across distributed systems:

```typescript
// Start a trace
const span = telemetry.startSpan('workflow-execution', traceId);

// Add logs to span
telemetry.addSpanLog(span.id, 'info', 'Task started');

// End span
telemetry.endSpan(span.id);

// Query spans
const spans = telemetry.getSpansByTrace(traceId);
```

## Exporters API

### OpenTelemetry Exporter

```typescript
import { OpenTelemetryExporter } from '@aureus/observability';

const exporter = new OpenTelemetryExporter({
  endpoint: 'http://localhost:4318',
  protocol: 'http',  // or 'grpc'
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  headers: {
    'Authorization': 'Bearer token',
  },
  compression: true,
});

// Export events
await exporter.exportEvents(telemetry.getEvents());

// Export metrics
await exporter.exportMetrics(telemetry.getMetrics());

// Export spans
await exporter.exportSpans(telemetry.getSpans());

// Shutdown
await exporter.shutdown();
```

### Prometheus Exporter

```typescript
import { PrometheusExporter } from '@aureus/observability';

const exporter = new PrometheusExporter({
  port: 9090,
  path: '/metrics',
  prefix: 'aureus',
  labels: {
    environment: 'production',
  },
});

// Start metrics server
await exporter.start();

// Export events (converted to counters)
await exporter.exportEvents(telemetry.getEvents());

// Metrics available at http://localhost:9090/metrics

// Stop server
await exporter.stop();
```

### Sink Manager

```typescript
import { SinkManager } from '@aureus/observability';

const manager = new SinkManager();

// Add multiple sinks
manager.addSink('console', { type: 'console', enabled: true });
manager.addSink('otlp', {
  type: 'opentelemetry',
  enabled: true,
  options: { endpoint: 'http://localhost:4318' },
});

// Export to all sinks
await manager.exportEvents(events);
await manager.exportMetrics(metrics);

// Flush all sinks
await manager.flush();

// Shutdown all sinks
await manager.shutdown();
```

## Correlation IDs

```typescript
// Set correlation ID at collector creation
const telemetry = new TelemetryCollector(sinkManager, 'request-123');

// Or set later
telemetry.setCorrelationId('request-456');

// Get current correlation ID
const correlationId = telemetry.getCorrelationId();

// All events will include the correlation ID
telemetry.recordStepStart('wf-1', 'task-1', 'action');

// Query by correlation ID
const events = telemetry.getEvents().filter(e => 
  e.correlationId === 'request-123'
);
```

## Documentation

- [Monitoring Dashboard Guide](../../MONITORING_DASHBOARD_GUIDE.md) - Complete dashboard guide with exporters
- [Monitoring and Alerting Guide](../../docs/monitoring-and-alerting.md) - Complete guide to monitoring and alerting
- [Architecture](../../architecture.md) - System architecture overview

## Testing

Run tests:

```bash
npm test
```

## License

MIT


## Memory Observability

The Memory Observability module provides comprehensive metrics and alerting for memory subsystems, context growth, and agent lifecycle.

### Features

- **Context Growth Metrics**: Track memory growth rate and project future size
- **Memory Pressure Monitoring**: Monitor memory usage and get recommendations
- **Summarization Fidelity**: Track compression ratios and quality
- **Lifecycle Metrics**: Monitor agent lifecycle state changes
- **Alerting**: Configurable alerts for critical conditions
- **History Tracking**: Maintain history of metrics for analysis

### Usage

```typescript
import { MemoryObservability, AlertLevel, TelemetryCollector } from '@aureus/observability';

const telemetry = new TelemetryCollector();
const observability = new MemoryObservability(telemetry);

// Track context growth
const contextMetrics = observability.trackContextGrowth('task-1', 1000, 5);
console.log(`Growth rate: ${contextMetrics.growthRate} entries/min`);
console.log(`Projected size: ${contextMetrics.projectedSize}`);
console.log(`Alert level: ${contextMetrics.alertLevel}`);

// Track memory pressure
const pressureMetrics = observability.trackMemoryPressure('task-1', 1000, 850);
console.log(`Pressure: ${pressureMetrics.pressureLevel * 100}%`);
console.log(`Recommendation: ${pressureMetrics.recommendation}`);

// Track summarization fidelity
const fidelityMetrics = observability.trackSummarizationFidelity(
  'entry-1',
  1000,
  500,
  'truncate',
  0.95
);
console.log(`Compression ratio: ${fidelityMetrics.compressionRatio}`);

// Record lifecycle events
observability.recordLifecycleMetrics('agent-1', 'session-1', 'awake', 5, 200);
```

### Alerts

Configure and manage alerts:

```typescript
// Add custom alert condition
observability.addAlertCondition({
  name: 'very_high_growth',
  metric: 'context_growth_rate',
  threshold: 1000,
  operator: 'gt',
  level: AlertLevel.CRITICAL,
  enabled: true,
});

// Get alerts
const allAlerts = observability.getAlerts();
const criticalAlerts = observability.getAlerts(AlertLevel.CRITICAL);
const taskAlerts = observability.getAlerts(undefined, 'task-1');

// Get recent alerts
const recentAlerts = observability.getRecentAlerts(60); // Last 60 minutes

// Get alert statistics
const stats = observability.getAlertStats();
console.log(`Total alerts: ${stats.total}`);
console.log(`By level:`, stats.byLevel);
console.log(`By metric:`, stats.byMetric);

// Clear old alerts
observability.clearOldAlerts(1440); // Clear alerts older than 24 hours
```

### Context History

Track context growth over time:

```typescript
// Get context history for a task
const history = observability.getContextHistory('task-1');

for (const metric of history) {
  console.log(`Time: ${metric.timestamp}`);
  console.log(`Size: ${metric.contextSize}`);
  console.log(`Growth: ${metric.growthRate} entries/min`);
}
```

### Default Alert Conditions

The observability system comes with default alert conditions:

- **high_context_growth**: Warns when growth > 100 entries/min
- **critical_context_growth**: Critical when growth > 500 entries/min
- **high_memory_pressure**: Warns when pressure > 80%
- **critical_memory_pressure**: Critical when pressure > 95%
- **low_compression_ratio**: Warns when compression < 10%

### Integration with Telemetry

All metrics are automatically recorded to the telemetry collector:

```typescript
// Metrics are automatically recorded
const metrics = telemetry.getMetrics();
const contextSizeMetrics = metrics.filter(m => m.name === 'context_size');
const memoryPressureMetrics = metrics.filter(m => m.name === 'memory_pressure');

// Events are recorded for alerts
const events = telemetry.getEvents();
const alertEvents = events.filter(e => e.data.eventType === 'alert');
```

### Best Practices

1. **Regular Monitoring**: Track context growth and memory pressure regularly
2. **Set Appropriate Thresholds**: Adjust alert thresholds based on your workload
3. **Act on Alerts**: Implement automated responses to critical alerts
4. **Review History**: Analyze context history to identify patterns
5. **Clean Up**: Clear old alerts periodically to maintain performance

