# Observability Module

Comprehensive audit trail and observability infrastructure for Aureus Sentinel bridge.

## Components

### 1. Structured Audit Logger (`audit_logger.js`)

**Purpose**: Tamper-evident audit logging for all security-relevant events.

**Features**:
- **Structured Schema**: Consistent JSON format with standardized fields
- **Tamper-Evident**: SHA-256 hash chain linking entries (prevents log tampering)
- **Multiple Outputs**: File (JSON Lines), Console, SIEM (CEF format)
- **Event Types**: 16 predefined security event types (intent received, approval granted/denied, signature verification, etc.)
- **Severity Levels**: DEBUG, INFO, WARN, ERROR, CRITICAL
- **Query API**: Filter logs by date, severity, event type, user ID
- **Chain Verification**: Verify hash chain integrity

**Usage**:
```javascript
const { StructuredAuditLogger, AuditEventType, Severity } = require('./observability/audit_logger');

const logger = new StructuredAuditLogger({
  logDir: './.audit-logs',
  enableConsole: true,
  enableFile: true,
  enableSIEM: false
});

await logger.init();

// Log events
await logger.logIntentReceived(intentId, userId, tool, risk, channel);
await logger.logApprovalGranted(approvalId, planId, userId, tool, risk, humanApproved);
await logger.logSuspiciousActivity(userId, reason, indicators);

// Query logs
const logs = await logger.query({
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  eventType: AuditEventType.APPROVAL_DENIED,
  userId: 'user123'
});

// Verify integrity
const integrity = await logger.verifyChainIntegrity();
console.log(integrity.valid ? 'Chain intact' : 'Chain compromised!');
```

**Storage Format**:
```
.audit-logs/
  audit-2024-01-15.jsonl
  audit-2024-01-16.jsonl
```

Each log entry:
```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "severity": "INFO",
  "eventType": "approval.granted",
  "message": "Approval granted",
  "userId": "user123",
  "tool": "web_search",
  "risk": "low",
  "approved": true,
  "previousHash": "abc123...",
  "hash": "def456...",
  "meta": {
    "pid": 12345,
    "hostname": "bridge-01",
    "version": "1.0"
  }
}
```

---

### 2. OpenTelemetry Tracing (`tracing.js`)

**Purpose**: Distributed tracing for request flow visualization and performance monitoring.

**Features**:
- **Trace Context Propagation**: W3C Trace Context headers
- **Automatic Instrumentation**: HTTP, async operations
- **OTLP Export**: Jaeger, Grafana Tempo, or any OTLP-compatible backend
- **Custom Spans**: Security-specific operations (risk assessment, signature verification)
- **Metrics Export**: Approval rates, latency histograms
- **Sampling**: Configurable sample rate (default 100%)

**Usage**:
```javascript
const { initTelemetry, getTelemetry } = require('./observability/tracing');

// Initialize at startup
await initTelemetry({
  serviceName: 'aureus-sentinel-bridge',
  otlpEndpoint: 'http://localhost:4318',
  enabled: true,
  sampleRate: 1.0
});

// Use in operations
const telemetry = getTelemetry();

await telemetry.traceIntentReceival(intent, async (span) => {
  span?.setAttribute('intent.tool', intent.tool);
  span?.setAttribute('intent.risk', intent.risk);
  
  // Your logic here
  return result;
});

// Convenience wrappers
await telemetry.traceRiskAssessment(intentId, async (span) => {
  const risk = assessRisk(intent);
  span?.setAttribute('risk.level', risk);
  return risk;
});

await telemetry.traceSignatureVerification(approvalId, async (span) => {
  const valid = verifySignature(approval);
  span?.addEvent(valid ? 'signature.valid' : 'signature.invalid');
  return valid;
});
```

**Integration Points**:
- **Bridge Server**: Trace HTTP requests end-to-end
- **Decision Engine**: Trace risk assessment and plan generation
- **Memory Store**: Trace storage operations and queries
- **Executor**: Trace signature verification and execution

**Jaeger UI Example**:
```
[Trace: intent-12345]
  ├─ intent.receive (50ms)
  ├─ context.enrich (120ms)
  │  ├─ memory.query (80ms)
  │  └─ pattern.detect (40ms)
  ├─ risk.assess (30ms)
  ├─ plan.generate (20ms)
  └─ approval.decide (10ms)
Total: 230ms
```

---

### 3. Grafana Dashboards

#### Security Overview Dashboard (`grafana-dashboard-security.json`)

