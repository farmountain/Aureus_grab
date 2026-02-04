#!/bin/bash

# Automated Rollback Script
# Performs automated rollback to previous version

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
ROLLBACK_VERSION="${ROLLBACK_VERSION:-}"
ROLLBACK_SNAPSHOT="${ROLLBACK_SNAPSHOT:-}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
DRY_RUN="${DRY_RUN:-false}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && cd ../.. && pwd)"

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

# Create pre-rollback backup
create_backup() {
    log_step "Creating pre-rollback backup..."
    
    local backup_timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_name="pre-rollback-${backup_timestamp}"
    
    # Backup state
    if bash "$SCRIPT_DIR/scripts/backup-state.sh" > /dev/null 2>&1; then
        log_info "✓ State backup created"
    else
        log_warn "Failed to create state backup"
    fi
    
    # Backup events
    if bash "$SCRIPT_DIR/scripts/backup-events.sh" > /dev/null 2>&1; then
        log_info "✓ Events backup created"
    else
        log_warn "Failed to create events backup"
    fi
    
    return 0
}

# Stop services
stop_services() {
    log_step "Stopping services..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would stop services"
        return 0
    fi
    
    # Try systemd first
    if systemctl is-active aureus-console > /dev/null 2>&1; then
        sudo systemctl stop aureus-console
        log_info "✓ Stopped aureus-console service"
    else
        log_warn "aureus-console service not found or not running"
    fi
    
    # Kill any running node processes (fallback)
    pkill -f "node.*console" 2>/dev/null || true
    
    return 0
}

