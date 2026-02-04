# Aureus Sentinel Examples

Working code examples demonstrating common use cases and integration patterns.

## Quick Links

- [Basic Examples](#basic-examples)
- [Multi-Channel Integration](#multi-channel-integration)
- [Custom Policies](#custom-policies)
- [KMS Integration](#kms-integration)
- [Performance Testing](#performance-testing)
- [Production Patterns](#production-patterns)

## Setup

All examples require the Bridge server running:

```bash
node Aureus-Sentinel/bridge/server.js
```

Install dependencies:

```bash
npm install @aureus-sentinel/bridge-client
```

---

## Basic Examples

### Example 1: Simple Sign and Verify

[📁 examples/01-simple-sign-verify.js](01-simple-sign-verify.js)

```javascript
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

async function main() {
  const client = new BridgeClient('http://localhost:3000');
  
  const payload = {
    message: 'Hello, Aureus!',
    timestamp: Date.now()
  };
  
  // Sign
  console.log('Signing payload...');
  const { signature, expiresAt } = await client.sign(payload);
  console.log('✓ Signature:', signature.substring(0, 20) + '...');
  
  // Verify
  console.log('\nVerifying signature...');
  const { valid, message } = await client.verify(payload, signature);
  console.log(`✓ ${message}`);
}

main().catch(console.error);
```

Run: `node examples/01-simple-sign-verify.js`

---

### Example 2: Create Intent with SDK

[📁 examples/02-create-intent.js](02-create-intent.js)

```javascript
const { BridgeClient, createIntent } = require('@aureus-sentinel/bridge-client');

async function main() {
  const client = new BridgeClient('http://localhost:3000');
  
  // Method 1: Using createIntent()
  const result1 = await client.createIntent({
    channelId: 'api',
    tool: 'web_search',
    parameters: { query: 'TypeScript tutorial' },
    riskLevel: 'low',
    description: 'Search for tutorials',
    ttl: 300
  });
  
  console.log('Intent 1 created:');
  console.log('  ID:', result1.intent.intentId);
  console.log('  Signature:', result1.signature.substring(0, 20) + '...');
  
  // Method 2: Using fluent API
  const result2 = await createIntent()
    .channel('telegram')
    .tool('send_message')
    .parameters({ chat_id: 123, text: 'Hello!' })
    .risk('low')
    .describe('Send greeting message')
    .sign(client, { ttl: 600 });
  
  console.log('\nIntent 2 created:');
  console.log('  ID:', result2.intent.intentId);
  console.log('  Signature:', result2.signature.substring(0, 20) + '...');
}

main().catch(console.error);
```

Run: `node examples/02-create-intent.js`

---

### Example 3: Batch Operations

[📁 examples/03-batch-operations.js](03-batch-operations.js)

```javascript
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

async function main() {
  const client = new BridgeClient('http://localhost:3000');
  
  // Create multiple payloads
  const payloads = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    action: 'test',
    timestamp: Date.now()
  }));
  
  console.log(`Signing ${payloads.length} payloads...`);
  const start = Date.now();
  
  // Sign all at once
  const signatures = await client.signBatch(payloads);
  
  const duration = Date.now() - start;
  console.log(`✓ Signed ${signatures.length} payloads in ${duration}ms`);
  
  // Verify all at once
  console.log('\nVerifying all signatures...');
  const verifyItems = payloads.map((payload, i) => ({
    payload,
    signature: signatures[i].signature
  }));
  
  const results = await client.verifyBatch(verifyItems);
  
  const allValid = results.every(r => r.valid);
  console.log(`✓ All signatures valid: ${allValid}`);
}

main().catch(console.error);
```

Run: `node examples/03-batch-operations.js`

---

## Multi-Channel Integration

### Example 4: Telegram Bot Integration

[📁 examples/04-telegram-integration.js](04-telegram-integration.js)

```javascript
const TelegramBot = require('node-telegram-bot-api');
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const bridge = new BridgeClient('http://localhost:3000');

// Handle messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  try {
    // Create intent for user command
    const result = await bridge.createIntent({
      channelId: 'telegram',
      tool: 'process_message',
      parameters: {
        chat_id: chatId,
        message: text,
        user_id: msg.from.id
      },
      riskLevel: 'low',
      description: `Process Telegram message: ${text}`,
      ttl: 300
    });
    
    console.log('Intent signed:', result.intent.intentId);
    
    // Process the intent...
    // (Your business logic here)
    
    // Respond to user
    await bot.sendMessage(chatId, `✓ Message processed\nIntent ID: ${result.intent.intentId}`);
  } catch (error) {
    console.error('Error:', error.message);
    await bot.sendMessage(chatId, '❌ Error processing message');
  }
});

console.log('Telegram bot started. Send a message to test.');
```

Run: `TELEGRAM_BOT_TOKEN=your_token node examples/04-telegram-integration.js`

---

### Example 5: Discord Bot Integration

[📁 examples/05-discord-integration.js](05-discord-integration.js)

```javascript
const { Client, GatewayIntentBits } = require('discord.js');
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const bridge = new BridgeClient('http://localhost:3000');

discord.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Only respond to commands
  if (!message.content.startsWith('!')) return;
  
  const command = message.content.slice(1).split(' ')[0];
  const args = message.content.slice(1).split(' ').slice(1);
  
  try {
    // Create intent for command
    const result = await bridge.createIntent({
      channelId: 'discord',
      tool: command,
      parameters: {
        args: args,
        guild_id: message.guild?.id,
        channel_id: message.channel.id,
        user_id: message.author.id
      },
      riskLevel: 'medium',
      description: `Discord command: ${command}`,
      ttl: 300
    });
    
    console.log('Intent signed:', result.intent.intentId);
    
    // Respond
    await message.reply(`✓ Command processed\nIntent: ${result.intent.intentId}`);
  } catch (error) {
    console.error('Error:', error.message);
    await message.reply('❌ Error processing command');
  }
});

discord.login(process.env.DISCORD_BOT_TOKEN);
console.log('Discord bot started. Use !command to test.');
```

Run: `DISCORD_BOT_TOKEN=your_token node examples/05-discord-integration.js`

---

### Example 6: REST API Integration

[📁 examples/06-rest-api-integration.js](06-rest-api-integration.js)

```javascript
const express = require('express');
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

const app = express();
const bridge = new BridgeClient('http://localhost:3000');

app.use(express.json());

// Sign endpoint
app.post('/api/intents', async (req, res) => {
  try {
    const { tool, parameters, description } = req.body;
    
    const result = await bridge.createIntent({
      channelId: 'rest-api',
      tool,
      parameters: parameters || {},
      riskLevel: 'low',
      description,
      ttl: 300
    });
    
    res.json({
      success: true,
      intent: result.intent,
      signature: result.signature,
      expiresAt: result.expiresAt
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Verify endpoint
app.post('/api/verify', async (req, res) => {
  try {
    const { payload, signature } = req.body;
    
    const result = await bridge.verify(payload, signature);
    
    res.json({
      success: true,
      valid: result.valid,
      message: result.message
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('\nTest with:');
  console.log(`  curl -X POST http://localhost:${PORT}/api/intents -H "Content-Type: application/json" -d '{"tool":"test","description":"Test intent"}'`);
});
```

Run: `node examples/06-rest-api-integration.js`

---

## Custom Policies

### Example 7: Risk Level Policy

[📁 examples/07-risk-policy.js](07-risk-policy.js)

```javascript
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

// Risk assessment policy
function assessRisk(intent) {
  const { tool, parameters } = intent;
  
  // High-risk operations
  const highRiskTools = ['delete_file', 'execute_command', 'transfer_funds'];
  if (highRiskTools.includes(tool)) {
    return 'high';
  }
  
  // Medium-risk: operations with external data
  if (tool.startsWith('send_') || tool.startsWith('post_')) {
    return 'medium';
  }
  
  // Check parameter sensitivity
  if (parameters.amount && parseFloat(parameters.amount) > 1000) {
    return 'high';
  }
  
  if (parameters.recipients && parameters.recipients.length > 10) {
    return 'medium';
  }
  
  return 'low';
}

async function createIntentWithPolicy(client, intentData) {
  // Assess risk
  const riskLevel = assessRisk(intentData);
  
  console.log(`Tool: ${intentData.tool}`);
  console.log(`Assessed risk: ${riskLevel}`);
  
  // Apply policy based on risk
  let ttl;
  let requiresApproval = false;
  
  switch (riskLevel) {
    case 'high':
      ttl = 60; // 1 minute - short expiry
      requiresApproval = true;
      break;
    case 'medium':
      ttl = 300; // 5 minutes
      requiresApproval = false;
      break;
    case 'low':
      ttl = 3600; // 1 hour
      requiresApproval = false;
      break;
  }
  
  // Create intent
  const result = await client.createIntent({
    ...intentData,
    riskLevel,
    ttl
  });
  
  if (requiresApproval) {
    console.log('⚠️  High-risk intent requires human approval');
    // Trigger approval workflow...
  }
  
  return result;
}

async function main() {
  const client = new BridgeClient('http://localhost:3000');
  
  // Test cases
  const testCases = [
    {
      channelId: 'api',
      tool: 'read_file',
      parameters: { path: './data.txt' },
      description: 'Read file'
    },
    {
      channelId: 'api',
      tool: 'send_email',
      parameters: { to: 'user@example.com', subject: 'Test' },
      description: 'Send email'
    },
    {
      channelId: 'api',
      tool: 'delete_file',
      parameters: { path: './important.txt' },
      description: 'Delete file'
    }
  ];
  
  for (const testCase of testCases) {
    const result = await createIntentWithPolicy(client, testCase);
    console.log(`Intent ID: ${result.intent.intentId}\n`);
  }
}

main().catch(console.error);
```

Run: `node examples/07-risk-policy.js`

---

### Example 8: Rate Limiting Policy

[📁 examples/08-rate-limiting.js](08-rate-limiting.js)

```javascript
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map(); // channelId -> [timestamps]
  }
  
  isAllowed(channelId) {
    const now = Date.now();
    const channelRequests = this.requests.get(channelId) || [];
    
    // Remove old requests outside window
    const recentRequests = channelRequests.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    this.requests.set(channelId, recentRequests);
    
    return recentRequests.length < this.maxRequests;
  }
  
  recordRequest(channelId) {
    const channelRequests = this.requests.get(channelId) || [];
    channelRequests.push(Date.now());
    this.requests.set(channelId, channelRequests);
  }
  
  getRemainingRequests(channelId) {
    const channelRequests = this.requests.get(channelId) || [];
    const now = Date.now();
    const recentRequests = channelRequests.filter(
      timestamp => now - timestamp < this.windowMs
    );
    return Math.max(0, this.maxRequests - recentRequests.length);
  }
}

async function main() {
  const client = new BridgeClient('http://localhost:3000');
  
  // 10 requests per minute per channel
  const rateLimiter = new RateLimiter(10, 60000);
  
  async function createIntentWithRateLimit(channelId, intentData) {
    // Check rate limit
    if (!rateLimiter.isAllowed(channelId)) {
      const remaining = rateLimiter.getRemainingRequests(channelId);
      throw new Error(`Rate limit exceeded for channel ${channelId}. Remaining: ${remaining}`);
    }
    
    // Create intent
    const result = await client.createIntent({
      channelId,
      ...intentData,
      ttl: 300
    });
    
    // Record request
    rateLimiter.recordRequest(channelId);
    
    const remaining = rateLimiter.getRemainingRequests(channelId);
    console.log(`✓ Intent created. Remaining requests: ${remaining}`);
    
    return result;
  }
  
  // Test rate limiting
  console.log('Testing rate limiter (10 req/min)...\n');
  
  for (let i = 1; i <= 15; i++) {
    try {
      await createIntentWithRateLimit('telegram', {
        tool: 'test_tool',
        parameters: { test: i },
        riskLevel: 'low',
        description: `Test ${i}`
      });
    } catch (error) {
      console.log(`❌ Request ${i}: ${error.message}`);
    }
  }
}

main().catch(console.error);
```

Run: `node examples/08-rate-limiting.js`

---

## KMS Integration

### Example 9: AWS KMS Setup

[📁 examples/09-kms-setup.js](09-kms-setup.js)

```javascript
const AWS = require('aws-sdk');

async function setupKMS() {
  const kms = new AWS.KMS({ region: 'us-east-1' });
  
  console.log('Setting up AWS KMS for Aureus Sentinel...\n');
  
  // 1. Create key
  console.log('1. Creating KMS key...');
  const createKeyResult = await kms.createKey({
    KeySpec: 'ECC_NIST_P384',
    KeyUsage: 'SIGN_VERIFY',
    Description: 'Aureus Sentinel Bridge signing key',
    Tags: [
      { TagKey: 'Application', TagValue: 'Aureus-Sentinel' },
      { TagKey: 'Environment', TagValue: 'production' }
    ]
  }).promise();
  
  const keyId = createKeyResult.KeyMetadata.KeyId;
  console.log(`✓ Key created: ${keyId}`);
  
  // 2. Create alias
  console.log('\n2. Creating alias...');
  await kms.createAlias({
    AliasName: 'alias/aureus-bridge',
    TargetKeyId: keyId
  }).promise();
  console.log('✓ Alias created: alias/aureus-bridge');
  
  // 3. Get public key
  console.log('\n3. Retrieving public key...');
  const publicKeyResult = await kms.getPublicKey({
    KeyId: keyId
  }).promise();
  console.log('✓ Public key retrieved');
  console.log(`  Algorithm: ${publicKeyResult.KeySpec}`);
  console.log(`  Usage: ${publicKeyResult.KeyUsage}`);
  
  // 4. Configure permissions
  console.log('\n4. Key configuration complete!');
  console.log('\nEnvironment variables for Bridge:');
  console.log(`  USE_KMS=true`);
  console.log(`  KMS_KEY_ID=${keyId}`);
  console.log(`  AWS_REGION=us-east-1`);
  
  console.log('\nTo grant permissions to IAM role:');
  console.log(`  aws kms create-grant \\`);
  console.log(`    --key-id ${keyId} \\`);
  console.log(`    --grantee-principal arn:aws:iam::ACCOUNT_ID:role/YOUR_ROLE \\`);
  console.log(`    --operations Sign Verify GetPublicKey`);
  
  return keyId;
}

setupKMS().catch(console.error);
```

Run: `AWS_PROFILE=your_profile node examples/09-kms-setup.js`

---

### Example 10: Testing KMS Integration

[📁 examples/10-kms-testing.js](10-kms-testing.js)

```javascript
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

async function testKMS() {
  console.log('Testing KMS integration...\n');
  
  // Connect to Bridge configured with KMS
  const client = new BridgeClient('http://localhost:3000');
  
  // Test 1: Health check
  console.log('1. Health check...');
  const health = await client.health();
  console.log(`✓ Status: ${health.status}`);
  
  // Test 2: Get public key (from KMS)
  console.log('\n2. Get public key from KMS...');
  const publicKey = await client.getPublicKey();
  console.log(`✓ Public key retrieved (${publicKey.length} bytes)`);
  
  // Test 3: Sign with KMS
  console.log('\n3. Sign with KMS...');
  const payload = {
    test: 'kms-signing',
    timestamp: Date.now()
  };
  
  const start = Date.now();
  const { signature } = await client.sign(payload);
  const signDuration = Date.now() - start;
  
  console.log(`✓ Signed in ${signDuration}ms`);
  console.log(`  Signature: ${signature.substring(0, 40)}...`);
  
  // Test 4: Verify (uses KMS public key)
  console.log('\n4. Verify signature...');
  const { valid, message } = await client.verify(payload, signature);
  console.log(`✓ ${message}`);
  
  // Test 5: Performance test
  console.log('\n5. Performance test (10 signatures)...');
  const perf start = Date.now();
  
  const promises = Array.from({ length: 10 }, () =>
    client.sign({ test: Math.random() })
  );
  
  await Promise.all(promises);
  const perfDuration = Date.now() - perfStart;
  
  console.log(`✓ 10 signatures in ${perfDuration}ms`);
  console.log(`  Average: ${perfDuration / 10}ms per signature`);
  
  console.log('\n✓ All KMS tests passed!');
}

testKMS().catch(console.error);
```

Run: `node examples/10-kms-testing.js` (requires Bridge with KMS enabled)

---

## Performance Testing

### Example 11: Load Testing

See [Aureus-Sentinel/performance/load_scenarios.js](../Aureus-Sentinel/performance/load_scenarios.js) for complete load testing examples.

---

## Production Patterns

### Example 12: Error Handling

[📁 examples/12-error-handling.js](12-error-handling.js)

```javascript
const { 
  BridgeClient, 
  SigningError, 
  VerificationError, 
  NetworkError 
} = require('@aureus-sentinel/bridge-client');

async function robustSignAndVerify(payload) {
  const client = new BridgeClient({
    baseUrl: 'http://localhost:3000',
    retries: 3,
    retryDelay: 1000
  });
  
  try {
    // Sign
    const { signature } = await client.sign(payload);
    
    // Verify
    const { valid } = await client.verify(payload, signature);
    
    if (!valid) {
      throw new Error('Signature verification failed');
    }
    
    return { success: true, signature };
    
  } catch (error) {
    // Handle specific errors
    if (error instanceof SigningError) {
      console.error('Signing failed:', error.message);
      console.error('Details:', error.details);
      return { success: false, error: 'SIGNING_ERROR', message: error.message };
      
    } else if (error instanceof VerificationError) {
      console.error('Verification failed:', error.message);
      return { success: false, error: 'VERIFICATION_ERROR', message: error.message };
      
    } else if (error instanceof NetworkError) {
      console.error('Network error:', error.message);
      if (error.details.attempt >= 3) {
        console.error('Max retries reached, giving up');
      }
      return { success: false, error: 'NETWORK_ERROR', message: error.message };
      
    } else {
      console.error('Unknown error:', error);
      return { success: false, error: 'UNKNOWN_ERROR', message: error.message };
    }
  }
}

// Test
async function main() {
  const result = await robustSignAndVerify({ test: 'data' });
  console.log('Result:', result);
}

main().catch(console.error);
```

Run: `node examples/12-error-handling.js`

---

### Example 13: Circuit Breaker Pattern

[📁 examples/13-circuit-breaker.js](13-circuit-breaker.js)

```javascript
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

class CircuitBreaker {
  constructor(threshold, timeout) {
    this.threshold = threshold;     // Failures before opening
    this.timeout = timeout;         // MS before trying again
    this.failures = 0;
    this.state = 'CLOSED';          // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }
  
  async execute(fn) {
    // Check circuit state
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }
    
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }
  
  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      console.log(`Circuit breaker OPEN. Retrying in ${this.timeout}ms`);
    }
  }
  
  getState() {
    return this.state;
  }
}

