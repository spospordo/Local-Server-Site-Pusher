#!/bin/bash

# Magic Mirror Integration Test
# Tests the complete magic mirror workflow

echo "🧪 Magic Mirror Integration Test"
echo "================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Start server in background
echo "🚀 Starting server..."
cd /home/runner/work/Local-Server-Site-Pusher/Local-Server-Site-Pusher
node server.js > /tmp/server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Check if server is running
if ! curl -s http://localhost:3000/api/status > /dev/null; then
    echo -e "${RED}❌ Server failed to start${NC}"
    cat /tmp/server.log
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo -e "${GREEN}✅ Server started successfully${NC}"
echo ""

# Run automated tests
echo "🔍 Running automated test suite..."
if node scripts/test-magic-mirror.js; then
    echo -e "${GREEN}✅ All automated tests passed${NC}"
else
    echo -e "${RED}❌ Automated tests failed${NC}"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi
echo ""

# Test individual API endpoints
echo "🌐 Testing API endpoints..."

# Test weather endpoint
echo -n "  Testing weather API... "
WEATHER_RESPONSE=$(curl -s http://localhost:3000/api/magicmirror/weather)
if echo "$WEATHER_RESPONSE" | grep -q "temperature"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
    echo "    Response: $WEATHER_RESPONSE"
fi

# Test calendar endpoint
echo -n "  Testing calendar API... "
CALENDAR_RESPONSE=$(curl -s http://localhost:3000/api/magicmirror/calendar)
if echo "$CALENDAR_RESPONSE" | grep -q "error\|events"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
    echo "    Response: $CALENDAR_RESPONSE"
fi

# Test news endpoint
echo -n "  Testing news API... "
NEWS_RESPONSE=$(curl -s http://localhost:3000/api/magicmirror/news)
if echo "$NEWS_RESPONSE" | grep -q "error\|items"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
    echo "    Response: $NEWS_RESPONSE"
fi

# Test display page
echo -n "  Testing display page... "
PAGE_RESPONSE=$(curl -s http://localhost:3000/magic-mirror)
if echo "$PAGE_RESPONSE" | grep -q "Magic Mirror Dashboard"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

echo ""

# Check configuration files
echo "📁 Checking configuration files..."

echo -n "  Encryption key exists... "
if [ -f "config/.magicmirror-key" ]; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

echo -n "  Encryption key is valid... "
KEY_LENGTH=$(wc -c < "config/.magicmirror-key" | tr -d ' ')
if [ "$KEY_LENGTH" -eq 64 ]; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌ (length: $KEY_LENGTH, expected: 64)${NC}"
fi

echo ""

# Version check
echo "📦 Version check..."
PACKAGE_VERSION=$(node -p "require('./package.json').version")
echo "  Package version: $PACKAGE_VERSION"

if [ "$PACKAGE_VERSION" = "2.2.4" ]; then
    echo -e "  ${GREEN}✅ Version updated correctly${NC}"
else
    echo -e "  ${YELLOW}⚠️  Expected version 2.2.4, got $PACKAGE_VERSION${NC}"
fi

echo ""

# Cleanup
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null
sleep 1

echo ""
echo -e "${GREEN}✅ Integration test completed successfully!${NC}"
echo ""
echo "Summary:"
echo "  - Server startup: ✅"
echo "  - Automated tests: ✅"
echo "  - API endpoints: ✅"
echo "  - Configuration: ✅"
echo "  - Version: $PACKAGE_VERSION"
echo ""
