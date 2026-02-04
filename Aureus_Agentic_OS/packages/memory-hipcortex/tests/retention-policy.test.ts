import { describe, it, expect, beforeEach } from 'vitest';
import { RetentionPolicyManager, RetentionTier, MemoryEntry } from '../src';

describe('RetentionPolicyManager', () => {
  let manager: RetentionPolicyManager;

  beforeEach(() => {
    manager = new RetentionPolicyManager();
  });

  describe('trackEntry', () => {
    it('should track a new entry with default HOT tier', () => {
      const entryId = 'test-entry-1';
      manager.trackEntry(entryId);

      const metadata = manager.getMetadata(entryId);
      expect(metadata).toBeDefined();
      expect(metadata?.tier).toBe(RetentionTier.HOT);
      expect(metadata?.accessCount).toBe(0);
    });

    it('should track entry with custom tier', () => {
      const entryId = 'test-entry-2';
      manager.trackEntry(entryId, RetentionTier.WARM);

      const metadata = manager.getMetadata(entryId);
      expect(metadata?.tier).toBe(RetentionTier.WARM);
    });
  });

  describe('recordAccess', () => {
    it('should increment access count', () => {
      const entryId = 'test-entry-3';
      manager.trackEntry(entryId);

      manager.recordAccess(entryId);
      manager.recordAccess(entryId);

      const metadata = manager.getMetadata(entryId);
      expect(metadata?.accessCount).toBe(2);
    });

    it('should update lastAccessed timestamp', () => {
      const entryId = 'test-entry-4';
      manager.trackEntry(entryId);

      const beforeAccess = new Date();
      manager.recordAccess(entryId);
      const metadata = manager.getMetadata(entryId);

      expect(metadata?.lastAccessed.getTime()).toBeGreaterThanOrEqual(beforeAccess.getTime());
    });
  });

  describe('evaluateEntry', () => {
    it('should keep entry in HOT tier if recently created', () => {
      const entryId = 'test-entry-5';
      manager.trackEntry(entryId);

      const entry: MemoryEntry = {
        id: entryId,
        content: { data: 'test' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(), // Recent
        },
      };

      const decision = manager.evaluateEntry(entryId, entry);
      expect(decision.action).toBe('keep');
      expect(decision.targetTier).toBe(RetentionTier.HOT);
    });

    it('should transition to WARM tier after age threshold', () => {
      const entryId = 'test-entry-6';
      manager.trackEntry(entryId);

      // Create entry from 2 days ago (exceeds default 24h HOT threshold)
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const entry: MemoryEntry = {
        id: entryId,
        content: { data: 'test' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: twoDaysAgo,
        },
      };

      const decision = manager.evaluateEntry(entryId, entry);
      expect(decision.action).toBe('summarize');
      expect(decision.targetTier).toBe(RetentionTier.WARM);
    });

    it('should keep entry in tier if access count is high', () => {
      const entryId = 'test-entry-7';
      manager.trackEntry(entryId);

      // Access entry multiple times
      for (let i = 0; i < 15; i++) {
        manager.recordAccess(entryId);
      }

      // Even with old timestamp, high access should keep it
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const entry: MemoryEntry = {
        id: entryId,
        content: { data: 'test' },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: oldDate,
        },
      };

      const decision = manager.evaluateEntry(entryId, entry);
      expect(decision.action).toBe('keep');
      expect(decision.currentTier).toBe(RetentionTier.HOT);
    });
  });

  describe('transitionEntry', () => {
    it('should transition entry to target tier', () => {
      const entryId = 'test-entry-8';
      manager.trackEntry(entryId);

      manager.transitionEntry(entryId, RetentionTier.COLD);

      const metadata = manager.getMetadata(entryId);
      expect(metadata?.tier).toBe(RetentionTier.COLD);
      expect(metadata?.transitionedAt).toBeDefined();
    });
  });

  describe('getEntriesByTier', () => {
    it('should return entries in specified tier', () => {
      manager.trackEntry('entry-1', RetentionTier.HOT);
      manager.trackEntry('entry-2', RetentionTier.HOT);
      manager.trackEntry('entry-3', RetentionTier.WARM);

      const hotEntries = manager.getEntriesByTier(RetentionTier.HOT);
      expect(hotEntries).toHaveLength(2);
      expect(hotEntries).toContain('entry-1');
      expect(hotEntries).toContain('entry-2');

      const warmEntries = manager.getEntriesByTier(RetentionTier.WARM);
      expect(warmEntries).toHaveLength(1);
      expect(warmEntries).toContain('entry-3');
    });
  });

  describe('getStats', () => {
    it('should return retention statistics', () => {
      manager.trackEntry('entry-1', RetentionTier.HOT);
      manager.trackEntry('entry-2', RetentionTier.HOT);
      manager.trackEntry('entry-3', RetentionTier.WARM);
      
      manager.recordAccess('entry-1');
      manager.recordAccess('entry-1');
      manager.recordAccess('entry-2');

      const stats = manager.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.byTier[RetentionTier.HOT]).toBe(2);
      expect(stats.byTier[RetentionTier.WARM]).toBe(1);
      expect(stats.avgAccessCount).toBe(1); // (2 + 1 + 0) / 3
    });
  });

  describe('setCompressionMetadata', () => {
    it('should store compression metadata', () => {
      const entryId = 'test-entry-9';
      manager.trackEntry(entryId);

      manager.setCompressionMetadata(entryId, 1000, 500, true);

      const metadata = manager.getMetadata(entryId);
      expect(metadata?.originalSize).toBe(1000);
      expect(metadata?.compressedSize).toBe(500);
      expect(metadata?.summarized).toBe(true);
    });
  });
});
