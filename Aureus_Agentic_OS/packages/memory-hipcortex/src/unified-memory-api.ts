/**
 * Unified query API for accessing multiple memory stores
 * Provides a single interface to query SymbolicStore, ProceduralCache, and MemoryAPI
 */

import { MemoryAPI } from './memory-api';
import { SymbolicStore, SymbolicEntity, SymbolicEntityQuery } from './symbolic-store';
import { ProceduralCache, ProceduralEntry, ProceduralQuery } from './procedural-cache';
import { MemoryEntry, MemoryQuery } from './types';

/**
 * Unified query parameters
 */
export interface UnifiedQuery {
  // Target stores (if not specified, queries all)
  stores?: Array<'memory' | 'symbolic' | 'procedural'>;
  
  // Memory API queries
  memory?: MemoryQuery;
  
  // Symbolic store queries
  symbolic?: SymbolicEntityQuery;
  
  // Procedural cache queries
  procedural?: ProceduralQuery;
  
  // Cross-store queries
  crossStore?: {
    // Find symbolic entities related to memory entries
    linkMemoryToSymbolic?: boolean;
    // Find procedural knowledge related to memory entries
    linkMemoryToProcedural?: boolean;
  };
}

/**
 * Unified query result
 */
export interface UnifiedQueryResult {
  memory?: MemoryEntry[];
  symbolic?: SymbolicEntity[];
  procedural?: ProceduralEntry[];
  metadata: {
    memoryCount: number;
    symbolicCount: number;
    proceduralCount: number;
    totalCount: number;
    queriedStores: string[];
  };
}

/**
 * UnifiedMemoryAPI provides a single interface to query all memory stores
 */
export class UnifiedMemoryAPI {
  constructor(
    private memoryAPI?: MemoryAPI,
    private symbolicStore?: SymbolicStore,
    private proceduralCache?: ProceduralCache
  ) {}

  /**
   * Query across all configured memory stores
   */
  async query(query: UnifiedQuery): Promise<UnifiedQueryResult> {
    const result: UnifiedQueryResult = {
      metadata: {
        memoryCount: 0,
        symbolicCount: 0,
        proceduralCount: 0,
        totalCount: 0,
        queriedStores: [],
      },
    };

    const targetStores = query.stores || ['memory', 'symbolic', 'procedural'];

    // Query memory API
    if (targetStores.includes('memory') && this.memoryAPI && query.memory) {
      result.memory = this.memoryAPI.read(query.memory);
      result.metadata.memoryCount = result.memory.length;
      result.metadata.queriedStores.push('memory');
    }

    // Query symbolic store
    if (targetStores.includes('symbolic') && this.symbolicStore && query.symbolic) {
      result.symbolic = await this.symbolicStore.query(query.symbolic);
      result.metadata.symbolicCount = result.symbolic.length;
      result.metadata.queriedStores.push('symbolic');
    }

    // Query procedural cache
    if (targetStores.includes('procedural') && this.proceduralCache && query.procedural) {
      result.procedural = await this.proceduralCache.query(query.procedural);
      result.metadata.proceduralCount = result.procedural.length;
      result.metadata.queriedStores.push('procedural');
    }

    result.metadata.totalCount = 
      result.metadata.memoryCount + 
      result.metadata.symbolicCount + 
      result.metadata.proceduralCount;

    return result;
  }

  /**
   * Get all memory from a specific time range across all stores
   */
  async getTimeRange(start: Date, end: Date): Promise<UnifiedQueryResult> {
    return this.query({
      memory: { timeRange: { start, end } },
      symbolic: { timeRange: { start, end } },
      procedural: { timeRange: { start, end } },
    });
  }

  /**
   * Get memory related to a specific task
   */
  async getTaskMemory(taskId: string): Promise<UnifiedQueryResult> {
    const result: UnifiedQueryResult = {
      metadata: {
        memoryCount: 0,
        symbolicCount: 0,
        proceduralCount: 0,
        totalCount: 0,
        queriedStores: [],
      },
    };

    // Query memory API by task_id
    if (this.memoryAPI) {
      result.memory = this.memoryAPI.read({ task_id: taskId });
      result.metadata.memoryCount = result.memory.length;
      result.metadata.queriedStores.push('memory');
    }

    result.metadata.totalCount = result.metadata.memoryCount;
    return result;
  }

  /**
   * Get symbolic entities with high confidence
   */
  async getHighConfidenceEntities(minConfidence: number = 0.8): Promise<SymbolicEntity[]> {
    if (!this.symbolicStore) {
      return [];
    }
    return this.symbolicStore.query({ minConfidence });
  }

  /**
   * Get best procedural knowledge for a context
   */
  async getBestProcedural(context: string, type?: ProceduralEntry['type']): Promise<ProceduralEntry | null> {
    if (!this.proceduralCache) {
      return null;
    }
    return this.proceduralCache.getBestMatch(context, type);
  }

  /**
   * Get comprehensive statistics from all stores
   */
  getStats(): {
    memory?: ReturnType<MemoryAPI['getStats']>;
    symbolic?: ReturnType<SymbolicStore['getStats']>;
    procedural?: ReturnType<ProceduralCache['getStats']>;
  } {
    return {
      memory: this.memoryAPI?.getStats(),
      symbolic: this.symbolicStore?.getStats(),
      procedural: this.proceduralCache?.getStats(),
    };
  }

  /**
   * Clear symbolic and procedural stores
   * Note: MemoryAPI doesn't provide a clear method, so it's not affected by this operation
   */
  async clearAll(): Promise<void> {
    if (this.symbolicStore) {
      await this.symbolicStore.clear();
    }
    if (this.proceduralCache) {
      await this.proceduralCache.clear();
    }
  }

  /**
   * Get memory API instance
   */
  getMemoryAPI(): MemoryAPI | undefined {
    return this.memoryAPI;
  }

  /**
   * Get symbolic store instance
   */
  getSymbolicStore(): SymbolicStore | undefined {
    return this.symbolicStore;
  }

  /**
   * Get procedural cache instance
   */
  getProceduralCache(): ProceduralCache | undefined {
    return this.proceduralCache;
  }
}

/**
 * Builder for constructing UnifiedMemoryAPI with fluent interface
 */
export class UnifiedMemoryAPIBuilder {
  private memoryAPI?: MemoryAPI;
  private symbolicStore?: SymbolicStore;
  private proceduralCache?: ProceduralCache;

  /**
   * Add memory API
   */
  withMemoryAPI(memoryAPI: MemoryAPI): this {
    this.memoryAPI = memoryAPI;
    return this;
  }

  /**
   * Add symbolic store
   */
  withSymbolicStore(symbolicStore: SymbolicStore): this {
    this.symbolicStore = symbolicStore;
    return this;
  }

  /**
   * Add procedural cache
   */
  withProceduralCache(proceduralCache: ProceduralCache): this {
    this.proceduralCache = proceduralCache;
    return this;
  }

  /**
   * Build the unified API
   */
  build(): UnifiedMemoryAPI {
    return new UnifiedMemoryAPI(
      this.memoryAPI,
      this.symbolicStore,
      this.proceduralCache
    );
  }
}