async function main() {
  const client = new BridgeClient('http://localhost:3000');
  const circuitBreaker = new CircuitBreaker(3, 5000); // 3 failures, 5s timeout
  
  async function signWithCircuitBreaker(payload) {
    return circuitBreaker.execute(async () => {
      return await client.sign(payload);
    });
  }
  
  // Simulate requests
  for (let i = 1; i <= 10; i++) {
    try {
      const result = await signWithCircuitBreaker({ request: i });
      console.log(`✓ Request ${i}: Signed`);
    } catch (error) {
      console.log(`❌ Request ${i}: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

main().catch(console.error);
```

Run: `node examples/13-circuit-breaker.js`

---

## Running Examples

```bash
# Clone repository
git clone https://github.com/yourusername/aureus-sentinel
cd aureus-sentinel

# Install dependencies
npm install

# Start Bridge server
node Aureus-Sentinel/bridge/server.js

# In another terminal, run examples
node Aureus-Sentinel/examples/01-simple-sign-verify.js
```

## More Information

- [Getting Started Guide](../docs/GETTING_STARTED.md)
- [API Reference](../docs/API_REFERENCE.md)
- [Troubleshooting](../docs/TROUBLESHOOTING.md)
- [SDK Documentation](../sdk/README.md)
- [CLI Documentation](../cli/README.md)
