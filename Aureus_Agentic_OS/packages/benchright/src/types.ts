import { TelemetryEvent, TelemetryEventType, Span } from '@aureus/observability';

/**
 * Execution trace representing a single workflow or task execution
 */
export interface ExecutionTrace {
  id: string;
  workflowId: string;
  taskId?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  events: TelemetryEvent[];
  spans: Span[];
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  metadata?: Record<string, unknown>;
}

/**
 * Output quality metrics
 */
export interface OutputQualityMetrics {
  completeness: number; // 0-1: Are all required outputs present?
  correctness: number; // 0-1: Are outputs correct/valid?
  consistency: number; // 0-1: Are outputs consistent with expectations?
  score: number; // 0-100: Overall quality score
  details: string[];
}

/**
 * Reasoning coherence metrics
 */
export interface ReasoningCoherenceMetrics {
  logicalFlow: number; // 0-1: Is reasoning logically consistent?
  completeness: number; // 0-1: Is reasoning complete?
  stepValidity: number; // 0-1: Are individual steps valid?
  goalAlignment: number; // 0-1: Does reasoning align with goals?
  score: number; // 0-100: Overall coherence score
  details: string[];
}

/**
 * Cost/value metrics
 */
export interface CostValueMetrics {
  totalCost: number; // Total cost (time, tokens, API calls)
  totalValue: number; // Total value delivered
  efficiency: number; // Value per unit cost
  wastedEffort: number; // 0-1: Percentage of wasted effort
  score: number; // 0-100: Overall cost/value score
  breakdown: {
    timeCost: number;
    apiCalls: number;
    retries: number;
    rollbacks: number;
  };
  details: string[];
}

/**
 * Hypothesis switching metrics
 */
export interface HypothesisSwitchingMetrics {
  totalSwitches: number;
  productiveSwitches: number; // Switches that led to progress
  unproductiveSwitches: number; // Switches that didn't help
  switchEfficiency: number; // 0-1: Ratio of productive switches
  averageTimeBeforeSwitch: number; // Average time before switching
  score: number; // 0-100: Overall switching effectiveness score
  details: string[];
}

/**
 * Counterfactual analysis - "what if we did nothing?"
 */
export interface CounterfactualMetrics {
  actualOutcome: string;
  doNothingOutcome: string;
  interventionValue: number; // 0-1: Value added by taking action
  unnecessaryActions: number; // Count of actions that didn't add value
  necessaryActions: number; // Count of actions that added value
  efficiency: number; // 0-1: Ratio of necessary actions
  score: number; // 0-100: Overall counterfactual score
  details: string[];
}

/**
 * Overall benchmark score
 */
export interface BenchmarkScore {
  traceId: string;
  timestamp: Date;
  outputQuality: OutputQualityMetrics;
  reasoningCoherence: ReasoningCoherenceMetrics;
  costValue: CostValueMetrics;
  hypothesisSwitching: HypothesisSwitchingMetrics;
  counterfactual: CounterfactualMetrics;
  overallScore: number; // 0-100: Weighted average of all metrics
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  passed: boolean;
  recommendations: string[];
}

/**
 * Benchmark report
 */
export interface BenchmarkReport {
  metadata: {
    generatedAt: Date;
    version: string;
    timeRange: { start: Date; end: Date };
    totalTraces: number;
  };
  scores: BenchmarkScore[];
  aggregateMetrics: {
    averageOutputQuality: number;
    averageReasoningCoherence: number;
    averageCostValue: number;
    averageHypothesisSwitching: number;
    averageCounterfactual: number;
    overallAverageScore: number;
    passRate: number;
  };
  counterfactualSimulations?: Array<{
    traceId: string;
    actualOutcome: string;
    doNothingOutcome: string;
    interventionValue: number;
    wastedActions: string[];
    necessaryActions: string[];
  }>;
  insights: string[];
  recommendations: string[];
}

/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  weights?: {
    outputQuality?: number;
    reasoningCoherence?: number;
    costValue?: number;
    hypothesisSwitching?: number;
    counterfactual?: number;
  };
  thresholds?: {
    minOutputQuality?: number;
    minReasoningCoherence?: number;
    minCostValue?: number;
    minHypothesisSwitching?: number;
    minCounterfactual?: number;
    minOverallScore?: number;
  };
  enableCounterfactual?: boolean;
  enableHypothesisSwitching?: boolean;
}

/**
 * Default benchmark configuration
 */
export const DEFAULT_BENCHMARK_CONFIG: Required<BenchmarkConfig> = {
  weights: {
    outputQuality: 0.3,
    reasoningCoherence: 0.25,
    costValue: 0.2,
    hypothesisSwitching: 0.15,
    counterfactual: 0.1,
  },
  thresholds: {
    minOutputQuality: 70,
    minReasoningCoherence: 70,
    minCostValue: 60,
    minHypothesisSwitching: 60,
    minCounterfactual: 50,
    minOverallScore: 70,
  },
  enableCounterfactual: true,
  enableHypothesisSwitching: true,
};
