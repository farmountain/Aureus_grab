/**
 * StateStore provides CRUD operations for structured facts/resources with versioning
 */

import { WorldModelSpec } from './world-model-spec-schema';

// Forward declaration for LatentStateStore to avoid circular dependency
export interface LatentStateStoreInterface {
  notifyBeforeUpdate(snapshot: StateSnapshot, predictedDiffs: StateDiff[]): Promise<void>;
  notifyAfterUpdate(beforeSnapshot: StateSnapshot, afterSnapshot: StateSnapshot, actualDiffs: StateDiff[]): Promise<void>;
}

/**
 * Versioned state entry with metadata
 */
export interface StateEntry<T = unknown> {
  key: string;
  value: T;
  version: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * State difference between two versions
 */
export interface StateDiff {
  key: string;
  before: StateEntry | null;
  after: StateEntry | null;
  operation: 'create' | 'update' | 'delete';
  timestamp: Date;
}

/**
 * Conflict detected when two writes touch same key with incompatible versions
 */
export interface StateConflict {
  key: string;
  expectedVersion: number;
  actualVersion: number;
  attemptedValue: unknown;
  timestamp: Date;
}

/**
 * StateStore interface for managing versioned state
 */
export interface StateStore {
  /**
   * Create a new state entry (version 1)
   */
  create<T = unknown>(key: string, value: T, metadata?: Record<string, unknown>): Promise<StateEntry<T>>;

  /**
   * Read the current state entry for a key
   */
  read<T = unknown>(key: string): Promise<StateEntry<T> | null>;

  /**
   * Read a specific version of a state entry
   */
  readVersion<T = unknown>(key: string, version: number): Promise<StateEntry<T> | null>;

  /**
   * Update an existing state entry with version check
   * @throws ConflictError if version doesn't match
   */
  update<T = unknown>(key: string, value: T, expectedVersion: number, metadata?: Record<string, unknown>): Promise<StateEntry<T>>;

  /**
   * Delete a state entry
   */
  delete(key: string, expectedVersion: number): Promise<void>;

  /**
   * Get all keys in the store
   */
  keys(): Promise<string[]>;

  /**
   * Take a snapshot of current state version
   */
  snapshot(): Promise<StateSnapshot>;

  /**
   * Compute diff between two snapshots
   */
  diff(beforeSnapshot: StateSnapshot, afterSnapshot: StateSnapshot): StateDiff[];

  /**
   * Get all conflicts detected in a task
   */
  getConflicts(taskId: string): StateConflict[];

  /**
   * Clear conflicts for a task
   * Should be called after conflicts have been resolved or when starting a new task execution
   */
  clearConflicts(taskId: string): void;

  /**
   * Record a conflict for a task
   * Called internally when ConflictError is caught during task execution
   */
  recordConflict(taskId: string, conflict: StateConflict): void;
}

/**
 * State snapshot at a point in time
 */
export interface StateSnapshot {
  id: string;
  timestamp: Date;
  entries: Map<string, StateEntry>;
}

/**
 * ConflictError thrown when update version doesn't match
 */
export class ConflictError extends Error {
  constructor(
    public key: string,
    public expectedVersion: number,
    public actualVersion: number
  ) {
    super(`Conflict on key "${key}": expected version ${expectedVersion}, found ${actualVersion}`);
    this.name = 'ConflictError';
  }
}

/**
 * InMemoryStateStore provides an in-memory implementation with versioning
 */
export class InMemoryStateStore implements StateStore {
  private state = new Map<string, StateEntry[]>(); // key -> version history
  private conflicts = new Map<string, StateConflict[]>(); // taskId -> conflicts
  private snapshotCounter = 0;
  private latentStateStore?: LatentStateStoreInterface;

  /**
   * Set latent state store for predictive update hooks
   */
  setLatentStateStore(latentStateStore: LatentStateStoreInterface): void {
    this.latentStateStore = latentStateStore;
  }

  async create<T = unknown>(
    key: string,
    value: T,
    metadata?: Record<string, unknown>
  ): Promise<StateEntry<T>> {
    if (this.state.has(key)) {
      throw new Error(`Key "${key}" already exists. Use update() instead.`);
    }

    const entry: StateEntry<T> = {
      key,
      value,
      version: 1,
      timestamp: new Date(),
      metadata,
    };

    this.state.set(key, [entry]);
    return entry;
  }

  async read<T = unknown>(key: string): Promise<StateEntry<T> | null> {
    const versions = this.state.get(key);
    if (!versions || versions.length === 0) {
      return null;
    }
    return versions[versions.length - 1] as StateEntry<T>;
  }

  async readVersion<T = unknown>(
    key: string,
    version: number
  ): Promise<StateEntry<T> | null> {
    const versions = this.state.get(key);
    if (!versions) {
      return null;
    }
    const entry = versions.find(v => v.version === version);
    return entry ? (entry as StateEntry<T>) : null;
  }

