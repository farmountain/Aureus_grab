/**
 * Performance Test Suite
 * 
 * Comprehensive tests for Week 10: Performance & Load Testing
 * 
 * Test Categories:
 * 1. Performance Framework Tests
 * 2. Load Scenario Tests
 * 3. Profiler Tests
 * 4. Benchmark Tests
 * 5. Scaling Tests
 * 6. Integration Tests
 */

const assert = require('assert');
const { describe, it, before, after } = require('node:test');
const { PerformanceMetrics, PerformanceTest, BenchmarkRunner, LoadScenario } = require('../Aureus-Sentinel/performance/performance_framework');
const { LoadTestExecutor, LoadProfiles } = require('../Aureus-Sentinel/performance/load_scenarios');
const { Profiler, FunctionProfiler, MemoryProfiler } = require('../Aureus-Sentinel/performance/profiler');
const { runAllBenchmarks } = require('../Aureus-Sentinel/performance/benchmarks');

/**
 * Test 1: Performance Framework
 */
describe('Performance Framework', () => {
  it('should track latency metrics correctly', () => {
    const metrics = new PerformanceMetrics();
    
    metrics.recordLatency(100);
    metrics.recordLatency(200);
    metrics.recordLatency(150);
    
    assert.strictEqual(metrics.latencies.length, 3);
    assert.strictEqual(metrics.getPercentile(50), 150);
  });

  it('should calculate percentiles correctly', () => {
    const metrics = new PerformanceMetrics();
    
    for (let i = 1; i <= 100; i++) {
      metrics.recordLatency(i);
    }
    
    const p50 = metrics.getPercentile(50);
    const p95 = metrics.getPercentile(95);
    const p99 = metrics.getPercentile(99);
    
    assert.ok(p50 >= 49 && p50 <= 51);
    assert.ok(p95 >= 94 && p95 <= 96);
    assert.ok(p99 >= 98 && p99 <= 100);
  });

  it('should track success and error counts', () => {
    const metrics = new PerformanceMetrics();
    
    metrics.recordSuccess();
    metrics.recordSuccess();
    metrics.recordError();
    
    assert.strictEqual(metrics.successCount, 2);
    assert.strictEqual(metrics.errorCount, 1);
  });

  it('should generate comprehensive report', () => {
    const metrics = new PerformanceMetrics();
    
    metrics.recordLatency(100);
    metrics.recordLatency(200);
    metrics.recordSuccess();
    metrics.recordSuccess();
    metrics.recordError();
    
    const report = metrics.getReport();
    
    assert.ok(report.summary);
    assert.ok(report.latency);
    assert.strictEqual(report.summary.totalRequests, 3);
    assert.strictEqual(report.summary.successRate.toFixed(2), '0.67');
  });

  it('should run performance test', async () => {
    const test = new PerformanceTest({
      duration: 1000,
      concurrency: 5
    });

    let callCount = 0;
    const testFn = async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return { success: true };
    };

    const result = await test.run(testFn);
    
    assert.ok(callCount > 0);
    assert.ok(result.summary.totalRequests > 0);
    assert.ok(result.summary.throughput > 0);
    assert.ok(result.latency.p50 > 0);
  });
});

/**
 * Test 2: Benchmark Runner
 */
describe('Benchmark Runner', () => {
  it('should compare implementations', async () => {
    const runner = new BenchmarkRunner('Test Benchmark');
    
    runner.add('fast-operation', () => {
      return 1 + 1;
    });
    
    runner.add('slow-operation', () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      return sum;
    });
    
    const results = await runner.run();
    
    assert.ok(results.fastest);
    assert.ok(results.fastestResults.length === 2);
    assert.ok(results.fastestResults[0].opsPerSec > 0);
    
    // Fast operation should be faster
    const fastOps = results.fastestResults.find(r => r.name === 'fast-operation');
    const slowOps = results.fastestResults.find(r => r.name === 'slow-operation');
    assert.ok(fastOps.opsPerSec > slowOps.opsPerSec);
  });

  it('should handle async benchmarks', async () => {
    const runner = new BenchmarkRunner('Async Benchmark');
    
    runner.add('async-operation', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'done';
    });
    
    const results = await runner.run();
    
    assert.ok(results.fastestResults.length === 1);
    assert.ok(results.fastestResults[0].opsPerSec > 0);
  });
});

/**
 * Test 3: Load Scenarios
 */
