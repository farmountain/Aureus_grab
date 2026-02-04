/**
 * @aureus/benchright - Benchmark evaluation for Aureus Agentic OS
 * 
 * Ingests execution traces and evaluates:
 * - Output quality
 * - Reasoning coherence
 * - Cost/value ratio
 * - Hypothesis switching effectiveness
 * - "Do nothing" counterfactuals
 * 
 * Generates scored reports and integrates with observability + audit logs.
 */

// Core types
export {
  ExecutionTrace,
  OutputQualityMetrics,
  ReasoningCoherenceMetrics,
  CostValueMetrics,
  HypothesisSwitchingMetrics,
  CounterfactualMetrics,
  BenchmarkScore,
  BenchmarkReport,
  BenchmarkConfig,
  DEFAULT_BENCHMARK_CONFIG,
} from './types';

// Trace collection
export { TraceCollector } from './trace-collector';

// Evaluators
export {
  OutputQualityEvaluator,
  ReasoningCoherenceEvaluator,
  CostValueEvaluator,
  HypothesisSwitchingEvaluator,
  CounterfactualEvaluator,
} from './evaluators';

// Counterfactual simulator
export {
  CounterfactualSimulator,
  CounterfactualSimulation,
  SimulationOutcome,
} from './counterfactual-simulator';

// Main benchmark evaluator
export { BenchmarkEvaluator } from './benchmark-evaluator';
