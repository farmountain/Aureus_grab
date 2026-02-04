/**
 * Performance Testing Framework
 * 
 * Comprehensive framework for performance testing and metrics collection:
 * - Latency tracking (p50, p95, p99)
 * - Throughput measurement (ops/sec)
 * - Resource monitoring (CPU, memory)
 * - Success/error rates
 * - Detailed performance reports
 * 
 * Week 10: Performance & Load Testing
 */

const os = require('os');
const EventEmitter = require('events');

/**
 * Performance metrics collector
 */
class PerformanceMetrics {
  constructor() {
    this.latencies = [];
    this.successCount = 0;
    this.errorCount = 0;
    this.startTime = null;
    this.endTime = null;
    this.throughput = 0;
    this.cpuUsage = [];
    this.memoryUsage = [];
  }

  recordLatency(durationMs) {
    this.latencies.push(durationMs);
  }

  recordSuccess() {
    this.successCount++;
  }

  recordError(error) {
    this.errorCount++;
  }

  recordCPU(usage) {
    this.cpuUsage.push(usage);
  }

  recordMemory(usage) {
    this.memoryUsage.push(usage);
  }

  start() {
    this.startTime = Date.now();
  }

  end() {
    this.endTime = Date.now();
    const durationSec = (this.endTime - this.startTime) / 1000;
    this.throughput = (this.successCount + this.errorCount) / durationSec;
  }

  getPercentile(percentile) {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  getReport() {
    const totalRequests = this.successCount + this.errorCount;
    const durationSec = this.endTime ? (this.endTime - this.startTime) / 1000 : 0;

    return {
      summary: {
        totalRequests,
        successCount: this.successCount,
        errorCount: this.errorCount,
        successRate: totalRequests > 0 ? (this.successCount / totalRequests * 100).toFixed(2) + '%' : '0%',
        durationSec: durationSec.toFixed(2),
        throughput: this.throughput.toFixed(2) + ' ops/sec'
      },
      latency: {
        min: Math.min(...this.latencies).toFixed(2) + 'ms',
        max: Math.max(...this.latencies).toFixed(2) + 'ms',
        mean: this.getAverage(this.latencies).toFixed(2) + 'ms',
        p50: this.getPercentile(50).toFixed(2) + 'ms',
        p95: this.getPercentile(95).toFixed(2) + 'ms',
        p99: this.getPercentile(99).toFixed(2) + 'ms'
      },
      resources: {
        avgCPU: this.getAverage(this.cpuUsage).toFixed(2) + '%',
        avgMemory: (this.getAverage(this.memoryUsage) / 1024 / 1024).toFixed(2) + ' MB',
        peakMemory: (Math.max(...this.memoryUsage) / 1024 / 1024).toFixed(2) + ' MB'
      }
    };
  }
}

/**
 * Performance test runner
 */
class PerformanceTest extends EventEmitter {
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.options = {
      duration: options.duration || 10000,        // 10 seconds
      concurrency: options.concurrency || 10,     // 10 concurrent
      rampUpTime: options.rampUpTime || 0,        // No ramp-up
      thinkTime: options.thinkTime || 0,          // No delay between requests
      monitorResources: options.monitorResources !== false,
      ...options
    };
    this.metrics = new PerformanceMetrics();
    this.running = false;
    this.activeRequests = 0;
  }

