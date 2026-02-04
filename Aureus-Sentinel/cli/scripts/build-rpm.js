#!/usr/bin/env node
/**
 * Build RPM package for RHEL/CentOS/Fedora
 * Usage: node scripts/build-rpm.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PKG_NAME = 'aureus-sentinel-cli';
const VERSION = require('../package.json').version;
const RELEASE = '1';
const ARCH = 'x86_64';
const MAINTAINER = 'Aureus Sentinel Team <team@aureus-sentinel.io>';
const DESCRIPTION = 'Aureus Sentinel CLI - Command-line tool for testing and managing Aureus Bridge';

const RPM_DIR = path.join(__dirname, '..', 'dist', 'rpm');
const RPM_BUILD = path.join(RPM_DIR, 'rpmbuild');

function exec(cmd) {
  console.log(`[exec] ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

function buildRpm() {
  console.log('Building RPM package...');
  
  // Create directory structure
  const dirs = [
    'BUILD',
    'RPMS',
    'SOURCES',
    'SPECS',
    'SRPMS'
  ];
  
  dirs.forEach(dir => {
    const fullPath = path.join(RPM_BUILD, dir);
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created: ${fullPath}`);
  });
  
  // Check binary exists
  const srcBin = path.join(__dirname, '..', 'dist', 'aureus-linux-x64');
  if (!fs.existsSync(srcBin)) {
    console.error('Error: Binary not found. Run "npm run build:linux" first.');
    process.exit(1);
  }
  
  // Copy binary to SOURCES
  const sourcesBin = path.join(RPM_BUILD, 'SOURCES', 'aureus');
  fs.copyFileSync(srcBin, sourcesBin);
  fs.chmodSync(sourcesBin, 0o755);
  
  // Copy README
  const readmeSrc = path.join(__dirname, '..', 'README.md');
  const readmeDest = path.join(RPM_BUILD, 'SOURCES', 'README.md');
  fs.copyFileSync(readmeSrc, readmeDest);
  
  // Create spec file
  const specContent = `Name:           ${PKG_NAME}
Version:        ${VERSION}
Release:        ${RELEASE}%{?dist}
Summary:        ${DESCRIPTION}

License:        MIT
URL:            https://github.com/farmountain/Aureus-Sentinel
Source0:        aureus
Source1:        README.md

BuildArch:      ${ARCH}
Requires:       glibc

%description
Aureus Sentinel CLI provides command-line tools for testing and managing
the Aureus Bridge server. Features include:
- Test Bridge connectivity
- Generate cryptographic keys
- Sign and verify payloads
- Manage Bridge configuration
- Health check utilities

%prep
# No prep needed for binary package

%build
# No build needed for binary package

%install
rm -rf $RPM_BUILD_ROOT
mkdir -p $RPM_BUILD_ROOT/usr/local/bin
mkdir -p $RPM_BUILD_ROOT/usr/share/doc/%{name}

install -m 0755 %{SOURCE0} $RPM_BUILD_ROOT/usr/local/bin/aureus
install -m 0644 %{SOURCE1} $RPM_BUILD_ROOT/usr/share/doc/%{name}/README.md

%files
%defattr(-,root,root,-)
/usr/local/bin/aureus
%doc /usr/share/doc/%{name}/README.md

%changelog
* $(date '+%a %b %d %Y') ${MAINTAINER} - ${VERSION}-${RELEASE}
- Release ${VERSION}
`;
  
  fs.writeFileSync(path.join(RPM_BUILD, 'SPECS', `${PKG_NAME}.spec`), specContent);
  console.log('Created spec file');
  
  // Build RPM
  try {
    exec(`rpmbuild -bb --define "_topdir ${RPM_BUILD}" ${path.join(RPM_BUILD, 'SPECS', PKG_NAME + '.spec')}`);
  } catch (error) {
    console.error('');
    console.error('Note: rpmbuild is required to build RPM packages.');
    console.error('Install with:');
    console.error('  Ubuntu/Debian: sudo apt install rpm');
    console.error('  macOS: brew install rpm');
    console.error('  RHEL/CentOS: sudo yum install rpm-build');
    throw error;
  }
  
  // Find the built RPM
  const rpmsDir = path.join(RPM_BUILD, 'RPMS', ARCH);
  const rpmFile = fs.readdirSync(rpmsDir).find(f => f.endsWith('.rpm'));
  
  if (rpmFile) {
    const rpmPath = path.join(rpmsDir, rpmFile);
    console.log('');
    console.log('✓ RPM package built successfully!');
    console.log(`  ${rpmPath}`);
    console.log('');
    console.log('Install with:');
    console.log(`  sudo rpm -ivh ${rpmPath}`);
    console.log('  or');
    console.log(`  sudo yum install ${rpmPath}`);
  }
}

// Main
try {
  buildRpm();
} catch (error) {
  console.error('Error building RPM package:', error);
  process.exit(1);
}
