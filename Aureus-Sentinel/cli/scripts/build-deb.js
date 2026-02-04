#!/usr/bin/env node
/**
 * Build DEB package for Debian/Ubuntu
 * Usage: node scripts/build-deb.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PKG_NAME = 'aureus-sentinel-cli';
const VERSION = require('../package.json').version;
const ARCH = 'amd64';
const MAINTAINER = 'Aureus Sentinel Team <team@aureus-sentinel.io>';
const DESCRIPTION = 'Aureus Sentinel CLI - Command-line tool for testing and managing Aureus Bridge';

const DEB_DIR = path.join(__dirname, '..', 'dist', 'deb');
const DEB_ROOT = path.join(DEB_DIR, PKG_NAME);

function exec(cmd) {
  console.log(`[exec] ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function buildDeb() {
  console.log('Building DEB package...');
  
  // Create directory structure
  const dirs = [
    path.join(DEB_ROOT, 'DEBIAN'),
    path.join(DEB_ROOT, 'usr', 'local', 'bin'),
    path.join(DEB_ROOT, 'usr', 'share', 'doc', PKG_NAME),
    path.join(DEB_ROOT, 'usr', 'share', 'man', 'man1')
  ];
  
  dirs.forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  });
  
  // Copy binary
  const srcBin = path.join(__dirname, '..', 'dist', 'aureus-linux-x64');
  const destBin = path.join(DEB_ROOT, 'usr', 'local', 'bin', 'aureus');
  
  if (!fs.existsSync(srcBin)) {
    console.error('Error: Binary not found. Run "npm run build:linux" first.');
    process.exit(1);
  }
  
  fs.copyFileSync(srcBin, destBin);
  fs.chmodSync(destBin, 0o755);
  console.log(`Copied binary: ${destBin}`);
  
  // Create control file
  const controlContent = `Package: ${PKG_NAME}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Maintainer: ${MAINTAINER}
Description: ${DESCRIPTION}
 Aureus Sentinel CLI provides command-line tools for testing and managing
 the Aureus Bridge server. Features include:
  - Test Bridge connectivity
  - Generate cryptographic keys
  - Sign and verify payloads
  - Manage Bridge configuration
  - Health check utilities
`;
  
  fs.writeFileSync(path.join(DEB_ROOT, 'DEBIAN', 'control'), controlContent);
  console.log('Created control file');
  
  // Copy README
  const readmeSrc = path.join(__dirname, '..', 'README.md');
  const readmeDest = path.join(DEB_ROOT, 'usr', 'share', 'doc', PKG_NAME, 'README.md');
  fs.copyFileSync(readmeSrc, readmeDest);
  
  // Create copyright file
  const copyrightContent = `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: ${PKG_NAME}
Source: https://github.com/farmountain/Aureus-Sentinel

Files: *
Copyright: 2024 Aureus Sentinel Team
License: MIT
 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:
 .
 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.
 .
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
`;
  
  fs.writeFileSync(path.join(DEB_ROOT, 'usr', 'share', 'doc', PKG_NAME, 'copyright'), copyrightContent);
  
  // Build package
  const debFile = `${PKG_NAME}_${VERSION}_${ARCH}.deb`;
  const debPath = path.join(DEB_DIR, debFile);
  
  exec(`dpkg-deb --build ${DEB_ROOT} ${debPath}`);
  
  console.log('');
  console.log('✓ DEB package built successfully!');
  console.log(`  ${debPath}`);
  console.log('');
  console.log('Install with:');
  console.log(`  sudo dpkg -i ${debPath}`);
  console.log('  or');
  console.log(`  sudo apt install ${debPath}`);
}

// Main
try {
  buildDeb();
} catch (error) {
  console.error('Error building DEB package:', error);
  process.exit(1);
}