  async update<T = unknown>(
    key: string,
    value: T,
    expectedVersion: number,
    metadata?: Record<string, unknown>
  ): Promise<StateEntry<T>> {
    const versions = this.state.get(key);
    if (!versions || versions.length === 0) {
      throw new Error(`Key "${key}" does not exist. Use create() instead.`);
    }

    const current = versions[versions.length - 1];
    if (current.version !== expectedVersion) {
      throw new ConflictError(key, expectedVersion, current.version);
    }

    // Take snapshot before update only if hooks are present
    let beforeSnapshot: StateSnapshot | undefined;
    if (this.latentStateStore) {
      beforeSnapshot = await this.snapshot();
    }

    const entry: StateEntry<T> = {
      key,
      value,
      version: expectedVersion + 1,
      timestamp: new Date(),
      metadata,
    };

    versions.push(entry);

    // Take snapshot after update and notify hooks
    if (this.latentStateStore && beforeSnapshot) {
      const afterSnapshot = await this.snapshot();
      const diffs = this.diff(beforeSnapshot, afterSnapshot);
      await this.latentStateStore.notifyAfterUpdate(beforeSnapshot, afterSnapshot, diffs);
    }

    return entry;
  }

  async delete(key: string, expectedVersion: number): Promise<void> {
    const versions = this.state.get(key);
    if (!versions || versions.length === 0) {
      throw new Error(`Key "${key}" does not exist`);
    }

    const current = versions[versions.length - 1];
    if (current.version !== expectedVersion) {
      throw new ConflictError(key, expectedVersion, current.version);
    }

    this.state.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.state.keys());
  }

  async snapshot(): Promise<StateSnapshot> {
    const id = `snapshot-${++this.snapshotCounter}`;
    const entries = new Map<string, StateEntry>();

    for (const [key, versions] of this.state.entries()) {
      if (versions.length > 0) {
        entries.set(key, versions[versions.length - 1]);
      }
    }

    return {
      id,
      timestamp: new Date(),
      entries,
    };
  }

  diff(beforeSnapshot: StateSnapshot, afterSnapshot: StateSnapshot): StateDiff[] {
    const diffs: StateDiff[] = [];
    const allKeys = new Set([
      ...Array.from(beforeSnapshot.entries.keys()),
      ...Array.from(afterSnapshot.entries.keys()),
    ]);

    for (const key of allKeys) {
      const before = beforeSnapshot.entries.get(key) || null;
      const after = afterSnapshot.entries.get(key) || null;

      if (!before && after) {
        // Created
        diffs.push({
          key,
          before: null,
          after,
          operation: 'create',
          timestamp: after.timestamp,
        });
      } else if (before && !after) {
        // Deleted
        diffs.push({
          key,
          before,
          after: null,
          operation: 'delete',
          timestamp: afterSnapshot.timestamp,
        });
      } else if (before && after && before.version !== after.version) {
        // Updated
        diffs.push({
          key,
          before,
          after,
          operation: 'update',
          timestamp: after.timestamp,
        });
      }
    }

    return diffs;
  }

  getConflicts(taskId: string): StateConflict[] {
    return this.conflicts.get(taskId) || [];
  }

  clearConflicts(taskId: string): void {
    this.conflicts.delete(taskId);
  }

  recordConflict(taskId: string, conflict: StateConflict): void {
    if (!this.conflicts.has(taskId)) {
      this.conflicts.set(taskId, []);
    }
    this.conflicts.get(taskId)!.push(conflict);
  }

  /**
   * Store a world model specification with versioning
   */
  async storeWorldModel(spec: WorldModelSpec): Promise<StateEntry<WorldModelSpec>> {
    const key = `world-model:${spec.id}`;
    const existing = await this.read<WorldModelSpec>(key);

    if (existing) {
      // Update existing world model
      return this.update(key, spec, existing.version, {
        type: 'world-model',
        lastUpdated: new Date().toISOString(),
        specVersion: spec.version, // Store spec version separately to avoid confusion with entry version
      });
    } else {
      // Create new world model
      return this.create(key, spec, {
        type: 'world-model',
        created: new Date().toISOString(),
        specVersion: spec.version,
      });
    }
  }

  /**
   * Retrieve a world model by ID
   */
  async getWorldModel(id: string): Promise<WorldModelSpec | null> {
    const key = `world-model:${id}`;
    const entry = await this.read<WorldModelSpec>(key);
    return entry ? entry.value : null;
  }

  /**
   * List all stored world models
   */
  async listWorldModels(): Promise<Array<{ id: string; spec: WorldModelSpec; version: number; timestamp: Date }>> {
    const allKeys = await this.keys();
    const worldModelKeys = allKeys.filter(k => k.startsWith('world-model:'));
    
    const models: Array<{ id: string; spec: WorldModelSpec; version: number; timestamp: Date }> = [];
    
    for (const key of worldModelKeys) {
      const entry = await this.read<WorldModelSpec>(key);
      if (entry) {
        models.push({
          id: entry.value.id,
          spec: entry.value,
          version: entry.version,
          timestamp: entry.timestamp,
        });
      }
    }
    
    return models;
  }

  /**
   * Get all versions of a world model
   */
  async getWorldModelVersions(id: string): Promise<StateEntry<WorldModelSpec>[]> {
    const key = `world-model:${id}`;
    const versions = this.state.get(key);
    return versions ? (versions as StateEntry<WorldModelSpec>[]) : [];
  }

  /**
   * Delete a world model
   */
  async deleteWorldModel(id: string, expectedVersion: number): Promise<void> {
    const key = `world-model:${id}`;
    await this.delete(key, expectedVersion);
  }
}
