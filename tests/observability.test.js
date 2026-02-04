/**
 * Observability Integration Tests
 * 
 * Tests for audit logging and tracing infrastructure.
 */

const assert = require('assert');
const fs = require('fs').promises;
const path = require('path');
const { StructuredAuditLogger, AuditEventType, Severity } = require('../Aureus-Sentinel/bridge/observability/audit_logger');
const { TelemetryManager } = require('../Aureus-Sentinel/bridge/observability/tracing');
const { MemoryStore } = require('../Aureus-Sentinel/bridge/memory/memory_store');
const { setAuditLogger, generateActionPlan } = require('../Aureus-Sentinel/bridge/aureus_stub');

// Test configuration
const TEST_AUDIT_DIR = './.test-audit-logs';
const TEST_MEMORY_DIR = './.test-memory-obs';

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Clean up helper
async function cleanup() {
  try {
    await fs.rm(TEST_AUDIT_DIR, { recursive: true, force: true });
    await fs.rm(TEST_MEMORY_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors
  }
}

/**
 * Test 1: Audit logger initialization and basic logging
 */
async function testAuditLoggerBasics() {
  console.log('\n=== Test 1: Audit Logger Basics ===');
  
  await cleanup();
  
  const logger = new StructuredAuditLogger({
    logDir: TEST_AUDIT_DIR,
    enableConsole: false,
    enableFile: true
  });
  
  await logger.init();
  
  // Log some events
  await logger.logIntentReceived('intent-123', 'user-alice', 'web_search', 'low', 'telegram');
  await logger.logRiskAssessed('intent-123', 'medium', 'low', 0.85, 'Trusted user, downgraded');
  await logger.logApprovalGranted('approval-456', 'plan-789', 'user-alice', 'web_search', 'low', false);
  
  // Wait for file writes
  await sleep(100);
  
  // Check that log directory exists
  const files = await fs.readdir(TEST_AUDIT_DIR);
  assert(files.length > 0, 'Expected audit log files to be created');
  console.log(`✅ Created ${files.length} audit log file(s)`);
  
  // Read and verify log entries
  const logFile = path.join(TEST_AUDIT_DIR, files[0]);
  const content = await fs.readFile(logFile, 'utf8');
  const lines = content.trim().split('\n').filter(line => line);
  
  assert(lines.length >= 3, `Expected at least 3 log entries, got ${lines.length}`);
  
  const entries = lines.map(line => JSON.parse(line));
  
  // Find specific entries (skip init log)
  const intentEntry = entries.find(e => e.eventType === AuditEventType.INTENT_RECEIVED);
  const riskEntry = entries.find(e => e.eventType === AuditEventType.RISK_ASSESSED);
  const approvalEntry = entries.find(e => e.eventType === AuditEventType.APPROVAL_GRANTED);
  
  assert(intentEntry, 'Should have intent received entry');
  assert(riskEntry, 'Should have risk assessed entry');
  assert(approvalEntry, 'Should have approval granted entry');
  
  console.log('✅ All log entries validated');
}

/**
 * Test 2: Hash chain integrity
 */
async function testHashChainIntegrity() {
  console.log('\n=== Test 2: Hash Chain Integrity ===');
  
  await cleanup();
  
  const logger = new StructuredAuditLogger({
    logDir: TEST_AUDIT_DIR,
    enableConsole: false,
    enableFile: true
  });
  
  await logger.init();
  
  // Log multiple events to build chain
  for (let i = 0; i < 5; i++) {
    await logger.log(Severity.INFO, AuditEventType.MEMORY_STORED, {
      message: `Test entry ${i}`,
      executionId: `exec-${i}`
    });
    await sleep(10); // Small delay to ensure different timestamps
  }
  
  await sleep(100);
  
  // Verify chain integrity
  const integrity = await logger.verifyChainIntegrity();
  
  console.log(`   Integrity result:`, integrity);
  
  assert(integrity.valid === true, `Hash chain should be valid: ${integrity.message}`);
  assert(integrity.totalEntries >= 5, `Expected at least 5 entries, got ${integrity.totalEntries}`);
  
  console.log('✅ Hash chain integrity verified');
  console.log(`   Total entries: ${integrity.totalEntries}`);
}

/**
 * Test 3: Log querying and filtering
 */
async function testLogQuerying() {
  console.log('\n=== Test 3: Log Querying ===');
  
  await cleanup();
  
  const logger = new StructuredAuditLogger({
    logDir: TEST_AUDIT_DIR,
    enableConsole: false,
    enableFile: true
  });
  
  await logger.init();
  
  // Log events with different attributes
  await logger.logIntentReceived('intent-1', 'user-alice', 'web_search', 'low', 'telegram');
  await logger.logIntentReceived('intent-2', 'user-bob', 'code_executor', 'high', 'discord');
  await logger.logApprovalGranted('approval-1', 'plan-1', 'user-alice', 'web_search', 'low', false);
  await logger.logApprovalDenied('plan-2', 'user-bob', 'code_executor', 'high', 'High risk tool');
  
  await sleep(100);
  
  // Query all logs (excluding config change init logs)
  const allLogs = await logger.query();
  const nonConfigLogs = allLogs.filter(l => l.eventType !== AuditEventType.CONFIG_CHANGED);
  assert(nonConfigLogs.length === 4, `Expected 4 non-config logs, got ${nonConfigLogs.length}`);
  
  // Query by event type
  const intentLogs = await logger.query({ eventType: AuditEventType.INTENT_RECEIVED });
  assert(intentLogs.length === 2, `Expected 2 intent logs, got ${intentLogs.length}`);
  
  // Query by user
  const aliceLogs = await logger.query({ userId: 'user-alice' });
  assert(aliceLogs.length === 2, `Expected 2 logs for Alice, got ${aliceLogs.length}`);
  
  // Query by severity
  const warnLogs = await logger.query({ severity: Severity.WARN });
  assert(warnLogs.length === 1, `Expected 1 warning log, got ${warnLogs.length}`);
  
  console.log('✅ Log querying validated');
  console.log(`   Total logs: ${allLogs.length}`);
  console.log(`   Non-config logs: ${nonConfigLogs.length}`);
  console.log(`   Intent logs: ${intentLogs.length}`);
  console.log(`   Alice logs: ${aliceLogs.length}`);
  console.log(`   Warning logs: ${warnLogs.length}`);
}

/**
 * Test 4: Telemetry span creation
 */
async function testTelemetrySpans() {
  console.log('\n=== Test 4: Telemetry Spans ===');
  
  // Create telemetry manager (disabled for testing to avoid OTLP endpoint)
  const telemetry = new TelemetryManager({
    serviceName: 'test-service',
    enabled: false // Disable actual export for testing
  });
  
  await telemetry.init();
  
  // Test basic span creation
  const result = await telemetry.traceOperation('test.operation', {
    'test.attribute': 'value'
  }, async (span) => {
    // Simulate some work
    await sleep(10);
    return { success: true };
  });
  
  assert(result.success === true, 'Traced operation should return result');
  
  console.log('✅ Telemetry spans validated');
}

/**
 * Test 5: Memory store with audit logging
 */
async function testMemoryStoreAuditLogging() {
  console.log('\n=== Test 5: Memory Store Audit Logging ===');
  
  await cleanup();
  
  const logger = new StructuredAuditLogger({
    logDir: TEST_AUDIT_DIR,
    enableConsole: false,
    enableFile: true
  });
  
  await logger.init();
  
  const memoryStore = new MemoryStore({
    storePath: TEST_MEMORY_DIR,
    auditLogger: logger
  });
  
  await memoryStore.init();
  
  // Store context with audit logging
  const context = {
    version: '1.0',
    state: {
      userId: 'user-charlie',
      channel: 'telegram'
    }
  };
  
  const contextId = await memoryStore.storeContext(context);
  assert(contextId, 'Context should be stored');
  
  // Store execution with audit logging
  const execution = {
    intent: { tool: 'web_search', risk: 'low' },
    approval: { approved: true },
    result: { status: 'success' },
    userId: 'user-charlie',
    channel: 'telegram'
  };
  
  const executionId = await memoryStore.storeExecution(execution);
  assert(executionId, 'Execution should be stored');
  
  await sleep(100);
  
  // Verify audit logs were created
  const logs = await logger.query({ eventType: AuditEventType.MEMORY_STORED });
  assert(logs.length === 2, `Expected 2 memory store logs, got ${logs.length}`);
  
  // Verify log content
  const contextLog = logs.find(l => l.type === 'context');
  const executionLog = logs.find(l => l.type === 'execution');
  
  assert(contextLog, 'Context storage should be logged');
  assert(executionLog, 'Execution storage should be logged');
  assert(executionLog.userId === 'user-charlie', 'Execution log should contain user ID');
  assert(executionLog.tool === 'web_search', 'Execution log should contain tool name');
  
  console.log('✅ Memory store audit logging validated');
  console.log(`   Context ID: ${contextId}`);
  console.log(`   Execution ID: ${executionId}`);
}

/**
 * Test 6: Decision engine with audit logging
 */
async function testDecisionEngineAuditLogging() {
  console.log('\n=== Test 6: Decision Engine Audit Logging ===');
  
  await cleanup();
  
  const logger = new StructuredAuditLogger({
    logDir: TEST_AUDIT_DIR,
    enableConsole: false,
    enableFile: true
  });
  
  await logger.init();
  setAuditLogger(logger);
  
  // Create intent with enriched context
  const intentEnvelope = {
    id: 'intent-999',
    intentId: 'intent-999',
    tool: 'web_search',
    intent: {
      tool: 'web_search',
      risk: 'medium',
      params: { query: 'test' }
    },
    context: {
      state: {
        userId: 'user-dave',
        channel: 'discord'
      }
    }
  };
  
  const enrichedContext = {
    contextId: 'context-111',
    riskProfile: {
      trustScore: 0.9,
      totalExecutions: 20
    },
    history: {
      totalExecutions: 20
    },
    patterns: {
      suspiciousActivity: false,
      indicators: []
    }
  };
  
  // Generate plan (this should trigger audit logging)
  const plan = await generateActionPlan(intentEnvelope, enrichedContext);
  assert(plan, 'Plan should be generated');
  assert(plan.planId, 'Plan should have ID');
  
  await sleep(100);
  
  // Verify audit logs
  const logs = await logger.query();
  const riskLog = logs.find(l => l.eventType === AuditEventType.RISK_ASSESSED);
  
  assert(riskLog, 'Risk assessment should be logged');
  assert(riskLog.intentId === 'intent-999', 'Risk log should contain intent ID');
  assert(riskLog.baseRisk === 'medium', 'Risk log should contain base risk');
  assert(riskLog.trustScore === 0.9, 'Risk log should contain trust score');
  
  console.log('✅ Decision engine audit logging validated');
  console.log(`   Plan ID: ${plan.planId}`);
  console.log(`   Risk adjusted: ${riskLog.baseRisk} → ${riskLog.adjustedRisk}`);
}

/**
 * Test 7: CEF format conversion
 */
async function testCEFFormat() {
  console.log('\n=== Test 7: CEF Format ===');
  
  const logger = new StructuredAuditLogger({
    logDir: TEST_AUDIT_DIR,
    enableConsole: false,
    enableFile: true
  });
  
  await logger.init();
  
  const entry = {
    severity: Severity.ERROR,
    eventType: AuditEventType.SIGNATURE_FAILED,
    message: 'Signature verification failed',
    userId: 'user-eve',
    tool: 'code_executor',
    risk: 'high',
    approved: false
  };
  
  const cef = logger.toCEF(entry);
  
  assert(cef.startsWith('CEF:'), 'CEF string should start with CEF:');
  assert(cef.includes('Aureus'), 'CEF should include vendor name');
  assert(cef.includes('Sentinel'), 'CEF should include product name');
  assert(cef.includes('signature.failed'), 'CEF should include event type');
  assert(cef.includes('suser=user-eve'), 'CEF should include user');
  assert(cef.includes('act=code_executor'), 'CEF should include tool/action');
  
  console.log('✅ CEF format validated');
  console.log(`   ${cef}`);
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🧪 Starting Observability Integration Tests...\n');
  
  try {
    await testAuditLoggerBasics();
    await sleep(200);
    
    await testHashChainIntegrity();
    await sleep(200);
    
    await testLogQuerying();
    await sleep(200);
    
    await testTelemetrySpans();
    await sleep(200);
    
    await testMemoryStoreAuditLogging();
    await sleep(200);
    
    await testDecisionEngineAuditLogging();
    await sleep(200);
    
    await testCEFFormat();
    
    // Final cleanup
    await cleanup();
    
    console.log('\n✅ All observability tests passed!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    await cleanup();
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
