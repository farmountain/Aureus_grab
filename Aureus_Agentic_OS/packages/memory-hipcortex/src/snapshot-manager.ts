import * as crypto from 'crypto';
import { StateSnapshot } from '@aureus/world-model';
import { MemoryEntry } from './types';

/**
 * Merkle-like snapshot format combining world-model state and memory pointers
 */
export interface CombinedSnapshot {
  id: string;
  timestamp: Date;
  taskId: string;
  stepId: string;
  contentHash: string; // SHA-256 content-addressed hash
  worldStateSnapshot: StateSnapshot;
  memoryPointers: MemoryPointer[];
  merkleRoot: string; // Merkle root of all content hashes
  metadata?: Record<string, unknown>;
  verified?: boolean; // Whether this passed CRV validation
}

/**
 * Memory pointer references memory entries without storing full content
 */
export interface MemoryPointer {
  entryId: string;
  type: 'episodic_note' | 'artifact' | 'snapshot';
  contentHash: string; // SHA-256 hash of memory entry content
  timestamp: Date;
}

/**
 * Rollback request with policy information
 */
export interface RollbackRequest {
  taskId: string;
  snapshotId: string;
  requestedBy: string;
  reason?: string;
  riskTier?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Combined rollback result with restoration details
 */
export interface CombinedRollbackResult {
  success: boolean;
  snapshotId: string;
  restoredState: {
    worldState: StateSnapshot;
    memoryPointers: MemoryPointer[];
  };
  previousState: {
    worldState: StateSnapshot;
    memoryPointers: MemoryPointer[];
  };
  timestamp: Date;
  approvalRequired: boolean;
  approved?: boolean;
  approvedBy?: string;
}

/**
 * SnapshotManager provides content-addressed snapshot storage with Merkle tree hashing
 * Combines world-model state and memory-hipcortex index pointers
 */
export class SnapshotManager {
  private snapshots = new Map<string, CombinedSnapshot>();
  private snapshotsByTask = new Map<string, string[]>();
  private currentWorldState?: StateSnapshot;
  private currentMemoryPointers: MemoryPointer[] = [];
  private snapshotCounter = 0;

  /**
   * Create a snapshot combining world state and memory pointers
   */
  createSnapshot(
    taskId: string,
    stepId: string,
    worldState: StateSnapshot,
    memoryEntries: MemoryEntry[],
    verified: boolean = false,
    metadata?: Record<string, unknown>
  ): CombinedSnapshot {
    // Convert memory entries to pointers with content hashes
    const memoryPointers = memoryEntries.map(entry => ({
      entryId: entry.id,
      type: entry.type,
      contentHash: this.computeHash(JSON.stringify(entry.content)),
      timestamp: entry.provenance.timestamp,
    }));

    // Compute content hash for world state
    const worldStateHash = this.computeHash(this.serializeSnapshot(worldState));

    // Compute Merkle root combining all hashes
    const allHashes = [
      worldStateHash,
      ...memoryPointers.map(p => p.contentHash),
    ];
    const merkleRoot = this.computeMerkleRoot(allHashes);

    // Generate snapshot ID
    const id = `snapshot-${++this.snapshotCounter}-${taskId}-${stepId}`;

    // Note: contentHash and merkleRoot are both the Merkle root for this implementation
    // contentHash provides semantic clarity (content-addressed storage)
    // merkleRoot indicates the cryptographic verification mechanism
    const snapshot: CombinedSnapshot = {
      id,
      timestamp: new Date(),
      taskId,
      stepId,
      contentHash: merkleRoot,  // Content-addressed hash for storage/lookup
      worldStateSnapshot: worldState,
      memoryPointers,
      merkleRoot,  // Merkle root for integrity verification
      metadata,
      verified,
    };

    // Store snapshot
    this.snapshots.set(id, snapshot);

    // Index by task
    if (!this.snapshotsByTask.has(taskId)) {
      this.snapshotsByTask.set(taskId, []);
    }
    this.snapshotsByTask.get(taskId)!.push(id);

    // Update current state
    this.currentWorldState = worldState;
    this.currentMemoryPointers = memoryPointers;

    console.log(`Created snapshot ${id} with Merkle root ${merkleRoot} (verified: ${verified})`);

    return snapshot;
  }

