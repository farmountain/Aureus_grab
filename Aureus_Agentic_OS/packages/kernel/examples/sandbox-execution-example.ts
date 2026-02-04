/**
 * Example: Sandbox Execution with Simulation Mode
 * 
 * This example demonstrates how to use the sandbox execution feature
 * to safely execute tools with side effect capture and CRV validation.
 */

import {
  WorkflowOrchestrator,
  InMemoryStateStore,
  TaskSpec,
  WorkflowSpec,
  SandboxIntegration,
} from '@aureus/kernel';
import { CRVGate, Validators } from '@aureus/crv';
import { HipCortex, MemoryAPI } from '@aureus/memory-hipcortex';
import { TelemetryCollector } from '@aureus/observability';

/**
 * Example 1: Basic sandbox execution with simulation mode
 */
async function basicSandboxExecution() {
  console.log('=== Example 1: Basic Sandbox Execution ===\n');

  // Setup components
  const stateStore = new InMemoryStateStore();
  const telemetry = new TelemetryCollector();
  const hipCortex = new HipCortex();
  const memoryAPI = new MemoryAPI(hipCortex);
  const sandboxIntegration = new SandboxIntegration(telemetry);

  // Define a task with sandbox enabled
  const task: TaskSpec = {
    id: 'write-file-task',
    name: 'Write Configuration File',
    type: 'action',
    inputs: {
      path: '/tmp/config.json',
      content: JSON.stringify({ apiKey: 'test-key' }),
    },
    sandboxConfig: {
      enabled: true,
      simulationMode: true, // Capture side effects without executing
    },
  };

  // Mock executor that would normally write a file
  const executor = {
    execute: async (t: TaskSpec) => {
      console.log(`Executing task: ${t.name}`);
      console.log(`Would write to: ${t.inputs?.path}`);
      return { success: true, written: true };
    },
  };

  // Execute in sandbox
  const result = await sandboxIntegration.executeInSandbox(
    task,
    { taskId: task.id, status: 'pending', attempt: 0 },
    executor.execute,
    {
      workflowId: 'workflow-1',
      taskId: task.id,
      memoryAPI,
    }
  );

  console.log('Execution Result:', JSON.stringify(result, null, 2));
  console.log('\n✓ Side effects captured without actual execution');
  console.log(`✓ Logged to HipCortex with ID: ${result.metadata.hipCortexEntryId}\n`);
}

/**
 * Example 2: Sandbox execution with CRV validation
 */
async function sandboxWithCRVValidation() {
  console.log('=== Example 2: Sandbox with CRV Validation ===\n');

  const stateStore = new InMemoryStateStore();
  const telemetry = new TelemetryCollector();
  const hipCortex = new HipCortex();
  const memoryAPI = new MemoryAPI(hipCortex);
  const sandboxIntegration = new SandboxIntegration(telemetry);

  // Create a CRV gate that validates outputs
  const crvGate = new CRVGate(
    {
      name: 'Output Validator',
      validators: [
        Validators.notNull(),
        // Custom validator: ensure success field is true
        async (commit) => {
          const data = commit.data as any;
          if (data && data.success === false) {
            return {
              valid: false,
              reason: 'Task execution failed',
              failure_code: 'EXECUTION_FAILED',
            };
          }
          return { valid: true };
        },
      ],
      blockOnFailure: true,
    },
    telemetry
  );

  // Define a task
  const task: TaskSpec = {
    id: 'validated-task',
    name: 'CRV Validated Task',
    type: 'action',
    inputs: { value: 100 },
    sandboxConfig: {
      enabled: true,
      simulationMode: true,
    },
  };

  // Mock executor
  const executor = {
    execute: async (t: TaskSpec) => {
      return { success: true, result: 'completed', value: t.inputs?.value };
    },
  };

  // Execute with CRV validation
  const result = await sandboxIntegration.executeInSandbox(
    task,
    { taskId: task.id, status: 'pending', attempt: 0 },
    executor.execute,
    {
      workflowId: 'workflow-2',
      taskId: task.id,
      memoryAPI,
      crvGate,
    }
  );

  console.log('CRV Validation Result:');
  console.log(`- Passed: ${result.metadata.crvValidation?.passed}`);
  console.log(`- Blocked: ${result.metadata.crvValidation?.blockedCommit}`);
  console.log('\n✓ Output validated through CRV gate');
  console.log('✓ Validation results logged to HipCortex\n');
}

/**
 * Example 3: High-risk task with restrictive sandbox
 */
