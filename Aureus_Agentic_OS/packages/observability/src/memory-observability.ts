import { TelemetryCollector, TelemetryEventType } from './index';

/**
 * Memory metrics types
 */
export interface MemoryMetrics {
  totalEntries: number;
  contextSize: number;
  memoryPressure: number;      // 0-1 scale
  growthRate: number;           // Entries per minute
  summarizationRatio: number;   // 0-1 scale
  retentionDistribution: Record<string, number>;
}

/**
 * Context growth metrics
 */
export interface ContextGrowthMetrics {
  timestamp: Date;
  taskId: string;
  contextSize: number;
  growthSinceLastCheck: number;
  growthRate: number;           // Entries per minute
  projectedSize: number;        // Projected size in next hour
  alertLevel: AlertLevel;
}

/**
 * Memory pressure metrics
 */
export interface MemoryPressureMetrics {
  timestamp: Date;
  taskId: string;
  totalMemoryMB: number;
  usedMemoryMB: number;
  pressureLevel: number;        // 0-1 scale
  alertLevel: AlertLevel;
  recommendation?: string;
}

/**
 * Summarization fidelity metrics
 */
export interface SummarizationFidelityMetrics {
  timestamp: Date;
  entryId: string;
  originalSize: number;
  summarizedSize: number;
  compressionRatio: number;
  strategy: string;
  fidelityScore?: number;       // 0-1 score (if available)
  alertLevel: AlertLevel;
}

/**
 * Alert levels
 */
export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

/**
 * Alert condition
 */
export interface AlertCondition {
  name: string;
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  level: AlertLevel;
  enabled: boolean;
}

/**
 * Alert event
 */
export interface Alert {
  id: string;
  timestamp: Date;
  condition: string;
  level: AlertLevel;
  metric: string;
  value: number;
  threshold: number;
  message: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * MemoryObservability provides metrics and alerting for memory subsystem
 */
export class MemoryObservability {
  private telemetry: TelemetryCollector;
  private alerts: Alert[] = [];
  private alertConditions: Map<string, AlertCondition> = new Map();
  private lastMetrics: Map<string, MemoryMetrics> = new Map();
  private contextHistory: Map<string, ContextGrowthMetrics[]> = new Map();

  constructor(telemetry: TelemetryCollector) {
    this.telemetry = telemetry;
    this.initializeDefaultAlertConditions();
  }

  /**
   * Initialize default alert conditions
   */
  private initializeDefaultAlertConditions(): void {
    this.addAlertCondition({
      name: 'high_context_growth',
      metric: 'context_growth_rate',
      threshold: 100, // entries per minute
      operator: 'gt',
      level: AlertLevel.WARNING,
      enabled: true,
    });

    this.addAlertCondition({
      name: 'critical_context_growth',
      metric: 'context_growth_rate',
      threshold: 500,
      operator: 'gt',
      level: AlertLevel.CRITICAL,
      enabled: true,
    });

    this.addAlertCondition({
      name: 'high_memory_pressure',
      metric: 'memory_pressure',
      threshold: 0.8,
      operator: 'gt',
      level: AlertLevel.WARNING,
      enabled: true,
    });

    this.addAlertCondition({
      name: 'critical_memory_pressure',
      metric: 'memory_pressure',
      threshold: 0.95,
      operator: 'gt',
      level: AlertLevel.CRITICAL,
      enabled: true,
    });

    this.addAlertCondition({
      name: 'low_compression_ratio',
      metric: 'compression_ratio',
      threshold: 0.1,
      operator: 'lt',
      level: AlertLevel.WARNING,
      enabled: true,
    });
  }

