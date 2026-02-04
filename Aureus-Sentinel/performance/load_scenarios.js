/**
 * Load Testing Scenarios
 * 
 * Pre-defined load test scenarios for Aureus Sentinel:
 * - Smoke test: Low load validation
 * - Load test: Standard load (1k RPS)
 * - Stress test: High load (10k RPS)
 * - Spike test: Sudden traffic spikes
 * - Soak test: Extended duration
 * - Breakpoint test: Find system limits
 * 
 * Week 10: Performance & Load Testing
 */

const { LoadScenario, PerformanceTest } = require('./performance_framework');

/**
 * Smoke Test: Verify system works under minimal load
 */
class SmokeTest {
  static create() {
    return new LoadScenario('Smoke Test')
      .addStage(30000, 10);   // 30s @ 10 RPS
  }

  static getDescription() {
    return {
      name: 'Smoke Test',
      purpose: 'Verify system works under minimal load',
      duration: '30 seconds',
      targetLoad: '10 RPS',
      expectedBehavior: 'All requests succeed, latency < 100ms'
    };
  }
}

/**
 * Load Test: Standard production load
 */
class LoadTest {
  static create() {
    return new LoadScenario('Load Test')
      .addStage(10000, 100)    // Ramp-up: 10s @ 100 RPS
      .addStage(60000, 1000)   // Sustain: 60s @ 1k RPS
      .addStage(10000, 100);   // Ramp-down: 10s @ 100 RPS
  }

  static getDescription() {
    return {
      name: 'Load Test',
      purpose: 'Validate system under normal production load',
      duration: '80 seconds (ramp-up, sustain, ramp-down)',
      targetLoad: '1,000 RPS sustained',
      expectedBehavior: 'p99 < 200ms, success rate > 99.9%'
    };
  }
}

/**
 * Stress Test: Push system beyond normal load
 */
class StressTest {
  static create() {
    return new LoadScenario('Stress Test')
      .addStage(10000, 1000)    // Warm-up: 10s @ 1k RPS
      .addStage(30000, 5000)    // Stress: 30s @ 5k RPS
      .addStage(30000, 10000)   // Peak: 30s @ 10k RPS
      .addStage(10000, 1000);   // Cool-down: 10s @ 1k RPS
  }

  static getDescription() {
    return {
      name: 'Stress Test',
      purpose: 'Test system behavior under extreme load',
      duration: '80 seconds (progressive load increase)',
      targetLoad: 'Up to 10,000 RPS',
      expectedBehavior: 'Graceful degradation, no cascading failures'
    };
  }
}

/**
 * Spike Test: Sudden traffic surge
 */
class SpikeTest {
  static create() {
    return new LoadScenario('Spike Test')
      .addStage(10000, 100)     // Baseline: 10s @ 100 RPS
      .addStage(5000, 5000)     // Spike: 5s @ 5k RPS
      .addStage(10000, 100)     // Recovery: 10s @ 100 RPS
      .addStage(5000, 5000)     // Second spike: 5s @ 5k RPS
      .addStage(10000, 100);    // Final recovery: 10s @ 100 RPS
  }

  static getDescription() {
    return {
      name: 'Spike Test',
      purpose: 'Validate system handles sudden traffic spikes',
      duration: '40 seconds (baseline-spike-recovery cycles)',
      targetLoad: 'Spikes to 5,000 RPS',
      expectedBehavior: 'Circuit breakers activate, system recovers quickly'
    };
  }
}

/**
 * Soak Test: Extended duration to find memory leaks
 */
class SoakTest {
  static create() {
    return new LoadScenario('Soak Test')
      .addStage(300000, 500);   // 5 minutes @ 500 RPS
  }

  static getDescription() {
    return {
      name: 'Soak Test',
      purpose: 'Find memory leaks and resource exhaustion over time',
      duration: '5 minutes',
      targetLoad: '500 RPS sustained',
      expectedBehavior: 'Stable memory usage, no degradation over time'
    };
  }
}

/**
 * Breakpoint Test: Find system limits
 */
class BreakpointTest {
  static create() {
    return new LoadScenario('Breakpoint Test')
      .addStage(20000, 1000)    // 20s @ 1k RPS
      .addStage(20000, 2000)    // 20s @ 2k RPS
      .addStage(20000, 5000)    // 20s @ 5k RPS
      .addStage(20000, 10000)   // 20s @ 10k RPS
      .addStage(20000, 20000);  // 20s @ 20k RPS
  }

  static getDescription() {
    return {
      name: 'Breakpoint Test',
      purpose: 'Find maximum system capacity',
      duration: '100 seconds (progressive load increase)',
      targetLoad: 'Up to 20,000 RPS',
      expectedBehavior: 'Identify point where system starts failing'
    };
  }
}

/**
 * Intent Submission Load Profile
 */
class IntentSubmissionLoad {
  static async testFunction(context) {
    const { validateIntent } = require('../bridge/schema_validator');
    
    const intent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: `123e4567-e89b-42d3-a456-${Date.now().toString().slice(-12)}`,
      channelId: 'web',
      tool: 'web_search',
      parameters: { query: 'test query' },
      riskLevel: 'low',
      description: 'Performance test intent',
      timestamp: new Date().toISOString()
    };

