import { TelemetryExporter, AnySinkConfig } from './types';
import { OpenTelemetryExporter } from './opentelemetry';
import { PrometheusExporter } from './prometheus';
import { TelemetryEvent, Metric, Span, LogEntry } from '../index';
import * as fs from 'fs';

/**
 * Sink manager for handling multiple telemetry exporters
 */
export class SinkManager {
  private sinks: Map<string, TelemetryExporter> = new Map();
  private configs: Map<string, AnySinkConfig> = new Map();

  /**
   * Add a sink to the manager
   */
  addSink(name: string, config: AnySinkConfig): void {
    if (this.sinks.has(name)) {
      throw new Error(`Sink '${name}' already exists`);
    }

    this.configs.set(name, config);

    if (!config.enabled) {
      console.log(`Sink '${name}' is disabled, skipping initialization`);
      return;
    }

    const exporter = this.createExporter(config);
    this.sinks.set(name, exporter);
    console.log(`Sink '${name}' registered successfully`);
  }

  /**
   * Remove a sink from the manager
   */
  async removeSink(name: string): Promise<void> {
    const sink = this.sinks.get(name);
    if (sink) {
      await sink.shutdown();
      this.sinks.delete(name);
      this.configs.delete(name);
      console.log(`Sink '${name}' removed successfully`);
    }
  }

  /**
   * Get a sink by name
   */
  getSink(name: string): TelemetryExporter | undefined {
    return this.sinks.get(name);
  }

  /**
   * Get all sink names
   */
  getSinkNames(): string[] {
    return Array.from(this.sinks.keys());
  }

