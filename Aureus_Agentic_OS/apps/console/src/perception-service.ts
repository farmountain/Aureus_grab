/**
 * Perception service for managing perception pipeline and data visualization
 */

import {
  PerceptionPipeline,
  PerceptionPipelineBuilder,
  TextAdapter,
  JsonAdapter,
  EventAdapter,
  SensorAdapter,
  DefaultDataContractValidator,
  InMemorySymbolicStore,
  DefaultContextAggregator,
  RawInput,
  PerceptionPipelineResult,
  SymbolicEntity,
  DataContract,
  EntityConflict,
} from '@aureus/perception';

/**
 * Perception service configuration
 */
export interface PerceptionServiceConfig {
  enableCRVValidation?: boolean;
}

/**
 * Perception service for managing perception pipeline
 */
export class PerceptionService {
  private pipeline: PerceptionPipeline;
  private symbolicStore: InMemorySymbolicStore;
  private contractHistory: DataContract[] = [];
  private resultHistory: PerceptionPipelineResult[] = [];

  constructor(config: PerceptionServiceConfig = {}) {
    // Create symbolic store
    this.symbolicStore = new InMemorySymbolicStore();

    // Build perception pipeline
    this.pipeline = new PerceptionPipelineBuilder('console-perception')
      .withAdapters(
        new TextAdapter(),
        new JsonAdapter(),
        new EventAdapter(),
        new SensorAdapter()
      )
      .withContractValidator(new DefaultDataContractValidator())
      .withSymbolicStore(this.symbolicStore)
      .withContextAggregator(new DefaultContextAggregator())
      .build();
  }

  /**
   * Process raw input through the perception pipeline
   */
  async processInput(input: RawInput): Promise<PerceptionPipelineResult> {
    const result = await this.pipeline.process(input);

    // Store in history
    this.resultHistory.push(result);
    if (result.contract) {
      this.contractHistory.push(result.contract);
    }

    // Keep only last 100 results
    if (this.resultHistory.length > 100) {
      this.resultHistory = this.resultHistory.slice(-100);
    }
    if (this.contractHistory.length > 100) {
      this.contractHistory = this.contractHistory.slice(-100);
    }

    return result;
  }

  /**
   * Get all entities from symbolic store
   */
  async getAllEntities(): Promise<SymbolicEntity[]> {
    return this.symbolicStore.all();
  }

  /**
   * Get entities by type
   */
  async getEntitiesByType(type: string): Promise<SymbolicEntity[]> {
    return this.symbolicStore.queryByType(type);
  }

  /**
   * Get entity by ID
   */
  async getEntity(id: string): Promise<SymbolicEntity | null> {
    return this.symbolicStore.get(id);
  }

  /**
   * Get contract history
   */
  getContractHistory(): DataContract[] {
    return [...this.contractHistory];
  }

  /**
   * Get recent contracts with conflicts
   */
  getContractsWithConflicts(): DataContract[] {
    return this.contractHistory.filter(c => c.conflicts && c.conflicts.length > 0);
  }

  /**
   * Get all detected conflicts
   */
  getAllConflicts(): Array<{ contractId: string; conflicts: EntityConflict[] }> {
    return this.contractHistory
      .filter(c => c.conflicts && c.conflicts.length > 0)
      .map(c => ({
        contractId: c.id,
        conflicts: c.conflicts!,
      }));
  }

  /**
   * Get result history
   */
  getResultHistory(): PerceptionPipelineResult[] {
    return [...this.resultHistory];
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const totalResults = this.resultHistory.length;
    const successfulResults = this.resultHistory.filter(r => r.success).length;
    const failedResults = totalResults - successfulResults;
    const totalConflicts = this.contractHistory.reduce(
      (sum, c) => sum + (c.conflicts?.length || 0),
      0
    );

    return {
      totalResults,
      successfulResults,
      failedResults,
      totalContracts: this.contractHistory.length,
      totalConflicts,
      entityCount: this.symbolicStore.all().then(e => e.length),
    };
  }

  /**
   * Clear all data
   */
  async clear(): Promise<void> {
    await this.symbolicStore.clear();
    this.contractHistory = [];
    this.resultHistory = [];
  }
}
