#!/bin/bash
# restore-events.sh - Restore event logs from backup

set -e

# Configuration
EVENT_DIR="${EVENT_DIR:-./var/run}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backup file argument is provided
if [ $# -eq 0 ]; then
  echo -e "${RED}Error: No backup file specified${NC}"
  echo "Usage: $0 <backup-file>"
  echo "Example: $0 events-backup-20240103-120000.tar.gz"
  echo "         $0 s3://aureus-backups/events/events-backup-20240103-120000.tar.gz"
  exit 1
fi

BACKUP_FILE=$1

echo "=========================================="
echo "Aureus Event Log Restore"
echo "=========================================="
echo "Timestamp: $(date)"
echo "Backup File: ${BACKUP_FILE}"
echo "Event Directory: ${EVENT_DIR}"
echo "=========================================="

# Download from S3 if it's an S3 path
if [[ $BACKUP_FILE == s3://* ]]; then
  if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI not available${NC}"
    exit 1
  fi
  
  LOCAL_FILE="/tmp/$(basename $BACKUP_FILE)"
  echo "Downloading from S3..."
  if aws s3 cp "$BACKUP_FILE" "$LOCAL_FILE"; then
    echo -e "${GREEN}Downloaded to ${LOCAL_FILE}${NC}"
    BACKUP_FILE="$LOCAL_FILE"
  else
    echo -e "${RED}Error: Failed to download from S3${NC}"
    exit 1
  fi
fi

# Validate backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
  echo -e "${RED}Error: Backup file not found: ${BACKUP_FILE}${NC}"
  exit 1
fi

# Verify backup integrity
echo "Verifying backup integrity..."
if ! tar -tzf "${BACKUP_FILE}" > /dev/null 2>&1; then
  echo -e "${RED}Error: Backup file is corrupted or invalid${NC}"
  exit 1
fi
echo -e "${GREEN}Backup integrity verified${NC}"

# Backup current state if directory exists
if [ -d "${EVENT_DIR}" ]; then
  BACKUP_CURRENT="${EVENT_DIR}.backup-${TIMESTAMP}"
  echo "Backing up current event logs to ${BACKUP_CURRENT}..."
  mv "${EVENT_DIR}" "${BACKUP_CURRENT}"
  echo -e "${GREEN}Current state backed up${NC}"
fi

# Create event directory
mkdir -p "${EVENT_DIR}"

# Extract backup
echo "Extracting backup..."
if tar -xzf "${BACKUP_FILE}" -C "${EVENT_DIR}"; then
  echo -e "${GREEN}Backup extracted successfully${NC}"
else
  echo -e "${RED}Error: Failed to extract backup${NC}"
  
  # Restore previous state if extraction failed
  if [ -d "${BACKUP_CURRENT}" ]; then
    echo "Restoring previous state..."
    rm -rf "${EVENT_DIR}"
    mv "${BACKUP_CURRENT}" "${EVENT_DIR}"
  fi
  exit 1
fi

# Verify extracted files
FILE_COUNT=$(find "${EVENT_DIR}" -type f -name "events.log" | wc -l)
echo "Extracted ${FILE_COUNT} event log file(s)"

# Set proper permissions
chmod -R 755 "${EVENT_DIR}"

# Clean up temporary S3 download
if [[ $1 == s3://* ]] && [ -f "$LOCAL_FILE" ]; then
  rm "$LOCAL_FILE"
fi

# Summary
echo "=========================================="
echo -e "${GREEN}Restore completed successfully${NC}"
echo "Event logs restored to: ${EVENT_DIR}"
echo "Total event log files: ${FILE_COUNT}"
if [ -d "${BACKUP_CURRENT}" ]; then
  echo "Previous state saved to: ${BACKUP_CURRENT}"
fi
echo "=========================================="

# Exit successfully
exit 0
