import { TelemetryExporter } from './types';
import { TelemetryEvent, Metric, Span, LogEntry, TelemetryEventType } from '../index';
import { createServer, IncomingMessage, ServerResponse } from 'http';

/**
 * Prometheus exporter configuration
 */
export interface PrometheusConfig {
  port?: number;
  path?: string;
  prefix?: string;
  labels?: Record<string, string>;
}

/**
 * Prometheus metric types
 */
enum PrometheusMetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary',
}

/**
 * Internal metric representation for Prometheus
 */
interface PrometheusMetric {
  name: string;
  type: PrometheusMetricType;
  help: string;
  value: number;
  labels: Record<string, string>;
  timestamp?: number;
}

/**
 * Prometheus exporter for exposing metrics in Prometheus format
 * Provides /metrics HTTP endpoint for Prometheus scraping
 */
export class PrometheusExporter implements TelemetryExporter {
  private config: Required<PrometheusConfig>;
  private metrics: Map<string, PrometheusMetric> = new Map();
  private server?: ReturnType<typeof createServer>;
  private counters: Map<string, number> = new Map();

  constructor(config: PrometheusConfig = {}) {
    this.config = {
      port: config.port || 9090,
      path: config.path || '/metrics',
      prefix: config.prefix || 'aureus',
      labels: config.labels || {},
    };
  }

