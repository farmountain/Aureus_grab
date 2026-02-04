import { TelemetryEvent, Metric, Span, LogEntry } from '../index';

/**
 * Exporter interface for sending telemetry data to external systems
 */
export interface TelemetryExporter {
  /**
   * Export telemetry events
   */
  exportEvents(events: TelemetryEvent[]): Promise<void>;

  /**
   * Export metrics
   */
  exportMetrics(metrics: Metric[]): Promise<void>;

  /**
   * Export spans
   */
  exportSpans(spans: Span[]): Promise<void>;

  /**
   * Export logs
   */
  exportLogs(logs: LogEntry[]): Promise<void>;

  /**
   * Flush any buffered data
   */
  flush(): Promise<void>;

  /**
   * Shutdown the exporter
   */
  shutdown(): Promise<void>;
}

/**
 * Sink configuration for telemetry data
 */
export interface SinkConfig {
  type: 'console' | 'file' | 'opentelemetry' | 'prometheus' | 'custom';
  enabled: boolean;
  options?: Record<string, unknown>;
}

/**
 * Console sink configuration
 */
export interface ConsoleSinkConfig extends SinkConfig {
  type: 'console';
  options?: {
    pretty?: boolean;
    colors?: boolean;
  };
}

/**
 * File sink configuration
 */
export interface FileSinkConfig extends SinkConfig {
  type: 'file';
  options: {
    path: string;
    maxSize?: number; // bytes
    maxFiles?: number;
    compress?: boolean;
  };
}

/**
 * OpenTelemetry sink configuration
 */
export interface OpenTelemetrySinkConfig extends SinkConfig {
  type: 'opentelemetry';
  options: {
    endpoint: string;
    protocol?: 'grpc' | 'http';
    headers?: Record<string, string>;
    compression?: boolean;
    serviceName?: string;
    serviceVersion?: string;
  };
}

/**
 * Prometheus sink configuration
 */
export interface PrometheusSinkConfig extends SinkConfig {
  type: 'prometheus';
  options: {
    port?: number;
    path?: string;
    prefix?: string;
    labels?: Record<string, string>;
  };
}

/**
 * Custom sink configuration
 */
export interface CustomSinkConfig extends SinkConfig {
  type: 'custom';
  options: {
    exporter: TelemetryExporter;
  };
}

/**
 * Union type for all sink configurations
 */
export type AnySinkConfig =
  | ConsoleSinkConfig
  | FileSinkConfig
  | OpenTelemetrySinkConfig
  | PrometheusSinkConfig
  | CustomSinkConfig;
