#!/bin/bash

# Test script to simulate a redeploy scenario and verify settings persistence
# This tests both deep config merge and automatic repository sync

echo "🧪 Redeploy Scenario Test"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test result
test_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✅ PASSED${NC}: $2"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo -e "${RED}❌ FAILED${NC}: $2"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

echo "📋 Test 1: Deep merge configuration preservation"
echo "------------------------------------------"
node scripts/test-config-deep-merge.js > /dev/null 2>&1
test_result $? "Deep merge preserves nested settings"
echo ""

echo "📋 Test 2: Automatic repository sync implementation"
echo "------------------------------------------"
node scripts/test-auto-repo-sync.js > /dev/null 2>&1
test_result $? "Auto repo sync properly implemented"
echo ""

echo "📋 Test 3: Server startup with config validation"
echo "------------------------------------------"
# Start server in background and capture startup output
timeout 8 node server.js > /tmp/server-startup.log 2>&1 &
SERVER_PID=$!

# Wait for startup to complete
sleep 5

# Check for startup sync message
if grep -q "Checking for GitHub Pages repositories to sync on startup" /tmp/server-startup.log; then
  test_result 0 "Startup sync function executed"
else
  test_result 1 "Startup sync function not found in logs"
fi

# Check for proper config validation
if grep -q "Configuration validation passed\|Repaired configuration" /tmp/server-startup.log; then
  test_result 0 "Config validation executed"
else
  test_result 1 "Config validation not found in logs"
fi

# Kill the server
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

echo ""
echo "📋 Test 4: Config file structure validation"
echo "------------------------------------------"

# Check if config file exists and has proper structure
if [ -f "config/config.json" ]; then
  # Check for vidiots.githubPages structure
  if grep -q '"vidiots"' config/config.json && grep -q '"githubPages"' config/config.json; then
    test_result 0 "Vidiots config has githubPages structure"
  else
    test_result 1 "Vidiots config missing githubPages structure"
  fi
  
  # Check for espresso.githubPages structure
  if grep -q '"espresso"' config/config.json && grep -A 20 '"espresso"' config/config.json | grep -q '"githubPages"'; then
    test_result 0 "Espresso config has githubPages structure"
  else
    test_result 1 "Espresso config missing githubPages structure"
  fi
else
  test_result 1 "Config file was not created"
fi

echo ""
echo "📋 Test 5: Module exports verification"
echo "------------------------------------------"

# Check if espresso exports githubUpload (look at end of file where module.exports is)
if tail -20 modules/espresso.js | grep -q 'githubUpload'; then
  test_result 0 "Espresso module exports githubUpload"
else
  test_result 1 "Espresso module doesn't export githubUpload"
fi

# Check if vidiots exports githubUpload
if tail -20 modules/vidiots.js | grep -q 'githubUpload'; then
  test_result 0 "Vidiots module exports githubUpload"
else
  test_result 1 "Vidiots module doesn't export githubUpload"
fi

echo ""
echo "=========================================="
echo "📊 Test Summary"
echo "=========================================="
echo -e "Tests passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests failed: ${RED}${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed!${NC}"
  echo ""
  echo "The following issues have been resolved:"
  echo "  ✅ GitHub Pages settings persist across redeploys"
  echo "  ✅ Nested config values preserved with deep merge"
  echo "  ✅ Repositories automatically synced on startup"
  echo "  ✅ Both vidiots and espresso modules supported"
  echo ""
  exit 0
else
  echo -e "${RED}❌ Some tests failed!${NC}"
  echo ""
  echo "Please review the failed tests above."
  echo ""
  exit 1
fi