  /**
   * Get snapshot by ID
   */
  getSnapshot(snapshotId: string): CombinedSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  /**
   * Get all snapshots for a task
   */
  getSnapshotsByTask(taskId: string): CombinedSnapshot[] {
    const snapshotIds = this.snapshotsByTask.get(taskId) || [];
    return snapshotIds
      .map(id => this.snapshots.get(id))
      .filter((s): s is CombinedSnapshot => s !== undefined);
  }

  /**
   * Get the last verified snapshot for a task
   */
  getLastVerifiedSnapshot(taskId: string): CombinedSnapshot | undefined {
    const snapshots = this.getSnapshotsByTask(taskId);
    const verifiedSnapshots = snapshots.filter(s => s.verified);
    return verifiedSnapshots.length > 0 
      ? verifiedSnapshots[verifiedSnapshots.length - 1]
      : undefined;
  }

  /**
   * Get all verified snapshots
   */
  getAllVerifiedSnapshots(): CombinedSnapshot[] {
    return Array.from(this.snapshots.values()).filter(s => s.verified);
  }

  /**
   * Verify snapshot integrity using Merkle root
   */
  verifySnapshot(snapshotId: string): boolean {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return false;
    }

    // Recompute hashes
    const worldStateHash = this.computeHash(this.serializeSnapshot(snapshot.worldStateSnapshot));
    const allHashes = [
      worldStateHash,
      ...snapshot.memoryPointers.map(p => p.contentHash),
    ];
    const recomputedRoot = this.computeMerkleRoot(allHashes);

    return recomputedRoot === snapshot.merkleRoot;
  }

  /**
   * Restore state from a snapshot
   */
  async restoreSnapshot(snapshotId: string): Promise<{
    worldState: StateSnapshot;
    memoryPointers: MemoryPointer[];
  }> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    // Verify integrity before restoring
    if (!this.verifySnapshot(snapshotId)) {
      throw new Error(`Snapshot ${snapshotId} failed integrity check`);
    }

    // Deep clone world state but preserve Map structure
    const worldStateClone: StateSnapshot = {
      id: snapshot.worldStateSnapshot.id,
      timestamp: new Date(snapshot.worldStateSnapshot.timestamp),
      entries: new Map(snapshot.worldStateSnapshot.entries),
    };
    
    const memoryPointers = JSON.parse(JSON.stringify(snapshot.memoryPointers));

    return { worldState: worldStateClone, memoryPointers };
  }

  /**
   * Get current state
   */
  getCurrentState(): {
    worldState: StateSnapshot | undefined;
    memoryPointers: MemoryPointer[];
  } {
    return {
      worldState: this.currentWorldState,
      memoryPointers: [...this.currentMemoryPointers],
    };
  }

  /**
   * Compute SHA-256 hash of content
   */
  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Compute Merkle root from array of hashes
   * Uses simple concatenation and hashing for Merkle tree
   */
  private computeMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) {
      return this.computeHash('');
    }

    if (hashes.length === 1) {
      return hashes[0];
    }

    // Build Merkle tree from bottom up
    let currentLevel = hashes;

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          // Pair of hashes
          const combined = currentLevel[i] + currentLevel[i + 1];
          nextLevel.push(this.computeHash(combined));
        } else {
          // Odd one out - hash with itself
          const combined = currentLevel[i] + currentLevel[i];
          nextLevel.push(this.computeHash(combined));
        }
      }

      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }

  /**
   * Serialize state snapshot to consistent string format
   */
  private serializeSnapshot(snapshot: StateSnapshot): string {
    // Create deterministic serialization
    const entries: any[] = [];
    snapshot.entries.forEach((entry, key) => {
      entries.push({ key, entry });
    });

    // Sort by key for deterministic ordering
    entries.sort((a, b) => a.key.localeCompare(b.key));

    return JSON.stringify({
      id: snapshot.id,
      timestamp: snapshot.timestamp.toISOString(),
      entries,
    });
  }
}
