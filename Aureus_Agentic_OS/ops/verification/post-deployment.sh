#!/bin/bash

# Post-Deployment Verification Script
# Verifies deployment success and service health

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONSOLE_URL="${CONSOLE_URL:-http://localhost:3000}"
ENVIRONMENT="${ENVIRONMENT:-staging}"
VERSION="${VERSION:-}"
SMOKE_TESTS="${SMOKE_TESTS:-true}"
WAIT_TIME="${WAIT_TIME:-30}"

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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Wait for service to be ready
wait_for_service() {
    log_step "Waiting for service to be ready (max ${WAIT_TIME}s)..."
    
    local elapsed=0
    while [ $elapsed -lt $WAIT_TIME ]; do
        if curl -sf --max-time 5 "$CONSOLE_URL/health" > /dev/null 2>&1; then
            log_info "✓ Service is ready (${elapsed}s)"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
        echo -n "."
    done
    
    echo ""
    log_error "✗ Service did not become ready within ${WAIT_TIME}s"
    return 1
}

# Verify version deployed
verify_version() {
    log_step "Verifying deployed version..."
    
    if [ -z "$VERSION" ]; then
        log_warn "No version specified, skipping version check"
        return 0
    fi
    
    # Get version from API
    local deployed_version
    deployed_version=$(curl -sf "$CONSOLE_URL/api/version" 2>/dev/null | jq -r '.version' 2>/dev/null) || {
        log_warn "Could not retrieve deployed version from API"
        return 0
    }
    
    if [ "$deployed_version" = "$VERSION" ]; then
        log_info "✓ Correct version deployed: $VERSION"
        return 0
    else
        log_error "✗ Version mismatch. Expected: $VERSION, Got: $deployed_version"
        return 1
    fi
}

# Run smoke tests
run_smoke_tests() {
    log_step "Running smoke tests..."
    
    local tests_passed=true
    
    # Test 1: Health endpoint
    log_info "Test 1: Health endpoint"
    if curl -sf "$CONSOLE_URL/health" > /dev/null 2>&1; then
        log_info "  ✓ Health endpoint responding"
    else
        log_error "  ✗ Health endpoint failed"
        tests_passed=false
    fi
    
    # Test 2: API endpoints
    log_info "Test 2: API endpoints"
    if curl -sf "$CONSOLE_URL/api/workflows" -H "Authorization: Bearer test" > /dev/null 2>&1; then
        log_info "  ✓ API endpoints accessible"
    else
        log_warn "  ⚠ API endpoints require authentication or unavailable"
    fi
    
    # Test 3: UI assets
    log_info "Test 3: UI assets"
    if curl -sf "$CONSOLE_URL/ui/deployment.html" > /dev/null 2>&1; then
        log_info "  ✓ UI assets loading"
    else
        log_error "  ✗ UI assets failed to load"
        tests_passed=false
    fi
    
    # Test 4: Static files
    log_info "Test 4: Static files"
    if curl -sf -I "$CONSOLE_URL/ui/monitoring.html" | grep -q "200 OK"; then
        log_info "  ✓ Static files serving correctly"
    else
        log_warn "  ⚠ Some static files may be missing"
    fi
    
    if [ "$tests_passed" = false ]; then
        return 1
    fi
    
    log_info "✓ All smoke tests passed"
    return 0
}

# Verify database connectivity
verify_database() {
    log_step "Verifying database connectivity..."
    
    if [ -z "${DATABASE_URL:-}" ]; then
        log_warn "DATABASE_URL not set, skipping database check"
        return 0
    fi
    
    if psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        log_info "✓ Database connectivity verified"
        return 0
    else
        log_error "✗ Cannot connect to database"
        return 1
    fi
}

# Check for errors in logs
check_logs() {
    log_step "Checking logs for errors..."
    
    # Check if there are any error logs in the last 5 minutes
    local log_file="/var/log/aureus/console.log"
    
    if [ ! -f "$log_file" ]; then
        log_warn "Log file not found: $log_file"
        return 0
    fi
    
    # Look for recent errors
    local error_count
    error_count=$(grep -c "ERROR" "$log_file" 2>/dev/null | tail -n 100 || echo "0")
    
    if [ "$error_count" -gt 0 ]; then
        log_warn "Found $error_count errors in recent logs"
        log_warn "Last 5 errors:"
        grep "ERROR" "$log_file" | tail -n 5
    else
        log_info "✓ No errors in recent logs"
    fi
    
    return 0
}

# Verify metrics are being collected
verify_metrics() {
    log_step "Verifying metrics collection..."
    
    # Try to get metrics
    local metrics
    metrics=$(curl -sf "$CONSOLE_URL/metrics" 2>/dev/null) || {
        log_warn "Metrics endpoint not available"
        return 0
    }
    
    # Check for key metrics
    if echo "$metrics" | grep -q "aureus_workflow_executions"; then
        log_info "✓ Metrics collection verified"
        return 0
    else
        log_warn "Metrics may not be collecting properly"
        return 0
    fi
}

# Main verification routine
main() {
    log_info "=========================================="
    log_info "Post-Deployment Verification"
    log_info "=========================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Console URL: $CONSOLE_URL"
    log_info "Version: ${VERSION:-not specified}"
    echo ""
    
    local exit_code=0
    local checks_passed=0
    local checks_failed=0
    
    # Wait for service
    if wait_for_service; then
        checks_passed=$((checks_passed + 1))
    else
        checks_failed=$((checks_failed + 1))
        exit_code=1
        # If service isn't ready, no point continuing
        log_error "Service not ready, aborting verification"
        exit $exit_code
    fi
    echo ""
    
    # Verify version
    if verify_version; then
        checks_passed=$((checks_passed + 1))
    else
        checks_failed=$((checks_failed + 1))
        exit_code=1
    fi
    echo ""
    
    # Run smoke tests
    if [ "$SMOKE_TESTS" = "true" ]; then
        if run_smoke_tests; then
            checks_passed=$((checks_passed + 1))
        else
            checks_failed=$((checks_failed + 1))
            exit_code=1
        fi
        echo ""
    fi
    
    # Verify database
    if verify_database; then
        checks_passed=$((checks_passed + 1))
    else
        checks_failed=$((checks_failed + 1))
        exit_code=1
    fi
    echo ""
    
    # Check logs
    check_logs
    echo ""
    
    # Verify metrics
    verify_metrics
    echo ""
    
    # Summary
    log_info "=========================================="
    log_info "Verification Summary"
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
        log_info "Post-Deployment Verification: PASSED"
        log_info "Deployment to $ENVIRONMENT successful"
        log_info "=========================================="
    else
        log_error "=========================================="
        log_error "Post-Deployment Verification: FAILED"
        log_error "Deployment to $ENVIRONMENT may have issues"
        log_error "=========================================="
    fi
    
    return $exit_code
}

# Run main function
main
exit $?
