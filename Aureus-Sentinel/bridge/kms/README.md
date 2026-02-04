# KMS Production Integration

Production-grade key management service for Aureus Sentinel with AWS KMS, CloudHSM support, automatic key rotation, and envelope encryption.

## Features

### AWS KMS Integration
- **CloudHSM Support**: Hardware security module backing for FIPS 140-2 Level 3 compliance
- **Multi-Region Keys**: Automatic replication across AWS regions for disaster recovery
- **ECDSA Signing**: ECC_NIST_P256 keys for efficient signatures (vs RSA)
- **Automatic Key Rotation**: AWS-managed annual rotation + custom policies (90-day default)

### Authentication
- **IAM Roles**: Standard AWS IAM authentication
- **OIDC/WebIdentity**: Keyless authentication for Kubernetes workloads
- **AssumeRole**: Cross-account key access with temporary credentials

### Envelope Encryption
- **AES-256-GCM**: Authenticated encryption for arbitrary-sized payloads
- **Data Key Caching**: 1-hour TTL cache reduces KMS API calls
- **Encryption Context**: Additional authenticated data for defense-in-depth

### Observability
- **Audit Logging**: All KMS operations logged with tamper-evident hash chain
- **Distributed Tracing**: OpenTelemetry spans for performance monitoring
- **Key Metadata**: Creation date, rotation status, CloudHSM origin tracking

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KMS Manager                               │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐        ┌──────────────┐                  │
│  │   AWS KMS    │        │ Local Keys   │                  │
│  │  Provider    │        │  (Testing)   │                  │
│  └──────┬───────┘        └──────┬───────┘                  │
│         │                        │                          │
│  ┌──────▼────────────────────────▼───────┐                 │
│  │  Key Operations                        │                 │
│  │  • sign()  • verify()                  │                 │
│  │  • generateDataKey()                   │                 │
│  │  • envelopeEncrypt()                   │                 │
│  │  • envelopeDecrypt()                   │                 │
│  └────────────────────────────────────────┘                 │
│  ┌────────────────────────────────────────┐                 │
│  │  Key Management                         │                 │
│  │  • createKey()  • describeKey()        │                 │
│  │  • rotateKey()  • replicateKey()       │                 │
│  └────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
         │                           │
         │                           │
    ┌────▼────┐                ┌────▼────┐
    │  Audit  │                │ Tracing │
    │  Logger │                │  (OTLP) │
    └─────────┘                └─────────┘
```

### Sign/Verify Flow
```
┌──────────┐                  ┌──────────┐
│   Data   │                  │   KMS    │
│  Payload │                  │ Manager  │
└────┬─────┘                  └────┬─────┘
     │                             │
     │  sign(data)                 │
     ├────────────────────────────>│
     │                             │
     │           ┌─────────────────┤
     │           │  SHA-256 hash   │
     │           └─────────────────┤
     │                             │
     │           ┌─────────────────▼──────┐
     │           │   AWS KMS / Local Key   │
     │           │   ECDSA/Ed25519 Sign    │
     │           └─────────────────┬──────┘
     │                             │
     │  { signature, keyId }       │
     │<────────────────────────────┤
     │                             │
     │  verify(data, sig, keyId)   │
     ├────────────────────────────>│
     │                             │
     │           ┌─────────────────▼──────┐
     │           │   AWS KMS / Local Key   │
     │           │   ECDSA/Ed25519 Verify  │
     │           └─────────────────┬──────┘
     │                             │
     │   true/false                │
     │<────────────────────────────┤
     │                             │
