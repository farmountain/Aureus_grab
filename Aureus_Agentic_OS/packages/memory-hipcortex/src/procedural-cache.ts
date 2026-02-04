/**
 * ProceduralCache for storing procedural knowledge and learned patterns
 * Integrates with ReflexionEngine to cache fixes and workflows
 */

import { Provenance } from './types';
import { deepClone } from './utils';

/**
 * Procedural knowledge entry
 */
export interface ProceduralEntry {
  id: string;
  type: 'fix' | 'workflow' | 'pattern' | 'heuristic';
  context: string; // Context where this knowledge applies (e.g., failure taxonomy)
  knowledge: unknown; // The procedural knowledge (fix, workflow steps, pattern, etc.)
  confidence: number;
  successRate?: number; // Track success rate of applying this knowledge
  usageCount: number; // How many times this was used
  timestamp: Date;
  lastUsed?: Date;
  metadata?: Record<string, unknown>;
  provenance?: Provenance;
}

/**
 * Query parameters for procedural knowledge
 */
export interface ProceduralQuery {
  type?: ProceduralEntry['type'];
  context?: string;
  minConfidence?: number;
  minSuccessRate?: number;
  timeRange?: {
    start: Date;
    end: Date;
  };
  sortBy?: 'confidence' | 'successRate' | 'usageCount' | 'timestamp';
  limit?: number;
}

/**
 * Usage tracking for a procedural entry
 */
export interface UsageRecord {
  entryId: string;
  timestamp: Date;
  success: boolean;
  context?: Record<string, unknown>;
}

/**
 * ProceduralCache manages procedural knowledge and learned patterns
 * Provides caching and query capabilities for operational knowledge
 */
export class ProceduralCache {
  // Confidence adjustment constants
  private static readonly MIN_USAGE_FOR_BOOST = 5;
  private static readonly MIN_SUCCESS_RATE_FOR_BOOST = 0.8;
  private static readonly CONFIDENCE_BOOST = 0.05;
  private static readonly MIN_SUCCESS_RATE_FOR_PENALTY = 0.5;
  private static readonly CONFIDENCE_PENALTY = 0.1;

  private entries: Map<string, ProceduralEntry> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();
  private contextIndex: Map<string, Set<string>> = new Map();
  private usageRecords: UsageRecord[] = [];

  /**
   * Store a procedural knowledge entry
   */
  async store(entry: ProceduralEntry): Promise<void> {
    // Initialize usage tracking if new
    if (!entry.usageCount) {
      entry.usageCount = 0;
    }
    if (!entry.successRate) {
      entry.successRate = 1.0; // Optimistic initial value
    }

    this.entries.set(entry.id, deepClone(entry));

    // Update type index
    if (!this.typeIndex.has(entry.type)) {
      this.typeIndex.set(entry.type, new Set());
    }
    this.typeIndex.get(entry.type)!.add(entry.id);

    // Update context index
    if (!this.contextIndex.has(entry.context)) {
      this.contextIndex.set(entry.context, new Set());
    }
    this.contextIndex.get(entry.context)!.add(entry.id);
  }

  /**
   * Get entry by ID
   */
  async get(id: string): Promise<ProceduralEntry | null> {
    const entry = this.entries.get(id);
    return entry ? deepClone(entry) : null;
  }

