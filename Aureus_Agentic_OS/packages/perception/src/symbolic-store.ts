/**
 * Symbolic store for managing extracted entities
 */

import { StateStore } from '@aureus/world-model';
import { SymbolicEntity, SymbolicStore, DataContract, EntityConflict, ConflictResolution, EntityRelationship } from './types';

/**
 * In-memory implementation of symbolic store
 */
export class InMemorySymbolicStore implements SymbolicStore {
  private entities: Map<string, SymbolicEntity> = new Map();

  async store(entity: SymbolicEntity): Promise<void> {
    this.entities.set(entity.id, entity);
  }

  async get(id: string): Promise<SymbolicEntity | null> {
    return this.entities.get(id) || null;
  }

  async queryByType(type: string): Promise<SymbolicEntity[]> {
    return Array.from(this.entities.values()).filter(e => e.type === type);
  }

  async queryBySource(source: string): Promise<SymbolicEntity[]> {
    return Array.from(this.entities.values()).filter(e => e.source === source);
  }

  async findRelated(entityId: string, relationType?: string): Promise<SymbolicEntity[]> {
    const entity = this.entities.get(entityId);
    if (!entity || !entity.relationships) {
      return [];
    }

    const relatedIds = entity.relationships
      .filter(rel => !relationType || rel.type === relationType)
      .map(rel => rel.targetId);

    return Array.from(this.entities.values())
      .filter(e => relatedIds.includes(e.id));
  }

  async all(): Promise<SymbolicEntity[]> {
    return Array.from(this.entities.values());
  }

  async clear(): Promise<void> {
    this.entities.clear();
  }

