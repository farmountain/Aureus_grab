import { describe, it, expect, beforeEach } from 'vitest';
import { HipCortex } from '../src';

describe('HipCortex', () => {
  let hipCortex: HipCortex;

  beforeEach(() => {
    hipCortex = new HipCortex();
  });

  it('should create snapshots', () => {
    const state = { value: 42, name: 'test' };
    const snapshot = hipCortex.createSnapshot(state, false);
    
    expect(snapshot.id).toBeDefined();
    expect(snapshot.state).toEqual(state);
    expect(snapshot.verified).toBe(false);
  });

  it('should create verified snapshots', () => {
    const state = { value: 42 };
    const snapshot = hipCortex.createSnapshot(state, true);
    
    expect(snapshot.verified).toBe(true);
  });

  it('should log actions with state diffs (invariant 5)', () => {
    const stateBefore = { value: 10 };
    const stateAfter = { value: 20 };
    
    const entry = hipCortex.logAction(
      'agent-1',
      'update-value',
      stateBefore,
      stateAfter
    );
    
    expect(entry.actor).toBe('agent-1');
    expect(entry.action).toBe('update-value');
    expect(entry.stateBefore).toEqual(stateBefore);
    expect(entry.stateAfter).toEqual(stateAfter);
    expect(entry.diff).toBeDefined();
  });

  it('should rollback to last verified snapshot (invariant 6)', async () => {
    // Create initial verified snapshot
    const state1 = { value: 10 };
    hipCortex.createSnapshot(state1, true);
    
    // Create unverified snapshot
    const state2 = { value: 20 };
    hipCortex.createSnapshot(state2, false);
    
    // Rollback
    const result = await hipCortex.rollbackToLastVerified();
    
    expect(result.success).toBe(true);
    expect(result.restoredState).toEqual(state1);
    expect(hipCortex.getCurrentState()).toEqual(state1);
  });

  it('should rollback to specific snapshot', async () => {
    const state1 = { value: 10 };
    const snapshot1 = hipCortex.createSnapshot(state1, true);
    
    const state2 = { value: 20 };
    hipCortex.createSnapshot(state2, true);
    
    // Rollback to first snapshot
    const result = await hipCortex.rollbackToSnapshot(snapshot1.id);
    
    expect(result.success).toBe(true);
    expect(result.snapshotId).toBe(snapshot1.id);
    expect(hipCortex.getCurrentState()).toEqual(state1);
  });

  it('should fail rollback when no verified snapshot exists', async () => {
    const state = { value: 42 };
    hipCortex.createSnapshot(state, false);
    
    await expect(hipCortex.rollbackToLastVerified()).rejects.toThrow(
      'No verified snapshot available for rollback'
    );
  });

  it('should query snapshots by time range', async () => {
    const startTime = new Date();
    
    hipCortex.createSnapshot({ value: 1 }, true);
    await new Promise(resolve => setTimeout(resolve, 10));
    hipCortex.createSnapshot({ value: 2 }, true);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const endTime = new Date();
    
    const snapshots = hipCortex.querySnapshotsByTimeRange(startTime, endTime);
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
  });

  it('should query audit log by actor', () => {
    hipCortex.logAction('agent-1', 'action-1', {}, {});
    hipCortex.logAction('agent-2', 'action-2', {}, {});
    hipCortex.logAction('agent-1', 'action-3', {}, {});
    
    const agent1Logs = hipCortex.queryAuditLogByActor('agent-1');
    expect(agent1Logs).toHaveLength(2);
    expect(agent1Logs.every(log => log.actor === 'agent-1')).toBe(true);
  });

  it('should query audit log by time range', async () => {
    const startTime = new Date();
    
    hipCortex.logAction('agent-1', 'action-1', {}, {});
    await new Promise(resolve => setTimeout(resolve, 10));
    hipCortex.logAction('agent-1', 'action-2', {}, {});
    
    const endTime = new Date();
    
    const logs = hipCortex.queryAuditLogByTimeRange(startTime, endTime);
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it('should get all verified snapshots', () => {
    hipCortex.createSnapshot({ value: 1 }, true);
    hipCortex.createSnapshot({ value: 2 }, false);
    hipCortex.createSnapshot({ value: 3 }, true);
    
    const verified = hipCortex.getVerifiedSnapshots();
    expect(verified).toHaveLength(2);
    expect(verified.every(s => s.verified)).toBe(true);
  });

  it('should maintain audit trail for rollbacks', async () => {
    const state1 = { value: 10 };
    hipCortex.createSnapshot(state1, true);
    
    const state2 = { value: 20 };
    hipCortex.createSnapshot(state2, false);
    
    await hipCortex.rollbackToLastVerified();
    
    const auditLog = hipCortex.getAuditLog();
    const rollbackEntry = auditLog.find(e => e.action === 'rollback');
    
    expect(rollbackEntry).toBeDefined();
    expect(rollbackEntry?.actor).toBe('system');
  });
});
