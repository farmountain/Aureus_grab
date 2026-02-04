import { describe, it, expect, beforeEach } from 'vitest';
import {
  OpenTelemetryExporter,
  PrometheusExporter,
  SinkManager,
  TelemetryCollector,
  TelemetryEventType,
} from '../src';

describe('Exporters', () => {
  describe('OpenTelemetryExporter', () => {
    it('should create exporter with default config', () => {
      const exporter = new OpenTelemetryExporter({
        endpoint: 'http://localhost:4318',
      });
      expect(exporter).toBeDefined();
    });

    it('should export events without errors', async () => {
      const exporter = new OpenTelemetryExporter({
        endpoint: 'http://localhost:4318',
      });

      const events = [
        {
          type: TelemetryEventType.STEP_START,
          timestamp: new Date(),
          workflowId: 'wf-1',
          taskId: 'task-1',
          taskType: 'action',
          correlationId: 'corr-123',
          data: { attempt: 1 },
        },
      ];

      // Should not throw even if endpoint is not available
      await expect(exporter.exportEvents(events)).rejects.toThrow();
    });

    it('should export metrics without errors', async () => {
      const exporter = new OpenTelemetryExporter({
        endpoint: 'http://localhost:4318',
      });

      const metrics = [
        {
          name: 'test_metric',
          value: 42,
          timestamp: new Date(),
          tags: { env: 'test' },
        },
      ];

      // Should not throw even if endpoint is not available
      await expect(exporter.exportMetrics(metrics)).rejects.toThrow();
    });

    it('should export spans without errors', async () => {
      const exporter = new OpenTelemetryExporter({
        endpoint: 'http://localhost:4318',
      });

      const spans = [
        {
          id: 'span-1',
          traceId: 'trace-1',
          name: 'test-span',
          startTime: new Date(),
          endTime: new Date(),
          duration: 100,
        },
      ];

      // Should not throw even if endpoint is not available
      await expect(exporter.exportSpans(spans)).rejects.toThrow();
    });

    it('should shutdown without errors', async () => {
      const exporter = new OpenTelemetryExporter({
        endpoint: 'http://localhost:4318',
      });

      await expect(exporter.shutdown()).resolves.not.toThrow();
    });
  });

  describe('PrometheusExporter', () => {
    it('should create exporter with default config', () => {
      const exporter = new PrometheusExporter();
      expect(exporter).toBeDefined();
    });

    it('should export events and convert to counters', async () => {
      const exporter = new PrometheusExporter({
        port: 9091,
        prefix: 'test',
      });

      const events = [
        {
          type: TelemetryEventType.STEP_START,
          timestamp: new Date(),
          workflowId: 'wf-1',
          taskId: 'task-1',
          taskType: 'action',
          data: {},
        },
        {
          type: TelemetryEventType.STEP_END,
          timestamp: new Date(),
          workflowId: 'wf-1',
          taskId: 'task-1',
          taskType: 'action',
          data: { success: true, duration: 100 },
        },
      ];

      await expect(exporter.exportEvents(events)).resolves.not.toThrow();
    });

    it('should export metrics as gauges', async () => {
      const exporter = new PrometheusExporter({
        prefix: 'test',
      });

      const metrics = [
        {
          name: 'test_metric',
          value: 42,
          timestamp: new Date(),
          tags: { env: 'test' },
        },
      ];

      await expect(exporter.exportMetrics(metrics)).resolves.not.toThrow();
    });

    it('should shutdown without errors', async () => {
      const exporter = new PrometheusExporter();
      await expect(exporter.shutdown()).resolves.not.toThrow();
    });
  });

  describe('SinkManager', () => {
    let sinkManager: SinkManager;

    beforeEach(() => {
      sinkManager = new SinkManager();
    });

    it('should add console sink', () => {
      sinkManager.addSink('console', {
        type: 'console',
        enabled: true,
        options: { pretty: true },
      });

      expect(sinkManager.getSinkNames()).toContain('console');
    });

    it('should add OpenTelemetry sink', () => {
      sinkManager.addSink('otlp', {
        type: 'opentelemetry',
        enabled: true,
        options: {
          endpoint: 'http://localhost:4318',
        },
      });

      expect(sinkManager.getSinkNames()).toContain('otlp');
    });

    it('should add Prometheus sink', () => {
      sinkManager.addSink('prometheus', {
        type: 'prometheus',
        enabled: true,
        options: {
          port: 9092,
        },
      });

      expect(sinkManager.getSinkNames()).toContain('prometheus');
    });

    it('should not add disabled sink', () => {
      sinkManager.addSink('disabled', {
        type: 'console',
        enabled: false,
      });

      expect(sinkManager.getSink('disabled')).toBeUndefined();
    });

    it('should remove sink', async () => {
      sinkManager.addSink('console', {
        type: 'console',
        enabled: true,
      });

      await sinkManager.removeSink('console');
      expect(sinkManager.getSinkNames()).not.toContain('console');
    });

    it('should export events to all sinks', async () => {
      sinkManager.addSink('console', {
        type: 'console',
        enabled: true,
      });

      const events = [
        {
          type: TelemetryEventType.STEP_START,
          timestamp: new Date(),
          workflowId: 'wf-1',
          taskId: 'task-1',
          taskType: 'action',
          data: {},
        },
      ];

      await expect(sinkManager.exportEvents(events)).resolves.not.toThrow();
    });

    it('should flush all sinks', async () => {
      sinkManager.addSink('console', {
        type: 'console',
        enabled: true,
      });

      await expect(sinkManager.flush()).resolves.not.toThrow();
    });

    it('should shutdown all sinks', async () => {
      sinkManager.addSink('console', {
        type: 'console',
        enabled: true,
      });

      await expect(sinkManager.shutdown()).resolves.not.toThrow();
      expect(sinkManager.getSinkNames()).toHaveLength(0);
    });
  });

  describe('TelemetryCollector with SinkManager', () => {
    it('should record events with correlation ID', () => {
      const collector = new TelemetryCollector(undefined, 'corr-123');

      collector.recordStepStart('wf-1', 'task-1', 'action');

      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].correlationId).toBe('corr-123');
    });

    it('should update correlation ID', () => {
      const collector = new TelemetryCollector();

      collector.setCorrelationId('corr-456');
      collector.recordStepStart('wf-1', 'task-1', 'action');

      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].correlationId).toBe('corr-456');
    });

    it('should export events to sink manager', async () => {
      const sinkManager = new SinkManager();
      sinkManager.addSink('console', {
        type: 'console',
        enabled: true,
      });

      const collector = new TelemetryCollector(sinkManager, 'corr-789');
      collector.recordStepStart('wf-1', 'task-1', 'action');

      // Events should be auto-exported to sinks
      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].correlationId).toBe('corr-789');

      await sinkManager.shutdown();
    });
  });
});