  /**
   * Execute performance test
   */
  async run(testFunction) {
    console.log(`\n[PerformanceTest:${this.name}] Starting...`);
    console.log(`  Duration: ${this.options.duration}ms`);
    console.log(`  Concurrency: ${this.options.concurrency}`);
    console.log(`  Ramp-up: ${this.options.rampUpTime}ms`);

    this.running = true;
    this.metrics.start();

    // Start resource monitoring
    let resourceMonitor;
    if (this.options.monitorResources) {
      resourceMonitor = this._startResourceMonitoring();
    }

    // Ramp-up phase
    if (this.options.rampUpTime > 0) {
      await this._rampUp(testFunction);
    }

    // Main test execution
    const workers = [];
    for (let i = 0; i < this.options.concurrency; i++) {
      workers.push(this._worker(i, testFunction));
    }

    // Wait for duration
    await new Promise(resolve => setTimeout(resolve, this.options.duration));
    this.running = false;

    // Wait for active requests to complete
    await Promise.all(workers);

    // Stop resource monitoring
    if (resourceMonitor) {
      clearInterval(resourceMonitor);
    }

    this.metrics.end();

    const report = this.metrics.getReport();
    console.log(`\n[PerformanceTest:${this.name}] Complete`);
    this._printReport(report);

    this.emit('complete', report);

    return report;
  }

  /**
   * Worker that executes test function repeatedly
   */
  async _worker(workerId, testFunction) {
    while (this.running) {
      this.activeRequests++;
      const startTime = Date.now();

      try {
        await testFunction({ workerId, metrics: this.metrics });
        const duration = Date.now() - startTime;
        this.metrics.recordLatency(duration);
        this.metrics.recordSuccess();
        this.emit('success', { workerId, duration });
      } catch (error) {
        const duration = Date.now() - startTime;
        this.metrics.recordLatency(duration);
        this.metrics.recordError(error);
        this.emit('error', { workerId, error });
      }

      this.activeRequests--;

      // Think time (delay between requests)
      if (this.options.thinkTime > 0) {
        await new Promise(resolve => setTimeout(resolve, this.options.thinkTime));
      }
    }
  }

  /**
   * Gradual ramp-up of concurrent requests
   */
  async _rampUp(testFunction) {
    console.log(`[PerformanceTest:${this.name}] Ramping up...`);
    const steps = Math.min(this.options.concurrency, 10);
    const stepDuration = this.options.rampUpTime / steps;
    const workersPerStep = Math.ceil(this.options.concurrency / steps);

    for (let step = 0; step < steps; step++) {
      const currentWorkers = Math.min((step + 1) * workersPerStep, this.options.concurrency);
      console.log(`  Step ${step + 1}/${steps}: ${currentWorkers} workers`);
      await new Promise(resolve => setTimeout(resolve, stepDuration));
    }
  }

  /**
   * Monitor CPU and memory usage
   */
  _startResourceMonitoring() {
    const interval = 1000; // Monitor every second

    return setInterval(() => {
      // CPU usage (approximation)
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;

      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });

      const cpuUsage = 100 - ~~(100 * totalIdle / totalTick);
      this.metrics.recordCPU(cpuUsage);

      // Memory usage
      const memUsage = process.memoryUsage();
      this.metrics.recordMemory(memUsage.heapUsed);
    }, interval);
  }

  /**
   * Print formatted report
   */
  _printReport(report) {
    console.log('\n' + '='.repeat(60));
    console.log(`Performance Test: ${this.name}`);
    console.log('='.repeat(60));

    console.log('\n📊 Summary:');
    console.log(`  Total Requests:  ${report.summary.totalRequests}`);
    console.log(`  ✅ Success:      ${report.summary.successCount}`);
    console.log(`  ❌ Errors:       ${report.summary.errorCount}`);
    console.log(`  Success Rate:    ${report.summary.successRate}`);
    console.log(`  Duration:        ${report.summary.durationSec}s`);
    console.log(`  Throughput:      ${report.summary.throughput}`);

    console.log('\n⏱️  Latency:');
    console.log(`  Min:     ${report.latency.min}`);
    console.log(`  Max:     ${report.latency.max}`);
    console.log(`  Mean:    ${report.latency.mean}`);
    console.log(`  p50:     ${report.latency.p50}`);
    console.log(`  p95:     ${report.latency.p95}`);
    console.log(`  p99:     ${report.latency.p99}`);

    console.log('\n💻 Resources:');
    console.log(`  Avg CPU:     ${report.resources.avgCPU}`);
    console.log(`  Avg Memory:  ${report.resources.avgMemory}`);
    console.log(`  Peak Memory: ${report.resources.peakMemory}`);

    console.log('='.repeat(60) + '\n');
  }

  /**
   * Stop test early
   */
  stop() {
    this.running = false;
  }
}

