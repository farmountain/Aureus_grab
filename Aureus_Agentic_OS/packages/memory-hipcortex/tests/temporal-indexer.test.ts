import { describe, it, expect, beforeEach } from 'vitest';
import { TemporalIndexer } from '../src/temporal-indexer';
import { MemoryEntry, Provenance } from '../src';

describe('TemporalIndexer', () => {
  let indexer: TemporalIndexer;

  beforeEach(() => {
    indexer = new TemporalIndexer();
  });

  it('should index memory entries', () => {
    const provenance: Provenance = {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    const entry: MemoryEntry = {
      id: 'entry-1',
      content: { message: 'Test note' },
      type: 'episodic_note',
      provenance,
      tags: ['test', 'important'],
    };

    const index = indexer.indexEntry(entry);

    expect(index.id).toBeDefined();
    expect(index.entryId).toBe('entry-1');
    expect(index.task_id).toBe('task-1');
    expect(index.step_id).toBe('step-1');
    expect(index.tags).toEqual(['test', 'important']);
  });

  it('should query by task_id', () => {
    const provenance1: Provenance = {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    const provenance2: Provenance = {
      task_id: 'task-2',
      step_id: 'step-2',
      timestamp: new Date(),
    };

    const entry1: MemoryEntry = {
      id: 'entry-1',
      content: { message: 'Task 1' },
      type: 'episodic_note',
      provenance: provenance1,
    };

    const entry2: MemoryEntry = {
      id: 'entry-2',
      content: { message: 'Task 2' },
      type: 'episodic_note',
      provenance: provenance2,
    };

    indexer.indexEntry(entry1);
    indexer.indexEntry(entry2);

    const results = indexer.queryByTaskId('task-1');
    expect(results).toHaveLength(1);
    expect(results[0].entryId).toBe('entry-1');
  });

  it('should query by step_id', () => {
    const provenance: Provenance = {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    const entry: MemoryEntry = {
      id: 'entry-1',
      content: { message: 'Step 1' },
      type: 'episodic_note',
      provenance,
    };

    indexer.indexEntry(entry);

    const results = indexer.queryByStepId('step-1');
    expect(results).toHaveLength(1);
    expect(results[0].step_id).toBe('step-1');
  });

  it('should query by tag', () => {
    const provenance: Provenance = {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    const entry: MemoryEntry = {
      id: 'entry-1',
      content: { message: 'Tagged note' },
      type: 'episodic_note',
      provenance,
      tags: ['important', 'urgent'],
    };

    indexer.indexEntry(entry);

    const results = indexer.queryByTag('important');
    expect(results).toHaveLength(1);
    expect(results[0].tags).toContain('important');
  });

  it('should query by time range', async () => {
    const startTime = new Date();

    const provenance1: Provenance = {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    const entry1: MemoryEntry = {
      id: 'entry-1',
      content: { message: 'First' },
      type: 'episodic_note',
      provenance: provenance1,
    };

    indexer.indexEntry(entry1);
    await new Promise(resolve => setTimeout(resolve, 10));

    const provenance2: Provenance = {
      task_id: 'task-1',
      step_id: 'step-2',
      timestamp: new Date(),
    };

    const entry2: MemoryEntry = {
      id: 'entry-2',
      content: { message: 'Second' },
      type: 'episodic_note',
      provenance: provenance2,
    };

    indexer.indexEntry(entry2);

    const endTime = new Date();

    const results = indexer.queryByTimeRange(startTime, endTime);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('should query with multiple filters', () => {
    const provenance1: Provenance = {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    const provenance2: Provenance = {
      task_id: 'task-1',
      step_id: 'step-2',
      timestamp: new Date(),
    };

    const entry1: MemoryEntry = {
      id: 'entry-1',
      content: { message: 'Step 1' },
      type: 'episodic_note',
      provenance: provenance1,
      tags: ['important'],
    };

    const entry2: MemoryEntry = {
      id: 'entry-2',
      content: { message: 'Step 2' },
      type: 'episodic_note',
      provenance: provenance2,
      tags: ['draft'],
    };

    indexer.indexEntry(entry1);
    indexer.indexEntry(entry2);

    const results = indexer.query({
      task_id: 'task-1',
      tags: ['important'],
    });

    expect(results).toHaveLength(1);
    expect(results[0].step_id).toBe('step-1');
  });

  it('should get all indices sorted by timestamp', () => {
    const provenance1: Provenance = {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date('2024-01-01'),
    };

    const provenance2: Provenance = {
      task_id: 'task-1',
      step_id: 'step-2',
      timestamp: new Date('2024-01-02'),
    };

    const entry1: MemoryEntry = {
      id: 'entry-1',
      content: { message: 'Later' },
      type: 'episodic_note',
      provenance: provenance2,
    };

    const entry2: MemoryEntry = {
      id: 'entry-2',
      content: { message: 'Earlier' },
      type: 'episodic_note',
      provenance: provenance1,
    };

    // Add in reverse chronological order
    indexer.indexEntry(entry1);
    indexer.indexEntry(entry2);

    const results = indexer.getAllIndices();
    expect(results).toHaveLength(2);
    // Should be sorted by timestamp
    expect(results[0].timestamp.getTime()).toBeLessThan(results[1].timestamp.getTime());
  });
});
