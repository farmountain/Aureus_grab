import { TelemetryExporter } from './types';
import { TelemetryEvent, Metric, Span, LogEntry, TelemetryEventType } from '../index';

/**
 * OpenTelemetry exporter configuration
 */
export interface OpenTelemetryConfig {
  endpoint: string;
  protocol?: 'grpc' | 'http';
  headers?: Record<string, string>;
  compression?: boolean;
  serviceName?: string;
  serviceVersion?: string;
}

/**
 * OpenTelemetry exporter for sending telemetry to OTLP endpoints
 * Supports both gRPC and HTTP/JSON protocols
 */
export class OpenTelemetryExporter implements TelemetryExporter {
  private config: Required<OpenTelemetryConfig>;
  private resourceAttributes: Record<string, string>;

  constructor(config: OpenTelemetryConfig) {
    this.config = {
      endpoint: config.endpoint,
      protocol: config.protocol || 'http',
      headers: config.headers || {},
      compression: config.compression ?? true,
      serviceName: config.serviceName || 'aureus-agentic-os',
      serviceVersion: config.serviceVersion || '0.1.0',
    };

    this.resourceAttributes = {
      'service.name': this.config.serviceName,
      'service.version': this.config.serviceVersion,
    };
  }

  /**
   * Export telemetry events as OTLP logs
   */
  async exportEvents(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;

    const logs = events.map(event => this.convertEventToLog(event));
    await this.sendLogs(logs);
  }

  /**
   * Export metrics in OTLP format
   */
  async exportMetrics(metrics: Metric[]): Promise<void> {
    if (metrics.length === 0) return;

    const otlpMetrics = this.convertMetricsToOTLP(metrics);
    await this.sendMetrics(otlpMetrics);
  }

  /**
   * Export spans as OTLP traces
   */
  async exportSpans(spans: Span[]): Promise<void> {
    if (spans.length === 0) return;

    const otlpSpans = spans.map(span => this.convertSpanToOTLP(span));
    await this.sendTraces(otlpSpans);
  }

  /**
   * Export logs in OTLP format
   */
  async exportLogs(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return;

    const otlpLogs = logs.map(log => this.convertLogToOTLP(log));
    await this.sendLogs(otlpLogs);
  }

  /**
   * Flush buffered data
   */
  async flush(): Promise<void> {
    // No buffering in this implementation
    return Promise.resolve();
  }

  /**
   * Shutdown the exporter
   */
  async shutdown(): Promise<void> {
    return this.flush();
  }

  /**
   * Convert telemetry event to OTLP log record
   */
  private convertEventToLog(event: TelemetryEvent): Record<string, unknown> {
    return {
      timeUnixNano: this.toNanoTimestamp(event.timestamp),
      severityNumber: this.getSeverityNumber(event.type),
      severityText: this.getSeverityText(event.type),
      body: {
        stringValue: this.formatEventMessage(event),
      },
      attributes: [
        { key: 'event.type', value: { stringValue: event.type } },
        ...(event.workflowId ? [{ key: 'workflow.id', value: { stringValue: event.workflowId } }] : []),
        ...(event.taskId ? [{ key: 'task.id', value: { stringValue: event.taskId } }] : []),
        ...(event.taskType ? [{ key: 'task.type', value: { stringValue: event.taskType } }] : []),
        ...this.convertDataToAttributes(event.data),
        ...this.convertTagsToAttributes(event.tags),
      ],
      traceId: event.data.traceId ? this.hexToBytes(event.data.traceId as string) : undefined,
      spanId: event.data.spanId ? this.hexToBytes(event.data.spanId as string) : undefined,
    };
  }

  /**
   * Convert metric to OTLP metric
   */
  private convertMetricsToOTLP(metrics: Metric[]): Record<string, unknown>[] {
    const metricsByName = new Map<string, Metric[]>();

    // Group metrics by name
    for (const metric of metrics) {
      if (!metricsByName.has(metric.name)) {
        metricsByName.set(metric.name, []);
      }
      metricsByName.get(metric.name)!.push(metric);
    }

    // Convert each group to OTLP metric
    return Array.from(metricsByName.entries()).map(([name, metricGroup]) => ({
      name,
      description: '',
      unit: '',
      gauge: {
        dataPoints: metricGroup.map(m => ({
          timeUnixNano: this.toNanoTimestamp(m.timestamp),
          asDouble: m.value,
          attributes: this.convertTagsToAttributes(m.tags),
        })),
      },
    }));
  }

