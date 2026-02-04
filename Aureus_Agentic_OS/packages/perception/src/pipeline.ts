/**
 * Main perception pipeline orchestrator
 */

import { CRVGate } from '@aureus/crv';
import {
  RawInput,
  NormalizedInput,
  DataContract,
  SymbolicEntity,
  HypothesisContext,
  PerceptionAdapter,
  DataContractValidator,
  SymbolicStore,
  ContextAggregator,
  PerceptionPipelineConfig,
  PerceptionPipelineResult,
  EntityConflict,
} from './types';
import { AdapterRegistry } from './adapters';
import { DefaultEntityExtractor, EntityExtractor } from './symbolic-store';

/**
 * Perception pipeline orchestrates the flow from raw input to hypothesis context
 */
export class PerceptionPipeline {
  private adapterRegistry: AdapterRegistry;
  private entityExtractor: EntityExtractor;
  private crvGate?: CRVGate;

  constructor(private config: PerceptionPipelineConfig, crvGate?: CRVGate) {
    this.adapterRegistry = new AdapterRegistry();
    
    // Register configured adapters
    for (const adapter of config.adapters) {
      this.adapterRegistry.register(adapter);
    }

    this.entityExtractor = new DefaultEntityExtractor();
    this.crvGate = crvGate;
  }

  /**
   * Process raw input through the complete pipeline
   */
  async process(input: RawInput): Promise<PerceptionPipelineResult> {
    const result: PerceptionPipelineResult = {
      success: false,
      inputId: input.id,
      errors: [],
      timestamp: new Date(),
    };

    try {
      // Stage 1: Normalization
      const normalized = await this.normalize(input);
      result.normalizedInput = normalized;

      if (this.config.enableCRVValidation && this.crvGate) {
        const crvResult = await this.crvGate.validate({
          id: normalized.id,
          data: normalized.data,
          metadata: normalized.metadata,
        });

        if (crvResult.blockedCommit) {
          result.errors?.push({
            stage: 'normalization',
            message: 'CRV gate blocked normalized input',
            details: crvResult,
          });
          return result;
        }
      }

      // Stage 2: Contract Validation
      const contract = await this.validateContract(normalized);
      result.contract = contract;

      if (this.config.enableCRVValidation && this.crvGate) {
        const crvResult = await this.crvGate.validate({
          id: contract.id,
          data: contract.validatedData,
          metadata: {
            intent: contract.intent,
            schema: contract.schema,
          },
        });

        if (crvResult.blockedCommit) {
          result.errors?.push({
            stage: 'validation',
            message: 'CRV gate blocked contract',
            details: crvResult,
          });
          return result;
        }
      }

      // Stage 3: Entity Extraction
      const entities = await this.extractEntities(contract);
      result.entities = entities;

      // Detect conflicts before storing
      const allConflicts: EntityConflict[] = [];
      if (this.config.symbolicStore.detectConflicts) {
        for (const entity of entities) {
          const conflicts = await this.config.symbolicStore.detectConflicts(entity);
          allConflicts.push(...conflicts);
        }
      }

      // Add conflicts to contract
      if (allConflicts.length > 0) {
        contract.conflicts = allConflicts;
      }

      // Store entities (even if there are conflicts - let user decide)
      for (const entity of entities) {
        await this.config.symbolicStore.store(entity);
      }

      if (this.config.enableCRVValidation && this.crvGate) {
        for (const entity of entities) {
          const crvResult = await this.crvGate.validate({
            id: entity.id,
            data: entity,
            metadata: { entityType: entity.type },
          });

          if (crvResult.blockedCommit) {
            result.errors?.push({
              stage: 'extraction',
              message: `CRV gate blocked entity ${entity.id}`,
              details: crvResult,
            });
            return result;
          }
        }
      }

      // Stage 4: Context Aggregation
      const context = await this.aggregateContext(entities);
      result.context = context;

      if (this.config.enableCRVValidation && this.crvGate) {
        const crvResult = await this.crvGate.validate({
          id: context.id,
          data: context,
          metadata: { goalId: context.goalId },
        });

        if (crvResult.blockedCommit) {
          result.errors?.push({
            stage: 'aggregation',
            message: 'CRV gate blocked context',
            details: crvResult,
          });
          return result;
        }
      }

      result.success = true;
    } catch (error) {
      result.errors?.push({
        stage: 'normalization',
        message: error instanceof Error ? error.message : String(error),
        details: error,
      });
    }

    return result;
  }

