# Aureus Sentinel Installation Guide

Complete installation guide for Aureus Sentinel Bridge, SDK, and CLI across all platforms.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
  - [npm Installation](#npm-installation)
  - [Docker Installation](#docker-installation)
  - [Manual Installation](#manual-installation)
- [Platform-Specific Guides](#platform-specific-guides)
  - [Windows](#windows)
  - [macOS](#macos)
  - [Linux](#linux)
- [Verification](#verification)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

**Fastest way to get started:**

```bash
# Install CLI globally
npm install -g @aureus-sentinel/cli

# Test connectivity (starts a Bridge server if not running)
aureus test

# Or use Docker
docker run -p 3000:3000 ghcr.io/farmountain/aureus-bridge:latest
```

---

## Prerequisites

### All Platforms

- **Node.js** 18.0.0 or higher
- **npm** 9.0.0 or higher
- **Git** (for manual installation)

### Optional

- **Docker** 20.10+ (for Docker installation)
- **AWS CLI** (for KMS integration)

### Verify Prerequisites

```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Check npm version
npm --version   # Should be >= 9.0.0

# Check Docker version (optional)
docker --version  # Should be >= 20.10
```

---

## Installation Methods

### npm Installation

#### 1. Install CLI (Recommended for beginners)

```bash
# Install globally
npm install -g @aureus-sentinel/cli

# Verify installation
aureus --version
aureus --help
```

#### 2. Install SDK (For developers)

```bash
# Install in your project
npm install @aureus-sentinel/bridge-client

# Or with Yarn
yarn add @aureus-sentinel/bridge-client
```

#### 3. Install Bridge Server

```bash
# Clone repository
git clone https://github.com/farmountain/Aureus-Sentinel.git
cd Aureus-Sentinel

# Install dependencies
cd Aureus-Sentinel/bridge
npm install

# Start server
node server.js
```

**Quick test:**

```bash
# In another terminal
aureus test
```

---

### Docker Installation

#### Option 1: Docker Run (Quick Test)

```bash
# Pull and run latest image
docker run -d \
  --name aureus-bridge \
  -p 3000:3000 \
  ghcr.io/farmountain/aureus-bridge:latest

# Check logs
docker logs aureus-bridge

# Test
curl http://localhost:3000/health
```

#### Option 2: Docker Compose (Recommended)

```bash
# Clone repository
git clone https://github.com/farmountain/Aureus-Sentinel.git
cd Aureus-Sentinel

# Copy environment file
cp .env.example .env

# Edit .env with your settings
nano .env

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Option 3: Build from Source

```bash
# Clone repository
git clone https://github.com/farmountain/Aureus-Sentinel.git
cd Aureus-Sentinel

# Build image
docker build -t aureus-bridge:local .

# Run
docker run -d -p 3000:3000 aureus-bridge:local
```

---

### Manual Installation

**For development or custom deployments:**

```bash
# 1. Clone repository
git clone https://github.com/farmountain/Aureus-Sentinel.git
cd Aureus-Sentinel

# 2. Install Bridge dependencies
cd Aureus-Sentinel/bridge
npm install

# 3. Install SDK dependencies (optional)
cd ../sdk
npm install

# 4. Install CLI dependencies (optional)
cd ../cli
npm install

# 5. Run tests
cd ../..
node tests/schema-test-runner.js
node tests/signer.test.js
node tests/integration.test.js

# 6. Start Bridge
cd Aureus-Sentinel/bridge
node server.js
```

---

## Platform-Specific Guides

### Windows

#### PowerShell Installation

```powershell
# Install Node.js from https://nodejs.org/ (LTS version)

# Install CLI
npm install -g @aureus-sentinel/cli

# Verify
aureus --version

# Install SDK in your project
cd your-project
npm install @aureus-sentinel/bridge-client
```

#### Docker Desktop (Windows)

1. Install Docker Desktop: https://www.docker.com/products/docker-desktop
2. Open PowerShell:

```powershell
# Pull image
docker pull ghcr.io/farmountain/aureus-bridge:latest

# Run
docker run -d -p 3000:3000 --name aureus-bridge ghcr.io/farmountain/aureus-bridge:latest

# Test
Invoke-WebRequest http://localhost:3000/health
```

#### Windows-Specific Configuration

```powershell
# Create keys directory
New-Item -ItemType Directory -Path "$env:USERPROFILE\.aureus\keys" -Force

# Generate keys
aureus keygen --output "$env:USERPROFILE\.aureus\keys"

# Set environment variables
$env:PRIVATE_KEY_PATH="$env:USERPROFILE\.aureus\keys\private.pem"
```

#### Troubleshooting Windows

**Issue: Command not found after npm install -g**

```powershell
# Find npm global path
npm config get prefix

# Add to PATH
# Settings → System → Advanced → Environment Variables
# Add: C:\Users\YourName\AppData\Roaming\npm
```

**Issue: Permission denied**

```powershell
# Run PowerShell as Administrator
# Or install without -g flag
npm install @aureus-sentinel/cli
npx aureus --version
```

---

### macOS

#### Homebrew Installation (Coming Soon)

```bash
# Will be available in future release
# brew tap farmountain/aureus
# brew install aureus-cli
```

#### npm Installation

```bash
# Install Node.js with Homebrew
brew install node@20

# Install CLI
npm install -g @aureus-sentinel/cli

# Verify
aureus --version
```

#### Docker Installation

```bash
# Install Docker Desktop
# https://www.docker.com/products/docker-desktop

# Pull and run
docker run -d -p 3000:3000 ghcr.io/farmountain/aureus-bridge:latest

# Test
curl http://localhost:3000/health
```

#### macOS-Specific Configuration

```bash
# Create keys directory
mkdir -p ~/.aureus/keys

# Generate keys
aureus keygen --output ~/.aureus/keys

# Set environment variables in ~/.zshrc or ~/.bash_profile
echo 'export PRIVATE_KEY_PATH="$HOME/.aureus/keys/private.pem"' >> ~/.zshrc
source ~/.zshrc
```

#### Troubleshooting macOS

**Issue: Permission denied during npm install -g**

```bash
# Option 1: Use sudo (not recommended)
sudo npm install -g @aureus-sentinel/cli

# Option 2: Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc

# Then install without sudo
npm install -g @aureus-sentinel/cli
```

**Issue: Docker not found**

```bash
# Install Docker Desktop from website
# Or use Homebrew
brew install --cask docker
```

---

### Linux

#### Ubuntu/Debian

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version

# Install CLI
sudo npm install -g @aureus-sentinel/cli

# Or without sudo
npm install -g @aureus-sentinel/cli --prefix ~/.local
export PATH="$HOME/.local/bin:$PATH"

# Verify
aureus --version
```

#### CentOS/RHEL/Fedora

```bash
# Install Node.js
curl -sL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Install CLI
sudo npm install -g @aureus-sentinel/cli

# Verify
aureus --version
```

#### Arch Linux

```bash
# Install Node.js
sudo pacman -S nodejs npm

# Install CLI
npm install -g @aureus-sentinel/cli

# Verify
aureus --version
```

#### Docker Installation (All Linux)

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Pull and run
docker run -d -p 3000:3000 ghcr.io/farmountain/aureus-bridge:latest

# Test
curl http://localhost:3000/health
```

#### SystemD Service (Production)

Create `/etc/systemd/system/aureus-bridge.service`:

```ini
[Unit]
Description=Aureus Sentinel Bridge
After=network.target

[Service]
Type=simple
User=aureus
WorkingDirectory=/opt/aureus-sentinel/Aureus-Sentinel/bridge
Environment="NODE_ENV=production"
Environment="PORT=3000"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
# Create user
sudo useradd -r -s /bin/false aureus

# Install Bridge
sudo mkdir -p /opt/aureus-sentinel
sudo git clone https://github.com/farmountain/Aureus-Sentinel.git /opt/aureus-sentinel
cd /opt/aureus-sentinel/Aureus-Sentinel/bridge
sudo npm install --production
sudo chown -R aureus:aureus /opt/aureus-sentinel

# Enable service
sudo systemctl enable aureus-bridge
sudo systemctl start aureus-bridge

# Check status
sudo systemctl status aureus-bridge

# View logs
sudo journalctl -u aureus-bridge -f
```

---

## Verification

### Verify Installation

```bash
# Check CLI
aureus --version
aureus --help

# Check SDK (in Node.js)
node -e "const { BridgeClient } = require('@aureus-sentinel/bridge-client'); console.log('SDK loaded successfully');"

# Check Bridge server
curl http://localhost:3000/health

# Or with aureus CLI
aureus test
```

### Run Smoke Tests

```bash
# Clone repository (if not already)
git clone https://github.com/farmountain/Aureus-Sentinel.git
cd Aureus-Sentinel

# Run all tests
node tests/schema-test-runner.js
node tests/signer.test.js
node tests/integration.test.js
node tests/sdk.test.js

# All should pass ✅
```

---

## Configuration

### Environment Variables

Create `.env` file in Bridge directory:

```bash
# Copy example
cp .env.example .env

# Edit configuration
nano .env
```

**Key settings:**

```env
# Server
PORT=3000
NODE_ENV=production

# Keys (Development)
USE_KMS=false
PRIVATE_KEY_PATH=./keys/private.pem

# Keys (Production with KMS)
USE_KMS=true
KMS_KEY_ID=alias/aureus-bridge
AWS_REGION=us-east-1

# Security
API_KEY=your_secure_key_here

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
```

### Generate Keys (Local Development)

```bash
# Using CLI
aureus keygen --output ./keys

# Or manually with Node.js
node -e "const crypto = require('crypto'); const {publicKey, privateKey} = crypto.generateKeyPairSync('ed25519', {publicKeyEncoding: {type: 'spki', format: 'pem'}, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}}); require('fs').writeFileSync('public.pem', publicKey); require('fs').writeFileSync('private.pem', privateKey);"
```

### AWS KMS Setup (Production)

```bash
# Install AWS CLI
# https://aws.amazon.com/cli/

# Configure AWS credentials
aws configure

# Create KMS key
aws kms create-key \
  --key-spec ECC_NIST_P384 \
  --key-usage SIGN_VERIFY \
  --description "Aureus Sentinel Bridge"

# Create alias
aws kms create-alias \
  --alias-name alias/aureus-bridge \
  --target-key-id <key-id>

# Set environment variables
export USE_KMS=true
export KMS_KEY_ID=alias/aureus-bridge
export AWS_REGION=us-east-1
```

---

## Troubleshooting

### Common Issues

#### Issue: Module not found

```bash
# Reinstall dependencies
cd Aureus-Sentinel/bridge
rm -rf node_modules package-lock.json
npm install
```

#### Issue: Port already in use

```bash
# Find process using port 3000
# Linux/Mac
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use different port
PORT=3001 node server.js
```

#### Issue: Permission denied

```bash
# Linux/Mac: Install without sudo
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
npm install -g @aureus-sentinel/cli

# Windows: Run as Administrator
```

#### Issue: Docker container exits immediately

```bash
# Check logs
docker logs aureus-bridge

# Run interactively
docker run -it --rm ghcr.io/farmountain/aureus-bridge:latest

# Check environment
docker run --rm ghcr.io/farmountain/aureus-bridge:latest env
```

### Get Help

- **Documentation**: https://github.com/farmountain/Aureus-Sentinel
- **Issues**: https://github.com/farmountain/Aureus-Sentinel/issues
- **Troubleshooting Guide**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## Next Steps

After installation:

1. **Read Getting Started**: [GETTING_STARTED.md](GETTING_STARTED.md)
2. **Try Examples**: See [examples/](../Aureus-Sentinel/examples/)
3. **Review API Reference**: [API_REFERENCE.md](API_REFERENCE.md)
4. **Configure for Production**: See deployment guides

---

**Last Updated:** Week 12 - Packaging & Release Automation
