#!/usr/bin/env node
/**
 * Database Schema Path Validator
 * Verifies that database schema files are accessible from expected locations
 */

const fs = require('fs');
const path = require('path');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

log('\n========================================', 'blue');
log(' Database Schema Path Validator', 'blue');
log('========================================\n', 'blue');

// Possible schema locations (as referenced in server.ts)
const possiblePaths = [
  'packages/kernel/src/db-schema.sql',
  'packages/kernel/dist/db-schema.sql',
  'node_modules/@aureus/kernel/dist/db-schema.sql',
  'packages/memory-hipcortex/src/db-schema.sql',
];

let found = 0;
let notFound = 0;

log('Checking database schema file locations:', 'blue');
log('─────────────────────────────────────────\n');

for (const schemaPath of possiblePaths) {
  const fullPath = path.resolve(__dirname, '..', schemaPath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    log(`✓ Found: ${schemaPath}`, 'green');
    
    // Check if file is readable and has content
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n').length;
      log(`  Size: ${content.length} bytes, ${lines} lines`, 'blue');
      
      // Basic SQL validation
      if (content.includes('CREATE TABLE')) {
        log(`  Contains CREATE TABLE statements ✓`, 'green');
      } else {
        log(`  ⚠ No CREATE TABLE statements found`, 'yellow');
      }
    } catch (error) {
      log(`  ✗ Error reading file: ${error.message}`, 'red');
      notFound++;
      continue;
    }
    
    found++;
  } else {
    log(`✗ Not found: ${schemaPath}`, 'red');
    notFound++;
  }
  log('');
}

// Check for schema files in package directories
log('\nChecking package-specific schemas:', 'blue');
log('───────────────────────────────────\n');

const packagesWithSchemas = [
  { pkg: 'kernel', schema: 'db-schema.sql' },
  { pkg: 'memory-hipcortex', schema: 'db-schema.sql' },
];

for (const { pkg, schema } of packagesWithSchemas) {
  const srcPath = path.resolve(__dirname, '..', 'packages', pkg, 'src', schema);
  const distPath = path.resolve(__dirname, '..', 'packages', pkg, 'dist', schema);
  
  log(`Package: ${pkg}`);
  
  const srcExists = fs.existsSync(srcPath);
  const distExists = fs.existsSync(distPath);
  
  if (srcExists) {
    log(`  ✓ Source: packages/${pkg}/src/${schema}`, 'green');
  } else {
    log(`  ✗ Source: packages/${pkg}/src/${schema}`, 'red');
  }
  
  if (distExists) {
    log(`  ✓ Built: packages/${pkg}/dist/${schema}`, 'green');
  } else {
    log(`  ⚠ Built: packages/${pkg}/dist/${schema} (not built yet)`, 'yellow');
  }
  
  log('');
}

// Verify tsconfig includes SQL files
log('Checking tsconfig.json for SQL file handling:', 'blue');
log('──────────────────────────────────────────────\n');

const kernelTsConfig = path.resolve(__dirname, '..', 'packages', 'kernel', 'tsconfig.json');
if (fs.existsSync(kernelTsConfig)) {
  const content = fs.readFileSync(kernelTsConfig, 'utf-8');
  const config = JSON.parse(content);
  
  const includeSQL = config.include && config.include.some(pattern => 
    pattern.includes('.sql') || pattern.includes('**/*')
  );
  
  if (includeSQL) {
    log('✓ tsconfig includes SQL files', 'green');
  } else {
    log('⚠ tsconfig may not include SQL files', 'yellow');
    log('  Consider adding "src/**/*.sql" to include array', 'yellow');
  }
} else {
  log('✗ kernel/tsconfig.json not found', 'red');
}

log('\n========================================', 'blue');
log(' Validation Summary', 'blue');
log('========================================', 'blue');
log(`Schema files found:     ${found}`, 'green');
log(`Schema files not found: ${notFound}`, notFound > 0 ? 'red' : 'green');

if (found > 0) {
  log('\n✓ At least one schema file found', 'green');
  log('  Recommendation: Run npm run build to ensure dist/ schemas are up to date', 'blue');
  process.exit(0);
} else {
  log('\n✗ No schema files found', 'red');
  log('  This will cause database initialization to fail', 'red');
  process.exit(1);
}
