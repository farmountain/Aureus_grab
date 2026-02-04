/**
 * Example: Using the Feasibility Checker
 * 
 * This example demonstrates how to use the FeasibilityChecker to validate
 * actions before execution in the workflow orchestrator.
 */

import {
  WorkflowOrchestrator,
  WorkflowSpec,
  TaskSpec,
  TaskExecutor,
  InMemoryStateStore,
  InMemoryEventLog,
} from '@aureus/kernel';
import { FeasibilityChecker, ToolRegistry, ToolInfo } from '@aureus/kernel';
import { ConstraintEngine, HardConstraint, WorldState } from '@aureus/world-model';

// Example 1: Basic Tool Registration and Feasibility Checking
async function basicExample() {
  console.log('\n=== Example 1: Basic Tool Registration ===\n');

  // Create a tool registry
  const toolRegistry = new ToolRegistry();

  // Register available tools
  const httpTool: ToolInfo = {
    name: 'http-client',
    capabilities: ['http-get', 'http-post', 'json-processing'],
    available: true,
    riskLevel: 'LOW',
  };

  const databaseTool: ToolInfo = {
    name: 'database-tool',
    capabilities: ['sql-query', 'sql-insert', 'sql-update'],
    available: true,
    riskLevel: 'HIGH',
  };

  toolRegistry.registerTool(httpTool);
  toolRegistry.registerTool(databaseTool);

  // Create feasibility checker
  const checker = new FeasibilityChecker(toolRegistry);

  // Check feasibility for a task
  const task: TaskSpec = {
    id: 'task-1',
    name: 'Fetch Data',
    type: 'action',
    toolName: 'http-client',
    riskTier: 'LOW',
  };

  const result = await checker.checkFeasibility(task);

  console.log('Feasibility Check Result:');
  console.log('  Feasible:', result.feasible);
  console.log('  Reasons:', result.reasons);
  console.log('  Tool Available:', result.toolCapabilityCheck?.available);
}

// Example 2: Constraint-based Feasibility Checking
async function constraintExample() {
  console.log('\n=== Example 2: Constraint-based Checking ===\n');

  // Create world state
  const worldState: WorldState = {
    id: 'world-1',
    entities: new Map([
      ['user-1', { id: 'user-1', type: 'user', properties: { role: 'viewer' } }],
    ]),
    relationships: [],
    constraints: [],
    timestamp: new Date(),
  };

  // Create constraint engine with hard constraints
  const constraintEngine = new ConstraintEngine();

  const noDeleteConstraint: HardConstraint = {
    id: 'no-delete-for-viewers',
    description: 'Viewers cannot delete data',
    category: 'policy',
    severity: 'hard',
    predicate: (state, action) => {
      // Block delete operations for viewer users
      const user = state.entities.get('user-1');
      if (user?.properties.role === 'viewer' && action?.includes('delete')) {
        return false;
      }
      return true;
    },
    violationMessage: 'Viewers are not allowed to delete data',
  };

  constraintEngine.addHardConstraint(noDeleteConstraint);

  // Create tool registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerTool({
    name: 'delete-tool',
    capabilities: ['delete-data'],
    available: true,
    riskLevel: 'HIGH',
  });

  // Create feasibility checker with constraints
  const checker = new FeasibilityChecker(toolRegistry, constraintEngine, worldState);

  // Try to delete data (should fail for viewers)
  const deleteTask: TaskSpec = {
    id: 'task-delete',
    name: 'Delete Data',
    type: 'action',
    toolName: 'delete-tool',
    riskTier: 'HIGH',
  };

  const result = await checker.checkFeasibility(deleteTask);

  console.log('Delete Task Feasibility:');
  console.log('  Feasible:', result.feasible);
  console.log('  Reasons:', result.reasons);
}

