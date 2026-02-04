import {
  ExecutionTrace,
  BenchmarkScore,
  BenchmarkReport,
  BenchmarkConfig,
  DEFAULT_BENCHMARK_CONFIG,
  OutputQualityMetrics,
  ReasoningCoherenceMetrics,
  CostValueMetrics,
  HypothesisSwitchingMetrics,
  CounterfactualMetrics,
} from './types';
import {
  OutputQualityEvaluator,
  ReasoningCoherenceEvaluator,
  CostValueEvaluator,
  HypothesisSwitchingEvaluator,
  CounterfactualEvaluator,
} from './evaluators';
import { CounterfactualSimulator, CounterfactualSimulation } from './counterfactual-simulator';

/**
 * BenchmarkEvaluator evaluates execution traces and generates scored reports
 */
export class BenchmarkEvaluator {
  private config: Required<BenchmarkConfig>;
  private outputQualityEvaluator: OutputQualityEvaluator;
  private reasoningCoherenceEvaluator: ReasoningCoherenceEvaluator;
  private costValueEvaluator: CostValueEvaluator;
  private hypothesisSwitchingEvaluator: HypothesisSwitchingEvaluator;
  private counterfactualEvaluator: CounterfactualEvaluator;
  private counterfactualSimulator: CounterfactualSimulator;

  constructor(config?: BenchmarkConfig) {
    this.config = this.mergeConfig(config);
    this.outputQualityEvaluator = new OutputQualityEvaluator();
    this.reasoningCoherenceEvaluator = new ReasoningCoherenceEvaluator();
    this.costValueEvaluator = new CostValueEvaluator();
    this.hypothesisSwitchingEvaluator = new HypothesisSwitchingEvaluator();
    this.counterfactualEvaluator = new CounterfactualEvaluator();
    this.counterfactualSimulator = new CounterfactualSimulator();
  }

  /**
   * Evaluate a single trace and generate a score
   */
  evaluateTrace(trace: ExecutionTrace): BenchmarkScore {
    const timestamp = new Date();

    // Evaluate each dimension
    const outputQuality = this.outputQualityEvaluator.evaluate(trace);
    const reasoningCoherence = this.reasoningCoherenceEvaluator.evaluate(trace);
    const costValue = this.costValueEvaluator.evaluate(trace);
    const hypothesisSwitching = this.config.enableHypothesisSwitching
      ? this.hypothesisSwitchingEvaluator.evaluate(trace)
      : this.getDefaultHypothesisSwitching();
    const counterfactual = this.config.enableCounterfactual
      ? this.counterfactualEvaluator.evaluate(trace)
      : this.getDefaultCounterfactual();

    // Calculate weighted overall score
    const overallScore =
      outputQuality.score * (this.config.weights?.outputQuality ?? 0.3) +
      reasoningCoherence.score * (this.config.weights?.reasoningCoherence ?? 0.25) +
      costValue.score * (this.config.weights?.costValue ?? 0.2) +
      hypothesisSwitching.score * (this.config.weights?.hypothesisSwitching ?? 0.15) +
      counterfactual.score * (this.config.weights?.counterfactual ?? 0.1);

    // Determine grade
    const grade = this.calculateGrade(overallScore);

    // Check if passed
    const passed = this.checkPassed(
      outputQuality.score,
      reasoningCoherence.score,
      costValue.score,
      hypothesisSwitching.score,
      counterfactual.score,
      overallScore
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      outputQuality,
      reasoningCoherence,
      costValue,
      hypothesisSwitching,
      counterfactual
    );

    return {
      traceId: trace.id,
      timestamp,
      outputQuality,
      reasoningCoherence,
      costValue,
      hypothesisSwitching,
      counterfactual,
      overallScore,
      grade,
      passed,
      recommendations,
    };
  }

