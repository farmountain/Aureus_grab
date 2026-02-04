#!/bin/bash

# Full System Health Check Script
# Comprehensive health check for all Aureus components

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to print colored output
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Main health check routine
main() {
    log_info "=========================================="
    log_info "Starting Full System Health Check"
    log_info "=========================================="
    echo ""
    
    local exit_code=0
    local checks_passed=0
    local checks_failed=0
    
    # Run console health check
    log_info "1. Checking Console Application..."
    if bash "$SCRIPT_DIR/console-health.sh"; then
        checks_passed=$((checks_passed + 1))
    else
        checks_failed=$((checks_failed + 1))
        exit_code=1
    fi
    echo ""
    
    # Run state store health check
    log_info "2. Checking State Store..."
    if bash "$SCRIPT_DIR/state-store-health.sh"; then
        checks_passed=$((checks_passed + 1))
    else
        checks_failed=$((checks_failed + 1))
        exit_code=1
    fi
    echo ""
    
    # Summary
    log_info "=========================================="
    log_info "Health Check Summary"
    log_info "=========================================="
    log_info "Checks passed: $checks_passed"
    if [ $checks_failed -gt 0 ]; then
        log_error "Checks failed: $checks_failed"
    else
        log_info "Checks failed: $checks_failed"
    fi
    echo ""
    
    if [ $exit_code -eq 0 ]; then
        log_info "=========================================="
        log_info "Full System Health Check: PASSED"
        log_info "=========================================="
    else
        log_error "=========================================="
        log_error "Full System Health Check: FAILED"
        log_error "=========================================="
    fi
    
    return $exit_code
}

# Run main function
main
exit $?
