/**
 * Aureus Sentinel Bridge Client SDK
 * 
 * Easy-to-use client library for interacting with the Aureus Sentinel Bridge.
 * 
 * Features:
 * - Sign and verify intents
 * - Type-safe interfaces
 * - Automatic retries
 * - Error handling
 * - TypeScript support
 * 
 * Usage:
 *   const client = new BridgeClient('http://localhost:3000');
 *   const { signature } = await client.sign(intent);
 * 
 * Week 11: Documentation & Developer Experience
 */

const crypto = require('crypto');

/**
 * Bridge Client Configuration
 */
class BridgeClientConfig {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.apiKey = options.apiKey || null;
    this.headers = options.headers || {};
  }
}

/**
 * Bridge Client Errors
 */
class BridgeClientError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = 'BridgeClientError';
    this.code = code;
    this.details = details;
  }
}

class SigningError extends BridgeClientError {
  constructor(message, details) {
    super(message, 'SIGNING_ERROR', details);
    this.name = 'SigningError';
  }
}

class VerificationError extends BridgeClientError {
  constructor(message, details) {
    super(message, 'VERIFICATION_ERROR', details);
    this.name = 'VerificationError';
  }
}

class NetworkError extends BridgeClientError {
  constructor(message, details) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

/**
 * Aureus Sentinel Bridge Client
 */
class BridgeClient {
  constructor(baseUrlOrConfig) {
    if (typeof baseUrlOrConfig === 'string') {
      this.config = new BridgeClientConfig({ baseUrl: baseUrlOrConfig });
    } else {
      this.config = new BridgeClientConfig(baseUrlOrConfig);
    }

    this.publicKey = null;
    this.publicKeyFetched = false;
  }

  /**
   * Sign a payload
   * 
   * @param {Object} payload - The payload to sign
   * @param {Object} options - Signing options
   * @param {number} options.ttl - Time-to-live in seconds (default: 300)
   * @returns {Promise<SignResult>}
   */
  async sign(payload, options = {}) {
    if (!payload || typeof payload !== 'object') {
      throw new SigningError('Payload must be a valid object', { payload });
    }

    const requestBody = {
      payload,
      ttl: options.ttl || 300
    };

    try {
      const response = await this._request('POST', '/sign', requestBody);
      
      return {
        signature: response.signature,
        timestamp: response.timestamp,
        expiresAt: response.expiresAt,
        publicKey: response.publicKey
      };
    } catch (error) {
      throw new SigningError(`Failed to sign payload: ${error.message}`, {
        payload,
        originalError: error
      });
    }
  }

  /**
   * Verify a signature
   * 
   * @param {Object} payload - The payload to verify
   * @param {string} signature - The signature to verify
   * @param {string} publicKey - Optional public key (uses server's if omitted)
   * @returns {Promise<VerifyResult>}
   */
  async verify(payload, signature, publicKey = null) {
    if (!payload || typeof payload !== 'object') {
      throw new VerificationError('Payload must be a valid object', { payload });
    }

    if (!signature || typeof signature !== 'string') {
      throw new VerificationError('Signature must be a valid string', { signature });
    }

    const requestBody = {
      payload,
      signature,
      ...(publicKey && { publicKey })
    };

    try {
      const response = await this._request('POST', '/verify', requestBody);
      
      return {
        valid: response.valid,
        message: response.message
      };
    } catch (error) {
      throw new VerificationError(`Failed to verify signature: ${error.message}`, {
        payload,
        signature,
        originalError: error
      });
    }
  }

  /**
   * Get server's public key
   * 
   * @returns {Promise<string>}
   */
  async getPublicKey() {
    if (this.publicKeyFetched && this.publicKey) {
      return this.publicKey;
    }

    try {
      const response = await this._request('GET', '/public-key');
      this.publicKey = response.publicKey;
      this.publicKeyFetched = true;
      return this.publicKey;
    } catch (error) {
      throw new BridgeClientError(`Failed to fetch public key: ${error.message}`, 'FETCH_ERROR', {
        originalError: error
      });
    }
  }

  /**
   * Check server health
   * 
   * @returns {Promise<HealthStatus>}
   */
  async health() {
    try {
      return await this._request('GET', '/health');
    } catch (error) {
      throw new BridgeClientError(`Health check failed: ${error.message}`, 'HEALTH_CHECK_ERROR', {
        originalError: error
      });
    }
  }

  /**
   * Sign and verify in one call (for testing)
   * 
   * @param {Object} payload - The payload to sign and verify
   * @param {Object} options - Signing options
   * @returns {Promise<SignAndVerifyResult>}
   */
  async signAndVerify(payload, options = {}) {
    const signResult = await this.sign(payload, options);
    const verifyResult = await this.verify(payload, signResult.signature, signResult.publicKey);
    
    return {
      ...signResult,
      ...verifyResult
    };
  }