    // Validate intent
    const result = validateIntent(intent);
    
    if (!result.valid) {
      throw new Error('Validation failed');
    }

    return result;
  }
}

/**
 * Signature Verification Load Profile
 */
class SignatureVerificationLoad {
  static async testFunction(context) {
    const { Signer } = require('../bridge/signer');
    
    const signer = new Signer('test-key-id', Buffer.from('test-secret-key-32-bytes-long!!'));
    
    const payload = {
      intentId: `intent-${Date.now()}`,
      action: 'execute',
      timestamp: Date.now()
    };

    // Sign payload
    const signature = await signer.sign(payload);
    
    // Verify signature
    const isValid = await signer.verify(payload, signature);
    
    if (!isValid) {
      throw new Error('Signature verification failed');
    }

    return { signature, verified: isValid };
  }
}

/**
 * Event Store Load Profile
 */
class EventStoreLoad {
  static async testFunction(context) {
    const { EventStore } = require('../bridge/event_store');
    
    const store = new EventStore();
    
    const event = {
      type: 'intent.submitted',
      intentId: `intent-${Date.now()}-${context.workerId}`,
      data: { test: true },
      timestamp: Date.now()
    };

    // Append event
    await store.append(event);

    // Read recent events
    const events = await store.getRecentEvents(10);
    
    if (events.length === 0) {
      throw new Error('Event store read failed');
    }

    return { eventCount: events.length };
  }
}

/**
 * Full Pipeline Load Profile
 */
class FullPipelineLoad {
  static async testFunction(context) {
    const { validateIntent } = require('../bridge/schema_validator');
    const { Signer } = require('../bridge/signer');
    const { EventStore } = require('../bridge/event_store');
    
    // 1. Validate intent
    const intent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: `123e4567-e89b-42d3-a456-${Date.now().toString().slice(-12)}`,
      channelId: 'web',
      tool: 'web_search',
      parameters: { query: 'test query' },
      riskLevel: 'low',
      description: 'Full pipeline test',
      timestamp: new Date().toISOString()
    };

    const validation = validateIntent(intent);
    if (!validation.valid) {
      throw new Error('Validation failed');
    }

    // 2. Sign intent
    const signer = new Signer('test-key', Buffer.from('test-secret-key-32-bytes-long!!'));
    const signature = await signer.sign(intent);

    // 3. Store event
    const store = new EventStore();
    await store.append({
      type: 'intent.signed',
      intentId: intent.intentId,
      signature,
      timestamp: Date.now()
    });

    return { validated: true, signed: true, stored: true };
  }
}

/**
 * Scenario registry
 */
const LoadTestScenarios = {
  smoke: SmokeTest,
  load: LoadTest,
  stress: StressTest,
  spike: SpikeTest,
  soak: SoakTest,
  breakpoint: BreakpointTest
};

const LoadProfiles = {
  intentSubmission: IntentSubmissionLoad,
  signatureVerification: SignatureVerificationLoad,
  eventStore: EventStoreLoad,
  fullPipeline: FullPipelineLoad
};

/**
 * Load test executor
 */
class LoadTestExecutor {
  static async runScenario(scenarioName, profileName) {
    const ScenarioClass = LoadTestScenarios[scenarioName];
    const ProfileClass = LoadProfiles[profileName];

    if (!ScenarioClass) {
      throw new Error(`Unknown scenario: ${scenarioName}`);
    }

    if (!ProfileClass) {
      throw new Error(`Unknown profile: ${profileName}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log(`Load Test: ${scenarioName} x ${profileName}`);
    console.log('='.repeat(70));

    const description = ScenarioClass.getDescription();
    console.log(`\n📝 Test Description:`);
    console.log(`  Name:     ${description.name}`);
    console.log(`  Purpose:  ${description.purpose}`);
    console.log(`  Duration: ${description.duration}`);
    console.log(`  Load:     ${description.targetLoad}`);
    console.log(`  Expected: ${description.expectedBehavior}`);

    const scenario = ScenarioClass.create();
    const results = await scenario.execute(ProfileClass.testFunction);

    return results;
  }

  static async runAllScenarios(profileName = 'fullPipeline') {
    console.log('\n' + '█'.repeat(70));
    console.log('COMPREHENSIVE LOAD TEST SUITE');
    console.log('█'.repeat(70));

    const results = {};

    for (const scenarioName of ['smoke', 'load', 'stress']) {
      try {
        results[scenarioName] = await this.runScenario(scenarioName, profileName);
        
        // Cooldown between tests
        console.log('\n⏸️  Cooldown period (5 seconds)...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`\n❌ ${scenarioName} failed:`, error.message);
        results[scenarioName] = { error: error.message };
      }
    }

    return results;
  }
}

module.exports = {
  LoadTestScenarios,
  LoadProfiles,
  LoadTestExecutor,
  SmokeTest,
  LoadTest,
  StressTest,
  SpikeTest,
  SoakTest,
  BreakpointTest
};
