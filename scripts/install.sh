#!/bin/bash
# Aureus Sentinel Quick Install Script (Linux/macOS)
# Usage: curl -sL https://raw.githubusercontent.com/farmountain/Aureus-Sentinel/main/scripts/install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CLI_PACKAGE="@aureus-sentinel/cli"
MIN_NODE_VERSION="18.0.0"
INSTALL_DIR="$HOME/.aureus"

# Functions
print_header() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════╗"
    echo "║   Aureus Sentinel Installation       ║"
    echo "╚═══════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_command() {
    if command -v "$1" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

version_compare() {
    # Returns 0 if $1 >= $2, 1 otherwise
    printf '%s\n%s' "$2" "$1" | sort -V -C
}

check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Node.js
    if ! check_command node; then
        print_error "Node.js is not installed"
        echo "Please install Node.js ${MIN_NODE_VERSION} or higher: https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | sed 's/v//')
    if ! version_compare "$NODE_VERSION" "$MIN_NODE_VERSION"; then
        print_error "Node.js ${NODE_VERSION} is too old (requires >=${MIN_NODE_VERSION})"
        echo "Please upgrade Node.js: https://nodejs.org/"
        exit 1
    fi
    print_success "Node.js ${NODE_VERSION} detected"
    
    # Check npm
    if ! check_command npm; then
        print_error "npm is not installed"
        exit 1
    fi
    NPM_VERSION=$(npm --version)
    print_success "npm ${NPM_VERSION} detected"
    
    # Check internet connectivity
    if ! curl -s --head --max-time 5 https://registry.npmjs.org/ >/dev/null; then
        print_error "Cannot reach npm registry"
        echo "Please check your internet connection"
        exit 1
    fi
    print_success "Internet connectivity verified"
}

install_cli() {
    print_info "Installing Aureus CLI..."
    
    # Try global install
    if npm install -g "$CLI_PACKAGE" >/dev/null 2>&1; then
        print_success "CLI installed globally"
        return 0
    fi
    
    # If global install fails, try local install
    print_warning "Global install failed, trying local install..."
    
    # Setup local npm directory
    mkdir -p "$HOME/.npm-global"
    npm config set prefix "$HOME/.npm-global"
    
    # Add to PATH if not already there
    SHELL_RC="$HOME/.bashrc"
    if [[ "$SHELL" == */zsh ]]; then
        SHELL_RC="$HOME/.zshrc"
    fi
    
    if ! grep -q ".npm-global/bin" "$SHELL_RC"; then
        echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> "$SHELL_RC"
        print_info "Added npm global bin to PATH in $SHELL_RC"
    fi
    
    export PATH="$HOME/.npm-global/bin:$PATH"
    
    # Install locally
    npm install -g "$CLI_PACKAGE"
    print_success "CLI installed locally"
}

setup_directories() {
    print_info "Setting up directories..."
    
    mkdir -p "$INSTALL_DIR/keys"
    mkdir -p "$INSTALL_DIR/config"
    mkdir -p "$INSTALL_DIR/logs"
    
    print_success "Directories created at $INSTALL_DIR"
}

verify_installation() {
    print_info "Verifying installation..."
    
    if ! check_command aureus; then
        print_error "CLI not found in PATH"
        print_warning "Please restart your terminal or run: source $SHELL_RC"
        return 1
    fi
    
    VERSION=$(aureus --version 2>/dev/null || echo "unknown")
    print_success "Aureus CLI ${VERSION} installed"
}

print_next_steps() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}Installation Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Restart your terminal or run:"
    echo -e "   ${YELLOW}source ~/.bashrc${NC}  # or ~/.zshrc for zsh"
    echo ""
    echo "2. Verify installation:"
    echo -e "   ${YELLOW}aureus --version${NC}"
    echo ""
    echo "3. Generate keys for local development:"
    echo -e "   ${YELLOW}aureus keygen --output $INSTALL_DIR/keys${NC}"
    echo ""
    echo "4. Test connectivity:"
    echo -e "   ${YELLOW}aureus test${NC}"
    echo ""
    echo "5. Read the Getting Started guide:"
    echo -e "   ${YELLOW}https://github.com/farmountain/Aureus-Sentinel/blob/main/docs/GETTING_STARTED.md${NC}"
    echo ""
    echo "For help, run: ${YELLOW}aureus --help${NC}"
    echo ""
}

# Main installation flow
main() {
    print_header
    
    check_prerequisites
    echo ""
    
    install_cli
    echo ""
    
    setup_directories
    echo ""
    
    if verify_installation; then
        print_next_steps
        exit 0
    else
        echo ""
        print_error "Installation verification failed"
        echo "Please restart your terminal and verify with: aureus --version"
        exit 1
    fi
}

# Run
main
