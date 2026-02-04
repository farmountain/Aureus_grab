import * as crypto from 'crypto';
import { AuditLogEntry, Provenance } from './types';

/**
 * AuditLog provides append-only event logging with cryptographic hashes
 * and references to source events for full traceability
 */
export class AuditLog {
  private entries: AuditLogEntry[] = [];
  private entryById: Map<string, AuditLogEntry> = new Map();

  /**
   * Append a new entry to the audit log
   * Entries are immutable and cryptographically hashed
   */
  append(
    actor: string,
    action: string,
    stateBefore: unknown,
    stateAfter: unknown,
    options?: {
      metadata?: Record<string, unknown>;
      sourceEventIds?: string[];
      provenance?: Provenance;
    }
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      actor,
      action,
      stateBefore: this.deepClone(stateBefore),
      stateAfter: this.deepClone(stateAfter),
      diff: this.computeDiff(stateBefore, stateAfter),
      metadata: options?.metadata,
      sourceEventIds: options?.sourceEventIds,
      provenance: options?.provenance,
    };

    // Compute content hash for integrity verification
    entry.contentHash = this.computeHash(entry);

    this.entries.push(entry);
    this.entryById.set(entry.id, entry);

    return entry;
  }

  /**
   * Get all entries in chronological order
   */
  getAll(): AuditLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get entry by ID
   */
  getById(id: string): AuditLogEntry | undefined {
    return this.entryById.get(id);
  }

  /**
   * Query entries by actor
   */
  queryByActor(actor: string): AuditLogEntry[] {
    return this.entries.filter(entry => entry.actor === actor);
  }

  /**
   * Query entries by action
   */
  queryByAction(action: string): AuditLogEntry[] {
    return this.entries.filter(entry => entry.action === action);
  }

  /**
   * Query entries by time range
   */
  queryByTimeRange(start: Date, end: Date): AuditLogEntry[] {
    return this.entries.filter(
      entry => entry.timestamp >= start && entry.timestamp <= end
    );
  }

  /**
   * Query entries by task_id (from provenance)
   */
  queryByTaskId(task_id: string): AuditLogEntry[] {
    return this.entries.filter(entry => entry.provenance?.task_id === task_id);
  }

  /**
   * Query entries by step_id (from provenance)
   */
  queryByStepId(step_id: string): AuditLogEntry[] {
    return this.entries.filter(entry => entry.provenance?.step_id === step_id);
  }

  /**
   * Query entries that reference a source event
   */
  queryBySourceEventId(sourceEventId: string): AuditLogEntry[] {
    return this.entries.filter(
      entry => entry.sourceEventIds?.includes(sourceEventId)
    );
  }

  /**
   * Verify the integrity of an entry by checking its hash
   */
  verifyEntry(entryId: string): boolean {
    const entry = this.entryById.get(entryId);
    if (!entry) return false;

    const storedHash = entry.contentHash;
    const computedHash = this.computeHash(entry);
    
    return storedHash === computedHash;
  }

  /**
   * Verify integrity of all entries
   */
  verifyAll(): { valid: boolean; invalidEntries: string[] } {
    const invalidEntries: string[] = [];

    for (const entry of this.entries) {
      if (!this.verifyEntry(entry.id)) {
        invalidEntries.push(entry.id);
      }
    }

    return {
      valid: invalidEntries.length === 0,
      invalidEntries,
    };
  }

  /**
   * Compute SHA-256 hash of entry content
   */
  private computeHash(entry: AuditLogEntry): string {
    // Create a copy without the hash field itself
    const { contentHash, ...entryWithoutHash } = entry;
    const content = JSON.stringify(entryWithoutHash, this.sortKeys);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Compute diff between two states
   */
  private computeDiff(before: unknown, after: unknown): unknown {
    return {
      before: this.deepClone(before),
      after: this.deepClone(after),
      changed: JSON.stringify(before) !== JSON.stringify(after),
    };
  }

  /**
   * Deep clone to prevent mutation
   */
  private deepClone(obj: unknown): unknown {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Sort object keys for consistent hashing
   */
  private sortKeys(key: string, value: unknown): unknown {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      Object.keys(value as Record<string, unknown>)
        .sort()
        .forEach(k => {
          sorted[k] = (value as Record<string, unknown>)[k];
        });
      return sorted;
    }
    return value;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
