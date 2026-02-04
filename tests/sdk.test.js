/**
 * SDK Tests for Aureus Sentinel Bridge Client
 * 
 * Week 11: Documentation & Developer Experience
 */

const { 
  BridgeClient, 
  BridgeClientConfig,
  BridgeClientError,
  SigningError,
  VerificationError,
  NetworkError,
  IntentBuilder,
  createIntent
} = require('./bridge-client');

describe('BridgeClient SDK', () => {
  let client;
  let mockFetch;

  beforeEach(() => {
    client = new BridgeClient('http://localhost:3000');
    
    // Mock fetch
    global.fetch = jest.fn();
    mockFetch = global.fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration', () => {
    test('should create client with URL string', () => {
      const client = new BridgeClient('http://localhost:3000');
      expect(client.config.baseUrl).toBe('http://localhost:3000');
      expect(client.config.timeout).toBe(30000);
      expect(client.config.retries).toBe(3);
    });

    test('should create client with config object', () => {
      const client = new BridgeClient({
        baseUrl: 'http://example.com',
        timeout: 60000,
        retries: 5,
        apiKey: 'test-key'
      });

      expect(client.config.baseUrl).toBe('http://example.com');
      expect(client.config.timeout).toBe(60000);
      expect(client.config.retries).toBe(5);
      expect(client.config.apiKey).toBe('test-key');
    });

    test('should use default config values', () => {
      const config = new BridgeClientConfig();
      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.timeout).toBe(30000);
      expect(config.retries).toBe(3);
      expect(config.retryDelay).toBe(1000);
      expect(config.apiKey).toBeNull();
    });
  });

  describe('sign()', () => {
    test('should sign a payload successfully', async () => {
      const payload = { test: 'data' };
      const mockResponse = {
        signature: 'test-signature',
        timestamp: Date.now(),
        expiresAt: Date.now() + 300000,
        publicKey: 'test-key'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.sign(payload, { ttl: 300 });

      expect(result.signature).toBe('test-signature');
      expect(result.publicKey).toBe('test-key');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/sign',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({ payload, ttl: 300 })
        })
      );
    });

    test('should use default TTL if not specified', async () => {
      const payload = { test: 'data' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ signature: 'sig', timestamp: 0, expiresAt: 0, publicKey: 'key' })
      });

      await client.sign(payload);

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.ttl).toBe(300);
    });

    test('should throw SigningError on invalid payload', async () => {
      await expect(client.sign(null)).rejects.toThrow(SigningError);
      await expect(client.sign('string')).rejects.toThrow(SigningError);
      await expect(client.sign(123)).rejects.toThrow(SigningError);
    });

    test('should throw SigningError on server error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'Invalid payload' })
      });

      await expect(client.sign({ test: 'data' })).rejects.toThrow(SigningError);
    });

    test('should include API key if configured', async () => {
      const clientWithKey = new BridgeClient({
        baseUrl: 'http://localhost:3000',
        apiKey: 'my-api-key'
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ signature: 'sig', timestamp: 0, expiresAt: 0, publicKey: 'key' })
      });

      await clientWithKey.sign({ test: 'data' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'my-api-key'
          })
        })
      );
    });
  });

  describe('verify()', () => {
    test('should verify a signature successfully', async () => {
      const payload = { test: 'data' };
      const signature = 'test-signature';
      const mockResponse = {
        valid: true,
        message: 'Signature is valid'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await client.verify(payload, signature);

      expect(result.valid).toBe(true);
      expect(result.message).toBe('Signature is valid');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ payload, signature })
        })
      );
    });

    test('should verify with custom public key', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, message: 'Valid' })
      });

      await client.verify({ test: 'data' }, 'sig', 'custom-key');

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.publicKey).toBe('custom-key');
    });

    test('should throw VerificationError on invalid inputs', async () => {
      await expect(client.verify(null, 'sig')).rejects.toThrow(VerificationError);
      await expect(client.verify({ test: 'data' }, null)).rejects.toThrow(VerificationError);
      await expect(client.verify('string', 'sig')).rejects.toThrow(VerificationError);
    });
  });

  describe('getPublicKey()', () => {
    test('should fetch public key', async () => {
      const mockKey = 'LS0tLS1CRUdJTi...';
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ publicKey: mockKey })
      });

      const key = await client.getPublicKey();

      expect(key).toBe(mockKey);
      expect(client.publicKey).toBe(mockKey);
      expect(client.publicKeyFetched).toBe(true);
    });

    test('should cache public key', async () => {
      const mockKey = 'cached-key';
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ publicKey: mockKey })
      });

      await client.getPublicKey();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await client.getPublicKey();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('health()', () => {
    test('should check server health', async () => {
      const mockHealth = {
        status: 'ok',
        uptime: 12345,
        timestamp: Date.now(),
        version: '1.0.0'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockHealth
      });

      const health = await client.health();

      expect(health.status).toBe('ok');
      expect(health.uptime).toBe(12345);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('signAndVerify()', () => {
    test('should sign and verify in one call', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ 
            signature: 'sig', 
            timestamp: 0, 
            expiresAt: 0, 
            publicKey: 'key' 
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ valid: true, message: 'Valid' })
        });

      const result = await client.signAndVerify({ test: 'data' });

      expect(result.signature).toBe('sig');
      expect(result.valid).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('createIntent()', () => {
    test('should create and sign intent', async () => {
      const intentData = {
        channelId: 'api',
        tool: 'test_tool',
        parameters: { foo: 'bar' },
        riskLevel: 'low',
        description: 'Test intent'
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          signature: 'sig',
          timestamp: Date.now(),
          expiresAt: Date.now() + 300000,
          publicKey: 'key'
        })
      });

      const result = await client.createIntent(intentData);

      expect(result.intent.version).toBe('1.0');
      expect(result.intent.type).toBe('intent.envelope');
      expect(result.intent.channelId).toBe('api');
      expect(result.intent.tool).toBe('test_tool');
      expect(result.signature).toBe('sig');
    });

    test('should auto-generate intentId if not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          signature: 'sig',
          timestamp: Date.now(),
          expiresAt: Date.now() + 300000,
          publicKey: 'key'
        })
      });

      const result = await client.createIntent({
        channelId: 'api',
        tool: 'test_tool',
        parameters: {},
        riskLevel: 'low',
        description: 'Test'
      });

      expect(result.intent.intentId).toBeDefined();
      expect(typeof result.intent.intentId).toBe('string');
    });
  });

  describe('Batch Operations', () => {
    test('should sign multiple payloads', async () => {
      const payloads = [{ a: 1 }, { b: 2 }, { c: 3 }];
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          signature: 'sig',
          timestamp: Date.now(),
          expiresAt: Date.now() + 300000,
          publicKey: 'key'
        })
      });

      const results = await client.signBatch(payloads);

      expect(results).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('should verify multiple signatures', async () => {
      const items = [
        { payload: { a: 1 }, signature: 'sig1' },
        { payload: { b: 2 }, signature: 'sig2' }
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true, message: 'Valid' })
      });

      const results = await client.verifyBatch(items);

      expect(results).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should throw error if payloads not array', async () => {
      await expect(client.signBatch('not-array')).rejects.toThrow(SigningError);
      await expect(client.verifyBatch('not-array')).rejects.toThrow(VerificationError);
    });
  });

  describe('Error Handling', () => {
    test('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue({
          ok: true,
          json: async () => ({ signature: 'sig', timestamp: 0, expiresAt: 0, publicKey: 'key' })
        });

      await client.sign({ test: 'data' });

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retries', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(client.sign({ test: 'data' })).rejects.toThrow(NetworkError);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('should not retry on client errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'Invalid' })
      });

      await expect(client.sign({ test: 'data' })).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('IntentBuilder', () => {
    test('should build intent with fluent API', () => {
      const builder = new IntentBuilder();
      const intent = builder
        .channel('api')
        .tool('test_tool')
        .parameters({ foo: 'bar' })
        .risk('low')
        .describe('Test intent')
        .metadata({ userId: '123' })
        .build();

      expect(intent.version).toBe('1.0');
      expect(intent.type).toBe('intent.envelope');
      expect(intent.channelId).toBe('api');
      expect(intent.tool).toBe('test_tool');
      expect(intent.parameters).toEqual({ foo: 'bar' });
      expect(intent.riskLevel).toBe('low');
      expect(intent.description).toBe('Test intent');
      expect(intent.metadata).toEqual({ userId: '123' });
      expect(intent.intentId).toBeDefined();
      expect(intent.timestamp).toBeDefined();
    });

    test('should create intent with helper function', () => {
      const builder = createIntent();
      expect(builder).toBeInstanceOf(IntentBuilder);
    });

    test('should throw error on missing required fields', () => {
      const builder = new IntentBuilder();
      
      expect(() => builder.build()).toThrow('Missing required fields');
      
      builder.channel('api');
      expect(() => builder.build()).toThrow('Missing required fields');
    });

    test('should allow custom intentId', () => {
      const builder = new IntentBuilder();
      const intent = builder
        .id('custom-id')
        .channel('api')
        .tool('test')
        .parameters({})
        .risk('low')
        .describe('Test')
        .build();

      expect(intent.intentId).toBe('custom-id');
    });

    test('should sign intent directly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          signature: 'sig',
          timestamp: Date.now(),
          expiresAt: Date.now() + 300000,
          publicKey: 'key'
        })
      });

      const result = await createIntent()
        .channel('api')
        .tool('test')
        .parameters({})
        .risk('low')
        .describe('Test')
        .sign(client);

      expect(result.signature).toBe('sig');
    });
  });
});
