import { MemoryEntry, MemoryQuery } from './types';

/**
 * Streaming context configuration
 */
export interface StreamingContextConfig {
  batchSize: number;           // Number of entries per batch
  maxBatches?: number;         // Maximum number of batches to stream
  delayMs?: number;            // Delay between batches (for rate limiting)
  priorityOrder?: 'recent' | 'relevant' | 'frequent';
}

/**
 * Context batch for streaming
 */
export interface ContextBatch {
  batchNumber: number;
  entries: MemoryEntry[];
  hasMore: boolean;
  totalEstimate?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Incremental context iterator state
 */
interface IteratorState {
  offset: number;
  query: MemoryQuery;
  sortedEntries: MemoryEntry[];
  completed: boolean;
}

/**
 * Relevance scoring constants
 */
const TAG_WEIGHT = 2;
const ARTIFACT_BONUS = 1;

/**
 * StreamingContextAPI provides incremental and streaming access to memory context
 */
export class StreamingContextAPI {
  private iteratorStates: Map<string, IteratorState> = new Map();

  /**
   * Create a streaming context iterator
   * Returns an iterator ID for subsequent batch requests
   */
  createIterator(
    entries: MemoryEntry[],
    query: MemoryQuery,
    config: StreamingContextConfig
  ): string {
    const iteratorId = `iter-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    
    // Sort entries based on priority order
    const sortedEntries = this.sortEntriesByPriority(entries, config.priorityOrder || 'recent');

    const state: IteratorState = {
      offset: 0,
      query,
      sortedEntries,
      completed: false,
    };

    this.iteratorStates.set(iteratorId, state);

    return iteratorId;
  }

  /**
   * Get the next batch of context
   */
  getNextBatch(iteratorId: string, batchSize: number): ContextBatch | null {
    const state = this.iteratorStates.get(iteratorId);
    
    if (!state || state.completed) {
      return null;
    }

    const start = state.offset;
    const end = Math.min(start + batchSize, state.sortedEntries.length);
    const entries = state.sortedEntries.slice(start, end);

    state.offset = end;
    state.completed = end >= state.sortedEntries.length;

    const batch: ContextBatch = {
      batchNumber: Math.floor(start / batchSize),
      entries,
      hasMore: !state.completed,
      totalEstimate: state.sortedEntries.length,
      metadata: {
        offset: start,
        retrieved: entries.length,
      },
    };

    return batch;
  }

  /**
   * Stream all batches with an async generator
   */
  async *streamBatches(
    entries: MemoryEntry[],
    config: StreamingContextConfig
  ): AsyncGenerator<ContextBatch, void, unknown> {
    const sortedEntries = this.sortEntriesByPriority(entries, config.priorityOrder || 'recent');
    let offset = 0;
    let batchNumber = 0;

    while (offset < sortedEntries.length) {
      // Check max batches limit
      if (config.maxBatches && batchNumber >= config.maxBatches) {
        break;
      }

      const end = Math.min(offset + config.batchSize, sortedEntries.length);
      const batchEntries = sortedEntries.slice(offset, end);

      const batch: ContextBatch = {
        batchNumber,
        entries: batchEntries,
        hasMore: end < sortedEntries.length,
        totalEstimate: sortedEntries.length,
        metadata: {
          offset,
          retrieved: batchEntries.length,
        },
      };

      yield batch;

      offset = end;
      batchNumber++;

      // Add delay if configured
      if (config.delayMs && batch.hasMore) {
        await this.delay(config.delayMs);
      }
    }
  }

  /**
   * Get incremental context (fetch only new entries since last fetch)
   */
  getIncrementalContext(
    entries: MemoryEntry[],
    lastFetchTimestamp: Date,
    maxEntries?: number
  ): MemoryEntry[] {
    // Filter entries created after last fetch
    const newEntries = entries.filter(
      entry => entry.provenance.timestamp > lastFetchTimestamp
    );

    // Sort by timestamp (most recent first)
    newEntries.sort((a, b) => 
      b.provenance.timestamp.getTime() - a.provenance.timestamp.getTime()
    );

    // Limit results if specified
    if (maxEntries && newEntries.length > maxEntries) {
      return newEntries.slice(0, maxEntries);
    }

    return newEntries;
  }

  /**
   * Get context window (sliding window of recent entries)
   */
  getContextWindow(
    entries: MemoryEntry[],
    windowSize: number,
    windowOffset: number = 0
  ): MemoryEntry[] {
    // Sort by timestamp (most recent first)
    const sortedEntries = [...entries].sort((a, b) => 
      b.provenance.timestamp.getTime() - a.provenance.timestamp.getTime()
    );

    const start = windowOffset;
    const end = start + windowSize;

    return sortedEntries.slice(start, end);
  }

  /**
   * Get paginated context
   */
  getPaginatedContext(
    entries: MemoryEntry[],
    page: number,
    pageSize: number,
    sortBy: 'timestamp' | 'relevance' = 'timestamp'
  ): {
    entries: MemoryEntry[];
    page: number;
    pageSize: number;
    totalPages: number;
    totalEntries: number;
  } {
    const sortedEntries = sortBy === 'timestamp'
      ? this.sortByTimestamp(entries)
      : entries; // Relevance sorting would need additional context

    const totalEntries = sortedEntries.length;
    const totalPages = Math.ceil(totalEntries / pageSize);
    const start = page * pageSize;
    const end = Math.min(start + pageSize, totalEntries);

    return {
      entries: sortedEntries.slice(start, end),
      page,
      pageSize,
      totalPages,
      totalEntries,
    };
  }

  /**
   * Close an iterator and free resources
   */
  closeIterator(iteratorId: string): void {
    this.iteratorStates.delete(iteratorId);
  }

  /**
   * Get active iterator count
   */
  getActiveIteratorCount(): number {
    return this.iteratorStates.size;
  }

  /**
   * Sort entries by priority order
   */
  private sortEntriesByPriority(
    entries: MemoryEntry[],
    priority: 'recent' | 'relevant' | 'frequent'
  ): MemoryEntry[] {
    const sorted = [...entries];

    switch (priority) {
      case 'recent':
        sorted.sort((a, b) => 
          b.provenance.timestamp.getTime() - a.provenance.timestamp.getTime()
        );
        break;

      case 'relevant':
        // Relevance sorting would need additional scoring mechanism
        // For now, prioritize by tags and type
        sorted.sort((a, b) => {
          const aScore = (a.tags?.length || 0) * TAG_WEIGHT + (a.type === 'artifact' ? ARTIFACT_BONUS : 0);
          const bScore = (b.tags?.length || 0) * TAG_WEIGHT + (b.type === 'artifact' ? ARTIFACT_BONUS : 0);
          return bScore - aScore;
        });
        break;

      case 'frequent':
        // Would need access counts - fallback to recent for now
        sorted.sort((a, b) => 
          b.provenance.timestamp.getTime() - a.provenance.timestamp.getTime()
        );
        break;
    }

    return sorted;
  }

  /**
   * Sort entries by timestamp
   */
  private sortByTimestamp(entries: MemoryEntry[]): MemoryEntry[] {
    return [...entries].sort((a, b) => 
      b.provenance.timestamp.getTime() - a.provenance.timestamp.getTime()
    );
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * ContextRetrievalAPI provides high-level context retrieval for tool usage and workflows
 */
export class ContextRetrievalAPI {
  private streamingAPI: StreamingContextAPI;

  constructor() {
    this.streamingAPI = new StreamingContextAPI();
  }

  /**
   * Get context for tool execution
   * Returns relevant memories for a specific tool invocation
   */
  async getToolContext(
    allEntries: MemoryEntry[],
    toolName: string,
    maxEntries: number = 10
  ): Promise<MemoryEntry[]> {
    // Filter entries relevant to the tool
    const relevant = allEntries.filter(entry => {
      // Check if entry mentions the tool in metadata
      if (entry.metadata?.toolName === toolName) return true;
      
      // Check tags
      if (entry.tags?.includes(toolName)) return true;
      
      return false;
    });

    // Get most recent relevant entries
    const sorted = relevant.sort((a, b) => 
      b.provenance.timestamp.getTime() - a.provenance.timestamp.getTime()
    );

    return sorted.slice(0, maxEntries);
  }

  /**
   * Get context for workflow execution
   * Returns memories related to a specific workflow or task
   */
  async getWorkflowContext(
    allEntries: MemoryEntry[],
    taskId: string,
    includeRelated: boolean = false
  ): Promise<MemoryEntry[]> {
    // Get direct task entries
    const taskEntries = allEntries.filter(
      entry => entry.provenance.task_id === taskId
    );

    if (!includeRelated) {
      return taskEntries.sort((a, b) => 
        a.provenance.timestamp.getTime() - b.provenance.timestamp.getTime()
      );
    }

    // Include related tasks based on tags
    const taskTags = new Set(taskEntries.flatMap(e => e.tags || []));
    const relatedEntries = allEntries.filter(entry => {
      if (entry.provenance.task_id === taskId) return false;
      return entry.tags?.some(tag => taskTags.has(tag));
    });

    const combined = [...taskEntries, ...relatedEntries];
    return combined.sort((a, b) => 
      a.provenance.timestamp.getTime() - b.provenance.timestamp.getTime()
    );
  }

  /**
   * Stream context for large datasets
   */
  async *streamContext(
    entries: MemoryEntry[],
    config: StreamingContextConfig
  ): AsyncGenerator<ContextBatch, void, unknown> {
    yield* this.streamingAPI.streamBatches(entries, config);
  }

  /**
   * Get incremental updates
   */
  getIncrementalUpdates(
    entries: MemoryEntry[],
    lastFetchTimestamp: Date,
    maxEntries?: number
  ): MemoryEntry[] {
    return this.streamingAPI.getIncrementalContext(entries, lastFetchTimestamp, maxEntries);
  }
}