  /**
   * Track context growth for a task
   */
  trackContextGrowth(
    taskId: string,
    currentSize: number,
    timeWindowMinutes: number = 5
  ): ContextGrowthMetrics {
    const now = new Date();
    const history = this.contextHistory.get(taskId) || [];

    // Calculate growth rate
    let growthRate = 0;
    let growthSinceLastCheck = 0;

    if (history.length > 0) {
      const lastMetric = history[history.length - 1];
      growthSinceLastCheck = currentSize - lastMetric.contextSize;
      
      const timeDiffMs = now.getTime() - lastMetric.timestamp.getTime();
      const timeDiffMinutes = timeDiffMs / (60 * 1000);
      
      if (timeDiffMinutes > 0) {
        growthRate = growthSinceLastCheck / timeDiffMinutes;
      }
    }

    // Project size in next hour
    const projectedSize = currentSize + (growthRate * 60);

    // Determine alert level
    const alertLevel = this.evaluateGrowthAlertLevel(growthRate);

    const metrics: ContextGrowthMetrics = {
      timestamp: now,
      taskId,
      contextSize: currentSize,
      growthSinceLastCheck,
      growthRate,
      projectedSize,
      alertLevel,
    };

    // Store in history
    history.push(metrics);
    
    // Keep only recent history
    const cutoffTime = now.getTime() - (timeWindowMinutes * 60 * 1000);
    const recentHistory = history.filter(m => m.timestamp.getTime() > cutoffTime);
    this.contextHistory.set(taskId, recentHistory);

    // Record metric
    this.telemetry.recordMetric('context_size', currentSize, { taskId });
    this.telemetry.recordMetric('context_growth_rate', growthRate, { taskId });

    // Check alert conditions
    this.checkAlertConditions('context_growth_rate', growthRate, taskId);

    return metrics;
  }

  /**
   * Track memory pressure
   */
  trackMemoryPressure(
    taskId: string,
    totalMemoryMB: number,
    usedMemoryMB: number
  ): MemoryPressureMetrics {
    const pressureLevel = usedMemoryMB / totalMemoryMB;
    const alertLevel = this.evaluatePressureAlertLevel(pressureLevel);

    let recommendation: string | undefined;
    if (pressureLevel > 0.8) {
      recommendation = 'Consider compacting or summarizing old memories';
    }
    if (pressureLevel > 0.95) {
      recommendation = 'Critical: Immediate action required - archive or delete old memories';
    }

    const metrics: MemoryPressureMetrics = {
      timestamp: new Date(),
      taskId,
      totalMemoryMB,
      usedMemoryMB,
      pressureLevel,
      alertLevel,
      recommendation,
    };

    // Record metric
    this.telemetry.recordMetric('memory_pressure', pressureLevel, { taskId });
    this.telemetry.recordMetric('memory_used_mb', usedMemoryMB, { taskId });

    // Check alert conditions
    this.checkAlertConditions('memory_pressure', pressureLevel, taskId);

    return metrics;
  }

  /**
   * Track summarization fidelity
   */
  trackSummarizationFidelity(
    entryId: string,
    originalSize: number,
    summarizedSize: number,
    strategy: string,
    fidelityScore?: number
  ): SummarizationFidelityMetrics {
    const compressionRatio = summarizedSize / originalSize;
    const alertLevel = this.evaluateCompressionAlertLevel(compressionRatio);

    const metrics: SummarizationFidelityMetrics = {
      timestamp: new Date(),
      entryId,
      originalSize,
      summarizedSize,
      compressionRatio,
      strategy,
      fidelityScore,
      alertLevel,
    };

    // Record metric
    this.telemetry.recordMetric('compression_ratio', compressionRatio, { strategy });
    this.telemetry.recordMetric('summarization_fidelity', fidelityScore || 0, { strategy });

    // Check alert conditions
    this.checkAlertConditions('compression_ratio', compressionRatio);

    return metrics;
  }

  /**
   * Record lifecycle state change
   */
  recordLifecycleMetrics(
    agentId: string,
    sessionId: string,
    state: string,
    cycleNumber: number,
    contextSize: number
  ): void {
    this.telemetry.recordMetric('agent_cycle_number', cycleNumber, { agentId, sessionId });
    this.telemetry.recordMetric('agent_context_size', contextSize, { agentId, sessionId });
    
    this.telemetry.recordEvent({
      type: TelemetryEventType.CUSTOM,
      timestamp: new Date(),
      data: {
        eventType: 'lifecycle_state_change',
        agentId,
        sessionId,
        state,
        cycleNumber,
        contextSize,
      },
      tags: {
        agentId,
        state,
      },
    });
  }

  /**
   * Add alert condition
   */
  addAlertCondition(condition: AlertCondition): void {
    this.alertConditions.set(condition.name, condition);
  }

  /**
   * Remove alert condition
   */
  removeAlertCondition(name: string): void {
    this.alertConditions.delete(name);
  }

