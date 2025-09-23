#!/bin/bash

# Test script to verify uploads directory persistence
# This script tests that uploaded files persist across container restarts

set -e

echo "🧪 Testing Client File Uploads Persistence"
echo "=========================================="

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🧹 Cleaning up test resources..."
    docker compose down 2>/dev/null || true
    docker compose rm -f 2>/dev/null || true
    # Keep test uploads directory to show they persist
    echo "✅ Test uploads directory preserved to demonstrate persistence"
    echo "   Location: ./uploads/"
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Error: Docker is not installed or not in PATH"
    exit 1
fi

# Check if Docker Compose is available
if ! docker compose version >/dev/null 2>&1; then
    echo "❌ Error: Docker Compose is not available"
    exit 1
fi

echo "✅ Docker and Docker Compose are available"

# Ensure clean state
echo ""
echo "🧹 Ensuring clean test state..."
docker compose down 2>/dev/null || true

# Create test directories
echo ""
echo "📁 Setting up test directories..."
mkdir -p uploads config public
echo "   ✓ Created uploads directory"

# Create a test file to simulate client upload
echo "This is a test file uploaded by a client device" > uploads/test-client-file.txt
echo "   ✓ Created test client file: uploads/test-client-file.txt" 

# Create device directory and metadata to simulate real usage
mkdir -p uploads/test-device-123
echo '{"files": {"test-client-file.txt": {"originalName": "test-client-file.txt", "size": 46, "mimeType": "text/plain", "uploadDate": "2024-01-01T00:00:00.000Z", "sharing": "none"}}}' > uploads/test-device-123/.metadata.json
echo "   ✓ Created simulated device directory and metadata"

# Test 1: Build and start container
echo ""
echo "🔨 Test 1: Building and starting container..."
docker compose build >/dev/null 2>&1
echo "   ✓ Container built successfully"

docker compose up -d >/dev/null 2>&1
echo "   ✓ Container started"

# Wait for container to be ready
echo "   ⏳ Waiting for container to be ready..."
sleep 5

# Check if container is running
if ! docker compose ps | grep -q "running"; then
    echo "   ❌ Container failed to start"
    docker compose logs
    exit 1
fi
echo "   ✅ Container is running"

# Test 2: Verify files are accessible in container
echo ""
echo "📋 Test 2: Verifying files are accessible in container..."

# Check if our test file exists in the container
if docker compose exec -T local-server ls /app/uploads/test-client-file.txt >/dev/null 2>&1; then
    echo "   ✓ Test file accessible in container"
else
    echo "   ❌ Test file not accessible in container"
    exit 1
fi

# Check if device directory exists
if docker compose exec -T local-server ls -la /app/uploads/test-device-123/ >/dev/null 2>&1; then
    echo "   ✓ Device directory accessible in container"
else
    echo "   ❌ Device directory not accessible in container" 
    exit 1
fi

# Test 3: Stop and restart container (simulate redeployment)
echo ""
echo "🔄 Test 3: Testing persistence across container restart..."

echo "   ⏹ Stopping container..."
docker compose down >/dev/null 2>&1

echo "   🚀 Restarting container..."
docker compose up -d >/dev/null 2>&1

# Wait for container to be ready again
echo "   ⏳ Waiting for container to restart..."
sleep 5

# Test 4: Verify files still exist after restart
echo ""
echo "📋 Test 4: Verifying files persist after restart..."

# Check if our test file still exists after restart
if docker compose exec -T local-server ls /app/uploads/test-client-file.txt >/dev/null 2>&1; then
    echo "   ✅ Test file persisted after container restart"
else
    echo "   ❌ Test file lost after container restart - PERSISTENCE FAILED"
    exit 1
fi

# Check if device directory still exists 
if docker compose exec -T local-server ls -la /app/uploads/test-device-123/ >/dev/null 2>&1; then
    echo "   ✅ Device directory persisted after container restart"
else
    echo "   ❌ Device directory lost after container restart - PERSISTENCE FAILED"
    exit 1
fi

# Check if metadata still exists
if docker compose exec -T local-server cat /app/uploads/test-device-123/.metadata.json >/dev/null 2>&1; then
    echo "   ✅ Client file metadata persisted after container restart"
else
    echo "   ❌ Client file metadata lost after container restart - PERSISTENCE FAILED"
    exit 1
fi

# Summary
echo ""
echo "🎉 Uploads Persistence Test PASSED!"
echo "=================================="
echo "✅ Container builds and starts correctly"
echo "✅ Volume mount includes uploads directory"  
echo "✅ Client files are accessible in container"
echo "✅ Client files persist across container restarts"
echo "✅ Client metadata persists across container restarts"
echo ""
echo "🚀 Client file uploads will now persist across deployments!"
echo ""
echo "💡 Files created during this test:"
echo "   - uploads/test-client-file.txt"
echo "   - uploads/test-device-123/.metadata.json"
echo "   These demonstrate that client uploads are now persistent."