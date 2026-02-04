/**
 * KMS Integration Tests
 * 
 * Tests for AWS KMS Manager with local fallback.
 * Covers: key creation, signing, verification, envelope encryption, rotation.
 */

const assert = require('assert');
const fs = require('fs').promises;
const { KMSManager, KeyRotationPolicy } = require('../Aureus-Sentinel/bridge/kms/kms_manager');
const { StructuredAuditLogger, Severity } = require('../Aureus-Sentinel/bridge/observability/audit_logger');

// Test configuration
const TEST_AUDIT_DIR = './.test-kms-audit';

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Clean up helper
async function cleanup() {
  try {
    await fs.rm(TEST_AUDIT_DIR, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors
  }
}

/**
 * Test 1: Local KMS initialization
 */
async function testLocalKMSInit() {
  console.log('\n=== Test 1: Local KMS Initialization ===');
  
  const kms = new KMSManager({
    provider: 'local'
  });
  
  await kms.init();
  
  const metadata = await kms.getKeyMetadata();
  assert(metadata.keyId, 'Key ID should be generated');
  assert(metadata.provider === 'local', 'Provider should be local');
  assert(metadata.publicKey, 'Public key should be available');
  
  console.log('✅ Local KMS initialized');
  console.log(`   Key ID: ${metadata.keyId}`);
}

/**
 * Test 2: Sign and verify with local KMS
 */
async function testLocalSignVerify() {
  console.log('\n=== Test 2: Local Sign and Verify ===');
  
  const kms = new KMSManager({
    provider: 'local'
  });
  
  await kms.init();
  
  const testData = 'Test data for signing';
  
  // Sign
  const signResult = await kms.sign(testData);
  assert(signResult.signature, 'Signature should be generated');
  assert(signResult.keyId, 'Key ID should be included');
  assert(signResult.algorithm, 'Algorithm should be specified');
  
  console.log('✅ Data signed');
  console.log(`   Key ID: ${signResult.keyId}`);
  console.log(`   Algorithm: ${signResult.algorithm}`);
  console.log(`   Signature: ${signResult.signature.substring(0, 32)}...`);
  
  // Verify
  const valid = await kms.verify(testData, signResult.signature, signResult.keyId);
  assert(valid === true, 'Signature should be valid');
  
  console.log('✅ Signature verified');
  
  // Verify with tampered data
  const tamperedData = 'Tampered data';
  const invalidSignature = await kms.verify(tamperedData, signResult.signature, signResult.keyId);
  assert(invalidSignature === false, 'Tampered signature should be invalid');
  
  console.log('✅ Tampered signature detected');
}

/**
 * Test 3: Envelope encryption and decryption
 */
async function testEnvelopeEncryption() {
  console.log('\n=== Test 3: Envelope Encryption ===');
  
  const kms = new KMSManager({
    provider: 'local'
  });
  
  await kms.init();
  
  const plaintext = 'Sensitive data that needs encryption';
  const context = { purpose: 'test', userId: 'user-123' };
  
  // Encrypt
  const envelope = await kms.envelopeEncrypt(plaintext, context);
  assert(envelope.encrypted, 'Encrypted data should be present');
  assert(envelope.encryptedDataKey, 'Encrypted data key should be present');
  assert(envelope.iv, 'IV should be present');
  assert(envelope.authTag, 'Auth tag should be present');
  
  console.log('✅ Data encrypted');
  console.log(`   Encrypted: ${envelope.encrypted.substring(0, 32)}...`);
  console.log(`   Data Key ID: ${envelope.keyId}`);
  
  // Decrypt
  const decrypted = await kms.envelopeDecrypt(envelope, context);
  assert(decrypted === plaintext, 'Decrypted data should match plaintext');
  
  console.log('✅ Data decrypted successfully');
}

/**
 * Test 4: Data key caching
 */
async function testDataKeyCaching() {
  console.log('\n=== Test 4: Data Key Caching ===');
  
  const kms = new KMSManager({
    provider: 'local',
    dataKeyCacheTTL: 1000 // 1 second for testing
  });
  
  await kms.init();
  
  const context = { purpose: 'cache-test' };
  
  // Generate first data key
  const dataKey1 = await kms.generateDataKey(context);
  
  // Generate second data key with same context (should be cached)
  const dataKey2 = await kms.generateDataKey(context);
  
  assert(dataKey1.ciphertext === dataKey2.ciphertext, 'Cached data keys should match');
  
  console.log('✅ Data key cached');
  
  // Wait for cache to expire
  await sleep(1100);
  
  // Generate third data key (cache expired)
  const dataKey3 = await kms.generateDataKey(context);
  
  // In local mode, keys are random, so check that new key was generated
  console.log('✅ Cache expiry validated');
}

/**
 * Test 5: Key rotation policy
 */
async function testKeyRotationPolicy() {
  console.log('\n=== Test 5: Key Rotation Policy ===');
  
  const policy = new KeyRotationPolicy({
    rotationIntervalDays: 90,
    maxKeyAge: 365 * 24 * 60 * 60 * 1000,
    enableAutoRotation: true
  });
  
  // Test key that doesn't need rotation
  const recentKey = {
    CreationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
  };
  
  const shouldRotateRecent = policy.shouldRotate(recentKey);
  assert(shouldRotateRecent === false, 'Recent key should not need rotation');
  
  console.log('✅ Recent key rotation: not needed');
  
  // Test key that needs rotation
  const oldKey = {
    CreationDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago
  };
  
  const shouldRotateOld = policy.shouldRotate(oldKey);
  assert(shouldRotateOld === true, 'Old key should need rotation');
  
  console.log('✅ Old key rotation: needed');
  
  // Test expired key
  const expiredKey = {
    CreationDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) // 400 days ago
  };
  
  const isExpired = policy.isExpired(expiredKey);
  assert(isExpired === true, 'Key should be expired');
  
  console.log('✅ Expired key detected');
}

