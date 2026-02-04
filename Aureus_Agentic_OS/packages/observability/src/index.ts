/**
 * Telemetry event types
 */
export enum TelemetryEventType {
  STEP_START = 'step_start',
  STEP_END = 'step_end',
  TOOL_CALL = 'tool_call',
  CRV_RESULT = 'crv_result',
  POLICY_CHECK = 'policy_check',
  SNAPSHOT_COMMIT = 'snapshot_commit',
  ROLLBACK = 'rollback',
  LLM_ARTIFACT_GENERATED = 'llm_artifact_generated',
  LLM_PROMPT = 'llm_prompt',
  LLM_RESPONSE = 'llm_response',
  CUSTOM = 'custom',
}

/**
 * Telemetry event for tracking agent operations
 */
export interface TelemetryEvent {
  type: TelemetryEventType;
  timestamp: Date;
  workflowId?: string;
  taskId?: string;
  taskType?: string;
  correlationId?: string; // Correlation ID for distributed tracing
  data: Record<string, unknown>;
  tags?: Record<string, string>;
}

/**
 * Metric types
 */
export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

/**
 * Trace span for distributed tracing
 */
export interface Span {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags?: Record<string, string>;
  logs?: LogEntry[];
}

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Telemetry collector for observability
 */
export class TelemetryCollector {
  private metrics: Metric[] = [];
  private spans: Map<string, Span> = new Map();
  private logs: LogEntry[] = [];
  private events: TelemetryEvent[] = [];
  private sinkManager?: any; // SinkManager imported dynamically to avoid circular deps
  private correlationId?: string;

  constructor(sinkManager?: any, correlationId?: string) {
    this.sinkManager = sinkManager;
    this.correlationId = correlationId;
  }

