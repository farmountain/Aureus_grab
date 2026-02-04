/**
 * Benchmarking Suite
 * 
 * Benchmarks critical performance paths in Aureus Sentinel:
 * - Schema validation
 * - Signature generation
 * - Event storage
 * - Replay operations
 * 
 * Week 10: Performance & Load Testing
 */

const { BenchmarkRunner } = require('./performance_framework');
const { validateIntent, validateContext, validatePlan, validateApproval, validateReport } = require('../bridge/schema_validator');
const { Signer } = require('../bridge/signer');
const { EventStore } = require('../bridge/event_store');

/**
 * Schema Validation Benchmarks
 */
class SchemaValidationBenchmarks {
  static async runAll() {
    console.log('\n' + '='.repeat(70));
    console.log('SCHEMA VALIDATION BENCHMARKS');
    console.log('='.repeat(70));

    const runner = new BenchmarkRunner('Schema Validation');

    // Intent validation benchmark
    const intentSample = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: '123e4567-e89b-12d3-a456-426614174000',
      channelId: 'web',
      tool: 'web_search',
      parameters: { query: 'test' },
      riskLevel: 'low',
      description: 'Benchmark intent',
      timestamp: new Date().toISOString()
    };

    runner.add('intent-validation', () => {
      return validateIntent(intentSample);
    });

    // Context validation benchmark
    const contextSample = {
      version: '1.0',
      type: 'context.envelope',
      contextId: '123e4567-e89b-12d3-a456-426614174001',
      intentId: intentSample.intentId,
      executionContext: {
        environment: 'production',
        capabilities: ['read', 'write'],
        policy: 'standard'
      },
      timestamp: new Date().toISOString()
    };

    runner.add('context-validation', () => {
      return validateContext(contextSample);
    });

    // Plan validation benchmark
    const planSample = {
      version: '1.0',
      type: 'plan.envelope',
      planId: '123e4567-e89b-12d3-a456-426614174002',
      intentId: intentSample.intentId,
      steps: [
        {
          stepId: 'step-1',
          action: 'fetch_data',
          parameters: { url: 'https://example.com' },
          dependencies: []
        }
      ],
      estimatedDuration: 1000,
      timestamp: new Date().toISOString()
    };

    runner.add('plan-validation', () => {
      return validatePlan(planSample);
    });

    // Approval validation benchmark
    const approvalSample = {
      version: '1.0',
      type: 'approval.envelope',
      approvalId: '123e4567-e89b-12d3-a456-426614174003',
      planId: planSample.planId,
      intentId: intentSample.intentId,
      decision: 'approved',
      approver: 'system',
      conditions: [],
      timestamp: new Date().toISOString()
    };

    runner.add('approval-validation', () => {
      return validateApproval(approvalSample);
    });

    // Report validation benchmark
    const reportSample = {
      version: '1.0',
      type: 'report.envelope',
      reportId: '123e4567-e89b-12d3-a456-426614174004',
      intentId: intentSample.intentId,
      planId: planSample.planId,
      status: 'completed',
      results: { data: 'test' },
      timestamp: new Date().toISOString()
    };

    runner.add('report-validation', () => {
      return validateReport(reportSample);
    });

    const results = await runner.run();
    return results;
  }
}

/**
 * Signature Generation Benchmarks
 */
