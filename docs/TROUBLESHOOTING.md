# Aureus Sentinel Troubleshooting Guide

Comprehensive troubleshooting guide for common issues, error messages, and debugging techniques.

## Table of Contents

- [Connection Issues](#connection-issues)
- [Signing Issues](#signing-issues)
- [Verification Issues](#verification-issues)
- [Schema Validation Issues](#schema-validation-issues)
- [Performance Issues](#performance-issues)
- [KMS Issues](#kms-issues)
- [Error Reference](#error-reference)
- [Debugging Techniques](#debugging-techniques)
- [FAQ](#faq)

---

## Connection Issues

### Problem: Connection Refused (ECONNREFUSED)

**Symptoms:**
```
Error: Request failed: ECONNREFUSED
NetworkError: Failed to connect to Bridge
```

**Causes:**
1. Bridge server not running
2. Wrong URL or port
3. Firewall blocking connection

**Solutions:**

```bash
# 1. Check if server is running
ps aux | grep "node.*server.js"

# 2. Start Bridge server
node Aureus-Sentinel/bridge/server.js

# 3. Verify port (default: 3000)
netstat -an | grep 3000

# 4. Test with curl
curl http://localhost:3000/health

# 5. Check firewall (Windows)
netsh advfirewall firewall show rule name=all | findstr 3000

# 6. Check firewall (Linux)
sudo ufw status
```

### Problem: Timeout Errors

**Symptoms:**
```
Error: Request failed: AbortError
NetworkError: Request timeout after 30000ms
```

**Causes:**
1. Server overloaded
2. Network latency
3. Long-running operations

**Solutions:**

```javascript
// Increase timeout
const client = new BridgeClient({
  baseUrl: 'http://localhost:3000',
  timeout: 60000  // 60 seconds
});

// Enable retries
const client = new BridgeClient({
  baseUrl: 'http://localhost:3000',
  retries: 5,
  retryDelay: 2000
});
```

### Problem: DNS Resolution Failed

**Symptoms:**
```
Error: getaddrinfo ENOTFOUND bridge.example.com
```

**Solutions:**

```bash
# Test DNS resolution
nslookup bridge.example.com

# Ping the host
ping bridge.example.com

# Use IP address instead
const client = new BridgeClient('http://192.168.1.100:3000');

# Check /etc/hosts (Linux/Mac)
cat /etc/hosts

# Check C:\Windows\System32\drivers\etc\hosts (Windows)
type C:\Windows\System32\drivers\etc\hosts
```

---

## Signing Issues

### Problem: Invalid Payload

**Symptoms:**
```
SigningError: Payload must be a valid object
HTTP 400: Invalid payload format
```

**Causes:**
1. Payload is null, undefined, or not an object
2. Circular references in payload
3. Non-serializable values (functions, symbols)

**Solutions:**

```javascript
// ❌ Wrong - not an object
await client.sign("string");
await client.sign(123);
await client.sign(null);

// ✅ Correct - valid objects
await client.sign({ test: 'data' });
await client.sign({ intentId: 'abc', channelId: 'api' });

// Check for circular references
function hasCircularRef(obj) {
  try {
    JSON.stringify(obj);
    return false;
  } catch (error) {
    return true;
  }
}

if (hasCircularRef(payload)) {
  console.error('Payload has circular references');
}

// Remove non-serializable values
const cleanPayload = JSON.parse(JSON.stringify(payload));
```

### Problem: Schema Validation Failed

**Symptoms:**
```
HTTP 400: Schema validation failed
Error: .channelId: must be string
Error: .riskLevel: must be one of [low, medium, high]
```

**Solutions:**

```javascript
// Validate before signing
const Ajv = require('ajv');
const ajv = new Ajv();

// Load schema
const schema = require('./contracts/v1/intent.schema.json');
const validate = ajv.compile(schema);

// Validate payload
const valid = validate(intent);
if (!valid) {
  console.error('Validation errors:', validate.errors);
  // Fix errors before signing
}

// Use CLI to validate
// $ aureus validate --file intent.json --schema contracts/v1/intent.schema.json
```

### Problem: Key Not Found

**Symptoms:**
```
Error: ENOENT: no such file or directory '/path/to/private.pem'
SigningError: Private key not configured
```

**Solutions:**

```bash
# Check if key exists
ls -la /path/to/private.pem

# Generate new key
aureus keygen --output ./keys

# Set environment variable
export PRIVATE_KEY_PATH=/path/to/private.pem

# Or configure in server
// server.js
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH || './keys/private.pem';
```

---

## Verification Issues

### Problem: Invalid Signature

**Symptoms:**
```
{ valid: false, message: 'Invalid signature' }
VerificationError: Signature verification failed
```

**Causes:**
1. Payload modified after signing
2. Wrong public key
3. Signature corrupted
4. Timestamp/whitespace differences

**Solutions:**

```javascript
// 1. Ensure payload hasn't changed
const originalPayload = { test: 'data' };
const { signature } = await client.sign(originalPayload);

// ❌ This will fail - payload modified
originalPayload.test = 'modified';
await client.verify(originalPayload, signature); // invalid: true

// ✅ Use original unmodified payload
const payload = { test: 'data' };
const { signature } = await client.sign(payload);
await client.verify(payload, signature); // valid: true

// 2. Check public key
const publicKey = await client.getPublicKey();
console.log('Using public key:', publicKey);

// 3. Verify signature format
if (!/^[0-9a-f]+$/i.test(signature)) {
  console.error('Invalid signature format (expected hex)');
}

// 4. Compare payloads byte-by-byte
const original = JSON.stringify(payload1);
const modified = JSON.stringify(payload2);
console.log('Payloads match:', original === modified);
```

### Problem: Signature Expired

**Symptoms:**
```
{ valid: false, message: 'Signature has expired' }
HTTP 400: Signature expired
```

**Solutions:**

```javascript
// Check expiration
const result = await client.sign(payload, { ttl: 300 });
const now = Date.now();
const expiresAt = result.expiresAt;

console.log('Expires in:', (expiresAt - now) / 1000, 'seconds');

if (now > expiresAt) {
  console.log('Signature expired, re-signing...');
  const newResult = await client.sign(payload, { ttl: 600 });
}

// Use longer TTL for long-running operations
await client.sign(payload, { ttl: 3600 }); // 1 hour
```

### Problem: Public Key Mismatch

**Symptoms:**
```
{ valid: false, message: 'Public key mismatch' }
VerificationError: Wrong public key
```

**Solutions:**

```javascript
// Fetch the correct public key
const publicKey = await client.getPublicKey();

// Use the same public key for verification
const { signature } = await client.sign(payload);
await client.verify(payload, signature, publicKey);

// Or let client fetch automatically
await client.verify(payload, signature); // Uses server's public key

// Check key rotation
// If keys rotated, old signatures won't verify with new key
// Store publicKey with signature for verification later
const signResult = await client.sign(payload);
const stored = {
  payload,
  signature: signResult.signature,
  publicKey: signResult.publicKey,  // Store this!
  expiresAt: signResult.expiresAt
};
```

---

## Schema Validation Issues

### Problem: Missing Required Field

**Symptoms:**
```
Error: .channelId: must have required property 'channelId'
HTTP 400: Missing required field
```

**Solutions:**

```javascript
// Check schema requirements
const schema = require('./contracts/v1/intent.schema.json');
console.log('Required fields:', schema.required);

// Ensure all required fields present
const intent = {
  version: '1.0',           // required
  type: 'intent.envelope',  // required
  intentId: crypto.randomUUID(), // required
  channelId: 'api',         // required ✓
  tool: 'web_search',       // required
  parameters: {},           // required
  riskLevel: 'low',         // required
  description: 'Test',      // required
  timestamp: new Date().toISOString() // required
};

// Use createIntent helper
const result = await client.createIntent({
  channelId: 'api',
  tool: 'web_search',
  description: 'Test',
  parameters: {},
  riskLevel: 'low'
});
```

### Problem: Invalid Type

**Symptoms:**
```
Error: .parameters: must be object
Error: .riskLevel: must be equal to one of the allowed values
```

**Solutions:**

```javascript
// Check types
const intent = {
  // ❌ Wrong types
  parameters: "string",  // should be object
  riskLevel: "invalid",  // should be: low, medium, high
  
  // ✅ Correct types
  parameters: { query: 'test' },
  riskLevel: 'low'
};

// Validate types before submission
function validateIntent(intent) {
  if (typeof intent.parameters !== 'object') {
    throw new Error('parameters must be object');
  }
  
  const validRiskLevels = ['low', 'medium', 'high'];
  if (!validRiskLevels.includes(intent.riskLevel)) {
    throw new Error(`riskLevel must be one of: ${validRiskLevels.join(', ')}`);
  }
}
```

---

## Performance Issues

### Problem: Slow Signing

**Symptoms:**
- Signing takes >1 second
- High latency in production

**Solutions:**

```javascript
// 1. Use batch operations
const payloads = [intent1, intent2, intent3];
const results = await client.signBatch(payloads);

// 2. Reduce payload size
// Remove unnecessary fields
const minimal = {
  intentId: intent.intentId,
  channelId: intent.channelId,
  // ... only what's needed
};

// 3. Use connection pooling (production)
const client = new BridgeClient({
  baseUrl: 'http://localhost:3000',
  headers: {
    'Connection': 'keep-alive'
  }
});

// 4. Monitor performance
const start = Date.now();
await client.sign(payload);
const duration = Date.now() - start;
console.log(`Sign took ${duration}ms`);

// 5. Run performance tests
const { PerformanceTest } = require('./Aureus-Sentinel/performance/performance_framework');

const test = new PerformanceTest({
  testFunction: async () => await client.sign(payload),
  duration: 10000,
  concurrency: 10
});

const report = await test.run();
console.log(`P50: ${report.p50}ms, P99: ${report.p99}ms`);
```

### Problem: Memory Leaks

**Symptoms:**
- Memory usage grows over time
- Application crashes with OOM

**Solutions:**

```javascript
// 1. Profile memory usage
const { MemoryProfiler } = require('./Aureus-Sentinel/performance/profiler');

const profiler = new MemoryProfiler();
profiler.start();

// Run operations
for (let i = 0; i < 1000; i++) {
  await client.sign(payload);
}

const report = profiler.stop();
console.log('Memory report:', report);

// 2. Clear caches periodically
client.publicKeyFetched = false;
client.publicKey = null;

// 3. Use connection limits
const client = new BridgeClient({
  baseUrl: 'http://localhost:3000',
  timeout: 30000,
  headers: {
    'Connection': 'close'  // Don't keep connections alive
  }
});

// 4. Monitor Node.js heap
setInterval(() => {
  const used = process.memoryUsage();
  console.log('Memory usage:');
  console.log(`  RSS: ${Math.round(used.rss / 1024 / 1024)}MB`);
  console.log(`  Heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}, 60000);
```

### Problem: Throughput Too Low

**Symptoms:**
- Can't handle required RPS
- Requests queuing up

**Solutions:**

```javascript
// 1. Horizontal scaling (multiple Bridge instances)
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  // Start Bridge server
  require('./Aureus-Sentinel/bridge/server.js');
}

// 2. Load balancer configuration (nginx)
/*
upstream bridge_backend {
    server localhost:3000;
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
}

server {
    listen 80;
    location / {
        proxy_pass http://bridge_backend;
    }
}
*/

// 3. Client-side load balancing
const servers = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002'
];

let currentServer = 0;

async function signWithLoadBalancing(payload) {
  const url = servers[currentServer];
  currentServer = (currentServer + 1) % servers.length;
  
  const client = new BridgeClient(url);
  return await client.sign(payload);
}

// 4. Run scaling tests
const { HorizontalScalingTester } = require('./Aureus-Sentinel/performance/scaling_tests');

const tester = new HorizontalScalingTester();
const results = await tester.testScaling([1, 2, 4, 8]);

results.forEach(r => {
  console.log(`Workers: ${r.workers}, RPS: ${r.rps}, Efficiency: ${r.efficiency}%`);
});
```

---

## KMS Issues

### Problem: KMS Authentication Failed

**Symptoms:**
```
Error: Access Denied (KMS)
Error: InvalidClientTokenId
```

**Solutions:**

```bash
# Check AWS credentials
aws sts get-caller-identity

# Set credentials
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_REGION=us-east-1

# Test KMS access
aws kms list-keys

# Check KMS key policy
aws kms get-key-policy --key-id alias/aureus-bridge --policy-name default

# Grant permissions (if admin)
aws kms create-grant \
  --key-id alias/aureus-bridge \
  --grantee-principal arn:aws:iam::123456789012:role/bridge-role \
  --operations Sign Verify GetPublicKey
```

### Problem: KMS Key Not Found

**Symptoms:**
```
Error: Key 'alias/aureus-bridge' not found
NotFoundException: Key ... does not exist
```

**Solutions:**

```bash
# List available keys
aws kms list-keys
aws kms list-aliases

# Create new key
aws kms create-key \
  --key-spec ECC_NIST_P384 \
  --key-usage SIGN_VERIFY \
  --description "Aureus Sentinel Bridge signing key"

# Create alias
aws kms create-alias \
  --alias-name alias/aureus-bridge \
  --target-key-id <key-id>

# Update configuration
// aws_kms_adapter.js
constructor(options = {}) {
  this.keyId = options.keyId || process.env.KMS_KEY_ID || 'alias/aureus-bridge';
  // ...
}
```

### Problem: KMS Rate Limit Exceeded

**Symptoms:**
```
Error: Rate exceeded (KMS)
ThrottlingException
```

**Solutions:**

```javascript
// Implement caching
const cache = new Map();

async function signWithCache(payload) {
  const key = JSON.stringify(payload);
  
  if (cache.has(key)) {
    return cache.get(key);
  }
  
  const result = await client.sign(payload);
  cache.set(key, result);
  
  return result;
}

// Implement exponential backoff
async function signWithBackoff(payload, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.sign(payload);
    } catch (error) {
      if (error.code === 'ThrottlingException' && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

// Request limit increase
// https://console.aws.amazon.com/servicequotas/
// Service: AWS Key Management Service
// Quota: Cryptographic operations (RSA) request rate
```

---

## Error Reference

### HTTP Status Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 400 | Bad Request | Invalid payload, schema validation failed |
| 401 | Unauthorized | Missing or invalid API key |
| 404 | Not Found | Invalid endpoint |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error, check logs |
| 503 | Service Unavailable | Server overloaded or down |

### Application Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `SIGNING_ERROR` | Failed to sign payload | Check payload format, key configuration |
| `VERIFICATION_ERROR` | Failed to verify signature | Ensure payload unchanged, correct public key |
| `NETWORK_ERROR` | Network/connection issue | Check server status, network connectivity |
| `SCHEMA_VALIDATION_ERROR` | Payload doesn't match schema | Validate against schema, fix errors |
| `KEY_NOT_FOUND` | Private key not found | Check key path, generate new key |
| `EXPIRED_SIGNATURE` | Signature expired | Re-sign with longer TTL |

---

## Debugging Techniques

### Enable Debug Logging

```javascript
// Set environment variable
process.env.DEBUG = 'aureus:*';

// Or use debug module
const debug = require('debug')('aureus:client');

debug('Signing payload:', payload);
debug('Response:', response);

// Server-side logging
// server.js
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  next();
});
```

### Capture Network Traffic

```bash
# Use tcpdump (Linux/Mac)
sudo tcpdump -i any -A 'port 3000'

# Use Wireshark
# Filter: tcp.port == 3000

# Use curl with verbose
curl -v http://localhost:3000/health

# Use node-fetch with logging
const fetch = require('node-fetch');

const originalFetch = global.fetch;
global.fetch = async (...args) => {
  console.log('Fetch:', args[0], args[1]);
  const response = await originalFetch(...args);
  console.log('Response:', response.status, response.statusText);
  return response;
};
```

### Inspect Payloads

```javascript
// Compare payloads
const crypto = require('crypto');

function hashPayload(payload) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

const hash1 = hashPayload(payload1);
const hash2 = hashPayload(payload2);

console.log('Payloads match:', hash1 === hash2);

// View exact bytes
const buffer = Buffer.from(JSON.stringify(payload));
console.log('Hex:', buffer.toString('hex'));
console.log('Base64:', buffer.toString('base64'));
```

### Profile Performance

```javascript
// Use built-in profiler
const { Profiler } = require('./Aureus-Sentinel/performance/profiler');

const profiler = new Profiler();

profiler.startFunction('sign');
await client.sign(payload);
profiler.stopFunction('sign');

profiler.printResults();

// Use Node.js profiler
node --prof server.js
# Generate report
node --prof-process isolate-*.log > profile.txt

// Use Chrome DevTools
node --inspect server.js
# Open chrome://inspect
```

---

## FAQ

### Q: How do I rotate keys?

**A:** Generate new key pair, update server configuration, gradually phase out old key:

```bash
# 1. Generate new key
aureus keygen --output ./keys-new

# 2. Update server with both keys
PRIVATE_KEY_PATH=./keys-new/private.pem node server.js

# 3. Update clients to use new public key
const newPublicKey = await client.getPublicKey();

# 4. After grace period, remove old key
```

### Q: Can I use multiple Bridge instances?

**A:** Yes, deploy multiple instances with load balancer:

```javascript
// Option 1: Round-robin
const servers = ['http://bridge1:3000', 'http://bridge2:3000'];
const client = new BridgeClient(servers[Math.floor(Math.random() * servers.length)]);

// Option 2: Load balancer (nginx, HAProxy)
const client = new BridgeClient('http://loadbalancer:80');
```

### Q: How do I secure the Bridge in production?

**A:**
1. Use HTTPS with valid certificates
2. Enable API key authentication
3. Set up rate limiting
4. Use KMS for key management
5. Enable audit logging
6. Restrict network access (firewall, VPC)

```javascript
// Example production config
const client = new BridgeClient({
  baseUrl: 'https://bridge.example.com',
  apiKey: process.env.BRIDGE_API_KEY,
  timeout: 30000,
  retries: 3
});
```

### Q: What's the recommended TTL for signatures?

**A:**
- Short-lived operations (API requests): 300s (5 min)
- Medium-duration (batch jobs): 3600s (1 hour)
- Long-running (background tasks): 86400s (24 hours)

```javascript
// Based on use case
await client.sign(payload, { ttl: 300 });     // API requests
await client.sign(payload, { ttl: 3600 });    // Batch processing
await client.sign(payload, { ttl: 86400 });   // Background tasks
```

### Q: How do I migrate from local keys to KMS?

**A:**

```bash
# 1. Set up KMS key
aws kms create-key --key-spec ECC_NIST_P384 --key-usage SIGN_VERIFY

# 2. Update server configuration
USE_KMS=true
KMS_KEY_ID=alias/aureus-bridge
AWS_REGION=us-east-1

# 3. Restart server
node server.js

# 4. Test signing with KMS
aureus test

# 5. Old signatures remain valid with local key
# New signatures use KMS
```

---

## Getting Help

### Check Logs

```bash
# Server logs
tail -f server.log

# Application logs
grep ERROR *.log

# System logs (Linux)
journalctl -u aureus-bridge

# Windows Event Viewer
eventvwr.msc
```

### Community Support

- GitHub Issues: https://github.com/yourusername/aureus-sentinel/issues
- Documentation: [GETTING_STARTED.md](GETTING_STARTED.md), [API_REFERENCE.md](API_REFERENCE.md)
- Examples: See `Aureus-Sentinel/examples/`

### Reporting Bugs

Include:
1. Error message (full stack trace)
2. Steps to reproduce
3. Environment (Node.js version, OS, Bridge version)
4. Relevant configuration
5. Sample code (minimal reproducible example)

```bash
# Gather environment info
node --version
npm --version
cat package.json | grep version
uname -a  # Linux/Mac
systeminfo  # Windows
```

---

**Last Updated:** Week 11 - Documentation & Developer Experience
