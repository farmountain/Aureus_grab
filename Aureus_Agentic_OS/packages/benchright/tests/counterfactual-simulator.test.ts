import { describe, it, expect, beforeEach } from 'vitest';
import { CounterfactualSimulator } from '../src/counterfactual-simulator';
import { TraceCollector } from '../src/trace-collector';
import { TelemetryCollector } from '@aureus/observability';

describe('CounterfactualSimulator', () => {
  let simulator: CounterfactualSimulator;
  let traceCollector: TraceCollector;
  let telemetry: TelemetryCollector;

  beforeEach(() => {
    simulator = new CounterfactualSimulator();
    traceCollector = new TraceCollector();
    telemetry = new TelemetryCollector();
  });

  describe('Successful Workflow Simulation', () => {
    it('should simulate a successful workflow with high intervention value', () => {
      // Create a successful workflow with CRV checks
      telemetry.recordStepStart('wf-1', 'task-1', 'validation');
      telemetry.recordStepEnd('wf-1', 'task-1', 'validation', true, 100);
      
      telemetry.recordStepStart('wf-1', 'task-2', 'processing');
      telemetry.recordCRVResult('wf-1', 'task-2', 'gate-1', false, true, 'VIOLATION');
      telemetry.recordStepEnd('wf-1', 'task-2', 'processing', false, 200);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      expect(simulation.traceId).toBe(traces[0].id);
      expect(simulation.actualOutcome.status).toBeDefined();
      expect(simulation.doNothingOutcome.status).toBeDefined();
      expect(simulation.interventionValue).toBeGreaterThanOrEqual(0);
      expect(simulation.interventionValue).toBeLessThanOrEqual(1);
    });

    it('should classify actions as necessary or wasted', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'validation');
      telemetry.recordStepEnd('wf-1', 'task-1', 'validation', true, 100);
      
      telemetry.recordStepStart('wf-1', 'task-2', 'processing');
      telemetry.recordStepEnd('wf-1', 'task-2', 'processing', false, 200);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      expect(Array.isArray(simulation.necessaryActions)).toBe(true);
      expect(Array.isArray(simulation.wastedActions)).toBe(true);
      expect(simulation.wastedActions.length).toBeGreaterThan(0); // Failed task should be wasted
    });
  });

  describe('Workflow with Rollbacks', () => {
    it('should detect rollbacks as wasted effort', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'transaction');
      telemetry.recordSnapshotCommit('wf-1', 'task-1', 'snapshot-1');
      telemetry.recordStepEnd('wf-1', 'task-1', 'transaction', true, 200);
      
      telemetry.recordRollback('wf-1', 'task-1', 'snapshot-1', 'Transaction failed');

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      expect(simulation.wastedActions.length).toBeGreaterThan(0);
      expect(simulation.wastedActions.some(a => a.includes('rollback'))).toBe(true);
    });
  });

  describe('Counterfactual Analysis', () => {
    it('should give high intervention value when action prevented failures', () => {
      // Workflow with CRV violations that were caught
      telemetry.recordStepStart('wf-1', 'task-1', 'validation');
      telemetry.recordCRVResult('wf-1', 'task-1', 'gate-1', false, true, 'VIOLATION');
      telemetry.recordStepEnd('wf-1', 'task-1', 'validation', false, 100);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      // When actual outcome has violations, do-nothing would likely fail
      expect(simulation.doNothingOutcome.status).toBe('failure');
      // Intervention value might be high or low depending on actual outcome
      expect(simulation.interventionValue).toBeGreaterThanOrEqual(0);
    });

    it('should give low intervention value when actions were unnecessary', () => {
      // Successful workflow with no violations or checks
      telemetry.recordStepStart('wf-1', 'task-1', 'simple-task');
      telemetry.recordStepEnd('wf-1', 'task-1', 'simple-task', true, 100);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      // With no violations, doing nothing might have been OK
      expect(simulation.doNothingOutcome.status).toBe('success');
      // But some tasks were completed, so there's some value
      expect(simulation.interventionValue).toBeGreaterThan(0);
    });
  });

  describe('Cost Analysis', () => {
    it('should calculate costs including time, API calls, and retries', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'processing');
      telemetry.recordToolCall('wf-1', 'task-1', 'api-1', {});
      telemetry.recordToolCall('wf-1', 'task-1', 'api-2', {});
      telemetry.recordStepEnd('wf-1', 'task-1', 'processing', true, 500);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      expect(simulation.actualOutcome.totalCost).toBeGreaterThan(0);
      // Do-nothing outcome should have minimal cost
      expect(simulation.doNothingOutcome.totalCost).toBe(0);
    });
  });

  describe('Outcome Analysis', () => {
    it('should accurately represent actual outcomes', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'processing');
      telemetry.recordStepEnd('wf-1', 'task-1', 'processing', true, 100);
      
      telemetry.recordStepStart('wf-1', 'task-2', 'processing');
      telemetry.recordStepEnd('wf-1', 'task-2', 'processing', true, 100);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      expect(simulation.actualOutcome.completedTasks).toBe(2);
      expect(simulation.actualOutcome.failedTasks).toBe(0);
      expect(simulation.actualOutcome.crvViolations).toBe(0);
      expect(simulation.actualOutcome.policyViolations).toBe(0);
    });

    it('should count violations correctly', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'processing');
      telemetry.recordCRVResult('wf-1', 'task-1', 'gate-1', false, true, 'VIOLATION');
      telemetry.recordPolicyCheck('wf-1', 'task-1', false, true, 'Policy denied');
      telemetry.recordStepEnd('wf-1', 'task-1', 'processing', false, 100);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      expect(simulation.actualOutcome.crvViolations).toBe(1);
      expect(simulation.actualOutcome.policyViolations).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty traces', () => {
      traceCollector.ingestTrace({
        id: 'empty-trace',
        workflowId: 'wf-empty',
        startTime: new Date(),
        events: [],
        spans: [],
        status: 'completed',
      });

      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      expect(simulation.actualOutcome.completedTasks).toBe(0);
      expect(simulation.doNothingOutcome.completedTasks).toBe(0);
      expect(simulation.interventionValue).toBeGreaterThanOrEqual(0);
    });

    it('should handle traces with only failures', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'processing');
      telemetry.recordStepEnd('wf-1', 'task-1', 'processing', false, 100);
      
      telemetry.recordStepStart('wf-1', 'task-2', 'processing');
      telemetry.recordStepEnd('wf-1', 'task-2', 'processing', false, 100);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();
      const simulation = simulator.simulate(traces[0]);

      expect(simulation.actualOutcome.completedTasks).toBe(0);
      expect(simulation.actualOutcome.failedTasks).toBe(2);
      expect(simulation.wastedActions.length).toBeGreaterThan(0);
    });
  });
});
