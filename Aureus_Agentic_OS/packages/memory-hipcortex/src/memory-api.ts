import {
  MemoryEntry,
  Provenance,
  MemoryQuery,
  TemporalIndexPersistence,
  MemoryEngineConfig,
  MemoryPolicy,
  RetentionTierPolicy,
} from './types';
import { TemporalIndexer } from './temporal-indexer';
import { AuditLog } from './audit-log';
import { HipCortex } from './hipcortex';
import { RetentionPolicyManager, RetentionPolicyConfig, RetentionTier } from './retention-policy';

/**
 * MemoryAPI provides a high-level interface for storing and querying
 * memory entries with mandatory provenance tracking
 * 
 * Optional persistence layer for temporal indices
 */
export class MemoryAPI {
  private entries: Map<string, MemoryEntry> = new Map();
  private indexer: TemporalIndexer;
  private auditLog: AuditLog;
  private temporalIndexPersistence?: TemporalIndexPersistence;
  private hipCortex?: HipCortex;
  private retentionPolicyManager?: RetentionPolicyManager;
  private activeMemoryPolicy?: MemoryPolicy;
  private activeMemoryEngineConfig?: MemoryEngineConfig;
  private isLoaded: boolean = false;

  constructor(options?: {
    temporalIndexPersistence?: TemporalIndexPersistence;
    hipCortex?: HipCortex;
  } | HipCortex) {
    this.indexer = new TemporalIndexer();
    this.auditLog = new AuditLog();
    if (options instanceof HipCortex) {
      this.hipCortex = options;
    } else {
      this.temporalIndexPersistence = options?.temporalIndexPersistence;
      this.hipCortex = options?.hipCortex;
    }
  }

  /**
   * Load persisted temporal indices on startup
   */
  async loadPersistedState(): Promise<void> {
    if (this.isLoaded) {
      console.log('MemoryAPI: State already loaded');
      return;
    }

    // Load temporal indices
    if (this.temporalIndexPersistence) {
      const persistedIndices = await this.temporalIndexPersistence.loadAll();
      
      // Restore indices into the indexer
      for (const index of persistedIndices) {
        // Note: We're restoring indices but not the actual entries
        // In production, you'd also want to load memory entries from PostgresMemoryStore
        this.indexer.restoreIndex(index);
      }
      
      console.log(`MemoryAPI: Loaded ${persistedIndices.length} temporal indices from persistence`);
    }

    this.isLoaded = true;
  }

