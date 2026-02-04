#!/bin/bash
# Verification script for Aureus Sentinel installations
# Tests all installation methods

set -e

echo "╔═══════════════════════════════════════════╗"
echo "║  Aureus Sentinel Installation Verifier   ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0

check() {
    local name="$1"
    local cmd="$2"
    
    echo -n "Testing $name... "
    if eval "$cmd" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((passed++))
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((failed++))
    fi
}

# Check prerequisites
echo "=== Prerequisites ==="
check "Node.js" "node --version"
check "npm" "npm --version"
check "curl" "curl --version"
echo ""

# Check CLI installation
echo "=== CLI Installation ==="
check "aureus command" "command -v aureus"
check "aureus --version" "aureus --version"
check "aureus --help" "aureus --help"
echo ""

# Check SDK installation (if in a project)
echo "=== SDK Installation ==="
if [ -f "package.json" ]; then
    check "SDK presence" "node -e \"require('@aureus-sentinel/bridge-client')\""
else
    echo "Skipping SDK check (not in a Node.js project)"
fi
echo ""

# Check Docker installation
echo "=== Docker Installation ==="
if command -v docker >/dev/null 2>&1; then
    check "Docker" "docker --version"
    check "Docker image" "docker images | grep aureus-bridge"
    
    # Try to start container
    echo -n "Testing Docker run... "
    if docker run --rm ghcr.io/farmountain/aureus-bridge:latest node --version >/dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((passed++))
    else
        echo -e "${YELLOW}⚠ SKIP (image not pulled)${NC}"
    fi
else
    echo "Docker not installed, skipping Docker tests"
fi
echo ""

# Check directories
echo "=== Directories ==="
check "$HOME/.aureus exists" "[ -d \"$HOME/.aureus\" ]"
check "$HOME/.aureus/keys exists" "[ -d \"$HOME/.aureus/keys\" ]"
echo ""

# Test CLI functionality
echo "=== CLI Functionality ==="
check "keygen command" "aureus keygen --output /tmp/test-keys"
check "keygen output" "[ -f /tmp/test-keys/private.pem ] && [ -f /tmp/test-keys/public.pem ]"

# Clean up test keys
rm -rf /tmp/test-keys

echo ""
echo "=== Summary ==="
echo -e "${GREEN}Passed: $passed${NC}"
if [ $failed -gt 0 ]; then
    echo -e "${RED}Failed: $failed${NC}"
else
    echo -e "${GREEN}Failed: 0${NC}"
fi
echo ""

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    echo "Your Aureus Sentinel installation is working correctly."
    exit 0
else
    echo -e "${RED}Some tests failed! ✗${NC}"
    echo "Please check the installation guide: https://github.com/farmountain/Aureus-Sentinel/blob/main/docs/INSTALLATION.md"
    exit 1
fi
