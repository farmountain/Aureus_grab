/**
 * Example usage of the Benchright package
 * 
 * This example demonstrates how to:
 * 1. Collect telemetry during workflow execution
 * 2. Ingest traces from telemetry
 * 3. Evaluate traces with benchright
 * 4. Generate and export reports
 */

import { TelemetryCollector } from '@aureus/observability';
import { TraceCollector, BenchmarkEvaluator } from '@aureus/benchright';

// Example 1: Basic Usage
console.log('=== Example 1: Basic Usage ===\n');

// Create telemetry collector
const telemetry = new TelemetryCollector();

// Simulate workflow execution with telemetry
console.log('Simulating workflow execution...');

// Workflow 1: Successful extraction task
telemetry.recordStepStart('wf-1', 'task-1', 'extraction', { attempt: 1 });
telemetry.recordToolCall('wf-1', 'task-1', 'database-query', { query: 'SELECT * FROM users' });
telemetry.recordCRVResult('wf-1', 'task-1', 'data-validation', true, false);
telemetry.recordStepEnd('wf-1', 'task-1', 'extraction', true, 1500);

// Workflow 2: Validation task with some issues
telemetry.recordStepStart('wf-2', 'task-2', 'validation', { attempt: 1 });
telemetry.recordStepEnd('wf-2', 'task-2', 'validation', false, 800, 'Validation failed');
telemetry.recordRollback('wf-2', 'task-2', 'snap-1', 'Failed validation');
telemetry.recordStepStart('wf-2', 'task-2', 'validation', { attempt: 2 });
telemetry.recordCRVResult('wf-2', 'task-2', 'validation-gate', true, false);
telemetry.recordStepEnd('wf-2', 'task-2', 'validation', true, 1200);

// Workflow 3: Complex task with multiple steps
telemetry.recordStepStart('wf-3', 'task-3', 'transformation', { attempt: 1 });
telemetry.recordToolCall('wf-3', 'task-3', 'api-call', { endpoint: '/transform' });
telemetry.recordCRVResult('wf-3', 'task-3', 'output-validation', true, false);
telemetry.recordPolicyCheck('wf-3', 'task-3', true, false, 'Policy check passed');
telemetry.recordStepEnd('wf-3', 'task-3', 'transformation', true, 2000);

console.log('✓ Workflow execution completed\n');

// Ingest traces from telemetry
console.log('Ingesting traces from telemetry...');
const traceCollector = new TraceCollector();
traceCollector.ingestFromTelemetry(telemetry);
const traces = traceCollector.getCompletedTraces();
console.log(`✓ Ingested ${traces.length} traces\n`);

// Evaluate traces
console.log('Evaluating traces...');
const evaluator = new BenchmarkEvaluator();
const report = evaluator.evaluateTraces(traces);
console.log('✓ Evaluation completed\n');

// Display results
console.log('=== Evaluation Results ===\n');
console.log(`Total Traces: ${report.metadata.totalTraces}`);
console.log(`Average Output Quality: ${report.aggregateMetrics.averageOutputQuality.toFixed(1)}/100`);
console.log(`Average Reasoning Coherence: ${report.aggregateMetrics.averageReasoningCoherence.toFixed(1)}/100`);
console.log(`Average Cost/Value: ${report.aggregateMetrics.averageCostValue.toFixed(1)}/100`);
console.log(`Average Hypothesis Switching: ${report.aggregateMetrics.averageHypothesisSwitching.toFixed(1)}/100`);
console.log(`Average Counterfactual: ${report.aggregateMetrics.averageCounterfactual.toFixed(1)}/100`);
console.log(`Overall Average Score: ${report.aggregateMetrics.overallAverageScore.toFixed(1)}/100`);
console.log(`Pass Rate: ${(report.aggregateMetrics.passRate * 100).toFixed(1)}%\n`);

// Display individual trace scores
console.log('=== Individual Trace Scores ===\n');
for (const score of report.scores) {
  console.log(`Trace ${score.traceId.substring(0, 12)}...`);
  console.log(`  Overall: ${score.overallScore.toFixed(1)}/100 (Grade: ${score.grade})`);
  console.log(`  Status: ${score.passed ? '✅ Passed' : '❌ Failed'}`);
  console.log(`  Output Quality: ${score.outputQuality.score.toFixed(1)}`);
  console.log(`  Reasoning: ${score.reasoningCoherence.score.toFixed(1)}`);
  console.log(`  Cost/Value: ${score.costValue.score.toFixed(1)}`);
  if (score.recommendations.length > 0) {
    console.log(`  Recommendations:`);
    score.recommendations.forEach(rec => console.log(`    - ${rec}`));
  }
  console.log();
}

// Display insights
if (report.insights.length > 0) {
  console.log('=== Insights ===\n');
  report.insights.forEach(insight => console.log(`- ${insight}`));
  console.log();
}

// Display recommendations
if (report.recommendations.length > 0) {
  console.log('=== Recommendations ===\n');
  report.recommendations.forEach(rec => console.log(`- ${rec}`));
  console.log();
}

// Export markdown report
console.log('=== Markdown Report Preview ===\n');
const markdown = evaluator.exportReportMarkdown(report);
console.log(markdown.substring(0, 500) + '...\n');

// Example 2: Custom Configuration
console.log('\n=== Example 2: Custom Configuration ===\n');

const customEvaluator = new BenchmarkEvaluator({
  weights: {
    outputQuality: 0.4,
    reasoningCoherence: 0.3,
    costValue: 0.2,
    hypothesisSwitching: 0.05,
    counterfactual: 0.05,
  },
  thresholds: {
    minOutputQuality: 85,
    minReasoningCoherence: 80,
    minCostValue: 75,
    minHypothesisSwitching: 70,
    minCounterfactual: 65,
    minOverallScore: 80,
  },
  enableCounterfactual: true,
  enableHypothesisSwitching: true,
});

const customReport = customEvaluator.evaluateTraces(traces);
console.log(`Custom evaluation with stricter thresholds:`);
console.log(`Overall Average Score: ${customReport.aggregateMetrics.overallAverageScore.toFixed(1)}/100`);
console.log(`Pass Rate: ${(customReport.aggregateMetrics.passRate * 100).toFixed(1)}%`);
console.log();

// Example 3: Exporting Reports
console.log('=== Example 3: Exporting Reports ===\n');

// Export as JSON
const jsonReport = evaluator.exportReportJSON(report);
console.log(`JSON report size: ${jsonReport.length} bytes`);

// In a real application, you would save these to files:
// import * as fs from 'fs';
// fs.writeFileSync('benchmark-report.json', jsonReport);
// fs.writeFileSync('benchmark-report.md', markdown);
console.log('Reports can be saved to files for further analysis\n');

console.log('=== Example Complete ===');
