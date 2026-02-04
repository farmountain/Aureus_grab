# Distribution Packages

Standalone executables and platform-specific packages for Aureus Sentinel CLI.

## Overview

We provide multiple distribution formats:

- **Standalone Executables**: Single-file binaries (no Node.js required)
- **DEB Packages**: For Debian/Ubuntu
- **RPM Packages**: For RHEL/CentOS/Fedora
- **Homebrew Formula**: For macOS (coming soon)
- **npm Packages**: Standard npm installation

## Building Distribution Packages

### Prerequisites

```bash
# Install pkg for standalone executables
npm install -g pkg

# For DEB packages (optional)
sudo apt install dpkg-deb  # Ubuntu/Debian

# For RPM packages (optional)
sudo yum install rpm-build  # RHEL/CentOS
brew install rpm  # macOS
```

### Build All Packages

```bash
cd Aureus-Sentinel/cli
npm run package:all
```

This creates:
- `dist/aureus-linux-x64` - Linux x64 executable
- `dist/aureus-macos-x64` - macOS x64 executable
- `dist/aureus-macos-arm64` - macOS ARM64 executable
- `dist/aureus-win-x64.exe` - Windows x64 executable
- `dist/deb/aureus-sentinel-cli_*.deb` - Debian package
- `dist/rpm/rpmbuild/RPMS/x86_64/aureus-sentinel-cli-*.rpm` - RPM package

### Build Individual Formats

```bash
# Standalone executables
npm run build:linux
npm run build:macos
npm run build:win
npm run build:all

# Platform packages
npm run package:deb
npm run package:rpm
```

## Installation from Packages

### Standalone Executables

```bash
# Linux
chmod +x aureus-linux-x64
sudo mv aureus-linux-x64 /usr/local/bin/aureus

# macOS
chmod +x aureus-macos-x64
sudo mv aureus-macos-x64 /usr/local/bin/aureus

# Windows
# Move aureus-win-x64.exe to a directory in PATH
# Or run directly:
.\aureus-win-x64.exe --version
```

### DEB Package (Debian/Ubuntu)

```bash
# Install
sudo dpkg -i aureus-sentinel-cli_*.deb

# Or with apt
sudo apt install ./aureus-sentinel-cli_*.deb

# Verify
aureus --version

# Uninstall
sudo apt remove aureus-sentinel-cli
```

### RPM Package (RHEL/CentOS/Fedora)

```bash
# Install
sudo rpm -ivh aureus-sentinel-cli-*.rpm

# Or with yum/dnf
sudo yum install aureus-sentinel-cli-*.rpm

# Verify
aureus --version

# Uninstall
sudo yum remove aureus-sentinel-cli
```

## Package Verification

Use the verification scripts to test installations:

```bash
# Linux/macOS
bash scripts/verify-install.sh

# Windows
.\scripts\verify-install.ps1
```

## Package Contents

All packages include:
- `aureus` executable (or `aureus.exe` on Windows)
- README documentation
- License information

The binaries are self-contained and include:
- Node.js runtime (embedded)
- All npm dependencies
- CLI application code

## Size Comparison

| Package Type | Size (approx) |
|-------------|--------------|
| npm global install | ~2 MB (with dependencies) |
| Standalone Linux x64 | ~45 MB |
| Standalone macOS x64 | ~45 MB |
| Standalone Windows x64 | ~47 MB |
| DEB package | ~45 MB |
| RPM package | ~45 MB |

## Checksums

Generate checksums for verification:

```bash
# SHA256
sha256sum dist/aureus-*

# Or on macOS
shasum -a 256 dist/aureus-*
```

Checksums are published with each GitHub release.

## CI/CD Integration

Distribution packages are automatically built and published on releases:

```yaml
# .github/workflows/release.yml includes:
- Build standalone executables with pkg
- Create DEB and RPM packages
- Upload to GitHub Releases
- Generate checksums
```

## Troubleshooting

### pkg build fails

```bash
# Clear pkg cache
rm -rf ~/.pkg-cache

# Rebuild
npm run build:all
```

### DEB build fails

```bash
# Install dpkg-deb
sudo apt install dpkg-deb

# Verify binary exists
ls -la dist/aureus-linux-x64
```

### RPM build fails

```bash
# Install rpm-build
sudo yum install rpm-build

# Or on Ubuntu/macOS
sudo apt install rpm  # Ubuntu
brew install rpm  # macOS
```

## Future Enhancements

- [ ] Homebrew tap for macOS
- [ ] Chocolatey package for Windows
- [ ] Snap package for Linux
- [ ] Docker image with CLI pre-installed
- [ ] Signed executables (code signing)
- [ ] Notarization for macOS

---

**Last Updated:** Week 12 - Packaging & Release Automation
