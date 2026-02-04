#!/bin/bash

# State Store Health Check Script
# Verifies state store connectivity and performance

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STATE_STORE_TYPE="${STATE_STORE_TYPE:-file}"
DATABASE_URL="${DATABASE_URL:-}"
REDIS_URL="${REDIS_URL:-}"
LATENCY_THRESHOLD="${LATENCY_THRESHOLD:-1000}" # milliseconds

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

# Check PostgreSQL state store
check_postgres() {
    log_info "Checking PostgreSQL state store..."
    
    if [ -z "$DATABASE_URL" ]; then
        log_warn "DATABASE_URL not set, skipping PostgreSQL check"
        return 0
    fi
    
    # Check connectivity
    if ! psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        log_error "✗ Cannot connect to PostgreSQL"
        return 1
    fi
    
    log_info "✓ PostgreSQL connection successful"
    
    # Check latency
    local start_time=$(date +%s%3N)
    psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1
    local end_time=$(date +%s%3N)
    local latency=$((end_time - start_time))
    
    log_info "PostgreSQL latency: ${latency}ms"
    
    if [ $latency -gt $LATENCY_THRESHOLD ]; then
        log_warn "PostgreSQL latency exceeds threshold (${LATENCY_THRESHOLD}ms)"
    fi
    
    # Check disk space
    local disk_usage
    disk_usage=$(psql "$DATABASE_URL" -t -c "SELECT pg_database_size(current_database());" 2>/dev/null | tr -d ' ')
    
    if [ -n "$disk_usage" ]; then
        local size_mb=$((disk_usage / 1024 / 1024))
        log_info "Database size: ${size_mb}MB"
    fi
    
    return 0
}

# Check Redis state store
check_redis() {
    log_info "Checking Redis state store..."
    
    if [ -z "$REDIS_URL" ]; then
        log_warn "REDIS_URL not set, skipping Redis check"
        return 0
    fi
    
    # Extract host and port from REDIS_URL
    local redis_host=$(echo "$REDIS_URL" | sed -E 's#redis://([^:]+):.*#\1#')
    local redis_port=$(echo "$REDIS_URL" | sed -E 's#redis://[^:]+:([0-9]+).*#\1#')
    
    # Check connectivity
    if ! redis-cli -h "$redis_host" -p "$redis_port" PING > /dev/null 2>&1; then
        log_error "✗ Cannot connect to Redis"
        return 1
    fi
    
    log_info "✓ Redis connection successful"
    
    # Check latency
    local start_time=$(date +%s%3N)
    redis-cli -h "$redis_host" -p "$redis_port" PING > /dev/null 2>&1
    local end_time=$(date +%s%3N)
    local latency=$((end_time - start_time))
    
    log_info "Redis latency: ${latency}ms"
    
    if [ $latency -gt $LATENCY_THRESHOLD ]; then
        log_warn "Redis latency exceeds threshold (${LATENCY_THRESHOLD}ms)"
    fi
    
    # Check memory usage
    local memory_info
    memory_info=$(redis-cli -h "$redis_host" -p "$redis_port" INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    
    if [ -n "$memory_info" ]; then
        log_info "Redis memory usage: $memory_info"
    fi
    
    return 0
}

# Check file-based state store
check_file_store() {
    log_info "Checking file-based state store..."
    
    local state_dir="${STATE_DIR:-./var/aureus/state}"
    
    if [ ! -d "$state_dir" ]; then
        log_warn "State directory does not exist: $state_dir"
        return 0
    fi
    
    # Check directory is writable
    if ! touch "$state_dir/.health_check_test" 2>/dev/null; then
        log_error "✗ State directory is not writable"
        return 1
    fi
    rm -f "$state_dir/.health_check_test"
    
    log_info "✓ State directory is writable"
    
    # Check disk space
    local disk_usage
    disk_usage=$(df -h "$state_dir" | awk 'NR==2 {print $5}' | tr -d '%')
    
    log_info "Disk usage: ${disk_usage}%"
    
    if [ $disk_usage -gt 90 ]; then
        log_error "✗ Disk usage exceeds 90%"
        return 1
    elif [ $disk_usage -gt 80 ]; then
        log_warn "Disk usage exceeds 80%"
    fi
    
    return 0
}

# Main health check routine
main() {
    log_info "Starting state store health check..."
    log_info "State store type: $STATE_STORE_TYPE"
    echo ""
    
    local exit_code=0
    
    case "$STATE_STORE_TYPE" in
        postgres|postgresql)
            check_postgres || exit_code=1
            ;;
        redis)
            check_redis || exit_code=1
            ;;
        file|filesystem)
            check_file_store || exit_code=1
            ;;
        *)
            log_warn "Unknown state store type: $STATE_STORE_TYPE"
            log_info "Checking all available state stores..."
            check_file_store || exit_code=1
            check_postgres || true
            check_redis || true
            ;;
    esac
    
    echo ""
    
    if [ $exit_code -eq 0 ]; then
        log_info "=========================================="
        log_info "State store health check: PASSED"
        log_info "=========================================="
    else
        log_error "=========================================="
        log_error "State store health check: FAILED"
        log_error "=========================================="
    fi
    
    return $exit_code
}

# Run main function
main
exit $?
