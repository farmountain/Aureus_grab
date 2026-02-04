import { Pool } from 'pg';
import * as crypto from 'crypto';
import { AuditLogEntry, Provenance } from './types';
import { DatabaseConfig, createDatabasePool } from '@aureus/kernel';

/**
 * PostgresAuditLog provides persistent append-only audit logging with cryptographic hashes
 */
export class PostgresAuditLog {
  private pool: Pool;

  constructor(config?: DatabaseConfig) {
    this.pool = createDatabasePool(config);
  }

  /**
   * Initialize the database schema
   */
  async initialize(schemaSQL?: string): Promise<void> {
    if (schemaSQL) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(schemaSQL);
        await client.query('COMMIT');
        console.log('PostgresAuditLog: Database schema initialized');
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('PostgresAuditLog: Schema initialization failed:', error);
        throw error;
      } finally {
        client.release();
      }
    }
  }

  /**
   * Append a new entry to the audit log
   */
  async append(
    actor: string,
    action: string,
    stateBefore: unknown,
    stateAfter: unknown,
    options?: {
      metadata?: Record<string, unknown>;
      sourceEventIds?: string[];
      provenance?: Provenance;
    }
  ): Promise<AuditLogEntry> {
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

    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO audit_log_entries (
           id, timestamp, actor, action, state_before, state_after, diff,
           metadata, content_hash, source_event_ids,
           provenance_task_id, provenance_step_id, provenance_source_event_id, provenance_timestamp
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          entry.id,
          entry.timestamp,
          actor,
          action,
          JSON.stringify(entry.stateBefore),
          JSON.stringify(entry.stateAfter),
          JSON.stringify(entry.diff),
          JSON.stringify(entry.metadata || {}),
          entry.contentHash,
          entry.sourceEventIds || [],
          entry.provenance?.task_id || null,
          entry.provenance?.step_id || null,
          entry.provenance?.source_event_id || null,
          entry.provenance?.timestamp || null,
        ]
      );
    } finally {
      client.release();
    }

    return entry;
  }

  /**
   * Get all entries in chronological order
   */
  async getAll(): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, actor, action, state_before, state_after, diff,
                metadata, content_hash, source_event_ids,
                provenance_task_id, provenance_step_id, provenance_source_event_id, provenance_timestamp
         FROM audit_log_entries
         ORDER BY timestamp ASC`
      );
      return result.rows.map(row => this.rowToEntry(row));
    } finally {
      client.release();
    }
  }

  /**
   * Get entry by ID
   */
  async getById(id: string): Promise<AuditLogEntry | undefined> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, actor, action, state_before, state_after, diff,
                metadata, content_hash, source_event_ids,
                provenance_task_id, provenance_step_id, provenance_source_event_id, provenance_timestamp
         FROM audit_log_entries
         WHERE id = $1`,
        [id]
      );
      return result.rows.length > 0 ? this.rowToEntry(result.rows[0]) : undefined;
    } finally {
      client.release();
    }
  }

  /**
   * Query entries by actor
   */
  async queryByActor(actor: string): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, actor, action, state_before, state_after, diff,
                metadata, content_hash, source_event_ids,
                provenance_task_id, provenance_step_id, provenance_source_event_id, provenance_timestamp
         FROM audit_log_entries
         WHERE actor = $1
         ORDER BY timestamp ASC`,
        [actor]
      );
      return result.rows.map(row => this.rowToEntry(row));
    } finally {
      client.release();
    }
  }

  /**
   * Query entries by action
   */
  async queryByAction(action: string): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, actor, action, state_before, state_after, diff,
                metadata, content_hash, source_event_ids,
                provenance_task_id, provenance_step_id, provenance_source_event_id, provenance_timestamp
         FROM audit_log_entries
         WHERE action = $1
         ORDER BY timestamp ASC`,
        [action]
      );
      return result.rows.map(row => this.rowToEntry(row));
    } finally {
      client.release();
    }
  }

  /**
   * Query entries by time range
   */
  async queryByTimeRange(start: Date, end: Date): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, actor, action, state_before, state_after, diff,
                metadata, content_hash, source_event_ids,
                provenance_task_id, provenance_step_id, provenance_source_event_id, provenance_timestamp
         FROM audit_log_entries
         WHERE timestamp >= $1 AND timestamp <= $2
         ORDER BY timestamp ASC`,
        [start, end]
      );
      return result.rows.map(row => this.rowToEntry(row));
    } finally {
      client.release();
    }
  }

  /**
   * Query entries by task_id (from provenance)
   */
  async queryByTaskId(task_id: string): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, actor, action, state_before, state_after, diff,
                metadata, content_hash, source_event_ids,
                provenance_task_id, provenance_step_id, provenance_source_event_id, provenance_timestamp
         FROM audit_log_entries
         WHERE provenance_task_id = $1
         ORDER BY timestamp ASC`,
        [task_id]
      );
      return result.rows.map(row => this.rowToEntry(row));
    } finally {
      client.release();
    }
  }

  /**
   * Query entries by step_id (from provenance)
   */
  async queryByStepId(step_id: string): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, actor, action, state_before, state_after, diff,
                metadata, content_hash, source_event_ids,
                provenance_task_id, provenance_step_id, provenance_source_event_id, provenance_timestamp
         FROM audit_log_entries
         WHERE provenance_step_id = $1
         ORDER BY timestamp ASC`,
        [step_id]
      );
      return result.rows.map(row => this.rowToEntry(row));
    } finally {
      client.release();
    }
  }

  /**
   * Verify the integrity of an entry by checking its hash
   */
  async verifyEntry(entryId: string): Promise<boolean> {
    const entry = await this.getById(entryId);
    if (!entry) return false;

    const storedHash = entry.contentHash;
    const computedHash = this.computeHash(entry);
    
    return storedHash === computedHash;
  }

  /**
   * Verify integrity of all entries
   */
  async verifyAll(): Promise<{ valid: boolean; invalidEntries: string[] }> {
    const entries = await this.getAll();
    const invalidEntries: string[] = [];

    for (const entry of entries) {
      const valid = await this.verifyEntry(entry.id);
      if (!valid) {
        invalidEntries.push(entry.id);
      }
    }

    return {
      valid: invalidEntries.length === 0,
      invalidEntries,
    };
  }

  /**
   * Convert database row to AuditLogEntry
   */
  private rowToEntry(row: any): AuditLogEntry {
    const stateBefore = typeof row.state_before === 'string' ? JSON.parse(row.state_before) : row.state_before;
    const stateAfter = typeof row.state_after === 'string' ? JSON.parse(row.state_after) : row.state_after;
    const diff = typeof row.diff === 'string' ? JSON.parse(row.diff) : row.diff;
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;

    const entry: AuditLogEntry = {
      id: row.id,
      timestamp: new Date(row.timestamp),
      actor: row.actor,
      action: row.action,
      stateBefore,
      stateAfter,
      diff,
      metadata: metadata || undefined,
      contentHash: row.content_hash,
      sourceEventIds: row.source_event_ids || undefined,
    };

    if (row.provenance_task_id) {
      entry.provenance = {
        task_id: row.provenance_task_id,
        step_id: row.provenance_step_id,
        source_event_id: row.provenance_source_event_id || undefined,
        timestamp: new Date(row.provenance_timestamp),
      };
    }

    return entry;
  }

  /**
   * Compute SHA-256 hash of entry content
   */
  private computeHash(entry: AuditLogEntry): string {
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

  /**
   * Close the database pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
