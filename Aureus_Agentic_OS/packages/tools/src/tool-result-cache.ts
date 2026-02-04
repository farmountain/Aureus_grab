import { ToolResult } from './index';

/**
 * Cached tool execution result with metadata
 */
export interface CachedToolResult extends ToolResult {
  idempotencyKey: string;
  timestamp: Date;
  replayed?: boolean;
}

/**
 * ToolResultCache interface for storing and replaying tool results
 * Prevents duplicate side effects on retries by caching results by idempotency key
 */
export interface ToolResultCache {
  /**
   * Get a cached result by idempotency key
   * Returns null if no cached result exists
   */
  get(idempotencyKey: string): Promise<CachedToolResult | null>;

  /**
   * Store a tool execution result in the cache
   */
  set(idempotencyKey: string, result: ToolResult): Promise<void>;

  /**
   * Check if a result exists in cache
   */
  has(idempotencyKey: string): Promise<boolean>;

  /**
   * Clear a specific cached result
   */
  clear(idempotencyKey: string): Promise<void>;

  /**
   * Clear all cached results
   */
  clearAll(): Promise<void>;
}

/**
 * In-memory implementation of ToolResultCache
 * In production, this would be replaced with a durable cache (e.g., Redis)
 */
export class InMemoryToolResultCache implements ToolResultCache {
  private cache = new Map<string, CachedToolResult>();

  async get(idempotencyKey: string): Promise<CachedToolResult | null> {
    const cached = this.cache.get(idempotencyKey);
    if (!cached) {
      return null;
    }

    // Mark as replayed when retrieved from cache
    return {
      ...cached,
      replayed: true,
    };
  }

  async set(idempotencyKey: string, result: ToolResult): Promise<void> {
    const cached: CachedToolResult = {
      ...result,
      idempotencyKey,
      timestamp: new Date(),
      replayed: false,
    };
    this.cache.set(idempotencyKey, cached);
  }

  async has(idempotencyKey: string): Promise<boolean> {
    return this.cache.has(idempotencyKey);
  }

  async clear(idempotencyKey: string): Promise<void> {
    this.cache.delete(idempotencyKey);
  }

  async clearAll(): Promise<void> {
    this.cache.clear();
  }

  // Helper method for testing
  size(): number {
    return this.cache.size;
  }
}
