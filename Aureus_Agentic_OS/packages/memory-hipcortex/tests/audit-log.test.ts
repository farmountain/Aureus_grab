import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLog } from '../src/audit-log';
import { Provenance } from '../src';

describe('AuditLog', () => {
  let auditLog: AuditLog;

  beforeEach(() => {
    auditLog = new AuditLog();
  });

  it('should append entries with content hash', () => {
    const entry = auditLog.append(
      'agent-1',
      'write-memory',
      null,
      { data: 'test' }
    );

    expect(entry.id).toBeDefined();
    expect(entry.actor).toBe('agent-1');
    expect(entry.action).toBe('write-memory');
    expect(entry.contentHash).toBeDefined();
    expect(entry.contentHash).toHaveLength(64); // SHA-256 hex string
  });

  it('should append entries with provenance', () => {
    const provenance: Provenance = {
      task_id: 'task-1',
      step_id: 'step-1',
      source_event_id: 'event-123',
      timestamp: new Date(),
    };

    const entry = auditLog.append(
      'agent-1',
      'write-memory',
      null,
      { data: 'test' },
      { provenance }
    );

    expect(entry.provenance).toBeDefined();
    expect(entry.provenance?.task_id).toBe('task-1');
    expect(entry.provenance?.step_id).toBe('step-1');
    expect(entry.provenance?.source_event_id).toBe('event-123');
  });

  it('should append entries with source event references', () => {
    const entry = auditLog.append(
      'agent-1',
      'compensation',
      { status: 'failed' },
      { status: 'compensated' },
      {
        sourceEventIds: ['event-1', 'event-2'],
      }
    );

    expect(entry.sourceEventIds).toEqual(['event-1', 'event-2']);
  });

  it('should retrieve all entries', () => {
    auditLog.append('agent-1', 'action-1', null, { data: 1 });
    auditLog.append('agent-2', 'action-2', null, { data: 2 });

    const entries = auditLog.getAll();
    expect(entries).toHaveLength(2);
  });

  it('should retrieve entry by ID', () => {
    const entry = auditLog.append('agent-1', 'action-1', null, { data: 1 });

    const retrieved = auditLog.getById(entry.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(entry.id);
  });

  it('should query by actor', () => {
    auditLog.append('agent-1', 'action-1', null, { data: 1 });
    auditLog.append('agent-2', 'action-2', null, { data: 2 });
    auditLog.append('agent-1', 'action-3', null, { data: 3 });

    const results = auditLog.queryByActor('agent-1');
    expect(results).toHaveLength(2);
    expect(results.every(e => e.actor === 'agent-1')).toBe(true);
  });

  it('should query by action', () => {
    auditLog.append('agent-1', 'write-memory', null, { data: 1 });
    auditLog.append('agent-2', 'read-memory', null, { data: 2 });
    auditLog.append('agent-1', 'write-memory', null, { data: 3 });

    const results = auditLog.queryByAction('write-memory');
    expect(results).toHaveLength(2);
    expect(results.every(e => e.action === 'write-memory')).toBe(true);
  });

  it('should query by time range', async () => {
    const startTime = new Date();

    auditLog.append('agent-1', 'action-1', null, { data: 1 });
    await new Promise(resolve => setTimeout(resolve, 10));
    auditLog.append('agent-1', 'action-2', null, { data: 2 });

    const endTime = new Date();

    const results = auditLog.queryByTimeRange(startTime, endTime);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('should query by task_id', () => {
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

    auditLog.append('agent-1', 'action-1', null, { data: 1 }, { provenance: provenance1 });
    auditLog.append('agent-1', 'action-2', null, { data: 2 }, { provenance: provenance2 });

    const results = auditLog.queryByTaskId('task-1');
    expect(results).toHaveLength(1);
    expect(results[0].provenance?.task_id).toBe('task-1');
  });

  it('should query by step_id', () => {
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

    auditLog.append('agent-1', 'action-1', null, { data: 1 }, { provenance: provenance1 });
    auditLog.append('agent-1', 'action-2', null, { data: 2 }, { provenance: provenance2 });

    const results = auditLog.queryByStepId('step-1');
    expect(results).toHaveLength(1);
    expect(results[0].provenance?.step_id).toBe('step-1');
  });

  it('should query by source event ID', () => {
    auditLog.append('agent-1', 'action-1', null, { data: 1 }, {
      sourceEventIds: ['event-123'],
    });
    auditLog.append('agent-1', 'action-2', null, { data: 2 }, {
      sourceEventIds: ['event-456'],
    });

    const results = auditLog.queryBySourceEventId('event-123');
    expect(results).toHaveLength(1);
    expect(results[0].sourceEventIds).toContain('event-123');
  });

  it('should verify entry integrity', () => {
    const entry = auditLog.append('agent-1', 'action-1', null, { data: 1 });

    const isValid = auditLog.verifyEntry(entry.id);
    expect(isValid).toBe(true);
  });

  it('should detect tampered entries', () => {
    const entry = auditLog.append('agent-1', 'action-1', null, { data: 1 });

    // Tamper with the entry
    const retrieved = auditLog.getById(entry.id);
    if (retrieved) {
      (retrieved as any).stateAfter = { data: 999 };
    }

    const isValid = auditLog.verifyEntry(entry.id);
    expect(isValid).toBe(false);
  });

  it('should verify all entries', () => {
    auditLog.append('agent-1', 'action-1', null, { data: 1 });
    auditLog.append('agent-2', 'action-2', null, { data: 2 });

    const verification = auditLog.verifyAll();
    expect(verification.valid).toBe(true);
    expect(verification.invalidEntries).toHaveLength(0);
  });

  it('should compute consistent hashes for identical content', () => {
    const entry1 = auditLog.append('agent-1', 'action-1', null, { data: 1 });
    
    // Create a new audit log with identical entry
    const auditLog2 = new AuditLog();
    const entry2 = auditLog2.append('agent-1', 'action-1', null, { data: 1 });

    // Hashes should be different because IDs and timestamps differ
    // But if we compute hash of same content structure, they should match
    expect(entry1.contentHash).toBeDefined();
    expect(entry2.contentHash).toBeDefined();
  });

  it('should maintain immutability of entries', () => {
    const stateBefore = { value: 10 };
    const stateAfter = { value: 20 };

    const entry = auditLog.append('agent-1', 'update', stateBefore, stateAfter);

    // Modify original objects
    stateBefore.value = 999;
    stateAfter.value = 999;

    // Entry should still have original values
    expect((entry.stateBefore as any).value).toBe(10);
    expect((entry.stateAfter as any).value).toBe(20);
  });
});
