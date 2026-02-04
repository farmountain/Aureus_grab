import { describe, it, expect, beforeEach } from 'vitest';
import {
  TelemetryCollector,
  TelemetryEventType,
  MetricsAggregator,
} from '../src/index';

describe('TelemetryCollector', () => {
  let collector: TelemetryCollector;

  beforeEach(() => {
    collector = new TelemetryCollector();
  });

  describe('Event Recording', () => {
    it('should record step_start events', () => {
      collector.recordStepStart('wf-1', 'task-1', 'action');
      
      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TelemetryEventType.STEP_START);
      expect(events[0].workflowId).toBe('wf-1');
      expect(events[0].taskId).toBe('task-1');
      expect(events[0].taskType).toBe('action');
    });

    it('should record step_end events', () => {
      collector.recordStepEnd('wf-1', 'task-1', 'action', true, 1000);
      
      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TelemetryEventType.STEP_END);
      expect(events[0].data.success).toBe(true);
      expect(events[0].data.duration).toBe(1000);
    });

    it('should record tool_call events', () => {
      collector.recordToolCall('wf-1', 'task-1', 'http-get', { url: 'https://api.example.com' });
      
      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TelemetryEventType.TOOL_CALL);
      expect(events[0].data.toolName).toBe('http-get');
    });

    it('should record crv_result events', () => {
      collector.recordCRVResult('wf-1', 'task-1', 'validation-gate', true, false);
      
      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TelemetryEventType.CRV_RESULT);
      expect(events[0].data.gateName).toBe('validation-gate');
      expect(events[0].data.passed).toBe(true);
      expect(events[0].data.blocked).toBe(false);
    });

    it('should record policy_check events', () => {
      collector.recordPolicyCheck('wf-1', 'task-1', true, false, 'Allowed');
      
      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TelemetryEventType.POLICY_CHECK);
      expect(events[0].data.allowed).toBe(true);
      expect(events[0].data.requiresHumanApproval).toBe(false);
    });

    it('should record snapshot_commit events', () => {
      collector.recordSnapshotCommit('wf-1', 'task-1', 'snap-123');
      
      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TelemetryEventType.SNAPSHOT_COMMIT);
      expect(events[0].data.snapshotId).toBe('snap-123');
    });

    it('should record rollback events', () => {
      collector.recordRollback('wf-1', 'task-1', 'snap-123', 'Task failed');
      
      const events = collector.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TelemetryEventType.ROLLBACK);
      expect(events[0].data.snapshotId).toBe('snap-123');
      expect(events[0].data.reason).toBe('Task failed');
    });
  });

  describe('Event Filtering', () => {
    it('should filter events by type', () => {
      collector.recordStepStart('wf-1', 'task-1', 'action');
      collector.recordStepEnd('wf-1', 'task-1', 'action', true, 1000);
      collector.recordToolCall('wf-1', 'task-1', 'tool-1', {});
      
      const stepStartEvents = collector.getEventsByType(TelemetryEventType.STEP_START);
      expect(stepStartEvents).toHaveLength(1);
      expect(stepStartEvents[0].type).toBe(TelemetryEventType.STEP_START);
    });

    it('should filter events by time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const twoHoursAgo = new Date(now.getTime() - 7200000);
      
      collector.recordStepStart('wf-1', 'task-1', 'action');
      
      const events = collector.getEventsInTimeRange(twoHoursAgo, now);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('Metrics Recording', () => {
    it('should record metrics with tags', () => {
      collector.recordMetric('task_duration', 1500, { taskType: 'action' });
      
      const metrics = collector.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('task_duration');
      expect(metrics[0].value).toBe(1500);
      expect(metrics[0].tags).toEqual({ taskType: 'action' });
    });
  });
});

describe('MetricsAggregator', () => {
  let collector: TelemetryCollector;
  let aggregator: MetricsAggregator;

  beforeEach(() => {
    collector = new TelemetryCollector();
    aggregator = new MetricsAggregator(collector);
  });

  describe('Task Success Rate', () => {
    it('should calculate success rate by task type', () => {
      // Record some successful tasks
      collector.recordStepEnd('wf-1', 'task-1', 'action', true, 1000);
      collector.recordStepEnd('wf-1', 'task-2', 'action', true, 1500);
      collector.recordStepEnd('wf-1', 'task-3', 'query', true, 500);
      
      // Record some failed tasks
      collector.recordStepEnd('wf-1', 'task-4', 'action', false, 100, 'Error');
      
      const rates = aggregator.calculateTaskSuccessRate();
      
      expect(rates.action).toBe(2 / 3); // 2 successful out of 3
      expect(rates.query).toBe(1); // 1 successful out of 1
    });

    it('should filter by specific task type', () => {
      collector.recordStepEnd('wf-1', 'task-1', 'action', true, 1000);
      collector.recordStepEnd('wf-1', 'task-2', 'query', false, 500, 'Error');
      
      const rates = aggregator.calculateTaskSuccessRate('action');
      
      expect(rates.action).toBe(1);
      expect(rates.query).toBeUndefined();
    });

    it('should return empty object when no tasks', () => {
      const rates = aggregator.calculateTaskSuccessRate();
      expect(rates).toEqual({});
    });
  });

  describe('Mean Time To Recovery (MTTR)', () => {
    it('should calculate MTTR correctly', () => {
      const baseTime = new Date();
      
      // Simulate a task that fails and then recovers
      collector.recordStepStart('wf-1', 'task-1', 'action');
      
      // First attempt fails at time 0
      collector.recordEvent({
        type: TelemetryEventType.STEP_END,
        timestamp: new Date(baseTime.getTime()),
        workflowId: 'wf-1',
        taskId: 'task-1',
        taskType: 'action',
        data: { success: false },
      });
      
      // Second attempt succeeds at time 1000ms
      collector.recordEvent({
        type: TelemetryEventType.STEP_END,
        timestamp: new Date(baseTime.getTime() + 1000),
        workflowId: 'wf-1',
        taskId: 'task-1',
        taskType: 'action',
        data: { success: true, duration: 1000 },
      });
      
      const mttr = aggregator.calculateMTTR();
      expect(mttr).toBe(1000);
    });

    it('should return 0 when no recoveries', () => {
      collector.recordStepEnd('wf-1', 'task-1', 'action', true, 1000);
      
      const mttr = aggregator.calculateMTTR();
      expect(mttr).toBe(0);
    });
  });

  describe('Human Escalation Rate', () => {
    it('should calculate escalation rate correctly', () => {
      // Record policy checks with some requiring human approval
      collector.recordPolicyCheck('wf-1', 'task-1', true, false);
      collector.recordPolicyCheck('wf-1', 'task-2', true, false);
      collector.recordPolicyCheck('wf-1', 'task-3', false, true);
      
      const rate = aggregator.calculateHumanEscalationRate();
      expect(rate).toBe(1 / 3);
    });

    it('should return 0 when no policy checks', () => {
      const rate = aggregator.calculateHumanEscalationRate();
      expect(rate).toBe(0);
    });
  });

  describe('Cost Per Success', () => {
    it('should calculate average time per successful task', () => {
      collector.recordStepEnd('wf-1', 'task-1', 'action', true, 1000);
      collector.recordStepEnd('wf-1', 'task-2', 'action', true, 2000);
      collector.recordStepEnd('wf-1', 'task-3', 'action', false, 500, 'Error');
      
      const cost = aggregator.calculateCostPerSuccess();
      expect(cost).toBe(1500); // (1000 + 2000) / 2
    });

    it('should return 0 when no successful tasks', () => {
      collector.recordStepEnd('wf-1', 'task-1', 'action', false, 500, 'Error');
      
      const cost = aggregator.calculateCostPerSuccess();
      expect(cost).toBe(0);
    });
  });

  describe('Metrics Summary', () => {
    it('should generate complete metrics summary', () => {
      // Add some test data
      collector.recordStepEnd('wf-1', 'task-1', 'action', true, 1000);
      collector.recordStepEnd('wf-1', 'task-2', 'action', false, 500, 'Error');
      collector.recordStepEnd('wf-1', 'task-3', 'action', true, 1500);
      collector.recordPolicyCheck('wf-1', 'task-1', true, false);
      collector.recordPolicyCheck('wf-1', 'task-2', false, true);
      
      const summary = aggregator.getMetricsSummary();
      
      expect(summary.taskSuccessRateByType.action).toBe(2 / 3);
      expect(summary.humanEscalationRate).toBe(0.5);
      expect(summary.costPerSuccess).toBe(1250); // (1000 + 1500) / 2
      expect(summary.totalEvents).toBe(5);
      expect(summary.timeRange.start).toBeDefined();
      expect(summary.timeRange.end).toBeDefined();
    });

    it('should filter by time range', () => {
      const now = new Date();
      const sevenDaysAgo = 7 * 24 * 60 * 60 * 1000;
      
      // Add an old event
      collector.recordEvent({
        type: TelemetryEventType.STEP_END,
        timestamp: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        workflowId: 'wf-1',
        taskId: 'task-1',
        taskType: 'action',
        data: { success: true, duration: 1000 },
      });
      
      // Add a recent event
      collector.recordStepEnd('wf-2', 'task-2', 'action', true, 2000);
      
      const summary = aggregator.getMetricsSummary(sevenDaysAgo);
      
      // Should only include the recent event
      expect(summary.totalEvents).toBe(1);
    });
  });
});
