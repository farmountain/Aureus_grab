/**
 * Example 2: Create Intent with SDK
 * 
 * Demonstrates creating intents using both createIntent() and fluent API.
 */

const { BridgeClient, createIntent } = require('../sdk/bridge-client');

async function main() {
  const client = new BridgeClient('http://localhost:3000');
  
  console.log('=== Method 1: Using createIntent() ===\n');
  
  const result1 = await client.createIntent({
    channelId: 'api',
    tool: 'web_search',
    parameters: { 
      query: 'TypeScript tutorial',
      maxResults: 10
    },
    riskLevel: 'low',
    description: 'Search for TypeScript tutorials',
    ttl: 300
  });
  
  console.log('Intent created:');
  console.log(`  ID: ${result1.intent.intentId}`);
  console.log(`  Channel: ${result1.intent.channelId}`);
  console.log(`  Tool: ${result1.intent.tool}`);
  console.log(`  Risk: ${result1.intent.riskLevel}`);
  console.log(`  Signature: ${result1.signature.substring(0, 40)}...`);
  console.log(`  Expires: ${new Date(result1.expiresAt).toISOString()}`);
  
  console.log('\n=== Method 2: Using Fluent API ===\n');
  
  const result2 = await createIntent()
    .channel('telegram')
    .tool('send_message')
    .parameters({ 
      chat_id: 123456789,
      text: 'Hello from Aureus!'
    })
    .risk('medium')
    .describe('Send greeting message to Telegram')
    .metadata({ 
      source: 'example',
      version: '1.0'
    })
    .sign(client, { ttl: 600 });
  
  console.log('Intent created:');
  console.log(`  ID: ${result2.intent.intentId}`);
  console.log(`  Channel: ${result2.intent.channelId}`);
  console.log(`  Tool: ${result2.intent.tool}`);
  console.log(`  Risk: ${result2.intent.riskLevel}`);
  console.log(`  Has metadata: ${!!result2.intent.metadata}`);
  console.log(`  Signature: ${result2.signature.substring(0, 40)}...`);
  console.log(`  Expires: ${new Date(result2.expiresAt).toISOString()}`);
  
  console.log('\n✓ Both methods work correctly!');
}

main().catch(console.error);
