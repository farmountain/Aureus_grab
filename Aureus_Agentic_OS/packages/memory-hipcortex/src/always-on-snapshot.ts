import { CombinedSnapshot, MemoryPointer } from './snapshot-manager';
import { StateSnapshot } from '@aureus/world-model';
import { MemoryEntry } from './types';

/**
 * Always-on agent snapshot strategy
 */
export enum AlwaysOnStrategy {
  PERIODIC = 'periodic',           // Take snapshots at regular intervals
  INCREMENTAL = 'incremental',     // Take snapshots on significant state changes
  MEMORY_THRESHOLD = 'memory_threshold', // Trigger based on memory count
  HYBRID = 'hybrid',               // Combine periodic and incremental
  ADAPTIVE = 'adaptive'            // Adjust based on activity level
}

/**
 * Snapshot trigger types for always-on agents
 */
export enum SnapshotTrigger {
  SCHEDULED = 'scheduled',
  STATE_CHANGE = 'state_change',
  MEMORY_THRESHOLD = 'memory_threshold',
  TIME_THRESHOLD = 'time_threshold',
  MANUAL = 'manual',
  LIFECYCLE_EVENT = 'lifecycle_event'
}

/**
 * Always-on snapshot configuration
 */
export interface AlwaysOnSnapshotConfig {
  strategy: AlwaysOnStrategy;
  intervalMs?: number;              // For periodic strategy
  memoryThreshold?: number;         // Max memory entries before snapshot
  stateChangeThreshold?: number;    // Significant state changes before snapshot
  minIntervalMs?: number;           // Minimum time between snapshots
  maxIntervalMs?: number;           // Maximum time between snapshots
  retainCount?: number;             // Number of snapshots to retain
}

/**
 * Snapshot metadata for always-on agents
 */
export interface AlwaysOnSnapshotMetadata {
  trigger: SnapshotTrigger;
  agentId: string;
  sessionId: string;
  cycleNumber: number;
  stateChangesSinceLastSnapshot: number;
  memoriesAddedSinceLastSnapshot: number;
  timeSinceLastSnapshot: number;
}

/**
 * AlwaysOnSnapshotManager extends snapshot capabilities for always-on agents
 */
export class AlwaysOnSnapshotManager {
  private config: AlwaysOnSnapshotConfig;
  private lastSnapshotTime: Date | null = null;
  private stateChangeCount: number = 0;
  private memoryAddedCount: number = 0;
  private snapshots: Map<string, CombinedSnapshot & { alwaysOnMetadata: AlwaysOnSnapshotMetadata }> = new Map();
  private snapshotCounter: number = 0;

  constructor(config: AlwaysOnSnapshotConfig) {
    this.config = {
      retainCount: 10,
      minIntervalMs: 60 * 1000, // 1 minute default
      maxIntervalMs: 60 * 60 * 1000, // 1 hour default
      ...config,
    };
  }

