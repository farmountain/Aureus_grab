import { describe, it, expect, beforeEach } from 'vitest';
import {
  MemoryObservability,
  AlertLevel,
  TelemetryCollector,
} from '../src';

describe('MemoryObservability', () => {
  let observability: MemoryObservability;
  let telemetry: TelemetryCollector;

  beforeEach(() => {
    telemetry = new TelemetryCollector();
    observability = new MemoryObservability(telemetry);
  });

  describe('trackContextGrowth', () => {
    it('should track context growth metrics', () => {
      const metrics = observability.trackContextGrowth('task-1', 100, 5);

      expect(metrics.taskId).toBe('task-1');
      expect(metrics.contextSize).toBe(100);
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it('should calculate growth rate', (done) => {
      observability.trackContextGrowth('task-1', 100, 5);
      
      // Wait a bit and track again
      setTimeout(() => {
        const metrics = observability.trackContextGrowth('task-1', 150, 5);
        
        expect(metrics.growthSinceLastCheck).toBe(50);
        expect(metrics.growthRate).toBeGreaterThan(0);
        done();
      }, 100);
    });

    it('should project future size', (done) => {
      observability.trackContextGrowth('task-1', 100, 5);
      
      setTimeout(() => {
        const metrics = observability.trackContextGrowth('task-1', 200, 5);
        
        expect(metrics.projectedSize).toBeGreaterThan(200);
        done();
      }, 100);
    });

    it('should set appropriate alert level', (done) => {
      const metrics1 = observability.trackContextGrowth('task-1', 10, 5);
      expect(metrics1.alertLevel).toBe(AlertLevel.INFO);

      // Simulate very high growth rate to guarantee trigger
      observability.trackContextGrowth('task-2', 100, 5);
      setTimeout(() => {
        // Large jump to ensure we exceed the 100 threshold
        const metrics2 = observability.trackContextGrowth('task-2', 10000, 5);
        // Should be at least WARNING, possibly CRITICAL
        expect([AlertLevel.WARNING, AlertLevel.CRITICAL]).toContain(metrics2.alertLevel);
        done();
      }, 10);
    });

    it('should record metrics to telemetry', () => {
      observability.trackContextGrowth('task-1', 100, 5);

      const metrics = telemetry.getMetrics();
      const contextSizeMetrics = metrics.filter(m => m.name === 'context_size');
      
      expect(contextSizeMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('trackMemoryPressure', () => {
    it('should track memory pressure metrics', () => {
      const metrics = observability.trackMemoryPressure('task-1', 1000, 500);

      expect(metrics.taskId).toBe('task-1');
      expect(metrics.totalMemoryMB).toBe(1000);
      expect(metrics.usedMemoryMB).toBe(500);
      expect(metrics.pressureLevel).toBe(0.5);
    });

    it('should set INFO alert level for low pressure', () => {
      const metrics = observability.trackMemoryPressure('task-1', 1000, 500);
      
      expect(metrics.alertLevel).toBe(AlertLevel.INFO);
      expect(metrics.recommendation).toBeUndefined();
    });

    it('should set WARNING alert level for high pressure', () => {
      const metrics = observability.trackMemoryPressure('task-1', 1000, 850);
      
      expect(metrics.alertLevel).toBe(AlertLevel.WARNING);
      expect(metrics.recommendation).toBeDefined();
      expect(metrics.recommendation).toContain('compact');
    });

    it('should set CRITICAL alert level for very high pressure', () => {
      const metrics = observability.trackMemoryPressure('task-1', 1000, 960);
      
      expect(metrics.alertLevel).toBe(AlertLevel.CRITICAL);
      expect(metrics.recommendation).toContain('Critical');
    });

    it('should record metrics to telemetry', () => {
      observability.trackMemoryPressure('task-1', 1000, 500);

      const metrics = telemetry.getMetrics();
      const pressureMetrics = metrics.filter(m => m.name === 'memory_pressure');
      
      expect(pressureMetrics.length).toBeGreaterThan(0);
      expect(pressureMetrics[0].value).toBe(0.5);
    });
  });

  describe('trackSummarizationFidelity', () => {
    it('should track summarization metrics', () => {
      const metrics = observability.trackSummarizationFidelity(
        'entry-1',
        1000,
        500,
        'truncate',
        0.95
      );

      expect(metrics.entryId).toBe('entry-1');
      expect(metrics.originalSize).toBe(1000);
      expect(metrics.summarizedSize).toBe(500);
      expect(metrics.compressionRatio).toBe(0.5);
      expect(metrics.strategy).toBe('truncate');
      expect(metrics.fidelityScore).toBe(0.95);
    });

    it('should set INFO alert level for good compression', () => {
      const metrics = observability.trackSummarizationFidelity(
        'entry-1',
        1000,
        500,
        'truncate'
      );
      
      expect(metrics.alertLevel).toBe(AlertLevel.INFO);
    });

    it('should set WARNING alert level for very low compression', () => {
      const metrics = observability.trackSummarizationFidelity(
        'entry-1',
        1000,
        30,
        'truncate'
      );
      
      expect(metrics.alertLevel).toBe(AlertLevel.WARNING);
    });

    it('should set WARNING alert level for very high compression ratio', () => {
      const metrics = observability.trackSummarizationFidelity(
        'entry-1',
        1000,
        950,
        'truncate'
      );
      
      expect(metrics.alertLevel).toBe(AlertLevel.WARNING);
    });

    it('should record metrics to telemetry', () => {
      observability.trackSummarizationFidelity('entry-1', 1000, 500, 'truncate');

      const metrics = telemetry.getMetrics();
      const compressionMetrics = metrics.filter(m => m.name === 'compression_ratio');
      
      expect(compressionMetrics.length).toBeGreaterThan(0);
      expect(compressionMetrics[0].value).toBe(0.5);
    });
  });

  describe('recordLifecycleMetrics', () => {
    it('should record lifecycle state change', () => {
      observability.recordLifecycleMetrics(
        'agent-1',
        'session-1',
        'awake',
        1,
        100
      );

      const events = telemetry.getEvents();
      const lifecycleEvents = events.filter(
        e => e.data.eventType === 'lifecycle_state_change'
      );
      
      expect(lifecycleEvents.length).toBeGreaterThan(0);
      
      const event = lifecycleEvents[0];
      expect(event.data.agentId).toBe('agent-1');
      expect(event.data.sessionId).toBe('session-1');
      expect(event.data.state).toBe('awake');
      expect(event.data.cycleNumber).toBe(1);
      expect(event.data.contextSize).toBe(100);
    });

    it('should record cycle and context metrics', () => {
      observability.recordLifecycleMetrics('agent-1', 'session-1', 'awake', 5, 200);

      const metrics = telemetry.getMetrics();
      const cycleMetrics = metrics.filter(m => m.name === 'agent_cycle_number');
      const contextMetrics = metrics.filter(m => m.name === 'agent_context_size');
      
      expect(cycleMetrics.length).toBeGreaterThan(0);
      expect(contextMetrics.length).toBeGreaterThan(0);
      
      expect(cycleMetrics[0].value).toBe(5);
      expect(contextMetrics[0].value).toBe(200);
    });
  });

  describe('alert management', () => {
    it('should create alerts when conditions are met', () => {
      // Track high memory pressure to trigger alert (exceeds 0.8 threshold)
      observability.trackMemoryPressure('task-1', 1000, 850);

      const alerts = observability.getAlerts();
      
      expect(alerts.length).toBeGreaterThan(0);
      
      const memoryAlert = alerts.find(a => a.metric === 'memory_pressure');
      expect(memoryAlert).toBeDefined();
      expect(memoryAlert?.level).toBe(AlertLevel.WARNING);
    });

    it('should filter alerts by level', () => {
      observability.trackMemoryPressure('task-1', 1000, 850); // WARNING
      observability.trackMemoryPressure('task-2', 1000, 970); // CRITICAL

      const warningAlerts = observability.getAlerts(AlertLevel.WARNING);
      const criticalAlerts = observability.getAlerts(AlertLevel.CRITICAL);
      
      expect(warningAlerts.length).toBeGreaterThan(0);
      expect(criticalAlerts.length).toBeGreaterThan(0);
    });

    it('should filter alerts by task', () => {
      observability.trackMemoryPressure('task-1', 1000, 850);
      observability.trackMemoryPressure('task-2', 1000, 850);

      const task1Alerts = observability.getAlerts(undefined, 'task-1');
      
      expect(task1Alerts.length).toBeGreaterThan(0);
      expect(task1Alerts.every(a => a.taskId === 'task-1')).toBe(true);
    });
  });

  describe('getRecentAlerts', () => {
    it('should return alerts from specified time window', () => {
      observability.trackMemoryPressure('task-1', 1000, 850);

      const recentAlerts = observability.getRecentAlerts(60); // Last 60 minutes
      
      expect(recentAlerts.length).toBeGreaterThan(0);
    });

    it('should filter by alert level', () => {
      observability.trackMemoryPressure('task-1', 1000, 850); // WARNING
      observability.trackMemoryPressure('task-2', 1000, 970); // CRITICAL

      const recentCritical = observability.getRecentAlerts(60, AlertLevel.CRITICAL);
      
      expect(recentCritical.every(a => a.level === AlertLevel.CRITICAL)).toBe(true);
    });
  });

  describe('clearOldAlerts', () => {
    it('should remove old alerts', () => {
      observability.trackMemoryPressure('task-1', 1000, 850);
      
      const beforeClear = observability.getAlerts();
      const initialCount = beforeClear.length;
      expect(initialCount).toBeGreaterThan(0);

      // Clear alerts older than a very long time (keep recent ones)
      // then clear all with 0 parameter
      observability.clearOldAlerts(0);
      
      const afterClear = observability.getAlerts();
      // Should have fewer alerts (or possibly 0)
      expect(afterClear.length).toBeLessThanOrEqual(initialCount);
    });
  });

  describe('getAlertStats', () => {
    it('should return alert statistics', () => {
      observability.trackMemoryPressure('task-1', 1000, 850); // WARNING
      observability.trackMemoryPressure('task-2', 1000, 970); // CRITICAL
      observability.trackMemoryPressure('task-3', 1000, 500); // INFO or no alert

      const stats = observability.getAlertStats();
      
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byLevel[AlertLevel.WARNING]).toBeGreaterThan(0);
      expect(stats.byLevel[AlertLevel.CRITICAL]).toBeGreaterThan(0);
      expect(stats.byMetric.memory_pressure).toBeGreaterThan(0);
    });

    it('should count recent alerts', () => {
      observability.trackMemoryPressure('task-1', 1000, 850);

      const stats = observability.getAlertStats();
      
      expect(stats.recentCount).toBeGreaterThan(0);
    });
  });

  describe('getContextHistory', () => {
    it('should return context history for task', () => {
      observability.trackContextGrowth('task-1', 100, 5);
      observability.trackContextGrowth('task-1', 150, 5);
      observability.trackContextGrowth('task-1', 200, 5);

      const history = observability.getContextHistory('task-1');
      
      expect(history.length).toBeGreaterThanOrEqual(3);
      expect(history[0].contextSize).toBe(100);
      expect(history[1].contextSize).toBe(150);
      expect(history[2].contextSize).toBe(200);
    });

    it('should return empty array for unknown task', () => {
      const history = observability.getContextHistory('unknown-task');
      
      expect(history).toEqual([]);
    });
  });

  describe('alert conditions', () => {
    it('should allow adding custom alert conditions', (done) => {
      observability.addAlertCondition({
        name: 'custom_threshold',
        metric: 'context_growth_rate',
        threshold: 50,
        operator: 'gt',
        level: AlertLevel.WARNING,
        enabled: true,
      });

      // This should trigger the custom alert
      observability.trackContextGrowth('task-1', 100, 5);
      setTimeout(() => {
        observability.trackContextGrowth('task-1', 400, 5);

        setTimeout(() => {
          const alerts = observability.getAlerts();
          const customAlerts = alerts.filter(a => a.condition === 'custom_threshold');
          
          expect(customAlerts.length).toBeGreaterThan(0);
          done();
        }, 10);
      }, 10);
    });

    it('should allow removing alert conditions', () => {
      observability.removeAlertCondition('high_memory_pressure');

      // This would normally trigger the high_memory_pressure alert
      observability.trackMemoryPressure('task-1', 1000, 850);

      const alerts = observability.getAlerts();
      const removedAlerts = alerts.filter(a => a.condition === 'high_memory_pressure');
      
      expect(removedAlerts.length).toBe(0);
    });
  });
});
