# Aureus Sentinel Bridge - API Reference

**Version:** 1.0  
**Base URL:** `http://localhost:3000` (development)  
**Protocol:** HTTP/HTTPS  
**Format:** JSON

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [POST /sign](#post-sign)
  - [POST /verify](#post-verify)
  - [GET /health](#get-health)
  - [GET /public-key](#get-public-key)
- [Data Models](#data-models)
- [Error Codes](#error-codes)
- [Rate Limits](#rate-limits)
- [Examples](#examples)

---

## Overview

The Aureus Sentinel Bridge is a cryptographic signing service that provides ed25519 signature generation and verification for AI agent intents. It enforces TTL-based expiration and integrates with AWS KMS for production key management.

### Base URL

**Development:**
```
http://localhost:3000
```

**Production:**
```
https://bridge.aureus-sentinel.io
```

### Content Type

All requests and responses use `application/json`.

### Request Headers

```http
Content-Type: application/json
Accept: application/json
```

---

## Authentication

Currently, the Bridge API does not require authentication for public endpoints. In production deployments, consider adding:

- **API Keys:** HTTP header `X-API-Key`
- **OAuth 2.0:** Bearer token authentication
- **mTLS:** Mutual TLS for service-to-service communication

**Example with API Key (future):**
```http
POST /sign
X-API-Key: sk_live_abc123...
Content-Type: application/json
```

---

## Endpoints

### POST /sign

Generate a cryptographic signature for a payload (intent, plan, approval, etc.).

**URL:** `/sign`  
**Method:** `POST`  
**Auth:** None (currently)

#### Request Body

```json
{
  "payload": {
    "version": "1.0",
    "type": "intent.envelope",
    "intentId": "123e4567-e89b-12d3-a456-426614174000",
    "channelId": "telegram",
    "tool": "web_search",
    "parameters": {
      "query": "latest AI news"
    },
    "riskLevel": "low",
    "description": "Search for AI news",
    "timestamp": "2024-01-15T10:30:00.000Z"
  },
  "ttl": 300
}
```

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payload` | object | Yes | The data to sign (any JSON object) |
| `ttl` | number | No | Time-to-live in seconds (default: 300) |

#### Response (200 OK)

```json
{
  "signature": "a7b3c9d2e1f4g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f0",
  "timestamp": 1705315800000,
  "expiresAt": 1705316100000,
  "publicKey": "3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9=="
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `signature` | string | Hex-encoded ed25519 signature |
| `timestamp` | number | Unix timestamp (ms) when signed |
| `expiresAt` | number | Unix timestamp (ms) when signature expires |
| `publicKey` | string | Base64-encoded public key for verification |

#### Error Responses

**400 Bad Request** - Invalid payload or TTL
```json
{
  "error": "Invalid payload",
  "message": "Payload must be a valid JSON object"
}
```

**500 Internal Server Error** - Signing failure
```json
{
  "error": "Signing failed",
  "message": "Unable to generate signature"
}
```

#### Example cURL

```bash
curl -X POST http://localhost:3000/sign \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "intentId": "123e4567-e89b-12d3-a456-426614174000",
      "action": "execute"
    },
    "ttl": 300
  }'
```

#### Example JavaScript

```javascript
const response = await fetch('http://localhost:3000/sign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    payload: {
      intentId: '123e4567-e89b-12d3-a456-426614174000',
      action: 'execute'
    },
    ttl: 300
  })
});

const { signature, expiresAt } = await response.json();
console.log('Signature:', signature);
console.log('Expires at:', new Date(expiresAt));
```

---

### POST /verify

Verify a signature against a payload.

**URL:** `/verify`  
**Method:** `POST`  
**Auth:** None (currently)

#### Request Body

```json
{
  "payload": {
    "intentId": "123e4567-e89b-12d3-a456-426614174000",
    "action": "execute"
  },
  "signature": "a7b3c9d2e1f4g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f0",
  "publicKey": "3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9=="
}
```

#### Request Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `payload` | object | Yes | The original data that was signed |
| `signature` | string | Yes | Hex-encoded signature to verify |
| `publicKey` | string | No | Base64 public key (uses server's if omitted) |

#### Response (200 OK)

```json
{
  "valid": true,
  "message": "Signature is valid"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `valid` | boolean | `true` if signature is valid, `false` otherwise |
| `message` | string | Human-readable verification result |

#### Error Responses

**400 Bad Request** - Missing required fields
```json
{
  "error": "Missing signature",
  "message": "Signature is required for verification"
}
```

**200 OK** - Invalid signature (not an error, just false result)
```json
{
  "valid": false,
  "message": "Signature verification failed"
}
```

#### Example cURL

```bash
curl -X POST http://localhost:3000/verify \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {"intentId": "123", "action": "execute"},
    "signature": "a7b3c9d2...",
    "publicKey": "3a4b5c6d..."
  }'
```

#### Example JavaScript

```javascript
const response = await fetch('http://localhost:3000/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    payload: { intentId: '123', action: 'execute' },
    signature: 'a7b3c9d2e1f4g5h6...',
    publicKey: '3a4b5c6d7e8f9g0h...'
  })
});

const { valid, message } = await response.json();
console.log('Valid:', valid);
console.log('Message:', message);
```

---

### GET /health

Health check endpoint for monitoring and load balancers.

**URL:** `/health`  
**Method:** `GET`  
**Auth:** None

#### Response (200 OK)

```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": 1705315800000,
  "version": "1.0.0",
  "kms": {
    "enabled": true,
    "region": "us-east-1"
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `healthy` or `unhealthy` |
| `uptime` | number | Server uptime in seconds |
| `timestamp` | number | Current Unix timestamp (ms) |
| `version` | string | Bridge service version |
| `kms` | object | KMS configuration (if enabled) |

#### Example cURL

```bash
curl http://localhost:3000/health
```

---

### GET /public-key

Retrieve the server's public key for signature verification.

**URL:** `/public-key`  
**Method:** `GET`  
**Auth:** None

#### Response (200 OK)

```json
{
  "publicKey": "3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9==",
  "algorithm": "ed25519",
  "keyId": "bridge-key-001"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `publicKey` | string | Base64-encoded public key |
| `algorithm` | string | Signature algorithm (always `ed25519`) |
| `keyId` | string | Key identifier (for key rotation) |

#### Example cURL

```bash
curl http://localhost:3000/public-key
```

#### Example JavaScript

```javascript
const response = await fetch('http://localhost:3000/public-key');
const { publicKey } = await response.json();
console.log('Public Key:', publicKey);
```

---

## Data Models

### Intent Envelope

Schema: `contracts/v1/intent.schema.json`

```typescript
interface IntentEnvelope {
  version: string;              // "1.0"
  type: "intent.envelope";
  intentId: string;             // UUID v4
  channelId: string;            // "telegram" | "discord" | "slack" | "web" | "api"
  tool: string;                 // Tool name
  parameters: Record<string, any>;
  riskLevel: "low" | "medium" | "high" | "critical";
  description: string;
  timestamp: string;            // ISO 8601
  metadata?: Record<string, any>;
}
```

### Context Envelope

Schema: `contracts/v1/context.schema.json`

```typescript
interface ContextEnvelope {
  version: string;
  type: "context.envelope";
  contextId: string;
  intentId: string;
  executionContext: {
    environment: string;
    capabilities: string[];
    policy: string;
  };
  timestamp: string;
  metadata?: Record<string, any>;
}
```

### Plan Envelope

Schema: `contracts/v1/plan.schema.json`

```typescript
interface PlanEnvelope {
  version: string;
  type: "plan.envelope";
  planId: string;
  intentId: string;
  steps: PlanStep[];
  estimatedDuration: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface PlanStep {
  stepId: string;
  action: string;
  parameters: Record<string, any>;
  dependencies: string[];
  retryPolicy?: {
    maxAttempts: number;
    backoff: "linear" | "exponential";
  };
}
```

### Approval Envelope

Schema: `contracts/v1/approval.schema.json`

```typescript
interface ApprovalEnvelope {
  version: string;
  type: "approval.envelope";
  approvalId: string;
  planId: string;
  intentId: string;
  decision: "approved" | "rejected" | "conditional";
  approver: string;
  conditions?: string[];
  timestamp: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
}
```

### Report Envelope

Schema: `contracts/v1/report.schema.json`

```typescript
interface ReportEnvelope {
  version: string;
  type: "report.envelope";
  reportId: string;
  intentId: string;
  planId: string;
  status: "completed" | "failed" | "partial";
  results: Record<string, any>;
  errors?: Error[];
  timestamp: string;
  duration?: number;
  metadata?: Record<string, any>;
}
```

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid request parameters or payload |
| 401 | Unauthorized | Missing or invalid authentication (future) |
| 403 | Forbidden | Insufficient permissions (future) |
| 404 | Not Found | Endpoint does not exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | Server is temporarily unavailable |

### Application Error Codes

| Code | Error | Description |
|------|-------|-------------|
| `INVALID_PAYLOAD` | Invalid payload | Payload is not valid JSON or missing required fields |
| `INVALID_SIGNATURE` | Invalid signature | Signature format is invalid (not hex) |
| `VERIFICATION_FAILED` | Verification failed | Signature does not match payload |
| `EXPIRED_APPROVAL` | Approval expired | Signature TTL has exceeded |
| `SIGNING_ERROR` | Signing error | Unable to generate signature |
| `KMS_ERROR` | KMS error | AWS KMS operation failed |
| `RATE_LIMIT_EXCEEDED` | Rate limit exceeded | Too many requests from this client |

### Error Response Format

```json
{
  "error": "INVALID_PAYLOAD",
  "message": "Payload must be a valid JSON object",
  "details": {
    "field": "payload",
    "expected": "object",
    "received": "string"
  },
  "timestamp": 1705315800000,
  "requestId": "req_abc123"
}
```

---

## Rate Limits

### Default Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/sign` | 100 requests | per minute |
| `/verify` | 200 requests | per minute |
| `/health` | Unlimited | - |
| `/public-key` | Unlimited | - |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705315860
```

### Rate Limit Exceeded Response

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later.",
  "retryAfter": 60,
  "limit": 100,
  "window": 60
}
```

### Production Limits

For production deployments, rate limits can be customized:

```bash
# Environment variables
RATE_LIMIT_SIGN=1000
RATE_LIMIT_VERIFY=2000
RATE_LIMIT_WINDOW=60
```

---

## Examples

### Complete Intent Flow

#### 1. Submit Intent

```javascript
// Create intent
const intent = {
  version: '1.0',
  type: 'intent.envelope',
  intentId: crypto.randomUUID(),
  channelId: 'api',
  tool: 'web_search',
  parameters: { query: 'AI agents' },
  riskLevel: 'low',
  description: 'Search for AI agents',
  timestamp: new Date().toISOString()
};

// Sign intent
const signResponse = await fetch('http://localhost:3000/sign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: intent, ttl: 300 })
});

const { signature, expiresAt } = await signResponse.json();
console.log('Intent signed:', signature);
```

#### 2. Verify Before Execution

```javascript
// Before executing, verify signature
const verifyResponse = await fetch('http://localhost:3000/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    payload: intent,
    signature
  })
});

const { valid } = await verifyResponse.json();

if (valid && Date.now() < expiresAt) {
  console.log('✅ Signature valid, executing intent...');
  // Execute intent
} else {
  console.log('❌ Signature invalid or expired');
}
```

### Multi-Channel Integration

```javascript
// Telegram bot integration
bot.on('message', async (msg) => {
  const intent = {
    version: '1.0',
    type: 'intent.envelope',
    intentId: crypto.randomUUID(),
    channelId: 'telegram',
    tool: 'message_send',
    parameters: {
      chatId: msg.chat.id,
      text: msg.text
    },
    riskLevel: 'low',
    description: 'Send message via Telegram',
    timestamp: new Date().toISOString()
  };

  const signResponse = await fetch('http://localhost:3000/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: intent })
  });

  const { signature } = await signResponse.json();
  
  // Store signature with intent for audit trail
  await database.saveIntent(intent, signature);
});
```

### Error Handling

```javascript
async function signIntent(intent) {
  try {
    const response = await fetch('http://localhost:3000/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: intent })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Signing failed: ${error.message}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error signing intent:', error);
    
    // Fallback or retry logic
    if (error.message.includes('rate limit')) {
      await sleep(60000); // Wait 1 minute
      return signIntent(intent); // Retry
    }
    
    throw error;
  }
}
```

### Batch Signing

```javascript
// Sign multiple intents
async function signBatch(intents) {
  const signatures = await Promise.all(
    intents.map(async (intent) => {
      const response = await fetch('http://localhost:3000/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: intent })
      });
      return response.json();
    })
  );

  return intents.map((intent, i) => ({
    intent,
    signature: signatures[i].signature,
    expiresAt: signatures[i].expiresAt
  }));
}
```

---

## SDK Libraries

Official SDKs are available for easy integration:

- **JavaScript/TypeScript:** `@aureus-sentinel/bridge-client`
- **Python:** `aureus-sentinel` (coming soon)
- **Go:** `github.com/aureus-sentinel/go-client` (coming soon)

### JavaScript SDK Example

```bash
npm install @aureus-sentinel/bridge-client
```

```javascript
import { BridgeClient } from '@aureus-sentinel/bridge-client';

const client = new BridgeClient('http://localhost:3000');

// Sign
const { signature } = await client.sign(intent);

// Verify
const { valid } = await client.verify(intent, signature);
```

See [Developer SDK documentation](./SDK.md) for full API reference.

---

## See Also

- [Getting Started Tutorial](./GETTING_STARTED.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [Code Examples](../examples/)
- [Architecture Overview](./architecture_overview.md)
- [Security Best Practices](./SECURITY.md)

---

**Version:** 1.0  
**Last Updated:** 2024-01-16  
**Maintained by:** Aureus Sentinel Team
