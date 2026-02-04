import { describe, it, expect, beforeEach } from 'vitest';
import { BenchmarkEvaluator } from '../src/benchmark-evaluator';
import { TraceCollector } from '../src/trace-collector';
import { TelemetryCollector } from '@aureus/observability';

describe('BenchmarkEvaluator', () => {
  let evaluator: BenchmarkEvaluator;
  let traceCollector: TraceCollector;
  let telemetry: TelemetryCollector;

  beforeEach(() => {
    evaluator = new BenchmarkEvaluator();
    traceCollector = new TraceCollector();
    telemetry = new TelemetryCollector();
  });

  describe('Single Trace Evaluation', () => {
    it('should evaluate a successful trace', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      telemetry.recordCRVResult('wf-1', 'task-1', 'gate-1', true, false);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();

      const score = evaluator.evaluateTrace(traces[0]);

      expect(score.traceId).toBe(traces[0].id);
      expect(score.overallScore).toBeGreaterThan(0);
      expect(score.grade).toMatch(/^[A-F]$/);
      expect(score.passed).toBeDefined();
    });

    it('should evaluate output quality correctly', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      telemetry.recordCRVResult('wf-1', 'task-1', 'gate-1', true, false);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();

      const score = evaluator.evaluateTrace(traces[0]);

      expect(score.outputQuality.completeness).toBeGreaterThan(0);
      expect(score.outputQuality.correctness).toBeGreaterThan(0);
      expect(score.outputQuality.consistency).toBeGreaterThan(0);
      expect(score.outputQuality.score).toBeGreaterThanOrEqual(0);
      expect(score.outputQuality.score).toBeLessThanOrEqual(100);
    });

    it('should evaluate reasoning coherence correctly', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      telemetry.recordPolicyCheck('wf-1', 'task-1', true, false, 'Allowed');

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();

      const score = evaluator.evaluateTrace(traces[0]);

      expect(score.reasoningCoherence.logicalFlow).toBeGreaterThan(0);
      expect(score.reasoningCoherence.completeness).toBeGreaterThan(0);
      expect(score.reasoningCoherence.stepValidity).toBeGreaterThan(0);
      expect(score.reasoningCoherence.goalAlignment).toBeGreaterThan(0);
      expect(score.reasoningCoherence.score).toBeGreaterThanOrEqual(0);
      expect(score.reasoningCoherence.score).toBeLessThanOrEqual(100);
    });

    it('should evaluate cost/value correctly', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordToolCall('wf-1', 'task-1', 'api-call', {});
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();

      const score = evaluator.evaluateTrace(traces[0]);

      expect(score.costValue.totalCost).toBeGreaterThan(0);
      expect(score.costValue.totalValue).toBeGreaterThan(0);
      expect(score.costValue.efficiency).toBeGreaterThanOrEqual(0);
      expect(score.costValue.wastedEffort).toBeGreaterThanOrEqual(0);
      expect(score.costValue.wastedEffort).toBeLessThanOrEqual(1);
      expect(score.costValue.score).toBeGreaterThanOrEqual(0);
      expect(score.costValue.score).toBeLessThanOrEqual(100);
    });

    it('should assign grade correctly', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      telemetry.recordCRVResult('wf-1', 'task-1', 'gate-1', true, false);

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();

      const score = evaluator.evaluateTrace(traces[0]);

      if (score.overallScore >= 90) {
        expect(score.grade).toBe('A');
      } else if (score.overallScore >= 80) {
        expect(score.grade).toBe('B');
      } else if (score.overallScore >= 70) {
        expect(score.grade).toBe('C');
      } else if (score.overallScore >= 60) {
        expect(score.grade).toBe('D');
      } else {
        expect(score.grade).toBe('F');
      }
    });

    it('should generate recommendations for failing traces', () => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', false, 1000, 'Failed');
      telemetry.recordCRVResult('wf-1', 'task-1', 'gate-1', false, true);
      telemetry.recordRollback('wf-1', 'task-1', 'snap-1', 'Failed validation');

      traceCollector.ingestFromTelemetry(telemetry);
      const traces = traceCollector.getTraces();

      const score = evaluator.evaluateTrace(traces[0]);

      expect(score.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple Trace Evaluation', () => {
    beforeEach(() => {
      // Trace 1: Successful
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      telemetry.recordCRVResult('wf-1', 'task-1', 'gate-1', true, false);

      // Trace 2: Failed
      telemetry.recordStepStart('wf-2', 'task-2', 'validation');
      telemetry.recordStepEnd('wf-2', 'task-2', 'validation', false, 500);
      telemetry.recordCRVResult('wf-2', 'task-2', 'gate-2', false, true);

      traceCollector.ingestFromTelemetry(telemetry);
    });

    it('should evaluate multiple traces', () => {
      const traces = traceCollector.getTraces();
      const report = evaluator.evaluateTraces(traces);

      expect(report.scores).toHaveLength(2);
      expect(report.metadata.totalTraces).toBe(2);
    });

    it('should calculate aggregate metrics', () => {
      const traces = traceCollector.getTraces();
      const report = evaluator.evaluateTraces(traces);

      expect(report.aggregateMetrics.averageOutputQuality).toBeGreaterThanOrEqual(0);
      expect(report.aggregateMetrics.averageReasoningCoherence).toBeGreaterThanOrEqual(0);
      expect(report.aggregateMetrics.averageCostValue).toBeGreaterThanOrEqual(0);
      expect(report.aggregateMetrics.overallAverageScore).toBeGreaterThanOrEqual(0);
      expect(report.aggregateMetrics.passRate).toBeGreaterThanOrEqual(0);
      expect(report.aggregateMetrics.passRate).toBeLessThanOrEqual(1);
    });

    it('should generate insights', () => {
      const traces = traceCollector.getTraces();
      const report = evaluator.evaluateTraces(traces);

      expect(report.insights).toBeDefined();
      expect(Array.isArray(report.insights)).toBe(true);
    });

    it('should generate recommendations', () => {
      const traces = traceCollector.getTraces();
      const report = evaluator.evaluateTraces(traces);

      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  describe('Report Export', () => {
    beforeEach(() => {
      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      traceCollector.ingestFromTelemetry(telemetry);
    });

    it('should export report as JSON', () => {
      const traces = traceCollector.getTraces();
      const report = evaluator.evaluateTraces(traces);
      const json = evaluator.exportReportJSON(report);

      expect(json).toBeDefined();
      expect(typeof json).toBe('string');
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should export report as Markdown', () => {
      const traces = traceCollector.getTraces();
      const report = evaluator.evaluateTraces(traces);
      const markdown = evaluator.exportReportMarkdown(report);

      expect(markdown).toBeDefined();
      expect(typeof markdown).toBe('string');
      expect(markdown).toContain('# Benchright Evaluation Report');
      expect(markdown).toContain('## Overall Performance');
    });
  });

  describe('Custom Configuration', () => {
    it('should use custom weights', () => {
      const customEvaluator = new BenchmarkEvaluator({
        weights: {
          outputQuality: 0.5,
          reasoningCoherence: 0.3,
          costValue: 0.2,
          hypothesisSwitching: 0,
          counterfactual: 0,
        },
      });

      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      traceCollector.ingestFromTelemetry(telemetry);

      const traces = traceCollector.getTraces();
      const score = customEvaluator.evaluateTrace(traces[0]);

      expect(score.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should use custom thresholds', () => {
      const customEvaluator = new BenchmarkEvaluator({
        thresholds: {
          minOutputQuality: 90,
          minReasoningCoherence: 90,
          minCostValue: 80,
          minHypothesisSwitching: 80,
          minCounterfactual: 70,
          minOverallScore: 85,
        },
      });

      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      traceCollector.ingestFromTelemetry(telemetry);

      const traces = traceCollector.getTraces();
      const score = customEvaluator.evaluateTrace(traces[0]);

      // With stricter thresholds, passing is harder
      expect(score.passed).toBeDefined();
    });

    it('should disable counterfactual evaluation', () => {
      const customEvaluator = new BenchmarkEvaluator({
        enableCounterfactual: false,
      });

      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      traceCollector.ingestFromTelemetry(telemetry);

      const traces = traceCollector.getTraces();
      const score = customEvaluator.evaluateTrace(traces[0]);

      expect(score.counterfactual.score).toBe(100);
      expect(score.counterfactual.details).toContain('Counterfactual evaluation disabled');
    });

    it('should disable hypothesis switching evaluation', () => {
      const customEvaluator = new BenchmarkEvaluator({
        enableHypothesisSwitching: false,
      });

      telemetry.recordStepStart('wf-1', 'task-1', 'extraction');
      telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1000);
      traceCollector.ingestFromTelemetry(telemetry);

      const traces = traceCollector.getTraces();
      const score = customEvaluator.evaluateTrace(traces[0]);

      expect(score.hypothesisSwitching.score).toBe(100);
      expect(score.hypothesisSwitching.details).toContain('Hypothesis switching evaluation disabled');
    });
  });
});
