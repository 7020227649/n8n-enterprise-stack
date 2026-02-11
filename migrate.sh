#!/bin/bash

# migrate.sh - Backup and Restore n8n Enterprise Stack
# Usage: 
#   ./migrate.sh export
#   ./migrate.sh import <archive_file>

set -e

PROJECT_NAME="n8n-enterprise-stack"
BACKUP_DIR="./n8n-migration-temp"
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
ARCHIVE_NAME="n8n-migration-${TIMESTAMP}.tar.gz"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[migrate]${NC} $1"
}

error() {
    echo -e "${RED}[error]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        error "Please run as root (sudo ./migrate.sh ...)"
        exit 1
    fi
}

function export_data() {
    check_root
    
    log "Starting export..."
    
    # Check if directory exists
    if [ ! -f "docker-compose.yml" ]; then
        error "docker-compose.yml not found. Run this from the project root."
        exit 1
    fi

    mkdir -p "$BACKUP_DIR/volumes"

    # Stop containers to ensure data consistency
    log "Stopping containers..."
    docker compose stop

    # Backup Project Files
    log "Backing up configuration files..."
    cp .env "$BACKUP_DIR/" 2>/dev/null || true
    cp docker-compose.yml "$BACKUP_DIR/"
    cp -r bot "$BACKUP_DIR/" 2>/dev/null || true
    cp install.sh "$BACKUP_DIR/" 2>/dev/null || true
    cp README.md "$BACKUP_DIR/" 2>/dev/null || true
    
    # Backup Volumes
    # We assume standard volume names based on project folder 'n8n-enterprise-stack'
    # Adjust valid names if needed.
    
    VOL_PREFIX="${PROJECT_NAME}_"
    if [ -z "$(docker volume ls -q | grep ${VOL_PREFIX}postgres_data)" ]; then
        # Try finding prefix dynamically
        DIR_NAME=$(basename $(pwd))
        VOL_PREFIX="${DIR_NAME}_"
    fi
    
    log "Backing up volumes (prefix: ${VOL_PREFIX})..."

    # 1. Postgres Data
    if docker volume inspect "${VOL_PREFIX}postgres_data" >/dev/null 2>&1; then
        log "Backing up postgres_data..."
        docker run --rm -v "${VOL_PREFIX}postgres_data":/volume -v "$(pwd)/$BACKUP_DIR/volumes":/backup alpine tar czf /backup/postgres_data.tar.gz -C /volume .
    else
        error "Volume ${VOL_PREFIX}postgres_data not found matched. Skipping."
    fi

    # 2. n8n Data
    if docker volume inspect "${VOL_PREFIX}n8n_data" >/dev/null 2>&1; then
        log "Backing up n8n_data..."
        docker run --rm -v "${VOL_PREFIX}n8n_data":/volume -v "$(pwd)/$BACKUP_DIR/volumes":/backup alpine tar czf /backup/n8n_data.tar.gz -C /volume .
    else
        error "Volume ${VOL_PREFIX}n8n_data not found. Skipping."
    fi

    # 3. Bot Data
    if docker volume inspect "${VOL_PREFIX}bot_data" >/dev/null 2>&1; then
        log "Backing up bot_data..."
        docker run --rm -v "${VOL_PREFIX}bot_data":/volume -v "$(pwd)/$BACKUP_DIR/volumes":/backup alpine tar czf /backup/bot_data.tar.gz -C /volume .
    else
        log "Volume ${VOL_PREFIX}bot_data not found (maybe first run?). Skipping."
    fi

    # Create Final Archive
    log "Creating final archive ${ARCHIVE_NAME}..."
    tar czf "$ARCHIVE_NAME" -C "$BACKUP_DIR" .

    # Cleanup
    rm -rf "$BACKUP_DIR"
    
    # Restart
    log "Restarting containers..."
    docker compose start

    log "✅ Export complete!"
    echo -e "Saved to: ${GREEN}$(pwd)/${ARCHIVE_NAME}${NC}"
    echo "Transfer this file to your new server to restore."
}

function import_data() {
    ARCHIVE_FILE=$1
    
    if [ -z "$ARCHIVE_FILE" ]; then
        error "Usage: ./migrate.sh import <filename.tar.gz>"
        exit 1
    fi
    
    check_root
    
    if [ ! -f "$ARCHIVE_FILE" ]; then
        error "File $ARCHIVE_FILE not found."
        exit 1
    fi

    log "Starting import from $ARCHIVE_FILE..."

    # Extract
    mkdir -p "$BACKUP_DIR"
    tar xzf "$ARCHIVE_FILE" -C "$BACKUP_DIR"

    # Restore Project Files
    log "Restoring project files..."
    cp "$BACKUP_DIR/.env" . 2>/dev/null || true
    cp "$BACKUP_DIR/docker-compose.yml" .
    cp -r "$BACKUP_DIR/bot" . 2>/dev/null || true
    cp "$BACKUP_DIR/install.sh" . 2>/dev/null || true
    cp "$BACKUP_DIR/README.md" . 2>/dev/null || true
    
    # Restore Volumes
    VOL_PREFIX="${PROJECT_NAME}_"
    log "Restoring volumes (prefix: ${VOL_PREFIX})..."
    
    # Function to restore a single volume
    restore_vol() {
        VOL_NAME=$1
        FILE_NAME=$2
        if [ -f "$BACKUP_DIR/volumes/$FILE_NAME" ]; then
            log "Restoring $VOL_NAME..."
            check=$(docker volume create "$VOL_NAME")
            docker run --rm -v "$VOL_NAME":/volume -v "$(pwd)/$BACKUP_DIR/volumes":/backup alpine sh -c "cd /volume && tar xzf /backup/$FILE_NAME"
        fi
    }

    restore_vol "${VOL_PREFIX}postgres_data" "postgres_data.tar.gz"
    restore_vol "${VOL_PREFIX}n8n_data" "n8n_data.tar.gz"
    restore_vol "${VOL_PREFIX}bot_data" "bot_data.tar.gz"

    # Cleanup
    rm -rf "$BACKUP_DIR"

    # Start
    log "Starting up..."
    docker compose up -d --build

    log "✅ Import complete! System is running."
}

case "$1" in
    export)
        export_data
        ;;
    import)
        import_data "$2"
        ;;
    *)
        echo "Usage: ./migrate.sh {export|import <file>}"
        exit 1
        ;;
esac
