import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgresMemoryStore } from '../src/postgres-memory-store';
import { PostgresAuditLog } from '../src/postgres-audit-log';
import { MemoryEntry, Provenance } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('PostgresMemoryStore', () => {
  let memoryStore: PostgresMemoryStore;
  let skipTests = false;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
      skipTests = true;
      console.log('Skipping PostgresMemoryStore tests - no database configured');
      return;
    }

    try {
      memoryStore = new PostgresMemoryStore();
      
      const schemaPath = path.join(__dirname, '../src/db-schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
        await memoryStore.initialize(schemaSQL);
      }
    } catch (error) {
      console.error('Failed to initialize PostgresMemoryStore:', error);
      skipTests = true;
    }
  });

  afterAll(async () => {
    if (memoryStore && !skipTests) {
      await memoryStore.close();
    }
  });

  it('should store and retrieve memory entries', async () => {
    if (skipTests) return;

    const provenance: Provenance = {
      task_id: 'task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    const entry: MemoryEntry = {
      id: 'memory-entry-pg-1',
      content: { data: 'test content' },
      type: 'episodic_note',
      provenance,
      tags: ['test', 'postgres'],
      metadata: { source: 'test' },
    };

    await memoryStore.storeEntry(entry);
    const retrieved = await memoryStore.getEntry('memory-entry-pg-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('memory-entry-pg-1');
    expect(retrieved?.type).toBe('episodic_note');
    expect(retrieved?.provenance.task_id).toBe('task-1');
  });

  it('should query entries by task_id', async () => {
    if (skipTests) return;

    const provenance: Provenance = {
      task_id: 'task-query-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    const entry: MemoryEntry = {
      id: 'memory-entry-pg-query-1',
      content: { data: 'query test' },
      type: 'episodic_note',
      provenance,
    };

    await memoryStore.storeEntry(entry);
    const results = await memoryStore.queryEntries({ task_id: 'task-query-1' });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(e => e.id === 'memory-entry-pg-query-1')).toBe(true);
  });

  it('should query entries by tags', async () => {
    if (skipTests) return;

    const provenance: Provenance = {
      task_id: 'task-tags-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    const entry: MemoryEntry = {
      id: 'memory-entry-pg-tags-1',
      content: { data: 'tags test' },
      type: 'artifact',
      provenance,
      tags: ['important', 'production'],
    };

    await memoryStore.storeEntry(entry);
    const results = await memoryStore.queryEntries({ tags: ['important'] });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(e => e.id === 'memory-entry-pg-tags-1')).toBe(true);
  });
});

describe('PostgresAuditLog', () => {
  let auditLog: PostgresAuditLog;
  let skipTests = false;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL && !process.env.DATABASE_HOST) {
      skipTests = true;
      console.log('Skipping PostgresAuditLog tests - no database configured');
      return;
    }

    try {
      auditLog = new PostgresAuditLog();
      
      const schemaPath = path.join(__dirname, '../src/db-schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
        await auditLog.initialize(schemaSQL);
      }
    } catch (error) {
      console.error('Failed to initialize PostgresAuditLog:', error);
      skipTests = true;
    }
  });

  afterAll(async () => {
    if (auditLog && !skipTests) {
      await auditLog.close();
    }
  });

  it('should append and retrieve audit log entries', async () => {
    if (skipTests) return;

    const stateBefore = { count: 0 };
    const stateAfter = { count: 1 };

    const entry = await auditLog.append(
      'agent-1',
      'increment',
      stateBefore,
      stateAfter
    );

    expect(entry.id).toBeDefined();
    expect(entry.actor).toBe('agent-1');
    expect(entry.action).toBe('increment');
    expect(entry.contentHash).toBeDefined();

    const retrieved = await auditLog.getById(entry.id);
    expect(retrieved).not.toBeUndefined();
    expect(retrieved?.id).toBe(entry.id);
  });

  it('should verify entry integrity', async () => {
    if (skipTests) return;

    const entry = await auditLog.append(
      'agent-verify',
      'test-action',
      { x: 1 },
      { x: 2 }
    );

    const isValid = await auditLog.verifyEntry(entry.id);
    expect(isValid).toBe(true);
  });

  it('should query entries by actor', async () => {
    if (skipTests) return;

    await auditLog.append('actor-query-test', 'action-1', {}, {});
    await auditLog.append('actor-query-test', 'action-2', {}, {});

    const entries = await auditLog.queryByActor('actor-query-test');
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every(e => e.actor === 'actor-query-test')).toBe(true);
  });

  it('should query entries by task_id', async () => {
    if (skipTests) return;

    const provenance: Provenance = {
      task_id: 'audit-task-1',
      step_id: 'step-1',
      timestamp: new Date(),
    };

    await auditLog.append('agent-1', 'action', {}, {}, { provenance });
    const entries = await auditLog.queryByTaskId('audit-task-1');

    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.every(e => e.provenance?.task_id === 'audit-task-1')).toBe(true);
  });
});