  /**
   * Start the Prometheus metrics server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        if (req.url === this.config.path && req.method === 'GET') {
          this.handleMetricsRequest(req, res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      this.server.listen(this.config.port, () => {
        console.log(`Prometheus metrics server listening on port ${this.config.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the Prometheus metrics server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close(err => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Export telemetry events as Prometheus metrics
   */
  async exportEvents(events: TelemetryEvent[]): Promise<void> {
    for (const event of events) {
      this.processEvent(event);
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  async exportMetrics(metrics: Metric[]): Promise<void> {
    for (const metric of metrics) {
      const metricName = this.sanitizeMetricName(metric.name);
      const fullName = `${this.config.prefix}_${metricName}`;
      const labels = { ...this.config.labels, ...metric.tags };

      this.recordMetric({
        name: fullName,
        type: PrometheusMetricType.GAUGE,
        help: `Gauge metric: ${metric.name}`,
        value: metric.value,
        labels,
        timestamp: metric.timestamp.getTime(),
      });
    }
  }

  /**
   * Export spans as Prometheus metrics
   */
  async exportSpans(spans: Span[]): Promise<void> {
    for (const span of spans) {
      if (span.duration !== undefined) {
        const metricName = `${this.config.prefix}_span_duration_ms`;
        const labels = {
          ...this.config.labels,
          span_name: span.name,
          trace_id: span.traceId,
        };

        this.recordMetric({
          name: metricName,
          type: PrometheusMetricType.HISTOGRAM,
          help: 'Span duration in milliseconds',
          value: span.duration,
          labels,
        });
      }
    }
  }

  /**
   * Export logs (logs are not typically exported to Prometheus)
   */
  async exportLogs(logs: LogEntry[]): Promise<void> {
    // Count logs by level
    const logCounts: Record<string, number> = {};
    for (const log of logs) {
      logCounts[log.level] = (logCounts[log.level] || 0) + 1;
    }

    for (const [level, count] of Object.entries(logCounts)) {
      const metricName = `${this.config.prefix}_logs_total`;
      const labels = { ...this.config.labels, level };

      this.incrementCounter(metricName, count, labels);
    }
  }

  /**
   * Flush buffered data (no-op for Prometheus)
   */
  async flush(): Promise<void> {
    // Prometheus scrapes metrics, so no need to flush
    return Promise.resolve();
  }

  /**
   * Shutdown the exporter
   */
  async shutdown(): Promise<void> {
    await this.stop();
  }

  /**
   * Process telemetry event and convert to Prometheus metrics
   */
  private processEvent(event: TelemetryEvent): void {
    const baseLabels = {
      ...this.config.labels,
      event_type: event.type,
      ...(event.workflowId && { workflow_id: event.workflowId }),
      ...(event.taskType && { task_type: event.taskType }),
    };

    switch (event.type) {
      case TelemetryEventType.STEP_START:
        this.incrementCounter(`${this.config.prefix}_tasks_started_total`, 1, baseLabels);
        break;

      case TelemetryEventType.STEP_END:
        const success = event.data.success as boolean;
        this.incrementCounter(
          `${this.config.prefix}_tasks_completed_total`,
          1,
          { ...baseLabels, success: String(success) }
        );

        if (event.data.duration !== undefined) {
          this.recordMetric({
            name: `${this.config.prefix}_task_duration_ms`,
            type: PrometheusMetricType.HISTOGRAM,
            help: 'Task execution duration in milliseconds',
            value: event.data.duration as number,
            labels: baseLabels,
          });
        }
        break;

      case TelemetryEventType.TOOL_CALL:
        this.incrementCounter(
          `${this.config.prefix}_tool_calls_total`,
          1,
          { ...baseLabels, tool_name: event.data.toolName as string }
        );
        break;

      case TelemetryEventType.CRV_RESULT:
        const crvLabels = {
          ...baseLabels,
          gate_name: event.data.gateName as string,
          passed: String(event.data.passed),
          blocked: String(event.data.blocked),
        };
        this.incrementCounter(`${this.config.prefix}_crv_checks_total`, 1, crvLabels);
        break;

      case TelemetryEventType.POLICY_CHECK:
        const policyLabels = {
          ...baseLabels,
          allowed: String(event.data.allowed),
          requires_approval: String(event.data.requiresHumanApproval),
        };
        this.incrementCounter(`${this.config.prefix}_policy_checks_total`, 1, policyLabels);
        break;

      case TelemetryEventType.SNAPSHOT_COMMIT:
        this.incrementCounter(`${this.config.prefix}_snapshots_total`, 1, baseLabels);
        break;

      case TelemetryEventType.ROLLBACK:
        this.incrementCounter(`${this.config.prefix}_rollbacks_total`, 1, baseLabels);
        break;
    }
  }

  /**
   * Record a metric
   */
  private recordMetric(metric: PrometheusMetric): void {
    const key = this.getMetricKey(metric.name, metric.labels);
    this.metrics.set(key, metric);
  }

  /**
   * Increment a counter metric
   */
  private incrementCounter(name: string, value: number, labels: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    const currentValue = this.counters.get(key) || 0;
    this.counters.set(key, currentValue + value);

    this.recordMetric({
      name,
      type: PrometheusMetricType.COUNTER,
      help: `Counter metric: ${name}`,
      value: currentValue + value,
      labels,
    });
  }

  /**
   * Get unique key for metric with labels
   */
  private getMetricKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  /**
   * Handle HTTP request for metrics
   */
  private handleMetricsRequest(req: IncomingMessage, res: ServerResponse): void {
    const output = this.generatePrometheusOutput();

    res.writeHead(200, {
      'Content-Type': 'text/plain; version=0.0.4',
      'Content-Length': Buffer.byteLength(output),
    });
    res.end(output);
  }

  /**
   * Generate Prometheus exposition format output
   */
  private generatePrometheusOutput(): string {
    const lines: string[] = [];
    const metricsByName = new Map<string, PrometheusMetric[]>();

    // Group metrics by name
    for (const metric of this.metrics.values()) {
      if (!metricsByName.has(metric.name)) {
        metricsByName.set(metric.name, []);
      }
      metricsByName.get(metric.name)!.push(metric);
    }

    // Generate output for each metric
    for (const [name, metrics] of metricsByName.entries()) {
      const firstMetric = metrics[0];
      
      // HELP line
      lines.push(`# HELP ${name} ${firstMetric.help}`);
      
      // TYPE line
      lines.push(`# TYPE ${name} ${firstMetric.type}`);
      
      // Metric lines
      for (const metric of metrics) {
        const labelStr = this.formatLabels(metric.labels);
        const timestampStr = metric.timestamp ? ` ${metric.timestamp}` : '';
        lines.push(`${name}${labelStr} ${metric.value}${timestampStr}`);
      }
      
      lines.push(''); // Empty line between metrics
    }

    return lines.join('\n');
  }

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labels: Record<string, string>): string {
    if (Object.keys(labels).length === 0) {
      return '';
    }

    const labelPairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`)
      .join(',');

    return `{${labelPairs}}`;
  }

  /**
   * Escape label value for Prometheus format
   */
  private escapeLabel(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  /**
   * Sanitize metric name for Prometheus
   */
  private sanitizeMetricName(name: string): string {
    // Replace invalid characters with underscores
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_');
  }
}
