/**
 * KMS Manager
 * 
 * Production-grade key management service with support for:
 * - AWS KMS with CloudHSM
 * - Automatic key rotation
 * - Multi-region key replication
 * - Envelope encryption for large payloads
 * - OIDC authentication
 * - Audit logging and tracing
 */

const crypto = require('crypto');
const { getTelemetry } = require('../observability/tracing');
const { StructuredAuditLogger, AuditEventType, Severity } = require('../observability/audit_logger');

// Try to load AWS SDK (optional dependency)
let AWS = null;
let awsAvailable = false;

try {
  AWS = require('aws-sdk');
  awsAvailable = true;
} catch (error) {
  console.warn('[KMSManager] AWS SDK not installed. KMS features disabled.');
  console.warn('[KMSManager] To enable, run: npm install --save aws-sdk');
}

/**
 * Key Rotation Policy
 */
class KeyRotationPolicy {
  constructor(config = {}) {
    this.rotationIntervalDays = config.rotationIntervalDays || 90;
    this.maxKeyAge = config.maxKeyAge || 365 * 24 * 60 * 60 * 1000; // 1 year in ms
    this.enableAutoRotation = config.enableAutoRotation !== false;
  }

  shouldRotate(keyMetadata) {
    if (!this.enableAutoRotation) return false;
    
    const now = Date.now();
    const createdAt = new Date(keyMetadata.CreationDate || keyMetadata.createdAt).getTime();
    const ageInDays = (now - createdAt) / (1000 * 60 * 60 * 24);
    
    return ageInDays >= this.rotationIntervalDays;
  }

  isExpired(keyMetadata) {
    const now = Date.now();
    const createdAt = new Date(keyMetadata.CreationDate || keyMetadata.createdAt).getTime();
    return (now - createdAt) > this.maxKeyAge;
  }
}

/**
 * KMS Manager
 */
class KMSManager {
  constructor(config = {}) {
    this.provider = config.provider || 'aws'; // 'aws' or 'local'
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';
    this.keyAlias = config.keyAlias || 'alias/aureus-sentinel-signing-key';
    this.enableCloudHSM = config.enableCloudHSM || false;
    this.enableMultiRegion = config.enableMultiRegion || false;
    this.replicaRegions = config.replicaRegions || ['us-west-2', 'eu-west-1'];
    
    // Authentication
    this.authMode = config.authMode || 'iam'; // 'iam' or 'oidc'
    this.oidcProvider = config.oidcProvider;
    this.roleArn = config.roleArn;
    
    // Rotation policy
    this.rotationPolicy = new KeyRotationPolicy(config.rotationPolicy || {});
    
    // Data key caching for envelope encryption
    this.dataKeyCache = new Map();
    this.dataKeyCacheTTL = config.dataKeyCacheTTL || 3600000; // 1 hour
    
    // Observability
    this.auditLogger = config.auditLogger || null;
    this.telemetry = getTelemetry();
    
    // Initialize KMS client
    this.kms = null;
    this.initialized = false;
    
    if (!awsAvailable && this.provider === 'aws') {
      console.warn('[KMSManager] AWS provider selected but SDK not available. Falling back to local mode.');
      this.provider = 'local';
    }
  }

  /**
   * Initialize KMS client
   */
  async init() {
    if (this.initialized) return;
    
    return await this.telemetry.traceOperation('kms.init', {}, async (span) => {
      if (this.provider === 'aws' && awsAvailable) {
        await this.initAWSKMS();
      } else {
        await this.initLocalKMS();
      }
      
      this.initialized = true;
      
      if (this.auditLogger) {
        await this.auditLogger.log(Severity.INFO, AuditEventType.CONFIG_CHANGED, {
          message: 'KMS Manager initialized',
          provider: this.provider,
          region: this.region,
          authMode: this.authMode,
          enableCloudHSM: this.enableCloudHSM
        });
      }
      
      span?.setAttribute('kms.provider', this.provider);
      span?.setAttribute('kms.region', this.region);
      
      console.log(`[KMSManager] Initialized with provider: ${this.provider}`);
    });
  }