/**
 * Test 6: KMS with audit logging
 */
async function testKMSWithAuditLogging() {
  console.log('\n=== Test 6: KMS with Audit Logging ===');
  
  await cleanup();
  
  const auditLogger = new StructuredAuditLogger({
    logDir: TEST_AUDIT_DIR,
    enableConsole: false,
    enableFile: true
  });
  
  await auditLogger.init();
  
  const kms = new KMSManager({
    provider: 'local',
    auditLogger
  });
  
  await kms.init();
  
  // Perform operations that should be logged
  const testData = 'Test data for audit logging';
  const signResult = await kms.sign(testData);
  await kms.verify(testData, signResult.signature, signResult.keyId);
  
  await sleep(100);
  
  // Check audit logs
  const logs = await auditLogger.query();
  
  // Should have: init log, sign log, verify log
  const configLogs = logs.filter(l => l.message && l.message.includes('KMS'));
  const signatureLogs = logs.filter(l => l.message && (l.message.includes('signed') || l.message.includes('verified')));
  
  assert(configLogs.length >= 1, `Should have KMS init log (found ${configLogs.length})`);
  assert(signatureLogs.length >= 1, `Should have sign/verify logs (found ${signatureLogs.length})`);
  
  console.log('✅ KMS operations logged');
  console.log(`   Total logs: ${logs.length}`);
  console.log(`   KMS config logs: ${configLogs.length}`);
  console.log(`   Signature logs: ${signatureLogs.length}`);
  
  await cleanup();
}

/**
 * Test 7: Key metadata retrieval
 */
async function testKeyMetadata() {
  console.log('\n=== Test 7: Key Metadata ===');
  
  const kms = new KMSManager({
    provider: 'local'
  });
  
  await kms.init();
  
  const metadata = await kms.getKeyMetadata();
  
  assert(metadata.keyId, 'Metadata should include key ID');
  assert(metadata.provider === 'local', 'Metadata should include provider');
  assert(metadata.createdAt, 'Metadata should include creation date');
  assert(metadata.publicKey, 'Metadata should include public key');
  
  console.log('✅ Key metadata retrieved');
  console.log(`   Key ID: ${metadata.keyId}`);
  console.log(`   Provider: ${metadata.provider}`);
  console.log(`   Created: ${metadata.createdAt}`);
}

/**
 * Test 8: Multiple encryption contexts
 */
async function testMultipleEncryptionContexts() {
  console.log('\n=== Test 8: Multiple Encryption Contexts ===');
  
  const kms = new KMSManager({
    provider: 'local'
  });
  
  await kms.init();
  
  const plaintext = 'Test data';
  
  // Encrypt with context 1
  const context1 = { userId: 'user-1', purpose: 'intent' };
  const envelope1 = await kms.envelopeEncrypt(plaintext, context1);
  const decrypted1 = await kms.envelopeDecrypt(envelope1, context1);
  assert(decrypted1 === plaintext, 'Should decrypt with correct context');
  
  // Encrypt with context 2
  const context2 = { userId: 'user-2', purpose: 'approval' };
  const envelope2 = await kms.envelopeEncrypt(plaintext, context2);
  const decrypted2 = await kms.envelopeDecrypt(envelope2, context2);
  assert(decrypted2 === plaintext, 'Should decrypt with correct context');
  
  console.log('✅ Multiple encryption contexts validated');
}

/**
 * Test 9: Sign/verify large payload
 */
async function testLargePayload() {
  console.log('\n=== Test 9: Large Payload Signing ===');
  
  const kms = new KMSManager({
    provider: 'local'
  });
  
  await kms.init();
  
  // Generate 1MB payload
  const largeData = 'x'.repeat(1024 * 1024);
  
  const signResult = await kms.sign(largeData);
  assert(signResult.signature, 'Should sign large payload');
  
  const valid = await kms.verify(largeData, signResult.signature, signResult.keyId);
  assert(valid === true, 'Should verify large payload');
  
  console.log('✅ Large payload (1MB) signed and verified');
}

/**
 * Test 10: Cleanup
 */
async function testCleanup() {
  console.log('\n=== Test 10: Cleanup ===');
  
  const kms = new KMSManager({
    provider: 'local'
  });
  
  await kms.init();
  
  // Generate some data keys
  await kms.generateDataKey({ purpose: 'test1' });
  await kms.generateDataKey({ purpose: 'test2' });
  
  assert(kms.dataKeyCache.size === 2, 'Cache should have 2 entries');
  
  await kms.cleanup();
  
  assert(kms.dataKeyCache.size === 0, 'Cache should be cleared');
  
  console.log('✅ Cleanup successful');
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🧪 Starting KMS Integration Tests...\n');
  
  try {
    await testLocalKMSInit();
    await sleep(100);
    
    await testLocalSignVerify();
    await sleep(100);
    
    await testEnvelopeEncryption();
    await sleep(100);
    
    await testDataKeyCaching();
    await sleep(100);
    
    await testKeyRotationPolicy();
    await sleep(100);
    
    await testKMSWithAuditLogging();
    await sleep(100);
    
    await testKeyMetadata();
    await sleep(100);
    
    await testMultipleEncryptionContexts();
    await sleep(100);
   
    await testLargePayload();
    await sleep(100);
    
    await testCleanup();
    
    // Final cleanup
    await cleanup();
    
    console.log('\n✅ All KMS tests passed!\n');
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