  /**
   * Set correlation ID for all subsequent events
   */
  setCorrelationId(correlationId: string): void {
    this.correlationId = correlationId;
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string | undefined {
    return this.correlationId;
  }

  /**
   * Record a telemetry event
   */
  recordEvent(event: TelemetryEvent): void {
    // Add correlation ID if set
    if (this.correlationId && !event.correlationId) {
      event.correlationId = this.correlationId;
    }

    this.events.push(event);

    // Export to sinks if configured
    if (this.sinkManager) {
      this.sinkManager.exportEvents([event]).catch((err: Error) => {
        console.error('Failed to export event to sinks:', err);
      });
    }
  }

  /**
   * Record a step start event
   */
  recordStepStart(workflowId: string, taskId: string, taskType: string, data?: Record<string, unknown>): void {
    this.recordEvent({
      type: TelemetryEventType.STEP_START,
      timestamp: new Date(),
      workflowId,
      taskId,
      taskType,
      data: data || {},
    });
  }

  /**
   * Record a step end event
   */
  recordStepEnd(
    workflowId: string,
    taskId: string,
    taskType: string,
    success: boolean,
    duration?: number,
    error?: string
  ): void {
    this.recordEvent({
      type: TelemetryEventType.STEP_END,
      timestamp: new Date(),
      workflowId,
      taskId,
      taskType,
      data: { success, duration, error },
    });
  }

  /**
   * Record a tool call event
   */
  recordToolCall(workflowId: string, taskId: string, toolName: string, args: unknown): void {
    this.recordEvent({
      type: TelemetryEventType.TOOL_CALL,
      timestamp: new Date(),
      workflowId,
      taskId,
      data: { toolName, args },
    });
  }

  /**
   * Record a CRV result event
   */
  recordCRVResult(
    workflowId: string,
    taskId: string,
    gateName: string,
    passed: boolean,
    blocked: boolean,
    failureCode?: string
  ): void {
    this.recordEvent({
      type: TelemetryEventType.CRV_RESULT,
      timestamp: new Date(),
      workflowId,
      taskId,
      data: { gateName, passed, blocked, failureCode },
    });
  }

  /**
   * Record a policy check event
   */
  recordPolicyCheck(
    workflowId: string,
    taskId: string,
    allowed: boolean,
    requiresHumanApproval: boolean,
    reason?: string
  ): void {
    this.recordEvent({
      type: TelemetryEventType.POLICY_CHECK,
      timestamp: new Date(),
      workflowId,
      taskId,
      data: { allowed, requiresHumanApproval, reason },
    });
  }

  /**
   * Record a snapshot commit event
   */
  recordSnapshotCommit(workflowId: string, taskId: string, snapshotId: string): void {
    this.recordEvent({
      type: TelemetryEventType.SNAPSHOT_COMMIT,
      timestamp: new Date(),
      workflowId,
      taskId,
      data: { snapshotId },
    });
  }

  /**
   * Record a rollback event
   */
  recordRollback(workflowId: string, taskId: string, snapshotId: string, reason: string): void {
    this.recordEvent({
      type: TelemetryEventType.ROLLBACK,
      timestamp: new Date(),
      workflowId,
      taskId,
      data: { snapshotId, reason },
    });
  }

  /**
   * Record an LLM prompt event
   * @param workflowId Workflow identifier
   * @param taskId Task identifier
   * @param prompt The prompt sent to the LLM
   * @param model The LLM model used
   * @param metadata Additional metadata (temperature, max_tokens, etc.)
   */
  recordLLMPrompt(
    workflowId: string,
    taskId: string,
    prompt: string,
    model: string,
    metadata?: Record<string, unknown>
  ): void {
    this.recordEvent({
      type: TelemetryEventType.LLM_PROMPT,
      timestamp: new Date(),
      workflowId,
      taskId,
      data: {
        prompt,
        model,
        promptLength: prompt.length,
        ...metadata,
      },
    });
  }

  /**
   * Record an LLM response event
   * @param workflowId Workflow identifier
   * @param taskId Task identifier
   * @param response The response from the LLM
   * @param model The LLM model used
   * @param metadata Additional metadata (tokens used, finish_reason, etc.)
   */
  recordLLMResponse(
    workflowId: string,
    taskId: string,
    response: string,
    model: string,
    metadata?: Record<string, unknown>
  ): void {
    this.recordEvent({
      type: TelemetryEventType.LLM_RESPONSE,
      timestamp: new Date(),
      workflowId,
      taskId,
      data: {
        response,
        model,
        responseLength: response.length,
        ...metadata,
      },
    });
  }

  /**
   * Record an LLM-generated artifact event
   * Tracks artifacts generated by LLMs with full traceability to prompts and responses
   * 
   * @param workflowId Workflow identifier
   * @param taskId Task identifier
   * @param artifactType Type of artifact (agent_blueprint, memory_policy, mcp_server, etc.)
   * @param artifactId Unique identifier for the artifact
   * @param artifact The generated artifact data
   * @param prompt The prompt that generated this artifact
   * @param response The LLM response that produced this artifact
   * @param model The LLM model used
   * @param metadata Additional metadata
   */
  recordLLMArtifact(
    workflowId: string,
    taskId: string,
    artifactType: string,
    artifactId: string,
    artifact: unknown,
    prompt: string,
    response: string,
    model: string,
    metadata?: Record<string, unknown>
  ): void {
    this.recordEvent({
      type: TelemetryEventType.LLM_ARTIFACT_GENERATED,
      timestamp: new Date(),
      workflowId,
      taskId,
      data: {
        artifactType,
        artifactId,
        artifact,
        prompt,
        promptLength: prompt.length,
        response,
        responseLength: response.length,
        model,
        ...metadata,
      },
      tags: {
        artifact_type: artifactType,
        model,
      },
    });
  }

  /**
   * Record a metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      timestamp: new Date(),
      tags,
    });
  }

  /**
   * Start a new span for distributed tracing
   */
  startSpan(name: string, traceId?: string, parentId?: string): Span {
    const span: Span = {
      id: this.generateId(),
      traceId: traceId || this.generateId(),
      parentId,
      name,
      startTime: new Date(),
      logs: [],
    };

    this.spans.set(span.id, span);
    return span;
  }

  /**
   * End a span
   */
  endSpan(spanId: string): void {
    const span = this.spans.get(spanId);
    if (span) {
      span.endTime = new Date();
      span.duration = span.endTime.getTime() - span.startTime.getTime();
    }
  }

  /**
   * Add log to span
   */
  addSpanLog(spanId: string, level: LogEntry['level'], message: string, context?: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (span && span.logs) {
      span.logs.push({
        timestamp: new Date(),
        level,
        message,
        context,
      });
    }
  }

  /**
   * Log a message
   */
  log(level: LogEntry['level'], message: string, context?: Record<string, unknown>): void {
    this.logs.push({
      timestamp: new Date(),
      level,
      message,
      context,
    });

    // Also output to console
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
  }

  /**
   * Get all metrics
   */
  getMetrics(): Metric[] {
    return [...this.metrics];
  }

  /**
   * Get all spans
   */
  getSpans(): Span[] {
    return Array.from(this.spans.values());
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get all events
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getEventsByType(type: TelemetryEventType): TelemetryEvent[] {
    return this.events.filter(e => e.type === type);
  }

  /**
   * Get events in time range
   */
  getEventsInTimeRange(startTime: Date, endTime: Date): TelemetryEvent[] {
    return this.events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Get spans by trace ID
   */
  getSpansByTrace(traceId: string): Span[] {
    return Array.from(this.spans.values()).filter(s => s.traceId === traceId);
  }

  /**
   * Get LLM artifact events
   * @param artifactType Optional filter by artifact type
   */
  getLLMArtifactEvents(artifactType?: string): TelemetryEvent[] {
    const events = this.getEventsByType(TelemetryEventType.LLM_ARTIFACT_GENERATED);
    if (artifactType) {
      return events.filter(e => e.data.artifactType === artifactType);
    }
    return events;
  }

  /**
   * Get LLM prompt and response pairs for a specific workflow/task
   * @param workflowId Workflow identifier
   * @param taskId Task identifier
   */
  getLLMInteractions(workflowId: string, taskId: string): Array<{
    prompt: TelemetryEvent;
    response?: TelemetryEvent;
    artifact?: TelemetryEvent;
  }> {
    const prompts = this.events
      .filter(e => 
        e.type === TelemetryEventType.LLM_PROMPT &&
        e.workflowId === workflowId &&
        e.taskId === taskId
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const responses = this.events
      .filter(e => 
        e.type === TelemetryEventType.LLM_RESPONSE &&
        e.workflowId === workflowId &&
        e.taskId === taskId
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const artifacts = this.events
      .filter(e => 
        e.type === TelemetryEventType.LLM_ARTIFACT_GENERATED &&
        e.workflowId === workflowId &&
        e.taskId === taskId
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Match prompts with their responses and artifacts based on timestamp proximity
    const interactions: Array<{
      prompt: TelemetryEvent;
      response?: TelemetryEvent;
      artifact?: TelemetryEvent;
    }> = [];

    prompts.forEach((prompt, index) => {
      const interaction: {
        prompt: TelemetryEvent;
        response?: TelemetryEvent;
        artifact?: TelemetryEvent;
      } = { prompt };

      // Find the next response after this prompt
      const response = responses.find(r => r.timestamp > prompt.timestamp);
      if (response) {
        interaction.response = response;
      }

      // Find any artifact generated around this time
      const artifact = artifacts.find(a => 
        a.timestamp >= prompt.timestamp &&
        (!response || a.timestamp <= new Date(response.timestamp.getTime() + 5000)) // Within 5 seconds
      );
      if (artifact) {
        interaction.artifact = artifact;
      }

      interactions.push(interaction);
    });

    return interactions;
  }

  /**
   * Get audit trail for a specific artifact
   * Returns the full chain of events that led to the artifact generation
   */
  getArtifactAuditTrail(artifactId: string): TelemetryEvent[] {
    const artifactEvent = this.events.find(
      e => e.type === TelemetryEventType.LLM_ARTIFACT_GENERATED &&
           e.data.artifactId === artifactId
    );

    if (!artifactEvent) {
      return [];
    }

    // Get all events for the same workflow/task leading up to the artifact
    const workflowId = artifactEvent.workflowId;
    const taskId = artifactEvent.taskId;
    const artifactTimestamp = artifactEvent.timestamp;

    return this.events
      .filter(e => 
        e.workflowId === workflowId &&
        e.taskId === taskId &&
        e.timestamp <= artifactTimestamp
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Metrics aggregator for computing advanced metrics
 */
export class MetricsAggregator {
  private collector: TelemetryCollector;

  constructor(collector: TelemetryCollector) {
    this.collector = collector;
  }

  /**
   * Calculate task success rate by task type
   */
  calculateTaskSuccessRate(taskType?: string): Record<string, number> {
    const stepEndEvents = this.collector.getEventsByType(TelemetryEventType.STEP_END);
    
    const byType: Record<string, { total: number; successful: number }> = {};
    
    for (const event of stepEndEvents) {
      const type = event.taskType || 'unknown';
      if (taskType && type !== taskType) continue;
      
      if (!byType[type]) {
        byType[type] = { total: 0, successful: 0 };
      }
      
      byType[type].total++;
      if (event.data.success) {
        byType[type].successful++;
      }
    }
    
    const rates: Record<string, number> = {};
    for (const [type, counts] of Object.entries(byType)) {
      rates[type] = counts.total > 0 ? counts.successful / counts.total : 0;
    }
    
    return rates;
  }

  /**
   * Calculate Mean Time To Recovery (MTTR)
   * Time from task failure to successful retry or completion
   */
  calculateMTTR(): number {
    const events = this.collector.getEvents();
    const recoveryTimes: number[] = [];
    
    // Group events by workflow and task
    const taskEvents = new Map<string, TelemetryEvent[]>();
    
    for (const event of events) {
      if (event.workflowId && event.taskId) {
        const key = `${event.workflowId}-${event.taskId}`;
        if (!taskEvents.has(key)) {
          taskEvents.set(key, []);
        }
        taskEvents.get(key)!.push(event);
      }
    }
    
    // Calculate recovery time for each task
    for (const [_, taskEventList] of taskEvents) {
      // Sort by timestamp
      taskEventList.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      let failureTime: Date | null = null;
      
      for (const event of taskEventList) {
        if (event.type === TelemetryEventType.STEP_END && !event.data.success) {
          failureTime = event.timestamp;
        } else if (event.type === TelemetryEventType.STEP_END && event.data.success && failureTime) {
          // Recovery detected
          const recoveryTimeMs = event.timestamp.getTime() - failureTime.getTime();
          recoveryTimes.push(recoveryTimeMs);
          failureTime = null;
        }
      }
    }
    
    if (recoveryTimes.length === 0) return 0;
    
    // Return mean in milliseconds
    return recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
  }

  /**
   * Calculate human escalation rate
   */
  calculateHumanEscalationRate(): number {
    const policyEvents = this.collector.getEventsByType(TelemetryEventType.POLICY_CHECK);
    
    if (policyEvents.length === 0) return 0;
    
    const escalations = policyEvents.filter(e => e.data.requiresHumanApproval).length;
    return escalations / policyEvents.length;
  }

  /**
   * Calculate cost per success (proxy using time)
   * Returns average time (ms) per successful task
   */
  calculateCostPerSuccess(): number {
    const stepEndEvents = this.collector.getEventsByType(TelemetryEventType.STEP_END);
    
    const successfulTasks = stepEndEvents.filter(e => e.data.success);
    
    if (successfulTasks.length === 0) return 0;
    
    const totalDuration = successfulTasks.reduce((sum, e) => {
      const duration = e.data.duration as number | undefined;
      return sum + (duration || 0);
    }, 0);
    
    return totalDuration / successfulTasks.length;
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(timeRangeMs?: number): MetricsSummary {
    const now = new Date();
    const startTime = timeRangeMs ? new Date(now.getTime() - timeRangeMs) : new Date(0);
    
    // Get filtered events for the time range
    const events = timeRangeMs
      ? this.collector.getEventsInTimeRange(startTime, now)
      : this.collector.getEvents();
    
    // Compute metrics from filtered events
    const taskSuccessRateByType = this.calculateTaskSuccessRateFromEvents(events);
    const mttr = this.calculateMTTRFromEvents(events);
    const humanEscalationRate = this.calculateHumanEscalationRateFromEvents(events);
    const costPerSuccess = this.calculateCostPerSuccessFromEvents(events);
    
    return {
      taskSuccessRateByType,
      mttr,
      humanEscalationRate,
      costPerSuccess,
      totalEvents: events.length,
      timeRange: { start: startTime, end: now },
    };
  }

  /**
   * Calculate task success rate from a list of events
   */
  private calculateTaskSuccessRateFromEvents(events: TelemetryEvent[]): Record<string, number> {
    const stepEndEvents = events.filter(e => e.type === TelemetryEventType.STEP_END);
    
    const byType: Record<string, { total: number; successful: number }> = {};
    
    for (const event of stepEndEvents) {
      const type = event.taskType || 'unknown';
      
      if (!byType[type]) {
        byType[type] = { total: 0, successful: 0 };
      }
      
      byType[type].total++;
      if (event.data.success) {
        byType[type].successful++;
      }
    }
    
    const rates: Record<string, number> = {};
    for (const [type, counts] of Object.entries(byType)) {
      rates[type] = counts.total > 0 ? counts.successful / counts.total : 0;
    }
    
    return rates;
  }

  /**
   * Calculate MTTR from a list of events
   */
  private calculateMTTRFromEvents(events: TelemetryEvent[]): number {
    const recoveryTimes: number[] = [];
    
    // Group events by workflow and task
    const taskEvents = new Map<string, TelemetryEvent[]>();
    
    for (const event of events) {
      if (event.workflowId && event.taskId) {
        const key = `${event.workflowId}-${event.taskId}`;
        if (!taskEvents.has(key)) {
          taskEvents.set(key, []);
        }
        taskEvents.get(key)!.push(event);
      }
    }
    
    // Calculate recovery time for each task
    for (const [_, taskEventList] of taskEvents) {
      // Sort by timestamp
      taskEventList.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      let failureTime: Date | null = null;
      
      for (const event of taskEventList) {
        if (event.type === TelemetryEventType.STEP_END && !event.data.success) {
          failureTime = event.timestamp;
        } else if (event.type === TelemetryEventType.STEP_END && event.data.success && failureTime) {
          // Recovery detected
          const recoveryTimeMs = event.timestamp.getTime() - failureTime.getTime();
          recoveryTimes.push(recoveryTimeMs);
          failureTime = null;
        }
      }
    }
    
    if (recoveryTimes.length === 0) return 0;
    
    // Return mean in milliseconds
    return recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length;
  }

  /**
   * Calculate human escalation rate from a list of events
   */
  private calculateHumanEscalationRateFromEvents(events: TelemetryEvent[]): number {
    const policyEvents = events.filter(e => e.type === TelemetryEventType.POLICY_CHECK);
    
    if (policyEvents.length === 0) return 0;
    
    const escalations = policyEvents.filter(e => e.data.requiresHumanApproval).length;
    return escalations / policyEvents.length;
  }

  /**
   * Calculate cost per success from a list of events
   */
  private calculateCostPerSuccessFromEvents(events: TelemetryEvent[]): number {
    const stepEndEvents = events.filter(e => e.type === TelemetryEventType.STEP_END);
    
    const successfulTasks = stepEndEvents.filter(e => e.data.success);
    
    if (successfulTasks.length === 0) return 0;
    
    const totalDuration = successfulTasks.reduce((sum, e) => {
      const duration = e.data.duration as number | undefined;
      return sum + (duration || 0);
    }, 0);
    
    return totalDuration / successfulTasks.length;
  }
}

/**
 * Metrics summary
 */
export interface MetricsSummary {
  taskSuccessRateByType: Record<string, number>;
  mttr: number;
  humanEscalationRate: number;
  costPerSuccess: number;
  totalEvents: number;
  timeRange: { start: Date; end: Date };
}

/**
 * Export exporters and sink management
 */
export * from './exporters';

/**
 * Export memory observability
 */
export * from './memory-observability';
