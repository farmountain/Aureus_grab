#!/bin/bash
# restore-state.sh - Restore state stores from backup

set -e

# Configuration
STATE_DIR="${STATE_DIR:-./var/aureus/state}"
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
  echo "Examples:"
  echo "  $0 state-backup-20240103-120000.tar.gz"
  echo "  $0 state-postgres-20240103-120000.dump"
  echo "  $0 state-redis-20240103-120000.rdb"
  echo "  $0 s3://aureus-backups/state/state-backup-20240103-120000.tar.gz"
  exit 1
fi

BACKUP_FILE=$1

echo "=========================================="
echo "Aureus State Store Restore"
echo "=========================================="
echo "Timestamp: $(date)"
echo "Backup File: ${BACKUP_FILE}"
echo "State Directory: ${STATE_DIR}"
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
    # Set secure permissions on temporary file
    chmod 600 "$LOCAL_FILE"
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

# Determine backup type from filename
if [[ $BACKUP_FILE == *"postgres"* ]]; then
  echo "Detected PostgreSQL backup"
  
  # Check if DATABASE_URL is set
  if [ -z "${DATABASE_URL}" ]; then
    echo -e "${RED}Error: DATABASE_URL environment variable not set${NC}"
    exit 1
  fi
  
  # Create backup of current database
  DB_NAME=$(echo "${DATABASE_URL}" | sed -n 's|.*\/\([^?]*\).*|\1|p')
  echo "Creating backup of current database..."
  pg_dump "${DATABASE_URL}" -F c -f "/tmp/${DB_NAME}-current-${TIMESTAMP}.dump" || true
  
  # Restore from backup
  echo "Restoring PostgreSQL database..."
  if pg_restore -d "${DATABASE_URL}" --clean --if-exists "${BACKUP_FILE}"; then
    echo -e "${GREEN}PostgreSQL restore completed${NC}"
  else
    echo -e "${RED}Error: PostgreSQL restore failed${NC}"
    echo "Previous database backup saved to: /tmp/${DB_NAME}-current-${TIMESTAMP}.dump"
    exit 1
  fi
  
elif [[ $BACKUP_FILE == *"redis"* ]]; then
  echo "Detected Redis backup"
  
  # Check if REDIS_URL is set
  if [ -z "${REDIS_URL}" ]; then
    echo -e "${RED}Error: REDIS_URL environment variable not set${NC}"
    exit 1
  fi
  
  # Extract Redis connection details
  REDIS_HOST=$(echo "${REDIS_URL}" | sed -n 's|redis://\([^:@]*\).*|\1|p' | sed 's|.*@||')
  REDIS_PORT=$(echo "${REDIS_URL}" | sed -n 's|redis://[^:]*:\([0-9]*\).*|\1|p')
  REDIS_PORT=${REDIS_PORT:-6379}  # Default to 6379 if not specified
  
  # Stop Redis
  echo "Stopping Redis..."
  if command -v systemctl &> /dev/null; then
    if ! sudo systemctl stop redis 2>/dev/null; then
      echo -e "${RED}Error: Failed to stop Redis${NC}"
      echo "Please stop Redis manually before running restore"
      exit 1
    fi
  else
    echo -e "${YELLOW}Warning: systemctl not available, please stop Redis manually${NC}"
    read -p "Press Enter after Redis is stopped..."
  fi
  
  # Backup current dump.rdb
  REDIS_DATA_DIR="${REDIS_DATA_DIR:-/var/lib/redis}"
  if [ -f "${REDIS_DATA_DIR}/dump.rdb" ]; then
    cp "${REDIS_DATA_DIR}/dump.rdb" "/tmp/dump-current-${TIMESTAMP}.rdb"
    echo "Current Redis data backed up to /tmp/dump-current-${TIMESTAMP}.rdb"
  fi
  
  # Copy backup to Redis directory
  echo "Restoring Redis data..."
  sudo cp "${BACKUP_FILE}" "${REDIS_DATA_DIR}/dump.rdb"
  sudo chown redis:redis "${REDIS_DATA_DIR}/dump.rdb"
  
  # Start Redis
  echo "Starting Redis..."
  if command -v systemctl &> /dev/null; then
    sudo systemctl start redis
  fi
  
  # Verify
  sleep 2
  if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" PING | grep -q PONG; then
    echo -e "${GREEN}Redis restore completed${NC}"
  else
    echo -e "${RED}Error: Redis is not responding${NC}"
    exit 1
  fi
  
else
  echo "Detected file-based backup"
  
  # Verify backup integrity
  echo "Verifying backup integrity..."
  if ! tar -tzf "${BACKUP_FILE}" > /dev/null 2>&1; then
    echo -e "${RED}Error: Backup file is corrupted or invalid${NC}"
    exit 1
  fi
  echo -e "${GREEN}Backup integrity verified${NC}"
  
  # Backup current state if directory exists
  if [ -d "${STATE_DIR}" ]; then
    BACKUP_CURRENT="${STATE_DIR}.backup-${TIMESTAMP}"
    echo "Backing up current state to ${BACKUP_CURRENT}..."
    mv "${STATE_DIR}" "${BACKUP_CURRENT}"
    echo -e "${GREEN}Current state backed up${NC}"
  fi
  
  # Create parent directory
  mkdir -p "$(dirname ${STATE_DIR})"
  
  # Extract backup
  echo "Extracting backup..."
  if tar -xzf "${BACKUP_FILE}" -C "$(dirname ${STATE_DIR})"; then
    echo -e "${GREEN}Backup extracted successfully${NC}"
  else
    echo -e "${RED}Error: Failed to extract backup${NC}"
    
    # Restore previous state if extraction failed
    if [ -d "${BACKUP_CURRENT}" ]; then
      echo "Restoring previous state..."
      rm -rf "${STATE_DIR}"
      mv "${BACKUP_CURRENT}" "${STATE_DIR}"
    fi
    exit 1
  fi
  
  # Set proper permissions
  chmod -R 755 "${STATE_DIR}"
fi

# Clean up temporary S3 download
if [[ $1 == s3://* ]] && [ -f "$LOCAL_FILE" ]; then
  rm "$LOCAL_FILE"
fi

# Summary
echo "=========================================="
echo -e "${GREEN}Restore completed successfully${NC}"
echo "State store restored from: $(basename ${BACKUP_FILE})"
echo "=========================================="

# Exit successfully
exit 0
