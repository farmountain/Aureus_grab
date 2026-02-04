#!/usr/bin/env node
/**
 * Configuration File Path Validator
 * Validates all configuration files are accessible after reorganization
 */

const fs = require('fs');
const path = require('path');

// Color codes for output
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

function checkFile(filePath, description) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  const exists = fs.existsSync(fullPath);
  
  if (exists) {
    log(`✓ ${description}`, 'green');
    return true;
  } else {
    log(`✗ ${description}`, 'red');
    log(`  Expected: ${fullPath}`, 'yellow');
    return false;
  }
}

function checkDirectory(dirPath, description) {
  const fullPath = path.resolve(__dirname, '..', dirPath);
  const exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  
  if (exists) {
    log(`✓ ${description}`, 'green');
    return true;
  } else {
    log(`✗ ${description}`, 'red');
    log(`  Expected: ${fullPath}`, 'yellow');
    return false;
  }
}

function validateJSON(filePath, description) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    log(`✗ ${description} - File not found`, 'red');
    return false;
  }
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    JSON.parse(content);
    log(`✓ ${description} - Valid JSON`, 'green');
    return true;
  } catch (error) {
    log(`✗ ${description} - Invalid JSON`, 'red');
    log(`  Error: ${error.message}`, 'yellow');
    return false;
  }
}

function validateYAML(filePath, description) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  
  if (!fs.existsSync(fullPath)) {
    log(`✗ ${description} - File not found`, 'red');
    return false;
  }
  
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    // Basic YAML validation - check for common syntax errors
    if (content.includes('\t')) {
      log(`⚠ ${description} - Contains tabs (YAML prefers spaces)`, 'yellow');
    }
    log(`✓ ${description} - File exists`, 'green');
    return true;
  } catch (error) {
    log(`✗ ${description} - Error reading file`, 'red');
    log(`  Error: ${error.message}`, 'yellow');
    return false;
  }
}

// Main validation
log('\n========================================', 'blue');
log(' Configuration Path Validator', 'blue');
log('========================================\n', 'blue');

let passed = 0;
let failed = 0;

// Root configuration files
log('Root Configuration Files:', 'blue');
log('─────────────────────────────');
passed += checkFile('package.json', 'Root package.json') ? 1 : 0; failed += checkFile('package.json', '') ? 0 : 1;
passed += checkFile('tsconfig.json', 'Root tsconfig.json') ? 1 : 0; failed += checkFile('tsconfig.json', '') ? 0 : 1;
passed += checkFile('vitest.config.ts', 'Vitest configuration') ? 1 : 0; failed += checkFile('vitest.config.ts', '') ? 0 : 1;
passed += checkFile('.gitignore', 'Gitignore file') ? 1 : 0; failed += checkFile('.gitignore', '') ? 0 : 1;

// Package structure
log('\nPackage Structure:', 'blue');
log('─────────────────────────────');
const packages = [
  'kernel', 'crv', 'policy', 'memory-hipcortex', 'world-model',
  'tools', 'hypothesis', 'perception', 'observability', 'reflexion',
  'benchright', 'evaluation-harness', 'robotics', 'sdk', 'sdk-python'
];

packages.forEach(pkg => {
  const result = checkDirectory(`packages/${pkg}`, `packages/${pkg}`);
  passed += result ? 1 : 0;
  failed += result ? 0 : 1;
});

// Package.json files
log('\nPackage Configuration Files:', 'blue');
log('─────────────────────────────');
packages.forEach(pkg => {
  const result = validateJSON(`packages/${pkg}/package.json`, `${pkg}/package.json`);
  passed += result ? 1 : 0;
  failed += result ? 0 : 1;
});

// Console app
log('\nConsole Application:', 'blue');
log('─────────────────────────────');
passed += checkDirectory('apps/console', 'apps/console') ? 1 : 0; failed += checkDirectory('apps/console', '') ? 0 : 1;
passed += validateJSON('apps/console/package.json', 'console/package.json') ? 1 : 0; failed += validateJSON('apps/console/package.json', '') ? 0 : 1;
passed += checkDirectory('apps/console/src', 'console/src directory') ? 1 : 0; failed += checkDirectory('apps/console/src', '') ? 0 : 1;
passed += checkDirectory('apps/console/tests', 'console/tests directory') ? 1 : 0; failed += checkDirectory('apps/console/tests', '') ? 0 : 1;

