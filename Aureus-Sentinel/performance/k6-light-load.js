/**
 * k6 Load Test: Light Load (1,000 RPS)
 * 
 * Baseline performance test for Aureus Sentinel
 * 
 * Usage:
 *   k6 run k6-light-load.js
 * 
 * Week 10: Performance & Load Testing
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const intentValidations = new Counter('intent_validations');
const signatureVerifications = new Counter('signature_verifications');
const intentLatency = new Trend('intent_latency');

// Test configuration
export const options = {
  stages: [
    { duration: '10s', target: 100 },    // Ramp-up to 100 VUs
    { duration: '60s', target: 1000 },   // Sustain 1,000 VUs (≈1k RPS)
    { duration: '10s', target: 0 },      // Ramp-down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200', 'p(99)<500'],  // 95% < 200ms, 99% < 500ms
    'http_req_failed': ['rate<0.01'],                  // Error rate < 1%
    'intent_latency': ['p(95)<150'],                   // Intent validation < 150ms (p95)
  },
};

// Test data generator
function generateIntent() {
  const timestamp = Date.now();
  return {
    version: '1.0',
    type: 'intent.envelope',
    intentId: `intent-${timestamp}-${Math.random().toString(36).slice(2)}`,
    channelId: 'api',
    tool: 'web_search',
    parameters: {
      query: `test query ${timestamp}`,
      maxResults: 10
    },
    riskLevel: 'low',
    description: 'Load test intent',
    timestamp: new Date().toISOString()
  };
}

// VU (Virtual User) script
export default function () {
  const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
  
  // Test 1: Intent submission
  const intent = generateIntent();
  const intentStart = Date.now();
  
  const intentResponse = http.post(
    `${BASE_URL}/api/v1/intents`,
    JSON.stringify(intent),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const intentDuration = Date.now() - intentStart;
  intentLatency.add(intentDuration);

  check(intentResponse, {
    'intent: status 200': (r) => r.status === 200 || r.status === 201,
    'intent: has intentId': (r) => JSON.parse(r.body).intentId !== undefined,
    'intent: latency < 500ms': () => intentDuration < 500,
  }) && intentValidations.add(1);

  // Think time between requests
  sleep(Math.random() * 0.5 + 0.5);  // 0.5-1.0 seconds

  // Test 2: Signature verification (every 3rd request)
  if (__ITER % 3 === 0) {
    const verifyPayload = {
      intentId: intent.intentId,
      signature: 'test_signature_here',
      timestamp: Date.now()
    };

    const verifyResponse = http.post(
      `${BASE_URL}/api/v1/verify`,
      JSON.stringify(verifyPayload),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    check(verifyResponse, {
      'verify: status 200': (r) => r.status === 200,
      'verify: has result': (r) => JSON.parse(r.body).verified !== undefined,
    }) && signatureVerifications.add(1);
  }

  sleep(0.1);  // Minimal think time
}

// Setup function (runs once)
export function setup() {
  console.log('🚀 Starting Light Load Test (1,000 RPS)');
  console.log('📊 Target: 95th percentile < 200ms, 99th < 500ms');
  console.log('⏱️  Duration: 80 seconds');
  return { startTime: Date.now() };
}

// Teardown function (runs once)
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`✅ Test completed in ${duration.toFixed(1)}s`);
}
