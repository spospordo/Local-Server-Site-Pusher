#!/bin/bash

# ARM64 Sharp Verification Script
# This script helps verify that sharp module is correctly installed for ARM64 architecture

set -e

echo "🔍 ARM64 Sharp Module Verification"
echo "===================================="
echo ""

# Detect architecture
ARCH=$(uname -m)
echo "📋 System Architecture: $ARCH"

if [[ "$ARCH" != "aarch64" && "$ARCH" != "armv8l" && "$ARCH" != "arm64" ]]; then
    echo "⚠️  Warning: This system is not ARM64 architecture"
    echo "   Expected: aarch64, armv8l, or arm64"
    echo "   Got: $ARCH"
    echo ""
    echo "   This script is designed for Raspberry Pi and other ARM64 devices."
    echo "   On non-ARM64 systems, sharp will install different binaries."
    exit 0
fi

echo "✅ Confirmed ARM64 architecture"
echo ""

# Check if running in Docker
if [ -f "/.dockerenv" ]; then
    echo "🐳 Running inside Docker container"
    
    # Check if sharp module exists
    if [ -d "/app/node_modules/sharp" ]; then
        echo "✅ Sharp module found at /app/node_modules/sharp"
        
        # Check for ARM64 binaries
        echo ""
        echo "🔍 Checking for ARM64 native binaries..."
        
        if [ -d "/app/node_modules/@img/sharp-linux-arm64v8" ] || \
           [ -d "/app/node_modules/@img/sharp-linuxmusl-arm64" ] || \
           ls /app/node_modules/@img/sharp-*arm64* 2>/dev/null | grep -q .; then
            echo "✅ ARM64 sharp binaries found!"
            ls -la /app/node_modules/@img/sharp-*arm64* 2>/dev/null || true
        else
            echo "❌ ARM64 sharp binaries NOT found"
            echo "   Available binaries:"
            ls -la /app/node_modules/@img/ 2>/dev/null || echo "   No @img binaries found"
            echo ""
            echo "⚠️  This indicates the sharp module was not rebuilt for ARM64"
            echo "   The container may fail to start with sharp runtime error"
            exit 1
        fi
        
        # Try to load sharp
        echo ""
        echo "🧪 Testing sharp module load..."
        if node -e "const sharp = require('sharp'); console.log('Sharp version:', sharp.versions); process.exit(0);" 2>/dev/null; then
            echo "✅ Sharp module loads successfully!"
            node -e "const sharp = require('sharp'); console.log('   Sharp versions:', JSON.stringify(sharp.versions, null, 2));"
        else
            echo "❌ Sharp module failed to load"
            echo "   Error details:"
            node -e "const sharp = require('sharp');" 2>&1 || true
            exit 1
        fi
    else
        echo "❌ Sharp module not found at /app/node_modules/sharp"
        echo "   This script should be run after npm install"
        exit 1
    fi
else
    echo "💻 Running on host system (not in Docker)"
    echo ""
    echo "To verify sharp in Docker container:"
    echo "  docker run --rm -it local-server-site-pusher sh -c 'bash /app/scripts/verify-arm64-sharp.sh'"
fi

echo ""
echo "🎉 ARM64 sharp verification completed successfully!"
echo ""
echo "Your container should work correctly on Raspberry Pi!"
