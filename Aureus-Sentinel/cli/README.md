# Aureus Sentinel CLI

Command-line interface for Aureus Sentinel Bridge operations.

## Installation

```bash
npm install -g @aureus-sentinel/cli
```

Or run with npx (no installation):

```bash
npx @aureus-sentinel/cli [command]
```

## Quick Start

```bash
# Test connectivity
aureus test

# Create and sign an intent
aureus intent \
  --channel api \
  --tool web_search \
  --description "Search query" \
  --parameters '{"query":"Hello"}' \
  --output intent.json

# Verify a signature
aureus verify --file intent.json
```

## Commands

### `aureus test`

Test Bridge connectivity and functionality.

```bash
aureus test
aureus test --url http://localhost:3000
```

**Options:**
- `-u, --url <url>` - Bridge URL (overrides config)

**Example output:**
```
Testing Bridge connectivity...
✓ Health check: ok
  Uptime: 12345s
  Version: 1.0.0
✓ Public key retrieved
  Key (first 50 chars): LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUNvd0JRWURLMl...
✓ Sign test passed
✓ Verify test passed

✓ All tests passed! Bridge is operational.
```

### `aureus sign`

Sign a payload or intent.

```bash
# Sign from file
aureus sign --file intent.json --output signed.json

# Sign from inline JSON
aureus sign --payload '{"test":"data"}' --ttl 600
```

**Options:**
- `-f, --file <path>` - Path to JSON file to sign
- `-p, --payload <json>` - JSON payload as string
- `-t, --ttl <seconds>` - Time-to-live in seconds (default: 300)
- `-o, --output <path>` - Output file path (optional)
- `-u, --url <url>` - Bridge URL (overrides config)

**Example:**
```bash
aureus sign --file intent.json --ttl 300 --output signed.json
```

**Output:**
```json
{
  "payload": { ... },
  "signature": "3045022100...",
  "timestamp": 1704067200000,
  "expiresAt": 1704067500000,
  "publicKey": "LS0tLS1CRUdJTi..."
}
```

### `aureus verify`

Verify a signature.

```bash
# Verify from signed file
aureus verify --file signed.json

# Verify with explicit signature
aureus verify \
  --payload '{"test":"data"}' \
  --signature "3045022100..." \
  --public-key "LS0tLS1CRUdJTi..."
```

**Options:**
- `-f, --file <path>` - Path to signed JSON file
- `-p, --payload <json>` - JSON payload as string
- `-s, --signature <hex>` - Signature (hex)
- `-k, --public-key <base64>` - Public key (base64, optional)
- `-u, --url <url>` - Bridge URL (overrides config)

**Example:**
```bash
aureus verify --file signed.json
```

**Output:**
```
Verifying signature...
✓ Signature is valid
  Message: Signature is valid
```

### `aureus intent`

Create and sign an intent.

```bash
aureus intent \
  --channel telegram \
  --tool send_message \
  --description "Send greeting" \
  --parameters '{"chat_id":123,"text":"Hello!"}' \
  --risk low \
  --ttl 300 \
  --output intent.json
```

**Required Options:**
- `-c, --channel <id>` - Channel ID
- `-t, --tool <name>` - Tool name
- `-d, --description <text>` - Description

**Optional Options:**
- `-p, --parameters <json>` - Parameters (JSON, default: {})
- `-r, --risk <level>` - Risk level: low, medium, high (default: low)
- `--ttl <seconds>` - Time-to-live in seconds (default: 300)
- `-o, --output <path>` - Output file path (optional)
- `-u, --url <url>` - Bridge URL (overrides config)

**Example:**
```bash
aureus intent \
  --channel api \
  --tool web_search \
  --description "Search for TypeScript" \
  --parameters '{"query":"TypeScript tutorial"}' \
  --output intent.json
```

**Output:**
```json
{
  "intent": {
    "version": "1.0",
    "type": "intent.envelope",
    "intentId": "abc-123-...",
    "channelId": "api",
    "tool": "web_search",
    "parameters": { "query": "TypeScript tutorial" },
    "riskLevel": "low",
    "description": "Search for TypeScript",
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "signature": "3045022100...",
  "expiresAt": 1704067500000
}
```

### `aureus validate`

Validate payload against JSON schema.

```bash
aureus validate \
  --file intent.json \
  --schema contracts/v1/intent.schema.json
```

**Required Options:**
- `-f, --file <path>` - Path to JSON file to validate
- `-s, --schema <path>` - Path to JSON schema file