  /**
   * Query procedural knowledge with flexible filters
   */
  async query(query: ProceduralQuery): Promise<ProceduralEntry[]> {
    let candidateIds: Set<string> | null = null;

    // Filter by type
    if (query.type) {
      candidateIds = this.typeIndex.get(query.type) || new Set();
    }

    // Filter by context
    if (query.context) {
      const contextIds = this.contextIndex.get(query.context) || new Set();
      candidateIds = candidateIds
        ? this.intersect(candidateIds, contextIds)
        : contextIds;
    }

    // If no filters, use all entries
    if (!candidateIds) {
      candidateIds = new Set(this.entries.keys());
    }

    // Get entries and apply additional filters
    const results: ProceduralEntry[] = [];
    
    for (const id of candidateIds) {
      const entry = this.entries.get(id);
      if (!entry) continue;

      // Filter by confidence
      if (query.minConfidence !== undefined && entry.confidence < query.minConfidence) {
        continue;
      }

      // Filter by success rate
      if (query.minSuccessRate !== undefined && 
          entry.successRate !== undefined && 
          entry.successRate < query.minSuccessRate) {
        continue;
      }

      // Filter by time range
      if (query.timeRange) {
        const timestamp = entry.timestamp.getTime();
        const start = query.timeRange.start.getTime();
        const end = query.timeRange.end.getTime();
        if (timestamp < start || timestamp > end) {
          continue;
        }
      }

      results.push(deepClone(entry));
    }

    // Sort results
    if (query.sortBy) {
      results.sort((a, b) => {
        const aVal = this.getSortValue(a, query.sortBy!);
        const bVal = this.getSortValue(b, query.sortBy!);
        return bVal - aVal; // Descending order
      });
    }

    // Apply limit
    if (query.limit && query.limit > 0) {
      return results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Record usage of a procedural entry
   */
  async recordUsage(entryId: string, success: boolean, context?: Record<string, unknown>): Promise<void> {
    const entry = this.entries.get(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    // Record usage
    this.usageRecords.push({
      entryId,
      timestamp: new Date(),
      success,
      context,
    });

    // Update entry statistics
    entry.usageCount++;
    entry.lastUsed = new Date();

    // Update success rate
    const entryRecords = this.usageRecords.filter(r => r.entryId === entryId);
    const successCount = entryRecords.filter(r => r.success).length;
    entry.successRate = entryRecords.length > 0 ? successCount / entryRecords.length : 1.0;

    // Update confidence based on usage
    // More usage with high success rate increases confidence
    if (entry.usageCount >= ProceduralCache.MIN_USAGE_FOR_BOOST && 
        entry.successRate >= ProceduralCache.MIN_SUCCESS_RATE_FOR_BOOST) {
      entry.confidence = Math.min(1.0, entry.confidence + ProceduralCache.CONFIDENCE_BOOST);
    } else if (entry.successRate < ProceduralCache.MIN_SUCCESS_RATE_FOR_PENALTY) {
      entry.confidence = Math.max(0.0, entry.confidence - ProceduralCache.CONFIDENCE_PENALTY);
    }
  }

  /**
   * Get most relevant procedural knowledge for a context
   */
  async getBestMatch(context: string, type?: ProceduralEntry['type']): Promise<ProceduralEntry | null> {
    const results = await this.query({
      context,
      type,
      sortBy: 'successRate',
      limit: 1,
    });

    return results.length > 0 ? results[0] : null;
  }

  /**
   * Get all entries
   */
  async all(): Promise<ProceduralEntry[]> {
    return Array.from(this.entries.values()).map(e => deepClone(e));
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.entries.clear();
    this.typeIndex.clear();
    this.contextIndex.clear();
    this.usageRecords = [];
  }

  /**
   * Get statistics about cached knowledge
   */
  getStats(): {
    totalEntries: number;
    byType: Record<string, number>;
    byContext: number;
    avgConfidence: number;
    avgSuccessRate: number;
    totalUsage: number;
  } {
    const allEntries = Array.from(this.entries.values());
    const byType: Record<string, number> = {};

    for (const entry of allEntries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
    }

    const totalConfidence = allEntries.reduce((sum, e) => sum + e.confidence, 0);
    const avgConfidence = allEntries.length > 0 ? totalConfidence / allEntries.length : 0;

    const entriesWithSuccessRate = allEntries.filter(e => e.successRate !== undefined);
    const totalSuccessRate = entriesWithSuccessRate.reduce((sum, e) => sum + (e.successRate || 0), 0);
    const avgSuccessRate = entriesWithSuccessRate.length > 0 
      ? totalSuccessRate / entriesWithSuccessRate.length 
      : 0;

    const totalUsage = allEntries.reduce((sum, e) => sum + e.usageCount, 0);

    return {
      totalEntries: this.entries.size,
      byType,
      byContext: this.contextIndex.size,
      avgConfidence,
      avgSuccessRate,
      totalUsage,
    };
  }

  /**
   * Get usage records for an entry
   */
  getUsageHistory(entryId: string): UsageRecord[] {
    return this.usageRecords
      .filter(r => r.entryId === entryId)
      .map(r => deepClone(r));
  }

  /**
   * Get sort value for an entry
   */
  private getSortValue(entry: ProceduralEntry, sortBy: string): number {
    switch (sortBy) {
      case 'confidence':
        return entry.confidence;
      case 'successRate':
        return entry.successRate || 0;
      case 'usageCount':
        return entry.usageCount;
      case 'timestamp':
        return entry.timestamp.getTime();
      default:
        return 0;
    }
  }

  /**
   * Intersect two sets
   */
  private intersect(setA: Set<string>, setB: Set<string>): Set<string> {
    const result = new Set<string>();
    for (const item of setA) {
      if (setB.has(item)) {
        result.add(item);
      }
    }
    return result;
  }
}