**Panels**:
1. **Approval Rate** (Stat): % of approved intents in last 1h
2. **Risk Distribution** (Pie Chart): Low/medium/high risk breakdown
3. **Suspicious Activity Alerts** (Stat): Count of suspicious events
4. **Average Trust Score** (Gauge): User trust score (0-1 scale)
5. **Intent Volume** (Time Series): Intents per minute
6. **Approval vs Denial Rate** (Time Series): Approved/denied over time
7. **Top Tools by Usage** (Bar Gauge): Most requested tools
8. **Signature Verification Failures** (Time Series): Failed verifications
9. **Memory Store Operations** (Time Series): Store/query operations
10. **Response Time Distribution** (Time Series): p50/p95/p99 latency
11. **Active Users** (Stat): Unique users in last 10min
12. **Risk Assessment Adjustments** (Table): Upgrade/downgrade counts

**Alerts**:
- Signature verification failures > 5/min
- Trust score < 0.3 for active user
- Suspicious activity spike

**Variables**:
- `$environment`: Filter by dev/staging/production
- `$instance`: Filter by bridge instance

**Import**:
```bash
# Import to Grafana
curl -X POST http://localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @grafana-dashboard-security.json
```

---

## Dependencies

Install required npm packages:

```bash
npm install --save \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/api
```

---

## Deployment

### Local Development (Docker Compose)

```yaml
version: '3.8'
services:
  # Bridge service
  bridge:
    build: .
    environment:
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
      - AUDIT_LOG_DIR=/var/log/audit
    volumes:
      - audit-logs:/var/log/audit

  # Grafana Tempo (tracing backend)
  tempo:
    image: grafana/tempo:latest
    ports:
      - "4318:4318"  # OTLP HTTP
      - "3200:3200"  # Tempo UI
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ./tempo.yaml:/etc/tempo.yaml

  # Prometheus (metrics)
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  # Grafana (visualization)
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - ./grafana:/etc/grafana/provisioning

volumes:
  audit-logs:
```

### Production (Kubernetes)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aureus-bridge
spec:
  template:
    spec:
      containers:
      - name: bridge
        image: aureus/bridge:latest
        env:
        -  name: OTEL_EXPORTER_OTLP_ENDPOINT
          value: "http://tempo.observability:4318"
        - name: AUDIT_LOG_DIR
          value: "/var/log/audit"
        volumeMounts:
        - name: audit-logs
          mountPath: /var/log/audit
      volumes:
      - name: audit-logs
        persistentVolumeClaim:
          claimName: audit-logs-pvc
```

---

## Security Considerations

1. **Audit Log Integrity**:
   - Hash chain prevents tampering
   - Regularly verify chain integrity
   - Store logs in append-only storage (S3 Object Lock, immutable volumes)

2. **SIEM Integration**:
   - Forward logs to centralized SIEM (Splunk, Elastic, QRadar)
   - Use CEF format for compatibility
   - Set up real-time alerts for critical events

3. **Trace Data Sensitivity**:
   - Avoid logging PII in span attributes
   - Use sampling to reduce data volume
   - Implement trace data retention policies

4. **Access Control**:
   - Restrict audit log file permissions (chmod 600)
   - Implement RBAC for Grafana dashboards
   - Encrypt logs at rest

---

## Testing

Run observability integration tests:

```bash
npm test -- observability.test.js
```

Test coverage:
- [x] Audit log creation and storage
- [x] Hash chain integrity verification
- [x] Query filtering and pagination
- [x] Trace span creation and propagation
- [x] OTLP export (with mock backend)
- [x] Dashboard metric queries

---

## Monitoring Checklist

- [ ] Audit logs being written to disk
- [ ] Hash chain integrity verified daily
- [ ] Traces visible in Jaeger/Tempo
- [ ] Grafana dashboards displaying metrics
- [ ] Alerts triggering for anomalies
- [ ] SIEM receiving logs (if enabled)
- [ ] Log rotation configured (e.g., logrotate)
- [ ] Backup strategy for audit logs

---

## Troubleshooting

### Audit logs not created
- Check directory permissions: `ls -la .audit-logs/`
- Verify logger initialization: `enableFile: true`
- Check disk space: `df -h`

### Traces not appearing in Jaeger
- Verify OTLP endpoint: `curl http://localhost:4318/v1/traces`
- Check telemetry enabled: `enabled: true`
- Inspect SDK initialization logs
- Verify sampling rate: `sampleRate: 1.0` for testing

### Grafana dashboard empty
- Verify Prometheus scraping: `http://localhost:9090/targets`
- Check metric names match dashboard queries
- Verify data source configuration in Grafana

---

## Roadmap

- [ ] Add Prometheus metrics exporter
- [ ] Implement log forwarding to S3/CloudWatch
- [ ] Add structured error tracking (Sentry integration)
- [ ] Create alert rules for Prometheus Alertmanager
- [ ] Add custom business metrics (e.g., cost per approval)
- [ ] Implement trace sampling strategies (head-based, tail-based)
- [ ] Add compliance reports (SOC 2, GDPR audit trail)