// Example 3: Integration with Workflow Orchestrator
async function orchestratorIntegrationExample() {
  console.log('\n=== Example 3: Orchestrator Integration ===\n');

  // Setup tool registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerTool({
    name: 'api-call-tool',
    capabilities: ['http-client'],
    available: true,
    riskLevel: 'LOW',
  });

  // Create feasibility checker
  const feasibilityChecker = new FeasibilityChecker(toolRegistry);

  // Create orchestrator with feasibility checker
  const stateStore = new InMemoryStateStore();
  const eventLog = new InMemoryEventLog();
  const executor: TaskExecutor = {
    execute: async (task: TaskSpec) => {
      console.log(`  Executing task: ${task.name}`);
      return { result: 'success' };
    },
  };

  const orchestrator = new WorkflowOrchestrator(
    stateStore,
    executor,
    eventLog,
    undefined, // compensationExecutor
    undefined, // worldStateStore
    undefined, // memoryAPI
    undefined, // crvGate
    undefined, // policyGuard
    undefined, // principal
    undefined, // telemetry
    undefined, // faultInjector
    undefined, // hypothesisManager
    undefined, // sandboxIntegration
    feasibilityChecker
  );

  // Define workflow
  const workflow: WorkflowSpec = {
    id: 'example-workflow',
    name: 'Example Workflow with Feasibility Checks',
    tasks: [
      {
        id: 'task-1',
        name: 'Call API',
        type: 'action',
        toolName: 'api-call-tool',
        riskTier: 'LOW',
      },
      {
        id: 'task-2',
        name: 'Call Unavailable Tool',
        type: 'action',
        toolName: 'unavailable-tool',
        riskTier: 'LOW',
      },
    ],
    dependencies: new Map([['task-2', ['task-1']]]),
  };

  // Execute workflow
  try {
    const result = await orchestrator.executeWorkflow(workflow);
    console.log('Workflow Status:', result.status);
  } catch (error) {
    console.log('Workflow Failed:', error instanceof Error ? error.message : error);
  }

  // Check events
  const events = await eventLog.read('example-workflow');
  const feasibilityEvents = events.filter(
    (e) => e.metadata?.feasibilityCheck
  );
  
  console.log('\nFeasibility Check Events:');
  feasibilityEvents.forEach((e) => {
    console.log(`  Task ${e.taskId}:`);
    console.log(`    Feasible: ${e.metadata?.feasibilityCheck?.feasible}`);
    console.log(`    Reasons: ${e.metadata?.feasibilityCheck?.reasons.join(', ')}`);
  });
}

// Example 4: Risk Tier Validation
async function riskTierExample() {
  console.log('\n=== Example 4: Risk Tier Validation ===\n');

  const toolRegistry = new ToolRegistry();

  // Register a high-risk tool
  toolRegistry.registerTool({
    name: 'payment-processor',
    capabilities: ['payment-processing', 'transaction-handling'],
    available: true,
    riskLevel: 'CRITICAL',
  });

  const checker = new FeasibilityChecker(toolRegistry);

  // Try to use high-risk tool in low-risk context (should fail)
  const lowRiskTask: TaskSpec = {
    id: 'task-payment',
    name: 'Process Payment',
    type: 'action',
    toolName: 'payment-processor',
    riskTier: 'LOW', // Low risk tier but tool is CRITICAL
  };

  const result1 = await checker.checkFeasibility(lowRiskTask);
  console.log('Low Risk Task with Critical Tool:');
  console.log('  Feasible:', result1.feasible);
  console.log('  Reasons:', result1.reasons);

  // Use high-risk tool in appropriate context (should succeed)
  const highRiskTask: TaskSpec = {
    id: 'task-payment-2',
    name: 'Process Payment (Authorized)',
    type: 'action',
    toolName: 'payment-processor',
    riskTier: 'CRITICAL',
  };

  const result2 = await checker.checkFeasibility(highRiskTask);
  console.log('\nCritical Risk Task with Critical Tool:');
  console.log('  Feasible:', result2.feasible);
}

// Run all examples
async function main() {
  try {
    await basicExample();
    await constraintExample();
    await orchestratorIntegrationExample();
    await riskTierExample();
    
    console.log('\n=== All Examples Completed ===\n');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { basicExample, constraintExample, orchestratorIntegrationExample, riskTierExample };
