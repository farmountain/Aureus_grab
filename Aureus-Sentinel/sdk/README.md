# Aureus Sentinel Bridge Client SDK

Official JavaScript/TypeScript SDK for interacting with the Aureus Sentinel Bridge.

## Installation

```bash
npm install @aureus-sentinel/bridge-client
```

## Quick Start

```javascript
const { BridgeClient } = require('@aureus-sentinel/bridge-client');

// Create client
const client = new BridgeClient('http://localhost:3000');

// Sign an intent
const intent = {
  version: '1.0',
  type: 'intent.envelope',
  intentId: 'abc-123',
  channelId: 'api',
  tool: 'web_search',
  parameters: { query: 'Hello' },
  riskLevel: 'low',
  description: 'Search query',
  timestamp: new Date().toISOString()
};

const { signature, expiresAt } = await client.sign(intent, { ttl: 300 });
console.log('Signature:', signature);

// Verify signature
const { valid } = await client.verify(intent, signature);
console.log('Valid:', valid);
```

## Features

- ✅ **Type-safe**: Full TypeScript support with complete type definitions
- ✅ **Easy to use**: Intuitive API with sensible defaults
- ✅ **Automatic retries**: Configurable retry logic for network errors
- ✅ **Error handling**: Detailed error types with helpful messages
- ✅ **Batch operations**: Sign and verify multiple payloads efficiently
- ✅ **Fluent API**: Intent builder for creating intents with method chaining

## Usage

### Basic Operations

#### Sign a Payload

```javascript
const signResult = await client.sign(payload, { ttl: 300 });
/*
{
  signature: '3045022100...',
  timestamp: 1704067200000,
  expiresAt: 1704067500000,
  publicKey: 'LS0tLS1CRUdJTi...'
}
*/
```

#### Verify a Signature

```javascript
const verifyResult = await client.verify(payload, signature);
/*
{
  valid: true,
  message: 'Signature is valid'
}
*/
```

#### Get Public Key

```javascript
const publicKey = await client.getPublicKey();
console.log('Public Key:', publicKey);
```

#### Health Check

```javascript
const health = await client.health();
/*
{
  status: 'ok',
  uptime: 12345,
  timestamp: 1704067200000,
  version: '1.0.0'
}
*/
```

### Advanced Operations

#### Create and Sign Intent

```javascript
const signedIntent = await client.createIntent({
  channelId: 'telegram',
  tool: 'file_upload',
  parameters: { filename: 'data.csv' },
  riskLevel: 'medium',
  description: 'Upload CSV file'
});
/*
{
  intent: { ... },
  signature: '3045022100...',
  expiresAt: 1704067500000
}
*/
```

#### Intent Builder (Fluent API)

```javascript
const { createIntent } = require('@aureus-sentinel/bridge-client');

const signResult = await createIntent()
  .channel('api')
  .tool('web_search')
  .parameters({ query: 'TypeScript tutorial' })
  .risk('low')
  .describe('Search for TypeScript tutorial')
  .metadata({ userId: '123', sessionId: 'abc' })
  .sign(client, { ttl: 600 });
```

#### Batch Sign

```javascript
const payloads = [intent1, intent2, intent3];
const results = await client.signBatch(payloads, { ttl: 300 });

results.forEach((result, i) => {
  console.log(`Intent ${i}: ${result.signature}`);
});
```

#### Batch Verify

```javascript
const items = [
  { payload: intent1, signature: sig1 },
  { payload: intent2, signature: sig2 },
  { payload: intent3, signature: sig3 }
];

const results = await client.verifyBatch(items);
results.forEach((result, i) => {
  console.log(`Intent ${i} valid: ${result.valid}`);
});
```

#### Sign and Verify (Testing)

```javascript
// Convenience method for testing
const result = await client.signAndVerify(intent, { ttl: 300 });
/*
{
  signature: '3045022100...',
  timestamp: 1704067200000,
  expiresAt: 1704067500000,
  publicKey: 'LS0tLS1CRUdJTi...',
  valid: true,
  message: 'Signature is valid'
}
*/
```

## Configuration

### Basic Configuration

```javascript
const client = new BridgeClient('http://localhost:3000');
```

### Advanced Configuration

```javascript
const client = new BridgeClient({
  baseUrl: 'http://localhost:3000',
  timeout: 30000,        // Request timeout (ms)
  retries: 3,            // Number of retries
  retryDelay: 1000,      // Delay between retries (ms)
  apiKey: 'your-api-key', // Optional API key
  headers: {             // Custom headers
    'X-Client-Version': '1.0.0'
  }
});
```