class SignatureBenchmarks {
  static async runAll() {
    console.log('\n' + '='.repeat(70));
    console.log('SIGNATURE GENERATION BENCHMARKS');
    console.log('='.repeat(70));

    const runner = new BenchmarkRunner('Signature Generation');
    const signer = new Signer('benchmark-key', Buffer.from('test-secret-key-32-bytes-long!!'));

    // Small payload
    const smallPayload = {
      intentId: 'intent-123',
      action: 'execute'
    };

    runner.add('sign-small-payload', async () => {
      return await signer.sign(smallPayload);
    });

    runner.add('verify-small-payload', async () => {
      const signature = await signer.sign(smallPayload);
      return await signer.verify(smallPayload, signature);
    });

    // Medium payload
    const mediumPayload = {
      intentId: 'intent-123',
      plan: {
        steps: Array(10).fill(null).map((_, i) => ({
          stepId: `step-${i}`,
          action: 'fetch',
          parameters: { url: `https://example.com/${i}` }
        }))
      },
      timestamp: Date.now()
    };

    runner.add('sign-medium-payload', async () => {
      return await signer.sign(mediumPayload);
    });

    runner.add('verify-medium-payload', async () => {
      const signature = await signer.sign(mediumPayload);
      return await signer.verify(mediumPayload, signature);
    });

    // Large payload
    const largePayload = {
      intentId: 'intent-123',
      plan: {
        steps: Array(100).fill(null).map((_, i) => ({
          stepId: `step-${i}`,
          action: 'compute',
          parameters: {
            data: Array(100).fill('x').join(''),
            config: { iterations: 1000 }
          }
        }))
      },
      metadata: {
        tags: Array(50).fill('tag'),
        description: Array(1000).fill('x').join('')
      },
      timestamp: Date.now()
    };

    runner.add('sign-large-payload', async () => {
      return await signer.sign(largePayload);
    });

    runner.add('verify-large-payload', async () => {
      const signature = await signer.sign(largePayload);
      return await signer.verify(largePayload, signature);
    });

    const results = await runner.run();
    return results;
  }
}

/**
 * Event Storage Benchmarks
 */
class EventStoreBenchmarks {
  static async runAll() {
    console.log('\n' + '='.repeat(70));
    console.log('EVENT STORAGE BENCHMARKS');
    console.log('='.repeat(70));

    const runner = new BenchmarkRunner('Event Storage');
    const store = new EventStore();

    // Single event append
    runner.add('append-single-event', async () => {
      await store.append({
        type: 'test.event',
        data: { test: true },
        timestamp: Date.now()
      });
    });

    // Batch append
    runner.add('append-batch-10-events', async () => {
      const events = Array(10).fill(null).map((_, i) => ({
        type: 'test.batch',
        data: { index: i },
        timestamp: Date.now()
      }));

      for (const event of events) {
        await store.append(event);
      }
    });

    // Read recent events
    runner.add('read-10-recent-events', async () => {
      return await store.getRecentEvents(10);
    });

    runner.add('read-100-recent-events', async () => {
      return await store.getRecentEvents(100);
    });

    // Query events
    runner.add('query-by-type', async () => {
      return await store.queryEvents({ type: 'test.event' }, 50);
    });

    runner.add('query-by-timestamp', async () => {
      const now = Date.now();
      return await store.queryEvents({
        timestamp: { $gte: now - 60000 }  // Last minute
      }, 50);
    });

    const results = await runner.run();
    return results;
  }
}

/**
 * Replay Operations Benchmarks
 */
class ReplayBenchmarks {
  static async runAll() {
    console.log('\n' + '='.repeat(70));
    console.log('REPLAY OPERATIONS BENCHMARKS');
    console.log('='.repeat(70));

    const runner = new BenchmarkRunner('Replay Operations');
    const { ReplayHarness } = require('../bridge/replay_harness');
    const harness = new ReplayHarness();

    // Setup test session
    const sessionId = 'benchmark-session';
    await harness.startSession(sessionId, {
      mode: 'replay',
      source: 'benchmark'
    });

    // Record single request
    runner.add('record-single-request', async () => {
      await harness.recordRequest({
        sessionId,
        intentId: `intent-${Date.now()}`,
        request: { action: 'test' },
        response: { result: 'success' },
        timestamp: Date.now()
      });
    });

    // Record batch requests
    runner.add('record-batch-10-requests', async () => {
      const requests = Array(10).fill(null).map((_, i) => ({
        sessionId,
        intentId: `intent-${Date.now()}-${i}`,
        request: { action: 'test', index: i },
        response: { result: 'success' },
        timestamp: Date.now()
      }));

      for (const req of requests) {
        await harness.recordRequest(req);
      }
    });

    // Replay single request
    runner.add('replay-single-request', async () => {
      const recorded = await harness.getRecordedRequests(sessionId, 1);
      if (recorded.length > 0) {
        return await harness.replayRequest(recorded[0]);
      }
    });

    // Replay batch
    runner.add('replay-batch-10-requests', async () => {
      const recorded = await harness.getRecordedRequests(sessionId, 10);
      const results = [];
      
      for (const req of recorded) {
        results.push(await harness.replayRequest(req));
      }
      
      return results;
    });

    const results = await runner.run();
    
    // Cleanup
    await harness.endSession(sessionId);
    
    return results;
  }
}

