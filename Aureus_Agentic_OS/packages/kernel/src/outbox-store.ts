import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { OutboxStore, OutboxEntry, OutboxEntryState } from './outbox';

/**
 * InMemoryOutboxStore provides a simple in-memory implementation for testing
 */
export class InMemoryOutboxStore implements OutboxStore {
  private entries = new Map<string, OutboxEntry>();
  private byIdempotencyKey = new Map<string, string>(); // idempotencyKey -> id

  async create(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<OutboxEntry> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const fullEntry: OutboxEntry = {
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
    };
    
    this.entries.set(id, fullEntry);
    this.byIdempotencyKey.set(entry.idempotencyKey, id);
    
    return fullEntry;
  }

  async get(id: string): Promise<OutboxEntry | null> {
    return this.entries.get(id) || null;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<OutboxEntry | null> {
    const id = this.byIdempotencyKey.get(idempotencyKey);
    if (!id) return null;
    return this.entries.get(id) || null;
  }

  async update(id: string, updates: Partial<OutboxEntry>): Promise<OutboxEntry> {
    const existing = this.entries.get(id);
    if (!existing) {
      throw new Error(`Outbox entry not found: ${id}`);
    }
    
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.entries.set(id, updated);
    return updated;
  }

  async listByState(state: OutboxEntryState, limit?: number): Promise<OutboxEntry[]> {
    const entries = Array.from(this.entries.values())
      .filter(e => e.state === state)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    return limit ? entries.slice(0, limit) : entries;
  }

  async listByWorkflow(workflowId: string): Promise<OutboxEntry[]> {
    return Array.from(this.entries.values())
      .filter(e => e.workflowId === workflowId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async markProcessing(id: string): Promise<void> {
    await this.update(id, {
      state: OutboxEntryState.PROCESSING,
    });
  }

  async markCommitted(id: string, result: unknown): Promise<void> {
    await this.update(id, {
      state: OutboxEntryState.COMMITTED,
      result,
      committedAt: new Date(),
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`Outbox entry not found: ${id}`);
    }
    
    const newAttempts = entry.attempts + 1;
    const state = newAttempts >= entry.maxAttempts 
      ? OutboxEntryState.DEAD_LETTER 
      : OutboxEntryState.FAILED;
    
    await this.update(id, {
      state,
      error,
      attempts: newAttempts,
    });
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;
    
    for (const [id, entry] of this.entries.entries()) {
      if (entry.state === OutboxEntryState.COMMITTED && 
          entry.committedAt && 
          entry.committedAt.getTime() < cutoff) {
        this.entries.delete(id);
        this.byIdempotencyKey.delete(entry.idempotencyKey);
        count++;
      }
    }
    
    return count;
  }

  // Helper for testing
  clear(): void {
    this.entries.clear();
    this.byIdempotencyKey.clear();
  }

  size(): number {
    return this.entries.size;
  }
}

/**
 * FileSystemOutboxStore implements outbox storage using the file system
 * Entries are stored in ./var/outbox/<workflowId>/<entryId>.json
 */
export class FileSystemOutboxStore implements OutboxStore {
  private baseDir: string;
  private indexDir: string;

  constructor(baseDir: string = './var/outbox') {
    this.baseDir = baseDir;
    this.indexDir = path.join(baseDir, '_index');
  }

  async create(entry: Omit<OutboxEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<OutboxEntry> {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const fullEntry: OutboxEntry = {
      ...entry,
      id,
      createdAt: now,
      updatedAt: now,
    };
    
    await this.writeEntry(fullEntry);
    await this.updateIndex(fullEntry);
    
    return fullEntry;
  }

  async get(id: string): Promise<OutboxEntry | null> {
    // Try to find in any workflow directory by reading index
    const indexFile = path.join(this.indexDir, 'by-id.json');
    
    try {
      if (fs.existsSync(indexFile)) {
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
        const workflowId = index[id];
        if (workflowId) {
          return await this.readEntry(workflowId, id);
        }
      }
    } catch (error) {
      // Index doesn't exist or is corrupt, fall back to scanning
    }
    
    // Fallback: scan all workflow directories
    return null;
  }

  async getByIdempotencyKey(idempotencyKey: string): Promise<OutboxEntry | null> {
    const indexFile = path.join(this.indexDir, 'by-idempotency-key.json');
    
    try {
      if (fs.existsSync(indexFile)) {
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
        const id = index[idempotencyKey];
        if (id) {
          return await this.get(id);
        }
      }
    } catch (error) {
      // Index doesn't exist or is corrupt - log for debugging
      console.warn('Outbox index read error:', error instanceof Error ? error.message : String(error));
    }
    
    return null;
  }

  async update(id: string, updates: Partial<OutboxEntry>): Promise<OutboxEntry> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Outbox entry not found: ${id}`);
    }
    
    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    await this.writeEntry(updated);
    await this.updateIndex(updated);
    
    return updated;
  }

  async listByState(state: OutboxEntryState, limit?: number): Promise<OutboxEntry[]> {
    const entries: OutboxEntry[] = [];
    
    try {
      const workflowDirs = fs.readdirSync(this.baseDir)
        .filter(name => name !== '_index')
        .map(name => path.join(this.baseDir, name))
        .filter(p => fs.statSync(p).isDirectory());
      
      for (const dir of workflowDirs) {
        const files = fs.readdirSync(dir)
          .filter(name => name.endsWith('.json'));
        
        for (const file of files) {
          const entry = await this.readEntryFromFile(path.join(dir, file));
          if (entry && entry.state === state) {
            entries.push(entry);
            if (limit && entries.length >= limit) {
              return entries;
            }
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist yet
    }
    
    return entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listByWorkflow(workflowId: string): Promise<OutboxEntry[]> {
    const entries: OutboxEntry[] = [];
    const workflowDir = path.join(this.baseDir, workflowId);
    
    try {
      const files = fs.readdirSync(workflowDir)
        .filter(name => name.endsWith('.json'));
      
      for (const file of files) {
        const entry = await this.readEntryFromFile(path.join(workflowDir, file));
        if (entry) {
          entries.push(entry);
        }
      }
    } catch (error) {
      // Directory doesn't exist
    }
    
    return entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async markProcessing(id: string): Promise<void> {
    await this.update(id, {
      state: OutboxEntryState.PROCESSING,
    });
  }

  async markCommitted(id: string, result: unknown): Promise<void> {
    await this.update(id, {
      state: OutboxEntryState.COMMITTED,
      result,
      committedAt: new Date(),
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const entry = await this.get(id);
    if (!entry) {
      throw new Error(`Outbox entry not found: ${id}`);
    }
    
    const newAttempts = entry.attempts + 1;
    const state = newAttempts >= entry.maxAttempts 
      ? OutboxEntryState.DEAD_LETTER 
      : OutboxEntryState.FAILED;
    
    await this.update(id, {
      state,
      error,
      attempts: newAttempts,
    });
  }

  async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;
    
    try {
      const workflowDirs = fs.readdirSync(this.baseDir)
        .filter(name => name !== '_index')
        .map(name => path.join(this.baseDir, name))
        .filter(p => fs.statSync(p).isDirectory());
      
      for (const dir of workflowDirs) {
        const files = fs.readdirSync(dir)
          .filter(name => name.endsWith('.json'));
        
        for (const file of files) {
          const entry = await this.readEntryFromFile(path.join(dir, file));
          if (entry && 
              entry.state === OutboxEntryState.COMMITTED && 
              entry.committedAt && 
              entry.committedAt.getTime() < cutoff) {
            fs.unlinkSync(path.join(dir, file));
            count++;
          }
        }
      }
    } catch (error) {
      // Error during cleanup - log for debugging
      console.warn('Outbox cleanup error:', error instanceof Error ? error.message : String(error));
    }
    
    return count;
  }

  private async writeEntry(entry: OutboxEntry): Promise<void> {
    const dir = path.join(this.baseDir, entry.workflowId);
    await fs.promises.mkdir(dir, { recursive: true });
    
    const file = path.join(dir, `${entry.id}.json`);
    const data = JSON.stringify({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      committedAt: entry.committedAt?.toISOString(),
    }, null, 2);
    
    await fs.promises.writeFile(file, data, 'utf-8');
  }

  private async readEntry(workflowId: string, id: string): Promise<OutboxEntry | null> {
    const file = path.join(this.baseDir, workflowId, `${id}.json`);
    return await this.readEntryFromFile(file);
  }

  private async readEntryFromFile(file: string): Promise<OutboxEntry | null> {
    try {
      const data = await fs.promises.readFile(file, 'utf-8');
      const parsed = JSON.parse(data);
      
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        updatedAt: new Date(parsed.updatedAt),
        committedAt: parsed.committedAt ? new Date(parsed.committedAt) : undefined,
      };
    } catch (error) {
      return null;
    }
  }

  private async updateIndex(entry: OutboxEntry): Promise<void> {
    await fs.promises.mkdir(this.indexDir, { recursive: true });
    
    // Update by-id index
    const byIdFile = path.join(this.indexDir, 'by-id.json');
    let byId: Record<string, string> = {};
    
    try {
      if (fs.existsSync(byIdFile)) {
        byId = JSON.parse(fs.readFileSync(byIdFile, 'utf-8'));
      }
    } catch (error) {
      // Index doesn't exist or is corrupt - log for debugging
      console.warn('Outbox by-id index read error:', error instanceof Error ? error.message : String(error));
    }
    
    byId[entry.id] = entry.workflowId;
    await fs.promises.writeFile(byIdFile, JSON.stringify(byId, null, 2), 'utf-8');
    
    // Update by-idempotency-key index
    const byKeyFile = path.join(this.indexDir, 'by-idempotency-key.json');
    let byKey: Record<string, string> = {};
    
    try {
      if (fs.existsSync(byKeyFile)) {
        byKey = JSON.parse(fs.readFileSync(byKeyFile, 'utf-8'));
      }
    } catch (error) {
      // Index doesn't exist or is corrupt - log for debugging
      console.warn('Outbox by-key index read error:', error instanceof Error ? error.message : String(error));
    }
    
    byKey[entry.idempotencyKey] = entry.id;
    await fs.promises.writeFile(byKeyFile, JSON.stringify(byKey, null, 2), 'utf-8');
  }
}
