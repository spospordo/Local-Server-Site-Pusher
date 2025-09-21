#!/bin/bash

# Container Update Utility for Local-Server-Site-Pusher
# This script helps safely update the container while preserving persistent settings

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🔄 Local-Server-Site-Pusher Container Update Utility"
echo "=================================================="

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        echo "❌ Error: Docker is not running or not accessible"
        exit 1
    fi
}

# Function to validate config directory
validate_config() {
    if [ ! -d "$PROJECT_DIR/config" ]; then
        echo "⚠️  Warning: Config directory not found"
        echo "   This is normal for first-time setup"
        return 0
    fi
    
    # Validate JSON if config.json exists
    if [ -f "$PROJECT_DIR/config/config.json" ]; then
        if node -e "JSON.parse(require('fs').readFileSync('$PROJECT_DIR/config/config.json', 'utf8'))" 2>/dev/null; then
            echo "✅ Configuration file is valid"
        else
            echo "⚠️  Warning: Configuration file has JSON syntax errors"
            echo "   The application will use defaults if config is invalid"
        fi
    fi
}

echo "🔍 Pre-update checks..."
check_docker
validate_config

# Create automatic backup
echo ""
echo "💾 Creating automatic backup..."
if [ -f "$SCRIPT_DIR/backup-config.sh" ]; then
    bash "$SCRIPT_DIR/backup-config.sh"
else
    echo "⚠️  Warning: backup-config.sh not found, skipping automatic backup"
fi

echo ""
echo "📥 Starting container update process..."

# Change to project directory
cd "$PROJECT_DIR"

# Stop current container
echo "🛑 Stopping current container..."
if [ -f "docker-compose.yml" ]; then
    docker-compose down
else
    docker stop local-server 2>/dev/null || true
    docker rm local-server 2>/dev/null || true
fi

# Pull latest changes (if this is a git repository)
if [ -d ".git" ]; then
    echo "📡 Pulling latest changes from git..."
    git pull origin main 2>/dev/null || git pull 2>/dev/null || echo "⚠️  Could not pull git changes"
fi

# Rebuild container
echo "🔨 Rebuilding container..."
if [ -f "docker-compose.yml" ]; then
    docker-compose build --no-cache
else
    docker build -t local-server-site-pusher --no-cache .
fi

# Start updated container
echo "🚀 Starting updated container..."
if [ -f "docker-compose.yml" ]; then
    docker-compose up -d
else
    docker run -d -p 3000:3000 \
        -v "$PROJECT_DIR/public:/app/public" \
        -v "$PROJECT_DIR/config:/app/config" \
        --name local-server \
        --restart unless-stopped \
        local-server-site-pusher
fi

# Wait for container to start
echo "⏳ Waiting for container to start..."
sleep 10

# Health check
echo "🏥 Performing health check..."
for i in {1..6}; do
    if curl -s http://localhost:3000/api/status >/dev/null 2>&1; then
        echo "✅ Container is healthy and responding"
        
        # Show status
        echo ""
        echo "📊 Container status:"
        curl -s http://localhost:3000/api/status | node -e "
            const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
            console.log('   Server version:', data.version);
            console.log('   Uptime:', Math.round(data.server.uptime), 'seconds');
            console.log('   Port:', data.server.port);
            console.log('   Status:', data.server.status);
        " 2>/dev/null || echo "   Status check completed"
        
        break
    else
        echo "⏳ Waiting for container... (attempt $i/6)"
        sleep 10
    fi
    
    if [ $i -eq 6 ]; then
        echo "❌ Warning: Container may not be responding properly"
        echo "   Check logs with: docker-compose logs"
    fi
done

echo ""
echo "✅ Container update completed!"
echo ""
echo "💡 Next steps:"
echo "   - Check the application at: http://localhost:3000"
echo "   - Check admin interface at: http://localhost:3000/admin"
echo "   - View logs with: docker-compose logs -f"
echo "   - If issues occur, restore from backup with: ./scripts/restore-config.sh"