  /**
   * Initialize AWS KMS
   */
  async initAWSKMS() {
    const config = {
      region: this.region,
      apiVersion: '2014-11-01'
    };
    
    // OIDC authentication
    if (this.authMode === 'oidc' && this.oidcProvider && this.roleArn) {
      const sts = new AWS.STS();
      const webIdentityToken = await this.getOIDCToken();
      
      const assumeRoleParams = {
        RoleArn: this.roleArn,
        RoleSessionName: 'aureus-sentinel-kms-session',
        WebIdentityToken: webIdentityToken,
        DurationSeconds: 3600
      };
      
      const assumedRole = await sts.assumeRoleWithWebIdentity(assumeRoleParams).promise();
      
      config.credentials = new AWS.Credentials({
        accessKeyId: assumedRole.Credentials.AccessKeyId,
        secretAccessKey: assumedRole.Credentials.SecretAccessKey,
        sessionToken: assumedRole.Credentials.SessionToken
      });
      
      console.log('[KMSManager] OIDC authentication successful');
    }
    
    this.kms = new AWS.KMS(config);
    
    // Verify key exists or create
    try {
      const keyMetadata = await this.describeKey(this.keyAlias);
      console.log(`[KMSManager] Using existing key: ${keyMetadata.KeyId}`);
      
      // Check if rotation needed
      if (this.rotationPolicy.shouldRotate(keyMetadata)) {
        console.log('[KMSManager] Key rotation recommended');
        if (this.rotationPolicy.enableAutoRotation) {
          await this.rotateKey();
        }
      }
    } catch (error) {
      if (error.code === 'NotFoundException') {
        console.log('[KMSManager] Key not found, creating new key');
        await this.createKey();
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize local KMS (for testing)
   */
  async initLocalKMS() {
    // Generate local key pair for testing
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    
    this.localKeyPair = {
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
      privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      keyId: 'local-key-' + crypto.randomBytes(8).toString('hex'),
      createdAt: new Date().toISOString()
    };
    
    console.log(`[KMSManager] Local key created: ${this.localKeyPair.keyId}`);
  }

  /**
   * Get OIDC token from environment or file
   */
  async getOIDCToken() {
    // In Kubernetes, token is mounted at /var/run/secrets/kubernetes.io/serviceaccount/token
    const fs = require('fs').promises;
    const tokenPath = process.env.OIDC_TOKEN_PATH || '/var/run/secrets/kubernetes.io/serviceaccount/token';
    
    try {
      const token = await fs.readFile(tokenPath, 'utf8');
      return token.trim();
    } catch (error) {
      // Fallback to environment variable
      const envToken = process.env.OIDC_TOKEN;
      if (!envToken) {
        throw new Error('OIDC token not found in file or environment variable');
      }
      return envToken;
    }
  }

  /**
   * Create new KMS key
   */
  async createKey() {
    if (this.provider !== 'aws') {
      throw new Error('Key creation only supported for AWS provider');
    }
    
    return await this.telemetry.traceOperation('kms.createKey', {}, async (span) => {
      const params = {
        Description: 'Aureus Sentinel signing key for intent/approval signatures',
        KeyUsage: 'SIGN_VERIFY',
        KeySpec: 'ECC_NIST_P256', // ECDSA with P-256 curve
        Origin: this.enableCloudHSM ? 'AWS_CLOUDHSM' : 'AWS_KMS',
        MultiRegion: this.enableMultiRegion,
        Tags: [
          { TagKey: 'Application', TagValue: 'Aureus-Sentinel' },
          { TagKey: 'Environment', TagValue: process.env.NODE_ENV || 'development' },
          { TagKey: 'ManagedBy', TagValue: 'KMSManager' }
        ]
      };
      
      const result = await this.kms.createKey(params).promise();
      const keyId = result.KeyMetadata.KeyId;
      
      // Create alias
      await this.kms.createAlias({
        AliasName: this.keyAlias,
        TargetKeyId: keyId
      }).promise();
      
      // Enable automatic key rotation
      if (this.rotationPolicy.enableAutoRotation) {
        await this.kms.enableKeyRotation({ KeyId: keyId }).promise();
      }
      
      // Replicate to other regions if multi-region enabled
      if (this.enableMultiRegion) {
        for (const region of this.replicaRegions) {
          await this.replicateKey(keyId, region);
        }
      }
      
      span?.setAttribute('kms.keyId', keyId);
      span?.setAttribute('kms.multiRegion', this.enableMultiRegion);
      
      if (this.auditLogger) {
        await this.auditLogger.log(Severity.INFO, AuditEventType.CONFIG_CHANGED, {
          message: 'KMS key created',
          keyId,
          keySpec: params.KeySpec,
          origin: params.Origin,
          multiRegion: this.enableMultiRegion
        });
      }
      
      console.log(`[KMSManager] Created key: ${keyId}`);
      return result.KeyMetadata;
    });
  }

  /**
   * Describe key metadata
   */
  async describeKey(keyId) {
    if (this.provider === 'local') {
      return {
        KeyId: this.localKeyPair.keyId,
        CreationDate: this.localKeyPair.createdAt,
        KeyState: 'Enabled'
      };
    }
    
    const result = await this.kms.describeKey({ KeyId: keyId }).promise();
    return result.KeyMetadata;
  }

  /**
   * Rotate key
   */
  async rotateKey() {
    if (this.provider !== 'aws') {
      throw new Error('Key rotation only supported for AWS provider');
    }
    
    return await this.telemetry.traceOperation('kms.rotateKey', {}, async (span) => {
      const keyMetadata = await this.describeKey(this.keyAlias);
      
      // AWS KMS automatic rotation (rotates annually)
      await this.kms.enableKeyRotation({ KeyId: keyMetadata.KeyId }).promise();
      
      span?.setAttribute('kms.keyId', keyMetadata.KeyId);
      
      if (this.auditLogger) {
        await this.auditLogger.log(Severity.INFO, AuditEventType.CONFIG_CHANGED, {
          message: 'KMS key rotation enabled',
          keyId: keyMetadata.KeyId
        });
      }
      
      console.log(`[KMSManager] Key rotation enabled for ${keyMetadata.KeyId}`);
    });
  }

  /**
   * Replicate key to another region
   */
  async replicateKey(keyId, targetRegion) {
    if (this.provider !== 'aws') return;
    
    const params = {
      KeyId: keyId,
      ReplicaRegion: targetRegion
    };
    
    await this.kms.replicateKey(params).promise();
    console.log(`[KMSManager] Key replicated to ${targetRegion}`);
  }

  /**
   * Sign data with KMS key
   */
  async sign(data) {
    await this.init();
    
    return await this.telemetry.traceOperation('kms.sign', {
      'kms.provider': this.provider
    }, async (span) => {
      const dataHash = crypto.createHash('sha256').update(data).digest();
      
      if (this.provider === 'aws') {
        const params = {
          KeyId: this.keyAlias,
          Message: dataHash,
          MessageType: 'DIGEST',
          SigningAlgorithm: 'ECDSA_SHA_256'
        };
        
        const result = await this.kms.sign(params).promise();
        
        span?.setAttribute('kms.keyId', result.KeyId);
        span?.setAttribute('kms.algorithm', params.SigningAlgorithm);
        
        if (this.auditLogger) {
          await this.auditLogger.log(Severity.INFO, AuditEventType.SIGNATURE_VERIFIED, {
            message: 'Data signed with KMS',
            keyId: result.KeyId,
            algorithm: params.SigningAlgorithm
          });
        }
        
        return {
          signature: result.Signature.toString('base64'),
          keyId: result.KeyId,
          algorithm: params.SigningAlgorithm
        };
      } else {
        // Local signing
        const privateKey = crypto.createPrivateKey(this.localKeyPair.privateKey);
        const signature = crypto.sign(null, dataHash, privateKey);
        
        const result = {
          signature: signature.toString('base64'),
          keyId: this.localKeyPair.keyId,
          algorithm: 'Ed25519'
        };
        
        if (this.auditLogger) {
          await this.auditLogger.log(Severity.INFO, AuditEventType.SIGNATURE_VERIFIED, {
            message: 'Data signed with KMS',
            keyId: result.keyId,
            algorithm: result.algorithm,
            provider: 'local'
          });
        }
        
        return result;
      }
    });
  }

  /**
   * Verify signature
   */
  async verify(data, signature, keyId) {
    await this.init();
    
    return await this.telemetry.traceOperation('kms.verify', {
      'kms.provider': this.provider
    }, async (span) => {
      const dataHash = crypto.createHash('sha256').update(data).digest();
      const signatureBuffer = Buffer.from(signature, 'base64');
      
      if (this.provider === 'aws') {
        const params = {
          KeyId: keyId || this.keyAlias,
          Message: dataHash,
          MessageType: 'DIGEST',
          Signature: signatureBuffer,
          SigningAlgorithm: 'ECDSA_SHA_256'
        };
        
        try {
          const result = await this.kms.verify(params).promise();
          
          span?.setAttribute('kms.signatureValid', result.SignatureValid);
          
          if (this.auditLogger) {
            await this.auditLogger.log(
              result.SignatureValid ? Severity.INFO : Severity.WARN,
              result.SignatureValid ? AuditEventType.SIGNATURE_VERIFIED : AuditEventType.SIGNATURE_FAILED,
              {
                message: result.SignatureValid ? 'Signature verified' : 'Signature verification failed',
                keyId: result.KeyId
              }
            );
          }
          
          return result.SignatureValid;
        } catch (error) {
          span?.setAttribute('kms.error', error.message);
          
          if (this.auditLogger) {
            await this.auditLogger.log(Severity.ERROR, AuditEventType.SIGNATURE_FAILED, {
              message: 'Signature verification error',
              error: error.message
            });
          }
          
          return false;
        }
      } else {
        // Local verification
        const publicKey = crypto.createPublicKey(this.localKeyPair.publicKey);
        const valid = crypto.verify(null, dataHash, publicKey, signatureBuffer);
        
        if (this.auditLogger) {
          await this.auditLogger.log(
            valid ? Severity.INFO : Severity.WARN,
            valid ? AuditEventType.SIGNATURE_VERIFIED : AuditEventType.SIGNATURE_FAILED,
            {
              message: valid ? 'Signature verified' : 'Signature verification failed',
              keyId: keyId || this.localKeyPair.keyId,
              provider: 'local'
            }
          );
        }
        
        return valid;
      }
    });
  }

  /**
   * Generate data key for envelope encryption
   */
  async generateDataKey(context = {}) {
    await this.init();
    
    // Check cache first
    const cacheKey = JSON.stringify(context);
    const cached = this.dataKeyCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.dataKeyCacheTTL) {
      return cached.dataKey;
    }
    
    return await this.telemetry.traceOperation('kms.generateDataKey', {}, async (span) => {
      if (this.provider === 'aws') {
        const params = {
          KeyId: this.keyAlias,
          KeySpec: 'AES_256',
          EncryptionContext: context
        };
        
        const result = await this.kms.generateDataKey(params).promise();
        
        const dataKey = {
          plaintext: result.Plaintext,
          ciphertext: result.CiphertextBlob.toString('base64'),
          keyId: result.KeyId
        };
        
        // Cache data key
        this.dataKeyCache.set(cacheKey, {
          dataKey,
          timestamp: Date.now()
        });
        
        span?.setAttribute('kms.keyId', result.KeyId);
        
        return dataKey;
      } else {
        // Local data key generation
        const plaintext = crypto.randomBytes(32);
        const ciphertext = plaintext; // In local mode, don't encrypt
        
        const dataKey = {
          plaintext,
          ciphertext: ciphertext.toString('base64'),
          keyId: this.localKeyPair.keyId
        };
        
        // Cache data key
        this.dataKeyCache.set(cacheKey, {
          dataKey,
          timestamp: Date.now()
        });
        
        return dataKey;
      }
    });
  }

  /**
   * Decrypt data key
   */
  async decryptDataKey(ciphertextBlob, context = {}) {
    await this.init();
    
    return await this.telemetry.traceOperation('kms.decryptDataKey', {}, async (span) => {
      if (this.provider === 'aws') {
        const params = {
          CiphertextBlob: Buffer.from(ciphertextBlob, 'base64'),
          EncryptionContext: context
        };
        
        const result = await this.kms.decrypt(params).promise();
        
        return {
          plaintext: result.Plaintext,
          keyId: result.KeyId
        };
      } else {
        // Local mode: ciphertext is plaintext
        return {
          plaintext: Buffer.from(ciphertextBlob, 'base64'),
          keyId: this.localKeyPair.keyId
        };
      }
    });
  }

  /**
   * Encrypt data using envelope encryption
   */
  async envelopeEncrypt(data, context = {}) {
    const dataKey = await this.generateDataKey(context);
    
    // Encrypt data with data key
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', dataKey.plaintext, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      encryptedDataKey: dataKey.ciphertext,
      keyId: dataKey.keyId
    };
  }

  /**
   * Decrypt data using envelope encryption
   */
  async envelopeDecrypt(envelope, context = {}) {
    // Decrypt data key
    const dataKey = await this.decryptDataKey(envelope.encryptedDataKey, context);
    
    // Decrypt data with data key
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      dataKey.plaintext,
      Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
    
    let decrypted = decipher.update(envelope.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Get key metadata
   */
  async getKeyMetadata() {
    await this.init();
    
    if (this.provider === 'local') {
      return {
        keyId: this.localKeyPair.keyId,
        provider: 'local',
        createdAt: this.localKeyPair.createdAt,
        publicKey: this.localKeyPair.publicKey
      };
    }
    
    const keyMetadata = await this.describeKey(this.keyAlias);
    const rotationStatus = await this.kms.getKeyRotationStatus({ KeyId: keyMetadata.KeyId }).promise();
    
    return {
      keyId: keyMetadata.KeyId,
      arn: keyMetadata.Arn,
      provider: 'aws',
      region: this.region,
      createdAt: keyMetadata.CreationDate,
      enabled: keyMetadata.Enabled,
      keyState: keyMetadata.KeyState,
      origin: keyMetadata.Origin,
      multiRegion: keyMetadata.MultiRegion,
      cloudHSM: keyMetadata.Origin === 'AWS_CLOUDHSM',
      rotationEnabled: rotationStatus.KeyRotationEnabled,
      shouldRotate: this.rotationPolicy.shouldRotate(keyMetadata)
    };
  }

  /**
   * Cleanup
   */
  async cleanup() {
    this.dataKeyCache.clear();
  }
}

module.exports = {
  KMSManager,
  KeyRotationPolicy
};