**Example:**
```bash
aureus validate --file intent.json --schema contracts/v1/intent.schema.json
```

**Success output:**
```
Validating...
✓ Payload is valid
```

**Error output:**
```
Validating...
❌ Payload is invalid:
  - .channelId: must be string
  - .riskLevel: must be equal to one of the allowed values
```

### `aureus keygen`

Generate new ED25519 key pair.

```bash
aureus keygen
aureus keygen --output ./keys
```

**Options:**
- `-o, --output <path>` - Output directory (default: current directory)

**Example:**
```bash
aureus keygen --output ./my-keys
```

**Output:**
```
Generating ED25519 key pair...
✓ Key pair generated:
  Public key:  ./my-keys/public.pem
  Private key: ./my-keys/private.pem

⚠️  Keep your private key secure!
```

### `aureus config`

Configure CLI settings.

```bash
# Show current configuration
aureus config --show

# Set Bridge URL
aureus config --url http://localhost:3000

# Set timeout
aureus config --timeout 60000

# Set retry count
aureus config --retries 5
```

**Options:**
- `--url <url>` - Set Bridge URL
- `--timeout <ms>` - Set timeout (milliseconds)
- `--retries <count>` - Set retry count
- `--show` - Show current configuration

**Configuration file location:**
- Linux/Mac: `~/.aureus-cli.json`
- Windows: `%USERPROFILE%\.aureus-cli.json`

**Default configuration:**
```json
{
  "bridgeUrl": "http://localhost:3000",
  "timeout": 30000,
  "retries": 3
}
```

## Examples

### Example 1: Complete workflow

```bash
# Test Bridge
aureus test

# Create and sign intent
aureus intent \
  --channel api \
  --tool calculator \
  --description "Calculate sum" \
  --parameters '{"a":5,"b":3}' \
  --output calc-intent.json

# Verify the intent
aureus verify --file calc-intent.json
```

### Example 2: Sign existing file

```bash
# Create intent file (intent.json)
cat > intent.json << EOF
{
  "version": "1.0",
  "type": "intent.envelope",
  "intentId": "my-intent-001",
  "channelId": "api",
  "tool": "test_tool",
  "parameters": {},
  "riskLevel": "low",
  "description": "Test",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
EOF

# Sign it
aureus sign --file intent.json --output signed-intent.json

# Verify it
aureus verify --file signed-intent.json
```

### Example 3: Validate schemas

```bash
# Validate intent against schema
aureus validate \
  --file intent.json \
  --schema contracts/v1/intent.schema.json

# Validate multiple files
for file in *.json; do
  echo "Validating $file..."
  aureus validate --file "$file" --schema contracts/v1/intent.schema.json
done
```

### Example 4: Batch processing

```bash
# Sign multiple intents
for i in {1..10}; do
  aureus intent \
    --channel api \
    --tool "test_tool_$i" \
    --description "Test $i" \
    --parameters "{\"id\":$i}" \
    --output "intent-$i.json"
done

# Verify all
for file in intent-*.json; do
  echo "Verifying $file..."
  aureus verify --file "$file"
done
```

### Example 5: CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test Intents

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install CLI
        run: npm install -g @aureus-sentinel/cli
      
      - name: Start Bridge
        run: |
          node Aureus-Sentinel/bridge/server.js &
          sleep 5
      
      - name: Test connectivity
        run: aureus test
      
      - name: Validate schemas
        run: |
          for schema in contracts/v1/*.schema.json; do
            aureus validate --file examples/sample-intent.json --schema "$schema"
          done
```

## Troubleshooting

### Connection Refused

```
❌ Test failed: Request failed: ECONNREFUSED
```

**Solution:** Start Bridge server first:
```bash
node Aureus-Sentinel/bridge/server.js
```

### Invalid JSON

```
❌ Sign failed: Unexpected token in JSON
```

**Solution:** Ensure JSON is properly formatted and escaped:
```bash
# Correct
aureus sign --payload '{"test":"data"}'

# Wrong
aureus sign --payload {test:data}
```

### Permission Denied

```
❌ Key generation failed: EACCES: permission denied
```

**Solution:** Use a writable directory:
```bash
aureus keygen --output ~/keys
```

## Global Options

All commands support:
- `-u, --url <url>` - Override Bridge URL
- `-h, --help` - Show help for command
- `-V, --version` - Show CLI version

## API Reference

The CLI internally uses `@aureus-sentinel/bridge-client` SDK. For programmatic access, see [SDK documentation](../sdk/README.md).

## License

MIT
