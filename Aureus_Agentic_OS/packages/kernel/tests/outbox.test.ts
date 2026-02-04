import { describe, it, expect, beforeEach } from 'vitest';
import {
  OutboxEntry,
  OutboxEntryState,
  InMemoryOutboxStore,
  DefaultOutboxService,
} from '../src';

describe('Outbox Pattern', () => {
  describe('InMemoryOutboxStore', () => {
    let store: InMemoryOutboxStore;

    beforeEach(() => {
      store = new InMemoryOutboxStore();
    });

    it('should create and retrieve an outbox entry', async () => {
      const entry = await store.create({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'file-write',
        params: { path: '/tmp/test.txt', content: 'hello' },
        idempotencyKey: 'key-1',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      expect(entry.id).toBeDefined();
      expect(entry.workflowId).toBe('wf-1');
      expect(entry.state).toBe(OutboxEntryState.PENDING);

      const retrieved = await store.get(entry.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(entry.id);
    });

    it('should retrieve entry by idempotency key', async () => {
      const entry = await store.create({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'file-write',
        params: { path: '/tmp/test.txt' },
        idempotencyKey: 'key-unique',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      const retrieved = await store.getByIdempotencyKey('key-unique');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(entry.id);
    });

    it('should update entry state', async () => {
      const entry = await store.create({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'file-write',
        params: {},
        idempotencyKey: 'key-1',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      await store.markProcessing(entry.id);
      const processing = await store.get(entry.id);
      expect(processing?.state).toBe(OutboxEntryState.PROCESSING);

      await store.markCommitted(entry.id, { success: true });
      const committed = await store.get(entry.id);
      expect(committed?.state).toBe(OutboxEntryState.COMMITTED);
      expect(committed?.result).toEqual({ success: true });
      expect(committed?.committedAt).toBeDefined();
    });

    it('should mark entry as failed and increment attempts', async () => {
      const entry = await store.create({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'file-write',
        params: {},
        idempotencyKey: 'key-1',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      await store.markFailed(entry.id, 'Test error');
      const failed = await store.get(entry.id);
      expect(failed?.state).toBe(OutboxEntryState.FAILED);
      expect(failed?.error).toBe('Test error');
      expect(failed?.attempts).toBe(1);
    });

    it('should mark entry as dead letter after max attempts', async () => {
      const entry = await store.create({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'file-write',
        params: {},
        idempotencyKey: 'key-1',
        state: OutboxEntryState.PENDING,
        attempts: 2,
        maxAttempts: 3,
      });

      await store.markFailed(entry.id, 'Final error');
      const deadLetter = await store.get(entry.id);
      expect(deadLetter?.state).toBe(OutboxEntryState.DEAD_LETTER);
      expect(deadLetter?.attempts).toBe(3);
    });

    it('should list entries by state', async () => {
      await store.create({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'tool-1',
        params: {},
        idempotencyKey: 'key-1',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      await store.create({
        workflowId: 'wf-1',
        taskId: 'task-2',
        toolId: 'tool-2',
        params: {},
        idempotencyKey: 'key-2',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      const entry3 = await store.create({
        workflowId: 'wf-1',
        taskId: 'task-3',
        toolId: 'tool-3',
        params: {},
        idempotencyKey: 'key-3',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });
      await store.markCommitted(entry3.id, { success: true });

      const pending = await store.listByState(OutboxEntryState.PENDING);
      expect(pending.length).toBe(2);

      const committed = await store.listByState(OutboxEntryState.COMMITTED);
      expect(committed.length).toBe(1);
    });

    it('should list entries by workflow', async () => {
      await store.create({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'tool-1',
        params: {},
        idempotencyKey: 'key-1',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      await store.create({
        workflowId: 'wf-1',
        taskId: 'task-2',
        toolId: 'tool-2',
        params: {},
        idempotencyKey: 'key-2',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      await store.create({
        workflowId: 'wf-2',
        taskId: 'task-3',
        toolId: 'tool-3',
        params: {},
        idempotencyKey: 'key-3',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      const wf1Entries = await store.listByWorkflow('wf-1');
      expect(wf1Entries.length).toBe(2);

      const wf2Entries = await store.listByWorkflow('wf-2');
      expect(wf2Entries.length).toBe(1);
    });

    it('should cleanup old committed entries', async () => {
      const entry = await store.create({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'tool-1',
        params: {},
        idempotencyKey: 'key-1',
        state: OutboxEntryState.PENDING,
        attempts: 0,
        maxAttempts: 3,
      });

      await store.markCommitted(entry.id, { success: true });

      // Simulate old entry by manipulating internal state
      const retrieved = await store.get(entry.id);
      if (retrieved) {
        await store.update(entry.id, {
          committedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        });
      }

      const cleaned = await store.cleanup(7 * 24 * 60 * 60 * 1000); // Cleanup older than 7 days
      expect(cleaned).toBe(1);

      const afterCleanup = await store.get(entry.id);
      expect(afterCleanup).toBeNull();
    });
  });

  describe('DefaultOutboxService', () => {
    let store: InMemoryOutboxStore;
    let service: DefaultOutboxService;

    beforeEach(() => {
      store = new InMemoryOutboxStore();
      service = new DefaultOutboxService(store);
    });

    it('should store intent before execution', async () => {
      const entry = await service.store({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'file-write',
        params: { path: '/tmp/test.txt', content: 'hello' },
        idempotencyKey: 'key-1',
        maxAttempts: 3,
      });

      expect(entry.state).toBe(OutboxEntryState.PENDING);
      expect(entry.attempts).toBe(0);
    });

    it('should provide replay protection (return existing entry)', async () => {
      const entry1 = await service.store({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'file-write',
        params: { path: '/tmp/test.txt' },
        idempotencyKey: 'key-same',
        maxAttempts: 3,
      });

      const entry2 = await service.store({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'file-write',
        params: { path: '/tmp/test.txt' },
        idempotencyKey: 'key-same',
        maxAttempts: 3,
      });

      expect(entry1.id).toBe(entry2.id);
    });

    it('should execute side effect through outbox pattern', async () => {
      let executed = false;
      const executor = async (params: Record<string, unknown>) => {
        executed = true;
        return { success: true, data: params };
      };

      const result = await service.execute(
        'wf-1',
        'task-1',
        'file-write',
        { path: '/tmp/test.txt' },
        'key-exec',
        executor,
        3
      );

      expect(executed).toBe(true);
      expect(result).toEqual({ success: true, data: { path: '/tmp/test.txt' } });

      // Verify entry was committed
      const entry = await service.getByIdempotencyKey('key-exec');
      expect(entry?.state).toBe(OutboxEntryState.COMMITTED);
      expect(entry?.result).toEqual(result);
    });

    it('should return cached result on replay', async () => {
      let executionCount = 0;
      const executor = async () => {
        executionCount++;
        return { count: executionCount };
      };

      // First execution
      const result1 = await service.execute(
        'wf-1',
        'task-1',
        'tool-1',
        {},
        'key-replay',
        executor,
        3
      );

      // Second execution (should use cached result)
      const result2 = await service.execute(
        'wf-1',
        'task-1',
        'tool-1',
        {},
        'key-replay',
        executor,
        3
      );

      expect(executionCount).toBe(1); // Executed only once
      expect(result1).toEqual(result2); // Same result
      expect(result1).toEqual({ count: 1 });
    });

    it('should handle execution failure', async () => {
      const executor = async () => {
        throw new Error('Execution failed');
      };

      await expect(
        service.execute(
          'wf-1',
          'task-1',
          'tool-1',
          {},
          'key-fail',
          executor,
          3
        )
      ).rejects.toThrow('Execution failed');

      // Verify entry was marked as failed
      const entry = await service.getByIdempotencyKey('key-fail');
      expect(entry?.state).toBe(OutboxEntryState.FAILED);
      expect(entry?.error).toBe('Execution failed');
      expect(entry?.attempts).toBe(1);
    });

    it('should reconcile stuck processing entries', async () => {
      const entry = await service.store({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'tool-1',
        params: {},
        idempotencyKey: 'key-stuck',
        maxAttempts: 3,
      });

      // Mark as processing
      await store.markProcessing(entry.id);

      // Simulate stuck entry by updating timestamp
      await store.update(entry.id, {
        updatedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      });

      const results = await service.reconcile();
      
      expect(results.length).toBe(1);
      expect(results[0].needsReconciliation).toBe(true);
      expect(results[0].actions[0].type).toBe('retry');

      // Verify entry was reset to PENDING
      const updated = await store.get(entry.id);
      expect(updated?.state).toBe(OutboxEntryState.PENDING);
    });

    it('should auto-retry failed entries during reconciliation', async () => {
      const entry = await service.store({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'tool-1',
        params: {},
        idempotencyKey: 'key-retry',
        maxAttempts: 3,
      });

      await store.markFailed(entry.id, 'Transient error');

      const results = await service.reconcile({ autoRetry: true });
      
      expect(results.length).toBe(1);
      expect(results[0].needsReconciliation).toBe(true);
      expect(results[0].actions[0].type).toBe('retry');

      // Verify entry was reset to PENDING
      const updated = await store.get(entry.id);
      expect(updated?.state).toBe(OutboxEntryState.PENDING);
    });

    it('should not reconcile entries exceeding max age', async () => {
      const entry = await service.store({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'tool-1',
        params: {},
        idempotencyKey: 'key-old',
        maxAttempts: 3,
      });

      // Simulate old entry
      await store.update(entry.id, {
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
      });

      const results = await service.reconcile({ 
        maxAgeMs: 24 * 60 * 60 * 1000 // Only reconcile entries < 24 hours old
      });
      
      expect(results.length).toBe(0); // Old entry should be skipped
    });

    it('should cleanup old committed entries', async () => {
      const entry = await service.store({
        workflowId: 'wf-1',
        taskId: 'task-1',
        toolId: 'tool-1',
        params: {},
        idempotencyKey: 'key-cleanup',
        maxAttempts: 3,
      });

      await service.commit(entry.id, { success: true });

      // Simulate old entry
      await store.update(entry.id, {
        committedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      });

      const cleaned = await service.cleanup(7 * 24 * 60 * 60 * 1000);
      expect(cleaned).toBe(1);

      const afterCleanup = await store.get(entry.id);
      expect(afterCleanup).toBeNull();
    });
  });
});