// Demo deployment
log('\nDemo Deployment Configuration:', 'blue');
log('─────────────────────────────');
passed += checkDirectory('demo-deployment', 'demo-deployment directory') ? 1 : 0; failed += checkDirectory('demo-deployment', '') ? 0 : 1;
passed += validateYAML('demo-deployment/docker-compose.yml', 'docker-compose.yml') ? 1 : 0; failed += validateYAML('demo-deployment/docker-compose.yml', '') ? 0 : 1;
passed += checkFile('demo-deployment/.env.example', '.env.example') ? 1 : 0; failed += checkFile('demo-deployment/.env.example', '') ? 0 : 1;
passed += validateJSON('demo-deployment/package.json', 'demo-deployment/package.json') ? 1 : 0; failed += validateJSON('demo-deployment/package.json', '') ? 0 : 1;

// Infrastructure
log('\nInfrastructure Configuration:', 'blue');
log('─────────────────────────────');
passed += checkDirectory('infrastructure/kubernetes', 'kubernetes directory') ? 1 : 0; failed += checkDirectory('infrastructure/kubernetes', '') ? 0 : 1;
passed += checkDirectory('infrastructure/kubernetes/base', 'kubernetes/base') ? 1 : 0; failed += checkDirectory('infrastructure/kubernetes/base', '') ? 0 : 1;
passed += checkDirectory('infrastructure/kubernetes/overlays', 'kubernetes/overlays') ? 1 : 0; failed += checkDirectory('infrastructure/kubernetes/overlays', '') ? 0 : 1;
passed += validateYAML('infrastructure/kubernetes/base/namespace.yaml', 'namespace.yaml') ? 1 : 0; failed += validateYAML('infrastructure/kubernetes/base/namespace.yaml', '') ? 0 : 1;
passed += checkFile('infrastructure/kubernetes/base/kustomization.yaml', 'base/kustomization.yaml') ? 1 : 0; failed += checkFile('infrastructure/kubernetes/base/kustomization.yaml', '') ? 0 : 1;

// Documentation structure
log('\nDocumentation Structure:', 'blue');
log('─────────────────────────────');
passed += checkDirectory('docs', 'docs directory') ? 1 : 0; failed += checkDirectory('docs', '') ? 0 : 1;
passed += checkFile('docs/README.md', 'docs/README.md') ? 1 : 0; failed += checkFile('docs/README.md', '') ? 0 : 1;
passed += checkDirectory('docs/beta', 'docs/beta directory') ? 1 : 0; failed += checkDirectory('docs/beta', '') ? 0 : 1;
passed += checkFile('docs/beta/overview.md', 'beta/overview.md') ? 1 : 0; failed += checkFile('docs/beta/overview.md', '') ? 0 : 1;
passed += checkFile('docs/beta/onboarding.md', 'beta/onboarding.md') ? 1 : 0; failed += checkFile('docs/beta/onboarding.md', '') ? 0 : 1;

// Test structure
log('\nTest Structure:', 'blue');
log('─────────────────────────────');
passed += checkDirectory('tests', 'tests directory') ? 1 : 0; failed += checkDirectory('tests', '') ? 0 : 1;
passed += checkDirectory('tests/integration', 'tests/integration') ? 1 : 0; failed += checkDirectory('tests/integration', '') ? 0 : 1;
passed += checkDirectory('tests/chaos', 'tests/chaos') ? 1 : 0; failed += checkDirectory('tests/chaos', '') ? 0 : 1;
passed += checkFile('tests/README.md', 'tests/README.md') ? 1 : 0; failed += checkFile('tests/README.md', '') ? 0 : 1;

// Summary
log('\n========================================', 'blue');
log(' Validation Summary', 'blue');
log('========================================', 'blue');
log(`Passed: ${passed}`, 'green');
log(`Failed: ${failed}`, 'red');
log(`Total:  ${passed + failed}`, 'blue');

if (failed === 0) {
  log('\n✓ All configuration paths validated successfully!', 'green');
  process.exit(0);
} else {
  log(`\n✗ ${failed} configuration path(s) failed validation`, 'red');
  process.exit(1);
}
