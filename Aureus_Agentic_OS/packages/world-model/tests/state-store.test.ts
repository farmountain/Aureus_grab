import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStateStore, ConflictError, StateSnapshot } from '../src/state-store';

describe('StateStore', () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  describe('CRUD operations', () => {
    it('should create a new state entry with version 1', async () => {
      const entry = await store.create('user:1', { name: 'Alice', age: 30 });

      expect(entry.key).toBe('user:1');
      expect(entry.value).toEqual({ name: 'Alice', age: 30 });
      expect(entry.version).toBe(1);
      expect(entry.timestamp).toBeInstanceOf(Date);
    });

    it('should not allow creating duplicate keys', async () => {
      await store.create('user:1', { name: 'Alice' });

      await expect(
        store.create('user:1', { name: 'Bob' })
      ).rejects.toThrow('Key "user:1" already exists');
    });

    it('should read the current version of a state entry', async () => {
      await store.create('user:1', { name: 'Alice', age: 30 });

      const entry = await store.read('user:1');

      expect(entry).not.toBeNull();
      expect(entry!.value).toEqual({ name: 'Alice', age: 30 });
      expect(entry!.version).toBe(1);
    });

    it('should return null for non-existent keys', async () => {
      const entry = await store.read('user:999');
      expect(entry).toBeNull();
    });

    it('should update an existing entry with version increment', async () => {
      await store.create('user:1', { name: 'Alice', age: 30 });

      const updated = await store.update('user:1', { name: 'Alice', age: 31 }, 1);

      expect(updated.version).toBe(2);
      expect(updated.value).toEqual({ name: 'Alice', age: 31 });
    });

    it('should throw ConflictError on version mismatch during update', async () => {
      await store.create('user:1', { name: 'Alice', age: 30 });

      await expect(
        store.update('user:1', { name: 'Alice', age: 31 }, 2) // wrong version
      ).rejects.toThrow(ConflictError);
    });

    it('should not allow updating non-existent keys', async () => {
      await expect(
        store.update('user:999', { name: 'Bob' }, 1)
      ).rejects.toThrow('Key "user:999" does not exist');
    });

    it('should delete an entry with version check', async () => {
      await store.create('user:1', { name: 'Alice', age: 30 });

      await store.delete('user:1', 1);

      const entry = await store.read('user:1');
      expect(entry).toBeNull();
    });

    it('should throw ConflictError on version mismatch during delete', async () => {
      await store.create('user:1', { name: 'Alice', age: 30 });

      await expect(
        store.delete('user:1', 2) // wrong version
      ).rejects.toThrow(ConflictError);
    });

    it('should list all keys', async () => {
      await store.create('user:1', { name: 'Alice' });
      await store.create('user:2', { name: 'Bob' });
      await store.create('order:1', { total: 100 });

      const keys = await store.keys();

      expect(keys).toHaveLength(3);
      expect(keys).toContain('user:1');
      expect(keys).toContain('user:2');
      expect(keys).toContain('order:1');
    });
  });

  describe('Versioning', () => {
    it('should maintain version history', async () => {
      await store.create('counter', { value: 0 });
      await store.update('counter', { value: 1 }, 1);
      await store.update('counter', { value: 2 }, 2);

      const v1 = await store.readVersion('counter', 1);
      const v2 = await store.readVersion('counter', 2);
      const v3 = await store.readVersion('counter', 3);

      expect(v1!.value).toEqual({ value: 0 });
      expect(v2!.value).toEqual({ value: 1 });
      expect(v3!.value).toEqual({ value: 2 });
    });

    it('should return null for non-existent versions', async () => {
      await store.create('counter', { value: 0 });

      const v5 = await store.readVersion('counter', 5);
      expect(v5).toBeNull();
    });

    it('should track metadata with each version', async () => {
      await store.create('user:1', { name: 'Alice' }, { author: 'system' });
      await store.update('user:1', { name: 'Alice Smith' }, 1, { author: 'admin', reason: 'name correction' });

      const v1 = await store.readVersion('user:1', 1);
      const v2 = await store.readVersion('user:1', 2);

      expect(v1!.metadata).toEqual({ author: 'system' });
      expect(v2!.metadata).toEqual({ author: 'admin', reason: 'name correction' });
    });
  });

  describe('Snapshots and Diffs', () => {
    it('should create a snapshot of current state', async () => {
      await store.create('user:1', { name: 'Alice' });
      await store.create('user:2', { name: 'Bob' });

      const snapshot = await store.snapshot();

      expect(snapshot.id).toMatch(/^snapshot-\d+$/);
      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.entries.size).toBe(2);
      expect(snapshot.entries.get('user:1')!.value).toEqual({ name: 'Alice' });
      expect(snapshot.entries.get('user:2')!.value).toEqual({ name: 'Bob' });
    });

    it('should compute diff for created entries', async () => {
      const before = await store.snapshot();

      await store.create('user:1', { name: 'Alice' });
      await store.create('user:2', { name: 'Bob' });

      const after = await store.snapshot();
      const diffs = store.diff(before, after);

      expect(diffs).toHaveLength(2);
      expect(diffs[0].operation).toBe('create');
      expect(diffs[0].before).toBeNull();
      expect(diffs[0].after!.value).toEqual({ name: 'Alice' });
      expect(diffs[1].operation).toBe('create');
      expect(diffs[1].before).toBeNull();
      expect(diffs[1].after!.value).toEqual({ name: 'Bob' });
    });

    it('should compute diff for updated entries', async () => {
      await store.create('user:1', { name: 'Alice', age: 30 });
      const before = await store.snapshot();

      await store.update('user:1', { name: 'Alice', age: 31 }, 1);
      const after = await store.snapshot();

      const diffs = store.diff(before, after);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].operation).toBe('update');
      expect(diffs[0].key).toBe('user:1');
      expect(diffs[0].before!.version).toBe(1);
      expect(diffs[0].before!.value).toEqual({ name: 'Alice', age: 30 });
      expect(diffs[0].after!.version).toBe(2);
      expect(diffs[0].after!.value).toEqual({ name: 'Alice', age: 31 });
    });

    it('should compute diff for deleted entries', async () => {
      await store.create('user:1', { name: 'Alice' });
      const before = await store.snapshot();

      await store.delete('user:1', 1);
      const after = await store.snapshot();

      const diffs = store.diff(before, after);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].operation).toBe('delete');
      expect(diffs[0].key).toBe('user:1');
      expect(diffs[0].before!.value).toEqual({ name: 'Alice' });
      expect(diffs[0].after).toBeNull();
    });

    it('should handle complex diff scenarios', async () => {
      await store.create('user:1', { name: 'Alice' });
      await store.create('user:2', { name: 'Bob' });
      const before = await store.snapshot();

      // Create new entry
      await store.create('user:3', { name: 'Charlie' });
      // Update existing entry
      await store.update('user:1', { name: 'Alice Smith' }, 1);
      // Delete existing entry
      await store.delete('user:2', 1);

      const after = await store.snapshot();
      const diffs = store.diff(before, after);

      expect(diffs).toHaveLength(3);
      
      const createDiff = diffs.find(d => d.operation === 'create');
      const updateDiff = diffs.find(d => d.operation === 'update');
      const deleteDiff = diffs.find(d => d.operation === 'delete');

      expect(createDiff!.key).toBe('user:3');
      expect(updateDiff!.key).toBe('user:1');
      expect(deleteDiff!.key).toBe('user:2');
    });
  });

  describe('Conflict Detection', () => {
    it('should detect conflicts during concurrent updates', async () => {
      await store.create('counter', { value: 0 });

      // Simulate two concurrent updates
      try {
        await store.update('counter', { value: 1 }, 1);
        // This should fail with wrong version
        await store.update('counter', { value: 2 }, 1);
        expect.fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).key).toBe('counter');
        expect((error as ConflictError).expectedVersion).toBe(1);
        expect((error as ConflictError).actualVersion).toBe(2);
      }
    });

    it('should record conflicts for a task', async () => {
      await store.create('counter', { value: 0 });

      const taskId = 'task-123';
      try {
        await store.update('counter', { value: 1 }, 1);
        await store.update('counter', { value: 2 }, 1); // conflict
      } catch (error) {
        if (error instanceof ConflictError) {
          store.recordConflict(taskId, {
            key: 'counter',
            expectedVersion: 1,
            actualVersion: 2,
            attemptedValue: { value: 2 },
            timestamp: new Date(),
          });
        }
      }

      const conflicts = store.getConflicts(taskId);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].key).toBe('counter');
      expect(conflicts[0].expectedVersion).toBe(1);
      expect(conflicts[0].actualVersion).toBe(2);
    });

    it('should clear conflicts for a task', async () => {
      const taskId = 'task-123';
      store.recordConflict(taskId, {
        key: 'counter',
        expectedVersion: 1,
        actualVersion: 2,
        attemptedValue: { value: 2 },
        timestamp: new Date(),
      });

      expect(store.getConflicts(taskId)).toHaveLength(1);

      store.clearConflicts(taskId);
      expect(store.getConflicts(taskId)).toHaveLength(0);
    });

    it('should track multiple conflicts in the same task', async () => {
      await store.create('counter1', { value: 0 });
      await store.create('counter2', { value: 0 });

      const taskId = 'task-456';

      // Simulate multiple conflicts
      for (const key of ['counter1', 'counter2']) {
        try {
          await store.update(key, { value: 1 }, 1);
          await store.update(key, { value: 2 }, 1); // conflict
        } catch (error) {
          if (error instanceof ConflictError) {
            store.recordConflict(taskId, {
              key,
              expectedVersion: 1,
              actualVersion: 2,
              attemptedValue: { value: 2 },
              timestamp: new Date(),
            });
          }
        }
      }

      const conflicts = store.getConflicts(taskId);
      expect(conflicts).toHaveLength(2);
      expect(conflicts.map(c => c.key)).toContain('counter1');
      expect(conflicts.map(c => c.key)).toContain('counter2');
    });
  });
});