  /**
   * Write a memory entry with provenance
   * All writes require provenance (task_id, step_id, source_event_id)
   */
  write(
    content: unknown,
    provenance: Provenance,
    options?: {
      type?: MemoryEntry['type'];
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): MemoryEntry {
    // Validate provenance
    if (!provenance.task_id || !provenance.step_id) {
      throw new Error('Provenance must include task_id and step_id');
    }

    const entry: MemoryEntry = {
      id: this.generateId(),
      content: this.deepClone(content),
      type: options?.type || 'episodic_note',
      provenance: {
        ...provenance,
        timestamp: provenance.timestamp || new Date(),
      },
      tags: options?.tags,
      metadata: options?.metadata,
    };

    // Store the entry
    this.entries.set(entry.id, entry);

    // Index the entry
    const temporalIndex = this.indexer.indexEntry(entry);

    // Persist temporal index if persistence layer is available
    if (this.temporalIndexPersistence) {
      this.temporalIndexPersistence.save(temporalIndex).catch(err => {
        console.error(`Failed to persist temporal index ${temporalIndex.id}:`, err);
      });
    }

    // Log to audit trail
    this.auditLog.append(
      `task:${provenance.task_id}`,
      'memory_write',
      null,
      { entryId: entry.id, type: entry.type },
      {
        metadata: {
          entryType: entry.type,
          tags: entry.tags,
          ...entry.metadata,
        },
        sourceEventIds: provenance.source_event_id ? [provenance.source_event_id] : undefined,
        provenance,
      }
    );

    // Track entry for retention policy management
    if (this.retentionPolicyManager) {
      this.retentionPolicyManager.trackEntry(entry.id, RetentionTier.HOT);
    }

    return entry;
  }

  /**
   * Read memory entries with flexible query filters
   */
  read(query: MemoryQuery): MemoryEntry[] {
    const indices = this.indexer.query({
      task_id: query.task_id,
      step_id: query.step_id,
      tags: query.tags,
      timeRange: query.timeRange,
    });

    let results = indices
      .map(idx => idx.entryId ? this.entries.get(idx.entryId) : undefined)
      .filter((entry): entry is MemoryEntry => entry !== undefined);

    // Filter by type if specified
    if (query.type) {
      results = results.filter(entry => entry.type === query.type);
    }

    // Track access for retention policies
    if (this.retentionPolicyManager) {
      results.forEach(entry => {
        this.retentionPolicyManager?.recordAccess(entry.id);
      });
    }

    return results;
  }

  /**
   * List timeline of all entries for a specific task_id
   * Returns entries sorted by timestamp
   */
  list_timeline(task_id: string): MemoryEntry[] {
    const indices = this.indexer.queryByTaskId(task_id);
    const entries = indices
      .map(idx => idx.entryId ? this.entries.get(idx.entryId) : undefined)
      .filter((entry): entry is MemoryEntry => entry !== undefined);

    // Sort by timestamp
    return entries.sort((a, b) => 
      a.provenance.timestamp.getTime() - b.provenance.timestamp.getTime()
    );
  }

  /**
   * Get a specific entry by ID
   */
  getEntry(entryId: string): MemoryEntry | undefined {
    return this.entries.get(entryId);
  }

  /**
   * Get all episodic notes for a task
   */
  getEpisodicNotes(task_id: string): MemoryEntry[] {
    return this.read({ task_id, type: 'episodic_note' });
  }

  /**
   * Get all artifacts for a task
   */
  getArtifacts(task_id: string): MemoryEntry[] {
    return this.read({ task_id, type: 'artifact' });
  }

  /**
   * Get all snapshots for a task
   */
  getSnapshots(task_id: string): MemoryEntry[] {
    return this.read({ task_id, type: 'snapshot' });
  }

  /**
   * Get the audit log
   */
  getAuditLog(): AuditLog {
    return this.auditLog;
  }

  /**
   * Get the temporal indexer
   */
  getIndexer(): TemporalIndexer {
    return this.indexer;
  }

  /**
   * Get statistics about stored memories
   */
  getStats(): {
    totalEntries: number;
    episodicNotes: number;
    artifacts: number;
    snapshots: number;
    tasks: number;
  } {
    const allEntries = Array.from(this.entries.values());
    const uniqueTasks = new Set(allEntries.map(e => e.provenance.task_id));

    return {
      totalEntries: this.entries.size,
      episodicNotes: allEntries.filter(e => e.type === 'episodic_note').length,
      artifacts: allEntries.filter(e => e.type === 'artifact').length,
      snapshots: allEntries.filter(e => e.type === 'snapshot').length,
      tasks: uniqueTasks.size,
    };
  }

  /**
   * Apply a memory engine configuration to the MemoryAPI
   */
  applyMemoryEngineConfig(config: MemoryEngineConfig): void {
    const previousPolicy = this.activeMemoryPolicy;
    this.activeMemoryEngineConfig = config;
    this.activeMemoryPolicy = config.policy;

    const retentionPolicies = this.mapRetentionPolicies(config.policy.retentionTiers);
    if (retentionPolicies.length > 0) {
      this.retentionPolicyManager = new RetentionPolicyManager(retentionPolicies);
    } else {
      this.retentionPolicyManager = undefined;
    }

    if (this.hipCortex) {
      this.hipCortex.applyMemoryEngineConfig(config);
    }

    this.auditLog.append(
      'memory-api',
      'memory_policy_applied',
      previousPolicy || null,
      config.policy,
      {
        metadata: {
          policyId: config.policy.id,
          policyName: config.policy.name,
          schemaVersion: config.schemaVersion,
          generatedBy: config.generatedBy,
        },
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
   * Map memory policy retention tiers to runtime retention configs
   */
  private mapRetentionPolicies(tiers: RetentionTierPolicy[]): RetentionPolicyConfig[] {
    const mapped = tiers
      .map(tier => {
        const mappedTier = this.mapRetentionTier(tier.tier);
        if (!mappedTier) {
          return undefined;
        }

        return {
          tier: mappedTier,
          maxAge: tier.maxAgeMs,
          maxEntries: tier.maxEntries,
          accessThreshold: tier.accessThreshold,
          compressionRatio: tier.compressionEnabled ? 0.5 : undefined,
        } as RetentionPolicyConfig;
      })
      .filter((policy): policy is RetentionPolicyConfig => policy !== undefined);
    
    return mapped;
  }

  private mapRetentionTier(tier: string): RetentionTier | undefined {
    switch (tier.toLowerCase()) {
      case 'hot':
        return RetentionTier.HOT;
      case 'warm':
        return RetentionTier.WARM;
      case 'cold':
        return RetentionTier.COLD;
      case 'archived':
        return RetentionTier.ARCHIVED;
      default:
        return undefined;
    }
  }

  /**
   * Deep clone to prevent mutation
   */
  private deepClone(obj: unknown): unknown {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `mem-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
