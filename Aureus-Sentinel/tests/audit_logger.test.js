// Test for tamper-evident audit logger
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { AuditLogger } = require('../bridge/audit_logger');

const testAuditPath = path.join(__dirname, '..', '.test_audit');

console.log('Testing tamper-evident audit logger...\n');

// Clean up test directory
if (fs.existsSync(testAuditPath)) {
  fs.rmSync(testAuditPath, { recursive: true });
}

// Test 1: Create audit logger and log entries
console.log('Test 1: Log audit entries with hash chain');
const logger = new AuditLogger(testAuditPath);

const entry1 = logger.logIntentReceived({
  intentId: '550e8400-e29b-41d4-a716-446655440001',
  tool: 'test_tool',
  riskLevel: 'low',
  channelId: 'api'
});

assert(entry1.hash, 'Entry should have hash');
assert.strictEqual(entry1.sequence, 1, 'First entry should be sequence 1');
assert.strictEqual(entry1.previousHash, '0000000000000000000000000000000000000000000000000000000000000000', 'First entry should reference genesis hash');
console.log('✅ First entry logged with genesis hash\n');

// Test 2: Verify hash chain linkage
console.log('Test 2: Verify hash chain linkage');
const entry2 = logger.logPlanGenerated({
  planId: '550e8400-e29b-41d4-a716-446655440002',
  intentId: '550e8400-e29b-41d4-a716-446655440001',
  actions: [{ actionId: 'a1', tool: 'test' }],
  riskAssessment: { overallRiskLevel: 'low' },
  requiresHumanApproval: false
});

assert.strictEqual(entry2.sequence, 2, 'Second entry should be sequence 2');
assert.strictEqual(entry2.previousHash, entry1.hash, 'Second entry should reference first entry hash');
console.log('✅ Hash chain linked correctly\n');

// Test 3: Add more entries
console.log('Test 3: Add multiple entries');
logger.logApprovalIssued({
  approvalId: '550e8400-e29b-41d4-a716-446655440003',
  planId: '550e8400-e29b-41d4-a716-446655440002',
  approvedBy: 'policy_engine',
  expiresAt: new Date().toISOString()
});

logger.logApprovalDenied('plan-high-risk', 'Requires human approval');
console.log('✅ Multiple entries added\n');

// Test 4: Verify chain integrity
console.log('Test 4: Verify chain integrity');
const integrity1 = logger.verifyChainIntegrity();
assert.strictEqual(integrity1.valid, true, 'Chain should be valid');
assert.strictEqual(integrity1.entries, 4, 'Should have 4 entries');
console.log(`✅ Chain integrity verified: ${integrity1.message}\n`);

// Test 5: Detect tampering
console.log('Test 5: Detect tampering');
const chainFile = path.join(testAuditPath, 'audit_chain.jsonl');
let content = fs.readFileSync(chainFile, 'utf8');
const lines = content.split('\n').filter(l => l);

// Tamper with second entry
const tamperedEntry = JSON.parse(lines[1]);
tamperedEntry.payload.riskLevel = 'high'; // Modify payload
lines[1] = JSON.stringify(tamperedEntry);
fs.writeFileSync(chainFile, lines.join('\n') + '\n');

// Create new logger instance to reload
const logger2 = new AuditLogger(testAuditPath);
const integrity2 = logger2.verifyChainIntegrity();
assert.strictEqual(integrity2.valid, false, 'Tampered chain should be invalid');
assert(integrity2.message.includes('tampered'), 'Should detect tampering');
console.log(`✅ Tampering detected: ${integrity2.message}\n`);

// Restore for next tests
fs.writeFileSync(chainFile, content);

// Test 6: SIEM export (JSON format)
console.log('Test 6: Export for SIEM (JSON format)');
const logger3 = new AuditLogger(testAuditPath);
const jsonExport = logger3.exportForSIEM('json');
assert.strictEqual(jsonExport.length, 4, 'Should export 4 entries');
assert(jsonExport[0].hash, 'Export should include hashes');
assert(jsonExport[0].sequence, 'Export should include sequence numbers');
console.log('✅ JSON export successful\n');

// Test 7: SIEM export (CEF format)
console.log('Test 7: Export for SIEM (CEF format)');
const cefExport = logger3.exportForSIEM('cef');
assert.strictEqual(cefExport.length, 4, 'Should export 4 CEF entries');
assert(cefExport[0].startsWith('CEF:0|Aureus|OpenClaw Bridge'), 'Should be valid CEF format');
console.log('✅ CEF export successful');
console.log(`   Sample: ${cefExport[0].substring(0, 80)}...\n`);

// Test 8: Verify persistence across instances
console.log('Test 8: Verify persistence across logger instances');
const logger4 = new AuditLogger(testAuditPath);
const newEntry = logger4.logIntentReceived({
  intentId: '550e8400-e29b-41d4-a716-446655440009',
  tool: 'another_tool',
  riskLevel: 'medium',
  channelId: 'web'
});
assert.strictEqual(newEntry.sequence, 5, 'New entry should continue sequence');
assert.strictEqual(newEntry.previousHash, jsonExport[3].hash, 'Should link to previous chain');
console.log('✅ Persistence verified across instances\n');

// Cleanup
fs.rmSync(testAuditPath, { recursive: true });

console.log('All tamper-evident audit logger tests passed!');
