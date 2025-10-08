#!/bin/bash

# Validate v1.1.3 ARM64 Fix
# This script checks if the Docker image has the correct libvips installation

set -e

echo "🔍 Validating Local-Server-Site-Pusher v1.1.3 ARM64 Fix"
echo "========================================================"
echo ""

# Check if running on ARM64
ARCH=$(uname -m)
echo "📋 System Architecture: $ARCH"

if [[ "$ARCH" == "aarch64" || "$ARCH" == "armv8l" || "$ARCH" == "arm64" ]]; then
    echo "✅ ARM64 architecture detected"
else
    echo "ℹ️  Not ARM64 - this fix is specifically for ARM64/Raspberry Pi"
    echo "   Current architecture: $ARCH"
fi
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    exit 1
fi

echo "✅ Docker is installed: $(docker --version)"
echo ""

# Check if image exists locally
if docker images | grep -q "local-server-site-pusher"; then
    echo "📦 Found local-server-site-pusher image(s):"
    docker images | grep "local-server-site-pusher" || true
    echo ""
    
    # Test if libvips is installed in the image
    echo "🔍 Checking for libvips in Docker image..."
    
    # Create a temporary container to check
    CONTAINER_ID=$(docker run -d --rm local-server-site-pusher:latest sleep 30)
    
    if docker exec $CONTAINER_ID dpkg -l | grep -q libvips; then
        echo "✅ libvips is installed in the image!"
        docker exec $CONTAINER_ID dpkg -l | grep libvips
    else
        echo "❌ libvips is NOT installed in the image"
        echo "   This image may not work on ARM64"
    fi
    
    # Check for sharp
    echo ""
    echo "🔍 Checking for sharp module..."
    if docker exec $CONTAINER_ID test -d "/app/node_modules/sharp"; then
        echo "✅ sharp module is present"
        
        # Try to load sharp
        echo ""
        echo "🧪 Testing sharp module loading..."
        if docker exec $CONTAINER_ID node -e "const sharp = require('sharp'); console.log('Sharp version:', sharp.versions); process.exit(0);" 2>/dev/null; then
            echo "✅ sharp module loads successfully!"
        else
            echo "❌ sharp module failed to load"
            docker exec $CONTAINER_ID node -e "const sharp = require('sharp');" 2>&1 || true
        fi
    else
        echo "⚠️  sharp module not found (image may not be fully built)"
    fi
    
    # Stop the test container
    docker stop $CONTAINER_ID > /dev/null 2>&1 || true
    
else
    echo "📦 No local-server-site-pusher image found locally"
    echo "   Build the image first with: docker build -t local-server-site-pusher ."
fi

echo ""
echo "🏁 Validation complete!"
echo ""
echo "To deploy on Raspberry Pi via Portainer:"
echo "  1. Go to Stacks → Add stack in Portainer"
echo "  2. Choose 'Repository' build method"
echo "  3. Repository URL: https://github.com/spospordo/Local-Server-Site-Pusher"
echo "  4. Compose path: docker-compose.portainer.yml"
echo "  5. Deploy the stack"
echo ""
echo "See PORTAINER_DEPLOYMENT_GUIDE.md for complete instructions."
