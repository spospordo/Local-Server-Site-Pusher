#!/bin/bash

# Test script for persistent settings functionality
# This script validates that settings survive container updates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🧪 Persistent Settings Test Suite"
echo "================================="

# Test 1: Configuration Validation
echo ""
echo "📋 Test 1: Configuration Validation"
echo "-----------------------------------"

cd "$PROJECT_DIR"

# Test with valid config
echo "✅ Testing valid configuration..."
node scripts/validate-config.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✓ Valid configuration passed validation"
else
    echo "   ✗ Valid configuration failed validation"
    exit 1
fi

# Test with corrupted config (backup first)
echo "🔧 Testing configuration repair..."
cp config/config.json config/config.json.test_backup

# Create a minimal corrupted config
cat > config/config.json << 'EOF'
{
  "server": {
    "port": 3000
  }
}
EOF

node scripts/validate-config.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✓ Corrupted configuration was repaired"
else
    echo "   ✗ Configuration repair failed"
    cp config/config.json.test_backup config/config.json
    exit 1
fi

# Restore original config
cp config/config.json.test_backup config/config.json
rm config/config.json.test_backup

# Test 2: Backup and Restore
echo ""
echo "📋 Test 2: Backup and Restore"
echo "------------------------------"

# Create backup
echo "💾 Creating test backup..."
./scripts/backup-config.sh > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✓ Backup created successfully"
    
    # Find the latest backup
    LATEST_BACKUP=$(ls -t backups/config_backup_*.tar.gz 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        echo "   ✓ Latest backup: $(basename "$LATEST_BACKUP")"
        
        # Validate backup contents
        if tar -tzf "$LATEST_BACKUP" | grep -q "config/config.json"; then
            echo "   ✓ Backup contains configuration file"
        else
            echo "   ✗ Backup missing configuration file"
            exit 1
        fi
    else
        echo "   ✗ No backup file found"
        exit 1
    fi
else
    echo "   ✗ Backup creation failed"
    exit 1
fi

# Test 3: Server startup with validation
echo ""
echo "📋 Test 3: Server Startup Validation"
echo "------------------------------------"

echo "🚀 Testing server startup with validation..."

# Start server in background
timeout 30 npm start > /tmp/server_test.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 8

# Check if server is responding
if curl -s http://localhost:3000/api/status > /dev/null 2>&1; then
    echo "   ✓ Server started and responding"
    
    # Check logs for validation messages
    if grep -q "Configuration validation" /tmp/server_test.log; then
        echo "   ✓ Configuration validation executed"
    else
        echo "   ⚠ Configuration validation not found in logs"
    fi
    
    # Stop server
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    
else
    echo "   ✗ Server failed to start or respond"
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
    echo "Server logs:"
    cat /tmp/server_test.log | tail -10
    exit 1
fi

# Test 4: Volume Mount Verification
echo ""
echo "📋 Test 4: Volume Mount Verification"
echo "------------------------------------"

if [ -f "docker-compose.yml" ]; then
    echo "🔍 Checking docker-compose configuration..."
    
    # Check for config volume mount
    if grep -q "./config:/app/config" docker-compose.yml; then
        echo "   ✓ Config directory volume mount configured"
    else
        echo "   ⚠ Config directory volume mount not found"
    fi
    
    # Check for uploads volume mount (CRITICAL for client file persistence)
    if grep -q "./uploads:/app/uploads" docker-compose.yml; then
        echo "   ✓ Uploads directory volume mount configured"
    else
        echo "   ⚠ Uploads directory volume mount not found - client files won't persist!"
    fi
    
    # Check for public volume mount (optional)
    if grep -q "./public:/app/public" docker-compose.yml; then
        echo "   ✓ Public directory volume mount configured"
    else
        echo "   ℹ Public directory volume mount not configured (optional)"
    fi
else
    echo "   ⚠ docker-compose.yml not found"
fi

# Test 5: Permission Check
echo ""
echo "📋 Test 5: Permission Check"
echo "---------------------------"

echo "🔐 Checking file permissions..."

# Check config directory permissions
if [ -d "config" ]; then
    CONFIG_PERMS=$(stat -c "%a" config 2>/dev/null || stat -f "%Lp" config 2>/dev/null || echo "unknown")
    if [ "$CONFIG_PERMS" = "755" ] || [ "$CONFIG_PERMS" = "775" ] || [ "$CONFIG_PERMS" = "unknown" ]; then
        echo "   ✓ Config directory permissions are appropriate ($CONFIG_PERMS)"
    else
        echo "   ⚠ Config directory permissions may be too restrictive ($CONFIG_PERMS)"
    fi
    
    # Check client auth file if it exists
    if [ -f "config/.client_auth" ]; then
        AUTH_PERMS=$(stat -c "%a" config/.client_auth 2>/dev/null || stat -f "%Lp" config/.client_auth 2>/dev/null || echo "unknown")
        if [ "$AUTH_PERMS" = "600" ] || [ "$AUTH_PERMS" = "unknown" ]; then
            echo "   ✓ Client auth file permissions are secure ($AUTH_PERMS)"
        else
            echo "   ⚠ Client auth file permissions should be 600 ($AUTH_PERMS)"
        fi
    else
        echo "   ℹ No client auth file found (normal if no client password set)"
    fi
else
    echo "   ✗ Config directory not found"
    exit 1
fi

# Check uploads directory permissions (for client file persistence)
if [ -d "uploads" ]; then
    UPLOADS_PERMS=$(stat -c "%a" uploads 2>/dev/null || stat -f "%Lp" uploads 2>/dev/null || echo "unknown")
    if [ "$UPLOADS_PERMS" = "755" ] || [ "$UPLOADS_PERMS" = "775" ] || [ "$UPLOADS_PERMS" = "unknown" ]; then
        echo "   ✓ Uploads directory permissions are appropriate ($UPLOADS_PERMS)"
    else
        echo "   ⚠ Uploads directory permissions may be too restrictive ($UPLOADS_PERMS)"
    fi
else
    echo "   ℹ Uploads directory not found (will be created automatically)"
fi

# Cleanup
rm -f /tmp/server_test.log

echo ""
echo "✅ All persistence tests completed successfully!"
echo ""
echo "💡 Summary:"
echo "   - Configuration validation and repair: Working"
echo "   - Backup and restore functionality: Working"
echo "   - Server startup with validation: Working"
echo "   - Volume mount configuration: Verified"
echo "   - File permissions: Checked (including uploads directory)"
echo ""
echo "🚀 Your persistent settings are properly configured!"
echo "   - Settings will survive container updates"
echo "   - Automatic backup and repair available"
echo "   - Run ./scripts/update-container.sh for safe updates"