import { FailureTaxonomy } from '@aureus/crv';
import { RiskTier } from '@aureus/policy';

/**
 * Structured postmortem generated after a failure
 */
export interface Postmortem {
  id: string;
  timestamp: Date;
  workflowId: string;
  taskId: string;
  
  // Failure classification
  failureTaxonomy: FailureTaxonomy;
  
  // Root cause analysis
  rootCause: string;
  stackTrace?: string;
  contextData?: Record<string, unknown>;
  
  // Proposed fix
  proposedFix: ProposedFix;
  
  // Metadata for tracking
  generatedBy: 'reflexion-engine';
  confidence: number; // 0-1 confidence in the analysis
}

/**
 * Proposed fix to address the failure
 */
export interface ProposedFix {
  id: string;
  description: string;
  fixType: FixType;
  
  // Fix details based on type
  alternateToolSelection?: {
    originalTool: string;
    alternativeTool: string;
    reason: string;
  };
  
  modifiedCRVThresholds?: {
    operatorName: string;
    originalThreshold: number;
    newThreshold: number;
    withinPolicyBounds: boolean;
  }[];
  
  workflowStepReordering?: {
    originalOrder: string[];
    newOrder: string[];
    safetyCheck: boolean;
  };
  
  // Risk assessment
  riskTier: RiskTier;
  estimatedImpact: 'low' | 'medium' | 'high';
}

/**
 * Types of fixes that can be proposed
 */
export enum FixType {
  ALTERNATE_TOOL = 'alternate_tool',
  MODIFY_CRV_THRESHOLD = 'modify_crv_threshold',
  REORDER_WORKFLOW = 'reorder_workflow',
  HYBRID = 'hybrid' // Combination of multiple fix types
}

/**
 * Result of executing a fix in the sandbox
 */
export interface SandboxResult {
  fixId: string;
  success: boolean;
  
  // Validation results
  goalGuardApproved: boolean;
  crvPassed: boolean;
  chaosTestsPassed: boolean;
  
  // Execution details
  executionTime: number; // milliseconds
  errors?: string[];
  warnings?: string[];
  
  // Observability data
  metrics?: Record<string, number>;
  logs?: string[];
  
  // Decision
  shouldPromoteFix: boolean;
  promotionReason?: string;
}

/**
 * Configuration for the Reflexion engine
 */
export interface ReflexionConfig {
  // Enable/disable reflexion
  enabled: boolean;
  
  // Minimum confidence threshold for applying fixes
  minConfidence: number;
  
  // Maximum number of fix attempts per failure
  maxFixAttempts: number;
  
  // CRV threshold adjustment bounds (for safety)
  crvThresholdBounds: {
    minMultiplier: number; // e.g., 0.8 (can reduce threshold by 20%)
    maxMultiplier: number; // e.g., 1.2 (can increase threshold by 20%)
  };
  
  // Chaos test scenarios to run
  chaosTestScenarios: string[];
  
  // Enable sandbox execution
  sandboxEnabled: boolean;
}

/**
 * Chaos test scenario for validating fixes
 */
export interface ChaosTestScenario {
  name: string;
  description: string;
  
  // Test execution
  execute: (context: ChaosTestContext) => Promise<ChaosTestResult>;
}

/**
 * Context provided to chaos tests
 */
export interface ChaosTestContext {
  workflowId: string;
  taskId: string;
  proposedFix: ProposedFix;
  originalFailure: {
    taxonomy: FailureTaxonomy;
    rootCause: string;
  };
}

/**
 * Result of a chaos test
 */
export interface ChaosTestResult {
  scenarioName: string;
  passed: boolean;
  executionTime: number;
  details?: string;
  errors?: string[];
}

/**
 * Policy bounds for CRV threshold modifications
 * 
 * Defines the acceptable range for CRV operator thresholds.
 * Used to ensure that reflexion-proposed threshold modifications
 * stay within safe operational limits.
 * 
 * Example usage:
 * ```typescript
 * const bounds: CRVPolicyBounds = {
 *   operatorName: 'confidence-validator',
 *   minThreshold: 0.5,
 *   maxThreshold: 1.0,
 *   defaultThreshold: 0.8,
 * };
 * ```
 */
export interface CRVPolicyBounds {
  operatorName: string;
  minThreshold: number;
  maxThreshold: number;
  defaultThreshold: number;
}
