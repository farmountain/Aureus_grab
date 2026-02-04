/**
 * Integration utilities for connecting memory stores with Perception and ReflexionEngine
 */

import { SymbolicStore, SymbolicEntity } from './symbolic-store';
import { ProceduralCache, ProceduralEntry } from './procedural-cache';
import { Provenance } from './types';

/**
 * Perception integration types (compatible with @aureus/perception)
 */
export interface PerceptionOutput {
  entities: Array<{
    id: string;
    type: string;
    properties: Record<string, unknown>;
    relationships?: Array<{
      type: string;
      targetId: string;
      properties?: Record<string, unknown>;
    }>;
    source: string;
    confidence: number;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }>;
  inputId: string;
  timestamp: Date;
}

/**
 * ReflexionEngine integration types (compatible with @aureus/reflexion)
 */
export interface ReflexionPostmortem {
  id: string;
  workflowId: string;
  taskId: string;
  failureTaxonomy: string;
  rootCause: string;
  proposedFix: {
    id: string;
    fixType: 'tool-swap' | 'threshold-adjustment' | 'step-reorder' | 'parameter-change';
    description: string;
    changes: unknown;
    confidence: number;
  };
  confidence: number;
  timestamp: Date;
}

/**
 * PerceptionIntegrator bridges Perception output to SymbolicStore
 */
export class PerceptionIntegrator {
  constructor(private symbolicStore: SymbolicStore) {}

  /**
   * Store entities from Perception output
   */
  async storePerceptionOutput(
    output: PerceptionOutput,
    provenance?: Provenance
  ): Promise<void> {
    for (const entity of output.entities) {
      await this.symbolicStore.store(entity, provenance);
    }
  }

  /**
   * Convert Perception entity to SymbolicEntity format
   */
  convertToSymbolicEntity(perceptionEntity: PerceptionOutput['entities'][0]): SymbolicEntity {
    return {
      id: perceptionEntity.id,
      type: perceptionEntity.type,
      properties: perceptionEntity.properties,
      relationships: perceptionEntity.relationships,
      source: perceptionEntity.source,
      confidence: perceptionEntity.confidence,
      timestamp: perceptionEntity.timestamp,
      metadata: perceptionEntity.metadata,
    };
  }

  /**
   * Query symbolic store and format for Perception compatibility
   */
  async queryForPerception(query: {
    type?: string;
    source?: string;
    minConfidence?: number;
  }): Promise<PerceptionOutput['entities']> {
    const entities = await this.symbolicStore.query(query);
    return entities;
  }
}

/**
 * ReflexionIntegrator bridges ReflexionEngine output to ProceduralCache
 */
export class ReflexionIntegrator {
  constructor(private proceduralCache: ProceduralCache) {}

  /**
   * Store postmortem as procedural knowledge
   */
  async storePostmortem(
    postmortem: ReflexionPostmortem,
    provenance?: Provenance
  ): Promise<void> {
    const entry: ProceduralEntry = {
      id: `proc-${postmortem.id}`,
      type: 'fix',
      context: postmortem.failureTaxonomy,
      knowledge: {
        postmortemId: postmortem.id,
        rootCause: postmortem.rootCause,
        fix: postmortem.proposedFix,
        workflowId: postmortem.workflowId,
        taskId: postmortem.taskId,
      },
      confidence: postmortem.confidence,
      usageCount: 0,
      timestamp: postmortem.timestamp,
      metadata: {
        fixType: postmortem.proposedFix.fixType,
        description: postmortem.proposedFix.description,
      },
      provenance,
    };

    await this.proceduralCache.store(entry);
  }

  /**
   * Store successful fix as a pattern
   */
  async storeSuccessfulFix(
    postmortemId: string,
    fixId: string,
    context: string,
    pattern: unknown,
    provenance?: Provenance
  ): Promise<void> {
    const entry: ProceduralEntry = {
      id: `pattern-${fixId}`,
      type: 'pattern',
      context,
      knowledge: {
        postmortemId,
        fixId,
        pattern,
      },
      confidence: 0.9, // High confidence for proven patterns
      successRate: 1.0, // Start with 100% since it succeeded
      usageCount: 1,
      timestamp: new Date(),
      metadata: {
        source: 'reflexion-engine',
      },
      provenance,
    };

    await this.proceduralCache.store(entry);
  }

  /**
   * Get relevant fixes for a failure taxonomy
   */
  async getRelevantFixes(failureTaxonomy: string): Promise<ProceduralEntry[]> {
    return this.proceduralCache.query({
      type: 'fix',
      context: failureTaxonomy,
      sortBy: 'successRate',
    });
  }

  /**
   * Record fix usage outcome
   */
  async recordFixUsage(
    entryId: string,
    success: boolean,
    context?: Record<string, unknown>
  ): Promise<void> {
    await this.proceduralCache.recordUsage(entryId, success, context);
  }

  /**
   * Get best fix for a context
   */
  async getBestFix(failureTaxonomy: string): Promise<ProceduralEntry | null> {
    return this.proceduralCache.getBestMatch(failureTaxonomy, 'fix');
  }
}

/**
 * IntegrationBridge combines both integrators for unified usage
 */
export class IntegrationBridge {
  public readonly perception: PerceptionIntegrator;
  public readonly reflexion: ReflexionIntegrator;

  constructor(
    symbolicStore: SymbolicStore,
    proceduralCache: ProceduralCache
  ) {
    this.perception = new PerceptionIntegrator(symbolicStore);
    this.reflexion = new ReflexionIntegrator(proceduralCache);
  }

  /**
   * Process both Perception output and Reflexion postmortem in one call
   */
  async processAll(data: {
    perceptionOutput?: PerceptionOutput;
    postmortem?: ReflexionPostmortem;
    provenance?: Provenance;
  }): Promise<void> {
    if (data.perceptionOutput) {
      await this.perception.storePerceptionOutput(
        data.perceptionOutput,
        data.provenance
      );
    }

    if (data.postmortem) {
      await this.reflexion.storePostmortem(
        data.postmortem,
        data.provenance
      );
    }
  }
}
