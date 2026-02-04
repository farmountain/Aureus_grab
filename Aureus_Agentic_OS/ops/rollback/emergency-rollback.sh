#!/bin/bash

# Emergency Rollback Script
# Fast rollback for critical issues - minimal checks

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../.. && pwd)"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Main emergency rollback
main() {
    log_error "=========================================="
    log_error "EMERGENCY ROLLBACK INITIATED"
    log_error "=========================================="
    echo ""
    
    # Find most recent backup
    log_info "Finding most recent backup..."
    local latest_state_backup=$(ls -t "$BACKUP_DIR/state/state-backup-"*.tar.gz 2>/dev/null | head -n1)
    local latest_events_backup=$(ls -t "$BACKUP_DIR/events/events-backup-"*.tar.gz 2>/dev/null | head -n1)
    
    if [ -z "$latest_state_backup" ]; then
        log_error "No state backup found!"
        exit 1
    fi
    
    log_info "Latest state backup: $latest_state_backup"
    log_info "Latest events backup: ${latest_events_backup:-none}"
    echo ""
    
    # Stop services immediately
    log_info "Stopping all services..."
    systemctl stop aureus-console 2>/dev/null || pkill -f "node.*console" || true
    sleep 2
    log_info "✓ Services stopped"
    echo ""
    
    # Restore state
    log_info "Restoring state..."
    if bash "$SCRIPT_DIR/scripts/restore-state.sh" "$latest_state_backup"; then
        log_info "✓ State restored"
    else
        log_error "State restore failed"
        exit 1
    fi
    echo ""
    
    # Restore events if available
    if [ -n "$latest_events_backup" ]; then
        log_info "Restoring events..."
        bash "$SCRIPT_DIR/scripts/restore-events.sh" "$latest_events_backup" || log_warn "Events restore failed"
    fi
    echo ""
    
    # Restart services
    log_info "Restarting services..."
    systemctl start aureus-console 2>/dev/null || {
        cd "$SCRIPT_DIR/apps/console"
        nohup node dist/server.js > /var/log/aureus/console.log 2>&1 &
    }
    sleep 5
    log_info "✓ Services restarted"
    echo ""
    
    # Basic health check
    log_info "Performing basic health check..."
    if curl -sf --max-time 10 http://localhost:3000/health > /dev/null 2>&1; then
        log_info "✓ Service is responding"
    else
        log_warn "Service may not be fully operational"
    fi
    echo ""
    
    log_info "=========================================="
    log_info "EMERGENCY ROLLBACK COMPLETED"
    log_info "Please verify system functionality"
    log_info "=========================================="
}

main
exit $?
