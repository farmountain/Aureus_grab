/**
 * Scaling Validation Tests
 * 
 * Tests to validate horizontal scaling capabilities:
 * - Load distribution across instances
 * - Performance consistency under scaling
 * - Resource limit testing
 * 
 * Week 10: Performance & Load Testing
 */

const { PerformanceTest } = require('./performance_framework');
const cluster = require('cluster');
const os = require('os');

/**
 * Horizontal Scaling Tester
 */
class HorizontalScalingTester {
  constructor(workerCount = os.cpus().length) {
    this.workerCount = workerCount;
    this.workers = [];
    this.results = [];
  }

  /**
   * Test load distribution across workers
   */
  async testLoadDistribution(testFunction, totalRequests = 10000) {
    console.log('\n' + '='.repeat(70));
    console.log(`HORIZONTAL SCALING: Load Distribution Test (${this.workerCount} workers)`);
    console.log('='.repeat(70));

    if (cluster.isMaster || cluster.isPrimary) {
      return new Promise((resolve) => {
        const workerResults = new Map();
        let completedWorkers = 0;

        // Fork workers
        for (let i = 0; i < this.workerCount; i++) {
          const worker = cluster.fork();
          this.workers.push(worker);

          worker.on('message', (msg) => {
            if (msg.type === 'result') {
              workerResults.set(worker.id, msg.data);
              completedWorkers++;

              if (completedWorkers === this.workerCount) {
                // All workers finished
                const aggregated = this._aggregateResults(Array.from(workerResults.values()));
                resolve(aggregated);
              }
            }
          });

          // Send work to worker
          worker.send({
            type: 'work',
            requestsPerWorker: Math.floor(totalRequests / this.workerCount)
          });
        }
      });
    } else {
      // Worker process
      process.on('message', async (msg) => {
        if (msg.type === 'work') {
          const test = new PerformanceTest({
            duration: 0,  // Use iteration count instead
            iterations: msg.requestsPerWorker,
            concurrency: 10
          });

          const result = await test.run(testFunction);
          process.send({ type: 'result', data: result });
        }
      });
    }
  }

  _aggregateResults(results) {
    const totalRequests = results.reduce((sum, r) => sum + r.summary.totalRequests, 0);
    const totalSuccess = results.reduce((sum, r) => sum + (r.summary.totalRequests * r.summary.successRate), 0);
    const avgLatencies = results.map(r => r.latency.p50);
    const maxLatency = Math.max(...results.map(r => r.latency.max));

    return {
      workerCount: results.length,
      totalRequests,
      aggregatedMetrics: {
        successRate: totalSuccess / totalRequests,
        avgP50Latency: avgLatencies.reduce((a, b) => a + b) / avgLatencies.length,
        maxLatency,
        throughput: totalRequests / (results[0].summary.duration / 1000)
      },
      perWorkerResults: results,
      loadDistribution: this._analyzeLoadDistribution(results)
    };
  }

  _analyzeLoadDistribution(results) {
    const requestCounts = results.map(r => r.summary.totalRequests);
    const avg = requestCounts.reduce((a, b) => a + b) / requestCounts.length;
    const variance = requestCounts.reduce((sum, count) => sum + Math.pow(count - avg, 2), 0) / requestCounts.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean: avg,
      stdDev,
      coefficientOfVariation: stdDev / avg,
      isBalanced: (stdDev / avg) < 0.1  // Less than 10% variation
    };
  }

  /**
   * Cleanup workers
   */
  cleanup() {
    this.workers.forEach(worker => {
      try {
        worker.kill();
      } catch (error) {
        // Worker already dead
      }
    });
    this.workers = [];
  }
}

/**
 * Resource Limit Tester
 */
class ResourceLimitTester {
  /**
   * Test CPU limit behavior
   */
  static async testCPULimit(cpuIntensiveFunction, durationMs = 10000) {
    console.log('\n' + '='.repeat(70));
    console.log('RESOURCE LIMITS: CPU Saturation Test');
    console.log('='.repeat(70));

    const test = new PerformanceTest({
      duration: durationMs,
      concurrency: os.cpus().length * 2,  // 2x CPU count
      collectResourceMetrics: true
    });

    const result = await test.run(cpuIntensiveFunction);

    return {
      ...result,
      cpuAnalysis: {
        avgCPUUsage: result.resources.avgCPU,
        peakCPUUsage: result.resources.peakCPU,
        isCPUBound: result.resources.avgCPU > 80,
        throughputUnderLoad: result.summary.throughput
      }
    };
  }

