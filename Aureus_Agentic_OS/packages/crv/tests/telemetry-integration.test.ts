import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryCollector, MetricsAggregator, TelemetryEventType } from '@aureus/observability';
import { CRVGate, Validators } from '../src';

describe('CRV Telemetry Integration', () => {
  let telemetry: TelemetryCollector;
  let gate: CRVGate;

  beforeEach(() => {
    telemetry = new TelemetryCollector();
    gate = new CRVGate(
      {
        name: 'Test Gate',
        validators: [Validators.notNull()],
        blockOnFailure: true,
      },
      telemetry
    );
  });

  it('should record telemetry when validating commits', async () => {
    const commit = {
      id: 'commit-1',
      data: { value: 42 },
      previousState: null,
      metadata: {
        workflowId: 'wf-1',
        taskId: 'task-1',
      },
    };

    await gate.validate(commit);

    const events = telemetry.getEventsByType(TelemetryEventType.CRV_RESULT);
    expect(events).toHaveLength(1);
    expect(events[0].workflowId).toBe('wf-1');
    expect(events[0].taskId).toBe('task-1');
    expect(events[0].data.gateName).toBe('Test Gate');
    expect(events[0].data.passed).toBe(true);
  });

  it('should record blocked commits in telemetry', async () => {
    const commit = {
      id: 'commit-2',
      data: null, // Will fail notNull validation
      previousState: null,
      metadata: {
        workflowId: 'wf-2',
        taskId: 'task-2',
      },
    };

    await gate.validate(commit);

    const events = telemetry.getEventsByType(TelemetryEventType.CRV_RESULT);
    expect(events).toHaveLength(1);
    expect(events[0].data.passed).toBe(false);
    expect(events[0].data.blocked).toBe(true);
  });

  it('should not record telemetry when metadata is missing', async () => {
    const commit = {
      id: 'commit-3',
      data: { value: 42 },
      previousState: null,
      metadata: {}, // Missing workflowId and taskId
    };

    await gate.validate(commit);

    const events = telemetry.getEventsByType(TelemetryEventType.CRV_RESULT);
    expect(events).toHaveLength(0); // Should not record without proper metadata
  });
});
