import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleService } from '../src/console-service';
import { TelemetryCollector, TelemetryEventType } from '@aureus/observability';
import { ReflexionEngine } from '@aureus/reflexion';
import { GoalGuardFSM } from '@aureus/policy';
import { CRVGate } from '@aureus/crv';
import type { StateStore, EventLog, Event, WorkflowState, TaskState } from '@aureus/kernel';

// Mock implementations
class MockStateStore implements StateStore {
  private states = new Map<string, WorkflowState>();
  
  async saveWorkflowState(state: WorkflowState): Promise<void> {
    this.states.set(state.workflowId, state);
  }
  
  async loadWorkflowState(workflowId: string): Promise<WorkflowState | null> {
    return this.states.get(workflowId) || null;
  }
  
  async saveTaskState(workflowId: string, taskState: TaskState): Promise<void> {}
  
  async loadTaskState(workflowId: string, taskId: string): Promise<TaskState | null> {
    return null;
  }
}

class MockEventLog implements EventLog {
  private events: Event[] = [];
  
  async append(event: Event): Promise<void> {
    this.events.push(event);
  }
  
  async read(workflowId: string): Promise<Event[]> {
    return this.events.filter(e => e.workflowId === workflowId);
  }
}

describe('Monitoring Integration', () => {
  let consoleService: ConsoleService;
  let stateStore: MockStateStore;
  let eventLog: MockEventLog;
  let telemetryCollector: TelemetryCollector;
  let reflexionEngine: ReflexionEngine;

  beforeEach(() => {
    stateStore = new MockStateStore();
    eventLog = new MockEventLog();
    telemetryCollector = new TelemetryCollector();
    
    const policyGuard = new GoalGuardFSM();
    const crvGate = new CRVGate();
    reflexionEngine = new ReflexionEngine(policyGuard, crvGate, {}, [], telemetryCollector);
    
    consoleService = new ConsoleService(
      stateStore as any,
      eventLog as any,
      policyGuard,
      undefined, // snapshotManager
      undefined, // deploymentService
      telemetryCollector,
      reflexionEngine
    );
  });

  describe('Telemetry Collection', () => {
    it('should record and retrieve telemetry events', () => {
      telemetryCollector.recordStepStart('wf-1', 'task-1', 'api-call');
      telemetryCollector.recordStepEnd('wf-1', 'task-1', 'api-call', true, 100);
      
      const events = consoleService.getTelemetryEvents();
      
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(TelemetryEventType.STEP_START);
      expect(events[1].type).toBe(TelemetryEventType.STEP_END);
      expect(events[1].data.success).toBe(true);
    });

    it('should filter telemetry events by workflow ID', () => {
      telemetryCollector.recordStepStart('wf-1', 'task-1', 'api-call');
      telemetryCollector.recordStepStart('wf-2', 'task-2', 'db-query');
      
      const events = consoleService.getTelemetryEvents({ workflowId: 'wf-1' });
      
      expect(events).toHaveLength(1);
      expect(events[0].workflowId).toBe('wf-1');
    });

    it('should filter telemetry events by type', () => {
      telemetryCollector.recordStepStart('wf-1', 'task-1', 'api-call');
      telemetryCollector.recordStepEnd('wf-1', 'task-1', 'api-call', true, 100);
      telemetryCollector.recordCRVResult('wf-1', 'task-1', 'gate-1', true, false);
      
      const events = consoleService.getTelemetryEvents({ 
        type: TelemetryEventType.CRV_RESULT 
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TelemetryEventType.CRV_RESULT);
    });

    it('should record CRV results', () => {
      telemetryCollector.recordCRVResult('wf-1', 'task-1', 'safety-gate', false, true, 'THRESHOLD_EXCEEDED');
      
      const events = consoleService.getTelemetryEvents({ 
        type: TelemetryEventType.CRV_RESULT 
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].data.passed).toBe(false);
      expect(events[0].data.blocked).toBe(true);
      expect(events[0].data.failureCode).toBe('THRESHOLD_EXCEEDED');
    });

    it('should record policy checks', () => {
      telemetryCollector.recordPolicyCheck('wf-1', 'task-1', false, true, 'High-risk action');
      
      const events = consoleService.getTelemetryEvents({ 
        type: TelemetryEventType.POLICY_CHECK 
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].data.allowed).toBe(false);
      expect(events[0].data.requiresHumanApproval).toBe(true);
    });

    it('should record rollbacks', () => {
      telemetryCollector.recordRollback('wf-1', 'task-1', 'snap-123', 'CRV failure');
      
      const events = consoleService.getTelemetryEvents({ 
        type: TelemetryEventType.ROLLBACK 
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].data.snapshotId).toBe('snap-123');
      expect(events[0].data.reason).toBe('CRV failure');
    });
  });

  describe('Metrics Summary', () => {
    it('should calculate metrics summary', () => {
      // Record some successful and failed tasks
      telemetryCollector.recordStepEnd('wf-1', 'task-1', 'api-call', true, 100);
      telemetryCollector.recordStepEnd('wf-1', 'task-2', 'api-call', true, 150);
      telemetryCollector.recordStepEnd('wf-1', 'task-3', 'api-call', false, 200);
      
      const summary = consoleService.getMetricsSummary();
      
      expect(summary).toBeDefined();
      expect(summary?.taskSuccessRateByType['api-call']).toBeCloseTo(2/3, 2);
      expect(summary?.totalEvents).toBe(3);
    });

    it('should filter metrics by time range', () => {
      // Record events at different times (simulated by immediate recording)
      telemetryCollector.recordStepEnd('wf-1', 'task-1', 'api-call', true, 100);
      
      // Get summary for last hour
      const summary = consoleService.getMetricsSummary(3600000);
      
      expect(summary).toBeDefined();
      expect(summary?.totalEvents).toBe(1);
    });

    it('should calculate human escalation rate', () => {
      telemetryCollector.recordPolicyCheck('wf-1', 'task-1', true, false);
      telemetryCollector.recordPolicyCheck('wf-1', 'task-2', false, true);
      telemetryCollector.recordPolicyCheck('wf-1', 'task-3', false, true);
      
      const summary = consoleService.getMetricsSummary();
      
      expect(summary).toBeDefined();
      expect(summary?.humanEscalationRate).toBeCloseTo(2/3, 2);
    });
  });

  describe('Reflexion Integration', () => {
    it('should trigger reflexion on failure', async () => {
      const error = new Error('Task failed due to API timeout');
      
      const result = await consoleService.triggerReflexion(
        'wf-1',
        'task-1',
        error,
        { apiUrl: 'https://api.example.com', timeout: 5000 }
      );
      
      expect(result).toBeDefined();
      expect(result.postmortem).toBeDefined();
      expect(result.postmortem.workflowId).toBe('wf-1');
      expect(result.postmortem.taskId).toBe('task-1');
    });

    it('should retrieve postmortems for a workflow', async () => {
      const error = new Error('Test failure');
      
      await consoleService.triggerReflexion('wf-1', 'task-1', error);
      await consoleService.triggerReflexion('wf-1', 'task-2', error);
      
      const postmortems = consoleService.getPostmortems('wf-1');
      
      expect(postmortems).toHaveLength(2);
      expect(postmortems[0].workflowId).toBe('wf-1');
    });

    it('should get reflexion statistics', async () => {
      const error = new Error('Test failure');
      
      await consoleService.triggerReflexion('wf-1', 'task-1', error);
      
      const stats = consoleService.getReflexionStats();
      
      expect(stats).toBeDefined();
      expect(stats?.totalPostmortems).toBe(1);
      expect(stats?.totalSandboxExecutions).toBeGreaterThanOrEqual(0);
    });

    it('should handle missing reflexion engine gracefully', () => {
      const serviceWithoutReflexion = new ConsoleService(
        stateStore as any,
        eventLog as any
      );
      
      const postmortems = serviceWithoutReflexion.getPostmortems('wf-1');
      const stats = serviceWithoutReflexion.getReflexionStats();
      
      expect(postmortems).toEqual([]);
      expect(stats).toBeNull();
    });
  });

  describe('Telemetry + Reflexion Flow', () => {
    it('should wire telemetry events to reflexion', async () => {
      // Record a failure
      telemetryCollector.recordStepStart('wf-1', 'task-1', 'api-call');
      telemetryCollector.recordStepEnd('wf-1', 'task-1', 'api-call', false, 100, 'Timeout');
      
      // Trigger reflexion
      const error = new Error('Timeout');
      const result = await consoleService.triggerReflexion('wf-1', 'task-1', error);
      
      // Verify telemetry was recorded for reflexion
      const events = consoleService.getTelemetryEvents({ workflowId: 'wf-1' });
      expect(events.some(e => e.type === TelemetryEventType.STEP_END && !e.data.success)).toBe(true);
      
      // Verify postmortem was created
      expect(result.postmortem).toBeDefined();
      expect(result.postmortem.workflowId).toBe('wf-1');
    });
  });
});