  /**
   * Check alert conditions
   */
  private checkAlertConditions(metric: string, value: number, taskId?: string): void {
    for (const condition of this.alertConditions.values()) {
      if (!condition.enabled || condition.metric !== metric) continue;

      const triggered = this.evaluateCondition(value, condition.threshold, condition.operator);

      if (triggered) {
        this.createAlert(condition, value, taskId);
      }
    }
  }

  /**
   * Evaluate condition operator
   */
  private evaluateCondition(value: number, threshold: number, operator: AlertCondition['operator']): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'eq': return value === threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      default: return false;
    }
  }

  /**
   * Create alert
   */
  private createAlert(condition: AlertCondition, value: number, taskId?: string): void {
    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      timestamp: new Date(),
      condition: condition.name,
      level: condition.level,
      metric: condition.metric,
      value,
      threshold: condition.threshold,
      message: this.formatAlertMessage(condition, value),
      taskId,
    };

    this.alerts.push(alert);

    // Record alert event
    this.telemetry.recordEvent({
      type: TelemetryEventType.CUSTOM,
      timestamp: new Date(),
      taskId,
      data: {
        eventType: 'alert',
        alert,
      },
      tags: {
        alertLevel: condition.level,
        metric: condition.metric,
      },
    });

    // Log using telemetry collector
    this.telemetry.log('warn', `[ALERT] ${alert.level.toUpperCase()}: ${alert.message}`);
  }

  /**
   * Format alert message
   */
  private formatAlertMessage(condition: AlertCondition, value: number): string {
    return `${condition.name}: ${condition.metric} is ${value.toFixed(2)} (threshold: ${condition.threshold})`;
  }

  /**
   * Evaluate growth alert level
   */
  private evaluateGrowthAlertLevel(growthRate: number): AlertLevel {
    if (growthRate > 500) return AlertLevel.CRITICAL;
    if (growthRate > 100) return AlertLevel.WARNING;
    return AlertLevel.INFO;
  }

  /**
   * Evaluate pressure alert level
   */
  private evaluatePressureAlertLevel(pressureLevel: number): AlertLevel {
    if (pressureLevel > 0.95) return AlertLevel.CRITICAL;
    if (pressureLevel > 0.8) return AlertLevel.WARNING;
    return AlertLevel.INFO;
  }

  /**
   * Evaluate compression alert level
   */
  private evaluateCompressionAlertLevel(compressionRatio: number): AlertLevel {
    if (compressionRatio < 0.05) return AlertLevel.WARNING;
    if (compressionRatio > 0.9) return AlertLevel.WARNING;
    return AlertLevel.INFO;
  }

  /**
   * Get all alerts
   */
  getAlerts(level?: AlertLevel, taskId?: string): Alert[] {
    let filtered = this.alerts;

    if (level) {
      filtered = filtered.filter(a => a.level === level);
    }

    if (taskId) {
      filtered = filtered.filter(a => a.taskId === taskId);
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get recent alerts (last N minutes)
   */
  getRecentAlerts(minutes: number = 60, level?: AlertLevel): Alert[] {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    return this.alerts
      .filter(a => a.timestamp >= cutoffTime)
      .filter(a => !level || a.level === level)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(olderThanMinutes: number = 1440): void {
    const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    this.alerts = this.alerts.filter(a => a.timestamp >= cutoffTime);
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): {
    total: number;
    byLevel: Record<AlertLevel, number>;
    byMetric: Record<string, number>;
    recentCount: number;
  } {
    const byLevel: Record<AlertLevel, number> = {
      [AlertLevel.INFO]: 0,
      [AlertLevel.WARNING]: 0,
      [AlertLevel.CRITICAL]: 0,
    };

    const byMetric: Record<string, number> = {};
    let recentCount = 0;
    const recentCutoff = new Date(Date.now() - 60 * 60 * 1000); // Last hour

    for (const alert of this.alerts) {
      byLevel[alert.level]++;
      byMetric[alert.metric] = (byMetric[alert.metric] || 0) + 1;
      
      if (alert.timestamp >= recentCutoff) {
        recentCount++;
      }
    }

    return {
      total: this.alerts.length,
      byLevel,
      byMetric,
      recentCount,
    };
  }

  /**
   * Get context history for a task
   */
  getContextHistory(taskId: string): ContextGrowthMetrics[] {
    return this.contextHistory.get(taskId) || [];
  }
}
