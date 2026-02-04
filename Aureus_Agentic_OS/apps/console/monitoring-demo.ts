/**
 * Monitoring Dashboard Demo
 * 
 * This script demonstrates the monitoring dashboard with telemetry
 * and reflexion integration by simulating workflow executions.
 */

import { TelemetryCollector, TelemetryEventType } from '../packages/observability/src';
import { ReflexionEngine } from '../packages/reflexion/src';
import { GoalGuardFSM } from '../packages/policy/src';
import { CRVGate } from '../packages/crv/src';
import { ConsoleService } from './src/console-service';
import { ConsoleAPIServer } from './src/api-server';
import { AuthService } from './src/auth';
import { InMemoryStateStore, InMemoryEventLog } from '@aureus/kernel';

async function runDemo() {
  console.log('🚀 Starting Monitoring Dashboard Demo...\n');

  // Create components
  const stateStore = new InMemoryStateStore();
  const eventLog = new InMemoryEventLog();
  const policyGuard = new GoalGuardFSM();
  
  // Create a minimal CRV gate for demo purposes
  const crvGate = new CRVGate({
    name: 'demo-gate',
    validators: [],
    blockOnFailure: true,
  });
  
  const telemetry = new TelemetryCollector();
  const reflexionEngine = new ReflexionEngine(
    policyGuard,
    crvGate,
    { enabled: true, minConfidence: 0.6 },
    [],
    telemetry
  );

  // Create console service
  const consoleService = new ConsoleService(
    stateStore as any,
    eventLog as any,
    policyGuard,
    undefined,
    undefined,
    telemetry,
    reflexionEngine
  );

  // Simulate some workflow executions
  console.log('📊 Simulating workflow executions...\n');

  // Successful workflow execution
  telemetry.recordStepStart('wf-payment-1', 'validate-payment', 'validation');
  telemetry.recordStepEnd('wf-payment-1', 'validate-payment', 'validation', true, 120);
  
  telemetry.recordStepStart('wf-payment-1', 'process-payment', 'api-call');
  telemetry.recordCRVResult('wf-payment-1', 'process-payment', 'amount-threshold', true, false);
  telemetry.recordStepEnd('wf-payment-1', 'process-payment', 'api-call', true, 230);

  console.log('✅ Completed successful workflow: wf-payment-1');

  // Failed workflow with CRV failure
  telemetry.recordStepStart('wf-payment-2', 'validate-payment', 'validation');
  telemetry.recordStepEnd('wf-payment-2', 'validate-payment', 'validation', true, 110);
  
  telemetry.recordStepStart('wf-payment-2', 'process-payment', 'api-call');
  telemetry.recordCRVResult('wf-payment-2', 'process-payment', 'amount-threshold', false, true, 'THRESHOLD_EXCEEDED');
  telemetry.recordStepEnd('wf-payment-2', 'process-payment', 'api-call', false, 200, 'CRV gate blocked');

  console.log('❌ Failed workflow (CRV): wf-payment-2');

  // Workflow requiring approval
  telemetry.recordStepStart('wf-transfer-1', 'validate-account', 'validation');
  telemetry.recordStepEnd('wf-transfer-1', 'validate-account', 'validation', true, 95);
  
  telemetry.recordStepStart('wf-transfer-1', 'transfer-funds', 'api-call');
  telemetry.recordPolicyCheck('wf-transfer-1', 'transfer-funds', false, true, 'High-risk transfer requires approval');
  telemetry.recordStepEnd('wf-transfer-1', 'transfer-funds', 'api-call', false, 50, 'Awaiting approval');

  console.log('⏸️  Workflow awaiting approval: wf-transfer-1');

  // Workflow with rollback
  telemetry.recordStepStart('wf-deploy-1', 'validate-config', 'validation');
  telemetry.recordStepEnd('wf-deploy-1', 'validate-config', 'validation', true, 80);
  
  telemetry.recordStepStart('wf-deploy-1', 'deploy-service', 'deployment');
  telemetry.recordSnapshotCommit('wf-deploy-1', 'deploy-service', 'snapshot-pre-deploy');
  telemetry.recordStepEnd('wf-deploy-1', 'deploy-service', 'deployment', false, 1500, 'Service health check failed');
  telemetry.recordRollback('wf-deploy-1', 'deploy-service', 'snapshot-pre-deploy', 'Service health check failed');

  console.log('🔄 Workflow rolled back: wf-deploy-1');

  // Trigger reflexion on failures
  console.log('\n🔍 Running Reflexion analysis...\n');

  try {
    const result1 = await consoleService.triggerReflexion(
      'wf-payment-2',
      'process-payment',
      new Error('CRV gate blocked: THRESHOLD_EXCEEDED'),
      { gate: 'amount-threshold', amount: 15000, threshold: 10000 }
    );
    console.log(`📝 Generated postmortem for wf-payment-2:`);
    console.log(`   Taxonomy: ${result1.postmortem.failureTaxonomy}`);
    console.log(`   Root Cause: ${result1.postmortem.rootCause}`);
    console.log(`   Fix: ${result1.postmortem.proposedFix.description}`);
    console.log(`   Confidence: ${(result1.postmortem.confidence * 100).toFixed(0)}%`);
  } catch (error) {
    console.log('   Note: Reflexion analysis generated postmortem with low confidence');
  }

  try {
    const result2 = await consoleService.triggerReflexion(
      'wf-deploy-1',
      'deploy-service',
      new Error('Service health check failed'),
      { service: 'api-gateway', healthCheckUrl: 'http://api/health' }
    );
    console.log(`\n📝 Generated postmortem for wf-deploy-1:`);
    console.log(`   Taxonomy: ${result2.postmortem.failureTaxonomy}`);
    console.log(`   Root Cause: ${result2.postmortem.rootCause}`);
    console.log(`   Fix: ${result2.postmortem.proposedFix.description}`);
    console.log(`   Confidence: ${(result2.postmortem.confidence * 100).toFixed(0)}%`);
  } catch (error) {
    console.log('   Note: Reflexion analysis generated postmortem with low confidence');
  }

  // Display metrics summary
  console.log('\n📈 Metrics Summary:\n');
  const summary = consoleService.getMetricsSummary();
  if (summary) {
    console.log(`   Total Events: ${summary.totalEvents}`);
    console.log(`   Task Success Rates:`);
    for (const [taskType, rate] of Object.entries(summary.taskSuccessRateByType)) {
      console.log(`     - ${taskType}: ${(rate * 100).toFixed(1)}%`);
    }
    console.log(`   MTTR: ${summary.mttr.toFixed(0)}ms`);
    console.log(`   Human Escalation Rate: ${(summary.humanEscalationRate * 100).toFixed(1)}%`);
    console.log(`   Cost per Success: ${summary.costPerSuccess.toFixed(0)}ms`);
  }

  // Display reflexion stats
  console.log('\n🤖 Reflexion Statistics:\n');
  const stats = consoleService.getReflexionStats();
  if (stats) {
    console.log(`   Total Postmortems: ${stats.totalPostmortems}`);
    console.log(`   Sandbox Executions: ${stats.totalSandboxExecutions}`);
    console.log(`   Promoted Fixes: ${stats.promotedFixes}`);
    console.log(`   Rejected Fixes: ${stats.rejectedFixes}`);
    console.log(`   Average Confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
  }

  // Start API server
  console.log('\n🌐 Starting Console API Server...\n');
  const authService = new AuthService();
  const apiServer = new ConsoleAPIServer(consoleService, authService, 3000);
  
  await apiServer.start();
  
  console.log('\n✨ Demo complete! Access the monitoring dashboard at:');
  console.log('   http://localhost:3000/monitoring\n');
  console.log('   Default credentials:');
  console.log('   Username: operator');
  console.log('   Password: operator123\n');
  console.log('Press Ctrl+C to stop the server.');
}

// Run demo
runDemo().catch(console.error);
