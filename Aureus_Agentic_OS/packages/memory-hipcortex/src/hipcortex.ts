import {
  Snapshot,
  AuditLogEntry,
  TemporalIndex,
  RollbackResult,
  SnapshotPersistence,
  AuditLogPersistence,
  MemoryEngineConfig,
  MemoryPolicy,
  MemoryEntry,
  MemoryQuery,
} from './types';
import { computeAuditLogHash } from './hash-utils';

/**
 * HipCortex implements temporal indexing, snapshots, audit log, and rollback
 * Guarantees: Auditability (invariant 5) and Rollback (invariant 6)
 * 
 * Optional persistence layer for snapshots and audit logs
 */
export class HipCortex {
  private snapshots: Map<string, Snapshot> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private temporalIndex: TemporalIndex[] = [];
  private memories: Map<string, MemoryEntry> = new Map();
  private currentState: unknown = null;
  private lastVerifiedSnapshotId: string | null = null;
  private snapshotPersistence?: SnapshotPersistence;
  private auditLogPersistence?: AuditLogPersistence;
  private activeMemoryEngineConfig?: MemoryEngineConfig;
  private activeMemoryPolicy?: MemoryPolicy;
  private isLoaded: boolean = false;
  private memoryThreshold: number = 10000; // Max entries before pruning

  /**
   * Constructor with optional persistence layers
   */
  constructor(options?: {
    snapshotPersistence?: SnapshotPersistence;
    auditLogPersistence?: AuditLogPersistence;
  }) {
    this.snapshotPersistence = options?.snapshotPersistence;
    this.auditLogPersistence = options?.auditLogPersistence;
  }

  /**
   * Apply a memory engine configuration to HipCortex
   */
  applyMemoryEngineConfig(config: MemoryEngineConfig): void {
    const previousPolicy = this.activeMemoryPolicy;
    this.activeMemoryEngineConfig = config;
    this.activeMemoryPolicy = config.policy;

    this.logAction(
      'system',
      'memory_policy_applied',
      previousPolicy || null,
      config.policy,
      {
        policyId: config.policy.id,
        policyName: config.policy.name,
        schemaVersion: config.schemaVersion,
        generatedBy: config.generatedBy,
      }
    );
  }

  /**
   * Get active memory engine configuration
   */
  getActiveMemoryEngineConfig(): MemoryEngineConfig | undefined {
    return this.activeMemoryEngineConfig;
  }

  /**
   * Load persisted state on startup
   * Verifies audit log integrity using SHA-256 checks
   */
  async loadPersistedState(): Promise<void> {
    if (this.isLoaded) {
      console.log('HipCortex: State already loaded');
      return;
    }

    // Load snapshots
    if (this.snapshotPersistence) {
      const persistedSnapshots = await this.snapshotPersistence.loadAll();
      for (const snapshot of persistedSnapshots) {
        this.snapshots.set(snapshot.id, snapshot);
        
        // Add to temporal index
        this.temporalIndex.push({
          id: this.generateId(),
          timestamp: snapshot.timestamp,
          snapshotId: snapshot.id,
        });

        // Track last verified snapshot
        if (snapshot.verified) {
          if (!this.lastVerifiedSnapshotId || 
              snapshot.timestamp > this.snapshots.get(this.lastVerifiedSnapshotId)!.timestamp) {
            this.lastVerifiedSnapshotId = snapshot.id;
          }
        }
      }
      console.log(`HipCortex: Loaded ${persistedSnapshots.length} snapshots from persistence`);
    }

    // Load audit log entries with integrity verification
    if (this.auditLogPersistence) {
      const persistedEntries = await this.auditLogPersistence.loadAll();
      
      // Verify integrity of all loaded entries using SHA-256 checks
      const verification = await this.auditLogPersistence.verifyIntegrity(persistedEntries);
      
      if (!verification.valid) {
        console.error(`HipCortex: Integrity check failed for ${verification.invalidEntries.length} audit log entries:`, verification.invalidEntries);
        throw new Error(`Audit log integrity check failed: ${verification.invalidEntries.length} invalid entries detected`);
      }

      this.auditLog = persistedEntries;
      console.log(`HipCortex: Loaded ${persistedEntries.length} audit log entries (integrity verified)`);
    }

    this.isLoaded = true;
  }

