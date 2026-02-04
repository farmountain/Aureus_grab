import { describe, it, expect, beforeEach } from 'vitest';
import {
  StreamingContextAPI,
  ContextRetrievalAPI,
  MemoryEntry,
  MemoryQuery,
} from '../src';

describe('StreamingContextAPI', () => {
  let api: StreamingContextAPI;
  let testEntries: MemoryEntry[];

  beforeEach(() => {
    api = new StreamingContextAPI();
    
    // Create test entries
    testEntries = [];
    for (let i = 0; i < 50; i++) {
      testEntries.push({
        id: `entry-${i}`,
        content: { data: `test-${i}` },
        type: 'episodic_note',
        provenance: {
          task_id: 'task-1',
          step_id: `step-${i}`,
          timestamp: new Date(Date.now() - (50 - i) * 1000), // Older entries first
        },
        tags: i % 2 === 0 ? ['even'] : ['odd'],
      });
    }
  });

  describe('createIterator', () => {
    it('should create an iterator and return ID', () => {
      const iteratorId = api.createIterator(testEntries, {}, { batchSize: 10 });
      
      expect(iteratorId).toBeDefined();
      expect(iteratorId).toContain('iter-');
    });
  });

  describe('getNextBatch', () => {
    it('should return batches in order', () => {
      const iteratorId = api.createIterator(testEntries, {}, { batchSize: 10 });
      
      const batch1 = api.getNextBatch(iteratorId, 10);
      expect(batch1).toBeDefined();
      expect(batch1!.batchNumber).toBe(0);
      expect(batch1!.entries).toHaveLength(10);
      expect(batch1!.hasMore).toBe(true);

      const batch2 = api.getNextBatch(iteratorId, 10);
      expect(batch2!.batchNumber).toBe(1);
      expect(batch2!.entries).toHaveLength(10);
    });

    it('should mark last batch correctly', () => {
      const iteratorId = api.createIterator(testEntries.slice(0, 15), {}, { batchSize: 10 });
      
      api.getNextBatch(iteratorId, 10); // First batch
      const lastBatch = api.getNextBatch(iteratorId, 10); // Second batch
      
      expect(lastBatch!.hasMore).toBe(false);
      expect(lastBatch!.entries).toHaveLength(5);
    });

    it('should return null when iterator is completed', () => {
      const iteratorId = api.createIterator(testEntries.slice(0, 5), {}, { batchSize: 10 });
      
      api.getNextBatch(iteratorId, 10);
      const secondBatch = api.getNextBatch(iteratorId, 10);
      
      expect(secondBatch).toBeNull();
    });
  });

  describe('streamBatches', () => {
    it('should stream all batches', async () => {
      const batches: any[] = [];
      
      for await (const batch of api.streamBatches(testEntries, { batchSize: 10 })) {
        batches.push(batch);
      }
      
      expect(batches).toHaveLength(5); // 50 entries / 10 per batch
      expect(batches[0].entries).toHaveLength(10);
      expect(batches[4].entries).toHaveLength(10);
    });

    it('should respect maxBatches limit', async () => {
      const batches: any[] = [];
      
      for await (const batch of api.streamBatches(testEntries, { 
        batchSize: 10,
        maxBatches: 3,
      })) {
        batches.push(batch);
      }
      
      expect(batches).toHaveLength(3);
    });

    it('should sort entries by priority', async () => {
      const batches: any[] = [];
      
      for await (const batch of api.streamBatches(testEntries, { 
        batchSize: 50,
        priorityOrder: 'recent',
      })) {
        batches.push(batch);
      }
      
      const firstEntry = batches[0].entries[0];
      const lastEntry = batches[0].entries[batches[0].entries.length - 1];
      
      // Recent first means higher timestamp first
      expect(firstEntry.provenance.timestamp.getTime())
        .toBeGreaterThan(lastEntry.provenance.timestamp.getTime());
    });
  });

  describe('getIncrementalContext', () => {
    it('should return only new entries', () => {
      const cutoffTime = new Date(Date.now() - 25 * 1000); // 25 seconds ago
      
      const newEntries = api.getIncrementalContext(testEntries, cutoffTime);
      
      expect(newEntries.length).toBeLessThan(testEntries.length);
      
      // All returned entries should be newer than cutoff
      for (const entry of newEntries) {
        expect(entry.provenance.timestamp.getTime())
          .toBeGreaterThan(cutoffTime.getTime());
      }
    });

    it('should respect maxEntries limit', () => {
      const cutoffTime = new Date(Date.now() - 25 * 1000);
      
      const newEntries = api.getIncrementalContext(testEntries, cutoffTime, 5);
      
      expect(newEntries).toHaveLength(5);
    });

    it('should return empty array if no new entries', () => {
      const futureTime = new Date(Date.now() + 1000);
      
      const newEntries = api.getIncrementalContext(testEntries, futureTime);
      
      expect(newEntries).toHaveLength(0);
    });
  });

  describe('getContextWindow', () => {
    it('should return sliding window of entries', () => {
      const window = api.getContextWindow(testEntries, 10, 0);
      
      expect(window).toHaveLength(10);
      
      // Should be most recent entries
      expect(window[0].id).toBe('entry-49'); // Most recent
    });

    it('should support window offset', () => {
      const window1 = api.getContextWindow(testEntries, 5, 0);
      const window2 = api.getContextWindow(testEntries, 5, 5);
      
      expect(window1[0].id).not.toBe(window2[0].id);
      expect(window1[window1.length - 1].id).not.toBe(window2[0].id);
    });
  });

  describe('getPaginatedContext', () => {
    it('should return paginated results', () => {
      const page1 = api.getPaginatedContext(testEntries, 0, 10);
      
      expect(page1.entries).toHaveLength(10);
      expect(page1.page).toBe(0);
      expect(page1.pageSize).toBe(10);
      expect(page1.totalPages).toBe(5);
      expect(page1.totalEntries).toBe(50);
    });

    it('should handle different pages', () => {
      const page1 = api.getPaginatedContext(testEntries, 0, 10);
      const page2 = api.getPaginatedContext(testEntries, 1, 10);
      
      expect(page1.entries[0].id).not.toBe(page2.entries[0].id);
    });

    it('should handle last page with fewer entries', () => {
      const lastPage = api.getPaginatedContext(testEntries.slice(0, 25), 2, 10);
      
      expect(lastPage.entries).toHaveLength(5);
      expect(lastPage.page).toBe(2);
      expect(lastPage.totalPages).toBe(3);
    });
  });

  describe('closeIterator', () => {
    it('should close iterator and free resources', () => {
      const iteratorId = api.createIterator(testEntries, {}, { batchSize: 10 });
      
      expect(api.getActiveIteratorCount()).toBe(1);
      
      api.closeIterator(iteratorId);
      
      expect(api.getActiveIteratorCount()).toBe(0);
    });
  });
});