```

### Envelope Encryption Flow
```
┌──────────────┐                ┌───────────────┐
│  Plaintext   │                │  KMS Manager  │
│    Data      │                └───────┬───────┘
└──────┬───────┘                        │
       │                                │
       │  envelopeEncrypt(data, ctx)    │
       ├───────────────────────────────>│
       │                                │
       │              ┌─────────────────▼────────┐
       │              │ generateDataKey(ctx)     │
       │              │ → plaintext + ciphertext │
       │              └─────────────────┬────────┘
       │                                │
       │              ┌─────────────────▼────────┐
       │              │ AES-256-GCM Encrypt      │
       │              │ key=plaintext, data=data │
       │              └─────────────────┬────────┘
       │                                │
       │  { encrypted, encryptedDataKey,│
       │    iv, authTag, keyId }        │
       │<───────────────────────────────┤
       │                                │

┌──────────────┐                ┌───────────────┐
│  Ciphertext  │                │  KMS Manager  │
│   Envelope   │                └───────┬───────┘
└──────┬───────┘                        │
       │                                │
       │  envelopeDecrypt(envelope, ctx)│
       ├───────────────────────────────>│
       │                                │
       │              ┌─────────────────▼────────┐
       │              │ decryptDataKey(cipher)   │
       │              │ → plaintext data key     │
       │              └─────────────────┬────────┘
       │                                │
       │              ┌─────────────────▼────────┐
       │              │ AES-256-GCM Decrypt      │
       │              │ key=plaintext, verify tag│
       │              └─────────────────┬────────┘
       │                                │
       │  decrypted plaintext           │
       │<───────────────────────────────┤
       │                                │
```

---

## Usage

### Basic Initialization

```javascript
const { KMSManager } = require('./kms/kms_manager');

// AWS KMS (Production)
const kms = new KMSManager({
  provider: 'aws',
  region: 'us-east-1',
  keyAlias: 'alias/aureus-sentinel-signing-key',
  enableCloudHSM: true,
  enableMultiRegion: true,
  replicaRegions: ['us-west-2', 'eu-west-1']
});

await kms.init();
```

### OIDC Authentication (Kubernetes)

```javascript
const kms = new KMSManager({
  provider: 'aws',
  region: 'us-east-1',
  authMode: 'oidc',
  oidcProvider: 'arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE',
  roleArn: 'arn:aws:iam::123456789012:role/AureusSentinelKMSRole',
  keyAlias: 'alias/aureus-sentinel-signing-key'
});

await kms.init();
```

### Sign and Verify

```javascript
// Sign data
const data = JSON.stringify({ intentId: 'intent-123', tool: 'web_search' });
const { signature, keyId, algorithm } = await kms.sign(data);

console.log('Signature:', signature);
console.log('Key ID:', keyId);

// Verify signature
const valid = await kms.verify(data, signature, keyId);
console.log('Valid:', valid); // true

// Verify with tampered data
const tamperedData = data.replace('intent-123', 'intent-456');
const invalid = await kms.verify(tamperedData, signature, keyId);
console.log('Invalid:', invalid); // false
```

### Envelope Encryption

```javascript
// Encrypt large payload
const sensitiveData = JSON.stringify({
  user: 'user-alice',
  creditCard: '4111-1111-1111-1111',
  cvv: '123'
});

const context = {
  intentId: 'intent-123',
  userId: 'user-alice'
};

const envelope = await kms.envelopeEncrypt(sensitiveData, context);

// Store envelope (all fields are base64 strings)
await db.store({
  encrypted: envelope.encrypted,
  encryptedDataKey: envelope.encryptedDataKey,
  iv: envelope.iv,
  authTag: envelope.authTag,
  keyId: envelope.keyId
});

// Decrypt later
const storedEnvelope = await db.retrieve();
const decrypted = await kms.envelopeDecrypt(storedEnvelope, context);
console.log('Decrypted:', JSON.parse(decrypted));
```

### Key Rotation

```javascript
// Check if key needs rotation
const metadata = await kms.getKeyMetadata();
console.log('Should rotate:', metadata.shouldRotate);
console.log('Created:', metadata.createdAt);

// Rotate key (for AWS KMS)
if (metadata.shouldRotate) {
  await kms.rotateKey();
  console.log('Key rotation enabled');
}
```

### Audit Logging Integration

```javascript
const { StructuredAuditLogger } = require('./observability/audit_logger');