  /**
   * Check if a snapshot should be taken based on the strategy
   */
  shouldTakeSnapshot(
    timeSinceLastMs: number,
    memoriesAdded: number,
    stateChanges: number
  ): { should: boolean; trigger: SnapshotTrigger; reason: string } {
    const { strategy, intervalMs, memoryThreshold, stateChangeThreshold, maxIntervalMs } = this.config;
    const { minIntervalMs } = this.config;

    // Check max interval (forced snapshot)
    if (maxIntervalMs && timeSinceLastMs >= maxIntervalMs) {
      return {
        should: true,
        trigger: SnapshotTrigger.TIME_THRESHOLD,
        reason: `Max interval exceeded: ${timeSinceLastMs}ms`,
      };
    }

    switch (strategy) {
      case AlwaysOnStrategy.PERIODIC:
        if ((intervalMs && timeSinceLastMs >= intervalMs) || (minIntervalMs && timeSinceLastMs >= minIntervalMs)) {
          return {
            should: true,
            trigger: SnapshotTrigger.SCHEDULED,
            reason: `Periodic interval reached: ${intervalMs}ms`,
          };
        }
        break;

      case AlwaysOnStrategy.MEMORY_THRESHOLD:
        if (memoryThreshold && memoriesAdded >= memoryThreshold) {
          return {
            should: true,
            trigger: SnapshotTrigger.MEMORY_THRESHOLD,
            reason: `Memory threshold reached: ${memoriesAdded}`,
          };
        }
        break;

      case AlwaysOnStrategy.INCREMENTAL:
        if (stateChangeThreshold && stateChanges >= stateChangeThreshold) {
          return {
            should: true,
            trigger: SnapshotTrigger.STATE_CHANGE,
            reason: `State changes threshold reached: ${stateChanges}`,
          };
        }
        if (memoryThreshold && memoriesAdded >= memoryThreshold) {
          return {
            should: true,
            trigger: SnapshotTrigger.MEMORY_THRESHOLD,
            reason: `Memory threshold reached: ${memoriesAdded}`,
          };
        }
        break;

      case AlwaysOnStrategy.HYBRID:
        // Combine periodic and incremental triggers
        if ((intervalMs && timeSinceLastMs >= intervalMs) || (minIntervalMs && timeSinceLastMs >= minIntervalMs)) {
          return {
            should: true,
            trigger: SnapshotTrigger.SCHEDULED,
            reason: `Periodic interval reached: ${intervalMs}ms`,
          };
        }
        if (stateChangeThreshold && stateChanges >= stateChangeThreshold) {
          return {
            should: true,
            trigger: SnapshotTrigger.STATE_CHANGE,
            reason: `State changes threshold reached: ${stateChanges}`,
          };
        }
        if (memoryThreshold && memoriesAdded >= memoryThreshold) {
          return {
            should: true,
            trigger: SnapshotTrigger.MEMORY_THRESHOLD,
            reason: `Memory threshold reached: ${memoriesAdded}`,
          };
        }
        break;

      case AlwaysOnStrategy.ADAPTIVE:
        // Adaptive strategy adjusts based on activity level
        const activityScore = stateChanges + memoriesAdded;
        const adaptiveThreshold = this.calculateAdaptiveThreshold(timeSinceLastMs);
        
        if (activityScore >= adaptiveThreshold) {
          return {
            should: true,
            trigger: SnapshotTrigger.STATE_CHANGE,
            reason: `Adaptive threshold reached: activity=${activityScore}, threshold=${adaptiveThreshold}`,
          };
        }
        break;
    }

    return {
      should: false,
      trigger: SnapshotTrigger.MANUAL,
      reason: 'No trigger conditions met',
    };
  }

  /**
   * Create a snapshot for an always-on agent
   */
  createAlwaysOnSnapshot(
    agentId: string,
    sessionId: string,
    cycleNumber: number,
    taskId: string,
    stepId: string,
    worldState: StateSnapshot,
    memoryEntries: MemoryEntry[],
    trigger: SnapshotTrigger
  ): CombinedSnapshot & { alwaysOnMetadata: AlwaysOnSnapshotMetadata } {
    const now = Date.now();
    const timeSinceLast = this.lastSnapshotTime 
      ? now - this.lastSnapshotTime.getTime()
      : 0;

    const metadata: AlwaysOnSnapshotMetadata = {
      trigger,
      agentId,
      sessionId,
      cycleNumber,
      stateChangesSinceLastSnapshot: this.stateChangeCount,
      memoriesAddedSinceLastSnapshot: this.memoryAddedCount,
      timeSinceLastSnapshot: timeSinceLast,
    };

    // Create memory pointers
    const memoryPointers: MemoryPointer[] = memoryEntries.map(entry => ({
      entryId: entry.id,
      type: entry.type,
      contentHash: this.computeHash(JSON.stringify(entry.content)),
      timestamp: entry.provenance.timestamp,
    }));

    // Create combined snapshot
    const snapshot: CombinedSnapshot & { alwaysOnMetadata: AlwaysOnSnapshotMetadata } = {
      id: `always-on-snapshot-${++this.snapshotCounter}-${agentId}`,
      timestamp: new Date(),
      taskId,
      stepId,
      contentHash: this.computeHash(JSON.stringify(worldState)),
      worldStateSnapshot: worldState,
      memoryPointers,
      merkleRoot: this.computeMerkleRoot([
        this.computeHash(JSON.stringify(worldState)),
        ...memoryPointers.map(p => p.contentHash),
      ]),
      metadata: {
        alwaysOn: true,
        agentId,
        sessionId,
        cycleNumber,
      },
      verified: false,
      alwaysOnMetadata: metadata,
    };

    // Store snapshot
    this.snapshots.set(snapshot.id, snapshot);

    // Prune old snapshots if needed
    this.pruneSnapshots();

    // Reset counters
    this.lastSnapshotTime = new Date();
    this.stateChangeCount = 0;
    this.memoryAddedCount = 0;

    return snapshot;
  }