/**
 * Full Pipeline Benchmark
 */
class FullPipelineBenchmark {
  static async runAll() {
    console.log('\n' + '='.repeat(70));
    console.log('FULL PIPELINE BENCHMARK');
    console.log('='.repeat(70));

    const runner = new BenchmarkRunner('Full Pipeline');
    const { validateIntent } = require('../bridge/schema_validator');
    const { Signer } = require('../bridge/signer');
    const { EventStore } = require('../bridge/event_store');
    
    const signer = new Signer('pipeline-key', Buffer.from('test-secret-key-32-bytes-long!!'));
    const store = new EventStore();

    // Complete intent processing pipeline
    runner.add('full-intent-pipeline', async () => {
      // 1. Create intent
      const intent = {
        version: '1.0',
        type: 'intent.envelope',
        intentId: `intent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        channelId: 'api',
        tool: 'web_search',
        parameters: { query: 'benchmark' },
        riskLevel: 'low',
        description: 'Pipeline benchmark',
        timestamp: new Date().toISOString()
      };

      // 2. Validate schema
      const validation = validateIntent(intent);
      if (!validation.valid) {
        throw new Error('Validation failed');
      }

      // 3. Sign intent
      const signature = await signer.sign(intent);

      // 4. Store event
      await store.append({
        type: 'intent.signed',
        intentId: intent.intentId,
        signature,
        timestamp: Date.now()
      });

      // 5. Verify signature
      const verified = await signer.verify(intent, signature);
      
      return { validated: true, signed: true, stored: true, verified };
    });

    const results = await runner.run();
    return results;
  }
}

/**
 * Run all benchmarks
 */
async function runAllBenchmarks() {
  console.log('\n' + '█'.repeat(70));
  console.log('AUREUS SENTINEL - COMPREHENSIVE BENCHMARK SUITE');
  console.log('█'.repeat(70));

  const allResults = {};

  try {
    allResults.schemaValidation = await SchemaValidationBenchmarks.runAll();
    allResults.signatures = await SignatureBenchmarks.runAll();
    allResults.eventStore = await EventStoreBenchmarks.runAll();
    allResults.replay = await ReplayBenchmarks.runAll();
    allResults.fullPipeline = await FullPipelineBenchmark.runAll();

    // Summary
    console.log('\n' + '█'.repeat(70));
    console.log('BENCHMARK SUMMARY');
    console.log('█'.repeat(70));

    let totalBenchmarks = 0;
    let fastestOperation = { name: '', opsPerSec: 0 };
    let slowestOperation = { name: '', opsPerSec: Infinity };

    Object.entries(allResults).forEach(([category, result]) => {
      console.log(`\n${category}:`);
      
      result.fastestResults.forEach(item => {
        totalBenchmarks++;
        console.log(`  ${item.name}: ${item.opsPerSec.toLocaleString()} ops/sec`);
        
        if (item.opsPerSec > fastestOperation.opsPerSec) {
          fastestOperation = { name: `${category}.${item.name}`, opsPerSec: item.opsPerSec };
        }
        if (item.opsPerSec < slowestOperation.opsPerSec) {
          slowestOperation = { name: `${category}.${item.name}`, opsPerSec: item.opsPerSec };
        }
      });
    });

    console.log(`\n📊 Total Benchmarks: ${totalBenchmarks}`);
    console.log(`🚀 Fastest Operation: ${fastestOperation.name} (${fastestOperation.opsPerSec.toLocaleString()} ops/sec)`);
    console.log(`🐌 Slowest Operation: ${slowestOperation.name} (${slowestOperation.opsPerSec.toLocaleString()} ops/sec)`);
    console.log('█'.repeat(70) + '\n');

    return allResults;
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    throw error;
  }
}

module.exports = {
  SchemaValidationBenchmarks,
  SignatureBenchmarks,
  EventStoreBenchmarks,
  ReplayBenchmarks,
  FullPipelineBenchmark,
  runAllBenchmarks
};
