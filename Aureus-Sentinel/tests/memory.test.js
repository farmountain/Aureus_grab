/**
 * Memory Integration Tests - Week 5
 * 
 * Tests for context engine, memory store, and history-based risk assessment
 */

const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');
const { MemoryStore } = require('../bridge/memory/memory_store');
const { ContextAggregator } = require('../bridge/memory/context_aggregator');

// Test memory store path
const TEST_MEMORY_PATH = './.test-memory';

// Cleanup helper
async function cleanup() {
  try {
    await fs.rm(TEST_MEMORY_PATH, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Helper to wait
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main test runner
(async function runTests() {
  console.log('=== Memory Integration Tests (Week 5) ===\n');
  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Memory Store Initialization
  console.log('[Test 1] Memory store initialization');
  try {
    await cleanup();
    await sleep(100);
    
    const store = new MemoryStore({ storePath: TEST_MEMORY_PATH });
    await store.init();
    
    const stats = await store.getStats();
    assert.strictEqual(stats.totalContexts, 0);
    assert.strictEqual(stats.totalExecutions, 0);
    assert.strictEqual(stats.totalUsers, 0);
    
    console.log('✅ PASS: Memory store initialized\n');
    passedTests++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failedTests++;
  } finally {
    await cleanup();
    await sleep(100);
  }

  // Test 2: Store and Retrieve Context
  console.log('[Test 2] Store and retrieve context snapshot');
  try {
    await cleanup();
    await sleep(100);
    
    const store = new MemoryStore({ storePath: TEST_MEMORY_PATH });
    const contextSnapshot = {
      contextId: 'test-context-123',
      version: '1.0',
      state: {
        channel: 'telegram',
        userId: 'user-456',
        userName: 'testuser'
      }
    };
    
    const contextId = await store.storeContext(contextSnapshot);
    assert.ok(contextId);
    
    const retrieved = await store.getContext(contextId);
    assert.strictEqual(retrieved.contextId, contextId);
    assert.strictEqual(retrieved.state.channel, 'telegram');
    assert.strictEqual(retrieved.state.userId, 'user-456');
    
    console.log('✅ PASS: Context stored and retrieved\n');
    passedTests++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failedTests++;
  } finally {
    await cleanup();
    await sleep(100);
  }

  // Test 3: Store and Retrieve Execution
  console.log('[Test 3] Store and retrieve execution record');
  try {
    await cleanup();
    await sleep(100);
    
    const store = new MemoryStore({ storePath: TEST_MEMORY_PATH });
    const execution = {
      executionId: 'exec-789',
      intent: { tool: 'web_search', risk: 'low' },
      approval: { approved: true },
      result: { status: 'success' },
      contextId: 'ctx-123',
      userId: 'user-456',
      channel: 'telegram'
    };
    
    const execId = await store.storeExecution(execution);
    assert.ok(execId);
    
    const retrieved = await store.getExecution(execId);
    assert.strictEqual(retrieved.intent.tool, 'web_search');
    assert.strictEqual(retrieved.approval.approved, true);
    assert.strictEqual(retrieved.userId, 'user-456');
    
    console.log('✅ PASS: Execution stored and retrieved\n');
    passedTests++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failedTests++;
  } finally {
    await cleanup();
    await sleep(100);
  }

  // Test 4: User History and Risk Profile
  console.log('[Test 4] User history and risk profile calculation');
  try {
    await cleanup();
    await sleep(100);
    
    const store = new MemoryStore({ storePath: TEST_MEMORY_PATH });
    const userId = 'test-user-001';
    
    // Store multiple executions for user
    const executions = [
      { intent: { tool: 'web_search', risk: 'low' }, approval: { approved: true }, userId, channel: 'telegram' },
      { intent: { tool: 'read_file', risk: 'low' }, approval: { approved: true }, userId, channel: 'telegram' },
      { intent: { tool: 'code_executor', risk: 'high' }, approval: { approved: false }, userId, channel: 'discord' },
      { intent: { tool: 'web_search', risk: 'low' }, approval: { approved: true }, userId, channel: 'telegram' }
    ];
    
    for (const exec of executions) {
      await store.storeExecution(exec);
    }
    
    // Get history
    const history = await store.getUserHistory(userId);
    assert.strictEqual(history.length, 4);
    
    // Get risk profile
    const profile = await store.getUserRiskProfile(userId);
    assert.strictEqual(profile.totalExecutions, 4);
    assert.strictEqual(profile.approvalRate, 0.75); // 3/4 approved
    assert.strictEqual(profile.riskDistribution.low, 3);
    assert.strictEqual(profile.riskDistribution.high, 1);
    assert.ok(profile.trustScore > 0.5); // Should be decent with mostly approvals
    
    console.log(`✅ PASS: User profile calculated (trust score: ${profile.trustScore.toFixed(2)})\n`);
    passedTests++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failedTests++;
  } finally {
    await cleanup();
    await sleep(100);
  }

  // Test 5: Context Aggregation
  console.log('[Test 5] Context aggregation with history');
  try {
    await cleanup();
    await sleep(100);
    
    const store = new MemoryStore({ storePath: TEST_MEMORY_PATH });
    const aggregator = new ContextAggregator(store);
    const userId = 'test-user-002';
    
    // Store some history
    await store.storeExecution({
      intent: { tool: 'web_search', risk: 'low' },
      approval: { approved: true },
      userId,
      channel: 'telegram'
    });
    
    // Generate enriched context
    const intentEnvelope = {
      id: 'intent-123',
      intent: { tool: 'read_file', risk: 'low' },
      context: {
        contextId: 'ctx-456',
        state: { userId, channel: 'telegram' }
      }
    };
    
    const enrichedContext = await aggregator.generateContextSnapshot(intentEnvelope);
    
    assert.ok(enrichedContext.contextId);
    assert.ok(enrichedContext.history);
    assert.strictEqual(enrichedContext.history.totalExecutions, 1);
    assert.ok(enrichedContext.riskProfile);
    assert.ok(enrichedContext.patterns);
    
    console.log('✅ PASS: Context enriched with history\n');
    passedTests++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failedTests++;
  } finally {
    await cleanup();
    await sleep(100);
  }

  // Test 6: Contextual Risk Adjustment
  console.log('[Test 6] Contextual risk adjustment');
  try {
    await cleanup();
    await sleep(100);
    
    const store = new MemoryStore({ storePath: TEST_MEMORY_PATH });
    const aggregator = new ContextAggregator(store);
    const userId = 'test-user-003';
    
    // Build trusted user profile (many successful low-risk executions)
    for (let i = 0; i < 20; i++) {
      await store.storeExecution({
        intent: { tool: 'web_search', risk: 'low' },
        approval: { approved: true },
        userId,
        channel: 'telegram'
      });
    }
    
    // Test risk adjustment for trusted user
    const adjustment = await aggregator.getContextualRiskAdjustment(userId, 'web_search', 'medium');
    
    assert.ok(adjustment);
    assert.strictEqual(adjustment.adjustedRisk, 'low'); // Should downgrade medium→low for trusted user
    assert.strictEqual(adjustment.adjustment, 'downgrade');
    
    console.log(`✅ PASS: Risk downgraded for trusted user (${adjustment.reason})\n`);
    passedTests++;
  } catch (error) {
    console.log(`❌ FAIL: ${error.message}\n`);
    failedTests++;
  } finally {
    await cleanup();
    await sleep(100);
  }

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Tests passed: ${passedTests}/6`);
  console.log(`Tests failed: ${failedTests}/6`);
  console.log('');
  if (failedTests === 0) {
    console.log('✅ All memory integration tests passed!');
    console.log('✅ Week 5 memory integration complete');
  } else {
    console.log('❌ Some tests failed');
  }

})();

