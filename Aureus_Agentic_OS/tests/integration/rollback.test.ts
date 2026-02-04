/**
 * Integration tests for snapshot/rollback functionality
 * Tests rollback after a failing workflow and policy approval for high-risk rollbacks
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import from dist (built artifacts)
import { 
  WorkflowOrchestrator, 
  InMemoryStateStore, 
  InMemoryEventLog,
  TaskExecutor, 
  WorkflowSpec, 
  TaskSpec,
  RollbackOrchestrator,
} from '../../packages/kernel/dist';
import { InMemoryStateStore as WorldStateStore } from '../../packages/world-model/dist';
import { SnapshotManager, MemoryAPI, MemoryEntry } from '../../packages/memory-hipcortex/dist';
import { GoalGuardFSM, RiskTier, Principal, Action } from '../../packages/policy/dist';

describe('Snapshot and Rollback Integration Tests', () => {
  let worldStateStore: WorldStateStore;
  let snapshotManager: SnapshotManager;
  let memoryAPI: MemoryAPI;
  let eventLog: InMemoryEventLog;
  let policyGuard: GoalGuardFSM;
  let rollbackOrchestrator: RollbackOrchestrator;

  beforeEach(() => {
    worldStateStore = new WorldStateStore();
    snapshotManager = new SnapshotManager();
    memoryAPI = new MemoryAPI();
    eventLog = new InMemoryEventLog();
    policyGuard = new GoalGuardFSM();
    rollbackOrchestrator = new RollbackOrchestrator(
      snapshotManager,
      worldStateStore,
      eventLog,
      memoryAPI,
      policyGuard
    );
  });

  it('should create snapshots with content-addressed hash (Merkle-like)', async () => {
    // Create some world state
    await worldStateStore.create('user:1', { name: 'Alice', age: 30 });
    await worldStateStore.create('user:2', { name: 'Bob', age: 25 });
    const worldSnapshot = await worldStateStore.snapshot();

    // Create memory entries
    const memoryEntries: MemoryEntry[] = [
      {
        id: 'mem-1',
        content: { action: 'created_user', userId: 'user:1' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
        tags: ['user_creation'],
      },
      {
        id: 'mem-2',
        content: { action: 'created_user', userId: 'user:2' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
        tags: ['user_creation'],
      },
    ];

    // Create combined snapshot
    const snapshot = snapshotManager.createSnapshot(
      'task-1',
      'step-1',
      worldSnapshot,
      memoryEntries,
      true, // verified
      { description: 'Initial state' }
    );

    // Verify snapshot structure
    expect(snapshot.id).toContain('snapshot-');
    expect(snapshot.taskId).toBe('task-1');
    expect(snapshot.stepId).toBe('step-1');
    expect(snapshot.contentHash).toBeTruthy();
    expect(snapshot.merkleRoot).toBeTruthy();
    expect(snapshot.verified).toBe(true);
    expect(snapshot.worldStateSnapshot.entries.size).toBe(2);
    expect(snapshot.memoryPointers.length).toBe(2);

    // Verify integrity
    const isValid = snapshotManager.verifySnapshot(snapshot.id);
    expect(isValid).toBe(true);
  });

  it('should rollback after a failing workflow', async () => {
    // Setup initial state
    await worldStateStore.create('counter', { value: 0 });
    const initialSnapshot = await worldStateStore.snapshot();

    const initialMemoryEntries: MemoryEntry[] = [
      {
        id: 'mem-init',
        content: { message: 'Initial state' },
        type: 'snapshot',
        provenance: {
          task_id: 'workflow-1',
          step_id: 'init',
          timestamp: new Date(),
        },
      },
    ];

    // Create verified snapshot at initial state
    const snapshot1 = snapshotManager.createSnapshot(
      'workflow-1',
      'init',
      initialSnapshot,
      initialMemoryEntries,
      true, // verified
      { riskTier: 'LOW' }
    );

    // Simulate workflow execution - step 1 succeeds
    const counter1 = await worldStateStore.read('counter');
    await worldStateStore.update('counter', { value: 1 }, counter1!.version);
    const step1Snapshot = await worldStateStore.snapshot();

    const step1MemoryEntries: MemoryEntry[] = [
      {
        id: 'mem-step1',
        content: { message: 'Step 1 completed' },
        type: 'episodic_note',
        provenance: {
          task_id: 'workflow-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
        tags: ['workflow_step'],
      },
    ];

    const snapshot2 = snapshotManager.createSnapshot(
      'workflow-1',
      'step-1',
      step1Snapshot,
      step1MemoryEntries,
      true, // verified
      { riskTier: 'LOW' }
    );

    // Simulate workflow execution - step 2 fails
    const counter2 = await worldStateStore.read('counter');
    await worldStateStore.update('counter', { value: 2 }, counter2!.version);
    const step2Snapshot = await worldStateStore.snapshot();

    const step2MemoryEntries: MemoryEntry[] = [
      {
        id: 'mem-step2',
        content: { message: 'Step 2 failed', error: 'Database connection lost' },
        type: 'episodic_note',
        provenance: {
          task_id: 'workflow-1',
          step_id: 'step-2',
          timestamp: new Date(),
        },
        tags: ['workflow_step', 'error'],
      },
    ];

    const snapshot3 = snapshotManager.createSnapshot(
      'workflow-1',
      'step-2',
      step2Snapshot,
      step2MemoryEntries,
      false, // NOT verified due to failure
      { riskTier: 'MEDIUM' }
    );

    // Verify current state is corrupted (value = 2)
    const currentCounter = await worldStateStore.read('counter');
    expect(currentCounter!.value).toEqual({ value: 2 });

    // Create principal for rollback
    const principal: Principal = {
      id: 'admin-1',
      type: 'human',
      permissions: [
        { action: 'rollback', resource: 'workflow' },
      ],
    };

    // Rollback to last verified snapshot (snapshot2, after step-1)
    const rollbackResult = await rollbackOrchestrator.rollbackToLastVerified(
      'workflow-1',
      'admin-1',
      principal
    );

    // Verify rollback succeeded
    expect(rollbackResult.success).toBe(true);
    expect(rollbackResult.snapshotId).toBe(snapshot2.id);
    expect(rollbackResult.approvalRequired).toBe(false); // LOW risk

    // Verify state was restored to step-1 (value = 1)
    const restoredCounter = await worldStateStore.read('counter');
    expect(restoredCounter!.value).toEqual({ value: 1 });

    // Verify rollback events were logged
    const events = await eventLog.read('workflow-1');
    const rollbackEvents = events.filter(e => 
      e.type === 'ROLLBACK_INITIATED' || e.type === 'ROLLBACK_COMPLETED'
    );
    expect(rollbackEvents.length).toBeGreaterThan(0);
  });

  it('should require policy approval for HIGH risk rollbacks and reject without explicit approval', async () => {
    // Setup state with HIGH risk tier
    await worldStateStore.create('critical-data', { value: 'important' });
    const worldSnapshot = await worldStateStore.snapshot();

    const memoryEntries: MemoryEntry[] = [
      {
        id: 'mem-critical',
        content: { message: 'Critical operation' },
        type: 'snapshot',
        provenance: {
          task_id: 'critical-workflow',
          step_id: 'critical-step',
          timestamp: new Date(),
        },
        tags: ['critical'],
      },
    ];

    // Create snapshot with HIGH risk tier
    const snapshot = snapshotManager.createSnapshot(
      'critical-workflow',
      'critical-step',
      worldSnapshot,
      memoryEntries,
      true,
      { riskTier: 'HIGH' }
    );

    // Modify state
    const current = await worldStateStore.read('critical-data');
    await worldStateStore.update('critical-data', { value: 'modified' }, current!.version);

    // Create principal with permissions but as agent (not human)
    const principal: Principal = {
      id: 'operator-1',
      type: 'agent',  // Agent type - HIGH risk requires human
      permissions: [
        { action: 'rollback', resource: 'workflow' },
      ],
    };

    // Attempt rollback - should require approval and be rejected
    await expect(async () => {
      await rollbackOrchestrator.rollback(
        {
          taskId: 'critical-workflow',
          snapshotId: snapshot.id,
          requestedBy: 'operator-1',
          reason: 'Recovery from critical failure',
          riskTier: 'HIGH',
        },
        principal
      );
    }).rejects.toThrow('Rollback denied by policy');

    // Verify policy decision was logged
    const events = await eventLog.read('critical-workflow');
    const policyEvents = events.filter(e => e.type === 'ROLLBACK_POLICY_DECISION');
    expect(policyEvents.length).toBe(1);
    expect(policyEvents[0].metadata?.approved).toBe(false);
  });

  it('should deny rollback if policy rejects HIGH risk operation', async () => {
    // Setup state with CRITICAL risk tier
    await worldStateStore.create('critical-data', { value: 'important' });
    const worldSnapshot = await worldStateStore.snapshot();

    const memoryEntries: MemoryEntry[] = [
      {
        id: 'mem-critical',
        content: { message: 'Critical operation' },
        type: 'snapshot',
        provenance: {
          task_id: 'critical-workflow',
          step_id: 'critical-step',
          timestamp: new Date(),
        },
      },
    ];

    // Create snapshot with CRITICAL risk tier
    const snapshot = snapshotManager.createSnapshot(
      'critical-workflow',
      'critical-step',
      worldSnapshot,
      memoryEntries,
      true,
      { riskTier: 'CRITICAL' }
    );

    // Modify state
    const current = await worldStateStore.read('critical-data');
    await worldStateStore.update('critical-data', { value: 'modified' }, current!.version);

    // Create principal WITHOUT rollback permissions
    const principal: Principal = {
      id: 'unauthorized-user',
      type: 'agent',
      permissions: [
        { action: 'read', resource: 'workflow' },
      ],
    };

    // Attempt rollback - should be denied
    await expect(async () => {
      await rollbackOrchestrator.rollback(
        {
          taskId: 'critical-workflow',
          snapshotId: snapshot.id,
          requestedBy: 'unauthorized-user',
          reason: 'Unauthorized rollback attempt',
          riskTier: 'CRITICAL',
        },
        principal
      );
    }).rejects.toThrow('Rollback denied by policy');

    // Verify state was NOT modified
    const stillModified = await worldStateStore.read('critical-data');
    expect(stillModified!.value).toEqual({ value: 'modified' });

    // Verify policy denial was logged
    const events = await eventLog.read('critical-workflow');
    const policyEvents = events.filter(e => e.type === 'ROLLBACK_POLICY_DECISION');
    expect(policyEvents.length).toBe(1);
    expect(policyEvents[0].metadata?.approved).toBe(false);
  });

  it('should restore both world state and memory pointers during rollback', async () => {
    // Create initial state with multiple entities
    await worldStateStore.create('user:1', { name: 'Alice', balance: 100 });
    await worldStateStore.create('user:2', { name: 'Bob', balance: 200 });
    await worldStateStore.create('transaction:1', { from: 'user:1', to: 'user:2', amount: 50 });
    const initialSnapshot = await worldStateStore.snapshot();

    const memoryEntries: MemoryEntry[] = [
      {
        id: 'mem-1',
        content: { action: 'transfer_initiated', amount: 50 },
        type: 'episodic_note',
        provenance: {
          task_id: 'transaction-workflow',
          step_id: 'init',
          timestamp: new Date(),
        },
        tags: ['transaction'],
      },
      {
        id: 'mem-2',
        content: { action: 'balance_check', user: 'user:1', balance: 100 },
        type: 'artifact',
        provenance: {
          task_id: 'transaction-workflow',
          step_id: 'init',
          timestamp: new Date(),
        },
        tags: ['validation'],
      },
    ];

    const snapshot = snapshotManager.createSnapshot(
      'transaction-workflow',
      'init',
      initialSnapshot,
      memoryEntries,
      true,
      { riskTier: 'MEDIUM' }
    );

    // Modify state (simulate failed transaction)
    const user1 = await worldStateStore.read('user:1');
    await worldStateStore.update('user:1', { name: 'Alice', balance: 50 }, user1!.version);
    
    const user2 = await worldStateStore.read('user:2');
    await worldStateStore.update('user:2', { name: 'Bob', balance: 250 }, user2!.version);
    
    await worldStateStore.create('error:1', { message: 'Transaction failed mid-way' });

    // Create principal
    const principal: Principal = {
      id: 'admin',
      type: 'human',
      permissions: [
        { action: 'rollback', resource: 'workflow' },
      ],
    };

    // Rollback
    const result = await rollbackOrchestrator.rollback(
      {
        taskId: 'transaction-workflow',
        snapshotId: snapshot.id,
        requestedBy: 'admin',
        reason: 'Transaction failed',
      },
      principal
    );

    expect(result.success).toBe(true);

    // Verify world state was restored
    const restoredUser1 = await worldStateStore.read('user:1');
    expect(restoredUser1!.value).toEqual({ name: 'Alice', balance: 100 });

    const restoredUser2 = await worldStateStore.read('user:2');
    expect(restoredUser2!.value).toEqual({ name: 'Bob', balance: 200 });

    // Error entity should be removed
    const error = await worldStateStore.read('error:1');
    expect(error).toBeNull();

    // Verify memory pointers were recorded
    expect(result.restoredState.memoryPointers.length).toBe(2);
    expect(result.restoredState.memoryPointers[0].entryId).toBe('mem-1');
    expect(result.restoredState.memoryPointers[1].entryId).toBe('mem-2');
  });

  it('should track snapshot integrity with Merkle root verification', async () => {
    // Create state
    await worldStateStore.create('data', { value: 'test' });
    const worldSnapshot = await worldStateStore.snapshot();

    const memoryEntries: MemoryEntry[] = [
      {
        id: 'mem-1',
        content: { data: 'test' },
        type: 'snapshot',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
      },
    ];

    const snapshot = snapshotManager.createSnapshot(
      'task-1',
      'step-1',
      worldSnapshot,
      memoryEntries,
      true
    );

    // Verify integrity before any tampering
    expect(snapshotManager.verifySnapshot(snapshot.id)).toBe(true);

    // Get the snapshot and verify its Merkle root is computed correctly
    const retrievedSnapshot = snapshotManager.getSnapshot(snapshot.id);
    expect(retrievedSnapshot).toBeDefined();
    expect(retrievedSnapshot!.merkleRoot).toBe(retrievedSnapshot!.contentHash);
    expect(retrievedSnapshot!.merkleRoot.length).toBe(64); // SHA-256 hex length
  });
});
