# Getting Started with Aureus Sentinel

Welcome! This guide will walk you through setting up Aureus Sentinel and submitting your first signed intent in under 10 minutes.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Start the Bridge](#start-the-bridge)
4. [Your First Intent](#your-first-intent)
5. [Verify a Signature](#verify-a-signature)
6. [Next Steps](#next-steps)

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18+** installed ([Download](https://nodejs.org/))
- **Git** installed ([Download](https://git-scm.com/))
- A terminal/command prompt
- Basic JavaScript knowledge

**Check your versions:**

```bash
node --version  # Should be v18.0.0 or higher
npm --version   # Should be 8.0.0 or higher
git --version   # Any recent version
```

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/farmountain/Aureus-Sentinel.git
cd Aureus-Sentinel
```

### 2. Install Dependencies

```bash
# Navigate to bridge directory
cd Aureus-Sentinel/bridge

# Install Node.js dependencies
npm install
```

**Expected output:**
```
added 15 packages in 3s
```

### 3. Verify Installation

```bash
# Run tests to ensure everything works
cd ..
node tests/schema-test-runner.js
```

**Expected output:**
```
✓ All 5 schemas valid
```

---

## Start the Bridge

The Bridge is the signing service that generates and verifies signatures for AI agent intents.

### Development Mode (Ephemeral Keys)

```bash
cd Aureus-Sentinel/bridge
node server.js
```

**Expected output:**
```
🔐 Aureus Sentinel Bridge starting...
🔑 Generated ephemeral keypair
📢 PUBLIC_KEY_BASE64: 3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9==
🚀 Bridge listening on http://localhost:3000
```

> **Note:** The public key will be different each time you start the server. Copy it for later use.

**Keep this terminal running!** Open a new terminal for the next steps.

---

## Your First Intent

Now let's create and sign your first AI agent intent.

### 1. Create a Test Script

Create a new file called `first-intent.js`:

```javascript
// first-intent.js
const crypto = require('crypto');

async function signFirstIntent() {
  // Step 1: Create an intent
  const intent = {
    version: '1.0',
    type: 'intent.envelope',
    intentId: crypto.randomUUID(),
    channelId: 'api',
    tool: 'web_search',
    parameters: {
      query: 'What is Aureus Sentinel?'
    },
    riskLevel: 'low',
    description: 'My first intent - search the web',
    timestamp: new Date().toISOString()
  };

  console.log('📝 Created intent:', JSON.stringify(intent, null, 2));

  // Step 2: Sign the intent
  const signResponse = await fetch('http://localhost:3000/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: intent, ttl: 300 })
  });

  const signResult = await signResponse.json();
  
  console.log('\n✅ Intent signed!');
  console.log('   Signature:', signResult.signature.substring(0, 20) + '...');
  console.log('   Expires at:', new Date(signResult.expiresAt).toISOString());

  return { intent, signResult };
}

// Run it
signFirstIntent()
  .then(() => console.log('\n🎉 Success! Your first intent is signed.'))
  .catch(err => console.error('❌ Error:', err.message));
```

### 2. Run Your First Intent

```bash
node first-intent.js
```

**Expected output:**
```
📝 Created intent: {
  "version": "1.0",
  "type": "intent.envelope",
  "intentId": "123e4567-e89b-12d3-a456-426614174000",
  "channelId": "api",
  "tool": "web_search",
  "parameters": {
    "query": "What is Aureus Sentinel?"
  },
  "riskLevel": "low",
  "description": "My first intent - search the web",
  "timestamp": "2024-01-16T10:30:00.000Z"
}

✅ Intent signed!
   Signature: a7b3c9d2e1f4g5h6i7j8...
   Expires at: 2024-01-16T10:35:00.000Z

🎉 Success! Your first intent is signed.
```

**Congratulations!** You've just signed your first AI agent intent. 🎉

---

## Verify a Signature

Now let's verify the signature to ensure it's valid.

### 1. Create a Verification Script

Create `verify-intent.js`:

```javascript
// verify-intent.js
const crypto = require('crypto');

async function verifyIntent() {
  // Use the same intent from before
  const intent = {
    version: '1.0',
    type: 'intent.envelope',
    intentId: '123e4567-e89b-12d3-a456-426614174000', // Use a consistent ID
    channelId: 'api',
    tool: 'web_search',
    parameters: {
      query: 'What is Aureus Sentinel?'
    },
    riskLevel: 'low',
    description: 'My first intent - search the web',
    timestamp: '2024-01-16T10:30:00.000Z' // Fixed timestamp
  };

  // Step 1: Sign it first
  const signResponse = await fetch('http://localhost:3000/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: intent })
  });

  const { signature, publicKey } = await signResponse.json();
  console.log('✍️  Signature created');

  // Step 2: Verify the signature
  const verifyResponse = await fetch('http://localhost:3000/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: intent,
      signature,
      publicKey
    })
  });

  const { valid, message } = await verifyResponse.json();

  console.log('\n🔍 Verification result:');
  console.log('   Valid:', valid ? '✅ Yes' : '❌ No');
  console.log('   Message:', message);

  // Step 3: Try with tampered payload
  console.log('\n🧪 Testing with tampered payload...');
  
  const tamperedIntent = { ...intent, tool: 'evil_tool' };
  
  const tamperedVerify = await fetch('http://localhost:3000/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: tamperedIntent,
      signature,
      publicKey
    })
  });

  const tamperedResult = await tamperedVerify.json();
  
  console.log('   Tampered payload valid:', tamperedResult.valid ? '✅ Yes' : '❌ No');
  console.log('   Message:', tamperedResult.message);
  
  if (!tamperedResult.valid) {
    console.log('\n🛡️  Success! Tampering was detected.');
  }
}

