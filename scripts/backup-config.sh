#!/bin/bash

# Configuration Backup Utility for Local-Server-Site-Pusher
# This script helps backup persistent settings before container updates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="config_backup_$TIMESTAMP.tar.gz"

echo "🔄 Local-Server-Site-Pusher Configuration Backup Utility"
echo "=================================================="

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if config directory exists
if [ ! -d "$PROJECT_DIR/config" ]; then
    echo "❌ Error: Config directory not found at $PROJECT_DIR/config"
    echo "   Make sure you're running this from the project directory"
    exit 1
fi

echo "📁 Backing up configuration from: $PROJECT_DIR/config"
echo "💾 Backup destination: $BACKUP_DIR/$BACKUP_FILE"

# Create backup
cd "$PROJECT_DIR"
tar -czf "$BACKUP_DIR/$BACKUP_FILE" config/

if [ $? -eq 0 ]; then
    echo "✅ Backup created successfully!"
    echo "📄 Backup file: $BACKUP_DIR/$BACKUP_FILE"
    
    # List backup contents
    echo ""
    echo "📋 Backup contents:"
    tar -tzf "$BACKUP_DIR/$BACKUP_FILE" | sed 's/^/   /'
    
    # Show file size
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo ""
    echo "📏 Backup size: $BACKUP_SIZE"
    
    # Keep only last 10 backups
    echo ""
    echo "🧹 Cleaning old backups (keeping last 10)..."
    cd "$BACKUP_DIR"
    ls -t config_backup_*.tar.gz 2>/dev/null | tail -n +11 | xargs rm -f
    
    REMAINING_BACKUPS=$(ls -1 config_backup_*.tar.gz 2>/dev/null | wc -l)
    echo "📚 Total backups: $REMAINING_BACKUPS"
    
else
    echo "❌ Error: Backup failed!"
    exit 1
fi

echo ""
echo "💡 Usage tips:"
echo "   - Run this before container updates: ./scripts/backup-config.sh"
echo "   - Restore with: ./scripts/restore-config.sh $BACKUP_FILE"
echo "   - Backups are stored in: $BACKUP_DIR"