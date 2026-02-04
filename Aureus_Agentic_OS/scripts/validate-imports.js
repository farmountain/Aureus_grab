#!/usr/bin/env node
/**
 * Import Path Validator
 * Checks that all package imports resolve correctly after reorganization
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

function findImportStatements(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const imports = [];
    
    // Match ES6 imports: import { ... } from '@aureus/...'
    const es6Pattern = /import\s+.*\s+from\s+['"](@aureus\/[\w-]+)['"]/g;
    let match;
    while ((match = es6Pattern.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    // Match require: require('@aureus/...')
    const requirePattern = /require\(['"](@aureus\/[\w-]+)['"]\)/g;
    while ((match = requirePattern.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return [...new Set(imports)]; // Remove duplicates
  } catch (error) {
    return [];
  }
}

function resolvePackage(packageName) {
  // Convert @aureus/package-name to packages/package-name
  const pkgName = packageName.replace('@aureus/', '');
  const pkgPath = path.resolve(__dirname, '..', 'packages', pkgName);
  
  if (fs.existsSync(pkgPath)) {
    const packageJsonPath = path.join(pkgPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return {
          exists: true,
          name: packageJson.name,
          version: packageJson.version,
          main: packageJson.main,
          types: packageJson.types
        };
      } catch (error) {
        return { exists: false, error: 'Invalid package.json' };
      }
    }
  }
  
  return { exists: false, error: 'Package not found' };
}

function scanDirectory(dir, baseDir = dir) {
  const files = [];
  
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Skip node_modules, dist, and hidden directories
    if (entry.name === 'node_modules' || 
        entry.name === 'dist' || 
        entry.name.startsWith('.')) {
      continue;
    }
    
    if (entry.isDirectory()) {
      files.push(...scanDirectory(fullPath, baseDir));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Main validation
log('\n========================================', 'blue');
log(' Import Path Validator', 'blue');
log('========================================\n', 'blue');

let totalImports = 0;
let validImports = 0;
let invalidImports = 0;
const importIssues = [];

// Scan packages
log('Scanning package imports...', 'blue');
log('─────────────────────────────\n');

const packagesDir = path.resolve(__dirname, '..', 'packages');
const packages = fs.readdirSync(packagesDir).filter(name => {
  const stat = fs.statSync(path.join(packagesDir, name));
  return stat.isDirectory();
});

for (const pkg of packages) {
  const pkgDir = path.join(packagesDir, pkg, 'src');
  const files = scanDirectory(pkgDir);
  
  let pkgImports = 0;
  let pkgValid = 0;
  let pkgInvalid = 0;
  
  for (const file of files) {
    const imports = findImportStatements(file);
    
    for (const importPath of imports) {
      totalImports++;
      pkgImports++;
      
      const resolved = resolvePackage(importPath);
      
      if (resolved.exists) {
        validImports++;
        pkgValid++;
      } else {
        invalidImports++;
        pkgInvalid++;
        importIssues.push({
          file: path.relative(path.resolve(__dirname, '..'), file),
          import: importPath,
          error: resolved.error
        });
      }
    }
  }
  
  if (pkgImports > 0) {
    const status = pkgInvalid === 0 ? '✓' : '✗';
    const color = pkgInvalid === 0 ? 'green' : 'red';
    log(`${status} ${pkg}: ${pkgValid}/${pkgImports} imports valid`, color);
  }
}

// Scan console app
log('\nScanning console app imports...', 'blue');
log('─────────────────────────────\n');

const consoleDir = path.resolve(__dirname, '..', 'apps', 'console', 'src');
const consoleFiles = scanDirectory(consoleDir);

let consoleImports = 0;
let consoleValid = 0;
let consoleInvalid = 0;

for (const file of consoleFiles) {
  const imports = findImportStatements(file);
  
  for (const importPath of imports) {
    totalImports++;
    consoleImports++;
    
    const resolved = resolvePackage(importPath);
    
    if (resolved.exists) {
      validImports++;
      consoleValid++;
    } else {
      invalidImports++;
      consoleInvalid++;
      importIssues.push({
        file: path.relative(path.resolve(__dirname, '..'), file),
        import: importPath,
        error: resolved.error
      });
    }
  }
}

const consoleStatus = consoleInvalid === 0 ? '✓' : '✗';
const consoleColor = consoleInvalid === 0 ? 'green' : 'red';
log(`${consoleStatus} console: ${consoleValid}/${consoleImports} imports valid`, consoleColor);

// Report issues
if (importIssues.length > 0) {
  log('\n⚠ Import Issues Found:', 'yellow');
  log('─────────────────────────────\n');
  
  importIssues.forEach((issue, index) => {
    log(`${index + 1}. ${issue.file}`, 'yellow');
    log(`   Import: ${issue.import}`, 'red');
    log(`   Error: ${issue.error}\n`);
  });
}

// Summary
log('\n========================================', 'blue');
log(' Import Validation Summary', 'blue');
log('========================================', 'blue');
log(`Total Imports:   ${totalImports}`, 'blue');
log(`Valid Imports:   ${validImports}`, 'green');
log(`Invalid Imports: ${invalidImports}`, 'red');

if (invalidImports === 0) {
  log('\n✓ All package imports validated successfully!', 'green');
  process.exit(0);
} else {
  log(`\n✗ ${invalidImports} import(s) failed validation`, 'red');
  log('  Please check the import issues listed above.', 'yellow');
  process.exit(1);
}
