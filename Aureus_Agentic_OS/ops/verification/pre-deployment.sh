#!/bin/bash

# Pre-Deployment Verification Script
# Runs comprehensive checks before deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${ENVIRONMENT:-staging}"
VERSION="${VERSION:-}"
VERIFY_BUILD="${VERIFY_BUILD:-true}"
VERIFY_TESTS="${VERIFY_TESTS:-true}"
VERIFY_SECURITY="${VERIFY_SECURITY:-true}"

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

# Verify build artifacts exist
verify_build_artifacts() {
    log_step "Verifying build artifacts..."
    
    local artifacts_found=true
    
    # Check console dist
    if [ ! -d "apps/console/dist" ]; then
        log_error "Console dist directory not found"
        artifacts_found=false
    else
        log_info "✓ Console dist found"
    fi
    
    # Check package builds
    local packages=("kernel" "policy" "observability" "world-model" "memory-hipcortex")
    for pkg in "${packages[@]}"; do
        if [ ! -d "packages/$pkg/dist" ] && [ ! -d "packages/$pkg/build" ]; then
            log_error "Package $pkg not built"
            artifacts_found=false
        else
            log_info "✓ Package $pkg built"
        fi
    done
    
    if [ "$artifacts_found" = false ]; then
        return 1
    fi
    
    log_info "✓ All build artifacts verified"
    return 0
}

# Verify tests pass
verify_tests() {
    log_step "Verifying tests..."
    
    # Run tests with timeout
    if timeout 300 npm run test -- --run --reporter=verbose 2>&1 | tee /tmp/test-output.log; then
        log_info "✓ All tests passed"
        return 0
    else
        log_error "✗ Tests failed"
        tail -n 50 /tmp/test-output.log
        return 1
    fi
}

# Verify security checks
verify_security() {
    log_step "Verifying security checks..."
    
    # Check for known vulnerabilities in dependencies
    log_info "Running npm audit..."
    if npm audit --audit-level=high 2>&1 | tee /tmp/audit-output.log; then
        log_info "✓ No high/critical vulnerabilities found"
    else
        log_warn "Security vulnerabilities detected"
        cat /tmp/audit-output.log
        # Don't fail on vulnerabilities, just warn
    fi
    
    # Check for secrets in code (basic check)
    log_info "Checking for exposed secrets..."
    if grep -r "password\s*=\s*['\"]" --include="*.ts" --include="*.js" apps/ packages/ 2>/dev/null; then
        log_warn "Potential hardcoded passwords found"
    else
        log_info "✓ No obvious secrets found"
    fi
    
    return 0
}

# Verify version tag
verify_version() {
    log_step "Verifying version..."
    
    if [ -z "$VERSION" ]; then
        log_warn "No version specified"
        return 0
    fi
    
    # Verify version format (semantic versioning)
    if [[ ! "$VERSION" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
        log_error "Invalid version format: $VERSION"
        log_error "Expected format: v1.0.0 or 1.0.0"
        return 1
    fi
    
    log_info "✓ Version format valid: $VERSION"
    
    # Check if version already exists (git tag)
    if git rev-parse "$VERSION" >/dev/null 2>&1; then
        log_warn "Version tag already exists: $VERSION"
    fi
    
    return 0
}

# Verify environment configuration
verify_environment() {
    log_step "Verifying environment configuration for $ENVIRONMENT..."
    
    # Check required environment variables based on environment
    case "$ENVIRONMENT" in
        production)
            local required_vars=("DATABASE_URL" "REDIS_URL")
            ;;
        staging)
            local required_vars=()
            ;;
        *)
            log_warn "Unknown environment: $ENVIRONMENT"
            return 0
            ;;
    esac
    
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        return 1
    fi
    
    log_info "✓ Environment configuration verified"
    return 0
}

# Main verification routine
main() {
    log_info "=========================================="
    log_info "Pre-Deployment Verification"
    log_info "=========================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Version: ${VERSION:-not specified}"
    echo ""
    
    local exit_code=0
    local checks_passed=0
    local checks_failed=0
    
    # Run version check
    if verify_version; then
        checks_passed=$((checks_passed + 1))
    else
        checks_failed=$((checks_failed + 1))
        exit_code=1
    fi
    echo ""
    
    # Run environment check
    if verify_environment; then
        checks_passed=$((checks_passed + 1))
    else
        checks_failed=$((checks_failed + 1))
        exit_code=1
    fi
    echo ""
    
    # Run build verification
    if [ "$VERIFY_BUILD" = "true" ]; then
        if verify_build_artifacts; then
            checks_passed=$((checks_passed + 1))
        else
            checks_failed=$((checks_failed + 1))
            exit_code=1
        fi
        echo ""
    fi
    
    # Run test verification
    if [ "$VERIFY_TESTS" = "true" ]; then
        if verify_tests; then
            checks_passed=$((checks_passed + 1))
        else
            checks_failed=$((checks_failed + 1))
            exit_code=1
        fi
        echo ""
    fi
    
    # Run security verification
    if [ "$VERIFY_SECURITY" = "true" ]; then
        if verify_security; then
            checks_passed=$((checks_passed + 1))
        else
            checks_failed=$((checks_failed + 1))
            exit_code=1
        fi
        echo ""
    fi
    
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
        log_info "Pre-Deployment Verification: PASSED"
        log_info "Ready to deploy to $ENVIRONMENT"
        log_info "=========================================="
    else
        log_error "=========================================="
        log_error "Pre-Deployment Verification: FAILED"
        log_error "Cannot proceed with deployment"
        log_error "=========================================="
    fi
    
    return $exit_code
}

# Run main function
main
exit $?
