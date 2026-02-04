import { TelemetryCollector, TelemetryEvent, TelemetryEventType, Span } from '@aureus/observability';
import { ExecutionTrace } from './types';

/**
 * TraceCollector ingests execution traces from observability telemetry
 */
export class TraceCollector {
  private traces: Map<string, ExecutionTrace> = new Map();

  /**
   * Ingest traces from a telemetry collector
   */
  ingestFromTelemetry(telemetry: TelemetryCollector): void {
    const events = telemetry.getEvents();
    const spans = telemetry.getSpans();

    // Group events by workflow
    const eventsByWorkflow = this.groupEventsByWorkflow(events);
    const spansByTrace = this.groupSpansByTrace(spans);

    for (const [workflowId, workflowEvents] of eventsByWorkflow) {
      // Find the trace ID from spans if available
      const traceSpans = this.findSpansForWorkflow(workflowId, spansByTrace);
      const traceId = traceSpans.length > 0 ? traceSpans[0].traceId : workflowId;

      // Create or update trace
      const trace = this.createTraceFromEvents(traceId, workflowId, workflowEvents, traceSpans);
      this.traces.set(traceId, trace);
    }
  }

  /**
   * Ingest a single trace manually
   */
  ingestTrace(trace: ExecutionTrace): void {
    this.traces.set(trace.id, trace);
  }

  /**
   * Get all traces
   */
  getTraces(): ExecutionTrace[] {
    return Array.from(this.traces.values());
  }

  /**
   * Get trace by ID
   */
  getTrace(id: string): ExecutionTrace | undefined {
    return this.traces.get(id);
  }

  /**
   * Get traces in time range
   */
  getTracesInTimeRange(startTime: Date, endTime: Date): ExecutionTrace[] {
    return Array.from(this.traces.values()).filter(
      (trace) => trace.startTime >= startTime && trace.startTime <= endTime
    );
  }

  /**
   * Get completed traces only
   */
  getCompletedTraces(): ExecutionTrace[] {
    return Array.from(this.traces.values()).filter(
      (trace) => trace.status === 'completed' || trace.status === 'failed'
    );
  }

  /**
   * Clear all traces
   */
  clear(): void {
    this.traces.clear();
  }

  /**
   * Group events by workflow ID
   */
  private groupEventsByWorkflow(events: TelemetryEvent[]): Map<string, TelemetryEvent[]> {
    const grouped = new Map<string, TelemetryEvent[]>();

    for (const event of events) {
      if (event.workflowId) {
        if (!grouped.has(event.workflowId)) {
          grouped.set(event.workflowId, []);
        }
        grouped.get(event.workflowId)!.push(event);
      }
    }

    return grouped;
  }

  /**
   * Group spans by trace ID
   */
  private groupSpansByTrace(spans: Span[]): Map<string, Span[]> {
    const grouped = new Map<string, Span[]>();

    for (const span of spans) {
      if (!grouped.has(span.traceId)) {
        grouped.set(span.traceId, []);
      }
      grouped.get(span.traceId)!.push(span);
    }

    return grouped;
  }

  /**
   * Find spans for a workflow
   */
  private findSpansForWorkflow(workflowId: string, spansByTrace: Map<string, Span[]>): Span[] {
    // Look for spans with matching workflow ID in tags
    for (const [_, spans] of spansByTrace) {
      for (const span of spans) {
        if (span.tags?.workflowId === workflowId || span.name.includes(workflowId)) {
          return spans;
        }
      }
    }
    return [];
  }

  /**
   * Create an execution trace from events and spans
   */
  private createTraceFromEvents(
    traceId: string,
    workflowId: string,
    events: TelemetryEvent[],
    spans: Span[]
  ): ExecutionTrace {
    // Sort events by timestamp
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Determine start and end times
    const startTime = events.length > 0 ? events[0].timestamp : new Date();
    let endTime: Date | undefined;
    let duration: number | undefined;
    let status: ExecutionTrace['status'] = 'running';

    // Find STEP_END events to determine completion
    const stepEndEvents = events.filter((e) => e.type === TelemetryEventType.STEP_END);
    if (stepEndEvents.length > 0) {
      const lastEvent = stepEndEvents[stepEndEvents.length - 1];
      const endTime = lastEvent.timestamp;
      duration = endTime.getTime() - startTime.getTime();

      // Determine status based on success
      if (lastEvent.data.success) {
        status = 'completed';
      } else {
        status = 'failed';
      }
    }

    // Extract task ID if present
    const taskId = events.find((e) => e.taskId)?.taskId;

    return {
      id: traceId,
      workflowId,
      taskId,
      startTime,
      endTime,
      duration,
      events,
      spans,
      status,
      metadata: this.extractMetadata(events),
    };
  }

  /**
   * Extract metadata from events
   */
  private extractMetadata(events: TelemetryEvent[]): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    // Count event types
    const eventTypeCounts: Record<string, number> = {};
    for (const event of events) {
      eventTypeCounts[event.type] = (eventTypeCounts[event.type] || 0) + 1;
    }
    metadata.eventTypeCounts = eventTypeCounts;

    // Count task types
    const taskTypes = new Set<string>();
    for (const event of events) {
      if (event.taskType) {
        taskTypes.add(event.taskType);
      }
    }
    metadata.taskTypes = Array.from(taskTypes);

    // Count retries, rollbacks, CRV failures
    metadata.retries = events.filter((e) => e.type === TelemetryEventType.STEP_START).length - 
                       events.filter((e) => e.type === TelemetryEventType.STEP_END).length;
    metadata.rollbacks = events.filter((e) => e.type === TelemetryEventType.ROLLBACK).length;
    metadata.crvFailures = events.filter(
      (e) => e.type === TelemetryEventType.CRV_RESULT && !e.data.passed
    ).length;
    metadata.humanEscalations = events.filter(
      (e) => e.type === TelemetryEventType.POLICY_CHECK && e.data.requiresHumanApproval
    ).length;

    return metadata;
  }
}
