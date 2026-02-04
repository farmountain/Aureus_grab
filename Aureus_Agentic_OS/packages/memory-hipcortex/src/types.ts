/**
 * Provenance tracks the origin of a memory entry
 */
export interface Provenance {
  task_id: string;
  step_id: string;
  source_event_id?: string;
  timestamp: Date;
}

/**
 * MemoryEntry represents a stored memory with provenance
 */
export interface MemoryEntry {
  id: string;
  content: unknown;
  type: 'episodic_note' | 'artifact' | 'snapshot';
  provenance: Provenance;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Snapshot represents a point-in-time state
 */
export interface Snapshot {
  id: string;
  timestamp: Date;
  state: unknown;
  metadata?: Record<string, unknown>;
  verified: boolean; // Whether this snapshot passed CRV validation
}

/**
 * Audit log entry for state changes (invariant 5)
 * Enhanced with content hash and source event references
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  actor: string;
  action: string;
  stateBefore?: unknown;
  stateAfter?: unknown;
  diff?: unknown;
  metadata?: Record<string, unknown>;
  contentHash?: string; // SHA-256 hash of entry content
  sourceEventIds?: string[]; // References to source events
  provenance?: Provenance; // Provenance information
}

/**
 * Temporal index for efficient time-based queries
 * Extended to support task_id, step_id, and tags
 */
export interface TemporalIndex {
  id: string;
  timestamp: Date;
  snapshotId?: string; // Optional for backward compatibility
  entryId?: string; // ID of the memory entry
  task_id?: string;
  step_id?: string;
  tags?: string[];
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  snapshotId: string;
  previousState: unknown;
  restoredState: unknown;
  timestamp: Date;
}

/**
 * Query parameters for memory searches
 */
export interface MemoryQuery {
  task_id?: string;
  step_id?: string;
  tags?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  type?: MemoryEntry['type'];
}

/**
 * Risk profile levels for memory policy generation
 */
export enum RiskProfile {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Indexing strategy for memory lookups
 */
export enum IndexingStrategy {
  TEMPORAL = 'temporal',           // Time-based indexing
  SEMANTIC = 'semantic',           // Semantic/vector-based indexing
  HIERARCHICAL = 'hierarchical',   // Hierarchical/tree-based indexing
  HYBRID = 'hybrid',               // Combination of strategies
}

/**
 * Summarization schedule configuration
 */
export interface SummarizationSchedule {
  enabled: boolean;
  intervalMs: number;              // How often to run summarization
  batchSize: number;               // How many entries to process per batch
  strategy: string;                // Summarization strategy to use
  retentionAfterSummarization?: number; // How long to keep original after summarizing
}

/**
 * Retention tier policy configuration
 */
export interface RetentionTierPolicy {
  tier: string;                    // Tier name (hot, warm, cold, archived)
  maxAgeMs?: number;              // Maximum age before transitioning
  maxEntries?: number;            // Maximum entries before transitioning
  compressionEnabled: boolean;    // Whether to compress entries in this tier
  summarizationEnabled: boolean;  // Whether to summarize entries in this tier
  accessThreshold?: number;       // Access count threshold
}

/**
 * Governance thresholds for validation
 */
export interface GovernanceThresholds {
  minRetentionMs: number;         // Minimum retention period required
  maxRetentionMs: number;         // Maximum retention period allowed
  minSummarizationIntervalMs: number; // Minimum time between summarizations
  requireAuditLog: boolean;       // Whether audit logging is required
  requireEncryption: boolean;     // Whether encryption is required
}

/**
 * Memory policy model
 */
export interface MemoryPolicy {
  id: string;
  name: string;
  description?: string;
  retentionTiers: RetentionTierPolicy[];
  summarizationSchedule: SummarizationSchedule;
  indexingStrategy: IndexingStrategy;
  governanceThresholds: GovernanceThresholds;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Memory policy configuration input
 */
export interface MemoryPolicyConfig {
  goals: string[];                 // User-defined goals (e.g., "optimize for cost", "maximize retention")
  riskProfile: RiskProfile;       // Risk profile level
  dataClassification?: string;    // Data sensitivity classification
  complianceRequirements?: string[]; // Compliance requirements (e.g., GDPR, HIPAA)
  budgetConstraints?: {
    maxStorageMb?: number;
    maxCostPerMonth?: number;
  };
}

/**
 * Memory engine configuration wrapper (stable schema for distribution)
 */
export type MemoryEngineConfigSource = 'agent-studio' | 'api' | 'manual' | 'runtime';

export interface MemoryEngineConfig {
  schemaVersion: '1.0';
  policy: MemoryPolicy;
  policyConfig: MemoryPolicyConfig;
  generatedAt: string; // ISO timestamp
  generatedBy: MemoryEngineConfigSource;
  source?: {
    blueprintId?: string;
    blueprintName?: string;
    riskProfile?: RiskProfile | string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Memory policy validation result
 */
export interface MemoryPolicyValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  policy?: MemoryPolicy;
}

/**
 * Persistence layer interface for snapshots
 */
export interface SnapshotPersistence {
  save(snapshot: Snapshot): Promise<void>;
  load(snapshotId: string): Promise<Snapshot | null>;
  loadAll(): Promise<Snapshot[]>;
  loadVerified(): Promise<Snapshot[]>;
}

/**
 * Persistence layer interface for audit logs
 */
export interface AuditLogPersistence {
  save(entry: AuditLogEntry): Promise<void>;
  loadAll(): Promise<AuditLogEntry[]>;
  verifyIntegrity(entries: AuditLogEntry[]): Promise<{ valid: boolean; invalidEntries: string[] }>;
}

/**
 * Persistence layer interface for temporal indices
 */
export interface TemporalIndexPersistence {
  save(index: TemporalIndex): Promise<void>;
  loadAll(): Promise<TemporalIndex[]>;
  query(filters: {
    task_id?: string;
    step_id?: string;
    tags?: string[];
    timeRange?: { start: Date; end: Date };
  }): Promise<TemporalIndex[]>;
}
