/**
 * Hypothesis module types
 * 
 * This module enables spawning, tracking, and evaluating multiple hypothesis branches
 * for goal-driven agent reasoning with CRV validation integration.
 */

/**
 * Status of a hypothesis branch
 */
export enum HypothesisStatus {
  PENDING = 'PENDING',           // Created but not yet evaluated
  IN_PROGRESS = 'IN_PROGRESS',   // Currently being evaluated
  VALIDATED = 'VALIDATED',       // Passed CRV validation
  REJECTED = 'REJECTED',         // Failed CRV validation or scoring
  MERGED = 'MERGED',             // Successfully merged into main branch
  DISCARDED = 'DISCARDED',       // Explicitly discarded
}

/**
 * Scoring criteria for evaluating hypotheses
 */
export interface ScoringCriteria {
  /** Weight for confidence score (0-1) */
  confidenceWeight: number;
  /** Weight for cost/efficiency (0-1) */
  costWeight: number;
  /** Weight for risk assessment (0-1) */
  riskWeight: number;
  /** Weight for alignment with goal (0-1) */
  goalAlignmentWeight: number;
  /** Custom scoring function */
  customScorer?: (hypothesis: Hypothesis) => number;
}

/**
 * Evaluation metrics for a hypothesis
 */
export interface HypothesisMetrics {
  /** Confidence score (0-1) */
  confidence: number;
  /** Estimated cost/effort (0-1, lower is better) */
  cost: number;
  /** Risk assessment (0-1, lower is better) */
  risk: number;
  /** Goal alignment score (0-1, higher is better) */
  goalAlignment: number;
  /** Composite score based on criteria */
  compositeScore: number;
  /** CRV validation results */
  crvResults?: {
    passed: boolean;
    validationCount: number;
    failedValidations: string[];
  };
}

/**
 * A hypothesis branch representing a possible approach to achieving a goal
 */
export interface Hypothesis {
  /** Unique identifier */
  id: string;
  /** Parent hypothesis ID if this is a sub-hypothesis */
  parentId?: string;
  /** Goal this hypothesis aims to achieve */
  goalId: string;
  /** Human-readable description */
  description: string;
  /** Current status */
  status: HypothesisStatus;
  /** Proposed actions/steps */
  proposedActions: HypothesisAction[];
  /** Evaluation metrics */
  metrics: HypothesisMetrics;
  /** State snapshot at creation time */
  initialState?: unknown;
  /** State snapshot after execution */
  resultState?: unknown;
  /** Creation timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
  /** Associated workflow ID if executed */
  workflowId?: string;
  /** Linked intent ID */
  intentId?: string;
  /** Linked intent version */
  intentVersion?: number;
  /** Metadata for extensibility */
  metadata?: Record<string, unknown>;
}

/**
 * An action proposed by a hypothesis
 */
export interface HypothesisAction {
  /** Action identifier */
  id: string;
  /** Action type */
  type: string;
  /** Action parameters */
  parameters: Record<string, unknown>;
  /** Expected outcome */
  expectedOutcome?: unknown;
  /** CRV validation gate to apply */
  crvGateName?: string;
}

/**
 * Goal definition for hypothesis generation
 */
export interface Goal {
  /** Unique identifier */
  id: string;
  /** Goal description */
  description: string;
  /** Success criteria */
  successCriteria: SuccessCriterion[];
  /** Constraints on solutions */
  constraints?: Constraint[];
  /** Context information */
  context?: Record<string, unknown>;
}

/**
 * Success criterion for evaluating goal achievement
 */
export interface SuccessCriterion {
  /** Criterion identifier */
  id: string;
  /** Description of what must be satisfied */
  description: string;
  /** Validation function */
  validator: (state: unknown) => boolean | Promise<boolean>;
  /** Weight/importance (0-1) */
  weight: number;
}

/**
 * Constraint on hypothesis solutions
 */
export interface Constraint {
  /** Constraint identifier */
  id: string;
  /** Description of the constraint */
  description: string;
  /** Validation function */
  validator: (hypothesis: Hypothesis) => boolean | Promise<boolean>;
}

/**
 * Configuration for hypothesis manager
 */
export interface HypothesisManagerConfig {
  /** Maximum number of concurrent hypotheses */
  maxConcurrentHypotheses: number;
  /** Scoring criteria for evaluation */
  scoringCriteria: ScoringCriteria;
  /** Minimum composite score to keep a hypothesis */
  minAcceptableScore: number;
  /** Enable automatic pruning of low-scoring hypotheses */
  autoPrune: boolean;
  /** Enable telemetry emission */
  enableTelemetry: boolean;
}

/**
 * Events emitted by hypothesis manager
 */
export enum HypothesisEventType {
  HYPOTHESIS_CREATED = 'HYPOTHESIS_CREATED',
  HYPOTHESIS_EVALUATED = 'HYPOTHESIS_EVALUATED',
  HYPOTHESIS_VALIDATED = 'HYPOTHESIS_VALIDATED',
  HYPOTHESIS_REJECTED = 'HYPOTHESIS_REJECTED',
  HYPOTHESIS_MERGED = 'HYPOTHESIS_MERGED',
  HYPOTHESIS_DISCARDED = 'HYPOTHESIS_DISCARDED',
  HYPOTHESIS_SCORED = 'HYPOTHESIS_SCORED',
}

/**
 * Hypothesis event for audit trail
 */
export interface HypothesisEvent {
  /** Event type */
  type: HypothesisEventType;
  /** Hypothesis ID */
  hypothesisId: string;
  /** Goal ID */
  goalId: string;
  /** Timestamp */
  timestamp: Date;
  /** Event-specific data */
  data: Record<string, unknown>;
}

/**
 * Result of merging a hypothesis
 */
export interface MergeResult {
  /** Whether merge was successful */
  success: boolean;
  /** Merged hypothesis ID */
  hypothesisId: string;
  /** Reason for failure if not successful */
  reason?: string;
  /** Final state after merge */
  finalState?: unknown;
}

/**
 * Options for creating a hypothesis
 */
export interface CreateHypothesisOptions {
  /** Parent hypothesis ID for sub-hypotheses */
  parentId?: string;
  /** Initial metrics (optional, will be computed if not provided) */
  initialMetrics?: Partial<HypothesisMetrics>;
  /** Linked intent ID */
  intentId?: string;
  /** Linked intent version */
  intentVersion?: number;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for evaluating a hypothesis
 */
export interface EvaluateHypothesisOptions {
  /** Execute actions (vs. just scoring) */
  executeActions: boolean;
  /** Enable CRV validation */
  validateWithCRV: boolean;
  /** Custom CRV gate to use */
  crvGateName?: string;
}