  /**
   * Export events to all enabled sinks
   */
  async exportEvents(events: TelemetryEvent[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [name, sink] of this.sinks) {
      promises.push(
        sink.exportEvents(events).catch(error => {
          console.error(`Failed to export events to sink '${name}':`, error);
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Export metrics to all enabled sinks
   */
  async exportMetrics(metrics: Metric[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [name, sink] of this.sinks) {
      promises.push(
        sink.exportMetrics(metrics).catch(error => {
          console.error(`Failed to export metrics to sink '${name}':`, error);
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Export spans to all enabled sinks
   */
  async exportSpans(spans: Span[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [name, sink] of this.sinks) {
      promises.push(
        sink.exportSpans(spans).catch(error => {
          console.error(`Failed to export spans to sink '${name}':`, error);
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Export logs to all enabled sinks
   */
  async exportLogs(logs: LogEntry[]): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [name, sink] of this.sinks) {
      promises.push(
        sink.exportLogs(logs).catch(error => {
          console.error(`Failed to export logs to sink '${name}':`, error);
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Flush all sinks
   */
  async flush(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [name, sink] of this.sinks) {
      promises.push(
        sink.flush().catch(error => {
          console.error(`Failed to flush sink '${name}':`, error);
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Shutdown all sinks
   */
  async shutdown(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [name, sink] of this.sinks) {
      promises.push(
        sink.shutdown().catch(error => {
          console.error(`Failed to shutdown sink '${name}':`, error);
        })
      );
    }

    await Promise.all(promises);

    this.sinks.clear();
    this.configs.clear();
  }

  /**
   * Create an exporter based on sink configuration
   */
  private createExporter(config: AnySinkConfig): TelemetryExporter {
    switch (config.type) {
      case 'opentelemetry':
        if (!config.options?.endpoint) {
          throw new Error('OpenTelemetry sink requires endpoint option');
        }
        return new OpenTelemetryExporter({
          endpoint: config.options.endpoint as string,
          protocol: config.options.protocol as 'grpc' | 'http' | undefined,
          headers: config.options.headers as Record<string, string> | undefined,
          compression: config.options.compression as boolean | undefined,
          serviceName: config.options.serviceName as string | undefined,
          serviceVersion: config.options.serviceVersion as string | undefined,
        });

      case 'prometheus':
        const prometheusExporter = new PrometheusExporter({
          port: config.options?.port as number | undefined,
          path: config.options?.path as string | undefined,
          prefix: config.options?.prefix as string | undefined,
          labels: config.options?.labels as Record<string, string> | undefined,
        });
        // Start Prometheus server
        prometheusExporter.start().catch(error => {
          console.error('Failed to start Prometheus server:', error);
        });
        return prometheusExporter;

      case 'console':
        return new ConsoleExporter(config.options);

      case 'file':
        if (!config.options?.path) {
          throw new Error('File sink requires path option');
        }
        return new FileExporter(config.options.path as string);

      case 'custom':
        if (!config.options?.exporter) {
          throw new Error('Custom sink requires exporter option');
        }
        return config.options.exporter as TelemetryExporter;

      default:
        throw new Error(`Unknown sink type: ${(config as any).type}`);
    }
  }
}

/**
 * Console exporter for logging telemetry data to console
 */
class ConsoleExporter implements TelemetryExporter {
  private pretty: boolean;
  private colors: boolean;

  constructor(options?: { pretty?: boolean; colors?: boolean }) {
    this.pretty = options?.pretty ?? true;
    this.colors = options?.colors ?? true;
  }

  async exportEvents(events: TelemetryEvent[]): Promise<void> {
    for (const event of events) {
      this.logEvent(event);
    }
  }

  async exportMetrics(metrics: Metric[]): Promise<void> {
    for (const metric of metrics) {
      this.logMetric(metric);
    }
  }

  async exportSpans(spans: Span[]): Promise<void> {
    for (const span of spans) {
      this.logSpan(span);
    }
  }

  async exportLogs(logs: LogEntry[]): Promise<void> {
    for (const log of logs) {
      this.logEntry(log);
    }
  }

  async flush(): Promise<void> {
    // No-op
  }

  async shutdown(): Promise<void> {
    // No-op
  }

  private logEvent(event: TelemetryEvent): void {
    const timestamp = event.timestamp.toISOString();
    const prefix = this.colors ? '\x1b[36m[EVENT]\x1b[0m' : '[EVENT]';
    
    if (this.pretty) {
      console.log(`${prefix} ${timestamp} ${event.type}`);
      console.log(`  Workflow: ${event.workflowId || 'N/A'}`);
      console.log(`  Task: ${event.taskId || 'N/A'} (${event.taskType || 'N/A'})`);
      if (event.correlationId) {
        console.log(`  Correlation: ${event.correlationId}`);
      }
      console.log(`  Data:`, event.data);
    } else {
      console.log(JSON.stringify({ ...event, logType: 'event' }));
    }
  }

  private logMetric(metric: Metric): void {
    const timestamp = metric.timestamp.toISOString();
    const prefix = this.colors ? '\x1b[33m[METRIC]\x1b[0m' : '[METRIC]';
    
    if (this.pretty) {
      console.log(`${prefix} ${timestamp} ${metric.name} = ${metric.value}`);
      if (metric.tags) {
        console.log(`  Tags:`, metric.tags);
      }
    } else {
      console.log(JSON.stringify({ type: 'metric', ...metric }));
    }
  }

  private logSpan(span: Span): void {
    const prefix = this.colors ? '\x1b[35m[SPAN]\x1b[0m' : '[SPAN]';
    
    if (this.pretty) {
      console.log(`${prefix} ${span.name}`);
      console.log(`  Trace: ${span.traceId}`);
      console.log(`  Span: ${span.id}`);
      if (span.parentId) {
        console.log(`  Parent: ${span.parentId}`);
      }
      console.log(`  Duration: ${span.duration || 'N/A'}ms`);
    } else {
      console.log(JSON.stringify({ type: 'span', ...span }));
    }
  }

  private logEntry(log: LogEntry): void {
    const timestamp = log.timestamp.toISOString();
    const levelColors: Record<string, string> = {
      debug: '\x1b[90m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
    };
    const color = this.colors ? levelColors[log.level] || '' : '';
    const reset = this.colors ? '\x1b[0m' : '';
    
    if (this.pretty) {
      console.log(`${color}[${log.level.toUpperCase()}]${reset} ${timestamp} ${log.message}`);
      if (log.context) {
        console.log(`  Context:`, log.context);
      }
    } else {
      console.log(JSON.stringify({ type: 'log', ...log }));
    }
  }
}

/**
 * File exporter for writing telemetry data to files
 */
class FileExporter implements TelemetryExporter {
  private path: string;

  constructor(path: string) {
    this.path = path;
  }

  async exportEvents(events: TelemetryEvent[]): Promise<void> {
    for (const event of events) {
      await this.appendToFile(JSON.stringify({ ...event, logType: 'event' }) + '\n');
    }
  }

  async exportMetrics(metrics: Metric[]): Promise<void> {
    for (const metric of metrics) {
      await this.appendToFile(JSON.stringify({ type: 'metric', ...metric }) + '\n');
    }
  }

  async exportSpans(spans: Span[]): Promise<void> {
    for (const span of spans) {
      await this.appendToFile(JSON.stringify({ type: 'span', ...span }) + '\n');
    }
  }

  async exportLogs(logs: LogEntry[]): Promise<void> {
    for (const log of logs) {
      await this.appendToFile(JSON.stringify({ type: 'log', ...log }) + '\n');
    }
  }

  async flush(): Promise<void> {
    // No-op
  }

  async shutdown(): Promise<void> {
    // No-op
  }

  private async appendToFile(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.appendFile(this.path, data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export { ConsoleExporter, FileExporter };
