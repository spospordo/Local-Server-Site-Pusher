#!/bin/bash

# Configuration Restore Utility for Local-Server-Site-Pusher
# This script helps restore persistent settings after container updates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"

echo "🔄 Local-Server-Site-Pusher Configuration Restore Utility"
echo "=================================================="

# Check if backup file is provided
if [ $# -eq 0 ]; then
    echo "❌ Error: Please provide a backup file to restore"
    echo ""
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Available backups:"
    if [ -d "$BACKUP_DIR" ]; then
        ls -1t "$BACKUP_DIR"/config_backup_*.tar.gz 2>/dev/null | head -5 | sed 's/^/   /' || echo "   No backups found"
    else
        echo "   No backup directory found"
    fi
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists (try both absolute path and relative to backup dir)
if [ ! -f "$BACKUP_FILE" ] && [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    echo "❌ Error: Backup file not found"
    echo "   Tried: $BACKUP_FILE"
    echo "   Tried: $BACKUP_DIR/$BACKUP_FILE"
    exit 1
fi

# Use full path if file exists in backup dir
if [ ! -f "$BACKUP_FILE" ] && [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
fi

echo "📄 Restoring from: $BACKUP_FILE"

# Validate backup file
echo "🔍 Validating backup file..."
if ! tar -tzf "$BACKUP_FILE" >/dev/null 2>&1; then
    echo "❌ Error: Invalid backup file format"
    exit 1
fi

# Show backup contents
echo "📋 Backup contents:"
tar -tzf "$BACKUP_FILE" | sed 's/^/   /'

# Create backup of current config before restore
if [ -d "$PROJECT_DIR/config" ]; then
    CURRENT_BACKUP="$BACKUP_DIR/pre_restore_backup_$(date +"%Y%m%d_%H%M%S").tar.gz"
    echo ""
    echo "💾 Creating backup of current config..."
    cd "$PROJECT_DIR"
    tar -czf "$CURRENT_BACKUP" config/ 2>/dev/null || true
    echo "📄 Current config backed up to: $CURRENT_BACKUP"
fi

# Confirm restoration
echo ""
read -p "⚠️  This will replace your current configuration. Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Restore cancelled"
    exit 1
fi

# Stop container if running
echo ""
echo "🛑 Stopping container if running..."
cd "$PROJECT_DIR"
if [ -f "docker-compose.yml" ]; then
    docker-compose down 2>/dev/null || true
else
    docker stop local-server 2>/dev/null || true
fi

# Remove current config directory
if [ -d "$PROJECT_DIR/config" ]; then
    echo "🗑️  Removing current config directory..."
    rm -rf "$PROJECT_DIR/config"
fi

# Restore from backup
echo "📥 Restoring configuration..."
cd "$PROJECT_DIR"
tar -xzf "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ Configuration restored successfully!"
    
    # Validate restored config
    echo ""
    echo "🔍 Validating restored configuration..."
    if [ -f "$PROJECT_DIR/config/config.json" ]; then
        if node -e "JSON.parse(require('fs').readFileSync('$PROJECT_DIR/config/config.json', 'utf8'))" 2>/dev/null; then
            echo "✅ Configuration file is valid JSON"
        else
            echo "⚠️  Warning: Configuration file may have JSON syntax errors"
        fi
    else
        echo "⚠️  Warning: config.json not found in backup"
    fi
    
    # Show restored files
    echo ""
    echo "📋 Restored files:"
    find "$PROJECT_DIR/config" -type f | sed 's/^/   /'
    
    echo ""
    echo "✅ Restore completed!"
    echo "💡 You can now start the container with: docker-compose up -d"
    
else
    echo "❌ Error: Restore failed!"
    if [ -f "$CURRENT_BACKUP" ]; then
        echo "🔄 Attempting to restore previous config..."
        tar -xzf "$CURRENT_BACKUP" 2>/dev/null || true
    fi
    exit 1
fi