/**
 * BenchRight Demo
 * 
 * This example demonstrates how to use BenchRight to evaluate workflow execution quality,
 * including reasoning coherence, cost/value tradeoffs, and counterfactual analysis.
 */

import { TelemetryCollector } from '@aureus/observability';
import { TraceCollector, BenchmarkEvaluator, CounterfactualSimulator } from '../src';

async function runDemo() {
  console.log('🚀 BenchRight Demo - Quality Evaluation for Agentic Workflows\n');

  // Create a telemetry collector to track workflow execution
  const telemetry = new TelemetryCollector();

  // ===== Scenario 1: Successful Workflow with High Value =====
  console.log('📊 Scenario 1: High-Quality Workflow Execution');
  
  telemetry.recordStepStart('wf-payment-1', 'validate-input', 'validation');
  telemetry.recordStepEnd('wf-payment-1', 'validate-input', 'validation', true, 100);
  
  telemetry.recordStepStart('wf-payment-1', 'check-balance', 'query');
  telemetry.recordToolCall('wf-payment-1', 'check-balance', 'database-query', { account: '12345' });
  telemetry.recordStepEnd('wf-payment-1', 'check-balance', 'query', true, 150);
  
  telemetry.recordStepStart('wf-payment-1', 'process-payment', 'transaction');
  telemetry.recordCRVResult('wf-payment-1', 'process-payment', 'amount-check', true, false);
  telemetry.recordPolicyCheck('wf-payment-1', 'process-payment', true, false, 'Within limits');
  telemetry.recordStepEnd('wf-payment-1', 'process-payment', 'transaction', true, 200);

  console.log('✅ Completed workflow wf-payment-1\n');

  // ===== Scenario 2: Workflow with CRV Failure and Rollback =====
  console.log('📊 Scenario 2: Workflow with Quality Issues');
  
  telemetry.recordStepStart('wf-transfer-1', 'validate-transfer', 'validation');
  telemetry.recordStepEnd('wf-transfer-1', 'validate-transfer', 'validation', true, 120);
  
  telemetry.recordStepStart('wf-transfer-1', 'execute-transfer', 'transaction');
  telemetry.recordSnapshotCommit('wf-transfer-1', 'execute-transfer', 'snapshot-pre-transfer');
  telemetry.recordStepEnd('wf-transfer-1', 'execute-transfer', 'transaction', true, 250);
  
  // CRV check fails after transaction
  telemetry.recordCRVResult('wf-transfer-1', 'execute-transfer', 'fraud-check', false, true, 'SUSPICIOUS_PATTERN');
  
  // Rollback the transaction
  telemetry.recordRollback('wf-transfer-1', 'execute-transfer', 'snapshot-pre-transfer', 'CRV fraud check failed');
  
  console.log('❌ Workflow wf-transfer-1 rolled back due to CRV failure\n');

  // ===== Scenario 3: Workflow with Unnecessary Retries =====
  console.log('📊 Scenario 3: Workflow with Wasted Effort');
  
  telemetry.recordStepStart('wf-deploy-1', 'check-status', 'query');
  telemetry.recordStepEnd('wf-deploy-1', 'check-status', 'query', false, 100, 'Timeout');
  
  // Retry 1
  telemetry.recordStepStart('wf-deploy-1', 'check-status', 'query');
  telemetry.recordStepEnd('wf-deploy-1', 'check-status', 'query', false, 100, 'Timeout');
  
  // Retry 2
  telemetry.recordStepStart('wf-deploy-1', 'check-status', 'query');
  telemetry.recordStepEnd('wf-deploy-1', 'check-status', 'query', false, 100, 'Timeout');
  
  // Finally succeeds
  telemetry.recordStepStart('wf-deploy-1', 'check-status', 'query');
  telemetry.recordStepEnd('wf-deploy-1', 'check-status', 'query', true, 50);
  
  telemetry.recordStepStart('wf-deploy-1', 'deploy-service', 'deployment');
  telemetry.recordStepEnd('wf-deploy-1', 'deploy-service', 'deployment', true, 300);

  console.log('⚠️  Workflow wf-deploy-1 completed with excessive retries\n');

  // ===== Evaluate with BenchRight =====
  console.log('📈 Running BenchRight Evaluation\n');
  console.log('='.repeat(80));

  // Collect traces from telemetry
  const traceCollector = new TraceCollector();
  traceCollector.ingestFromTelemetry(telemetry);

  const traces = traceCollector.getCompletedTraces();
  console.log(`\n📋 Collected ${traces.length} traces for evaluation`);

  // Create evaluator with custom configuration
  const evaluator = new BenchmarkEvaluator({
    weights: {
      outputQuality: 0.35,
      reasoningCoherence: 0.30,
      costValue: 0.20,
      hypothesisSwitching: 0.10,
      counterfactual: 0.05,
    },
    thresholds: {
      minOutputQuality: 75,
      minReasoningCoherence: 70,
      minCostValue: 65,
      minHypothesisSwitching: 60,
      minCounterfactual: 50,
      minOverallScore: 70,
    },
    enableCounterfactual: true,
    enableHypothesisSwitching: true,
  });

  // Generate comprehensive report
  const report = evaluator.evaluateTraces(traces);

  // Display aggregate metrics
  console.log('\n📊 Aggregate Metrics');
  console.log('='.repeat(80));
  console.log(`Overall Average Score: ${report.aggregateMetrics.overallAverageScore.toFixed(1)}/100`);
  console.log(`Pass Rate: ${(report.aggregateMetrics.passRate * 100).toFixed(0)}%`);
  console.log(`Average Output Quality: ${report.aggregateMetrics.averageOutputQuality.toFixed(1)}/100`);
  console.log(`Average Reasoning Coherence: ${report.aggregateMetrics.averageReasoningCoherence.toFixed(1)}/100`);
  console.log(`Average Cost/Value: ${report.aggregateMetrics.averageCostValue.toFixed(1)}/100`);
  console.log(`Average Counterfactual: ${report.aggregateMetrics.averageCounterfactual.toFixed(1)}/100`);

  // Display insights
  if (report.insights.length > 0) {
    console.log('\n💡 Insights');
    console.log('='.repeat(80));
    for (const insight of report.insights) {
      console.log(`  • ${insight}`);
    }
  }

  // Display recommendations
  if (report.recommendations.length > 0) {
    console.log('\n🎯 Recommendations');
    console.log('='.repeat(80));
    for (const recommendation of report.recommendations) {
      console.log(`  • ${recommendation}`);
    }
  }

  // Display individual trace scores
  console.log('\n📋 Individual Trace Scores');
  console.log('='.repeat(80));
  for (const score of report.scores) {
    const status = score.passed ? '✅' : '❌';
    console.log(`\n${status} Trace: ${score.traceId}`);
    console.log(`   Overall: ${score.overallScore.toFixed(1)}/100 (Grade: ${score.grade})`);
    console.log(`   Output Quality: ${score.outputQuality.score.toFixed(1)}`);
    console.log(`   Reasoning Coherence: ${score.reasoningCoherence.score.toFixed(1)}`);
    console.log(`   Cost/Value: ${score.costValue.score.toFixed(1)}`);
    
    if (score.recommendations.length > 0) {
      console.log(`   Recommendations:`);
      for (const rec of score.recommendations) {
        console.log(`     - ${rec}`);
      }
    }
  }

  // ===== Counterfactual Analysis =====
  console.log('\n🔮 Counterfactual Analysis');
  console.log('='.repeat(80));
  
  const simulator = new CounterfactualSimulator();
  
  for (const trace of traces) {
    const simulation = simulator.simulate(trace);
    
    console.log(`\nTrace: ${simulation.traceId}`);
    console.log(`  Actual Outcome: ${simulation.actualOutcome.status} (${simulation.actualOutcome.completedTasks} tasks)`);
    console.log(`  Do-Nothing Outcome: ${simulation.doNothingOutcome.status} (${simulation.doNothingOutcome.completedTasks} tasks)`);
    console.log(`  Intervention Value: ${(simulation.interventionValue * 100).toFixed(0)}%`);
    console.log(`  Necessary Actions: ${simulation.necessaryActions.length}`);
    console.log(`  Wasted Actions: ${simulation.wastedActions.length}`);
    
    if (simulation.wastedActions.length > 0) {
      console.log(`  Wasted: ${simulation.wastedActions.join(', ')}`);
    }
  }

  // Export reports
  console.log('\n📄 Exporting Reports');
  console.log('='.repeat(80));
  
  const jsonReport = evaluator.exportReportJSON(report);
  console.log(`JSON Report: ${jsonReport.length} characters`);
  
  const markdownReport = evaluator.exportReportMarkdown(report);
  console.log(`Markdown Report: ${markdownReport.length} characters`);
  
  console.log('\n✅ Demo Complete!');
  console.log('\nBenchRight provides comprehensive quality evaluation for agentic workflows:');
  console.log('  1. ✅ Reasoning coherence scores - evaluate logical flow and goal alignment');
  console.log('  2. 💰 Cost/value tradeoffs - measure efficiency and wasted effort');
  console.log('  3. 🔮 Counterfactual analysis - compare action vs. inaction');
  console.log('  4. 📊 Comprehensive reports - JSON and Markdown exports');
  console.log('  5. 🎯 Actionable recommendations - improve future workflows\n');
}

// Run the demo
runDemo().catch(console.error);