describe('Load Scenarios', () => {
  it('should create load scenario with stages', () => {
    const scenario = new LoadScenario('Test Scenario');
    
    scenario.addStage(1000, 10);
    scenario.addStage(2000, 20);
    
    assert.strictEqual(scenario.stages.length, 2);
    assert.strictEqual(scenario.stages[0].targetRPS, 10);
  });

  it('should execute load scenario', async function() {
    this.timeout(10000);
    
    const scenario = new LoadScenario('Quick Test');
    scenario.addStage(2000, 50);  // 2s @ 50 RPS
    
    let requestCount = 0;
    const testFn = async () => {
      requestCount++;
      return { success: true };
    };
    
    const result = await scenario.execute(testFn);
    
    assert.ok(requestCount > 0);
    assert.ok(result.summary.totalRequests > 0);
  });

  it('should validate load test scenarios exist', () => {
    const { LoadTestScenarios } = require('../Aureus-Sentinel/performance/load_scenarios');
    
    assert.ok(LoadTestScenarios.smoke);
    assert.ok(LoadTestScenarios.load);
    assert.ok(LoadTestScenarios.stress);
    assert.ok(LoadTestScenarios.spike);
    assert.ok(LoadTestScenarios.soak);
    assert.ok(LoadTestScenarios.breakpoint);
  });

  it('should validate load profiles exist', () => {
    const { LoadProfiles } = require('../Aureus-Sentinel/performance/load_scenarios');
    
    assert.ok(LoadProfiles.intentSubmission);
    assert.ok(LoadProfiles.signatureVerification);
    assert.ok(LoadProfiles.eventStore);
    assert.ok(LoadProfiles.fullPipeline);
  });
});

/**
 * Test 4: Function Profiler
 */
describe('Function Profiler', () => {
  it('should profile function execution', () => {
    const profiler = new FunctionProfiler();
    
    const slowFunction = () => {
      let sum = 0;
      for (let i = 0; i < 1000000; i++) {
        sum += i;
      }
      return sum;
    };
    
    const wrapped = profiler.wrap(slowFunction, 'slowFunction');
    
    wrapped();
    wrapped();
    
    const results = profiler.getResults();
    
    assert.strictEqual(results.functions.length, 1);
    assert.strictEqual(results.functions[0].callCount, 2);
    assert.ok(results.functions[0].avgTime > 0);
    assert.ok(results.functions[0].totalTime > 0);
  });

  it('should handle async functions', async () => {
    const profiler = new FunctionProfiler();
    
    const asyncFunction = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'done';
    };
    
    const wrapped = profiler.wrap(asyncFunction, 'asyncFunction');
    
    await wrapped();
    
    const results = profiler.getResults();
    
    assert.strictEqual(results.functions[0].callCount, 1);
    assert.ok(results.functions[0].avgTime >= 100);
  });

  it('should track errors', async () => {
    const profiler = new FunctionProfiler();
    
    const errorFunction = () => {
      throw new Error('Test error');
    };
    
    const wrapped = profiler.wrap(errorFunction, 'errorFunction');
    
    try {
      wrapped();
    } catch (error) {
      // Expected
    }
    
    const results = profiler.getResults();
    
    assert.strictEqual(results.functions[0].errors, 1);
  });
});

/**
 * Test 5: Memory Profiler
 */
describe('Memory Profiler', () => {
  it('should track memory snapshots', async function() {
    this.timeout(5000);
    
    const profiler = new MemoryProfiler(100);  // 100ms interval
    
    profiler.start();
    await new Promise(resolve => setTimeout(resolve, 500));
    profiler.stop();
    
    const report = profiler.getReport();
    
    assert.ok(report.snapshotCount >= 4);  // At least 4 snapshots in 500ms
    assert.ok(report.heap.initial > 0);
    assert.ok(report.heap.final > 0);
  });

  it('should detect memory trends', async function() {
    this.timeout(3000);
    
    const profiler = new MemoryProfiler(100);
    
    let leakArray = [];
    profiler.start();
    
    // Simulate memory allocation
    const interval = setInterval(() => {
      leakArray.push(new Array(10000).fill('x'));
    }, 100);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    clearInterval(interval);
    profiler.stop();
    
    const report = profiler.getReport();
    
    // Should show growth
    assert.ok(report.heap.trend !== undefined);
    assert.ok(report.heap.final > report.heap.initial);
  });
});

/**
 * Test 6: Schema Validation Benchmarks
 */
describe('Schema Validation Performance', () => {
  it('should validate intent within performance target', () => {
    const { validateIntent } = require('../Aureus-Sentinel/bridge/schema_validator');
    
    const intent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: '123e4567-e89b-12d3-a456-426614174000',
      channelId: 'test',
      tool: 'test_tool',
      parameters: {},
      riskLevel: 'low',
      description: 'Performance test',
      timestamp: new Date().toISOString()
    };
    
    const start = Date.now();
    const result = validateIntent(intent);
    const duration = Date.now() - start;
    
    assert.ok(result.valid);
    assert.ok(duration < 50, `Validation took ${duration}ms, expected < 50ms`);
  });

  it('should handle high-throughput validation', () => {
    const { validateIntent } = require('../Aureus-Sentinel/bridge/schema_validator');
    
    const intent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: '123e4567-e89b-12d3-a456-426614174000',
      channelId: 'test',
      tool: 'test_tool',
      parameters: {},
      riskLevel: 'low',
      description: 'Throughput test',
      timestamp: new Date().toISOString()
    };
    
    const start = Date.now();
    let validations = 0;
    
    // Run for 1 second
    while (Date.now() - start < 1000) {
      intent.intentId = `intent-${Date.now()}`;
      validateIntent(intent);
      validations++;
    }
    
    const throughput = validations / ((Date.now() - start) / 1000);
    
    assert.ok(throughput > 1000, `Throughput: ${throughput.toFixed(0)} ops/sec, expected > 1000`);
  });
});