  /**
   * Record state changes
   */
  recordStateChange(count: number = 1): void {
    this.stateChangeCount += count;
  }

  /**
   * Record memory additions
   */
  recordMemoryAdded(count: number = 1): void {
    this.memoryAddedCount += count;
  }

  /**
   * Get snapshots for a specific agent
   */
  getAgentSnapshots(agentId: string): Array<CombinedSnapshot & { alwaysOnMetadata: AlwaysOnSnapshotMetadata }> {
    return Array.from(this.snapshots.values())
      .filter(s => s.alwaysOnMetadata.agentId === agentId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get the latest snapshot for an agent
   */
  getLatestSnapshot(agentId: string): (CombinedSnapshot & { alwaysOnMetadata: AlwaysOnSnapshotMetadata }) | undefined {
    const snapshots = this.getAgentSnapshots(agentId);
    return snapshots.length > 0 ? snapshots[0] : undefined;
  }

  /**
   * Calculate adaptive threshold based on time since last snapshot
   */
  private calculateAdaptiveThreshold(timeSinceLastMs: number): number {
    // If it's been a while, lower the threshold to trigger snapshot sooner
    // If recent snapshot, raise threshold to avoid too frequent snapshots
    const baseThreshold = 10;
    const timeFactor = Math.min(timeSinceLastMs / (this.config.maxIntervalMs || 3600000), 2);
    return Math.max(baseThreshold / timeFactor, 5);
  }

  /**
   * Prune old snapshots based on retain count
   */
  private pruneSnapshots(): void {
    if (!this.config.retainCount) return;

    const allSnapshots = Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (allSnapshots.length > this.config.retainCount) {
      const toRemove = allSnapshots.slice(this.config.retainCount);
      toRemove.forEach(snapshot => {
        this.snapshots.delete(snapshot.id);
      });
    }
  }

  /**
   * Get current state for decision making
   */
  getCurrentState(): {
    lastSnapshotTime: Date | null;
    stateChangeCount: number;
    memoryAddedCount: number;
    snapshotCount: number;
  } {
    return {
      lastSnapshotTime: this.lastSnapshotTime,
      stateChangeCount: this.stateChangeCount,
      memoryAddedCount: this.memoryAddedCount,
      snapshotCount: this.snapshots.size,
    };
  }

  /**
   * Simplified takeSnapshot for always-on agents
   * This is the high-level API used by tests and production code
   */
  async takeSnapshot(
    agentId: string,
    worldState: StateSnapshot,
    memoryEntries: MemoryEntry[]
  ): Promise<CombinedSnapshot & { 
    alwaysOnMetadata: AlwaysOnSnapshotMetadata;
    agentId: string;
    memorySize: number;
    worldState: StateSnapshot; // Alias for test compatibility
    memoryEntries: MemoryEntry[]; // Expose memory entries for test validation
  }> {
    const now = Date.now();
    const timeSinceLast = this.lastSnapshotTime 
      ? now - this.lastSnapshotTime.getTime()
      : 0;

    // Determine trigger based on current strategy
    const { should, trigger } = this.shouldTakeSnapshot(
      timeSinceLast,
      this.memoryAddedCount,
      this.stateChangeCount
    );

    const actualTrigger = should ? trigger : SnapshotTrigger.MANUAL;

    // Use createAlwaysOnSnapshot with default values
    const snapshot = this.createAlwaysOnSnapshot(
      agentId,
      `session-${agentId}`,
      this.snapshotCounter,
      `task-${agentId}`,
      `step-${this.snapshotCounter}`,
      worldState,
      memoryEntries,
      actualTrigger
    );

    // Return with additional fields for test compatibility
    return {
      ...snapshot,
      agentId,
      memorySize: memoryEntries.length,
      worldState: snapshot.worldStateSnapshot, // Alias for convenience
      memoryEntries, // Include full memory entries for validation
    };
  }

  /**
   * List all snapshots (optionally filtered by agent)
   */
  listSnapshots(agentId?: string): Array<CombinedSnapshot & { 
    alwaysOnMetadata: AlwaysOnSnapshotMetadata;
    agentId: string;
  }> {
    let results = Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (agentId) {
      results = results.filter(s => s.alwaysOnMetadata.agentId === agentId);
    }

    return results.map(s => ({
      ...s,
      agentId: s.alwaysOnMetadata.agentId,
    }));
  }

  /**
   * Rollback to a specific snapshot
   */
  async rollbackToSnapshot(
    snapshotId: string
  ): Promise<{
    success: boolean;
    snapshot: CombinedSnapshot & { alwaysOnMetadata: AlwaysOnSnapshotMetadata } | null;
    error?: string;
  }> {
    const snapshot = this.snapshots.get(snapshotId);
    
    if (!snapshot) {
      return {
        success: false,
        snapshot: null,
        error: `Snapshot ${snapshotId} not found`,
      };
    }

    // Reset counters to match snapshot state
    this.lastSnapshotTime = snapshot.timestamp;
    this.stateChangeCount = 0;
    this.memoryAddedCount = 0;

    return {
      success: true,
      snapshot,
    };
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(snapshotId: string): (CombinedSnapshot & { 
    alwaysOnMetadata: AlwaysOnSnapshotMetadata 
  }) | undefined {
    return this.snapshots.get(snapshotId);
  }

  /**
   * Delete a snapshot
   */
  deleteSnapshot(snapshotId: string): boolean {
    return this.snapshots.delete(snapshotId);
  }

  /**
   * Clear all snapshots for an agent
   */
  clearAgentSnapshots(agentId: string): number {
    const toRemove = Array.from(this.snapshots.values())
      .filter(s => s.alwaysOnMetadata.agentId === agentId);
    
    toRemove.forEach(s => this.snapshots.delete(s.id));
    return toRemove.length;
  }

  /**
   * Get snapshot count for an agent
   */
  getSnapshotCount(agentId?: string): number {
    if (!agentId) {
      return this.snapshots.size;
    }
    return Array.from(this.snapshots.values())
      .filter(s => s.alwaysOnMetadata.agentId === agentId)
      .length;
  }

  /**
   * Compute SHA-256 hash (simplified)
   */
  private computeHash(content: string): string {
    // Simplified hash for demo - in production use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Compute Merkle root from array of hashes
   */
  private computeMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) return this.computeHash('');
    if (hashes.length === 1) return hashes[0];

    let currentLevel = hashes;
    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          const combined = currentLevel[i] + currentLevel[i + 1];
          nextLevel.push(this.computeHash(combined));
        } else {
          const combined = currentLevel[i] + currentLevel[i];
          nextLevel.push(this.computeHash(combined));
        }
      }
      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }
}
