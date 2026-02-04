/**
 * k6 Load Test: Spike Load (10,000 RPS)
 * 
 * Tests system behavior under sudden traffic spikes
 * 
 * Usage:
 *   k6 run k6-spike-load.js
 * 
 * Week 10: Performance & Load Testing
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Custom metrics
const spikeSurvival = new Rate('spike_survival');
const circuitBreakerTrips = new Counter('circuit_breaker_trips');
const recoveryTime = new Trend('recovery_time');

// Test configuration
export const options = {
  stages: [
    { duration: '10s', target: 100 },    // Baseline: 100 VUs
    { duration: '5s', target: 10000 },   // Spike: 10,000 VUs
    { duration: '10s', target: 100 },    // Recovery: back to 100
    { duration: '5s', target: 10000 },   // Second spike
    { duration: '10s', target: 100 },    // Final recovery
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000', 'p(99)<3000'],  // More lenient during spikes
    'http_req_failed': ['rate<0.05'],                    // Up to 5% errors during spike
    'spike_survival': ['rate>0.95'],                     // 95% of requests should succeed
  },
};

// Test data
function generateIntent() {
  const timestamp = Date.now();
  return {
    version: '1.0',
    type: 'intent.envelope',
    intentId: `spike-${timestamp}-${Math.random().toString(36).slice(2)}`,
    channelId: 'api',
    tool: 'data_fetch',
    parameters: { source: 'external_api' },
    riskLevel: 'medium',
    description: 'Spike test intent',
    timestamp: new Date().toISOString()
  };
}

// VU script
export default function () {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
  const recoveryStart = Date.now();
  
  // Submit intent
  const intent = generateIntent();
  const response = http.post(
    `${BASE_URL}/api/v1/intents`,
    JSON.stringify(intent),
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '3s',  // Shorter timeout during spike
    }
  );

  const survived = check(response, {
    'spike: request succeeded': (r) => r.status === 200 || r.status === 201,
    'spike: no timeout': (r) => r.status !== 0,
    'spike: response time < 3s': (r) => r.timings.duration < 3000,
  });

  spikeSurvival.add(survived);

  // Detect circuit breaker
  if (response.status === 503 || response.status === 429) {
    circuitBreakerTrips.add(1);
    
    const recoveryDuration = Date.now() - recoveryStart;
    recoveryTime.add(recoveryDuration);
  }

  // Minimal think time during spike
  sleep(0.01);
}

// Setup
export function setup() {
  console.log('⚡ Starting Spike Load Test (10,000 RPS)');
  console.log('🎯 Testing: Circuit breakers, graceful degradation');
  console.log('📈 Pattern: Baseline → Spike → Recovery (x2)');
  return { startTime: Date.now() };
}

// Teardown
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`✅ Spike test completed in ${duration.toFixed(1)}s`);
}