  /**
   * Test memory limit behavior
   */
  static async testMemoryLimit(memoryIntensiveFunction, durationMs = 10000) {
    console.log('\n' + '='.repeat(70));
    console.log('RESOURCE LIMITS: Memory Pressure Test');
    console.log('='.repeat(70));

    const initialMemory = process.memoryUsage().heapUsed;

    const test = new PerformanceTest({
      duration: durationMs,
      concurrency: 50,
      collectResourceMetrics: true
    });

    const result = await test.run(memoryIntensiveFunction);
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;

    return {
      ...result,
      memoryAnalysis: {
        initialMemory,
        finalMemory,
        memoryGrowth,
        avgMemoryUsage: result.resources.avgMemory,
        peakMemoryUsage: result.resources.peakMemory,
        hasMemoryLeak: memoryGrowth > (initialMemory * 0.5)  // 50% growth indicates leak
      }
    };
  }

  /**
   * Test under resource constraints
   */
  static async testWithConstraints(testFunction, constraints) {
    console.log('\n' + '='.repeat(70));
    console.log('RESOURCE LIMITS: Constrained Environment Test');
    console.log('='.repeat(70));
    console.log(`Constraints: CPU=${constraints.maxCPU}%, Memory=${constraints.maxMemory}MB`);

    // Monitor and throttle if exceeds limits
    const monitor = setInterval(() => {
      const usage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      if (usage.heapUsed > constraints.maxMemory * 1024 * 1024) {
        console.warn('⚠️  Memory limit exceeded, triggering GC');
        if (global.gc) {
          global.gc();
        }
      }
    }, 1000);

    const test = new PerformanceTest({
      duration: 10000,
      concurrency: 20,
      collectResourceMetrics: true
    });

    const result = await test.run(testFunction);
    clearInterval(monitor);

    return {
      ...result,
      constraints,
      compliance: {
        memoryCompliant: result.resources.peakMemory < constraints.maxMemory * 1024 * 1024,
        cpuCompliant: result.resources.avgCPU < constraints.maxCPU
      }
    };
  }
}

/**
 * Performance Consistency Tester
 */
