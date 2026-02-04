import { describe, it, expect, beforeEach } from 'vitest';
import { UnifiedMemoryAPI, UnifiedMemoryAPIBuilder } from '../src/unified-memory-api';
import { MemoryAPI } from '../src/memory-api';
import { SymbolicStore } from '../src/symbolic-store';
import { ProceduralCache } from '../src/procedural-cache';
import { Provenance } from '../src';

describe('UnifiedMemoryAPI', () => {
  let memoryAPI: MemoryAPI;
  let symbolicStore: SymbolicStore;
  let proceduralCache: ProceduralCache;
  let unifiedAPI: UnifiedMemoryAPI;

  beforeEach(() => {
    memoryAPI = new MemoryAPI();
    symbolicStore = new SymbolicStore();
    proceduralCache = new ProceduralCache();
    unifiedAPI = new UnifiedMemoryAPI(memoryAPI, symbolicStore, proceduralCache);
  });

  describe('builder', () => {
    it('should build unified API with all stores', () => {
      const api = new UnifiedMemoryAPIBuilder()
        .withMemoryAPI(memoryAPI)
        .withSymbolicStore(symbolicStore)
        .withProceduralCache(proceduralCache)
        .build();

      expect(api).toBeDefined();
      expect(api.getMemoryAPI()).toBe(memoryAPI);
      expect(api.getSymbolicStore()).toBe(symbolicStore);
      expect(api.getProceduralCache()).toBe(proceduralCache);
    });

    it('should build with partial stores', () => {
      const api = new UnifiedMemoryAPIBuilder()
        .withSymbolicStore(symbolicStore)
        .build();

      expect(api.getMemoryAPI()).toBeUndefined();
      expect(api.getSymbolicStore()).toBe(symbolicStore);
      expect(api.getProceduralCache()).toBeUndefined();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Add memory entries
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };
      memoryAPI.write({ data: 'memory-1' }, provenance);

      // Add symbolic entities
      await symbolicStore.store({
        id: 'entity-1',
        type: 'person',
        properties: { name: 'Alice' },
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      // Add procedural entries
      await proceduralCache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'timeout-error',
        knowledge: { solution: 'increase timeout' },
        confidence: 0.85,
        usageCount: 0,
        timestamp: new Date(),
      });
    });

    it('should query all stores', async () => {
      const result = await unifiedAPI.query({
        memory: { task_id: 'task-1' },
        symbolic: { type: 'person' },
        procedural: { type: 'fix' },
      });

      expect(result.memory).toHaveLength(1);
      expect(result.symbolic).toHaveLength(1);
      expect(result.procedural).toHaveLength(1);
      expect(result.metadata.totalCount).toBe(3);
      expect(result.metadata.queriedStores).toContain('memory');
      expect(result.metadata.queriedStores).toContain('symbolic');
      expect(result.metadata.queriedStores).toContain('procedural');
    });

    it('should query specific stores', async () => {
      const result = await unifiedAPI.query({
        stores: ['symbolic'],
        symbolic: { type: 'person' },
      });

      expect(result.memory).toBeUndefined();
      expect(result.symbolic).toHaveLength(1);
      expect(result.procedural).toBeUndefined();
      expect(result.metadata.queriedStores).toEqual(['symbolic']);
    });

    it('should handle empty results', async () => {
      const result = await unifiedAPI.query({
        memory: { task_id: 'non-existent' },
      });

      expect(result.memory).toHaveLength(0);
      expect(result.metadata.memoryCount).toBe(0);
      expect(result.metadata.totalCount).toBe(0);
    });
  });

  describe('getTimeRange', () => {
    it('should query all stores by time range', async () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-12-31');

      const result = await unifiedAPI.getTimeRange(start, end);

      expect(result.metadata.queriedStores.length).toBeGreaterThan(0);
    });
  });

  describe('getTaskMemory', () => {
    beforeEach(() => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };
      memoryAPI.write({ data: 'test' }, provenance);
    });

    it('should get memory for a task', async () => {
      const result = await unifiedAPI.getTaskMemory('task-1');

      expect(result.memory).toHaveLength(1);
      expect(result.metadata.memoryCount).toBe(1);
    });

    it('should return empty for non-existent task', async () => {
      const result = await unifiedAPI.getTaskMemory('non-existent');

      expect(result.memory).toHaveLength(0);
    });
  });

  describe('getHighConfidenceEntities', () => {
    beforeEach(async () => {
      await symbolicStore.store({
        id: 'high-conf',
        type: 'person',
        properties: { name: 'Alice' },
        source: 'source-1',
        confidence: 0.95,
        timestamp: new Date(),
      });

      await symbolicStore.store({
        id: 'low-conf',
        type: 'person',
        properties: { name: 'Bob' },
        source: 'source-1',
        confidence: 0.7,
        timestamp: new Date(),
      });
    });

    it('should get high confidence entities', async () => {
      const entities = await unifiedAPI.getHighConfidenceEntities(0.8);

      expect(entities).toHaveLength(1);
      expect(entities[0].id).toBe('high-conf');
    });

    it('should use default threshold', async () => {
      const entities = await unifiedAPI.getHighConfidenceEntities();

      expect(entities).toHaveLength(1);
    });
  });

  describe('getBestProcedural', () => {
    beforeEach(async () => {
      await proceduralCache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'timeout-error',
        knowledge: { solution: 'increase timeout' },
        confidence: 0.9,
        successRate: 0.95,
        usageCount: 0,
        timestamp: new Date(),
      });

      await proceduralCache.store({
        id: 'fix-2',
        type: 'fix',
        context: 'timeout-error',
        knowledge: { solution: 'retry' },
        confidence: 0.85,
        successRate: 0.80,
        usageCount: 0,
        timestamp: new Date(),
      });
    });

    it('should get best procedural for context', async () => {
      const best = await unifiedAPI.getBestProcedural('timeout-error');

      expect(best).toBeDefined();
      expect(best?.id).toBe('fix-1');
    });

    it('should get best procedural for context and type', async () => {
      const best = await unifiedAPI.getBestProcedural('timeout-error', 'fix');

      expect(best).toBeDefined();
      expect(best?.type).toBe('fix');
    });

    it('should return null for non-existent context', async () => {
      const best = await unifiedAPI.getBestProcedural('non-existent');

      expect(best).toBeNull();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      // Add data to all stores
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };
      memoryAPI.write({ data: 'test' }, provenance);

      await symbolicStore.store({
        id: 'entity-1',
        type: 'person',
        properties: {},
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      await proceduralCache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'test',
        knowledge: {},
        confidence: 0.85,
        usageCount: 0,
        timestamp: new Date(),
      });
    });

    it('should get stats from all stores', () => {
      const stats = unifiedAPI.getStats();

      expect(stats.memory).toBeDefined();
      expect(stats.symbolic).toBeDefined();
      expect(stats.procedural).toBeDefined();

      expect(stats.memory?.totalEntries).toBe(1);
      expect(stats.symbolic?.totalEntities).toBe(1);
      expect(stats.procedural?.totalEntries).toBe(1);
    });
  });

  describe('clearAll', () => {
    beforeEach(async () => {
      await symbolicStore.store({
        id: 'entity-1',
        type: 'person',
        properties: {},
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      await proceduralCache.store({
        id: 'fix-1',
        type: 'fix',
        context: 'test',
        knowledge: {},
        confidence: 0.85,
        usageCount: 0,
        timestamp: new Date(),
      });
    });

    it('should clear all stores', async () => {
      await unifiedAPI.clearAll();

      const symbolicEntities = await symbolicStore.all();
      const proceduralEntries = await proceduralCache.all();

      expect(symbolicEntities).toHaveLength(0);
      expect(proceduralEntries).toHaveLength(0);
    });
  });

  describe('partial initialization', () => {
    it('should work with only symbolic store', async () => {
      const api = new UnifiedMemoryAPI(undefined, symbolicStore, undefined);

      await symbolicStore.store({
        id: 'entity-1',
        type: 'person',
        properties: {},
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      const result = await api.query({
        symbolic: { type: 'person' },
      });

      expect(result.symbolic).toHaveLength(1);
      expect(result.memory).toBeUndefined();
      expect(result.procedural).toBeUndefined();
    });

    it('should return empty when store not configured', async () => {
      const api = new UnifiedMemoryAPI(undefined, undefined, undefined);

      const entities = await api.getHighConfidenceEntities();
      const best = await api.getBestProcedural('test');

      expect(entities).toHaveLength(0);
      expect(best).toBeNull();
    });
  });
});
