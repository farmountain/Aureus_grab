# Monitoring Dashboard - Visual Guide

## Overview

The Monitoring Dashboard provides real-time production visibility and self-healing insights for Aureus workflows with full observability through OpenTelemetry and Prometheus exporters.

## Exporters and Integration

### OpenTelemetry Integration

Configure OpenTelemetry exporter to send telemetry data to OTLP-compatible backends (Jaeger, Tempo, etc.):

```typescript
import { TelemetryCollector, SinkManager } from '@aureus/observability';

// Create sink manager
const sinkManager = new SinkManager();

// Add OpenTelemetry sink
sinkManager.addSink('otlp', {
  type: 'opentelemetry',
  enabled: true,
  options: {
    endpoint: 'http://localhost:4318',  // OTLP HTTP endpoint
    protocol: 'http',                    // or 'grpc'
    serviceName: 'aureus-agentic-os',
    serviceVersion: '0.1.0',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',  // Optional auth
    },
  },
});

// Create collector with sink manager
const telemetry = new TelemetryCollector(sinkManager, 'correlation-id-123');

// Events are automatically exported to OpenTelemetry
telemetry.recordStepStart('wf-1', 'task-1', 'action');
```

### Prometheus Integration

Expose metrics in Prometheus format with an HTTP /metrics endpoint:

```typescript
import { SinkManager } from '@aureus/observability';

const sinkManager = new SinkManager();

// Add Prometheus sink
sinkManager.addSink('prometheus', {
  type: 'prometheus',
  enabled: true,
  options: {
    port: 9090,                          // Metrics server port
    path: '/metrics',                    // Metrics endpoint path
    prefix: 'aureus',                    // Metric name prefix
    labels: {                            // Global labels
      environment: 'production',
      region: 'us-east-1',
    },
  },
});
```

Prometheus will scrape metrics from `http://localhost:9090/metrics`:

```
# HELP aureus_tasks_started_total Counter metric: aureus_tasks_started_total
# TYPE aureus_tasks_started_total counter
aureus_tasks_started_total{environment="production",event_type="step_start",workflow_id="wf-1",task_type="action"} 42

# HELP aureus_task_duration_ms Task execution duration in milliseconds
# TYPE aureus_task_duration_ms histogram
aureus_task_duration_ms{environment="production",event_type="step_end",workflow_id="wf-1",task_type="action"} 125
```

### Multiple Sinks

You can configure multiple sinks to export to different backends simultaneously:

```typescript
const sinkManager = new SinkManager();

// Console output for local development
sinkManager.addSink('console', {
  type: 'console',
  enabled: true,
  options: {
    pretty: true,
    colors: true,
  },
});

// OpenTelemetry for distributed tracing
sinkManager.addSink('otlp', {
  type: 'opentelemetry',
  enabled: true,
  options: {
    endpoint: 'http://otel-collector:4318',
  },
});

// Prometheus for metrics
sinkManager.addSink('prometheus', {
  type: 'prometheus',
  enabled: true,
  options: {
    port: 9090,
  },
});

// File output for audit logs
sinkManager.addSink('file', {
  type: 'file',
  enabled: true,
  options: {
    path: '/var/log/aureus/telemetry.log',
  },
});
```

## Correlation IDs for Distributed Tracing

Correlation IDs enable tracking operations across distributed systems:

```typescript
// Set correlation ID at collector level
const telemetry = new TelemetryCollector(sinkManager);
telemetry.setCorrelationId('request-abc-123');

// All subsequent events will include the correlation ID
telemetry.recordStepStart('wf-1', 'task-1', 'action');

// Update correlation ID for a new request
telemetry.setCorrelationId('request-xyz-789');

// Query events by correlation ID
const events = telemetry.getEvents().filter(e => e.correlationId === 'request-abc-123');
```

Correlation IDs are automatically propagated to:
- OpenTelemetry traces (as trace context)
- Console logs
- File exports
- API responses

## Dashboard Layout

### Header Section
```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 Monitoring Dashboard                                          │
│ Live metrics, telemetry events, and reflexion insights          │
│                                                                  │
│ [Workflow Wizard] [DAG Studio] [Test & Validate] [Deployments] │
└─────────────────────────────────────────────────────────────────┘
```