verifyIntent()
  .then(() => console.log('\n✅ Verification complete'))
  .catch(err => console.error('❌ Error:', err.message));
```

### 2. Run Verification

```bash
node verify-intent.js
```

**Expected output:**
```
✍️  Signature created

🔍 Verification result:
   Valid: ✅ Yes
   Message: Signature is valid

🧪 Testing with tampered payload...
   Tampered payload valid: ❌ No
   Message: Signature verification failed

🛡️  Success! Tampering was detected.

✅ Verification complete
```

**Perfect!** The Bridge detected the tampered payload and rejected it. This is how Aureus Sentinel protects your AI agents from unauthorized actions.

---

## Understanding What Just Happened

### The Flow

```
1. Create Intent → 2. Sign → 3. Verify → 4. Execute
     (JSON)        (Bridge)   (Executor)   (Tool)
```

### Key Concepts

1. **Intent**: A structured JSON object describing what the AI agent wants to do
2. **Signature**: Cryptographic proof that the intent was approved by the Bridge
3. **Verification**: Checking that the signature matches the intent (no tampering)
4. **TTL**: Time-to-live ensures signatures expire (default: 5 minutes)

### Why This Matters

- **🔒 Security**: Signatures prevent unauthorized tool execution
- **📝 Audit Trail**: Every action is cryptographically logged
- **⏱️ Time Limits**: TTL prevents replay attacks
- **🛡️ Tamper-Proof**: Any modification invalidates the signature

---

## Next Steps

Now that you've completed the basics, here are some next steps:

### 1. Explore Different Risk Levels

Try creating intents with different risk levels:

```javascript
// Low risk - auto-approved
const lowRiskIntent = {
  // ... other fields
  riskLevel: 'low',
  tool: 'web_search'
};

// High risk - requires human approval
const highRiskIntent = {
  // ... other fields
  riskLevel: 'high',
  tool: 'database_delete'
};
```

### 2. Integrate with Your Channel

- **Telegram Bot**: See [Telegram Integration Guide](./integrations/TELEGRAM.md)
- **Discord Bot**: See [Discord Integration Guide](./integrations/DISCORD.md)
- **Web API**: See [API Reference](./API_REFERENCE.md)

### 3. Add Schema Validation

Validate your intents before signing:

```javascript
const { validateIntent } = require('./Aureus-Sentinel/bridge/schema_validator');

const validation = validateIntent(intent);
if (!validation.valid) {
  console.error('Invalid intent:', validation.errors);
}
```

### 4. Set Up Production KMS

For production, use AWS KMS instead of ephemeral keys:

```bash
USE_KMS=true \
KMS_KEY_ARN=arn:aws:kms:us-east-1:123456789:key/abc-123 \
node server.js
```

See [KMS Integration Guide](./key_management_and_kms.md) for details.

### 5. Enable Audit Logging

Track all signed intents:

```javascript
const { AuditLogger } = require('./Aureus-Sentinel/bridge/audit_logger');

const logger = new AuditLogger();
await logger.logIntent(intent, signature);
```

### 6. Use the CLI Tool

For quick testing, use the Aureus CLI:

```bash
# Install CLI
npm install -g @aureus-sentinel/cli

# Sign an intent
aureus sign ./my-intent.json

# Verify a signature
aureus verify ./my-intent.json --signature abc123...
```

See [CLI Documentation](./CLI.md) for full reference.

---

## Quick Reference

### Sign an Intent

```javascript
const response = await fetch('http://localhost:3000/sign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: intent, ttl: 300 })
});
const { signature } = await response.json();
```

### Verify a Signature

```javascript
const response = await fetch('http://localhost:3000/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: intent, signature })
});
const { valid } = await response.json();
```

### Check Server Health

```bash
curl http://localhost:3000/health
```

### Get Public Key

```bash
curl http://localhost:3000/public-key
```

---

## Common Issues

### Port 3000 Already in Use

```bash
# Use a different port
PORT=3001 node server.js
```

Then update your fetch URL to `http://localhost:3001`.

### Signature Verification Fails

**Cause:** Payload was modified after signing

**Solution:** Ensure payload is **exactly** the same (including whitespace, field order)

### Connection Refused

**Cause:** Bridge server not running

**Solution:** Start the Bridge in a separate terminal: `node server.js`

### TTL Expired

**Cause:** Signature older than TTL (default: 5 minutes)

**Solution:** Re-sign the intent or increase TTL

---

## Help & Resources

- **📖 Full Documentation**: [docs/](.)
- **🔧 API Reference**: [API_REFERENCE.md](./API_REFERENCE.md)
- **🐛 Troubleshooting**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **💬 Discord**: [Join our community](https://discord.gg/aureus-sentinel)
- **🐙 GitHub Issues**: [Report bugs](https://github.com/farmountain/Aureus-Sentinel/issues)

---

## Feedback

We'd love to hear from you! Was this guide helpful? What can we improve?

- **Feedback Form**: [https://forms.gle/aureus-feedback](https://forms.gle/aureus-feedback)
- **Email**: developers@aureus-sentinel.io
- **Twitter**: [@AureusSentinel](https://twitter.com/AureusSentinel)

---

**Welcome to the Aureus Sentinel community!** 🎉

Happy building! 🚀
