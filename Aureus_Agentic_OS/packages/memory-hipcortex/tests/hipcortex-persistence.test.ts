import { describe, it, expect, beforeEach } from 'vitest';
import { HipCortex } from '../src/hipcortex';
import { 
  InMemorySnapshotPersistence,
  InMemoryAuditLogPersistence,
} from '../src/persistence-implementations';
import { Snapshot, AuditLogEntry } from '../src/types';

describe('HipCortex Persistence', () => {
  describe('with SnapshotPersistence', () => {
    let hipCortex: HipCortex;
    let snapshotPersistence: InMemorySnapshotPersistence;

    beforeEach(() => {
      snapshotPersistence = new InMemorySnapshotPersistence();
      hipCortex = new HipCortex({ snapshotPersistence });
    });

    it('should persist snapshots when created', async () => {
      const state = { value: 42 };
      const snapshot = hipCortex.createSnapshot(state, true);

      // Give async persistence time to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify snapshot was persisted
      const persisted = await snapshotPersistence.load(snapshot.id);
      expect(persisted).toBeDefined();
      expect(persisted?.id).toBe(snapshot.id);
      expect(persisted?.state).toEqual(state);
      expect(persisted?.verified).toBe(true);
    });

    it('should load all persisted snapshots on startup', async () => {
      // Create snapshots
      const state1 = { value: 1 };
      const state2 = { value: 2 };
      hipCortex.createSnapshot(state1, true);
      hipCortex.createSnapshot(state2, false);

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create new instance with same persistence layer
      const hipCortex2 = new HipCortex({ snapshotPersistence });
      await hipCortex2.loadPersistedState();

      // Verify snapshots were loaded
      const snapshots = hipCortex2.getVerifiedSnapshots();
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
    });

    it('should track last verified snapshot after loading', async () => {
      // Create verified snapshot
      const state = { value: 100 };
      const snapshot = hipCortex.createSnapshot(state, true);

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create new instance and load
      const hipCortex2 = new HipCortex({ snapshotPersistence });
      await hipCortex2.loadPersistedState();

      // Should be able to rollback to loaded verified snapshot
      const state2 = { value: 200 };
      hipCortex2.createSnapshot(state2, false);
      
      const result = await hipCortex2.rollbackToLastVerified();
      expect(result.success).toBe(true);
    });

    it('should not load state twice', async () => {
      hipCortex.createSnapshot({ value: 1 }, true);
      await new Promise(resolve => setTimeout(resolve, 50));

      // Load once
      await hipCortex.loadPersistedState();

      // Load again - should not throw or duplicate
      await hipCortex.loadPersistedState();
      
      // Verify no duplication occurred
      const snapshots = Array.from((hipCortex as any).snapshots.values());
      const uniqueIds = new Set(snapshots.map((s: Snapshot) => s.id));
      expect(uniqueIds.size).toBe(snapshots.length);
    });
  });

  describe('with AuditLogPersistence', () => {
    let hipCortex: HipCortex;
    let auditLogPersistence: InMemoryAuditLogPersistence;

    beforeEach(() => {
      auditLogPersistence = new InMemoryAuditLogPersistence();
      hipCortex = new HipCortex({ auditLogPersistence });
    });

    it('should persist audit log entries when created', async () => {
      const stateBefore = { value: 10 };
      const stateAfter = { value: 20 };
      
      hipCortex.logAction('agent-1', 'update', stateBefore, stateAfter);

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify entry was persisted
      const entries = await auditLogPersistence.loadAll();
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries[0].actor).toBe('agent-1');
      expect(entries[0].action).toBe('update');
    });

    it('should load persisted audit log entries on startup', async () => {
      // Create audit log entries
      hipCortex.logAction('agent-1', 'action-1', {}, {});
      hipCortex.logAction('agent-2', 'action-2', {}, {});

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create new instance and load
      const hipCortex2 = new HipCortex({ auditLogPersistence });
      await hipCortex2.loadPersistedState();

      // Verify entries were loaded
      const auditLog = hipCortex2.getAuditLog();
      expect(auditLog.length).toBeGreaterThanOrEqual(2);
    });

    it('should verify SHA-256 integrity on load', async () => {
      // Create audit log entry
      const entry = hipCortex.logAction('agent-1', 'test', { a: 1 }, { a: 2 });

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify integrity
      const entries = await auditLogPersistence.loadAll();
      const verification = await auditLogPersistence.verifyIntegrity(entries);
      
      expect(verification.valid).toBe(true);
      expect(verification.invalidEntries).toHaveLength(0);
    });

    it('should detect tampered audit log entries', async () => {
      // Create audit log entry
      hipCortex.logAction('agent-1', 'test', { a: 1 }, { a: 2 });

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 50));

      // Get persisted entries and tamper with one
      const entries = await auditLogPersistence.loadAll();
      if (entries.length > 0) {
        (entries[0] as any).stateAfter = { a: 999 }; // Tamper with data
      }

      // Verify integrity - should detect tampering
      const verification = await auditLogPersistence.verifyIntegrity(entries);
      
      expect(verification.valid).toBe(false);
      expect(verification.invalidEntries.length).toBeGreaterThan(0);
    });

    it('should throw error when loading corrupted audit log', async () => {
      // Create audit log entry
      hipCortex.logAction('agent-1', 'test', { a: 1 }, { a: 2 });

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 50));

      // Tamper with persisted data
      const entries = await auditLogPersistence.loadAll();
      if (entries.length > 0) {
        (entries[0] as any).actor = 'tampered-actor';
      }

      // Save the tampered entry back
      await auditLogPersistence.save(entries[0]);

      // Try to load with new instance - should throw error
      const hipCortex2 = new HipCortex({ auditLogPersistence });
      
      await expect(hipCortex2.loadPersistedState()).rejects.toThrow(
        'Audit log integrity check failed'
      );
    });

    it('should compute contentHash for audit log entries', () => {
      const entry = hipCortex.logAction(
        'agent-1',
        'test-action',
        { before: 1 },
        { after: 2 }
      );

      expect(entry.contentHash).toBeDefined();
      expect(entry.contentHash).toHaveLength(64); // SHA-256 hex string length
    });
  });

  describe('Combined Persistence', () => {
    it('should support full persistence workflow', async () => {
      const snapshotPersistence = new InMemorySnapshotPersistence();
      const auditLogPersistence = new InMemoryAuditLogPersistence();

      // Create instance with persistence
      const hipCortex = new HipCortex({
        snapshotPersistence,
        auditLogPersistence,
      });

      // Create some data
      hipCortex.createSnapshot({ state: 'initial' }, true);
      hipCortex.logAction('system', 'start', null, { state: 'initial' });

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 50));

      // Create new instance with same persistence layers
      const hipCortex2 = new HipCortex({
        snapshotPersistence,
        auditLogPersistence,
      });

      // Load persisted state
      await hipCortex2.loadPersistedState();

      // Verify state was restored
      const snapshots = hipCortex2.getVerifiedSnapshots();
      expect(snapshots.length).toBeGreaterThanOrEqual(1);

      const auditLog = hipCortex2.getAuditLog();
      expect(auditLog.length).toBeGreaterThanOrEqual(1);
    });
  });
});