async function highRiskTaskWithRestrictiveSandbox() {
  console.log('=== Example 3: High-Risk Task with Restrictive Sandbox ===\n');

  const stateStore = new InMemoryStateStore();
  const telemetry = new TelemetryCollector();
  const hipCortex = new HipCortex();
  const memoryAPI = new MemoryAPI(hipCortex);
  const sandboxIntegration = new SandboxIntegration(telemetry);

  // High-risk task gets restrictive sandbox automatically
  const task: TaskSpec = {
    id: 'high-risk-task',
    name: 'Delete Production Data',
    type: 'action',
    riskTier: 'HIGH', // This triggers restrictive sandbox config
    inputs: { database: 'production', table: 'users' },
    sandboxConfig: {
      enabled: true,
      simulationMode: true, // Definitely simulate this!
    },
  };

  const executor = {
    execute: async (t: TaskSpec) => {
      console.log(`[SIMULATED] Would delete from ${t.inputs?.database}.${t.inputs?.table}`);
      return { success: true, deleted: 0 }; // Simulated result
    },
  };

  const result = await sandboxIntegration.executeInSandbox(
    task,
    { taskId: task.id, status: 'pending', attempt: 0 },
    executor.execute,
    {
      workflowId: 'workflow-3',
      taskId: task.id,
      memoryAPI,
    }
  );

  console.log('Execution Result:');
  console.log(`- Simulation Mode: ${result.metadata.simulationMode}`);
  console.log(`- Success: ${result.success}`);
  console.log('\n✓ High-risk operation safely simulated');
  console.log('✓ No actual data was deleted');
  console.log('✓ Side effects captured for review\n');
}

/**
 * Example 4: Complete workflow with sandbox integration
 */
async function completeWorkflowWithSandbox() {
  console.log('=== Example 4: Complete Workflow with Sandbox ===\n');

  const stateStore = new InMemoryStateStore();
  const telemetry = new TelemetryCollector();
  const hipCortex = new HipCortex();
  const memoryAPI = new MemoryAPI(hipCortex);
  const crvGate = new CRVGate(
    {
      name: 'Workflow Validator',
      validators: [Validators.notNull()],
      blockOnFailure: true,
    },
    telemetry
  );

  // Create orchestrator with sandbox integration
  const sandboxIntegration = new SandboxIntegration(telemetry);
  
  const executor = {
    execute: async (task: TaskSpec) => {
      return { 
        taskId: task.id,
        result: `Completed ${task.name}`,
        timestamp: new Date(),
      };
    },
  };

  const orchestrator = new WorkflowOrchestrator(
    stateStore,
    executor,
    undefined,
    undefined,
    undefined,
    memoryAPI,
    crvGate,
    undefined,
    undefined,
    telemetry,
    undefined,
    undefined,
    sandboxIntegration
  );

  // Define workflow with mixed sandbox configurations
  const workflow: WorkflowSpec = {
    id: 'mixed-workflow',
    name: 'Mixed Sandbox Workflow',
    tasks: [
      {
        id: 'task-1',
        name: 'Safe Read Operation',
        type: 'action',
        inputs: { operation: 'read' },
        // No sandbox needed for safe reads
      },
      {
        id: 'task-2',
        name: 'Simulated Write',
        type: 'action',
        inputs: { operation: 'write', data: 'test' },
        sandboxConfig: {
          enabled: true,
          simulationMode: true,
        },
      },
      {
        id: 'task-3',
        name: 'Validated Update',
        type: 'action',
        inputs: { operation: 'update' },
        riskTier: 'MEDIUM',
        sandboxConfig: {
          enabled: true,
          simulationMode: true,
        },
      },
    ],
    dependencies: new Map([
      ['task-2', ['task-1']],
      ['task-3', ['task-2']],
    ]),
  };

  // Execute workflow
  const result = await orchestrator.executeWorkflow(workflow);

  console.log('Workflow Result:', result.status);
  console.log(`Tasks Completed: ${result.taskStates.size}`);
  console.log('\n✓ Workflow executed with mixed sandbox configurations');
  console.log('✓ All sandboxed tasks logged to HipCortex');
  console.log('✓ CRV validation applied to all outputs\n');

  // Query HipCortex for audit trail
  const auditEntries = memoryAPI.read({ tags: ['sandbox_execution'] });
  console.log(`Audit Trail: ${auditEntries.length} sandbox executions logged`);
  auditEntries.forEach((entry, i) => {
    const content = entry.content as any;
    console.log(`  ${i + 1}. ${content.taskName} - ${content.result.success ? 'Success' : 'Failed'}`);
  });
}

/**
 * Run all examples
 */
async function runAllExamples() {
  try {
    await basicSandboxExecution();
    await sandboxWithCRVValidation();
    await highRiskTaskWithRestrictiveSandbox();
    await completeWorkflowWithSandbox();
    
    console.log('\n=== All Examples Completed Successfully ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runAllExamples();
}

export {
  basicSandboxExecution,
  sandboxWithCRVValidation,
  highRiskTaskWithRestrictiveSandbox,
  completeWorkflowWithSandbox,
};