  /**
   * Detect conflicts with existing entities
   */
  async detectConflicts(entity: SymbolicEntity): Promise<EntityConflict[]> {
    const conflicts: EntityConflict[] = [];
    const existingEntities = await this.queryByType(entity.type);

    for (const existing of existingEntities) {
      if (existing.id === entity.id) {
        // Exact duplicate
        conflicts.push({
          type: 'duplicate',
          description: `Entity with ID ${entity.id} already exists`,
          existingEntityId: existing.id,
          newEntityId: entity.id,
          conflictingFields: ['id'],
          severity: 'high',
          resolution: {
            strategy: 'keep-existing',
            description: 'Entity with same ID already exists, keep existing',
            confidence: 0.9,
          },
        });
        continue;
      }

      // Check for property conflicts
      const conflictingFields = this.findConflictingFields(existing, entity);
      if (conflictingFields.length > 0) {
        const similarity = this.calculateSimilarity(existing, entity);
        
        if (similarity > 0.8) {
          // High similarity - likely duplicate
          conflicts.push({
            type: 'duplicate',
            description: `Entity ${entity.id} is very similar to ${existing.id}`,
            existingEntityId: existing.id,
            newEntityId: entity.id,
            conflictingFields,
            severity: 'medium',
            resolution: this.suggestMergeResolution(existing, entity),
          });
        } else if (similarity > 0.5) {
          // Medium similarity - inconsistent data
          conflicts.push({
            type: 'inconsistent',
            description: `Entity ${entity.id} has inconsistent data with ${existing.id}`,
            existingEntityId: existing.id,
            newEntityId: entity.id,
            conflictingFields,
            severity: 'medium',
            resolution: {
              strategy: 'keep-both',
              description: 'Data is inconsistent, keep both entities',
              confidence: 0.6,
            },
          });
        }
      }

      // Temporal conflicts
      const timeDiff = Math.abs(entity.timestamp.getTime() - existing.timestamp.getTime());
      if (timeDiff < 1000 && conflictingFields.length > 0) {
        conflicts.push({
          type: 'temporal',
          description: `Entity ${entity.id} created very close in time to ${existing.id}`,
          existingEntityId: existing.id,
          newEntityId: entity.id,
          conflictingFields,
          severity: 'low',
          resolution: {
            strategy: 'keep-new',
            description: 'Keep newer entity',
            confidence: 0.7,
          },
        });
      }

      // Relationship conflicts
      if (entity.relationships && existing.relationships) {
        const relationshipConflicts = this.findRelationshipConflicts(existing, entity);
        if (relationshipConflicts.length > 0) {
          conflicts.push({
            type: 'relationship',
            description: `Entity ${entity.id} has conflicting relationships with ${existing.id}`,
            existingEntityId: existing.id,
            newEntityId: entity.id,
            conflictingFields: relationshipConflicts,
            severity: 'low',
            resolution: {
              strategy: 'merge',
              description: 'Merge relationships from both entities',
              confidence: 0.75,
            },
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Find conflicting fields between two entities
   */
  private findConflictingFields(e1: SymbolicEntity, e2: SymbolicEntity): string[] {
    const conflicts: string[] = [];
    const keys = new Set([...Object.keys(e1.properties), ...Object.keys(e2.properties)]);

    for (const key of keys) {
      const v1 = e1.properties[key];
      const v2 = e2.properties[key];

      if (v1 !== undefined && v2 !== undefined && 
          JSON.stringify(v1) !== JSON.stringify(v2)) {
        conflicts.push(key);
      }
    }

    return conflicts;
  }

  /**
   * Calculate similarity between two entities
   */
  private calculateSimilarity(e1: SymbolicEntity, e2: SymbolicEntity): number {
    if (e1.type !== e2.type) return 0;

    const keys1 = new Set(Object.keys(e1.properties));
    const keys2 = new Set(Object.keys(e2.properties));
    const allKeys = new Set([...keys1, ...keys2]);
    
    let matches = 0;
    for (const key of allKeys) {
      const v1 = e1.properties[key];
      const v2 = e2.properties[key];
      
      if (JSON.stringify(v1) === JSON.stringify(v2)) {
        matches++;
      }
    }

    return allKeys.size > 0 ? matches / allKeys.size : 0;
  }

  /**
   * Find relationship conflicts
   */
  private findRelationshipConflicts(e1: SymbolicEntity, e2: SymbolicEntity): string[] {
    const conflicts: string[] = [];
    
    if (!e1.relationships || !e2.relationships) return conflicts;

    const rels1 = new Map(e1.relationships.map(r => [`${r.type}:${r.targetId}`, r]));
    const rels2 = new Map(e2.relationships.map(r => [`${r.type}:${r.targetId}`, r]));

    for (const [key, rel2] of rels2) {
      const rel1 = rels1.get(key);
      if (rel1 && JSON.stringify(rel1.properties) !== JSON.stringify(rel2.properties)) {
        conflicts.push(key);
      }
    }

    return conflicts;
  }

  /**
   * Suggest merge resolution for similar entities
   */
  private suggestMergeResolution(e1: SymbolicEntity, e2: SymbolicEntity): ConflictResolution {
    // Merge properties, preferring newer values
    const mergedProperties = {
      ...e1.properties,
      ...e2.properties,
    };

    // Merge relationships, keeping unique ones
    const relationshipMap = new Map<string, EntityRelationship>();
    
    if (e1.relationships) {
      for (const rel of e1.relationships) {
        relationshipMap.set(`${rel.type}:${rel.targetId}`, rel);
      }
    }
    
    if (e2.relationships) {
      for (const rel of e2.relationships) {
        relationshipMap.set(`${rel.type}:${rel.targetId}`, rel);
      }
    }

    const mergedRelationships = Array.from(relationshipMap.values());

    return {
      strategy: 'merge',
      description: 'Merge properties and relationships from both entities',
      mergedEntity: {
        properties: mergedProperties,
        relationships: mergedRelationships,
        confidence: Math.max(e1.confidence, e2.confidence),
        timestamp: new Date(Math.max(e1.timestamp.getTime(), e2.timestamp.getTime())),
      },
      confidence: 0.8,
    };
  }
}

/**
 * StateStore-backed symbolic store implementation
 */
export class StateStoreSymbolicStore implements SymbolicStore {
  private static readonly PREFIX = 'symbolic:entity:';

  constructor(private stateStore: StateStore) {}

  async store(entity: SymbolicEntity): Promise<void> {
    const key = this.getKey(entity.id);
    await this.stateStore.create(key, entity);
  }

  async get(id: string): Promise<SymbolicEntity | null> {
    const key = this.getKey(id);
    const entry = await this.stateStore.read<SymbolicEntity>(key);
    return entry?.value || null;
  }

  async queryByType(type: string): Promise<SymbolicEntity[]> {
    const entities = await this.all();
    return entities.filter(e => e.type === type);
  }

  async queryBySource(source: string): Promise<SymbolicEntity[]> {
    const entities = await this.all();
    return entities.filter(e => e.source === source);
  }

  async findRelated(entityId: string, relationType?: string): Promise<SymbolicEntity[]> {
    const entity = await this.get(entityId);
    if (!entity || !entity.relationships) {
      return [];
    }

    const relatedIds = entity.relationships
      .filter(rel => !relationType || rel.type === relationType)
      .map(rel => rel.targetId);

    const allEntities = await this.all();
    return allEntities.filter(e => relatedIds.includes(e.id));
  }

  async all(): Promise<SymbolicEntity[]> {
    const keys = await this.stateStore.keys();
    const entityKeys = keys.filter(k => k.startsWith(StateStoreSymbolicStore.PREFIX));

    const entities: SymbolicEntity[] = [];
    for (const key of entityKeys) {
      const entry = await this.stateStore.read<SymbolicEntity>(key);
      if (entry) {
        entities.push(entry.value);
      }
    }

    return entities;
  }

  async clear(): Promise<void> {
    const keys = await this.stateStore.keys();
    const entityKeys = keys.filter(k => k.startsWith(StateStoreSymbolicStore.PREFIX));

    for (const key of entityKeys) {
      const entry = await this.stateStore.read(key);
      if (entry) {
        await this.stateStore.delete(key, entry.version);
      }
    }
  }

  /**
   * Detect conflicts with existing entities
   * Reuses conflict detection logic from InMemorySymbolicStore
   */
  async detectConflicts(entity: SymbolicEntity): Promise<EntityConflict[]> {
    const conflicts: EntityConflict[] = [];
    const existingEntities = await this.queryByType(entity.type);

    for (const existing of existingEntities) {
      if (existing.id === entity.id) {
        // Exact duplicate
        conflicts.push({
          type: 'duplicate',
          description: `Entity with ID ${entity.id} already exists`,
          existingEntityId: existing.id,
          newEntityId: entity.id,
          conflictingFields: ['id'],
          severity: 'high',
          resolution: {
            strategy: 'keep-existing',
            description: 'Entity with same ID already exists, keep existing',
            confidence: 0.9,
          },
        });
        continue;
      }

      // Check for property conflicts
      const conflictingFields = this.findConflictingFields(existing, entity);
      if (conflictingFields.length > 0) {
        const similarity = this.calculateSimilarity(existing, entity);
        
        if (similarity > 0.8) {
          conflicts.push({
            type: 'duplicate',
            description: `Entity ${entity.id} is very similar to ${existing.id}`,
            existingEntityId: existing.id,
            newEntityId: entity.id,
            conflictingFields,
            severity: 'medium',
            resolution: this.suggestMergeResolution(existing, entity),
          });
        } else if (similarity > 0.5) {
          conflicts.push({
            type: 'inconsistent',
            description: `Entity ${entity.id} has inconsistent data with ${existing.id}`,
            existingEntityId: existing.id,
            newEntityId: entity.id,
            conflictingFields,
            severity: 'medium',
            resolution: {
              strategy: 'keep-both',
              description: 'Data is inconsistent, keep both entities',
              confidence: 0.6,
            },
          });
        }
      }

      // Temporal conflicts
      const timeDiff = Math.abs(entity.timestamp.getTime() - existing.timestamp.getTime());
      if (timeDiff < 1000 && conflictingFields.length > 0) {
        conflicts.push({
          type: 'temporal',
          description: `Entity ${entity.id} created very close in time to ${existing.id}`,
          existingEntityId: existing.id,
          newEntityId: entity.id,
          conflictingFields,
          severity: 'low',
          resolution: {
            strategy: 'keep-new',
            description: 'Keep newer entity',
            confidence: 0.7,
          },
        });
      }

      // Relationship conflicts
      if (entity.relationships && existing.relationships) {
        const relationshipConflicts = this.findRelationshipConflicts(existing, entity);
        if (relationshipConflicts.length > 0) {
          conflicts.push({
            type: 'relationship',
            description: `Entity ${entity.id} has conflicting relationships with ${existing.id}`,
            existingEntityId: existing.id,
            newEntityId: entity.id,
            conflictingFields: relationshipConflicts,
            severity: 'low',
            resolution: {
              strategy: 'merge',
              description: 'Merge relationships from both entities',
              confidence: 0.75,
            },
          });
        }
      }
    }

    return conflicts;
  }

  private findConflictingFields(e1: SymbolicEntity, e2: SymbolicEntity): string[] {
    const conflicts: string[] = [];
    const keys = new Set([...Object.keys(e1.properties), ...Object.keys(e2.properties)]);

    for (const key of keys) {
      const v1 = e1.properties[key];
      const v2 = e2.properties[key];

      if (v1 !== undefined && v2 !== undefined && 
          JSON.stringify(v1) !== JSON.stringify(v2)) {
        conflicts.push(key);
      }
    }

    return conflicts;
  }

  private calculateSimilarity(e1: SymbolicEntity, e2: SymbolicEntity): number {
    if (e1.type !== e2.type) return 0;

    const keys1 = new Set(Object.keys(e1.properties));
    const keys2 = new Set(Object.keys(e2.properties));
    const allKeys = new Set([...keys1, ...keys2]);
    
    let matches = 0;
    for (const key of allKeys) {
      const v1 = e1.properties[key];
      const v2 = e2.properties[key];
      
      if (JSON.stringify(v1) === JSON.stringify(v2)) {
        matches++;
      }
    }

    return allKeys.size > 0 ? matches / allKeys.size : 0;
  }

  private findRelationshipConflicts(e1: SymbolicEntity, e2: SymbolicEntity): string[] {
    const conflicts: string[] = [];
    
    if (!e1.relationships || !e2.relationships) return conflicts;

    const rels1 = new Map(e1.relationships.map(r => [`${r.type}:${r.targetId}`, r]));
    const rels2 = new Map(e2.relationships.map(r => [`${r.type}:${r.targetId}`, r]));

    for (const [key, rel2] of rels2) {
      const rel1 = rels1.get(key);
      if (rel1 && JSON.stringify(rel1.properties) !== JSON.stringify(rel2.properties)) {
        conflicts.push(key);
      }
    }

    return conflicts;
  }

  private suggestMergeResolution(e1: SymbolicEntity, e2: SymbolicEntity): ConflictResolution {
    const mergedProperties = {
      ...e1.properties,
      ...e2.properties,
    };

    const relationshipMap = new Map<string, EntityRelationship>();
    
    if (e1.relationships) {
      for (const rel of e1.relationships) {
        relationshipMap.set(`${rel.type}:${rel.targetId}`, rel);
      }
    }
    
    if (e2.relationships) {
      for (const rel of e2.relationships) {
        relationshipMap.set(`${rel.type}:${rel.targetId}`, rel);
      }
    }

    const mergedRelationships = Array.from(relationshipMap.values());

    return {
      strategy: 'merge',
      description: 'Merge properties and relationships from both entities',
      mergedEntity: {
        properties: mergedProperties,
        relationships: mergedRelationships,
        confidence: Math.max(e1.confidence, e2.confidence),
        timestamp: new Date(Math.max(e1.timestamp.getTime(), e2.timestamp.getTime())),
      },
      confidence: 0.8,
    };
  }

  private getKey(entityId: string): string {
    return `${StateStoreSymbolicStore.PREFIX}${entityId}`;
  }
}

/**
 * Entity extractor interface
 */
export interface EntityExtractor {
  /**
   * Extract entities from validated contract
   */
  extract(contract: DataContract): Promise<SymbolicEntity[]>;
}

/**
 * Default entity extractor implementation
 */
export class DefaultEntityExtractor implements EntityExtractor {
  async extract(contract: DataContract): Promise<SymbolicEntity[]> {
    const entities: SymbolicEntity[] = [];

    // Extract entities based on intent type
    switch (contract.intent.type) {
      case 'observation':
      case 'data':
        entities.push(this.extractObservationEntity(contract));
        break;
      
      case 'event':
        entities.push(this.extractEventEntity(contract));
        break;
      
      case 'query':
        entities.push(this.extractQueryEntity(contract));
        break;
      
      case 'command':
        entities.push(this.extractCommandEntity(contract));
        break;
      
      default:
        entities.push(this.extractGenericEntity(contract));
    }

    return entities;
  }

  private extractObservationEntity(contract: DataContract): SymbolicEntity {
    return {
      id: `entity-${contract.id}`,
      type: 'observation',
      properties: {
        intent: contract.intent.type,
        data: contract.validatedData,
        confidence: contract.intent.confidence,
      },
      source: contract.inputId,
      confidence: contract.intent.confidence,
      timestamp: contract.timestamp,
      metadata: {
        schema: contract.schema,
        schemaVersion: contract.schemaVersion,
      },
    };
  }

  private extractEventEntity(contract: DataContract): SymbolicEntity {
    const eventData = contract.validatedData as {
      eventType?: string;
      payload?: unknown;
    };

    return {
      id: `entity-${contract.id}`,
      type: 'event',
      properties: {
        eventType: eventData.eventType || 'unknown',
        payload: eventData.payload,
        intent: contract.intent.type,
      },
      source: contract.inputId,
      confidence: contract.intent.confidence,
      timestamp: contract.timestamp,
      metadata: {
        schema: contract.schema,
      },
    };
  }

  private extractQueryEntity(contract: DataContract): SymbolicEntity {
    return {
      id: `entity-${contract.id}`,
      type: 'query',
      properties: {
        question: contract.intent.parameters.text || contract.validatedData,
        intent: contract.intent.type,
      },
      source: contract.inputId,
      confidence: contract.intent.confidence,
      timestamp: contract.timestamp,
      metadata: {
        schema: contract.schema,
      },
    };
  }

  private extractCommandEntity(contract: DataContract): SymbolicEntity {
    return {
      id: `entity-${contract.id}`,
      type: 'command',
      properties: {
        command: contract.intent.parameters.text || contract.validatedData,
        intent: contract.intent.type,
        parameters: contract.intent.parameters,
      },
      source: contract.inputId,
      confidence: contract.intent.confidence,
      timestamp: contract.timestamp,
      metadata: {
        schema: contract.schema,
      },
    };
  }

  private extractGenericEntity(contract: DataContract): SymbolicEntity {
    return {
      id: `entity-${contract.id}`,
      type: 'generic',
      properties: {
        data: contract.validatedData,
        intent: contract.intent.type,
      },
      source: contract.inputId,
      confidence: contract.intent.confidence,
      timestamp: contract.timestamp,
      metadata: {
        schema: contract.schema,
      },
    };
  }
}
