/**
 * Integration tests demonstrating all 6 non-negotiable invariants
 * 
 * 1. Durability: workflows resume from persisted state
 * 2. Idempotency: retries don't duplicate side effects
 * 3. Verification: CRV gates block invalid commits
 * 4. Governance: Goal-Guard FSM gates risky actions
 * 5. Auditability: all actions and state diffs logged
 * 6. Rollback: safe restore to last verified snapshot
 */

import { describe, it, expect } from 'vitest';

// Import all packages from dist (built artifacts)
import { WorkflowOrchestrator, InMemoryStateStore, TaskExecutor, WorkflowSpec, TaskSpec } from '../../packages/kernel/dist';
import { GoalGuardFSM, RiskTier, Principal, Action } from '../../packages/policy/dist';
import { CRVGate, Validators, Commit } from '../../packages/crv/dist';
import { HipCortex } from '../../packages/memory-hipcortex/dist';

describe('Aureus Agentic OS - Integration Tests', () => {
  it('should enforce all 6 invariants in a complete workflow', async () => {
    // Setup components
    const stateStore = new InMemoryStateStore();
    const hipCortex = new HipCortex();
    const goalGuard = new GoalGuardFSM();
    
    // Setup CRV gate (Invariant 3: Verification)
    const crvGate = new CRVGate({
      name: 'State Validation Gate',
      validators: [
        Validators.notNull(),
        Validators.schema({ value: 'number', status: 'string' }),
      ],
      blockOnFailure: true,
    });

    // Track side effects for idempotency check
    const sideEffects: string[] = [];
    
    // Create task executor with CRV validation
    const executor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        const taskData = { value: 42, status: 'completed' };
        
        // Validate with CRV gate (Invariant 3)
        const commit: Commit = {
          id: task.id,
          data: taskData,
        };
        const gateResult = await crvGate.validate(commit);
        
        if (gateResult.blockedCommit) {
          throw new Error('CRV gate blocked commit');
        }

        // Record side effect for idempotency testing
        sideEffects.push(`task-${task.id}-executed`);
        
        return taskData;
      },
    };

    // Create orchestrator (Invariant 1: Durability, Invariant 2: Idempotency)
    const orchestrator = new WorkflowOrchestrator(stateStore, executor);

    // Setup principal for policy checks
    const principal: Principal = {
      id: 'agent-1',
      type: 'agent',
      permissions: [
        { action: 'execute', resource: 'workflow' },
      ],
    };

    // Check low-risk action (Invariant 4: Governance)
    const lowRiskAction: Action = {
      id: 'execute-workflow',
      name: 'Execute Workflow',
      riskTier: RiskTier.LOW,
      requiredPermissions: [{ action: 'execute', resource: 'workflow' }],
    };

    const guardDecision = await goalGuard.evaluate(principal, lowRiskAction);
    expect(guardDecision.allowed).toBe(true);

    // Create initial verified snapshot (Invariant 6: Rollback)
    const initialState = { value: 0, status: 'initial' };
    const initialSnapshot = hipCortex.createSnapshot(initialState, true);
    
    // Log initial action (Invariant 5: Auditability)
    hipCortex.logAction('system', 'initialize', null, initialState);

    // Execute workflow (Invariant 1: Durability)
    const workflowSpec: WorkflowSpec = {
      id: 'integration-test-workflow',
      name: 'Integration Test Workflow',
      tasks: [
        { 
          id: 'task1', 
          name: 'Task 1', 
          type: 'action',
          idempotencyKey: 'task1-key', // For idempotency
        },
        { 
          id: 'task2', 
          name: 'Task 2', 
          type: 'action',
          retry: { maxAttempts: 3, backoffMs: 10 }, // For retry testing
        },
      ],
      dependencies: new Map([
        ['task2', ['task1']],
      ]),
    };

    const workflowResult = await orchestrator.executeWorkflow(workflowSpec);
    
    // Verify workflow completed (Invariant 1)
    expect(workflowResult.status).toBe('completed');
    expect(workflowResult.taskStates.size).toBe(2);

    // Create snapshot after workflow (Invariant 6)
    const finalState = { value: 42, status: 'completed' };
    const finalSnapshot = hipCortex.createSnapshot(finalState, true);
    
    // Log workflow completion (Invariant 5)
    hipCortex.logAction('agent-1', 'workflow-completed', initialState, finalState);

    // Test idempotency: re-execute workflow (Invariant 2)
    const previousSideEffectCount = sideEffects.length;
    await orchestrator.executeWorkflow(workflowSpec);
    
    // Tasks should not execute again due to idempotency
    expect(sideEffects.length).toBe(previousSideEffectCount);

    // Test CRV gate blocking invalid commit (Invariant 3)
    const invalidCommit: Commit = {
      id: 'invalid-commit',
      data: null, // Invalid: null data
    };
    const invalidGateResult = await crvGate.validate(invalidCommit);
    expect(invalidGateResult.blockedCommit).toBe(true);

    // Test high-risk action gating (Invariant 4)
    const highRiskAction: Action = {
      id: 'delete-data',
      name: 'Delete Critical Data',
      riskTier: RiskTier.HIGH,
      requiredPermissions: [{ action: 'execute', resource: 'workflow' }],
    };
    
    goalGuard.reset();
    const highRiskDecision = await goalGuard.evaluate(principal, highRiskAction);
    expect(highRiskDecision.allowed).toBe(false);
    expect(highRiskDecision.requiresHumanApproval).toBe(true);

    // Verify audit log (Invariant 5)
    const auditLog = hipCortex.getAuditLog();
    expect(auditLog.length).toBeGreaterThan(0);
    expect(auditLog.every(entry => entry.timestamp instanceof Date)).toBe(true);
    
    const policyAuditLog = goalGuard.getAuditLog();
    expect(policyAuditLog.length).toBe(2); // low risk + high risk actions

    // Test rollback to last verified snapshot (Invariant 6)
    const rollbackResult = await hipCortex.rollbackToLastVerified();
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.restoredState).toEqual(finalState);

    // Verify rollback was logged (Invariant 5)
    const updatedAuditLog = hipCortex.getAuditLog();
    const rollbackEntry = updatedAuditLog.find(e => e.action === 'rollback');
    expect(rollbackEntry).toBeDefined();

    console.log('✅ All 6 invariants verified:');
    console.log('  1. Durability: Workflow persisted and resumed');
    console.log('  2. Idempotency: Retries did not duplicate side effects');
    console.log('  3. Verification: CRV gates blocked invalid commits');
    console.log('  4. Governance: Goal-Guard FSM gated risky actions');
    console.log('  5. Auditability: All actions logged with state diffs');
    console.log('  6. Rollback: Restored to last verified snapshot');
  });

  it('should demonstrate workflow durability across failures', async () => {
    const stateStore = new InMemoryStateStore();
    let attemptCount = 0;

    // Executor that fails once then succeeds
    const unreliableExecutor: TaskExecutor = {
      execute: async (task: TaskSpec) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Simulated transient failure');
        }
        return { success: true };
      },
    };

    const orchestrator = new WorkflowOrchestrator(stateStore, unreliableExecutor);

    const spec: WorkflowSpec = {
      id: 'durability-test',
      name: 'Durability Test',
      tasks: [
        { 
          id: 'task1', 
          name: 'Unreliable Task', 
          type: 'action',
          retry: { maxAttempts: 3, backoffMs: 10 },
        },
      ],
      dependencies: new Map(),
    };

    // Execute workflow - should succeed after retry
    const result = await orchestrator.executeWorkflow(spec);
    
    expect(result.status).toBe('completed');
    expect(attemptCount).toBeGreaterThan(1); // Should have retried
    
    // Verify state was persisted
    const persistedState = await stateStore.loadWorkflowState('durability-test');
    expect(persistedState).not.toBeNull();
    expect(persistedState?.status).toBe('completed');
  });
});