  /**
   * Create a new snapshot of the current state
   * Snapshots are marked as verified if they passed CRV validation
   */
  createSnapshot(state: unknown, verified: boolean = false): Snapshot {
    const snapshot: Snapshot = {
      id: this.generateId(),
      timestamp: new Date(),
      state: this.deepClone(state),
      verified,
    };

    this.snapshots.set(snapshot.id, snapshot);

    // Add to temporal index
    this.temporalIndex.push({
      id: this.generateId(),
      timestamp: snapshot.timestamp,
      snapshotId: snapshot.id,
    });

    // Track last verified snapshot for rollback
    if (verified) {
      this.lastVerifiedSnapshotId = snapshot.id;
    }

    this.currentState = this.deepClone(state);

    // Persist snapshot if persistence layer is available
    if (this.snapshotPersistence) {
      this.snapshotPersistence.save(snapshot).catch(err => {
        console.error(`Failed to persist snapshot ${snapshot.id}:`, err);
      });
    }

    console.log(`Created snapshot ${snapshot.id} (verified: ${verified})`);
    return snapshot;
  }

  /**
   * Log an action with state diff for auditability (invariant 5)
   * All actions and state diffs are logged and traceable
   */
  logAction(
    actor: string,
    action: string,
    stateBefore: unknown,
    stateAfter: unknown,
    metadata?: Record<string, unknown>
  ): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      actor,
      action,
      stateBefore: this.deepClone(stateBefore),
      stateAfter: this.deepClone(stateAfter),
      diff: this.computeDiff(stateBefore, stateAfter),
      metadata,
    };

    // Compute SHA-256 hash for integrity verification
    entry.contentHash = computeAuditLogHash(entry);

    this.auditLog.push(entry);

    // Persist audit log entry if persistence layer is available
    if (this.auditLogPersistence) {
      this.auditLogPersistence.save(entry).catch(err => {
        console.error(`Failed to persist audit log entry ${entry.id}:`, err);
      });
    }

    console.log(`Audit log: ${actor} performed ${action} at ${entry.timestamp.toISOString()}`);
    
    return entry;
  }

  /**
   * Rollback to last verified snapshot (invariant 6)
   * Safe restore to last verified snapshot
   */
  async rollbackToLastVerified(): Promise<RollbackResult> {
    if (!this.lastVerifiedSnapshotId) {
      throw new Error('No verified snapshot available for rollback');
    }

    return this.rollbackToSnapshot(this.lastVerifiedSnapshotId);
  }

  /**
   * Rollback to a specific snapshot
   */
  async rollbackToSnapshot(snapshotId: string): Promise<RollbackResult> {
    const snapshot = this.snapshots.get(snapshotId);
    
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    const previousState = this.deepClone(this.currentState);
    this.currentState = this.deepClone(snapshot.state);

    const result: RollbackResult = {
      success: true,
      snapshotId,
      previousState,
      restoredState: this.currentState,
      timestamp: new Date(),
    };

    // Log the rollback action
    this.logAction(
      'system',
      'rollback',
      previousState,
      this.currentState,
      { snapshotId, verified: snapshot.verified }
    );

    console.log(`Rolled back to snapshot ${snapshotId} (verified: ${snapshot.verified})`);
    return result;
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(snapshotId: string): Snapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  /**
   * Query snapshots by time range
   */
  querySnapshotsByTimeRange(startTime: Date, endTime: Date): Snapshot[] {
    const indices = this.temporalIndex.filter(
      idx => idx.timestamp >= startTime && idx.timestamp <= endTime && idx.snapshotId
    );

    return indices
      .map(idx => idx.snapshotId ? this.snapshots.get(idx.snapshotId) : undefined)
      .filter((s): s is Snapshot => s !== undefined);
  }

  /**
   * Get audit log entries
   */
  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Query audit log by actor
   */
  queryAuditLogByActor(actor: string): AuditLogEntry[] {
    return this.auditLog.filter(entry => entry.actor === actor);
  }

  /**
   * Query audit log by time range
   */
  queryAuditLogByTimeRange(startTime: Date, endTime: Date): AuditLogEntry[] {
    return this.auditLog.filter(
      entry => entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  /**
   * Get current state
   */
  getCurrentState(): unknown {
    return this.deepClone(this.currentState);
  }

  /**
   * Get all verified snapshots
   */
  getVerifiedSnapshots(): Snapshot[] {
    return Array.from(this.snapshots.values()).filter(s => s.verified);
  }

  /**
   * Store a memory entry with provenance tracking
   * Supports temporal indexing and automatic pruning
   */
  async store(entry: MemoryEntry): Promise<void> {
    // Store the memory entry
    this.memories.set(entry.id, entry);

    // Add to temporal index for efficient time-based queries
    this.temporalIndex.push({
      id: this.generateId(),
      timestamp: entry.provenance.timestamp,
      entryId: entry.id,
      task_id: entry.provenance.task_id,
      step_id: entry.provenance.step_id,
      tags: entry.tags,
    });

    // Log the storage action
    this.logAction(
      entry.provenance.task_id,
      'memory_store',
      null,
      entry,
      {
        entryId: entry.id,
        type: entry.type,
        task_id: entry.provenance.task_id,
        step_id: entry.provenance.step_id,
      }
    );

    // Check if we need to prune old memories
    if (this.memories.size >= this.memoryThreshold) {
      await this.pruneOldMemories();
    }
  }

  /**
   * Query memory entries by time range
   */
  async queryByTimeRange(startTime: Date, endTime: Date): Promise<MemoryEntry[]> {
    const indices = this.temporalIndex.filter(
      idx => idx.timestamp >= startTime && 
             idx.timestamp <= endTime && 
             idx.entryId
    );

    const entries: MemoryEntry[] = [];
    for (const idx of indices) {
      if (idx.entryId) {
        const entry = this.memories.get(idx.entryId);
        if (entry) {
          entries.push(entry);
        }
      }
    }

    return entries;
  }

  /**
   * Query memory entries by type
   */
  async queryByType(type: MemoryEntry['type']): Promise<MemoryEntry[]> {
    return Array.from(this.memories.values()).filter(entry => entry.type === type);
  }

  /**
   * Query memory entries using flexible query parameters
   */
  async query(params: MemoryQuery): Promise<MemoryEntry[]> {
    let results = Array.from(this.memories.values());

    // Filter by task_id
    if (params.task_id) {
      results = results.filter(entry => entry.provenance.task_id === params.task_id);
    }

    // Filter by step_id
    if (params.step_id) {
      results = results.filter(entry => entry.provenance.step_id === params.step_id);
    }

    // Filter by type
    if (params.type) {
      results = results.filter(entry => entry.type === params.type);
    }

    // Filter by tags
    if (params.tags && params.tags.length > 0) {
      results = results.filter(entry => 
        entry.tags && params.tags!.some(tag => entry.tags!.includes(tag))
      );
    }

    // Filter by time range
    if (params.timeRange) {
      results = results.filter(entry => 
        entry.provenance.timestamp >= params.timeRange!.start &&
        entry.provenance.timestamp <= params.timeRange!.end
      );
    }

    return results;
  }

  /**
   * Prune old memories to maintain bounded memory usage
   * Keeps most recent entries up to threshold
   */
  async pruneOldMemories(): Promise<void> {
    if (this.memories.size <= this.memoryThreshold) {
      return;
    }

    // Sort entries by timestamp (oldest first)
    const entries = Array.from(this.memories.values())
      .sort((a, b) => a.provenance.timestamp.getTime() - b.provenance.timestamp.getTime());

    // Calculate how many to remove
    const targetSize = Math.floor(this.memoryThreshold * 0.8); // Keep 80% after pruning
    const toRemove = entries.slice(0, entries.length - targetSize);

    // Remove old entries
    for (const entry of toRemove) {
      this.memories.delete(entry.id);
      
      // Remove from temporal index
      this.temporalIndex = this.temporalIndex.filter(idx => idx.entryId !== entry.id);
      
      // Log the pruning action
      this.logAction(
        'system',
        'memory_prune',
        entry,
        null,
        {
          entryId: entry.id,
          type: entry.type,
          age: Date.now() - entry.provenance.timestamp.getTime(),
        }
      );
    }

    console.log(`Pruned ${toRemove.length} old memory entries (${this.memories.size} remaining)`);
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): {
    totalEntries: number;
    entriesByType: Record<string, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    totalSnapshots: number;
    verifiedSnapshots: number;
  } {
    const entries = Array.from(this.memories.values());
    const entriesByType: Record<string, number> = {};
    
    for (const entry of entries) {
      entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1;
    }

    const timestamps = entries.map(e => e.provenance.timestamp.getTime());
    
    return {
      totalEntries: this.memories.size,
      entriesByType,
      oldestEntry: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null,
      newestEntry: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null,
      totalSnapshots: this.snapshots.size,
      verifiedSnapshots: this.getVerifiedSnapshots().length,
    };
  }

  /**
   * Deep clone object to prevent mutation
   */
  private deepClone(obj: unknown): unknown {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Compute diff between two states (simplified)
   */
  private computeDiff(before: unknown, after: unknown): unknown {
    // Simplified diff - in production, use a proper diff library
    return {
      before: this.deepClone(before),
      after: this.deepClone(after),
      changed: JSON.stringify(before) !== JSON.stringify(after),
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