const auditLogger = new StructuredAuditLogger({
  logDir: './.audit-logs',
  enableFile: true
});

await auditLogger.init();

const kms = new KMSManager({
  provider: 'aws',
  region: 'us-east-1',
  auditLogger
});

await kms.init();

// All KMS operations now logged
await kms.sign('test data');
// → Audit log: "Data signed with KMS"

await kms.verify('test data', signature, keyId);
// → Audit log: "Signature verified"
```

---

## Configuration

### Environment Variables

```bash
# AWS Configuration
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# OIDC Authentication (Kubernetes)
export OIDC_TOKEN_PATH=/var/run/secrets/kubernetes.io/serviceaccount/token
export OIDC_TOKEN=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

# KMS Configuration
export KMS_KEY_ALIAS=alias/aureus-sentinel-signing-key
export KMS_ENABLE_CLOUDHSM=true
export KMS_ENABLE_MULTI_REGION=true
```

### KMS Manager Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | `'aws'` | KMS provider (`'aws'` or `'local'`) |
| `region` | string | `'us-east-1'` | AWS region for KMS |
| `keyAlias` | string | `'alias/aureus-sentinel-signing-key'` | KMS key alias |
| `enableCloudHSM` | boolean | `false` | Use CloudHSM-backed keys |
| `enableMultiRegion` | boolean | `false` | Enable multi-region key replication |
| `replicaRegions` | array | `['us-west-2', 'eu-west-1']` | Regions for key replication |
| `authMode` | string | `'iam'` | Authentication mode (`'iam'` or `'oidc'`) |
| `oidcProvider` | string | - | OIDC provider ARN |
| `roleArn` | string | - | IAM role ARN for OIDC |
| `rotationPolicy` | object | - | Key rotation configuration |
| `dataKeyCacheTTL` | number | `3600000` | Data key cache TTL (ms) |
| `auditLogger` | object | `null` | StructuredAuditLogger instance |

### Rotation Policy Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rotationIntervalDays` | number | `90` | Days between rotations |
| `maxKeyAge` | number | `365 days` | Maximum key age before expiry |
| `enableAutoRotation` | boolean | `true` | Enable automatic rotation |

---

## Deployment

### Kubernetes with OIDC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: aureus-sentinel
  namespace: default
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/AureusSentinelKMSRole
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aureus-bridge
spec:
  template:
    spec:
      serviceAccountName: aureus-sentinel
      containers:
      - name: bridge
        image: aureus/bridge:1.0
        env:
        - name: KMS_PROVIDER
          value: "aws"
        - name: AWS_REGION
          value: "us-east-1"
        - name: KMS_AUTH_MODE
          value: "oidc"
        - name: KMS_ROLE_ARN
          value: "arn:aws:iam::123456789012:role/AureusSentinelKMSRole"
        - name: KMS_KEY_ALIAS
          value: "alias/aureus-sentinel-signing-key"
```

### IAM Role Trust Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE:sub": "system:serviceaccount:default:aureus-sentinel"
        }
      }
    }
  ]
}
```