  /**
   * Stage 1: Normalize raw input using appropriate adapter
   */
  private async normalize(input: RawInput): Promise<NormalizedInput> {
    const adapter = this.adapterRegistry.findAdapter(input);
    
    if (!adapter) {
      throw new Error(`No adapter found for input source: ${input.source}`);
    }

    return adapter.normalize(input);
  }

  /**
   * Stage 2: Validate normalized input and extract intent
   */
  private async validateContract(input: NormalizedInput): Promise<DataContract> {
    return this.config.contractValidator.validate(input);
  }

  /**
   * Stage 3: Extract entities from validated contract
   */
  private async extractEntities(contract: DataContract): Promise<SymbolicEntity[]> {
    return this.entityExtractor.extract(contract);
  }

  /**
   * Stage 4: Aggregate entities into hypothesis context
   */
  private async aggregateContext(entities: SymbolicEntity[]): Promise<HypothesisContext> {
    const context = await this.config.contextAggregator.aggregate(entities);
    return this.config.contextAggregator.enrich(context);
  }

  /**
   * Get adapter registry for custom adapter registration
   */
  getAdapterRegistry(): AdapterRegistry {
    return this.adapterRegistry;
  }

  /**
   * Get symbolic store
   */
  getSymbolicStore(): SymbolicStore {
    return this.config.symbolicStore;
  }

  /**
   * Get context aggregator
   */
  getContextAggregator(): ContextAggregator {
    return this.config.contextAggregator;
  }

  /**
   * Get contract validator
   */
  getContractValidator(): DataContractValidator {
    return this.config.contractValidator;
  }
}

/**
 * Pipeline builder for easy construction
 */
export class PerceptionPipelineBuilder {
  private config: Partial<PerceptionPipelineConfig> = {
    adapters: [],
    enableCRVValidation: false,
  };
  private crvGate?: CRVGate;

  constructor(name: string) {
    this.config.name = name;
  }

  /**
   * Add adapters to the pipeline
   */
  withAdapters(...adapters: PerceptionAdapter[]): this {
    this.config.adapters = [...(this.config.adapters || []), ...adapters];
    return this;
  }

  /**
   * Set contract validator
   */
  withContractValidator(validator: DataContractValidator): this {
    this.config.contractValidator = validator;
    return this;
  }

  /**
   * Set symbolic store
   */
  withSymbolicStore(store: SymbolicStore): this {
    this.config.symbolicStore = store;
    return this;
  }

  /**
   * Set context aggregator
   */
  withContextAggregator(aggregator: ContextAggregator): this {
    this.config.contextAggregator = aggregator;
    return this;
  }

  /**
   * Enable CRV validation
   */
  withCRVValidation(gate: CRVGate, gateName?: string): this {
    this.config.enableCRVValidation = true;
    this.config.crvGateName = gateName || 'perception-gate';
    this.crvGate = gate;
    return this;
  }

  /**
   * Build the pipeline
   */
  build(): PerceptionPipeline {
    if (!this.config.name) {
      throw new Error('Pipeline name is required');
    }
    if (!this.config.contractValidator) {
      throw new Error('Contract validator is required');
    }
    if (!this.config.symbolicStore) {
      throw new Error('Symbolic store is required');
    }
    if (!this.config.contextAggregator) {
      throw new Error('Context aggregator is required');
    }

    return new PerceptionPipeline(
      this.config as PerceptionPipelineConfig,
      this.crvGate
    );
  }
}