describe('ContextRetrievalAPI', () => {
  let api: ContextRetrievalAPI;
  let testEntries: MemoryEntry[];

  beforeEach(() => {
    api = new ContextRetrievalAPI();
    
    testEntries = [];
    for (let i = 0; i < 20; i++) {
      testEntries.push({
        id: `entry-${i}`,
        content: { data: `test-${i}` },
        type: 'episodic_note',
        provenance: {
          task_id: i < 10 ? 'task-1' : 'task-2',
          step_id: `step-${i}`,
          timestamp: new Date(Date.now() - (20 - i) * 1000),
        },
        tags: i % 3 === 0 ? ['tool-read'] : [],
        metadata: i % 5 === 0 ? { toolName: 'read' } : {},
      });
    }
  });

  describe('getToolContext', () => {
    it('should return entries relevant to tool', async () => {
      const context = await api.getToolContext(testEntries, 'read', 10);
      
      expect(context.length).toBeGreaterThan(0);
      
      // Check that entries are relevant to the tool
      for (const entry of context) {
        const isRelevant = 
          entry.tags?.includes('tool-read') ||
          entry.metadata?.toolName === 'read' ||
          entry.tags?.includes('read');
        expect(isRelevant).toBe(true);
      }
    });

    it('should respect maxEntries limit', async () => {
      const context = await api.getToolContext(testEntries, 'read', 2);
      
      expect(context.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getWorkflowContext', () => {
    it('should return entries for specific task', async () => {
      const context = await api.getWorkflowContext(testEntries, 'task-1', false);
      
      expect(context).toHaveLength(10);
      
      for (const entry of context) {
        expect(entry.provenance.task_id).toBe('task-1');
      }
    });

    it('should include related entries when requested', async () => {
      // Add some related entries with matching tags
      testEntries[0].tags = ['shared-tag'];
      testEntries[15].tags = ['shared-tag'];
      
      const context = await api.getWorkflowContext(testEntries, 'task-1', true);
      
      expect(context.length).toBeGreaterThan(10);
    });

    it('should sort entries by timestamp', async () => {
      const context = await api.getWorkflowContext(testEntries, 'task-1', false);
      
      for (let i = 1; i < context.length; i++) {
        expect(context[i].provenance.timestamp.getTime())
          .toBeGreaterThanOrEqual(context[i - 1].provenance.timestamp.getTime());
      }
    });
  });

  describe('streamContext', () => {
    it('should stream context in batches', async () => {
      const batches: any[] = [];
      
      for await (const batch of api.streamContext(testEntries, { batchSize: 5 })) {
        batches.push(batch);
      }
      
      expect(batches.length).toBeGreaterThan(0);
      expect(batches[0].entries.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getIncrementalUpdates', () => {
    it('should return only new entries', () => {
      const cutoffTime = new Date(Date.now() - 10 * 1000);
      
      const updates = api.getIncrementalUpdates(testEntries, cutoffTime, 20);
      
      expect(updates.length).toBeLessThan(testEntries.length);
      
      for (const entry of updates) {
        expect(entry.provenance.timestamp.getTime())
          .toBeGreaterThan(cutoffTime.getTime());
      }
    });
  });
});
