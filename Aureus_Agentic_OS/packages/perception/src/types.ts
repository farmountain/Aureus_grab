/**
 * Types for the perception pipeline
 */

/**
 * Raw input from any source before normalization
 */
export interface RawInput {
  id: string;
  source: string;
  timestamp: Date;
  data: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Normalized input after perception adapter processing
 */
export interface NormalizedInput {
  id: string;
  source: string;
  timestamp: Date;
  format: 'text' | 'json' | 'event' | 'sensor' | 'image' | 'audio' | 'video' | 'custom';
  data: unknown;
  schema?: string; // Schema identifier for validation
  metadata?: Record<string, unknown>;
}

/**
 * Image data contract for normalized image inputs
 */
export interface ImageData {
  content: string; // Base64 encoded image or URL
  format: string; // e.g., 'jpeg', 'png', 'gif', 'webp'
  dimensions?: {
    width: number;
    height: number;
  };
  size?: number; // Size in bytes
  metadata?: {
    colorSpace?: string;
    orientation?: number;
    [key: string]: unknown;
  };
}

/**
 * Audio data contract for normalized audio inputs
 */
export interface AudioData {
  content: string; // Base64 encoded audio or URL
  format: string; // e.g., 'mp3', 'wav', 'ogg', 'flac'
  duration?: number; // Duration in seconds
  sampleRate?: number; // Sample rate in Hz
  channels?: number; // Number of audio channels (1 = mono, 2 = stereo)
  bitrate?: number; // Bitrate in kbps
  metadata?: {
    title?: string;
    artist?: string;
    [key: string]: unknown;
  };
}

/**
 * Video data contract for normalized video inputs
 */
export interface VideoData {
  content: string; // Base64 encoded video or URL
  format: string; // e.g., 'mp4', 'webm', 'avi', 'mov'
  duration?: number; // Duration in seconds
  resolution?: {
    width: number;
    height: number;
  };
  fps?: number; // Frames per second
  bitrate?: number; // Bitrate in kbps
  codec?: string; // Video codec (e.g., 'h264', 'vp9')
  metadata?: {
    hasAudio?: boolean;
    audioCodec?: string;
    [key: string]: unknown;
  };
}

/**
 * Intent extracted from input
 */
export interface Intent {
  type: string; // e.g., 'query', 'command', 'observation', 'event'
  confidence: number; // 0-1
  parameters: Record<string, unknown>;
  description?: string;
}

/**
 * Conflict type for entity conflicts
 */
export interface EntityConflict {
  type: 'duplicate' | 'inconsistent' | 'temporal' | 'relationship';
  description: string;
  existingEntityId: string;
  newEntityId: string;
  conflictingFields: string[];
  severity: 'low' | 'medium' | 'high';
  resolution?: ConflictResolution;
}

/**
 * Conflict resolution suggestion
 */
export interface ConflictResolution {
  strategy: 'merge' | 'replace' | 'keep-both' | 'keep-existing' | 'keep-new';
  description: string;
  mergedEntity?: Partial<SymbolicEntity>;
  confidence: number;
}

/**
 * Validated data contract
 */
export interface DataContract {
  id: string;
  inputId: string;
  schema: string;
  schemaVersion: string;
  intent: Intent;
  validatedData: unknown;
  timestamp: Date;
  validationResults: Array<{
    validator: string;
    passed: boolean;
    message?: string;
  }>;
  conflicts?: EntityConflict[];
}

/**
 * Entity relationship type
 */
export interface EntityRelationship {
  type: string;
  targetId: string;
  properties?: Record<string, unknown>;
}

/**
 * Symbolic entity extracted from validated input
 */
export interface SymbolicEntity {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  relationships?: EntityRelationship[];
  source: string; // Reference to input that created this entity
  confidence: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated context for hypothesis reasoning
 */
export interface HypothesisContext {
  id: string;
  goalId?: string;
  entities: SymbolicEntity[];
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    properties?: Record<string, unknown>;
  }>;
  constraints: Array<{
    type: string;
    description: string;
    predicate: (context: HypothesisContext) => boolean;
  }>;
  relevanceScore: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Perception adapter interface for normalizing raw inputs
 */
export interface PerceptionAdapter {
  readonly name: string;
  readonly supportedSources: string[];
  
  /**
   * Normalize raw input into a standard format
   */
  normalize(input: RawInput): Promise<NormalizedInput>;
  
  /**
   * Validate if this adapter can handle the input
   */
  canHandle(input: RawInput): boolean;
}

/**
 * Data contract validator interface
 */
export interface DataContractValidator {
  readonly name: string;
  
  /**
   * Validate normalized input against schema and extract intent
   */
  validate(input: NormalizedInput): Promise<DataContract>;
  
  /**
   * Extract intent from the input data
   */
  extractIntent(input: NormalizedInput): Promise<Intent>;
}

/**
 * Symbolic store interface for managing extracted entities
 */
export interface SymbolicStore {
  /**
   * Store an entity
   */
  store(entity: SymbolicEntity): Promise<void>;
  
  /**
   * Retrieve entity by ID
   */
  get(id: string): Promise<SymbolicEntity | null>;
  
  /**
   * Query entities by type
   */
  queryByType(type: string): Promise<SymbolicEntity[]>;
  
  /**
   * Query entities by source
   */
  queryBySource(source: string): Promise<SymbolicEntity[]>;
  
  /**
   * Find entities related to a given entity
   */
  findRelated(entityId: string, relationType?: string): Promise<SymbolicEntity[]>;
  
  /**
   * Get all entities
   */
  all(): Promise<SymbolicEntity[]>;
  
  /**
   * Clear the store
   */
  clear(): Promise<void>;
  
  /**
   * Detect conflicts with an entity before storing
   */
  detectConflicts?(entity: SymbolicEntity): Promise<EntityConflict[]>;
}

/**
 * Context aggregator for building hypothesis contexts
 */
export interface ContextAggregator {
  /**
   * Aggregate entities into a hypothesis context
   */
  aggregate(entities: SymbolicEntity[], goalId?: string): Promise<HypothesisContext>;
  
  /**
   * Enrich context with additional information
   */
  enrich(context: HypothesisContext): Promise<HypothesisContext>;
}

/**
 * Perception pipeline configuration
 */
export interface PerceptionPipelineConfig {
  name: string;
  adapters: PerceptionAdapter[];
  contractValidator: DataContractValidator;
  symbolicStore: SymbolicStore;
  contextAggregator: ContextAggregator;
  enableCRVValidation: boolean;
  crvGateName?: string;
}

/**
 * Perception pipeline result
 */
export interface PerceptionPipelineResult {
  success: boolean;
  inputId: string;
  normalizedInput?: NormalizedInput;
  contract?: DataContract;
  entities?: SymbolicEntity[];
  context?: HypothesisContext;
  errors?: Array<{
    stage: 'normalization' | 'validation' | 'extraction' | 'aggregation';
    message: string;
    details?: unknown;
  }>;
  timestamp: Date;
}
