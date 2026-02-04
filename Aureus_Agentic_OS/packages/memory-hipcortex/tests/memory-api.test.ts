import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAPI } from '../src/memory-api';
import { Provenance } from '../src';

describe('MemoryAPI', () => {
  let memoryAPI: MemoryAPI;

  beforeEach(() => {
    memoryAPI = new MemoryAPI();
  });

  describe('write', () => {
    it('should write memory entry with provenance', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      const entry = memoryAPI.write(
        { message: 'Test note' },
        provenance
      );

      expect(entry.id).toBeDefined();
      expect(entry.content).toEqual({ message: 'Test note' });
      expect(entry.type).toBe('episodic_note');
      expect(entry.provenance.task_id).toBe('task-1');
      expect(entry.provenance.step_id).toBe('step-1');
    });

    it('should write episodic notes', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      const entry = memoryAPI.write(
        { note: 'User clicked submit button' },
        provenance,
        { type: 'episodic_note', tags: ['user-action'] }
      );

      expect(entry.type).toBe('episodic_note');
      expect(entry.tags).toContain('user-action');
    });

    it('should write artifacts', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      const entry = memoryAPI.write(
        { filename: 'report.pdf', size: 1024 },
        provenance,
        { type: 'artifact', tags: ['report'] }
      );

      expect(entry.type).toBe('artifact');
      expect(entry.tags).toContain('report');
    });

    it('should write snapshots', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      const entry = memoryAPI.write(
        { state: { counter: 5 } },
        provenance,
        { type: 'snapshot' }
      );

      expect(entry.type).toBe('snapshot');
    });

    it('should require task_id in provenance', () => {
      const provenance = {
        task_id: '',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      expect(() => {
        memoryAPI.write({ data: 'test' }, provenance);
      }).toThrow('Provenance must include task_id and step_id');
    });

    it('should require step_id in provenance', () => {
      const provenance = {
        task_id: 'task-1',
        step_id: '',
        timestamp: new Date(),
      };

      expect(() => {
        memoryAPI.write({ data: 'test' }, provenance);
      }).toThrow('Provenance must include task_id and step_id');
    });

    it('should create audit log entry for writes', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        source_event_id: 'event-123',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'test' }, provenance);

      const auditLog = memoryAPI.getAuditLog();
      const entries = auditLog.getAll();

      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('memory_write');
      expect(entries[0].provenance?.task_id).toBe('task-1');
      expect(entries[0].sourceEventIds).toContain('event-123');
    });
  });

  describe('read', () => {
    it('should read entries by task_id', () => {
      const provenance1: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      const provenance2: Provenance = {
        task_id: 'task-2',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'task 1' }, provenance1);
      memoryAPI.write({ data: 'task 2' }, provenance2);

      const results = memoryAPI.read({ task_id: 'task-1' });
      expect(results).toHaveLength(1);
      expect(results[0].provenance.task_id).toBe('task-1');
    });

    it('should read entries by step_id', () => {
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

      memoryAPI.write({ data: 'step 1' }, provenance1);
      memoryAPI.write({ data: 'step 2' }, provenance2);

      const results = memoryAPI.read({ step_id: 'step-1' });
      expect(results).toHaveLength(1);
      expect(results[0].provenance.step_id).toBe('step-1');
    });

    it('should read entries by tags', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'note 1' }, provenance, { tags: ['important'] });
      memoryAPI.write({ data: 'note 2' }, provenance, { tags: ['draft'] });

      const results = memoryAPI.read({ tags: ['important'] });
      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('important');
    });

    it('should read entries by type', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'note' }, provenance, { type: 'episodic_note' });
      memoryAPI.write({ data: 'artifact' }, provenance, { type: 'artifact' });

      const results = memoryAPI.read({ type: 'artifact' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('artifact');
    });

    it('should read entries by time range', async () => {
      const startTime = new Date();

      const provenance1: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'first' }, provenance1);
      await new Promise(resolve => setTimeout(resolve, 10));

      const provenance2: Provenance = {
        task_id: 'task-1',
        step_id: 'step-2',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'second' }, provenance2);
      const endTime = new Date();

      const results = memoryAPI.read({
        timeRange: { start: startTime, end: endTime },
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should read with multiple filters', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'note' }, provenance, { 
        type: 'episodic_note', 
        tags: ['important'] 
      });
      memoryAPI.write({ data: 'artifact' }, provenance, { 
        type: 'artifact', 
        tags: ['important'] 
      });

      const results = memoryAPI.read({
        task_id: 'task-1',
        type: 'episodic_note',
        tags: ['important'],
      });

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('episodic_note');
    });
  });

  describe('list_timeline', () => {
    it('should list entries for a task in chronological order', () => {
      const provenance1: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      };

      const provenance2: Provenance = {
        task_id: 'task-1',
        step_id: 'step-2',
        timestamp: new Date('2024-01-01T11:00:00Z'),
      };

      const provenance3: Provenance = {
        task_id: 'task-1',
        step_id: 'step-3',
        timestamp: new Date('2024-01-01T09:00:00Z'),
      };

      // Add in non-chronological order
      memoryAPI.write({ data: 'second' }, provenance2);
      memoryAPI.write({ data: 'first' }, provenance1);
      memoryAPI.write({ data: 'earliest' }, provenance3);

      const timeline = memoryAPI.list_timeline('task-1');

      expect(timeline).toHaveLength(3);
      expect(timeline[0].provenance.step_id).toBe('step-3');
      expect(timeline[1].provenance.step_id).toBe('step-1');
      expect(timeline[2].provenance.step_id).toBe('step-2');
    });

    it('should return empty array for non-existent task', () => {
      const timeline = memoryAPI.list_timeline('non-existent-task');
      expect(timeline).toHaveLength(0);
    });
  });

  describe('helper methods', () => {
    it('should get entry by ID', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      const entry = memoryAPI.write({ data: 'test' }, provenance);
      const retrieved = memoryAPI.getEntry(entry.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(entry.id);
    });

    it('should get episodic notes for a task', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'note' }, provenance, { type: 'episodic_note' });
      memoryAPI.write({ data: 'artifact' }, provenance, { type: 'artifact' });

      const notes = memoryAPI.getEpisodicNotes('task-1');
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe('episodic_note');
    });

    it('should get artifacts for a task', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'note' }, provenance, { type: 'episodic_note' });
      memoryAPI.write({ data: 'artifact' }, provenance, { type: 'artifact' });

      const artifacts = memoryAPI.getArtifacts('task-1');
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].type).toBe('artifact');
    });

    it('should get snapshots for a task', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'note' }, provenance, { type: 'episodic_note' });
      memoryAPI.write({ state: {} }, provenance, { type: 'snapshot' });

      const snapshots = memoryAPI.getSnapshots('task-1');
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].type).toBe('snapshot');
    });

    it('should get statistics', () => {
      const provenance1: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      const provenance2: Provenance = {
        task_id: 'task-2',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      memoryAPI.write({ data: 'note' }, provenance1, { type: 'episodic_note' });
      memoryAPI.write({ data: 'artifact' }, provenance1, { type: 'artifact' });
      memoryAPI.write({ data: 'snapshot' }, provenance2, { type: 'snapshot' });

      const stats = memoryAPI.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.episodicNotes).toBe(1);
      expect(stats.artifacts).toBe(1);
      expect(stats.snapshots).toBe(1);
      expect(stats.tasks).toBe(2);
    });
  });

  describe('immutability', () => {
    it('should not allow modification of stored content', () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      const content = { value: 42 };
      memoryAPI.write(content, provenance);

      // Modify original content
      content.value = 999;

      const results = memoryAPI.read({ task_id: 'task-1' });
      expect((results[0].content as any).value).toBe(42);
    });
  });
});
