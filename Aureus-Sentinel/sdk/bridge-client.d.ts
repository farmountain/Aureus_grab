/**
 * TypeScript definitions for Aureus Sentinel Bridge Client SDK
 * 
 * Week 11: Documentation & Developer Experience
 */

export interface BridgeClientOptions {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  apiKey?: string | null;
  headers?: Record<string, string>;
}

export interface SignOptions {
  ttl?: number;
}

export interface SignResult {
  signature: string;
  timestamp: number;
  expiresAt: number;
  publicKey: string;
}

export interface VerifyResult {
  valid: boolean;
  message: string;
}

export interface SignAndVerifyResult extends SignResult, VerifyResult {}

export interface HealthStatus {
  status: string;
  uptime: number;
  timestamp: number;
  version: string;
}

export interface IntentData {
  intentId?: string;
  channelId: string;
  tool: string;
  parameters?: Record<string, any>;
  riskLevel?: 'low' | 'medium' | 'high';
  description: string;
  timestamp?: string;
  metadata?: Record<string, any>;
  ttl?: number;
}

export interface Intent {
  version: string;
  type: string;
  intentId: string;
  channelId: string;
  tool: string;
  parameters: Record<string, any>;
  riskLevel: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface SignedIntent {
  intent: Intent;
  signature: string;
  expiresAt: number;
}

export interface BatchVerifyItem {
  payload: any;
  signature: string;
  publicKey?: string;
}

export class BridgeClientConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  retryDelay: number;
  apiKey: string | null;
  headers: Record<string, string>;

  constructor(options?: BridgeClientOptions);
}

export class BridgeClientError extends Error {
  code: string;
  details: any;

  constructor(message: string, code: string, details?: any);
}

export class SigningError extends BridgeClientError {
  constructor(message: string, details?: any);
}

export class VerificationError extends BridgeClientError {
  constructor(message: string, details?: any);
}

export class NetworkError extends BridgeClientError {
  constructor(message: string, details?: any);
}

export class BridgeClient {
  config: BridgeClientConfig;
  publicKey: string | null;
  publicKeyFetched: boolean;

  constructor(baseUrlOrConfig: string | BridgeClientOptions);

  /**
   * Sign a payload
   */
  sign(payload: any, options?: SignOptions): Promise<SignResult>;

  /**
   * Verify a signature
   */
  verify(payload: any, signature: string, publicKey?: string | null): Promise<VerifyResult>;

  /**
   * Get server's public key
   */
  getPublicKey(): Promise<string>;

  /**
   * Check server health
   */
  health(): Promise<HealthStatus>;

  /**
   * Sign and verify in one call (for testing)
   */
  signAndVerify(payload: any, options?: SignOptions): Promise<SignAndVerifyResult>;

  /**
   * Create and sign an intent
   */
  createIntent(intentData: IntentData): Promise<SignedIntent>;

  /**
   * Batch sign multiple payloads
   */
  signBatch(payloads: any[], options?: SignOptions): Promise<SignResult[]>;

  /**
   * Batch verify multiple signatures
   */
  verifyBatch(items: BatchVerifyItem[]): Promise<VerifyResult[]>;
}

export class IntentBuilder {
  constructor();

  id(intentId: string): this;
  channel(channelId: string): this;
  tool(tool: string): this;
  parameters(parameters: Record<string, any>): this;
  risk(riskLevel: 'low' | 'medium' | 'high'): this;
  describe(description: string): this;
  metadata(metadata: Record<string, any>): this;
  build(): Intent;
  sign(client: BridgeClient, options?: SignOptions): Promise<SignResult>;
}

export function createIntent(): IntentBuilder;
