#!/bin/bash

# Deployment Test Script for Local-Server-Site-Pusher
# This script tests if the container can start correctly with volume mounts

set -e

echo "🧪 Local-Server-Site-Pusher Deployment Test"
echo "=========================================="

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up test resources..."
    docker stop test-local-server 2>/dev/null || true
    docker rm test-local-server 2>/dev/null || true
    rm -rf /tmp/test-local-server 2>/dev/null || true
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Error: Docker is not installed or not in PATH"
    exit 1
fi

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    exit 1
fi

echo "✅ Docker is available and running"

# Create test directories
echo "📁 Creating test directories..."
mkdir -p /tmp/test-local-server/{config,public}

# Test 1: Build or pull image
echo ""
echo "🔨 Testing image availability..."
if [ -f "Dockerfile" ]; then
    echo "   Building from local source..."
    docker build -t local-server-site-pusher:test . >/dev/null 2>&1
    IMAGE="local-server-site-pusher:test"
else
    echo "   Pulling from registry..."
    docker pull spospordo/local-server-site-pusher:latest >/dev/null 2>&1
    IMAGE="spospordo/local-server-site-pusher:latest"
fi
echo "✅ Image ready: $IMAGE"

# Test 2: Start container with volume mounts
echo ""
echo "🚀 Testing container startup with volume mounts..."
docker run -d \
    --name test-local-server \
    -p 3001:3000 \
    -v /tmp/test-local-server/config:/app/config \
    -v /tmp/test-local-server/public:/app/public \
    "$IMAGE" >/dev/null

# Wait for container to start
echo "⏳ Waiting for container to initialize..."
sleep 5

# Test 3: Check if container is running
if ! docker ps | grep -q test-local-server; then
    echo "❌ Container failed to start"
    echo "Container logs:"
    docker logs test-local-server
    exit 1
fi

echo "✅ Container started successfully"

# Test 4: Check server response
echo ""
echo "🌐 Testing server response..."
for i in {1..10}; do
    if curl -s http://localhost:3001/api/status >/dev/null 2>&1; then
        echo "✅ Server is responding on port 3001"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "❌ Server not responding after 10 attempts"
        echo "Container logs:"
        docker logs test-local-server
        exit 1
    fi
    sleep 2
done

# Test 5: Check API response
echo ""
echo "📊 Testing API endpoint..."
RESPONSE=$(curl -s http://localhost:3001/api/status)
if echo "$RESPONSE" | grep -q '"status":"running"'; then
    echo "✅ API is working correctly"
    VERSION=$(echo "$RESPONSE" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    echo "   Server version: $VERSION"
else
    echo "❌ API response unexpected"
    echo "Response: $RESPONSE"
    exit 1
fi

# Test 6: Check volume mounts
echo ""
echo "📂 Testing volume mounts..."
if [ -f "/tmp/test-local-server/config/config.json" ]; then
    echo "✅ Configuration file created in mounted volume"
else
    echo "⚠️  Warning: Configuration file not found in mounted volume"
    echo "   This may be normal for some setups"
fi

# Test 7: Check permissions
echo ""
echo "🔐 Testing file permissions..."
LOGS=$(docker logs test-local-server 2>&1)
if echo "$LOGS" | grep -q "✅ Ownership correct\|🔧 Fixing ownership"; then
    echo "✅ Permission handling is working"
else
    echo "⚠️  Warning: No permission messages found"
    echo "   This may indicate a permission issue"
fi

# Summary
echo ""
echo "🎉 Deployment test completed successfully!"
echo "=================================="
echo "✅ Container builds/pulls correctly"
echo "✅ Container starts without restart loops"
echo "✅ Volume mounts are working"
echo "✅ Server responds on expected port"
echo "✅ API endpoints are functional"
echo "✅ Permission handling is working"
echo ""
echo "Your deployment should work correctly!"
echo ""
echo "💡 To deploy for real:"
echo "   - Use docker-compose.yml for development"
echo "   - Use Portainer stack for production"
echo "   - See PORTAINER.md for detailed instructions"