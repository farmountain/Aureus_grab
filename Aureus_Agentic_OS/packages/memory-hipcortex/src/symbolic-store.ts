/**
 * SymbolicStore for persisting symbolic entities from Perception
 * Integrates with the Perception pipeline to store and query entities
 */

import { MemoryEntry, Provenance } from './types';
import { deepClone } from './utils';

/**
 * Symbolic entity structure compatible with Perception package
 */
export interface SymbolicEntity {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  relationships?: EntityRelationship[];
  source: string;
  confidence: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Entity relationship structure
 */
export interface EntityRelationship {
  type: string;
  targetId: string;
  properties?: Record<string, unknown>;
}

/**
 * Query parameters for symbolic entities
 */
export interface SymbolicEntityQuery {
  type?: string;
  source?: string;
  minConfidence?: number;
  timeRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
  relatedTo?: string;
  relationType?: string;
}

/**
 * SymbolicStore manages symbolic entities extracted from perception
 * Provides persistence and query capabilities for structured entities
 */
export class SymbolicStore {
  private entities: Map<string, SymbolicEntity> = new Map();
  private typeIndex: Map<string, Set<string>> = new Map();
  private sourceIndex: Map<string, Set<string>> = new Map();
  private relationshipIndex: Map<string, Set<string>> = new Map();

  /**
   * Store a symbolic entity with optional provenance for audit trail
   */
  async store(entity: SymbolicEntity, provenance?: Provenance): Promise<void> {
    // Store the entity
    this.entities.set(entity.id, deepClone(entity));

    // Update type index
    if (!this.typeIndex.has(entity.type)) {
      this.typeIndex.set(entity.type, new Set());
    }
    this.typeIndex.get(entity.type)!.add(entity.id);

    // Update source index
    if (!this.sourceIndex.has(entity.source)) {
      this.sourceIndex.set(entity.source, new Set());
    }
    this.sourceIndex.get(entity.source)!.add(entity.id);

    // Update relationship index
    if (entity.relationships) {
      for (const rel of entity.relationships) {
        const key = `${entity.id}:${rel.type}`;
        if (!this.relationshipIndex.has(key)) {
          this.relationshipIndex.set(key, new Set());
        }
        this.relationshipIndex.get(key)!.add(rel.targetId);
      }
    }
  }

  /**
   * Get entity by ID
   */
  async get(id: string): Promise<SymbolicEntity | null> {
    const entity = this.entities.get(id);
    return entity ? deepClone(entity) : null;
  }

  /**
   * Query entities with flexible filters
   */
  async query(query: SymbolicEntityQuery): Promise<SymbolicEntity[]> {
    let candidateIds: Set<string> | null = null;

    // Filter by type
    if (query.type) {
      candidateIds = this.typeIndex.get(query.type) || new Set();
    }

    // Filter by source
    if (query.source) {
      const sourceIds = this.sourceIndex.get(query.source) || new Set();
      candidateIds = candidateIds
        ? this.intersect(candidateIds, sourceIds)
        : sourceIds;
    }

    // Filter by relationships
    if (query.relatedTo && query.relationType) {
      const relKey = `${query.relatedTo}:${query.relationType}`;
      const relatedIds = this.relationshipIndex.get(relKey) || new Set();
      candidateIds = candidateIds
        ? this.intersect(candidateIds, relatedIds)
        : relatedIds;
    }

    // If no filters, use all entities
    if (!candidateIds) {
      candidateIds = new Set(this.entities.keys());
    }

    // Get entities and apply additional filters
    const results: SymbolicEntity[] = [];
    
    for (const id of candidateIds) {
      const entity = this.entities.get(id);
      if (!entity) continue;

      // Filter by confidence
      if (query.minConfidence !== undefined && entity.confidence < query.minConfidence) {
        continue;
      }

      // Filter by time range
      if (query.timeRange) {
        const timestamp = new Date(entity.timestamp).getTime();
        const start = query.timeRange.start.getTime();
        const end = query.timeRange.end.getTime();
        if (timestamp < start || timestamp > end) {
          continue;
        }
      }

      results.push(deepClone(entity));
    }

    return results;
  }

  /**
   * Query entities by type
   */
  async queryByType(type: string): Promise<SymbolicEntity[]> {
    return this.query({ type });
  }

  /**
   * Query entities by source
   */
  async queryBySource(source: string): Promise<SymbolicEntity[]> {
    return this.query({ source });
  }

  /**
   * Find entities related to a given entity
   */
  async findRelated(entityId: string, relationType?: string): Promise<SymbolicEntity[]> {
    const entity = this.entities.get(entityId);
    if (!entity || !entity.relationships) {
      return [];
    }

    const relatedIds = entity.relationships
      .filter(rel => !relationType || rel.type === relationType)
      .map(rel => rel.targetId);

    const results: SymbolicEntity[] = [];
    for (const id of relatedIds) {
      const relatedEntity = this.entities.get(id);
      if (relatedEntity) {
        results.push(deepClone(relatedEntity));
      }
    }

    return results;
  }

  /**
   * Get all entities
   */
  async all(): Promise<SymbolicEntity[]> {
    return Array.from(this.entities.values()).map(e => deepClone(e));
  }

  /**
   * Clear all entities
   */
  async clear(): Promise<void> {
    this.entities.clear();
    this.typeIndex.clear();
    this.sourceIndex.clear();
    this.relationshipIndex.clear();
  }

  /**
   * Get statistics about stored entities
   */
  getStats(): {
    totalEntities: number;
    byType: Record<string, number>;
    bySources: number;
    avgConfidence: number;
  } {
    const allEntities = Array.from(this.entities.values());
    const byType: Record<string, number> = {};

    for (const entity of allEntities) {
      byType[entity.type] = (byType[entity.type] || 0) + 1;
    }

    const totalConfidence = allEntities.reduce((sum, e) => sum + e.confidence, 0);
    const avgConfidence = allEntities.length > 0 ? totalConfidence / allEntities.length : 0;

    return {
      totalEntities: this.entities.size,
      byType,
      bySources: this.sourceIndex.size,
      avgConfidence,
    };
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
