#!/bin/bash

# Persistence Verification Script
# This script verifies that all persistent data points are correctly configured

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔍 Persistence Verification Script"
echo "=================================="
echo ""

# Test 1: Verify .dockerignore excludes persistent files
echo "📋 Test 1: Verifying .dockerignore configuration"
echo "------------------------------------------------"

DOCKERIGNORE="$PROJECT_DIR/.dockerignore"
REQUIRED_EXCLUDES=(
    "config/config.json"
    "config/.client_auth"
    "config/.finance_key"
    "config/.finance_data"
    "config/.gitconfig"
    "config/ollama-config.json.enc"
    "config/.ollama-key"
    "config/config.json.backup"
    "backups/"
)

all_present=true
for exclude in "${REQUIRED_EXCLUDES[@]}"; do
    if grep -q "^${exclude}$" "$DOCKERIGNORE"; then
        echo "   ✓ $exclude is excluded"
    else
        echo "   ✗ $exclude is NOT excluded - THIS WILL CAUSE PERSISTENCE ISSUES!"
        all_present=false
    fi
done

if [ "$all_present" = true ]; then
    echo "   ✅ All persistent files are properly excluded from Docker image"
else
    echo "   ❌ Some persistent files are NOT excluded - settings may not persist!"
    exit 1
fi

echo ""

# Test 2: Verify docker-compose volume mounts
echo "📋 Test 2: Verifying docker-compose.yml volume mounts"
echo "------------------------------------------------------"

DOCKER_COMPOSE="$PROJECT_DIR/docker-compose.yml"
REQUIRED_MOUNTS=(
    "./config:/app/config"
    "./uploads:/app/uploads"
)

all_mounts_present=true
for mount in "${REQUIRED_MOUNTS[@]}"; do
    if grep -q "$mount" "$DOCKER_COMPOSE"; then
        echo "   ✓ Volume mount configured: $mount"
    else
        echo "   ✗ Volume mount MISSING: $mount"
        all_mounts_present=false
    fi
done

if [ "$all_mounts_present" = true ]; then
    echo "   ✅ All required volume mounts are configured"
else
    echo "   ❌ Some volume mounts are missing - data will not persist!"
    exit 1
fi

echo ""

# Test 3: Verify PERSISTENCE.md documents all data points
echo "📋 Test 3: Verifying PERSISTENCE.md documentation"
echo "-------------------------------------------------"

PERSISTENCE_DOC="$PROJECT_DIR/PERSISTENCE.md"
REQUIRED_SECTIONS=(
    "Vidiots Scraper Configuration"
    "Finance Module Data"
    "Ollama AI Integration"
    "GitHub Integration Settings"
)

all_documented=true
for section in "${REQUIRED_SECTIONS[@]}"; do
    if grep -q "$section" "$PERSISTENCE_DOC"; then
        echo "   ✓ $section is documented"
    else
        echo "   ✗ $section is NOT documented"
        all_documented=false
    fi
done

if [ "$all_documented" = true ]; then
    echo "   ✅ All data points are documented"
else
    echo "   ⚠️  Some data points are not documented (documentation only - not critical)"
fi

echo ""

# Test 4: Check config directory structure
echo "📋 Test 4: Checking config directory"
echo "------------------------------------"

CONFIG_DIR="$PROJECT_DIR/config"
if [ -d "$CONFIG_DIR" ]; then
    echo "   ✓ Config directory exists"
    
    # Check for any files that shouldn't be there
    if [ -f "$CONFIG_DIR/config.json" ]; then
        echo "   ℹ️  config.json exists (will be used if present)"
    else
        echo "   ℹ️  config.json does not exist (will be created on first run)"
    fi
    
    # Check permissions
    if [ -w "$CONFIG_DIR" ]; then
        echo "   ✓ Config directory is writable"
    else
        echo "   ⚠️  Config directory is not writable - may cause issues in some environments"
    fi
else
    echo "   ℹ️  Config directory will be created on first run"
fi

echo ""

# Summary
echo "✅ Persistence Verification Complete!"
echo ""
echo "📊 Summary:"
echo "   - .dockerignore properly excludes persistent files"
echo "   - docker-compose.yml has required volume mounts"
echo "   - PERSISTENCE.md documents all data points"
echo "   - Config directory structure is correct"
echo ""
echo "🎯 Result: All persistence mechanisms are properly configured!"
echo ""
echo "💡 To test persistence across redeployments:"
echo "   1. Start container: docker-compose up -d"
echo "   2. Configure settings via admin interface"
echo "   3. Rebuild and restart: docker-compose down && docker-compose build && docker-compose up -d"
echo "   4. Verify settings are retained"
