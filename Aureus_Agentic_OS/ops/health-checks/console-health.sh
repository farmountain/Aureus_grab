#!/bin/bash

# Console Health Check Script
# Verifies console application health and readiness

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONSOLE_URL="${CONSOLE_URL:-http://localhost:3000}"
TIMEOUT="${HEALTH_CHECK_TIMEOUT:-10}"
MAX_RETRIES="${MAX_RETRIES:-3}"

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

# Function to check endpoint
check_endpoint() {
    local endpoint=$1
    local description=$2
    local retry=0
    
    log_info "Checking $description..."
    
    while [ $retry -lt $MAX_RETRIES ]; do
        if curl -sf --max-time $TIMEOUT "$CONSOLE_URL$endpoint" > /dev/null 2>&1; then
            log_info "✓ $description is healthy"
            return 0
        fi
        retry=$((retry + 1))
        if [ $retry -lt $MAX_RETRIES ]; then
            log_warn "Retry $retry/$MAX_RETRIES for $description..."
            sleep 2
        fi
    done
    
    log_error "✗ $description check failed after $MAX_RETRIES retries"
    return 1
}

# Function to check detailed health
check_detailed_health() {
    log_info "Performing detailed health check..."
    
    local response
    response=$(curl -sf --max-time $TIMEOUT "$CONSOLE_URL/health" 2>&1) || {
        log_error "Failed to get health status"
        return 1
    }
    
    echo "$response" | jq . 2>/dev/null || echo "$response"
    
    # Check if all components are healthy
    if echo "$response" | grep -q '"status":"healthy"'; then
        log_info "✓ All components are healthy"
        return 0
    else
        log_error "✗ Some components are unhealthy"
        return 1
    fi
}

# Main health check routine
main() {
    log_info "Starting console health check..."
    log_info "Console URL: $CONSOLE_URL"
    log_info "Timeout: ${TIMEOUT}s, Max retries: $MAX_RETRIES"
    echo ""
    
    local exit_code=0
    
    # Check basic endpoints
    check_endpoint "/health" "Health endpoint" || exit_code=1
    check_endpoint "/ready" "Readiness endpoint" || exit_code=1
    check_endpoint "/live" "Liveness endpoint" || exit_code=1
    
    echo ""
    
    # Check detailed health if basic checks pass
    if [ $exit_code -eq 0 ]; then
        check_detailed_health || exit_code=1
    fi
    
    echo ""
    
    if [ $exit_code -eq 0 ]; then
        log_info "=========================================="
        log_info "Console health check: PASSED"
        log_info "=========================================="
    else
        log_error "=========================================="
        log_error "Console health check: FAILED"
        log_error "=========================================="
    fi
    
    return $exit_code
}

# Run main function
main
exit $?