/**
 * Benchmark runner for comparing implementations
 */
class BenchmarkRunner {
  constructor(name) {
    this.name = name;
    this.benchmarks = [];
  }

  /**
   * Add benchmark
   */
  add(name, fn) {
    this.benchmarks.push({ name, fn });
    return this;
  }

  /**
   * Run all benchmarks
   */
  async run(iterations = 10000) {
    console.log(`\n[Benchmark:${this.name}] Running ${this.benchmarks.length} benchmarks (${iterations} iterations each)...\n`);

    const results = [];

    for (const benchmark of this.benchmarks) {
      const startTime = process.hrtime.bigint();
      const startMem = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        await benchmark.fn();
      }

      const endTime = process.hrtime.bigint();
      const endMem = process.memoryUsage().heapUsed;

      const durationNs = Number(endTime - startTime);
      const durationMs = durationNs / 1000000;
      const opsPerSec = (iterations / durationMs) * 1000;
      const memDelta = (endMem - startMem) / 1024 / 1024;

      const result = {
        name: benchmark.name,
        iterations,
        totalTimeMs: durationMs.toFixed(2),
        avgTimeMs: (durationMs / iterations).toFixed(4),
        opsPerSec: opsPerSec.toFixed(0),
        memoryDeltaMB: memDelta.toFixed(2)
      };

      results.push(result);

      console.log(`✅ ${benchmark.name}`);
      console.log(`   ${result.totalTimeMs}ms total | ${result.avgTimeMs}ms avg | ${result.opsPerSec} ops/sec`);
    }

    // Find fastest
    const fastest = results.reduce((prev, curr) => 
      parseFloat(prev.avgTimeMs) < parseFloat(curr.avgTimeMs) ? prev : curr
    );

    console.log(`\n🏆 Fastest: ${fastest.name}\n`);

    // Comparison table
    console.log('Relative Performance:');
    results.forEach(result => {
      const ratio = (parseFloat(result.avgTimeMs) / parseFloat(fastest.avgTimeMs)).toFixed(2);
      const symbol = result === fastest ? '🥇' : ratio < 2 ? '🥈' : '🥉';
      console.log(`  ${symbol} ${result.name}: ${ratio}x (${result.avgTimeMs}ms)`);
    });

    return results;
  }
}

/**
 * Load test scenario builder
 */
class LoadScenario {
  constructor(name) {
    this.name = name;
    this.stages = [];
  }

  /**
   * Add load stage
   */
  addStage(duration, targetRPS) {
    this.stages.push({ duration, targetRPS });
    return this;
  }

  /**
   * Execute load scenario
   */
  async execute(testFunction) {
    console.log(`\n[LoadScenario:${this.name}] Starting multi-stage load test...\n`);

    const allMetrics = [];

    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      console.log(`Stage ${i + 1}/${this.stages.length}: ${stage.targetRPS} RPS for ${stage.duration}ms`);

      const concurrency = Math.max(1, Math.ceil(stage.targetRPS / 10));
      const thinkTime = concurrency > 0 ? Math.floor(1000 / (stage.targetRPS / concurrency)) : 0;

      const test = new PerformanceTest(`${this.name}-stage${i + 1}`, {
        duration: stage.duration,
        concurrency,
        thinkTime,
        monitorResources: true
      });

      const report = await test.run(testFunction);
      allMetrics.push({ stage: i + 1, ...report });
    }

    console.log(`\n[LoadScenario:${this.name}] Complete\n`);

    return allMetrics;
  }
}

module.exports = {
  PerformanceTest,
  PerformanceMetrics,
  BenchmarkRunner,
  LoadScenario
};
