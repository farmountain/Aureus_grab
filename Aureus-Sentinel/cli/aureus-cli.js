#!/usr/bin/env node

/**
 * Aureus Sentinel CLI Tool
 * 
 * Command-line interface for Bridge operations:
 * - Sign intents
 * - Verify signatures
 * - Test Bridge connectivity
 * - Validate schemas
 * - Generate keys
 * 
 * Week 11: Documentation & Developer Experience
 */

const { program } = require('commander');
const fs = require('fs').promises;
const path = require('path');
const { BridgeClient, createIntent } = require('../sdk/bridge-client');
const Ajv = require('ajv');
const crypto = require('crypto');

// Package info
const packageJson = require('../package.json');

/**
 * Load JSON file
 */
async function loadJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading file ${filePath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Write JSON file
 */
async function writeJsonFile(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✓ Saved to ${filePath}`);
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error.message);
    process.exit(1);
  }
}

/**
 * Get or create config
 */
async function getConfig() {
  const configPath = path.join(process.env.HOME || process.env.USERPROFILE, '.aureus-cli.json');
  
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    // Default config
    return {
      bridgeUrl: 'http://localhost:3000',
      timeout: 30000,
      retries: 3
    };
  }
}

/**
 * Save config
 */
async function saveConfig(config) {
  const configPath = path.join(process.env.HOME || process.env.USERPROFILE, '.aureus-cli.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`✓ Config saved to ${configPath}`);
}

/**
 * Create Bridge client from config
 */
async function createClient(options) {
  const config = await getConfig();
  
  return new BridgeClient({
    baseUrl: options.url || config.bridgeUrl,
    timeout: options.timeout || config.timeout,
    retries: options.retries || config.retries
  });
}

/**
 * Command: sign
 */
program
  .command('sign')
  .description('Sign a payload or intent')
  .option('-f, --file <path>', 'Path to JSON file to sign')
  .option('-p, --payload <json>', 'JSON payload as string')
  .option('-t, --ttl <seconds>', 'Time-to-live in seconds', '300')
  .option('-o, --output <path>', 'Output file path (optional)')
  .option('-u, --url <url>', 'Bridge URL (overrides config)')
  .action(async (options) => {
    try {
      // Load payload
      let payload;
      if (options.file) {
        payload = await loadJsonFile(options.file);
      } else if (options.payload) {
        payload = JSON.parse(options.payload);
      } else {
        console.error('Error: Must provide either --file or --payload');
        process.exit(1);
      }

      // Create client
      const client = await createClient(options);

      // Sign
      console.log('Signing payload...');
      const result = await client.sign(payload, { ttl: parseInt(options.ttl) });

      // Output
      const output = {
        payload,
        signature: result.signature,
        timestamp: result.timestamp,
        expiresAt: result.expiresAt,
        publicKey: result.publicKey
      };

      if (options.output) {
        await writeJsonFile(options.output, output);
      } else {
        console.log('\n✓ Signature:');
        console.log(JSON.stringify(output, null, 2));
      }
    } catch (error) {
      console.error('❌ Sign failed:', error.message);
      process.exit(1);
    }
  });

/**
 * Command: verify
 */
program
  .command('verify')
  .description('Verify a signature')
  .option('-f, --file <path>', 'Path to signed JSON file')
  .option('-p, --payload <json>', 'JSON payload as string')
  .option('-s, --signature <hex>', 'Signature (hex)')
  .option('-k, --public-key <base64>', 'Public key (base64, optional)')
  .option('-u, --url <url>', 'Bridge URL (overrides config)')
  .action(async (options) => {
    try {
      let payload, signature, publicKey;

      if (options.file) {
        const data = await loadJsonFile(options.file);
        payload = data.payload;
        signature = data.signature;
        publicKey = data.publicKey;
      } else if (options.payload && options.signature) {
        payload = JSON.parse(options.payload);
        signature = options.signature;
        publicKey = options.publicKey;
      } else {
        console.error('Error: Must provide either --file or (--payload + --signature)');
        process.exit(1);
      }

      // Create client
      const client = await createClient(options);

      // Verify
      console.log('Verifying signature...');
      const result = await client.verify(payload, signature, publicKey);

      if (result.valid) {
        console.log('✓ Signature is valid');
        console.log(`  Message: ${result.message}`);
      } else {
        console.log('❌ Signature is invalid');
        console.log(`  Message: ${result.message}`);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Verify failed:', error.message);
      process.exit(1);
    }
  });

/**
 * Command: intent
 */
program
  .command('intent')
  .description('Create and sign an intent')
  .requiredOption('-c, --channel <id>', 'Channel ID')
  .requiredOption('-t, --tool <name>', 'Tool name')
  .requiredOption('-d, --description <text>', 'Description')
  .option('-p, --parameters <json>', 'Parameters (JSON)', '{}')
  .option('-r, --risk <level>', 'Risk level (low, medium, high)', 'low')
  .option('--ttl <seconds>', 'Time-to-live in seconds', '300')
  .option('-o, --output <path>', 'Output file path (optional)')
  .option('-u, --url <url>', 'Bridge URL (overrides config)')
  .action(async (options) => {
    try {
      // Create client
      const client = await createClient(options);

      // Parse parameters
      const parameters = JSON.parse(options.parameters);

      // Create intent
      console.log('Creating intent...');
      const result = await client.createIntent({
        channelId: options.channel,
        tool: options.tool,
        description: options.description,
        parameters,
        riskLevel: options.risk,
        ttl: parseInt(options.ttl)
      });

      // Output
      const output = {
        intent: result.intent,
        signature: result.signature,
        expiresAt: result.expiresAt
      };

      if (options.output) {
        await writeJsonFile(options.output, output);
      } else {
        console.log('\n✓ Intent created and signed:');
        console.log(JSON.stringify(output, null, 2));
      }
    } catch (error) {
      console.error('❌ Intent creation failed:', error.message);
      process.exit(1);
    }
  });

/**
 * Command: validate
 */
program
  .command('validate')
  .description('Validate payload against schema')
  .requiredOption('-f, --file <path>', 'Path to JSON file to validate')
  .requiredOption('-s, --schema <path>', 'Path to JSON schema file')
  .action(async (options) => {
    try {
      // Load files
      const payload = await loadJsonFile(options.file);
      const schema = await loadJsonFile(options.schema);

      // Validate
      console.log('Validating...');
      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);
      const valid = validate(payload);

      if (valid) {
        console.log('✓ Payload is valid');
      } else {
        console.log('❌ Payload is invalid:');
        validate.errors.forEach(error => {
          console.log(`  - ${error.instancePath}: ${error.message}`);
        });
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  });

/**
 * Command: test
 */
program
  .command('test')
  .description('Test Bridge connectivity')
  .option('-u, --url <url>', 'Bridge URL (overrides config)')
  .action(async (options) => {
    try {
      const client = await createClient(options);

      console.log('Testing Bridge connectivity...');
      
      // Health check
      const health = await client.health();
      console.log('✓ Health check:', health.status);
      console.log(`  Uptime: ${health.uptime}s`);
      console.log(`  Version: ${health.version}`);

      // Get public key
      const publicKey = await client.getPublicKey();
      console.log('✓ Public key retrieved');
      console.log(`  Key (first 50 chars): ${publicKey.substring(0, 50)}...`);

      // Test sign/verify
      const testPayload = { test: 'connectivity', timestamp: Date.now() };
      const signResult = await client.sign(testPayload);
      console.log('✓ Sign test passed');

      const verifyResult = await client.verify(testPayload, signResult.signature);
      if (verifyResult.valid) {
        console.log('✓ Verify test passed');
      } else {
        console.log('❌ Verify test failed');
        process.exit(1);
      }

      console.log('\n✓ All tests passed! Bridge is operational.');
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    }
  });

/**
 * Command: keygen
 */
program
  .command('keygen')
  .description('Generate new key pair (ED25519)')
  .option('-o, --output <path>', 'Output directory (default: current)')
  .action(async (options) => {
    try {
      console.log('Generating ED25519 key pair...');

      // Generate keys
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      // Output directory
      const outputDir = options.output || '.';

      // Write keys
      const publicPath = path.join(outputDir, 'public.pem');
      const privatePath = path.join(outputDir, 'private.pem');

      await fs.writeFile(publicPath, publicKey, 'utf-8');
      await fs.writeFile(privatePath, privateKey, 'utf-8');

      console.log('✓ Key pair generated:');
      console.log(`  Public key:  ${publicPath}`);
      console.log(`  Private key: ${privatePath}`);
      console.log('\n⚠️  Keep your private key secure!');
    } catch (error) {
      console.error('❌ Key generation failed:', error.message);
      process.exit(1);
    }
  });

/**
 * Command: config
 */
program
  .command('config')
  .description('Configure CLI settings')
  .option('--url <url>', 'Set Bridge URL')
  .option('--timeout <ms>', 'Set timeout (milliseconds)')
  .option('--retries <count>', 'Set retry count')
  .option('--show', 'Show current configuration')
  .action(async (options) => {
    try {
      const config = await getConfig();

      if (options.show) {
        console.log('Current configuration:');
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      let changed = false;

      if (options.url) {
        config.bridgeUrl = options.url;
        changed = true;
      }

      if (options.timeout) {
        config.timeout = parseInt(options.timeout);
        changed = true;
      }

      if (options.retries) {
        config.retries = parseInt(options.retries);
        changed = true;
      }

      if (changed) {
        await saveConfig(config);
      } else {
        console.log('No changes made. Use --show to view current config.');
      }
    } catch (error) {
      console.error('❌ Config failed:', error.message);
      process.exit(1);
    }
  });

// Program setup
program
  .name('aureus')
  .description('Aureus Sentinel CLI - Command-line tool for Bridge operations')
  .version(packageJson.version);

// Parse arguments
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
