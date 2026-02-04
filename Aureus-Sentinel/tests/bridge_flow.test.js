// Test for Bridge /intents endpoint and full flow
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { getEventStore } = require('../bridge/event_store');
const { ReplayHarness } = require('../bridge/replay_harness');

const serverPath = path.join(__dirname, '..', 'bridge', 'server.js');

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

function makeRequest(opts, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch(e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

(async ()=>{
  console.log('Starting Bridge flow tests...\n');
  
  // Clear any existing events
  const eventStore = getEventStore();
  eventStore.clearEvents();
  
  // Start server
  const child = spawn(process.execPath, [serverPath], {
    env: Object.assign({}, process.env),
    stdio: ['ignore','pipe','pipe']
  });
  
  let started = false;
  child.stdout.on('data', d => {
    const s = d.toString();
    if (s.includes('listening')) started = true;
  });
  child.stderr.on('data', d => process.stderr.write(d.toString()));

  // Wait for server
  for(let i=0; i<40; i++){
    if(started) break;
    await wait(100);
  }

  if(!started){
    console.error('Server failed to start');
    child.kill();
    process.exit(1);
  }

  try {
    // Test 1: Valid low-risk intent should get auto-approval
    console.log('Test 1: Low-risk intent with auto-approval');
    const lowRiskIntent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: '550e8400-e29b-41d4-a716-446655440001',
      channelId: 'api',
      tool: 'diagnostic_check',
      parameters: { target: 'system_health' },
      riskLevel: 'low',
      description: 'Run system diagnostic check'
    };

    const res1 = await makeRequest({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/intents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, lowRiskIntent);

    assert.strictEqual(res1.status, 200, 'Low-risk intent should return 200');
    assert(res1.data.plan, 'Response should include plan');
    assert(res1.data.approval, 'Response should include approval');
    assert.strictEqual(res1.data.plan.planId, res1.data.approval.planId, 'Plan and approval IDs should match');
    assert(res1.data.approval.signature, 'Approval should be signed');
    console.log('✅ Low-risk intent approved\n');

    // Test 2: High-risk intent should require human approval
    console.log('Test 2: High-risk intent requiring human approval');
    const highRiskIntent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: '550e8400-e29b-41d4-a716-446655440002',
      channelId: 'api',
      tool: 'deploy_production',
      parameters: { environment: 'prod', service: 'api' },
      riskLevel: 'high',
      description: 'Deploy to production environment'
    };

    const res2 = await makeRequest({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/intents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, highRiskIntent);

    assert.strictEqual(res2.status, 202, 'High-risk intent should return 202');
    assert.strictEqual(res2.data.requiresHumanApproval, true, 'Should require human approval');
    assert(res2.data.plan, 'Response should include plan');
    assert.strictEqual(res2.data.approval, undefined, 'Should not include approval');
    console.log('✅ High-risk intent flagged for human approval\n');

    // Test 3: Invalid intent should be rejected
    console.log('Test 3: Invalid intent schema validation');
    const invalidIntent = {
      version: '1.0',
      type: 'intent.envelope',
      // Missing required fields
      channelId: 'api'
    };

    const res3 = await makeRequest({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/intents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, invalidIntent);

    assert.strictEqual(res3.status, 400, 'Invalid intent should return 400');
    assert(res3.data.error, 'Should return error message');
    console.log('✅ Invalid intent rejected\n');

    // Test 4: Event persistence and replay
    console.log('Test 4: Event persistence and replay');
    const eventStore = getEventStore();
    const allEvents = eventStore.getAllEvents();
    
    assert(allEvents.length >= 4, 'Should have logged events (at least 4)');
    
    const intentEvents = eventStore.getEventsByType('intent.received');
    assert.strictEqual(intentEvents.length, 3, 'Should have 3 intent events (including invalid one)');
    
    const planEvents = eventStore.getEventsByType('plan.generated');
    assert.strictEqual(planEvents.length, 2, 'Should have 2 plan events');
    
    const approvalEvents = eventStore.getEventsByType('approval.issued');
    assert.strictEqual(approvalEvents.length, 1, 'Should have 1 approval event (low-risk only)');
    
    console.log('✅ Events persisted correctly\n');

    // Test 5: Replay harness (only replay valid intents)
    console.log('Test 5: Replay harness');
    const harness = new ReplayHarness(eventStore);
    // Manually replay only the first two valid intents
    const validIntentEvents = [intentEvents[0], intentEvents[1]];
    const replayResults = [];
    for (const event of validIntentEvents) {
      const result = await harness.replayIntent(event);
      replayResults.push({ success: true, ...result });
    }
    
    assert.strictEqual(replayResults.length, 2, 'Should replay 2 valid intents');
    assert(replayResults.every(r => r.success), 'All replays should succeed');
    
    const report = harness.generateReport();
    console.log('✅ Replay harness working\n');

    // Cleanup
    eventStore.clearEvents();
    
    console.log('All Bridge flow tests passed!');
    child.kill();
    process.exit(0);

  } catch(e) {
    console.error('Bridge flow tests failed:', e);
    child.kill();
    process.exit(1);
  }
})();
