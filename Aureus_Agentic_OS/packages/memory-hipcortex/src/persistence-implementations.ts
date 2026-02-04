import { Pool } from 'pg';
import { 
  Snapshot, 
  AuditLogEntry, 
  TemporalIndex,
  SnapshotPersistence,
  AuditLogPersistence,
  TemporalIndexPersistence
} from './types';
import { computeAuditLogHash } from './hash-utils';

/**
 * PostgreSQL implementation of SnapshotPersistence
 */
export class PostgresSnapshotPersistence implements SnapshotPersistence {
  constructor(private pool: Pool) {}

  async save(snapshot: Snapshot): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO snapshots (id, timestamp, state, verified, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id)
         DO UPDATE SET
           timestamp = EXCLUDED.timestamp,
           state = EXCLUDED.state,
           verified = EXCLUDED.verified,
           metadata = EXCLUDED.metadata`,
        [
          snapshot.id,
          snapshot.timestamp,
          JSON.stringify(snapshot.state),
          snapshot.verified,
          JSON.stringify(snapshot.metadata || {}),
        ]
      );
    } finally {
      client.release();
    }
  }

  async load(snapshotId: string): Promise<Snapshot | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, state, verified, metadata
         FROM snapshots
         WHERE id = $1`,
        [snapshotId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToSnapshot(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async loadAll(): Promise<Snapshot[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, state, verified, metadata
         FROM snapshots
         ORDER BY timestamp ASC`
      );
      return result.rows.map((row: any) => this.rowToSnapshot(row));
    } finally {
      client.release();
    }
  }

  async loadVerified(): Promise<Snapshot[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, state, verified, metadata
         FROM snapshots
         WHERE verified = true
         ORDER BY timestamp ASC`
      );
      return result.rows.map((row: any) => this.rowToSnapshot(row));
    } finally {
      client.release();
    }
  }

  private rowToSnapshot(row: any): Snapshot {
    const state = typeof row.state === 'string' ? JSON.parse(row.state) : row.state;
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;

    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      state,
      verified: row.verified,
      metadata: metadata || undefined,
    };
  }
}

/**
 * PostgreSQL implementation of AuditLogPersistence
 */
export class PostgresAuditLogPersistence implements AuditLogPersistence {
  constructor(private pool: Pool) {}

  async save(entry: AuditLogEntry): Promise<void> {
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
          entry.actor,
          entry.action,
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
  }

  async loadAll(): Promise<AuditLogEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, actor, action, state_before, state_after, diff,
                metadata, content_hash, source_event_ids,
                provenance_task_id, provenance_step_id, provenance_source_event_id, provenance_timestamp
         FROM audit_log_entries
         ORDER BY timestamp ASC`
      );
      return result.rows.map((row: any) => this.rowToEntry(row));
    } finally {
      client.release();
    }
  }

  async verifyIntegrity(entries: AuditLogEntry[]): Promise<{ valid: boolean; invalidEntries: string[] }> {
    const invalidEntries: string[] = [];

    for (const entry of entries) {
      const storedHash = entry.contentHash;
      const computedHash = computeAuditLogHash(entry);
      
      if (storedHash !== computedHash) {
        invalidEntries.push(entry.id);
      }
    }

    return {
      valid: invalidEntries.length === 0,
      invalidEntries,
    };
  }

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
}

/**
 * PostgreSQL implementation of TemporalIndexPersistence
 */
export class PostgresTemporalIndexPersistence implements TemporalIndexPersistence {
  constructor(private pool: Pool) {}

  async save(index: TemporalIndex): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO temporal_indices (id, timestamp, snapshot_id, entry_id, task_id, step_id, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id)
         DO UPDATE SET
           timestamp = EXCLUDED.timestamp,
           snapshot_id = EXCLUDED.snapshot_id,
           entry_id = EXCLUDED.entry_id,
           task_id = EXCLUDED.task_id,
           step_id = EXCLUDED.step_id,
           tags = EXCLUDED.tags`,
        [
          index.id,
          index.timestamp,
          index.snapshotId || null,
          index.entryId || null,
          index.task_id || null,
          index.step_id || null,
          index.tags || [],
        ]
      );
    } finally {
      client.release();
    }
  }

  async loadAll(): Promise<TemporalIndex[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, timestamp, snapshot_id, entry_id, task_id, step_id, tags
         FROM temporal_indices
         ORDER BY timestamp ASC`
      );
      return result.rows.map((row: any) => this.rowToIndex(row));
    } finally {
      client.release();
    }
  }

  async query(filters: {
    task_id?: string;
    step_id?: string;
    tags?: string[];
    timeRange?: { start: Date; end: Date };
  }): Promise<TemporalIndex[]> {
    const client = await this.pool.connect();
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.task_id) {
        conditions.push(`task_id = $${paramIndex++}`);
        params.push(filters.task_id);
      }

      if (filters.step_id) {
        conditions.push(`step_id = $${paramIndex++}`);
        params.push(filters.step_id);
      }

      if (filters.tags && filters.tags.length > 0) {
        conditions.push(`tags @> $${paramIndex++}`);
        params.push(filters.tags);
      }

      if (filters.timeRange) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        params.push(filters.timeRange.start);
        conditions.push(`timestamp <= $${paramIndex++}`);
        params.push(filters.timeRange.end);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT id, timestamp, snapshot_id, entry_id, task_id, step_id, tags
                   FROM temporal_indices
                   ${whereClause}
                   ORDER BY timestamp ASC`;

      const result = await client.query(sql, params);
      return result.rows.map((row: any) => this.rowToIndex(row));
    } finally {
      client.release();
    }
  }

  private rowToIndex(row: any): TemporalIndex {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      snapshotId: row.snapshot_id || undefined,
      entryId: row.entry_id || undefined,
      task_id: row.task_id || undefined,
      step_id: row.step_id || undefined,
      tags: row.tags || undefined,
    };
  }
}

