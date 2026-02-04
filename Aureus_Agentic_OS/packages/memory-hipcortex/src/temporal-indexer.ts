import { TemporalIndex, MemoryEntry } from './types';

/**
 * TemporalIndexer provides efficient indexing of memory entries
 * by time, task_id, step_id, and tags
 */
export class TemporalIndexer {
  private indices: TemporalIndex[] = [];
  private indexByTaskId: Map<string, TemporalIndex[]> = new Map();
  private indexByStepId: Map<string, TemporalIndex[]> = new Map();
  private indexByTag: Map<string, TemporalIndex[]> = new Map();

  /**
   * Add a memory entry to the index
   */
  indexEntry(entry: MemoryEntry): TemporalIndex {
    const index: TemporalIndex = {
      id: this.generateId(),
      timestamp: entry.provenance.timestamp,
      entryId: entry.id,
      task_id: entry.provenance.task_id,
      step_id: entry.provenance.step_id,
      tags: entry.tags,
    };

    this.indices.push(index);

    // Index by task_id
    if (index.task_id) {
      if (!this.indexByTaskId.has(index.task_id)) {
        this.indexByTaskId.set(index.task_id, []);
      }
      this.indexByTaskId.get(index.task_id)!.push(index);
    }

    // Index by step_id
    if (index.step_id) {
      if (!this.indexByStepId.has(index.step_id)) {
        this.indexByStepId.set(index.step_id, []);
      }
      this.indexByStepId.get(index.step_id)!.push(index);
    }

    // Index by tags
    if (index.tags) {
      for (const tag of index.tags) {
        if (!this.indexByTag.has(tag)) {
          this.indexByTag.set(tag, []);
        }
        this.indexByTag.get(tag)!.push(index);
      }
    }

    return index;
  }

  /**
   * Restore a temporal index (used when loading from persistence)
   */
  restoreIndex(index: TemporalIndex): void {
    this.indices.push(index);

    // Index by task_id
    if (index.task_id) {
      if (!this.indexByTaskId.has(index.task_id)) {
        this.indexByTaskId.set(index.task_id, []);
      }
      this.indexByTaskId.get(index.task_id)!.push(index);
    }

    // Index by step_id
    if (index.step_id) {
      if (!this.indexByStepId.has(index.step_id)) {
        this.indexByStepId.set(index.step_id, []);
      }
      this.indexByStepId.get(index.step_id)!.push(index);
    }

    // Index by tags
    if (index.tags) {
      for (const tag of index.tags) {
        if (!this.indexByTag.has(tag)) {
          this.indexByTag.set(tag, []);
        }
        this.indexByTag.get(tag)!.push(index);
      }
    }
  }

  /**
   * Query indices by task_id
   */
  queryByTaskId(task_id: string): TemporalIndex[] {
    return this.indexByTaskId.get(task_id) || [];
  }

  /**
   * Query indices by step_id
   */
  queryByStepId(step_id: string): TemporalIndex[] {
    return this.indexByStepId.get(step_id) || [];
  }

  /**
   * Query indices by tag
   */
  queryByTag(tag: string): TemporalIndex[] {
    return this.indexByTag.get(tag) || [];
  }

  /**
   * Query indices by time range
   */
  queryByTimeRange(start: Date, end: Date): TemporalIndex[] {
    return this.indices.filter(
      idx => idx.timestamp >= start && idx.timestamp <= end
    );
  }

  /**
   * Query indices with multiple filters
   */
  query(filters: {
    task_id?: string;
    step_id?: string;
    tags?: string[];
    timeRange?: { start: Date; end: Date };
  }): TemporalIndex[] {
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

    return results;
  }

  /**
   * Get all indices sorted by timestamp
   */
  getAllIndices(): TemporalIndex[] {
    return [...this.indices].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `idx-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
