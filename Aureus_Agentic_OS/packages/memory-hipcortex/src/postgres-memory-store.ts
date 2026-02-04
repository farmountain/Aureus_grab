import { Pool } from 'pg';
import { MemoryEntry, Provenance, MemoryQuery } from './types';
import { DatabaseConfig, createDatabasePool } from '@aureus/kernel';

/**
 * PostgresMemoryStore provides persistent storage for memory entries
 */
export class PostgresMemoryStore {
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
        console.log('PostgresMemoryStore: Database schema initialized');
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('PostgresMemoryStore: Schema initialization failed:', error);
        throw error;
      } finally {
        client.release();
      }
    }
  }

  /**
   * Store a memory entry
   */
  async storeEntry(entry: MemoryEntry): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO memory_entries (id, content, type, task_id, step_id, source_event_id, tags, metadata, provenance_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id)
         DO UPDATE SET
           content = EXCLUDED.content,
           type = EXCLUDED.type,
           tags = EXCLUDED.tags,
           metadata = EXCLUDED.metadata,
           updated_at = CURRENT_TIMESTAMP`,
        [
          entry.id,
          JSON.stringify(entry.content),
          entry.type,
          entry.provenance.task_id,
          entry.provenance.step_id,
          entry.provenance.source_event_id || null,
          entry.tags || [],
          JSON.stringify(entry.metadata || {}),
          entry.provenance.timestamp,
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get a memory entry by ID
   */
  async getEntry(id: string): Promise<MemoryEntry | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, content, type, task_id, step_id, source_event_id, tags, metadata, provenance_timestamp
         FROM memory_entries
         WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return this.rowToEntry(row);
    } finally {
      client.release();
    }
  }

  /**
   * Query memory entries
   */
  async queryEntries(query: MemoryQuery): Promise<MemoryEntry[]> {
    const client = await this.pool.connect();
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (query.task_id) {
        conditions.push(`task_id = $${paramIndex++}`);
        params.push(query.task_id);
      }

      if (query.step_id) {
        conditions.push(`step_id = $${paramIndex++}`);
        params.push(query.step_id);
      }

      if (query.type) {
        conditions.push(`type = $${paramIndex++}`);
        params.push(query.type);
      }

      if (query.tags && query.tags.length > 0) {
        conditions.push(`tags @> $${paramIndex++}`);
        params.push(query.tags);
      }

      if (query.timeRange) {
        conditions.push(`provenance_timestamp >= $${paramIndex++}`);
        params.push(query.timeRange.start);
        conditions.push(`provenance_timestamp <= $${paramIndex++}`);
        params.push(query.timeRange.end);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const sql = `SELECT id, content, type, task_id, step_id, source_event_id, tags, metadata, provenance_timestamp
                   FROM memory_entries
                   ${whereClause}
                   ORDER BY provenance_timestamp DESC`;

      const result = await client.query(sql, params);
      return result.rows.map(row => this.rowToEntry(row));
    } finally {
      client.release();
    }
  }

  /**
   * Get all memory entries
   */
  async getAllEntries(): Promise<MemoryEntry[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, content, type, task_id, step_id, source_event_id, tags, metadata, provenance_timestamp
         FROM memory_entries
         ORDER BY provenance_timestamp DESC`
      );
      return result.rows.map(row => this.rowToEntry(row));
    } finally {
      client.release();
    }
  }

  /**
   * Convert database row to MemoryEntry
   */
  private rowToEntry(row: any): MemoryEntry {
    const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;

    const provenance: Provenance = {
      task_id: row.task_id,
      step_id: row.step_id,
      source_event_id: row.source_event_id || undefined,
      timestamp: new Date(row.provenance_timestamp),
    };

    return {
      id: row.id,
      content,
      type: row.type,
      provenance,
      tags: row.tags || [],
      metadata: metadata || {},
    };
  }

  /**
   * Close the database pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