class PerformanceConsistencyTester {
  /**
   * Test performance consistency over multiple runs
   */
  static async testConsistency(testFunction, runs = 5) {
    console.log('\n' + '='.repeat(70));
    console.log(`PERFORMANCE CONSISTENCY: ${runs} Runs`);
    console.log('='.repeat(70));

    const results = [];

    for (let i = 0; i < runs; i++) {
      console.log(`\n▶️  Run ${i + 1}/${runs}`);
      
      const test = new PerformanceTest({
        duration: 10000,
        concurrency: 100
      });

      const result = await test.run(testFunction);
      results.push(result);

      // Cooldown between runs
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return this._analyzeConsistency(results);
  }

  static _analyzeConsistency(results) {
    const p50Latencies = results.map(r => r.latency.p50);
    const p99Latencies = results.map(r => r.latency.p99);
    const throughputs = results.map(r => r.summary.throughput);

    const calculateStats = (values) => {
      const mean = values.reduce((a, b) => a + b) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      
      return {
        mean,
        stdDev,
        min: Math.min(...values),
        max: Math.max(...values),
        coefficientOfVariation: stdDev / mean
      };
    };

    return {
      runs: results.length,
      p50Latency: calculateStats(p50Latencies),
      p99Latency: calculateStats(p99Latencies),
      throughput: calculateStats(throughputs),
      isConsistent: {
        p50: calculateStats(p50Latencies).coefficientOfVariation < 0.15,  // < 15% variation
        p99: calculateStats(p99Latencies).coefficientOfVariation < 0.20,  // < 20% variation
        throughput: calculateStats(throughputs).coefficientOfVariation < 0.10  // < 10% variation
      },
      rawResults: results
    };
  }
}

/**
 * Run all scaling validation tests
 */
async function runAllScalingTests() {
  console.log('\n' + '█'.repeat(70));
  console.log('SCALING VALIDATION TEST SUITE');
  console.log('█'.repeat(70));

  const results = {};

  // Test function (simple intent validation)
  const { validateIntent } = require('../bridge/schema_validator');
  const testFunction = async () => {
    const intent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: `intent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      channelId: 'api',
      tool: 'test',
      parameters: {},
      riskLevel: 'low',
      description: 'Scaling test',
      timestamp: new Date().toISOString()
    };

    return validateIntent(intent);
  };

  try {
    // 1. Horizontal scaling test (skip in worker)
    if (!cluster.isWorker) {
      console.log('\n📊 Test 1: Horizontal Scaling & Load Distribution');
      const scaler = new HorizontalScalingTester(4);
      results.horizontalScaling = await scaler.testLoadDistribution(testFunction, 10000);
      scaler.cleanup();
      
      console.log(`✓ Load distribution across ${results.horizontalScaling.workerCount} workers`);
      console.log(`  Balanced: ${results.horizontalScaling.loadDistribution.isBalanced ? 'Yes' : 'No'}`);
      console.log(`  CV: ${(results.horizontalScaling.loadDistribution.coefficientOfVariation * 100).toFixed(2)}%`);
    }

    // 2. CPU limit test
    console.log('\n📊 Test 2: CPU Resource Limits');
    const cpuIntensiveFunction = async () => {
      // Simulate CPU-intensive work
      let sum = 0;
      for (let i = 0; i < 10000; i++) {
        sum += Math.sqrt(i);
      }
      return sum;
    };
    
    results.cpuLimits = await ResourceLimitTester.testCPULimit(cpuIntensiveFunction, 5000);
    console.log(`✓ Avg CPU: ${results.cpuLimits.cpuAnalysis.avgCPUUsage.toFixed(1)}%`);
    console.log(`  CPU Bound: ${results.cpuLimits.cpuAnalysis.isCPUBound ? 'Yes' : 'No'}`);

    // 3. Memory limit test
    console.log('\n📊 Test 3: Memory Resource Limits');
    const memoryIntensiveFunction = async () => {
      // Simulate memory allocation
      const data = Array(1000).fill(null).map(() => ({
        id: Math.random().toString(36),
        data: Array(100).fill('x').join('')
      }));
      return data.length;
    };
    
    results.memoryLimits = await ResourceLimitTester.testMemoryLimit(memoryIntensiveFunction, 5000);
    console.log(`✓ Memory Growth: ${(results.memoryLimits.memoryAnalysis.memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Memory Leak: ${results.memoryLimits.memoryAnalysis.hasMemoryLeak ? 'Yes' : 'No'}`);

    // 4. Performance consistency test
    console.log('\n📊 Test 4: Performance Consistency (3 runs)');
    results.consistency = await PerformanceConsistencyTester.testConsistency(testFunction, 3);
    console.log(`✓ P50 Latency: ${results.consistency.p50Latency.mean.toFixed(2)}ms ± ${results.consistency.p50Latency.stdDev.toFixed(2)}ms`);
    console.log(`  Consistent: ${results.consistency.isConsistent.p50 ? 'Yes' : 'No'} (CV: ${(results.consistency.p50Latency.coefficientOfVariation * 100).toFixed(1)}%)`);

    // 5. Constrained environment test
    console.log('\n📊 Test 5: Resource-Constrained Environment');
    results.constraints = await ResourceLimitTester.testWithConstraints(testFunction, {
      maxCPU: 50,
      maxMemory: 256
    });
    console.log(`✓ CPU Compliant: ${results.constraints.compliance.cpuCompliant ? 'Yes' : 'No'}`);
    console.log(`  Memory Compliant: ${results.constraints.compliance.memoryCompliant ? 'Yes' : 'No'}`);

    // Summary
    console.log('\n' + '█'.repeat(70));
    console.log('SCALING VALIDATION SUMMARY');
    console.log('█'.repeat(70));
    console.log(`\n✅ All scaling tests completed`);
    
    if (!cluster.isWorker && results.horizontalScaling) {
      console.log(`   Horizontal Scaling: ${results.horizontalScaling.loadDistribution.isBalanced ? 'Balanced' : 'Unbalanced'}`);
    }
    console.log(`   CPU Performance: ${results.cpuLimits.cpuAnalysis.isCPUBound ? 'CPU-bound' : 'Not CPU-bound'}`);
    console.log(`   Memory Stability: ${results.memoryLimits.memoryAnalysis.hasMemoryLeak ? 'Leak detected' : 'Stable'}`);
    console.log(`   Consistency: ${results.consistency.isConsistent.p50 ? 'Consistent' : 'Inconsistent'}`);
    console.log(`   Resource Compliance: ${results.constraints.compliance.cpuCompliant && results.constraints.compliance.memoryCompliant ? 'Compliant' : 'Non-compliant'}`);
    
    console.log('█'.repeat(70) + '\n');

    return results;
  } catch (error) {
    console.error('❌ Scaling test failed:', error);
    throw error;
  }
}

module.exports = {
  HorizontalScalingTester,
  ResourceLimitTester,
  PerformanceConsistencyTester,
  runAllScalingTests
};
