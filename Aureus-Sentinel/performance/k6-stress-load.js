/**
 * k6 Load Test: Stress Test (100,000 RPS)
 * 
 * Pushes system to and beyond its limits to find breaking point
 * 
 * Usage:
 *   k6 run k6-stress-load.js
 * 
 * Week 10: Performance & Load Testing
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const systemBreakpoint = new Trend('system_breakpoint');
const degradationMode = new Counter('degradation_mode');
const errorsByStage = new Counter('errors_by_stage');

// Test configuration
export const options = {
  stages: [
    { duration: '20s', target: 1000 },    // Stage 1: 1k VUs (baseline)
    { duration: '20s', target: 5000 },    // Stage 2: 5k VUs (moderate stress)
    { duration: '20s', target: 20000 },   // Stage 3: 20k VUs (high stress)
    { duration: '20s', target: 50000 },   // Stage 4: 50k VUs (extreme stress)
    { duration: '20s', target: 100000 },  // Stage 5: 100k VUs (breaking point)
  ],
  thresholds: {
    'http_req_duration': ['p(95)<5000'],   // Very lenient - we expect degradation
    'http_req_failed': ['rate<0.20'],      // Up to 20% errors acceptable at limits
  },
  // Executor configuration for high load
  scenarios: {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 1000 },
        { duration: '20s', target: 5000 },
        { duration: '20s', target: 20000 },
        { duration: '20s', target: 50000 },
        { duration: '20s', target: 100000 },
      ],
      gracefulRampDown: '10s',
    },
  },
};

// Test data
function generateIntent() {
  return {
    version: '1.0',
    type: 'intent.envelope',
    intentId: `stress-${Date.now()}-${__VU}-${__ITER}`,
    channelId: 'api',
    tool: 'compute_task',
    parameters: { complexity: 'high' },
    riskLevel: 'high',
    description: 'Stress test intent',
    timestamp: new Date().toISOString()
  };
}

// Track which stage we're in
function getCurrentStage() {
  const elapsed = Date.now() / 1000;
  if (elapsed < 20) return 1;
  if (elapsed < 40) return 2;
  if (elapsed < 60) return 3;
  if (elapsed < 80) return 4;
  return 5;
}

// VU script
export default function () {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
  const stage = getCurrentStage();
  
  const intent = generateIntent();
  const startTime = Date.now();
  
  const response = http.post(
    `${BASE_URL}/api/v1/intents`,
    JSON.stringify(intent),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '10s',
    }
  );

  const duration = Date.now() - startTime;

  const success = check(response, {
    'status is 2xx or 503': (r) => (r.status >= 200 && r.status < 300) || r.status === 503,
    'response received': (r) => r.body !== null && r.body !== undefined,
  });

  if (!success) {
    errorsByStage.add(1, { stage: `stage_${stage}` });
  }

  // Track system breakpoint
  if (response.status === 503 || response.status === 500) {
    systemBreakpoint.add(__VU);  // Record VU count at failure
    degradationMode.add(1);
  }

  // Detect degradation modes
  if (response.headers['X-Degradation-Mode']) {
    console.log(`⚠️  Degradation mode active: ${response.headers['X-Degradation-Mode']}`);
  }

  // No sleep - maximum stress
}

// Setup
export function setup() {
  console.log('🔥 Starting Stress Test (100,000 RPS target)');
  console.log('⚠️  WARNING: This will push the system to its limits');
  console.log('📊 Stages: 1k → 5k → 20k → 50k → 100k VUs');
  console.log('🎯 Goal: Find system breaking point');
  
  // Health check before stress test
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
  const healthResponse = http.get(`${BASE_URL}/health`);
  
  if (healthResponse.status !== 200) {
    throw new Error('System not healthy before stress test');
  }
  
  return { 
    startTime: Date.now(),
    initialHealth: 'healthy'
  };
}

// Teardown
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n${'='.repeat(70)}`);
  console.log('STRESS TEST COMPLETE');
  console.log('='.repeat(70));
  console.log(`⏱️  Total duration: ${duration.toFixed(1)}s`);
  console.log('📊 Review metrics to find system breaking point');
  console.log('🔍 Check: error_rate, degradation events, latency trends');
}