# Restore from snapshot
restore_snapshot() {
    log_step "Restoring from snapshot..."
    
    if [ -z "$ROLLBACK_SNAPSHOT" ]; then
        log_warn "No snapshot ID specified"
        return 0
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would restore snapshot: $ROLLBACK_SNAPSHOT"
        return 0
    fi
    
    # Use API to trigger rollback
    local response
    response=$(curl -sf -X POST "$CONSOLE_URL/api/workflows/rollback" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${AUTH_TOKEN:-}" \
        -d "{\"snapshotId\": \"$ROLLBACK_SNAPSHOT\"}" 2>&1) || {
        log_error "Failed to trigger snapshot rollback"
        return 1
    }
    
    log_info "✓ Snapshot rollback initiated"
    return 0
}

# Restore from version
restore_version() {
    log_step "Restoring version..."
    
    if [ -z "$ROLLBACK_VERSION" ]; then
        log_error "No rollback version specified"
        return 1
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would restore version: $ROLLBACK_VERSION"
        return 0
    fi
    
    # Check if version artifact exists
    local artifact_path="$BACKUP_DIR/versions/console-app-${ROLLBACK_VERSION}.tar.gz"
    
    if [ ! -f "$artifact_path" ]; then
        log_error "Version artifact not found: $artifact_path"
        log_info "Attempting to download from registry..."
        
        # Try to download from GitHub releases or artifact storage
        local download_url="https://github.com/farmountain/Aureus_Agentic_OS/releases/download/${ROLLBACK_VERSION}/console-app.tar.gz"
        
        if curl -sfL "$download_url" -o "$artifact_path"; then
            log_info "✓ Downloaded version artifact"
        else
            log_error "Failed to download version artifact"
            return 1
        fi
    fi
    
    # Extract and restore
    log_info "Extracting version artifact..."
    local temp_dir=$(mktemp -d)
    
    if tar -xzf "$artifact_path" -C "$temp_dir"; then
        log_info "✓ Artifact extracted"
    else
        log_error "Failed to extract artifact"
        rm -rf "$temp_dir"
        return 1
    fi
    
    # Replace current deployment
    log_info "Replacing current deployment..."
    
    if [ -d "$SCRIPT_DIR/apps/console/dist" ]; then
        mv "$SCRIPT_DIR/apps/console/dist" "$SCRIPT_DIR/apps/console/dist.backup"
    fi
    
    cp -r "$temp_dir/dist" "$SCRIPT_DIR/apps/console/"
    cp -r "$temp_dir/ui" "$SCRIPT_DIR/apps/console/src/"
    
    rm -rf "$temp_dir"
    
    log_info "✓ Version restored"
    return 0
}

# Start services
start_services() {
    log_step "Starting services..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would start services"
        return 0
    fi
    
    # Try systemd first
    if systemctl list-unit-files | grep -q aureus-console; then
        sudo systemctl start aureus-console
        log_info "✓ Started aureus-console service"
    else
        log_warn "aureus-console service not found, starting manually..."
        cd "$SCRIPT_DIR/apps/console"
        nohup node dist/server.js > /var/log/aureus/console.log 2>&1 &
        log_info "✓ Started console manually"
    fi
    
    return 0
}

# Verify rollback success
verify_rollback() {
    log_step "Verifying rollback..."
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "[DRY RUN] Would verify rollback"
        return 0
    fi
    
    # Wait for service to start
    sleep 10
    
    # Run post-deployment verification
    if bash "$SCRIPT_DIR/ops/verification/post-deployment.sh"; then
        log_info "✓ Rollback verification passed"
        return 0
    else
        log_error "✗ Rollback verification failed"
        return 1
    fi
}

# Send notification
send_notification() {
    local status=$1
    local message=$2
    
    log_step "Sending notification..."
    
    # Log to syslog
    logger -t aureus-rollback "$message"
    
    # TODO: Add integration with notification services (Slack, PagerDuty, etc.)
    log_info "Notification: $message"
    
    return 0
}

# Main rollback routine
main() {
    log_info "=========================================="
    log_info "Automated Rollback"
    log_info "=========================================="
    log_info "Environment: $ENVIRONMENT"
    log_info "Rollback version: ${ROLLBACK_VERSION:-not specified}"
    log_info "Rollback snapshot: ${ROLLBACK_SNAPSHOT:-not specified}"
    log_info "Dry run: $DRY_RUN"
    echo ""
    
    if [ "$DRY_RUN" = "true" ]; then
        log_warn "DRY RUN MODE - No changes will be made"
        echo ""
    fi
    
    # Validate inputs
    if [ -z "$ROLLBACK_VERSION" ] && [ -z "$ROLLBACK_SNAPSHOT" ]; then
        log_error "Either ROLLBACK_VERSION or ROLLBACK_SNAPSHOT must be specified"
        exit 1
    fi
    
    local exit_code=0
    
    # Create backup before rollback
    create_backup || log_warn "Backup creation failed, continuing..."
    echo ""
    
    # Stop services
    if ! stop_services; then
        log_error "Failed to stop services"
        exit_code=1
        exit $exit_code
    fi
    echo ""
    
    # Perform rollback
    if [ -n "$ROLLBACK_SNAPSHOT" ]; then
        if ! restore_snapshot; then
            log_error "Snapshot restore failed"
            exit_code=1
        fi
    elif [ -n "$ROLLBACK_VERSION" ]; then
        if ! restore_version; then
            log_error "Version restore failed"
            exit_code=1
        fi
    fi
    echo ""
    
    # Start services
    if [ $exit_code -eq 0 ]; then
        if ! start_services; then
            log_error "Failed to start services"
            exit_code=1
        fi
        echo ""
    fi
    
    # Verify rollback
    if [ $exit_code -eq 0 ] && [ "$DRY_RUN" != "true" ]; then
        if ! verify_rollback; then
            log_error "Rollback verification failed"
            exit_code=1
        fi
        echo ""
    fi
    
    # Send notification
    if [ $exit_code -eq 0 ]; then
        send_notification "success" "Rollback to ${ROLLBACK_VERSION:-$ROLLBACK_SNAPSHOT} completed successfully"
        log_info "=========================================="
        log_info "Automated Rollback: COMPLETED"
        log_info "=========================================="
    else
        send_notification "failure" "Rollback to ${ROLLBACK_VERSION:-$ROLLBACK_SNAPSHOT} failed"
        log_error "=========================================="
        log_error "Automated Rollback: FAILED"
        log_error "Manual intervention may be required"
        log_error "=========================================="
    fi
    
    return $exit_code
}

# Run main function
main
exit $?