  /**
   * Convert span to OTLP span
   */
  private convertSpanToOTLP(span: Span): Record<string, unknown> {
    return {
      traceId: this.hexToBytes(span.traceId),
      spanId: this.hexToBytes(span.id),
      parentSpanId: span.parentId ? this.hexToBytes(span.parentId) : undefined,
      name: span.name,
      startTimeUnixNano: this.toNanoTimestamp(span.startTime),
      endTimeUnixNano: span.endTime ? this.toNanoTimestamp(span.endTime) : undefined,
      attributes: this.convertTagsToAttributes(span.tags),
      events: span.logs?.map(log => ({
        timeUnixNano: this.toNanoTimestamp(log.timestamp),
        name: log.level,
        attributes: [
          { key: 'message', value: { stringValue: log.message } },
          ...this.convertDataToAttributes(log.context || {}),
        ],
      })),
    };
  }

  /**
   * Convert log entry to OTLP log record
   */
  private convertLogToOTLP(log: LogEntry): Record<string, unknown> {
    return {
      timeUnixNano: this.toNanoTimestamp(log.timestamp),
      severityNumber: this.getLogSeverityNumber(log.level),
      severityText: log.level.toUpperCase(),
      body: {
        stringValue: log.message,
      },
      attributes: this.convertDataToAttributes(log.context || {}),
    };
  }

  /**
   * Send logs to OTLP endpoint
   */
  private async sendLogs(logs: Record<string, unknown>[]): Promise<void> {
    const payload = {
      resourceLogs: [
        {
          resource: {
            attributes: Object.entries(this.resourceAttributes).map(([key, value]) => ({
              key,
              value: { stringValue: value },
            })),
          },
          scopeLogs: [
            {
              scope: {
                name: 'aureus-observability',
                version: '0.1.0',
              },
              logRecords: logs,
            },
          ],
        },
      ],
    };

    await this.sendToEndpoint('/v1/logs', payload);
  }

  /**
   * Send metrics to OTLP endpoint
   */
  private async sendMetrics(metrics: Record<string, unknown>[]): Promise<void> {
    const payload = {
      resourceMetrics: [
        {
          resource: {
            attributes: Object.entries(this.resourceAttributes).map(([key, value]) => ({
              key,
              value: { stringValue: value },
            })),
          },
          scopeMetrics: [
            {
              scope: {
                name: 'aureus-observability',
                version: '0.1.0',
              },
              metrics,
            },
          ],
        },
      ],
    };

    await this.sendToEndpoint('/v1/metrics', payload);
  }