  /**
   * Create and sign an intent
   * 
   * @param {Object} intentData - Intent data
   * @returns {Promise<SignedIntent>}
   */
  async createIntent(intentData) {
    const intent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: intentData.intentId || crypto.randomUUID(),
      channelId: intentData.channelId,
      tool: intentData.tool,
      parameters: intentData.parameters || {},
      riskLevel: intentData.riskLevel || 'low',
      description: intentData.description,
      timestamp: intentData.timestamp || new Date().toISOString(),
      ...(intentData.metadata && { metadata: intentData.metadata })
    };

    const signResult = await this.sign(intent, { ttl: intentData.ttl });
    
    return {
      intent,
      signature: signResult.signature,
      expiresAt: signResult.expiresAt
    };
  }

  /**
   * Batch sign multiple payloads
   * 
   * @param {Array<Object>} payloads - Array of payloads to sign
   * @param {Object} options - Signing options
   * @returns {Promise<Array<SignResult>>}
   */
  async signBatch(payloads, options = {}) {
    if (!Array.isArray(payloads)) {
      throw new SigningError('Payloads must be an array', { payloads });
    }

    const promises = payloads.map(payload => this.sign(payload, options));
    return Promise.all(promises);
  }

  /**
   * Batch verify multiple signatures
   * 
   * @param {Array<{payload, signature, publicKey?}>} items - Array of items to verify
   * @returns {Promise<Array<VerifyResult>>}
   */
  async verifyBatch(items) {
    if (!Array.isArray(items)) {
      throw new VerificationError('Items must be an array', { items });
    }

    const promises = items.map(item => 
      this.verify(item.payload, item.signature, item.publicKey)
    );
    return Promise.all(promises);
  }

  /**
   * Internal: Make HTTP request with retries
   */
  async _request(method, path, body = null, attempt = 1) {
    const url = `${this.config.baseUrl}${path}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
        ...(this.config.apiKey && { 'X-API-Key': this.config.apiKey })
      },
      ...(body && { body: JSON.stringify(body) })
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      // Retry on network errors
      if (attempt < this.config.retries && this._shouldRetry(error)) {
        await this._sleep(this.config.retryDelay * attempt);
        return this._request(method, path, body, attempt + 1);
      }

      throw new NetworkError(`Request failed: ${error.message}`, {
        method,
        path,
        attempt,
        originalError: error
      });
    }
  }

  _shouldRetry(error) {
    // Retry on network errors, timeouts, and 5xx errors
    return (
      error.name === 'AbortError' ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('HTTP 5')
    );
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Intent Builder - Fluent API for creating intents
 */
class IntentBuilder {
  constructor() {
    this.intent = {
      version: '1.0',
      type: 'intent.envelope',
      intentId: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };
  }

  id(intentId) {
    this.intent.intentId = intentId;
    return this;
  }

  channel(channelId) {
    this.intent.channelId = channelId;
    return this;
  }

  tool(tool) {
    this.intent.tool = tool;
    return this;
  }

  parameters(parameters) {
    this.intent.parameters = parameters;
    return this;
  }

  risk(riskLevel) {
    this.intent.riskLevel = riskLevel;
    return this;
  }

  describe(description) {
    this.intent.description = description;
    return this;
  }

  metadata(metadata) {
    this.intent.metadata = metadata;
    return this;
  }

  build() {
    // Validate required fields
    const required = ['channelId', 'tool', 'parameters', 'riskLevel', 'description'];
    const missing = required.filter(field => !this.intent[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    return { ...this.intent };
  }

  async sign(client, options = {}) {
    const intent = this.build();
    return client.sign(intent, options);
  }
}

/**
 * Helper function to create intent builder
 */
function createIntent() {
  return new IntentBuilder();
}

/**
 * Type definitions for TypeScript support
 */

/**
 * @typedef {Object} SignResult
 * @property {string} signature - Hex-encoded signature
 * @property {number} timestamp - Signing timestamp (ms)
 * @property {number} expiresAt - Expiration timestamp (ms)
 * @property {string} publicKey - Base64-encoded public key
 */

/**
 * @typedef {Object} VerifyResult
 * @property {boolean} valid - Whether signature is valid
 * @property {string} message - Verification message
 */

/**
 * @typedef {Object} HealthStatus
 * @property {string} status - Server status
 * @property {number} uptime - Server uptime (seconds)
 * @property {number} timestamp - Current timestamp (ms)
 * @property {string} version - Server version
 */

/**
 * @typedef {Object} SignedIntent
 * @property {Object} intent - The intent object
 * @property {string} signature - The signature
 * @property {number} expiresAt - Expiration timestamp (ms)
 */

module.exports = {
  BridgeClient,
  BridgeClientConfig,
  BridgeClientError,
  SigningError,
  VerificationError,
  NetworkError,
  IntentBuilder,
  createIntent
};