## Error Handling

The SDK provides specific error types for different failure scenarios:

```javascript
const { 
  BridgeClientError, 
  SigningError, 
  VerificationError, 
  NetworkError 
} = require('@aureus-sentinel/bridge-client');

try {
  await client.sign(intent);
} catch (error) {
  if (error instanceof SigningError) {
    console.error('Signing failed:', error.message);
    console.error('Details:', error.details);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
    // Retries already attempted
  } else if (error instanceof VerificationError) {
    console.error('Verification failed:', error.message);
  } else if (error instanceof BridgeClientError) {
    console.error('Client error:', error.message);
    console.error('Code:', error.code);
  }
}
```

## TypeScript Support

Full TypeScript definitions included:

```typescript
import { 
  BridgeClient, 
  BridgeClientOptions,
  SignResult,
  VerifyResult,
  IntentData,
  createIntent
} from '@aureus-sentinel/bridge-client';

const client = new BridgeClient({
  baseUrl: 'http://localhost:3000',
  timeout: 30000
} as BridgeClientOptions);

const signResult: SignResult = await client.sign(payload);
const verifyResult: VerifyResult = await client.verify(payload, signResult.signature);
```

## Examples

### Example 1: Simple Intent

```javascript
const { BridgeClient } = require('@aureus-sentinel/bridge-client');
const client = new BridgeClient('http://localhost:3000');

const intent = {
  version: '1.0',
  type: 'intent.envelope',
  intentId: 'intent-001',
  channelId: 'api',
  tool: 'calculator',
  parameters: { operation: 'add', a: 5, b: 3 },
  riskLevel: 'low',
  description: 'Calculate 5 + 3',
  timestamp: new Date().toISOString()
};

const { signature } = await client.sign(intent);
console.log('Signed successfully:', signature);
```

### Example 2: With Verification

```javascript
// Sign
const signResult = await client.sign(intent, { ttl: 300 });

// Store signature with intent
const signedIntent = {
  ...intent,
  signature: signResult.signature,
  expiresAt: signResult.expiresAt
};

// Later, verify
const { valid, message } = await client.verify(
  intent, 
  signedIntent.signature
);

if (valid) {
  console.log('Intent is authentic');
} else {
  console.error('Invalid signature:', message);
}
```

### Example 3: Intent Builder

```javascript
const { BridgeClient, createIntent } = require('@aureus-sentinel/bridge-client');
const client = new BridgeClient('http://localhost:3000');

const result = await createIntent()
  .channel('telegram')
  .tool('send_message')
  .parameters({ chat_id: 123, text: 'Hello!' })
  .risk('low')
  .describe('Send greeting message')
  .sign(client);

console.log('Intent signed:', result.signature);
```

### Example 4: Batch Processing

```javascript
const intents = [
  { /* intent 1 */ },
  { /* intent 2 */ },
  { /* intent 3 */ }
];

// Sign all intents
const signatures = await client.signBatch(intents, { ttl: 300 });

// Create verification items
const verifyItems = intents.map((intent, i) => ({
  payload: intent,
  signature: signatures[i].signature
}));

// Verify all signatures
const verifyResults = await client.verifyBatch(verifyItems);

verifyResults.forEach((result, i) => {
  console.log(`Intent ${i}: ${result.valid ? 'Valid' : 'Invalid'}`);
});
```

## API Reference

See [API_REFERENCE.md](../docs/API_REFERENCE.md) for complete API documentation.

## Troubleshooting

### Connection Refused

```javascript
// Error: Request failed: ECONNREFUSED
```

**Solution**: Ensure Bridge server is running:
```bash
node Aureus-Sentinel/bridge/server.js
```

### Timeout Errors

```javascript
// Error: Request failed: AbortError
```

**Solution**: Increase timeout or check server load:
```javascript
const client = new BridgeClient({
  baseUrl: 'http://localhost:3000',
  timeout: 60000  // Increase to 60 seconds
});
```

### Invalid Signature

```javascript
// { valid: false, message: 'Invalid signature' }
```

**Solution**: Ensure payload hasn't been modified after signing. Even whitespace changes invalidate signatures.

## Testing

```bash
npm test
```

## License

MIT

## Support

For issues and questions:
- GitHub Issues: https://github.com/yourusername/aureus-sentinel/issues
- Documentation: See [GETTING_STARTED.md](../docs/GETTING_STARTED.md)
