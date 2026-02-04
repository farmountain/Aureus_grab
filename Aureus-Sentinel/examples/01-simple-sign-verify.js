/**
 * Example 1: Simple Sign and Verify
 * 
 * Demonstrates the basic signing and verification flow.
 */

const { BridgeClient } = require('../sdk/bridge-client');

async function main() {
  // Create client
  const client = new BridgeClient('http://localhost:3000');
  
  // Payload to sign
  const payload = {
    message: 'Hello, Aureus!',
    timestamp: Date.now(),
    data: {
      user: 'demo',
      action: 'test'
    }
  };
  
  console.log('Payload:');
  console.log(JSON.stringify(payload, null, 2));
  
  // Sign
  console.log('\nSigning payload...');
  const signResult = await client.sign(payload, { ttl: 300 });
  
  console.log('✓ Signature created:');
  console.log(`  Signature: ${signResult.signature.substring(0, 40)}...`);
  console.log(`  Timestamp: ${new Date(signResult.timestamp).toISOString()}`);
  console.log(`  Expires at: ${new Date(signResult.expiresAt).toISOString()}`);
  
  // Verify
  console.log('\nVerifying signature...');
  const verifyResult = await client.verify(payload, signResult.signature);
  
  if (verifyResult.valid) {
    console.log(`✓ ${verifyResult.message}`);
  } else {
    console.log(`❌ ${verifyResult.message}`);
  }
  
  // Test tampering detection
  console.log('\nTesting tampering detection...');
  const tamperedPayload = { ...payload, message: 'Tampered!' };
  const tamperedResult = await client.verify(tamperedPayload, signResult.signature);
  
  if (!tamperedResult.valid) {
    console.log('✓ Tampering detected successfully');
    console.log(`  Message: ${tamperedResult.message}`);
  }
}

main().catch(console.error);