  /**
   * Evaluate multiple traces and generate a comprehensive report
   */
  evaluateTraces(traces: ExecutionTrace[]): BenchmarkReport {
    const generatedAt = new Date();
    const scores = traces.map((trace) => this.evaluateTrace(trace));

    // Run counterfactual simulations if enabled
    const counterfactualSimulations = this.config.enableCounterfactual
      ? traces.map((trace) => {
          const simulation = this.counterfactualSimulator.simulate(trace);
          return {
            traceId: simulation.traceId,
            actualOutcome: `${simulation.actualOutcome.status} (${simulation.actualOutcome.completedTasks} tasks)`,
            doNothingOutcome: `${simulation.doNothingOutcome.status} (${simulation.doNothingOutcome.completedTasks} tasks)`,
            interventionValue: simulation.interventionValue,
            wastedActions: simulation.wastedActions,
            necessaryActions: simulation.necessaryActions,
          };
        })
      : undefined;

    // Calculate aggregate metrics
    const aggregateMetrics = this.calculateAggregateMetrics(scores);

    // Generate insights
    const insights = this.generateInsights(scores, aggregateMetrics, counterfactualSimulations);

    // Generate recommendations
    const recommendations = this.generateReportRecommendations(scores, aggregateMetrics, counterfactualSimulations);

    // Determine time range
    const startTime =
      traces.length > 0
        ? traces.reduce((min, t) => (t.startTime < min ? t.startTime : min), traces[0].startTime)
        : new Date();
    const endTime =
      traces.length > 0
        ? traces.reduce((max, t) => {
            const end = t.endTime || t.startTime;
            return end > max ? end : max;
          }, traces[0].endTime || traces[0].startTime)
        : new Date();

    return {
      metadata: {
        generatedAt,
        version: '0.1.0',
        timeRange: { start: startTime, end: endTime },
        totalTraces: traces.length,
      },
      scores,
      aggregateMetrics,
      counterfactualSimulations,
      insights,
      recommendations,
    };
  }