/**
 * In-memory implementation of SnapshotPersistence (for testing/development)
 */
export class InMemorySnapshotPersistence implements SnapshotPersistence {
  private snapshots: Map<string, Snapshot> = new Map();

  async save(snapshot: Snapshot): Promise<void> {
    this.snapshots.set(snapshot.id, JSON.parse(JSON.stringify(snapshot)));
  }

  async load(snapshotId: string): Promise<Snapshot | null> {
    const snapshot = this.snapshots.get(snapshotId);
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
  }

  async loadAll(): Promise<Snapshot[]> {
    return Array.from(this.snapshots.values()).map(s => 
      JSON.parse(JSON.stringify(s))
    );
  }

  async loadVerified(): Promise<Snapshot[]> {
    return Array.from(this.snapshots.values())
      .filter(s => s.verified)
      .map(s => JSON.parse(JSON.stringify(s)));
  }
}

/**
 * In-memory implementation of AuditLogPersistence (for testing/development)
 */
export class InMemoryAuditLogPersistence implements AuditLogPersistence {
  private entries: AuditLogEntry[] = [];

  async save(entry: AuditLogEntry): Promise<void> {
    this.entries.push(JSON.parse(JSON.stringify(entry)));
  }

  async loadAll(): Promise<AuditLogEntry[]> {
    return this.entries.map(e => JSON.parse(JSON.stringify(e)));
  }

  async verifyIntegrity(entries: AuditLogEntry[]): Promise<{ valid: boolean; invalidEntries: string[] }> {
    const invalidEntries: string[] = [];

    for (const entry of entries) {
      const storedHash = entry.contentHash;
      const computedHash = computeAuditLogHash(entry);
      
      if (storedHash !== computedHash) {
        invalidEntries.push(entry.id);
      }
    }

    return {
      valid: invalidEntries.length === 0,
      invalidEntries,
    };
  }
}

/**
 * In-memory implementation of TemporalIndexPersistence (for testing/development)
 */
export class InMemoryTemporalIndexPersistence implements TemporalIndexPersistence {
  private indices: TemporalIndex[] = [];

  async save(index: TemporalIndex): Promise<void> {
    this.indices.push(JSON.parse(JSON.stringify(index)));
  }

  async loadAll(): Promise<TemporalIndex[]> {
    return this.indices.map(i => JSON.parse(JSON.stringify(i)));
  }

  async query(filters: {
    task_id?: string;
    step_id?: string;
    tags?: string[];
    timeRange?: { start: Date; end: Date };
  }): Promise<TemporalIndex[]> {
    let results = [...this.indices];

    if (filters.task_id) {
      results = results.filter(idx => idx.task_id === filters.task_id);
    }

    if (filters.step_id) {
      results = results.filter(idx => idx.step_id === filters.step_id);
    }

    if (filters.tags && filters.tags.length > 0) {
      results = results.filter(idx => {
        if (!idx.tags) return false;
        return filters.tags!.some(tag => idx.tags!.includes(tag));
      });
    }

    if (filters.timeRange) {
      const { start, end } = filters.timeRange;
      results = results.filter(idx => idx.timestamp >= start && idx.timestamp <= end);
    }

    return results.map(i => JSON.parse(JSON.stringify(i)));
  }
}
