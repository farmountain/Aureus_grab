/**
 * Example: Using the Workflow Generator
 * 
 * This example demonstrates how to use the workflow generator
 * to create structured workflow specifications from natural language.
 */

import { WorkflowGenerator } from './src/workflow-generator';
import { InMemoryEventLog } from '@aureus/kernel';
import { WorkflowGenerationRequest } from '@aureus/kernel';

async function main() {
  // Create an event log for audit trails
  const eventLog = new InMemoryEventLog();
  
  // Create the workflow generator
  const generator = new WorkflowGenerator(eventLog);

  console.log('=== Workflow Generator Example ===\n');

  // Example 1: Simple workflow
  console.log('Example 1: Bank Transaction Reconciliation');
  const request1: WorkflowGenerationRequest = {
    goal: 'Reconcile bank transactions with internal ledger and flag discrepancies for review',
    constraints: [
      'Complete within 5 minutes',
      'No external API calls allowed',
      'Must handle up to 10,000 transactions'
    ],
    preferredTools: ['database', 'email', 'slack'],
    riskTolerance: 'HIGH',
  };

  const result1 = await generator.generateWorkflow(request1);
  console.log('Generated Workflow ID:', result1.spec.id);
  console.log('Workflow Name:', result1.spec.name);
  console.log('Number of Tasks:', result1.spec.tasks.length);
  console.log('Tasks:');
  result1.spec.tasks.forEach((task, i) => {
    console.log(`  ${i + 1}. ${task.name} (${task.type}, Risk: ${task.riskTier || 'MEDIUM'})`);
  });
  console.log('\nDependencies:');
  result1.spec.dependencies.forEach((deps, taskId) => {
    console.log(`  ${taskId} depends on: ${deps.join(', ')}`);
  });
  console.log('\n');

  // Example 2: Critical operation
  console.log('Example 2: Critical Financial Transaction');
  const request2: WorkflowGenerationRequest = {
    goal: 'Execute high-value financial transfer with compliance checks and audit trail',
    constraints: [
      'Requires dual approval',
      'Must log all steps',
      'Immediate rollback on failure'
    ],
    preferredTools: ['payment-gateway', 'audit-log', 'notification'],
    riskTolerance: 'CRITICAL',
    additionalContext: 'This handles transfers over $100,000 and must comply with banking regulations',
  };

  const result2 = await generator.generateWorkflow(request2);
  console.log('Generated Workflow ID:', result2.spec.id);
  console.log('Workflow Name:', result2.spec.name);
  console.log('Number of Tasks:', result2.spec.tasks.length);
  console.log('Safety Policy:', result2.spec.safetyPolicy?.name);
  console.log('Fail Fast:', result2.spec.safetyPolicy?.failFast);
  console.log('Safety Rules:', result2.spec.safetyPolicy?.rules.map(r => r.type).join(', '));
  console.log('\n');

  // Example 3: Data processing pipeline
  console.log('Example 3: Data Processing Pipeline');
  const request3: WorkflowGenerationRequest = {
    goal: 'Extract customer data from multiple sources, transform to common format, and load into data warehouse',
    preferredTools: ['database', 's3', 'spark', 'airflow'],
    riskTolerance: 'MEDIUM',
  };

  const result3 = await generator.generateWorkflow(request3);
  console.log('Generated Workflow ID:', result3.spec.id);
  console.log('Workflow Name:', result3.spec.name);
  console.log('Tasks with retry configs:');
  result3.spec.tasks
    .filter(t => t.retry)
    .forEach(task => {
      console.log(`  - ${task.name}: max ${task.retry!.maxAttempts} attempts, ${task.retry!.backoffMs}ms backoff`);
    });
  console.log('\n');

  // Show audit log
  console.log('=== Audit Log ===');
  const events = await eventLog.read('workflow-generator');
  console.log(`Total events logged: ${events.length}`);
  console.log('\nRecent events:');
  events.slice(-4).forEach((event, i) => {
    console.log(`${i + 1}. ${event.type} at ${event.timestamp.toISOString()}`);
    if (event.data?.action) {
      console.log(`   Action: ${event.data.action}`);
    }
  });
  console.log('\n');

  // Example 4: Validate a custom spec
  console.log('Example 4: Validation');
  const customSpec = {
    id: 'custom-workflow-123',
    name: 'Custom Workflow',
    tasks: [
      {
        id: 'task-1',
        name: 'Initialize',
        type: 'action',
        riskTier: 'LOW',
      },
      {
        id: 'task-2',
        name: 'Process',
        type: 'action',
        riskTier: 'MEDIUM',
        retry: {
          maxAttempts: 3,
          backoffMs: 1000,
        },
      },
    ],
    dependencies: {
      'task-2': ['task-1'],
    },
  };

  console.log('Validating custom spec...');
  if (!customSpec.id || !customSpec.name || !customSpec.tasks || customSpec.tasks.length === 0) {
    console.log('✗ Validation failed: Missing required fields');
  } else {
    console.log('✓ Validation passed');
    console.log('  Workflow:', customSpec.name);
    console.log('  Tasks:', customSpec.tasks.length);
    console.log('  Dependencies:', Object.keys(customSpec.dependencies).length);
  }
  console.log('\n');

  console.log('=== Example Complete ===');
}

// Run the example
main().catch(console.error);
