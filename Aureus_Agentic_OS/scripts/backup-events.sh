#!/bin/bash
# backup-events.sh - Backup event logs to local and S3 storage

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/events}"
EVENT_DIR="${EVENT_DIR:-./var/run}"
S3_BUCKET="${S3_BUCKET:-aureus-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="events-backup-${TIMESTAMP}.tar.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Aureus Event Log Backup"
echo "=========================================="
echo "Timestamp: $(date)"
echo "Event Directory: ${EVENT_DIR}"
echo "Backup Directory: ${BACKUP_DIR}"
echo "=========================================="

# Check if event directory exists
if [ ! -d "${EVENT_DIR}" ]; then
  echo -e "${RED}Error: Event directory not found: ${EVENT_DIR}${NC}"
  exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Create compressed backup
echo "Creating backup archive..."
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}" -C "${EVENT_DIR}" .

# Verify backup was created
if [ ! -f "${BACKUP_DIR}/${BACKUP_NAME}" ]; then
  echo -e "${RED}Error: Backup file was not created${NC}"
  exit 1
fi

# Get backup size
BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_NAME}" | cut -f1)
echo -e "${GREEN}Backup created: ${BACKUP_NAME} (${BACKUP_SIZE})${NC}"

# Verify backup integrity
echo "Verifying backup integrity..."
if tar -tzf "${BACKUP_DIR}/${BACKUP_NAME}" > /dev/null 2>&1; then
  echo -e "${GREEN}Backup integrity verified${NC}"
else
  echo -e "${RED}Error: Backup integrity check failed${NC}"
  exit 1
fi

# Upload to S3 (if AWS CLI is available and S3_BUCKET is set)
if command -v aws &> /dev/null && [ -n "${S3_BUCKET}" ]; then
  echo "Uploading to S3..."
  if aws s3 cp "${BACKUP_DIR}/${BACKUP_NAME}" "s3://${S3_BUCKET}/events/${BACKUP_NAME}"; then
    echo -e "${GREEN}Backup uploaded to S3: s3://${S3_BUCKET}/events/${BACKUP_NAME}${NC}"
  else
    echo -e "${YELLOW}Warning: Failed to upload to S3${NC}"
  fi
else
  echo -e "${YELLOW}AWS CLI not available or S3_BUCKET not set, skipping S3 upload${NC}"
fi

# Clean up old local backups
echo "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -type f -name "events-backup-*.tar.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "${DELETED_COUNT}" -gt 0 ]; then
  echo -e "${GREEN}Deleted ${DELETED_COUNT} old backup(s)${NC}"
else
  echo "No old backups to delete"
fi

# Summary
echo "=========================================="
echo -e "${GREEN}Backup completed successfully${NC}"
echo "Backup file: ${BACKUP_NAME}"
echo "Location: ${BACKUP_DIR}/${BACKUP_NAME}"
echo "Size: ${BACKUP_SIZE}"
echo "=========================================="

# Exit successfully
exit 0
