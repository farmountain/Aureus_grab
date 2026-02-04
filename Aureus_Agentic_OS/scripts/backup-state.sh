#!/bin/bash
# backup-state.sh - Backup state stores to local and S3 storage

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/backups/state}"
STATE_DIR="${STATE_DIR:-./var/aureus/state}"
S3_BUCKET="${S3_BUCKET:-aureus-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="state-backup-${TIMESTAMP}.tar.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Aureus State Store Backup"
echo "=========================================="
echo "Timestamp: $(date)"
echo "State Directory: ${STATE_DIR}"
echo "Backup Directory: ${BACKUP_DIR}"
echo "=========================================="

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Check if using PostgreSQL (environment variable)
if [ -n "${DATABASE_URL}" ]; then
  echo "Detected PostgreSQL state store"
  BACKUP_NAME="state-postgres-${TIMESTAMP}.dump"
  
  # Extract database name from DATABASE_URL
  DB_NAME=$(echo "${DATABASE_URL}" | sed -n 's|.*\/\([^?]*\).*|\1|p')
  
  echo "Creating PostgreSQL backup..."
  if pg_dump "${DATABASE_URL}" -F c -f "${BACKUP_DIR}/${BACKUP_NAME}"; then
    echo -e "${GREEN}PostgreSQL backup created${NC}"
  else
    echo -e "${RED}Error: PostgreSQL backup failed${NC}"
    exit 1
  fi
  
# Check if using Redis (environment variable)
elif [ -n "${REDIS_URL}" ]; then
  echo "Detected Redis state store"
  BACKUP_NAME="state-redis-${TIMESTAMP}.rdb"
  
  # Extract Redis connection details
  REDIS_HOST=$(echo "${REDIS_URL}" | sed -n 's|redis://\([^:@]*\).*|\1|p' | sed 's|.*@||')
  REDIS_PORT=$(echo "${REDIS_URL}" | sed -n 's|redis://[^:]*:\([0-9]*\).*|\1|p')
  REDIS_PORT=${REDIS_PORT:-6379}  # Default to 6379 if not specified
  
  echo "Creating Redis backup..."
  if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" BGSAVE; then
    # Wait for BGSAVE to complete by polling LASTSAVE
    echo "Waiting for BGSAVE to complete..."
    LAST_SAVE=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" LASTSAVE)
    for i in {1..30}; do
      sleep 1
      CURRENT_SAVE=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" LASTSAVE)
      if [ "$CURRENT_SAVE" -gt "$LAST_SAVE" ]; then
        echo "BGSAVE completed"
        break
      fi
    done
    
    REDIS_DATA_DIR="${REDIS_DATA_DIR:-/var/lib/redis}"
    if [ -f "${REDIS_DATA_DIR}/dump.rdb" ]; then
      cp "${REDIS_DATA_DIR}/dump.rdb" "${BACKUP_DIR}/${BACKUP_NAME}"
      echo -e "${GREEN}Redis backup created${NC}"
    else
      echo -e "${RED}Error: Redis dump.rdb not found at ${REDIS_DATA_DIR}${NC}"
      exit 1
    fi
  else
    echo -e "${RED}Error: Redis backup failed${NC}"
    exit 1
  fi

# Fall back to file-based state store
else
  echo "Using file-based state store"
  
  # Check if state directory exists
  if [ -d "${STATE_DIR}" ]; then
    echo "Creating backup archive..."
    tar -czf "${BACKUP_DIR}/${BACKUP_NAME}" -C "$(dirname ${STATE_DIR})" "$(basename ${STATE_DIR})"
  else
    echo -e "${YELLOW}Warning: State directory not found, creating empty backup${NC}"
    mkdir -p "${STATE_DIR}"
    tar -czf "${BACKUP_DIR}/${BACKUP_NAME}" -C "$(dirname ${STATE_DIR})" "$(basename ${STATE_DIR})"
  fi
fi

# Verify backup was created
if [ ! -f "${BACKUP_DIR}/${BACKUP_NAME}" ]; then
  echo -e "${RED}Error: Backup file was not created${NC}"
  exit 1
fi

# Get backup size
BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_NAME}" | cut -f1)
echo -e "${GREEN}Backup created: ${BACKUP_NAME} (${BACKUP_SIZE})${NC}"

# Upload to S3 (if AWS CLI is available and S3_BUCKET is set)
if command -v aws &> /dev/null && [ -n "${S3_BUCKET}" ]; then
  echo "Uploading to S3..."
  if aws s3 cp "${BACKUP_DIR}/${BACKUP_NAME}" "s3://${S3_BUCKET}/state/${BACKUP_NAME}"; then
    echo -e "${GREEN}Backup uploaded to S3: s3://${S3_BUCKET}/state/${BACKUP_NAME}${NC}"
  else
    echo -e "${YELLOW}Warning: Failed to upload to S3${NC}"
  fi
else
  echo -e "${YELLOW}AWS CLI not available or S3_BUCKET not set, skipping S3 upload${NC}"
fi

# Clean up old local backups
echo "Cleaning up old backups (older than ${RETENTION_DAYS} days)..."
DELETED_COUNT=$(find "${BACKUP_DIR}" -type f \( -name "state-backup-*.tar.gz" -o -name "state-postgres-*.dump" -o -name "state-redis-*.rdb" \) -mtime +${RETENTION_DAYS} -delete -print | wc -l)
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