/**
 * Test 7: Signature Performance
 */
describe('Signature Performance', () => {
  it('should sign payload within performance target', async () => {
    const { Signer } = require('../Aureus-Sentinel/bridge/signer');
    
    const signer = new Signer('test-key', Buffer.from('test-secret-key-32-bytes-long!!'));
    const payload = { intentId: 'test-123', action: 'execute' };
    
    const start = Date.now();
    const signature = await signer.sign(payload);
    const duration = Date.now() - start;
    
    assert.ok(signature);
    assert.ok(duration < 100, `Signing took ${duration}ms, expected < 100ms`);
  });

  it('should verify signature within performance target', async () => {
    const { Signer } = require('../Aureus-Sentinel/bridge/signer');
    
    const signer = new Signer('test-key', Buffer.from('test-secret-key-32-bytes-long!!'));
    const payload = { intentId: 'test-123', action: 'execute' };
    const signature = await signer.sign(payload);
    
    const start = Date.now();
    const verified = await signer.verify(payload, signature);
    const duration = Date.now() - start;
    
    assert.ok(verified);
    assert.ok(duration < 100, `Verification took ${duration}ms, expected < 100ms`);
  });
});

/**
 * Test 8: Event Store Performance
 */
describe('Event Store Performance', () => {
  it('should append events within performance target', async () => {
    const { EventStore } = require('../Aureus-Sentinel/bridge/event_store');
    
    const store = new EventStore();
    const event = {
      type: 'test.event',
      data: { test: true },
      timestamp: Date.now()
    };
    
    const start = Date.now();
    await store.append(event);
    const duration = Date.now() - start;
    
    assert.ok(duration < 50, `Append took ${duration}ms, expected < 50ms`);
  });

  it('should handle batch operations efficiently', async () => {
    const { EventStore } = require('../Aureus-Sentinel/bridge/event_store');
    
    const store = new EventStore();
    const events = Array(100).fill(null).map((_, i) => ({
      type: 'test.batch',
      data: { index: i },
      timestamp: Date.now()
    }));
    
    const start = Date.now();
    
    for (const event of events) {
      await store.append(event);
    }
    
    const duration = Date.now() - start;
    const throughput = events.length / (duration / 1000);
    
    assert.ok(throughput > 100, `Batch throughput: ${throughput.toFixed(0)} ops/sec, expected > 100`);
  });
});

/**
 * Test 9: Integration - Full Pipeline Performance
 */
describe('Full Pipeline Performance', () => {
  it('should process complete intent flow within target', async () => {
    const { validateIntent } = require('../Aureus-Sentinel/bridge/schema_validator');
    const { Signer } = require('../Aureus-Sentinel/bridge/signer');
    const { EventStore } = require('../Aureus-Sentinel/bridge/event_store');
    
    const signer = new Signer('test-key', Buffer.from('test-secret-key-32-bytes-long!!'));
    const store = new EventStore();
    
    const intent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: `intent-${Date.now()}`,
      channelId: 'test',
      tool: 'test_tool',
      parameters: {},
      riskLevel: 'low',
      description: 'Pipeline test',
      timestamp: new Date().toISOString()
    };
    
    const start = Date.now();
    
    // 1. Validate
    const validation = validateIntent(intent);
    assert.ok(validation.valid);
    
    // 2. Sign
    const signature = await signer.sign(intent);
    assert.ok(signature);
    
    // 3. Store
    await store.append({
      type: 'intent.signed',
      intentId: intent.intentId,
      signature,
      timestamp: Date.now()
    });
    
    // 4. Verify
    const verified = await signer.verify(intent, signature);
    assert.ok(verified);
    
    const duration = Date.now() - start;
    
    assert.ok(duration < 200, `Pipeline took ${duration}ms, expected < 200ms`);
  });
});

/**
 * Test 10: Load Test Executor
 */
describe('Load Test Executor', () => {
  it('should execute smoke test scenario', async function() {
    this.timeout(40000);
    
    const { LoadProfiles } = require('../Aureus-Sentinel/performance/load_scenarios');
    
    const result = await LoadTestExecutor.runScenario('smoke', 'intentSubmission');
    
    assert.ok(result);
    assert.ok(result.summary.totalRequests > 0);
  });
});

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n' + '█'.repeat(70));
  console.log('PERFORMANCE TEST SUITE - COMPREHENSIVE');
  console.log('█'.repeat(70));
  console.log('\n🧪 Running all performance tests...\n');
  
  // Tests will run via Node.js test runner
  // This function is for manual execution
}

module.exports = {
  runAllTests
};