### Control Bar
```
┌─────────────────────────────────────────────────────────────────┐
│ Time Range: [Last hour ▼]  Workflow: [Filter by ID]            │
│ [🔄 Refresh] [▶️ Auto-refresh]                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Metrics Overview (4 Cards)

#### Success Rate Card (Purple Gradient)
```
┌──────────────────────┐
│ SUCCESS RATE         │
│                      │
│      87.5%           │
│                      │
│ Overall task success │
└──────────────────────┘
```

#### CRV Failures Card (Red Gradient)
```
┌──────────────────────┐
│ CRV FAILURES         │
│                      │
│        3             │
│                      │
│ Blocked commits      │
└──────────────────────┘
```

#### Policy Denials Card (Blue Gradient)
```
┌──────────────────────┐
│ POLICY DENIALS       │
│                      │
│        2             │
│                      │
│ Requires approval    │
└──────────────────────┘
```

#### Rollbacks Card (Green Gradient)
```
┌──────────────────────┐
│ ROLLBACKS            │
│                      │
│        1             │
│                      │
│ State restorations   │
└──────────────────────┘
```

## Reflexion Suggestions Section

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔍 Reflexion Suggestions                          [Refresh]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  TOOL UNAVAILABLE                              75% Confidence   │
│  2 minutes ago • Workflow: wf-payment-2 • Task: process-payment │
│                                                                  │
│  Root Cause                                                      │
│  CRV gate 'amount-threshold' blocked due to threshold exceeded   │
│                                                                  │
│  Proposed Fix                                                    │
│  Adjust CRV threshold to allow amounts up to 15000              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Fix Type: modify_crv_threshold                           │   │
│  │ Risk Tier: MEDIUM                                        │   │
│  │ Impact: medium                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [✓ Apply Fix] [✗ Dismiss]                                      │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SERVICE UNAVAILABLE                           62% Confidence   │
│  5 minutes ago • Workflow: wf-deploy-1 • Task: deploy-service  │
│                                                                  │
│  Root Cause                                                      │
│  Service health check failed: Connection timeout                │
│                                                                  │
│  Proposed Fix                                                    │
│  Increase health check timeout and add retry logic              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Fix Type: alternate_tool                                 │   │
│  │ Risk Tier: LOW                                           │   │
│  │ Impact: low                                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [✓ Apply Fix] [✗ Dismiss]                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Event Timeline Section

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 Event Timeline                                  [Refresh]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ● 30s ago                                                        │
│   [rollback]                                                     │
│   Rollback to snapshot-pre-deploy: Service health check failed  │
│   Workflow: wf-deploy-1 | Task: deploy-service                  │
│                                                                  │
│ ● 45s ago                                                        │
│   [step_end]                                                     │
│   Task failed: Service health check failed                      │
│   Workflow: wf-deploy-1 | Task: deploy-service                  │
│                                                                  │
│ ● 1m ago                                                         │
│   [crv_result]                                                   │
│   CRV failed: amount-threshold (blocked)                        │
│   Workflow: wf-payment-2 | Task: process-payment                │
│                                                                  │
│ ● 2m ago                                                         │
│   [policy_check]                                                 │
│   Requires human approval                                        │
│   Workflow: wf-transfer-1 | Task: transfer-funds                │
│                                                                  │
│ ● 3m ago                                                         │
│   [step_end]                                                     │
│   Completed task successfully (230ms)                           │
│   Workflow: wf-payment-1 | Task: process-payment                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Color Coding

- **Success Indicators**: Green (●) - Successful operations
- **Failure Indicators**: Red (●) - Failed operations, CRV blocks
- **Warning Indicators**: Yellow (●) - Policy denials, rollbacks
- **Info Indicators**: Blue (●) - Standard events, in-progress operations

## Key Features

1. **Real-time Updates**: Auto-refresh every 10 seconds when enabled
2. **Time Range Filtering**: View metrics for last 5m, 15m, 1h, 24h, or all time
3. **Workflow Filtering**: Filter events and postmortems by workflow ID
4. **Interactive Timeline**: Click events to see full details
5. **Confidence Scores**: Color-coded badges (high: green, medium: yellow, low: red)
6. **Actionable Insights**: Apply or dismiss reflexion-generated fixes

## API Integration

The dashboard fetches data from:
- `/api/monitoring/metrics` - Aggregated metrics with success rates
- `/api/monitoring/events` - Telemetry event stream
- `/api/reflexion/postmortems/:workflowId` - Failure analysis and fixes
- `/api/reflexion/stats` - Overall reflexion statistics

## User Experience Flow

1. **Login**: Authenticate with operator credentials
2. **View Metrics**: See high-level health indicators
3. **Investigate Failures**: Browse reflexion suggestions for failed workflows
4. **Review Timeline**: Drill into event details with filters
5. **Take Action**: Apply suggested fixes or trigger manual reflexion
6. **Monitor Results**: Track success rate improvements over time

## Alert Configuration

### Setting Up Alerts

Configure alerting thresholds for critical metrics:

```typescript
// Example alert configuration
const alertConfig = {
  successRateThreshold: 0.95,      // Alert if success rate drops below 95%
  mttrThresholdMs: 30000,          // Alert if MTTR exceeds 30 seconds
  escalationRateThreshold: 0.20,   // Alert if escalation rate exceeds 20%
  rollbackThreshold: 5,            // Alert if more than 5 rollbacks in time window
};
```

### Prometheus Alerting Rules

Example Prometheus alert rules for Aureus metrics:

```yaml
groups:
  - name: aureus_alerts
    interval: 30s
    rules:
      - alert: HighTaskFailureRate
        expr: |
          (rate(aureus_tasks_completed_total{success="false"}[5m]) / 
           rate(aureus_tasks_completed_total[5m])) > 0.10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High task failure rate detected"
          description: "Task failure rate is {{ $value | humanizePercentage }}"

      - alert: CRVBlockageSpike
        expr: rate(aureus_crv_checks_total{blocked="true"}[5m]) > 0.5
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "CRV blockage spike detected"
          description: "CRV blocking {{ $value }} checks per second"

      - alert: HighRollbackRate
        expr: rate(aureus_rollbacks_total[10m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High rollback rate detected"
          description: "Rollback rate is {{ $value }} per second"

      - alert: PolicyEscalationSurge
        expr: |
          rate(aureus_policy_checks_total{requires_approval="true"}[5m]) > 0.3
        for: 2m
        labels:
          severity: info
        annotations:
          summary: "Policy escalation surge"
          description: "Human approval required at {{ $value }} per second"
```

### OpenTelemetry Alerting

Use OpenTelemetry Collector's alerting processor:

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 10s
  
  # Custom processor for alerts
  attributes:
    actions:
      - key: alert.enabled
        value: true
        action: insert

exporters:
  prometheus:
    endpoint: "0.0.0.0:8889"
  
  alertmanager:
    endpoint: "http://alertmanager:9093"
    tls:
      insecure: true

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [prometheus, alertmanager]
```

### Dashboard Alert Views

The monitoring dashboard can display active alerts:

```typescript
// Fetch active alerts
const alerts = await fetch('/api/monitoring/alerts', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Alert structure
interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: Date;
  workflowId?: string;
}
```

## Production Deployment

### Recommended Architecture

```
┌─────────────┐
│   Aureus    │
│   Kernel    │──┐
└─────────────┘  │
                 │ Telemetry
                 ▼
┌──────────────────────────────┐
│   Observability Package      │
│   - TelemetryCollector       │
│   - SinkManager              │
└──────────────────────────────┘
         │          │
         │          └──────────┐
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│  OpenTelemetry  │   │   Prometheus    │
│    Collector    │   │     Server      │
└─────────────────┘   └─────────────────┘
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│  Jaeger/Tempo   │   │   Grafana       │
│   (Traces)      │   │   (Metrics)     │
└─────────────────┘   └─────────────────┘
```

### Environment Variables

```bash
# OpenTelemetry configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=aureus-agentic-os
OTEL_SERVICE_VERSION=0.1.0

# Prometheus configuration
PROMETHEUS_PORT=9090
PROMETHEUS_PATH=/metrics

# Alert configuration
ALERT_SUCCESS_RATE_THRESHOLD=0.95
ALERT_MTTR_THRESHOLD_MS=30000
ALERT_ESCALATION_RATE_THRESHOLD=0.20
```

## Troubleshooting

### Exporter Issues

**Problem**: Events not appearing in OpenTelemetry backend

**Solutions**:
1. Check endpoint connectivity: `curl http://otel-collector:4318/v1/logs`
2. Verify authentication headers are correct
3. Check OpenTelemetry Collector logs for errors
4. Ensure service name and version are set

**Problem**: Prometheus metrics endpoint returns 404

**Solutions**:
1. Verify Prometheus exporter is started: Check port binding
2. Ensure correct path is configured (default: `/metrics`)
3. Check for port conflicts with other services

### Correlation ID Issues

**Problem**: Correlation IDs not propagating across services

**Solutions**:
1. Ensure correlation ID is set before recording events
2. Verify correlation ID is included in API requests
3. Check that all services are using the same correlation ID format
4. Use trace context propagation headers (W3C Trace Context)

## Performance Considerations

- **Batch exports**: Events are exported asynchronously to avoid blocking
- **Sampling**: Consider sampling for high-volume scenarios
- **Buffer limits**: Configure appropriate buffer sizes for exporters
- **Network resilience**: Exporters handle transient failures gracefully

## Security Best Practices

- Use TLS for all exporter connections in production
- Rotate authentication tokens regularly
- Limit metrics endpoint access to internal networks
- Sanitize sensitive data before exporting
- Use correlation IDs instead of user identifiers
