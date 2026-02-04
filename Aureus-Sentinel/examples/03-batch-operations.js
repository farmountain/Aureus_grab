/**
 * Example 3: Batch Operations
 * 
 * Demonstrates signing and verifying multiple payloads efficiently.
 */

const { BridgeClient } = require('../sdk/bridge-client');

async function main() {
  const client = new BridgeClient('http://localhost:3000');
  
  // Create multiple payloads
  const payloads = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    action: 'process',
    timestamp: Date.now(),
    data: `Sample data ${i + 1}`
  }));
  
  console.log(`Created ${payloads.length} payloads\n`);
  
  // Batch sign
  console.log('Batch signing...');
  const startSign = Date.now();
  const signatures = await client.signBatch(payloads, { ttl: 300 });
  const signDuration = Date.now() - startSign;
  
  console.log(`✓ Signed ${signatures.length} payloads in ${signDuration}ms`);
  console.log(`  Average: ${(signDuration / signatures.length).toFixed(2)}ms per payload`);
  
  // Display first few signatures
  console.log('\nFirst 3 signatures:');
  signatures.slice(0, 3).forEach((sig, i) => {
    console.log(`  ${i + 1}. ${sig.signature.substring(0, 40)}...`);
  });
  
  // Batch verify
  console.log('\nBatch verifying...');
  const verifyItems = payloads.map((payload, i) => ({
    payload,
    signature: signatures[i].signature
  }));
  
  const startVerify = Date.now();
  const results = await client.verifyBatch(verifyItems);
  const verifyDuration = Date.now() - startVerify;
  
  console.log(`✓ Verified ${results.length} signatures in ${verifyDuration}ms`);
  console.log(`  Average: ${(verifyDuration / results.length).toFixed(2)}ms per verification`);
  
  // Check all valid
  const allValid = results.every(r => r.valid);
  const validCount = results.filter(r => r.valid).length;
  
  console.log(`\n✓ All signatures valid: ${allValid}`);
  console.log(`  Valid: ${validCount}/${results.length}`);
  
  // Performance summary
  console.log('\n=== Performance Summary ===');
  console.log(`Total operations: ${payloads.length * 2} (${payloads.length} sign + ${payloads.length} verify)`);
  console.log(`Total time: ${signDuration + verifyDuration}ms`);
  console.log(`Throughput: ${((payloads.length * 2) / ((signDuration + verifyDuration) / 1000)).toFixed(2)} ops/sec`);
}

main().catch(console.error);