### IAM Role Permissions Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:Sign",
        "kms:Verify",
        "kms:DescribeKey",
        "kms:GetPublicKey",
        "kms:GenerateDataKey",
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/*",
      "Condition": {
        "StringEquals": {
          "kms:RequestAlias": "alias/aureus-sentinel-signing-key"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:EnableKeyRotation",
        "kms:GetKeyRotationStatus"
      ],
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/*"
    }
  ]
}
```

---

## Security Considerations

### Key Management
- **Never log private keys**: Only log key IDs and metadata
- **Rotate keys regularly**: Default 90-day policy, AWS annual rotation
- **Use CloudHSM for compliance**: FIPS 140-2 Level 3 for regulated industries
- **Multi-region replication**: Disaster recovery and low-latency access

### Authentication
- **OIDC for Kubernetes**: Eliminates static credentials
- **Least privilege**: Grant only required KMS permissions
- **Session duration**: Limit OIDC session to 1 hour
- **Audit all access**: Log all AssumeRole and KMS API calls

### Envelope Encryption
- **Cache data keys carefully**: 1-hour TTL balances security and performance
- **Use encryption context**: Additional authenticated data prevents misuse
- **AES-256-GCM**: Authenticated encryption prevents tampering
- **Unique IV per encryption**: Never reuse IVs with the same key

### Data Protection
- **Sign hashes, not data**: Reduces payload size and leaks
- **Verify signatures before execution**: Prevent unauthorized actions
- **Encrypt sensitive payloads**: User data, credentials, PII
- **Audit all operations**: Tamper-evident log for compliance

---

## Performance

### Benchmarks (AWS KMS, us-east-1)

| Operation | Latency (p50) | Latency (p99) | Cost (per 10k) |
|-----------|---------------|---------------|----------------|
| Sign | 35ms | 120ms | $0.30 |
| Verify | 38ms | 125ms | $0.30 |
| GenerateDataKey | 40ms | 130ms | $0.30 |
| Decrypt (data key) | 42ms | 135ms | $0.30 |
| DescribeKey | 15ms | 50ms | $0 |

### Optimization Strategies

1. **Data Key Caching**: Reduce `GenerateDataKey` calls by 95%
   - Default 1-hour TTL
   - Shared cache per encryption context
   - Reduces cost and latency

2. **Batch Operations**: Sign multiple payloads, then verify in batch
   - KMS doesn't support true batching, but async/await parallelism helps

3. **Multi-Region Keys**: Low-latency access from multiple regions
   - Replicate to us-west-2, eu-west-1 for global deployments

4. **Local Mode for Testing**: Skip KMS calls during development
   - Use `provider: 'local'` for unit tests
   - Generate ed25519 keys locally

---

## Troubleshooting

### KMS Permission Denied

```
Error: User: arn:aws:sts::123456789012:assumed-role/... is not authorized to perform: kms:Sign
```

**Solution**: Add `kms:Sign` to IAM role permissions policy.

### OIDC Token Not Found

```
Error: OIDC token not found in file or environment variable
```

**Solution**: Verify service account is configured with IRSA annotation:
```yaml
annotations:
  eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/Role
```

### Key Not Found

```
Error: Key 'alias/aureus-sentinel-signing-key' not found
```

**Solution**: Create key manually or allow KMS Manager to auto-create:
```bash
aws kms create-key --description "Aureus Sentinel Signing Key"
aws kms create-alias --alias-name alias/aureus-sentinel-signing-key --target-key-id <key-id>
```

### Data Key Cache Stale

**Symptom**: Decryption fails after key rotation.

**Solution**: Clear cache or wait for TTL expiry:
```javascript
await kms.cleanup(); // Clears cache
```

---

## Roadmap

- [ ] **HSM Integration**: Support for on-premise HSMs (Thales, Gemalto)
- [ ] **Azure Key Vault**: Multi-cloud support
- [ ] **Google Cloud KMS**: Multi-cloud support
- [ ] **Hardware Tokens**: YubiKey, Nitrokey for development signing
- [ ] **Threshold Signatures**: Multi-party signing for extra security
- [ ] **Key Versioning**: Track and switch between key versions
- [ ] **Envelope Encryption Streaming**: Encrypt large files (>100MB)
- [ ] **KMIP Support**: Key Management Interoperability Protocol

---

## References

- [AWS KMS Developer Guide](https://docs.aws.amazon.com/kms/latest/developerguide/)
- [AWS KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)
- [CloudHSM FIPS Validation](https://csrc.nist.gov/projects/cryptographic-module-validation-program)
- [EKS IRSA Documentation](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)
- [NIST FIPS 140-2](https://csrc.nist.gov/publications/detail/fips/140/2/final)
- [Envelope Encryption](https://docs.aws.amazon.com/kms/latest/developerguide/concepts.html#enveloping)
