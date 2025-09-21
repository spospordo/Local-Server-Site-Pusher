#!/bin/bash

# Show persistent settings summary for Local-Server-Site-Pusher

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "📊 Local-Server-Site-Pusher Persistent Settings Summary"
echo "======================================================="

cd "$PROJECT_DIR"

# Check if config directory exists
if [ ! -d "config" ]; then
    echo "❌ Config directory not found"
    echo "   Run the server once to create initial configuration"
    exit 1
fi

echo ""
echo "📁 Configuration Files:"
echo "----------------------"

# Main config file
if [ -f "config/config.json" ]; then
    CONFIG_SIZE=$(du -h "config/config.json" | cut -f1)
    echo "✅ config.json ($CONFIG_SIZE)"
    
    # Parse and show key settings
    if command -v node >/dev/null 2>&1; then
        echo "   📋 Key Settings:"
        node -e "
            try {
                const config = JSON.parse(require('fs').readFileSync('config/config.json', 'utf8'));
                console.log('      Admin User:', config.server?.admin?.username || 'Not set');
                console.log('      Server Port:', config.server?.port || 'Not set');
                console.log('      Useful Links:', Array.isArray(config.usefulLinks) ? config.usefulLinks.length : 0);
                console.log('      Connected Devices:', Array.isArray(config.connectedDevices) ? config.connectedDevices.length : 0);
                console.log('      Client Access:', config.client?.enabled ? 'Enabled' : 'Disabled');
                console.log('      Home Assistant:', config.homeAssistant?.enabled ? 'Enabled' : 'Disabled');
                console.log('      Cockpit:', config.cockpit?.enabled ? 'Enabled' : 'Disabled');
            } catch (err) {
                console.log('      ⚠️ Error reading config:', err.message);
            }
        " 2>/dev/null || echo "      (Node.js not available for detailed parsing)"
    fi
else
    echo "❌ config.json not found"
fi

# Client authentication file
if [ -f "config/.client_auth" ]; then
    AUTH_SIZE=$(du -h "config/.client_auth" | cut -f1)
    echo "🔒 .client_auth ($AUTH_SIZE) - Client password hash"
else
    echo "ℹ️  .client_auth not found (no client password set)"
fi

echo ""
echo "📦 Backup Status:"
echo "----------------"

if [ -d "backups" ]; then
    BACKUP_COUNT=$(ls -1 backups/config_backup_*.tar.gz 2>/dev/null | wc -l)
    if [ "$BACKUP_COUNT" -gt 0 ]; then
        echo "✅ $BACKUP_COUNT backup(s) available"
        
        # Show latest backup
        LATEST_BACKUP=$(ls -t backups/config_backup_*.tar.gz 2>/dev/null | head -1)
        if [ -n "$LATEST_BACKUP" ]; then
            BACKUP_SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
            BACKUP_DATE=$(basename "$LATEST_BACKUP" | sed 's/config_backup_\(.*\)\.tar\.gz/\1/' | sed 's/_/ /')
            echo "   📄 Latest: $(basename "$LATEST_BACKUP") ($BACKUP_SIZE)"
            echo "   📅 Created: $BACKUP_DATE"
        fi
    else
        echo "⚠️  No backups found"
        echo "   Create backup with: ./scripts/backup-config.sh"
    fi
else
    echo "⚠️  Backups directory not found"
    echo "   Create backup with: ./scripts/backup-config.sh"
fi

echo ""
echo "🐳 Container Configuration:"
echo "--------------------------"

# Check docker-compose
if [ -f "docker-compose.yml" ]; then
    echo "✅ docker-compose.yml found"
    
    if grep -q "./config:/app/config" docker-compose.yml; then
        echo "   ✅ Config directory mounted for persistence"
    else
        echo "   ⚠️  Config directory mount not found"
    fi
    
    if grep -q "./public:/app/public" docker-compose.yml; then
        echo "   ✅ Public directory mounted"
    else
        echo "   ℹ️  Public directory not mounted"
    fi
else
    echo "⚠️  docker-compose.yml not found"
fi

echo ""
echo "🔧 Available Tools:"
echo "------------------"
echo "✅ ./scripts/backup-config.sh - Create configuration backup"
echo "✅ ./scripts/restore-config.sh - Restore from backup"
echo "✅ ./scripts/update-container.sh - Safe container update"
echo "✅ ./scripts/validate-config.js - Validate configuration"
echo "✅ ./scripts/test-persistence.sh - Test persistence features"

echo ""
echo "💡 Next Steps:"
echo "-------------"
echo "   - Create regular backups: ./scripts/backup-config.sh"
echo "   - For container updates: ./scripts/update-container.sh"
echo "   - See PERSISTENCE.md for complete documentation"
echo ""

# Check if server is running
if curl -s http://localhost:3000/api/status >/dev/null 2>&1; then
    echo "🟢 Server Status: Running (http://localhost:3000)"
    echo "   Admin interface: http://localhost:3000/admin"
else
    echo "🔴 Server Status: Not running"
    echo "   Start with: npm start or docker-compose up -d"
fi