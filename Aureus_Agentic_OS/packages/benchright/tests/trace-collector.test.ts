import { describe, it, expect, beforeEach } from 'vitest';
import { TraceCollector } from '../src/trace-collector';
import { TelemetryCollector, TelemetryEventType } from '@aureus/observability';

describe('TraceCollector', () => {
  let collector: TraceCollector;
  let telemetry: TelemetryCollector;

  beforeEach(() => {
    collector = new TraceCollector();
    telemetry = new TelemetryCollector();
  });

  describe('Trace Ingestion', () => {
    it('should ingest traces from telemetry', () => {
      // Add telemetry events
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);

      // Ingest
      collector.ingestFromTelemetry(telemetry);

      // Verify traces
      const traces = collector.getTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].workflowId).toBe('wf-1');
      expect(traces[0].events).toHaveLength(2);
    });

    it('should create trace with correct status for successful workflow', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);

      collector.ingestFromTelemetry(telemetry);

      const traces = collector.getTraces();
      expect(traces[0].status).toBe('completed');
    });

    it('should create trace with failed status for failed workflow', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', false, 1000, 'Error occurred');

      collector.ingestFromTelemetry(telemetry);

      const traces = collector.getTraces();
      expect(traces[0].status).toBe('failed');
    });

    it('should calculate duration correctly', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      setTimeout(() => {
        telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      }, 10);

      setTimeout(() => {
        collector.ingestFromTelemetry(telemetry);

        const traces = collector.getTraces();
        expect(traces[0].duration).toBeGreaterThan(0);
      }, 20);
    });

    it('should extract metadata correctly', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      telemetry.recordToolCall('wf-1', 'task-1', 'api-call', {});
      telemetry.recordCRVResult('wf-1', 'task-1', 'gate-1', false, true);
      telemetry.recordRollback('wf-1', 'task-1', 'snap-1', 'Failed validation');

      collector.ingestFromTelemetry(telemetry);

      const traces = collector.getTraces();
      const metadata = traces[0].metadata as Record<string, unknown>;

      expect(metadata.rollbacks).toBe(1);
      expect(metadata.crvFailures).toBe(1);
    });

    it('should handle multiple workflows', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);

      telemetry.recordStepStart('wf-2', 'task-2', 'validation');
      telemetry.recordStepEnd('wf-2', 'task-2', 'validation', true, 500);

      collector.ingestFromTelemetry(telemetry);

      const traces = collector.getTraces();
      expect(traces).toHaveLength(2);
    });
  });

  describe('Trace Retrieval', () => {
    beforeEach(() => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);

      telemetry.recordStepStart('wf-2', 'task-2', 'validation');
      telemetry.recordStepEnd('wf-2', 'task-2', 'validation', false, 500);

      collector.ingestFromTelemetry(telemetry);
    });

    it('should get all traces', () => {
      const traces = collector.getTraces();
      expect(traces).toHaveLength(2);
    });

    it('should get trace by ID', () => {
      const traces = collector.getTraces();
      const trace = collector.getTrace(traces[0].id);
      expect(trace).toBeDefined();
      expect(trace?.id).toBe(traces[0].id);
    });

    it('should get completed traces only', () => {
      const completed = collector.getCompletedTraces();
      expect(completed).toHaveLength(2);
      expect(completed.every((t) => t.status === 'completed' || t.status === 'failed')).toBe(true);
    });

    it('should get traces in time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);

      const traces = collector.getTracesInTimeRange(oneHourAgo, now);
      expect(traces).toHaveLength(2);
    });
  });

  describe('Manual Trace Ingestion', () => {
    it('should ingest manually created trace', () => {
      const trace = {
        id: 'trace-1',
        workflowId: 'wf-1',
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000,
        events: [],
        spans: [],
        status: 'completed' as const,
      };

      collector.ingestTrace(trace);

      const traces = collector.getTraces();
      expect(traces).toHaveLength(1);
      expect(traces[0].id).toBe('trace-1');
    });
  });

  describe('Clear', () => {
    it('should clear all traces', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);

      collector.ingestFromTelemetry(telemetry);
      expect(collector.getTraces()).toHaveLength(1);

      collector.clear();
      expect(collector.getTraces()).toHaveLength(0);
    });
  });
});
