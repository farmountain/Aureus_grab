/**
 * Tests for symbolic store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemorySymbolicStore,
  StateStoreSymbolicStore,
  DefaultEntityExtractor,
} from '../src/symbolic-store';
import { InMemoryStateStore } from '@aureus/world-model';
import { SymbolicEntity, DataContract } from '../src/types';

describe('Symbolic Store', () => {
  describe('InMemorySymbolicStore', () => {
    let store: InMemorySymbolicStore;

    beforeEach(() => {
      store = new InMemorySymbolicStore();
    });

    it('should store and retrieve entity', async () => {
      const entity: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: { value: 42 },
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity);
      const retrieved = await store.get('entity-1');

      expect(retrieved).toEqual(entity);
    });

    it('should return null for non-existent entity', async () => {
      const retrieved = await store.get('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should query entities by type', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: {},
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'command',
        properties: {},
        source: 'input-2',
        confidence: 0.8,
        timestamp: new Date(),
      };

      await store.store(entity1);
      await store.store(entity2);

      const observations = await store.queryByType('observation');
      expect(observations).toHaveLength(1);
      expect(observations[0].id).toBe('entity-1');
    });

    it('should query entities by source', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: {},
        source: 'source-A',
        confidence: 0.9,
        timestamp: new Date(),
      };

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'observation',
        properties: {},
        source: 'source-B',
        confidence: 0.8,
        timestamp: new Date(),
      };

      await store.store(entity1);
      await store.store(entity2);

      const fromSourceA = await store.queryBySource('source-A');
      expect(fromSourceA).toHaveLength(1);
      expect(fromSourceA[0].id).toBe('entity-1');
    });

    it('should find related entities', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'order',
        properties: {},
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
        relationships: [
          { type: 'has-item', targetId: 'entity-2' },
        ],
      };

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'item',
        properties: {},
        source: 'input-2',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity1);
      await store.store(entity2);

      const related = await store.findRelated('entity-1');
      expect(related).toHaveLength(1);
      expect(related[0].id).toBe('entity-2');
    });

    it('should filter related entities by relationship type', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'order',
        properties: {},
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
        relationships: [
          { type: 'has-item', targetId: 'entity-2' },
          { type: 'has-customer', targetId: 'entity-3' },
        ],
      };

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'item',
        properties: {},
        source: 'input-2',
        confidence: 0.9,
        timestamp: new Date(),
      };

      const entity3: SymbolicEntity = {
        id: 'entity-3',
        type: 'customer',
        properties: {},
        source: 'input-3',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity1);
      await store.store(entity2);
      await store.store(entity3);

      const items = await store.findRelated('entity-1', 'has-item');
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('entity-2');
    });

    it('should get all entities', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: {},
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'observation',
        properties: {},
        source: 'input-2',
        confidence: 0.8,
        timestamp: new Date(),
      };

      await store.store(entity1);
      await store.store(entity2);

      const all = await store.all();
      expect(all).toHaveLength(2);
    });

    it('should clear all entities', async () => {
      const entity: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: {},
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity);
      await store.clear();

      const all = await store.all();
      expect(all).toHaveLength(0);
    });
  });

  describe('StateStoreSymbolicStore', () => {
    let stateStore: InMemoryStateStore;
    let store: StateStoreSymbolicStore;

    beforeEach(() => {
      stateStore = new InMemoryStateStore();
      store = new StateStoreSymbolicStore(stateStore);
    });

    it('should store and retrieve entity from state store', async () => {
      const entity: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: { value: 42 },
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity);
      const retrieved = await store.get('entity-1');

      expect(retrieved).toMatchObject({
        id: 'entity-1',
        type: 'observation',
        properties: { value: 42 },
      });
    });

    it('should query entities by type', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: {},
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'command',
        properties: {},
        source: 'input-2',
        confidence: 0.8,
        timestamp: new Date(),
      };

      await store.store(entity1);
      await store.store(entity2);

      const observations = await store.queryByType('observation');
      expect(observations).toHaveLength(1);
      expect(observations[0].id).toBe('entity-1');
    });
  });

  describe('DefaultEntityExtractor', () => {
    let extractor: DefaultEntityExtractor;

    beforeEach(() => {
      extractor = new DefaultEntityExtractor();
    });

    it('should extract observation entity', async () => {
      const contract: DataContract = {
        id: 'contract-1',
        inputId: 'input-1',
        schema: 'sensor-v1',
        schemaVersion: 'v1',
        intent: {
          type: 'observation',
          confidence: 0.9,
          parameters: {},
        },
        validatedData: { temperature: 22.5 },
        timestamp: new Date(),
        validationResults: [],
      };

      const entities = await extractor.extract(contract);

      expect(entities).toHaveLength(1);
      expect(entities[0].type).toBe('observation');
      expect(entities[0].properties).toHaveProperty('data');
    });

    it('should extract event entity', async () => {
      const contract: DataContract = {
        id: 'contract-2',
        inputId: 'input-2',
        schema: 'event-v1',
        schemaVersion: 'v1',
        intent: {
          type: 'event',
          confidence: 0.95,
          parameters: {},
        },
        validatedData: {
          eventType: 'user.login',
          payload: { userId: '123' },
        },
        timestamp: new Date(),
        validationResults: [],
      };

      const entities = await extractor.extract(contract);

      expect(entities).toHaveLength(1);
      expect(entities[0].type).toBe('event');
      expect(entities[0].properties.eventType).toBe('user.login');
    });

    it('should extract query entity', async () => {
      const contract: DataContract = {
        id: 'contract-3',
        inputId: 'input-3',
        schema: 'text-v1',
        schemaVersion: 'v1',
        intent: {
          type: 'query',
          confidence: 0.8,
          parameters: { text: 'What is the weather?' },
        },
        validatedData: { text: 'What is the weather?' },
        timestamp: new Date(),
        validationResults: [],
      };

      const entities = await extractor.extract(contract);

      expect(entities).toHaveLength(1);
      expect(entities[0].type).toBe('query');
      expect(entities[0].properties).toHaveProperty('question');
    });

    it('should extract command entity', async () => {
      const contract: DataContract = {
        id: 'contract-4',
        inputId: 'input-4',
        schema: 'text-v1',
        schemaVersion: 'v1',
        intent: {
          type: 'command',
          confidence: 0.85,
          parameters: { text: 'run backup' },
        },
        validatedData: { text: 'run backup' },
        timestamp: new Date(),
        validationResults: [],
      };

      const entities = await extractor.extract(contract);

      expect(entities).toHaveLength(1);
      expect(entities[0].type).toBe('command');
      expect(entities[0].properties).toHaveProperty('command');
    });
  });

  describe('Conflict Detection', () => {
    let store: InMemorySymbolicStore;

    beforeEach(() => {
      store = new InMemorySymbolicStore();
    });

    it('should detect duplicate entity with same ID', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: { value: 42 },
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity1);

      const entity2: SymbolicEntity = {
        id: 'entity-1', // Same ID
        type: 'observation',
        properties: { value: 100 },
        source: 'input-2',
        confidence: 0.8,
        timestamp: new Date(),
      };

      const conflicts = await store.detectConflicts!(entity2);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('duplicate');
      expect(conflicts[0].severity).toBe('high');
      expect(conflicts[0].existingEntityId).toBe('entity-1');
      expect(conflicts[0].resolution?.strategy).toBe('keep-existing');
    });

    it('should detect similar entities with high similarity', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: {
          orderId: '12345',
          status: 'pending',
          amount: 99.99,
          customer: 'John Doe',
          date: '2024-01-01',
        },
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity1);

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'observation',
        properties: {
          orderId: '12345',
          status: 'completed', // Different status - only 1 field different => 4/5 = 80%
          amount: 99.99,
          customer: 'John Doe',
          date: '2024-01-01',
        },
        source: 'input-2',
        confidence: 0.8,
        timestamp: new Date(),
      };

      const conflicts = await store.detectConflicts!(entity2);

      expect(conflicts.length).toBeGreaterThan(0);
      // Conflict detected (could be duplicate or inconsistent depending on similarity calculation)
      const conflict = conflicts[0];
      expect(conflict).toBeDefined();
      expect(conflict.conflictingFields).toContain('status');
      expect(conflict.resolution).toBeDefined();
      expect(['merge', 'keep-both']).toContain(conflict.resolution!.strategy);
    });

    it('should detect inconsistent entities with medium similarity', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'data',
        properties: {
          field1: 'value1',
          field2: 'value2',
          field3: 'value3',
          field4: 'value4',
          field5: 'value5',
        },
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity1);

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'data',
        properties: {
          field1: 'value1',
          field2: 'value2',
          field3: 'value3',
          field4: 'different-value', // Different
          field5: 'also-different', // Different
        },
        source: 'input-2',
        confidence: 0.8,
        timestamp: new Date(),
      };

      const conflicts = await store.detectConflicts!(entity2);

      expect(conflicts.length).toBeGreaterThan(0);
      // With 3/5 matching (60% similarity), should detect inconsistent conflict
      const inconsistentConflict = conflicts.find(c => c.type === 'inconsistent');
      expect(inconsistentConflict).toBeDefined();
      expect(inconsistentConflict?.severity).toBe('medium');
      expect(inconsistentConflict?.resolution?.strategy).toBe('keep-both');
    });

    it('should detect temporal conflicts', async () => {
      const timestamp = new Date();
      
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: { value: 42 },
        source: 'input-1',
        confidence: 0.9,
        timestamp: timestamp,
      };

      await store.store(entity1);

      // Entity created within 1 second
      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'observation',
        properties: { value: 100 }, // Different value
        source: 'input-2',
        confidence: 0.8,
        timestamp: new Date(timestamp.getTime() + 500), // 500ms later
      };

      const conflicts = await store.detectConflicts!(entity2);

      const temporalConflict = conflicts.find(c => c.type === 'temporal');
      expect(temporalConflict).toBeDefined();
      expect(temporalConflict?.severity).toBe('low');
      expect(temporalConflict?.resolution?.strategy).toBe('keep-new');
    });

    it('should detect relationship conflicts', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: { value: 42 },
        relationships: [
          {
            type: 'related-to',
            targetId: 'target-1',
            properties: { strength: 'high' },
          },
        ],
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity1);

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'observation',
        properties: { value: 42 },
        relationships: [
          {
            type: 'related-to',
            targetId: 'target-1',
            properties: { strength: 'low' }, // Different relationship property
          },
        ],
        source: 'input-2',
        confidence: 0.8,
        timestamp: new Date(),
      };

      const conflicts = await store.detectConflicts!(entity2);

      const relationshipConflict = conflicts.find(c => c.type === 'relationship');
      expect(relationshipConflict).toBeDefined();
      expect(relationshipConflict?.conflictingFields.length).toBeGreaterThan(0);
      expect(relationshipConflict?.resolution?.strategy).toBe('merge');
    });

    it('should return empty array when no conflicts', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: { value: 42 },
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity1);

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'query', // Different type
        properties: { question: 'What is the value?' },
        source: 'input-2',
        confidence: 0.8,
        timestamp: new Date(),
      };

      const conflicts = await store.detectConflicts!(entity2);

      expect(conflicts).toHaveLength(0);
    });

    it('should suggest conflict resolution for similar entities', async () => {
      const entity1: SymbolicEntity = {
        id: 'entity-1',
        type: 'observation',
        properties: {
          field1: 'value1',
          field2: 'value2',
          field3: 'value3',
          field4: 'value4',
          field5: 'value5',
        },
        source: 'input-1',
        confidence: 0.9,
        timestamp: new Date(),
      };

      await store.store(entity1);

      const entity2: SymbolicEntity = {
        id: 'entity-2',
        type: 'observation',
        properties: {
          field1: 'value1',
          field2: 'value2',
          field3: 'value3',
          field4: 'value4',
          field5: 'different', // Only 1 field different => 4/5 = 80% similarity
        },
        source: 'input-2',
        confidence: 0.85,
        timestamp: new Date(),
      };

      const conflicts = await store.detectConflicts!(entity2);

      // Should detect conflict with resolution
      expect(conflicts.length).toBeGreaterThan(0);
      const conflict = conflicts[0];
      expect(conflict.resolution).toBeDefined();
      expect(conflict.resolution?.strategy).toBeDefined();
      expect(conflict.resolution?.description).toBeDefined();
      expect(conflict.resolution?.confidence).toBeGreaterThan(0);
    });
  });
});