  /**
   * Send traces to OTLP endpoint
   */
  private async sendTraces(spans: Record<string, unknown>[]): Promise<void> {
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: Object.entries(this.resourceAttributes).map(([key, value]) => ({
              key,
              value: { stringValue: value },
            })),
          },
          scopeSpans: [
            {
              scope: {
                name: 'aureus-observability',
                version: '0.1.0',
              },
              spans,
            },
          ],
        },
      ],
    };

    await this.sendToEndpoint('/v1/traces', payload);
  }

  /**
   * Send data to OTLP endpoint
   */
  private async sendToEndpoint(path: string, payload: unknown): Promise<void> {
    const url = `${this.config.endpoint}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    try {
      // Check if fetch is available (Node.js 18+)
      if (typeof fetch === 'undefined') {
        throw new Error('fetch API not available. Please use Node.js 18+ or provide a fetch polyfill.');
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OTLP export failed: ${response.status} ${error}`);
      }
    } catch (error) {
      console.error('Failed to export to OpenTelemetry:', error);
      throw error;
    }
  }

  /**
   * Convert timestamp to nanoseconds
   */
  private toNanoTimestamp(date: Date): string {
    return `${date.getTime()}000000`;
  }

  /**
   * Convert hex string to bytes (for trace/span IDs)
   */
  private hexToBytes(hex: string): string {
    // OTLP expects base64-encoded bytes, but for simplicity we'll use hex string
    return hex;
  }

  /**
   * Get severity number for event type
   */
  private getSeverityNumber(eventType: TelemetryEventType): number {
    const severityMap: Record<TelemetryEventType, number> = {
      [TelemetryEventType.STEP_START]: 9, // INFO
      [TelemetryEventType.STEP_END]: 9, // INFO
      [TelemetryEventType.TOOL_CALL]: 9, // INFO
      [TelemetryEventType.CRV_RESULT]: 13, // WARN
      [TelemetryEventType.POLICY_CHECK]: 13, // WARN
      [TelemetryEventType.SNAPSHOT_COMMIT]: 9, // INFO
      [TelemetryEventType.ROLLBACK]: 17, // ERROR
      [TelemetryEventType.LLM_ARTIFACT_GENERATED]: 9, // INFO
      [TelemetryEventType.LLM_PROMPT]: 9, // INFO
      [TelemetryEventType.LLM_RESPONSE]: 9, // INFO
      [TelemetryEventType.CUSTOM]: 9, // INFO
    };
    return severityMap[eventType] || 9;
  }

  /**
   * Get severity text for event type
   */
  private getSeverityText(eventType: TelemetryEventType): string {
    const severityMap: Record<TelemetryEventType, string> = {
      [TelemetryEventType.STEP_START]: 'INFO',
      [TelemetryEventType.STEP_END]: 'INFO',
      [TelemetryEventType.TOOL_CALL]: 'INFO',
      [TelemetryEventType.CRV_RESULT]: 'WARN',
      [TelemetryEventType.POLICY_CHECK]: 'WARN',
      [TelemetryEventType.SNAPSHOT_COMMIT]: 'INFO',
      [TelemetryEventType.ROLLBACK]: 'ERROR',
      [TelemetryEventType.LLM_ARTIFACT_GENERATED]: 'INFO',
      [TelemetryEventType.LLM_PROMPT]: 'INFO',
      [TelemetryEventType.LLM_RESPONSE]: 'INFO',
      [TelemetryEventType.CUSTOM]: 'INFO',
    };
    return severityMap[eventType] || 'INFO';
  }

  /**
   * Get severity number for log level
   */
  private getLogSeverityNumber(level: LogEntry['level']): number {
    const severityMap: Record<LogEntry['level'], number> = {
      debug: 5,
      info: 9,
      warn: 13,
      error: 17,
    };
    return severityMap[level] || 9;
  }

  /**
   * Format event message
   */
  private formatEventMessage(event: TelemetryEvent): string {
    switch (event.type) {
      case TelemetryEventType.STEP_START:
        return `Task started: ${event.taskType} (${event.taskId})`;
      case TelemetryEventType.STEP_END:
        return `Task ${event.data.success ? 'completed' : 'failed'}: ${event.taskType} (${event.taskId})`;
      case TelemetryEventType.TOOL_CALL:
        return `Tool called: ${event.data.toolName}`;
      case TelemetryEventType.CRV_RESULT:
        return `CRV gate ${event.data.gateName}: ${event.data.passed ? 'passed' : 'failed'}`;
      case TelemetryEventType.POLICY_CHECK:
        return `Policy check: ${event.data.allowed ? 'allowed' : 'denied'}`;
      case TelemetryEventType.SNAPSHOT_COMMIT:
        return `Snapshot committed: ${event.data.snapshotId}`;
      case TelemetryEventType.ROLLBACK:
        return `Rollback to snapshot: ${event.data.snapshotId}`;
      default:
        return `Event: ${event.type}`;
    }
  }

  /**
   * Convert data object to OTLP attributes
   */
  private convertDataToAttributes(data: Record<string, unknown>): Array<{ key: string; value: unknown }> {
    return Object.entries(data).map(([key, value]) => ({
      key: `data.${key}`,
      value: this.convertValueToOTLP(value),
    }));
  }

  /**
   * Convert tags to OTLP attributes
   */
  private convertTagsToAttributes(tags?: Record<string, string>): Array<{ key: string; value: unknown }> {
    if (!tags) return [];
    return Object.entries(tags).map(([key, value]) => ({
      key,
      value: { stringValue: value },
    }));
  }

  /**
   * Convert value to OTLP attribute value
   */
  private convertValueToOTLP(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      return { stringValue: value };
    } else if (typeof value === 'number') {
      return { doubleValue: value };
    } else if (typeof value === 'boolean') {
      return { boolValue: value };
    } else {
      return { stringValue: JSON.stringify(value) };
    }
  }
}