  /**
   * Export report as JSON
   */
  exportReportJSON(report: BenchmarkReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Export report as Markdown
   */
  exportReportMarkdown(report: BenchmarkReport): string {
    const lines: string[] = [];

    lines.push('# Benchright Evaluation Report');
    lines.push('');
    lines.push(`**Generated**: ${report.metadata.generatedAt.toISOString()}`);
    lines.push(`**Version**: ${report.metadata.version}`);
    lines.push(`**Time Range**: ${report.metadata.timeRange.start.toISOString()} - ${report.metadata.timeRange.end.toISOString()}`);
    lines.push(`**Total Traces**: ${report.metadata.totalTraces}`);
    lines.push('');

    // Overall metrics
    lines.push('## Overall Performance');
    lines.push('');
    lines.push(`- **Average Output Quality**: ${report.aggregateMetrics.averageOutputQuality.toFixed(1)}/100`);
    lines.push(`- **Average Reasoning Coherence**: ${report.aggregateMetrics.averageReasoningCoherence.toFixed(1)}/100`);
    lines.push(`- **Average Cost/Value**: ${report.aggregateMetrics.averageCostValue.toFixed(1)}/100`);
    lines.push(`- **Average Hypothesis Switching**: ${report.aggregateMetrics.averageHypothesisSwitching.toFixed(1)}/100`);
    lines.push(`- **Average Counterfactual**: ${report.aggregateMetrics.averageCounterfactual.toFixed(1)}/100`);
    lines.push(`- **Overall Average Score**: ${report.aggregateMetrics.overallAverageScore.toFixed(1)}/100`);
    lines.push(`- **Pass Rate**: ${(report.aggregateMetrics.passRate * 100).toFixed(1)}%`);
    lines.push('');

    // Individual trace scores
    lines.push('## Trace Scores');
    lines.push('');
    lines.push('| Trace ID | Overall | Grade | Output Quality | Reasoning | Cost/Value | Hypothesis | Counterfactual | Status |');
    lines.push('|----------|---------|-------|----------------|-----------|------------|------------|----------------|--------|');

    for (const score of report.scores) {
      const status = score.passed ? '✅ Pass' : '❌ Fail';
      lines.push(
        `| ${score.traceId.substring(0, 8)}... | ${score.overallScore.toFixed(1)} | ${score.grade} | ${score.outputQuality.score.toFixed(1)} | ${score.reasoningCoherence.score.toFixed(1)} | ${score.costValue.score.toFixed(1)} | ${score.hypothesisSwitching.score.toFixed(1)} | ${score.counterfactual.score.toFixed(1)} | ${status} |`
      );
    }
    lines.push('');

    // Counterfactual Analysis
    if (report.counterfactualSimulations && report.counterfactualSimulations.length > 0) {
      lines.push('## Counterfactual Analysis');
      lines.push('');
      lines.push('| Trace ID | Actual | Do Nothing | Value | Wasted | Necessary |');
      lines.push('|----------|--------|------------|-------|--------|-----------|');
      
      for (const sim of report.counterfactualSimulations) {
        const valuePercent = (sim.interventionValue * 100).toFixed(0);
        lines.push(
          `| ${sim.traceId.substring(0, 8)}... | ${sim.actualOutcome} | ${sim.doNothingOutcome} | ${valuePercent}% | ${sim.wastedActions.length} | ${sim.necessaryActions.length} |`
        );
      }
      lines.push('');
    }

    // Insights
    if (report.insights.length > 0) {
      lines.push('## Insights');
      lines.push('');
      for (const insight of report.insights) {
        lines.push(`- ${insight}`);
      }
      lines.push('');
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const recommendation of report.recommendations) {
        lines.push(`- ${recommendation}`);
      }
      lines.push('');
    }

    // Detailed scores
    lines.push('## Detailed Trace Analysis');
    lines.push('');

    for (const score of report.scores) {
      lines.push(`### Trace ${score.traceId}`);
      lines.push('');
      lines.push(`**Overall Score**: ${score.overallScore.toFixed(1)}/100 (Grade: ${score.grade})`);
      lines.push(`**Status**: ${score.passed ? '✅ Passed' : '❌ Failed'}`);
      lines.push('');

      // Output Quality
      lines.push('#### Output Quality');
      lines.push(`- **Score**: ${score.outputQuality.score.toFixed(1)}/100`);
      lines.push(`- **Completeness**: ${(score.outputQuality.completeness * 100).toFixed(1)}%`);
      lines.push(`- **Correctness**: ${(score.outputQuality.correctness * 100).toFixed(1)}%`);
      lines.push(`- **Consistency**: ${(score.outputQuality.consistency * 100).toFixed(1)}%`);
      if (score.outputQuality.details.length > 0) {
        lines.push('- **Issues**:');
        for (const detail of score.outputQuality.details) {
          lines.push(`  - ${detail}`);
        }
      }
      lines.push('');

      // Reasoning Coherence
      lines.push('#### Reasoning Coherence');
      lines.push(`- **Score**: ${score.reasoningCoherence.score.toFixed(1)}/100`);
      lines.push(`- **Logical Flow**: ${(score.reasoningCoherence.logicalFlow * 100).toFixed(1)}%`);
      lines.push(`- **Completeness**: ${(score.reasoningCoherence.completeness * 100).toFixed(1)}%`);
      lines.push(`- **Step Validity**: ${(score.reasoningCoherence.stepValidity * 100).toFixed(1)}%`);
      lines.push(`- **Goal Alignment**: ${(score.reasoningCoherence.goalAlignment * 100).toFixed(1)}%`);
      if (score.reasoningCoherence.details.length > 0) {
        lines.push('- **Issues**:');
        for (const detail of score.reasoningCoherence.details) {
          lines.push(`  - ${detail}`);
        }
      }
      lines.push('');

      // Cost/Value
      lines.push('#### Cost/Value');
      lines.push(`- **Score**: ${score.costValue.score.toFixed(1)}/100`);
      lines.push(`- **Total Cost**: ${score.costValue.totalCost.toFixed(0)}`);
      lines.push(`- **Total Value**: ${score.costValue.totalValue.toFixed(0)}`);
      lines.push(`- **Efficiency**: ${score.costValue.efficiency.toFixed(2)}`);
      lines.push(`- **Wasted Effort**: ${(score.costValue.wastedEffort * 100).toFixed(1)}%`);
      lines.push('- **Breakdown**:');
      lines.push(`  - Time Cost: ${score.costValue.breakdown.timeCost.toFixed(0)}ms`);
      lines.push(`  - API Calls: ${score.costValue.breakdown.apiCalls}`);
      lines.push(`  - Retries: ${score.costValue.breakdown.retries}`);
      lines.push(`  - Rollbacks: ${score.costValue.breakdown.rollbacks}`);
      if (score.costValue.details.length > 0) {
        lines.push('- **Issues**:');
        for (const detail of score.costValue.details) {
          lines.push(`  - ${detail}`);
        }
      }
      lines.push('');

      // Recommendations
      if (score.recommendations.length > 0) {
        lines.push('#### Recommendations');
        for (const rec of score.recommendations) {
          lines.push(`- ${rec}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config?: BenchmarkConfig): Required<BenchmarkConfig> {
    return {
      weights: { ...DEFAULT_BENCHMARK_CONFIG.weights, ...config?.weights },
      thresholds: { ...DEFAULT_BENCHMARK_CONFIG.thresholds, ...config?.thresholds },
      enableCounterfactual: config?.enableCounterfactual ?? DEFAULT_BENCHMARK_CONFIG.enableCounterfactual,
      enableHypothesisSwitching: config?.enableHypothesisSwitching ?? DEFAULT_BENCHMARK_CONFIG.enableHypothesisSwitching,
    };
  }

  /**
   * Calculate grade from score
   */
  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Check if all thresholds are passed
   */
  private checkPassed(
    outputQuality: number,
    reasoningCoherence: number,
    costValue: number,
    hypothesisSwitching: number,
    counterfactual: number,
    overallScore: number
  ): boolean {
    return (
      outputQuality >= (this.config.thresholds?.minOutputQuality ?? 70) &&
      reasoningCoherence >= (this.config.thresholds?.minReasoningCoherence ?? 70) &&
      costValue >= (this.config.thresholds?.minCostValue ?? 60) &&
      hypothesisSwitching >= (this.config.thresholds?.minHypothesisSwitching ?? 60) &&
      counterfactual >= (this.config.thresholds?.minCounterfactual ?? 50) &&
      overallScore >= (this.config.thresholds?.minOverallScore ?? 70)
    );
  }

  /**
   * Generate recommendations for a single trace
   */
  private generateRecommendations(
    outputQuality: OutputQualityMetrics,
    reasoningCoherence: ReasoningCoherenceMetrics,
    costValue: CostValueMetrics,
    hypothesisSwitching: HypothesisSwitchingMetrics,
    counterfactual: CounterfactualMetrics
  ): string[] {
    const recommendations: string[] = [];

    if (outputQuality.score < (this.config.thresholds?.minOutputQuality ?? 70)) {
      recommendations.push('Improve output quality by increasing task success rate and CRV validation pass rate');
    }
    if (reasoningCoherence.score < (this.config.thresholds?.minReasoningCoherence ?? 70)) {
      recommendations.push('Improve reasoning coherence by reducing retries and ensuring logical task flow');
    }
    if (costValue.score < (this.config.thresholds?.minCostValue ?? 60)) {
      recommendations.push('Optimize cost/value ratio by reducing unnecessary retries and rollbacks');
    }
    if (hypothesisSwitching.score < (this.config.thresholds?.minHypothesisSwitching ?? 60)) {
      recommendations.push('Improve hypothesis switching strategy to increase productive switches');
    }
    if (counterfactual.score < (this.config.thresholds?.minCounterfactual ?? 50)) {
      recommendations.push('Reduce unnecessary actions and focus on high-value interventions');
    }

    return recommendations;
  }

  /**
   * Calculate aggregate metrics across all scores
   */
  private calculateAggregateMetrics(scores: BenchmarkScore[]): BenchmarkReport['aggregateMetrics'] {
    if (scores.length === 0) {
      return {
        averageOutputQuality: 0,
        averageReasoningCoherence: 0,
        averageCostValue: 0,
        averageHypothesisSwitching: 0,
        averageCounterfactual: 0,
        overallAverageScore: 0,
        passRate: 0,
      };
    }

    const sum = scores.reduce(
      (acc, score) => ({
        outputQuality: acc.outputQuality + score.outputQuality.score,
        reasoningCoherence: acc.reasoningCoherence + score.reasoningCoherence.score,
        costValue: acc.costValue + score.costValue.score,
        hypothesisSwitching: acc.hypothesisSwitching + score.hypothesisSwitching.score,
        counterfactual: acc.counterfactual + score.counterfactual.score,
        overallScore: acc.overallScore + score.overallScore,
        passed: acc.passed + (score.passed ? 1 : 0),
      }),
      {
        outputQuality: 0,
        reasoningCoherence: 0,
        costValue: 0,
        hypothesisSwitching: 0,
        counterfactual: 0,
        overallScore: 0,
        passed: 0,
      }
    );

    const count = scores.length;

    return {
      averageOutputQuality: sum.outputQuality / count,
      averageReasoningCoherence: sum.reasoningCoherence / count,
      averageCostValue: sum.costValue / count,
      averageHypothesisSwitching: sum.hypothesisSwitching / count,
      averageCounterfactual: sum.counterfactual / count,
      overallAverageScore: sum.overallScore / count,
      passRate: sum.passed / count,
    };
  }

  /**
   * Generate insights from scores
   */
  private generateInsights(
    scores: BenchmarkScore[],
    aggregateMetrics: BenchmarkReport['aggregateMetrics'],
    counterfactualSimulations?: Array<{
      traceId: string;
      actualOutcome: string;
      doNothingOutcome: string;
      interventionValue: number;
      wastedActions: string[];
      necessaryActions: string[];
    }>
  ): string[] {
    const insights: string[] = [];

    if (aggregateMetrics.passRate < 0.7) {
      insights.push(`Low pass rate (${(aggregateMetrics.passRate * 100).toFixed(1)}%) indicates systemic issues`);
    }

    if (aggregateMetrics.averageOutputQuality < 70) {
      insights.push('Output quality is below acceptable threshold across traces');
    }

    if (aggregateMetrics.averageReasoningCoherence < 70) {
      insights.push('Reasoning coherence needs improvement across the system');
    }

    if (aggregateMetrics.averageCostValue < 60) {
      insights.push('Cost/value ratio is suboptimal - consider optimizing resource usage');
    }

    // Counterfactual insights
    if (counterfactualSimulations && counterfactualSimulations.length > 0) {
      const avgInterventionValue =
        counterfactualSimulations.reduce((sum, sim) => sum + sim.interventionValue, 0) /
        counterfactualSimulations.length;
      
      const totalWastedActions = counterfactualSimulations.reduce(
        (sum, sim) => sum + sim.wastedActions.length,
        0
      );
      const totalNecessaryActions = counterfactualSimulations.reduce(
        (sum, sim) => sum + sim.necessaryActions.length,
        0
      );

      insights.push(
        `Average intervention value: ${(avgInterventionValue * 100).toFixed(1)}% - ${
          avgInterventionValue > 0.7
            ? 'actions were highly valuable'
            : avgInterventionValue > 0.4
            ? 'actions had moderate value'
            : 'many actions may have been unnecessary'
        }`
      );

      if (totalWastedActions > totalNecessaryActions) {
        insights.push(
          `Action efficiency concern: ${totalWastedActions} wasted actions vs ${totalNecessaryActions} necessary actions`
        );
      }
    }

    // Grade distribution
    const gradeCounts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const score of scores) {
      gradeCounts[score.grade]++;
    }
    insights.push(
      `Grade distribution: A=${gradeCounts.A}, B=${gradeCounts.B}, C=${gradeCounts.C}, D=${gradeCounts.D}, F=${gradeCounts.F}`
    );

    return insights;
  }

  /**
   * Generate recommendations for the overall report
   */
  private generateReportRecommendations(
    scores: BenchmarkScore[],
    aggregateMetrics: BenchmarkReport['aggregateMetrics'],
    counterfactualSimulations?: Array<{
      traceId: string;
      actualOutcome: string;
      doNothingOutcome: string;
      interventionValue: number;
      wastedActions: string[];
      necessaryActions: string[];
    }>
  ): string[] {
    const recommendations: string[] = [];

    if (aggregateMetrics.passRate < 0.8) {
      recommendations.push('Investigate common failure patterns across traces');
    }

    if (aggregateMetrics.averageOutputQuality < (this.config.thresholds?.minOutputQuality ?? 70)) {
      recommendations.push('Focus on improving task completion rates and validation pass rates');
    }

    if (aggregateMetrics.averageCostValue < (this.config.thresholds?.minCostValue ?? 60)) {
      recommendations.push('Implement retry backoff strategies and reduce unnecessary API calls');
    }

    if (aggregateMetrics.averageHypothesisSwitching < (this.config.thresholds?.minHypothesisSwitching ?? 60)) {
      recommendations.push('Review hypothesis switching strategy to minimize unproductive switches');
    }

    // Counterfactual recommendations
    if (counterfactualSimulations && counterfactualSimulations.length > 0) {
      const lowValueActions = counterfactualSimulations.filter((sim) => sim.interventionValue < 0.5);
      if (lowValueActions.length > counterfactualSimulations.length * 0.3) {
        recommendations.push(
          'Consider implementing more selective action triggers - many interventions had low value'
        );
      }

      const highWasteRatio = counterfactualSimulations.filter(
        (sim) => sim.wastedActions.length > sim.necessaryActions.length
      );
      if (highWasteRatio.length > 0) {
        recommendations.push(
          'Optimize action planning to reduce wasted effort - review failed and unnecessary actions'
        );
      }
    }

    return recommendations;
  }

  /**
   * Get default hypothesis switching metrics when disabled
   */
  private getDefaultHypothesisSwitching(): HypothesisSwitchingMetrics {
    return {
      totalSwitches: 0,
      productiveSwitches: 0,
      unproductiveSwitches: 0,
      switchEfficiency: 1.0,
      averageTimeBeforeSwitch: 0,
      score: 100,
      details: ['Hypothesis switching evaluation disabled'],
    };
  }

  /**
   * Get default counterfactual metrics when disabled
   */
  private getDefaultCounterfactual(): CounterfactualMetrics {
    return {
      actualOutcome: 'unknown',
      doNothingOutcome: 'unknown',
      interventionValue: 1.0,
      unnecessaryActions: 0,
      necessaryActions: 0,
      efficiency: 1.0,
      score: 100,
      details: ['Counterfactual evaluation disabled'],
    };
  }
}
