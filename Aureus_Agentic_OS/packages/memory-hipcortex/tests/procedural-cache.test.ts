import { describe, it, expect, beforeEach } from 'vitest';
import { ProceduralCache, ProceduralEntry } from '../src/procedural-cache';
import { Provenance } from '../src';

describe('ProceduralCache', () => {
  let cache: ProceduralCache;

  beforeEach(() => {
    cache = new ProceduralCache();
  });

  describe('store and get', () => {
    it('should store and retrieve an entry', async () => {
      const entry: ProceduralEntry = {
        id: 'proc-1',
        type: 'fix',
        context: 'timeout-error',
        knowledge: { solution: 'increase timeout' },
        confidence: 0.9,
        usageCount: 0,
        timestamp: new Date(),
      };

      await cache.store(entry);
      const retrieved = await cache.get('proc-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('proc-1');
      expect(retrieved?.type).toBe('fix');
      expect(retrieved?.context).toBe('timeout-error');
    });

    it('should initialize usage tracking for new entries', async () => {
      const entry: ProceduralEntry = {
        id: 'proc-2',
        type: 'workflow',
        context: 'data-processing',
        knowledge: { steps: ['validate', 'transform', 'load'] },
        confidence: 0.85,
        usageCount: 0,
        timestamp: new Date(),
      };

      await cache.store(entry);
      const retrieved = await cache.get('proc-2');

      expect(retrieved?.usageCount).toBe(0);
      expect(retrieved?.successRate).toBe(1.0);
    });

    it('should return null for non-existent entry', async () => {
      const retrieved = await cache.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should store entry with provenance', async () => {
      const entry: ProceduralEntry = {
        id: 'proc-3',
        type: 'pattern',
        context: 'retry-logic',
        knowledge: { pattern: 'exponential-backoff' },
        confidence: 0.95,
        usageCount: 0,
        timestamp: new Date(),
        provenance: {
          task_id: 'task-1',
          step_id: 'step-1',
          timestamp: new Date(),
        },
      };

      await cache.store(entry);
      const retrieved = await cache.get('proc-3');

      expect(retrieved?.provenance).toBeDefined();
      expect(retrieved?.provenance?.task_id).toBe('task-1');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await cache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'timeout-error',
        knowledge: { solution: 'increase timeout' },
        confidence: 0.9,
        successRate: 0.95,
        usageCount: 20,
        timestamp: new Date('2024-01-01'),
      });

      await cache.store({
        id: 'fix-2',
        type: 'fix',
        context: 'timeout-error',
        knowledge: { solution: 'retry with backoff' },
        confidence: 0.85,
        successRate: 0.80,
        usageCount: 15,
        timestamp: new Date('2024-01-02'),
      });

      await cache.store({
        id: 'workflow-1',
        type: 'workflow',
        context: 'data-processing',
        knowledge: { steps: ['validate', 'transform'] },
        confidence: 0.88,
        successRate: 0.92,
        usageCount: 10,
        timestamp: new Date('2024-01-03'),
      });
    });

    it('should query by type', async () => {
      const results = await cache.query({ type: 'fix' });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.type === 'fix')).toBe(true);
    });

    it('should query by context', async () => {
      const results = await cache.query({ context: 'timeout-error' });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.context === 'timeout-error')).toBe(true);
    });

    it('should query by minimum confidence', async () => {
      const results = await cache.query({ minConfidence: 0.88 });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.confidence >= 0.88)).toBe(true);
    });

    it('should query by minimum success rate', async () => {
      const results = await cache.query({ minSuccessRate: 0.9 });
      expect(results).toHaveLength(2);
      expect(results.every(e => (e.successRate || 0) >= 0.9)).toBe(true);
    });

    it('should sort by confidence', async () => {
      const results = await cache.query({ sortBy: 'confidence' });
      expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
    });

    it('should sort by success rate', async () => {
      const results = await cache.query({ sortBy: 'successRate' });
      expect(results[0].successRate || 0).toBeGreaterThanOrEqual(results[1].successRate || 0);
    });

    it('should sort by usage count', async () => {
      const results = await cache.query({ sortBy: 'usageCount' });
      expect(results[0].usageCount).toBeGreaterThanOrEqual(results[1].usageCount);
    });

    it('should limit results', async () => {
      const results = await cache.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should query with multiple filters', async () => {
      const results = await cache.query({
        type: 'fix',
        context: 'timeout-error',
        minConfidence: 0.85,
        sortBy: 'successRate',
        limit: 1,
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('fix-1');
    });
  });

  describe('usage tracking', () => {
    beforeEach(async () => {
      await cache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'test-context',
        knowledge: { solution: 'test' },
        confidence: 0.8,
        usageCount: 0,
        timestamp: new Date(),
      });
    });

    it('should record successful usage', async () => {
      await cache.recordUsage('fix-1', true);
      const entry = await cache.get('fix-1');

      expect(entry?.usageCount).toBe(1);
      expect(entry?.successRate).toBe(1.0);
      expect(entry?.lastUsed).toBeDefined();
    });

    it('should record failed usage', async () => {
      await cache.recordUsage('fix-1', false);
      const entry = await cache.get('fix-1');

      expect(entry?.usageCount).toBe(1);
      expect(entry?.successRate).toBe(0.0);
    });

    it('should update success rate over multiple uses', async () => {
      await cache.recordUsage('fix-1', true);
      await cache.recordUsage('fix-1', true);
      await cache.recordUsage('fix-1', false);
      
      const entry = await cache.get('fix-1');
      expect(entry?.usageCount).toBe(3);
      expect(entry?.successRate).toBeCloseTo(2/3, 2);
    });

    it('should increase confidence with high success rate', async () => {
      const initialConfidence = 0.8;
      
      // Record 5 successful uses
      for (let i = 0; i < 5; i++) {
        await cache.recordUsage('fix-1', true);
      }
      
      const entry = await cache.get('fix-1');
      expect(entry?.confidence).toBeGreaterThan(initialConfidence);
    });

    it('should decrease confidence with low success rate', async () => {
      const initialConfidence = 0.8;
      
      // Record failures
      await cache.recordUsage('fix-1', false);
      await cache.recordUsage('fix-1', false);
      
      const entry = await cache.get('fix-1');
      expect(entry?.confidence).toBeLessThan(initialConfidence);
    });

    it('should throw error for non-existent entry', async () => {
      await expect(
        cache.recordUsage('non-existent', true)
      ).rejects.toThrow('Entry non-existent not found');
    });

    it('should get usage history for an entry', async () => {
      await cache.recordUsage('fix-1', true, { attempt: 1 });
      await cache.recordUsage('fix-1', false, { attempt: 2 });
      
      const history = cache.getUsageHistory('fix-1');
      expect(history).toHaveLength(2);
      expect(history[0].success).toBe(true);
      expect(history[1].success).toBe(false);
    });
  });

  describe('getBestMatch', () => {
    beforeEach(async () => {
      await cache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'timeout-error',
        knowledge: { solution: 'increase timeout' },
        confidence: 0.9,
        successRate: 0.95,
        usageCount: 20,
        timestamp: new Date(),
      });

      await cache.store({
        id: 'fix-2',
        type: 'fix',
        context: 'timeout-error',
        knowledge: { solution: 'retry with backoff' },
        confidence: 0.85,
        successRate: 0.80,
        usageCount: 15,
        timestamp: new Date(),
      });

      await cache.store({
        id: 'workflow-1',
        type: 'workflow',
        context: 'timeout-error',
        knowledge: { steps: ['check', 'retry'] },
        confidence: 0.88,
        successRate: 0.85,
        usageCount: 10,
        timestamp: new Date(),
      });
    });

    it('should get best match for context', async () => {
      const best = await cache.getBestMatch('timeout-error');
      expect(best?.id).toBe('fix-1');
      expect(best?.successRate).toBe(0.95);
    });

    it('should get best match for context and type', async () => {
      const best = await cache.getBestMatch('timeout-error', 'workflow');
      expect(best?.id).toBe('workflow-1');
      expect(best?.type).toBe('workflow');
    });

    it('should return null for non-existent context', async () => {
      const best = await cache.getBestMatch('non-existent');
      expect(best).toBeNull();
    });
  });

  describe('all and clear', () => {
    it('should get all entries', async () => {
      await cache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'test',
        knowledge: {},
        confidence: 0.9,
        usageCount: 0,
        timestamp: new Date(),
      });

      await cache.store({
        id: 'workflow-1',
        type: 'workflow',
        context: 'test',
        knowledge: {},
        confidence: 0.85,
        usageCount: 0,
        timestamp: new Date(),
      });

      const all = await cache.all();
      expect(all).toHaveLength(2);
    });

    it('should clear all entries', async () => {
      await cache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'test',
        knowledge: {},
        confidence: 0.9,
        usageCount: 0,
        timestamp: new Date(),
      });

      await cache.clear();
      const all = await cache.all();
      expect(all).toHaveLength(0);
    });

    it('should clear usage records on clear', async () => {
      await cache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'test',
        knowledge: {},
        confidence: 0.9,
        usageCount: 0,
        timestamp: new Date(),
      });

      await cache.recordUsage('fix-1', true);
      await cache.clear();
      
      const history = cache.getUsageHistory('fix-1');
      expect(history).toHaveLength(0);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await cache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'context-1',
        knowledge: {},
        confidence: 0.9,
        successRate: 0.95,
        usageCount: 10,
        timestamp: new Date(),
      });

      await cache.store({
        id: 'fix-2',
        type: 'fix',
        context: 'context-2',
        knowledge: {},
        confidence: 0.8,
        successRate: 0.85,
        usageCount: 5,
        timestamp: new Date(),
      });

      await cache.store({
        id: 'workflow-1',
        type: 'workflow',
        context: 'context-1',
        knowledge: {},
        confidence: 0.85,
        successRate: 0.90,
        usageCount: 8,
        timestamp: new Date(),
      });
    });

    it('should return correct statistics', () => {
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.byType.fix).toBe(2);
      expect(stats.byType.workflow).toBe(1);
      expect(stats.byContext).toBe(2);
      expect(stats.avgConfidence).toBeCloseTo(0.85, 2);
      expect(stats.avgSuccessRate).toBeCloseTo(0.9, 2);
      expect(stats.totalUsage).toBe(23);
    });
  });

  describe('immutability', () => {
    it('should not allow modification of stored entries', async () => {
      const entry: ProceduralEntry = {
        id: 'fix-1',
        type: 'fix',
        context: 'test',
        knowledge: { value: 42 },
        confidence: 0.9,
        usageCount: 0,
        timestamp: new Date(),
      };

      await cache.store(entry);

      // Modify original
      (entry.knowledge as any).value = 999;

      // Retrieved should be unchanged
      const retrieved = await cache.get('fix-1');
      expect((retrieved?.knowledge as any).value).toBe(42);
    });

    it('should not allow modification of retrieved entries', async () => {
      await cache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'test',
        knowledge: { value: 42 },
        confidence: 0.9,
        usageCount: 0,
        timestamp: new Date(),
      });

      const retrieved1 = await cache.get('fix-1');
      (retrieved1!.knowledge as any).value = 999;

      const retrieved2 = await cache.get('fix-1');
      expect((retrieved2?.knowledge as any).value).toBe(42);
    });
  });
});
