import { describe, it, expect, beforeEach } from 'vitest';
import { SymbolicStore, SymbolicEntity } from '../src/symbolic-store';
import { Provenance } from '../src';

describe('SymbolicStore', () => {
  let store: SymbolicStore;

  beforeEach(() => {
    store = new SymbolicStore();
  });

  describe('store and get', () => {
    it('should store and retrieve an entity', async () => {
      const entity: SymbolicEntity = {
        id: 'entity-1',
        type: 'person',
        properties: { name: 'John', age: 30 },
        source: 'perception-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity);
      const retrieved = await store.get('entity-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('entity-1');
      expect(retrieved?.type).toBe('person');
      expect(retrieved?.properties.name).toBe('John');
    });

    it('should store entity with provenance', async () => {
      const entity: SymbolicEntity = {
        id: 'entity-2',
        type: 'event',
        properties: { action: 'click' },
        source: 'perception-2',
        confidence: 0.85,
        timestamp: new Date(),
      };

      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      await store.store(entity, provenance);
      const retrieved = await store.get('entity-2');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('entity-2');
    });

    it('should return null for non-existent entity', async () => {
      const retrieved = await store.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should store entity with relationships', async () => {
      const entity: SymbolicEntity = {
        id: 'entity-3',
        type: 'person',
        properties: { name: 'Alice' },
        relationships: [
          { type: 'knows', targetId: 'entity-4' },
          { type: 'works-with', targetId: 'entity-5' },
        ],
        source: 'perception-3',
        confidence: 0.95,
        timestamp: new Date(),
      };

      await store.store(entity);
      const retrieved = await store.get('entity-3');

      expect(retrieved?.relationships).toHaveLength(2);
      expect(retrieved?.relationships?.[0].type).toBe('knows');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      // Add test data
      await store.store({
        id: 'e1',
        type: 'person',
        properties: { name: 'Alice', role: 'developer' },
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date('2024-01-01'),
      });

      await store.store({
        id: 'e2',
        type: 'person',
        properties: { name: 'Bob', role: 'designer' },
        source: 'source-1',
        confidence: 0.85,
        timestamp: new Date('2024-01-02'),
      });

      await store.store({
        id: 'e3',
        type: 'event',
        properties: { action: 'login' },
        source: 'source-2',
        confidence: 0.95,
        timestamp: new Date('2024-01-03'),
      });
    });

    it('should query by type', async () => {
      const results = await store.queryByType('person');
      expect(results).toHaveLength(2);
      expect(results.every(e => e.type === 'person')).toBe(true);
    });

    it('should query by source', async () => {
      const results = await store.queryBySource('source-1');
      expect(results).toHaveLength(2);
      expect(results.every(e => e.source === 'source-1')).toBe(true);
    });

    it('should query by minimum confidence', async () => {
      const results = await store.query({ minConfidence: 0.9 });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.confidence >= 0.9)).toBe(true);
    });

    it('should query by time range', async () => {
      const results = await store.query({
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-02'),
        },
      });
      expect(results).toHaveLength(2);
    });

    it('should query with multiple filters', async () => {
      const results = await store.query({
        type: 'person',
        source: 'source-1',
        minConfidence: 0.85,
      });
      expect(results).toHaveLength(2);
      expect(results.every(e => e.type === 'person')).toBe(true);
    });

    it('should return empty array when no matches', async () => {
      const results = await store.query({ type: 'non-existent' });
      expect(results).toHaveLength(0);
    });
  });

  describe('relationships', () => {
    beforeEach(async () => {
      await store.store({
        id: 'person-1',
        type: 'person',
        properties: { name: 'Alice' },
        relationships: [
          { type: 'knows', targetId: 'person-2' },
          { type: 'manages', targetId: 'person-3' },
        ],
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      await store.store({
        id: 'person-2',
        type: 'person',
        properties: { name: 'Bob' },
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      await store.store({
        id: 'person-3',
        type: 'person',
        properties: { name: 'Charlie' },
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });
    });

    it('should find related entities', async () => {
      const related = await store.findRelated('person-1');
      expect(related).toHaveLength(2);
      expect(related.map(e => e.id).sort()).toEqual(['person-2', 'person-3']);
    });

    it('should find related entities by relationship type', async () => {
      const related = await store.findRelated('person-1', 'knows');
      expect(related).toHaveLength(1);
      expect(related[0].id).toBe('person-2');
    });

    it('should return empty array for entity without relationships', async () => {
      const related = await store.findRelated('person-2');
      expect(related).toHaveLength(0);
    });

    it('should return empty array for non-existent entity', async () => {
      const related = await store.findRelated('non-existent');
      expect(related).toHaveLength(0);
    });
  });

  describe('all and clear', () => {
    it('should get all entities', async () => {
      await store.store({
        id: 'e1',
        type: 'person',
        properties: { name: 'Alice' },
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      await store.store({
        id: 'e2',
        type: 'event',
        properties: { action: 'click' },
        source: 'source-2',
        confidence: 0.85,
        timestamp: new Date(),
      });

      const all = await store.all();
      expect(all).toHaveLength(2);
    });

    it('should clear all entities', async () => {
      await store.store({
        id: 'e1',
        type: 'person',
        properties: { name: 'Alice' },
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      await store.clear();
      const all = await store.all();
      expect(all).toHaveLength(0);
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await store.store({
        id: 'e1',
        type: 'person',
        properties: { name: 'Alice' },
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      await store.store({
        id: 'e2',
        type: 'person',
        properties: { name: 'Bob' },
        source: 'source-1',
        confidence: 0.8,
        timestamp: new Date(),
      });

      await store.store({
        id: 'e3',
        type: 'event',
        properties: { action: 'click' },
        source: 'source-2',
        confidence: 1.0,
        timestamp: new Date(),
      });
    });

    it('should return correct statistics', () => {
      const stats = store.getStats();
      expect(stats.totalEntities).toBe(3);
      expect(stats.byType.person).toBe(2);
      expect(stats.byType.event).toBe(1);
      expect(stats.bySources).toBe(2);
      expect(stats.avgConfidence).toBeCloseTo(0.9, 1);
    });
  });

  describe('immutability', () => {
    it('should not allow modification of stored entities', async () => {
      const entity: SymbolicEntity = {
        id: 'e1',
        type: 'person',
        properties: { name: 'Alice', value: 42 },
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity);

      // Modify original
      entity.properties.value = 999;

      // Retrieved should be unchanged
      const retrieved = await store.get('e1');
      expect((retrieved?.properties as any).value).toBe(42);
    });

    it('should not allow modification of retrieved entities', async () => {
      await store.store({
        id: 'e1',
        type: 'person',
        properties: { name: 'Alice', value: 42 },
        source: 'source-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      const retrieved1 = await store.get('e1');
      (retrieved1!.properties as any).value = 999;

      const retrieved2 = await store.get('e1');
      expect((retrieved2?.properties as any).value).toBe(42);
    });
  });
});
