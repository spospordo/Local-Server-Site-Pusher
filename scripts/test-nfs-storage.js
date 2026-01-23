#!/usr/bin/env node

/**
 * Test script for NFS Storage module
 * Tests basic functionality including path validation, health checks, and management
 */

const NFSStorageManager = require('../modules/nfs-storage');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logSuccess(msg) {
  log(`✅ ${msg}`, 'green');
}

function logError(msg) {
  log(`❌ ${msg}`, 'red');
}

function logInfo(msg) {
  log(`ℹ️  ${msg}`, 'blue');
}

function logWarning(msg) {
  log(`⚠️  ${msg}`, 'yellow');
}

// Test results tracker
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  testsRun++;
  if (condition) {
    logSuccess(message);
    testsPassed++;
    return true;
  } else {
    logError(message);
    testsFailed++;
    return false;
  }
}

async function runTests() {
  log('\n' + '='.repeat(80), 'bright');
  log('NFS Storage Module Test Suite', 'bright');
  log('='.repeat(80) + '\n', 'bright');

  // Create temporary test directories
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfs-storage-test-'));
  const testPath1 = path.join(tmpDir, 'storage1');
  const testPath2 = path.join(tmpDir, 'storage2');
  const testPath3 = path.join(tmpDir, 'storage3');

  fs.mkdirSync(testPath1, { recursive: true });
  fs.mkdirSync(testPath2, { recursive: true });
  // Don't create testPath3 to test non-existent path

  logInfo(`Created test directories in: ${tmpDir}`);

  try {
    // Test 1: Module Initialization
    log('\n📋 Test 1: Module Initialization', 'bright');
    const config = {
      enabled: true,
      storagePaths: [
        {
          id: 'test-path-1',
          name: 'Test Storage 1',
          path: testPath1,
          type: 'local',
          enabled: true,
          purpose: 'backup'
        },
        {
          id: 'test-path-2',
          name: 'Test Storage 2',
          path: testPath2,
          type: 'nfs',
          enabled: true,
          purpose: 'media'
        }
      ],
      healthCheckInterval: 60000,
      autoFailover: true,
      fallbackToLocal: true
    };

    const storage = new NFSStorageManager(config);
    assert(storage !== null, 'NFSStorageManager instance created');
    assert(storage.storagePaths.length === 2, 'Storage paths loaded correctly');

    // Test 2: Initialization
    log('\n📋 Test 2: Initialization', 'bright');
    await storage.initialize();
    assert(storage.pathStatus.size === 2, 'Path status map initialized');

    // Test 3: Health Checks
    log('\n📋 Test 3: Health Checks', 'bright');
    const results = await storage.checkAllPaths();
    assert(Object.keys(results).length === 2, 'Health checks run for all paths');
    
    const status1 = storage.getPathStatus('test-path-1');
    assert(status1 !== null, 'Status retrieved for test-path-1');
    assert(status1.status === 'healthy', 'test-path-1 is healthy');
    assert(status1.accessible === true, 'test-path-1 is accessible');
    assert(status1.readable === true, 'test-path-1 is readable');
    assert(status1.writable === true, 'test-path-1 is writable');

    const status2 = storage.getPathStatus('test-path-2');
    assert(status2 !== null, 'Status retrieved for test-path-2');
    assert(status2.status === 'healthy', 'test-path-2 is healthy');

    // Test 4: Path Validation
    log('\n📋 Test 4: Path Validation', 'bright');
    const validPath = {
      id: 'test-valid',
      name: 'Valid Path',
      path: testPath3,
      type: 'nfs',
      enabled: true,
      purpose: 'general'
    };
    const validation = storage.validatePathConfig(validPath);
    assert(validation.valid === true, 'Valid path configuration passes validation');

    const invalidPath1 = {
      // Missing required fields
      path: testPath1
    };
    const validation1 = storage.validatePathConfig(invalidPath1);
    assert(validation1.valid === false, 'Invalid path (missing fields) fails validation');
    assert(validation1.errors.length > 0, 'Validation errors reported for invalid path');

    const invalidPath2 = {
      id: 'test-invalid',
      name: 'Invalid Path',
      path: 'relative/path',  // Relative path
      type: 'nfs'
    };
    const validation2 = storage.validatePathConfig(invalidPath2);
    assert(validation2.valid === false, 'Relative path fails validation');

    // Test 5: Add Storage Path
    log('\n📋 Test 5: Add Storage Path', 'bright');
    const newPath = {
      id: 'test-path-3',
      name: 'Test Storage 3',
      path: testPath3,
      type: 'local',
      enabled: true,
      purpose: 'uploads'
    };
    
    // Create the directory so it exists
    fs.mkdirSync(testPath3, { recursive: true });
    
    const addResult = await storage.addStoragePath(newPath);
    assert(addResult.success === true, 'Storage path added successfully');
    assert(storage.storagePaths.length === 3, 'Storage paths count increased');
    
    const addedStatus = storage.getPathStatus('test-path-3');
    assert(addedStatus !== null, 'Status available for newly added path');

    // Test 6: Duplicate ID Prevention
    log('\n📋 Test 6: Duplicate ID Prevention', 'bright');
    const duplicatePath = {
      id: 'test-path-1',  // Duplicate ID
      name: 'Duplicate',
      path: testPath1,
      type: 'local'
    };
    const duplicateResult = await storage.addStoragePath(duplicatePath);
    assert(duplicateResult.success === false, 'Duplicate path ID prevented');
    assert(duplicateResult.errors && duplicateResult.errors.length > 0, 'Error reported for duplicate ID');

    // Test 7: Update Storage Path
    log('\n📋 Test 7: Update Storage Path', 'bright');
    const updateResult = await storage.updateStoragePath('test-path-1', { enabled: false });
    assert(updateResult.success === true, 'Storage path updated successfully');
    const updatedPath = storage.storagePaths.find(p => p.id === 'test-path-1');
    assert(updatedPath.enabled === false, 'Path enabled status updated');

    // Test 8: Get Best Path
    log('\n📋 Test 8: Get Best Path', 'bright');
    const bestPath = storage.getBestPath('media');
    assert(bestPath !== null, 'Best path found for purpose');
    assert(bestPath.purpose === 'media', 'Best path has correct purpose');
    assert(bestPath.id === 'test-path-2', 'Correct path selected for media purpose');

    // Test 9: Get All Paths With Status
    log('\n📋 Test 9: Get All Paths With Status', 'bright');
    const allPaths = storage.getAllPathsWithStatus();
    assert(allPaths.length === 3, 'All paths returned with status');
    assert(allPaths[0].status !== undefined, 'Path includes status information');

    // Test 10: Storage Stats
    log('\n📋 Test 10: Storage Stats', 'bright');
    // Create some test files
    fs.writeFileSync(path.join(testPath1, 'test1.txt'), 'test content 1');
    fs.writeFileSync(path.join(testPath1, 'test2.txt'), 'test content 2');
    
    const stats = storage.getStorageStats('test-path-1');
    assert(stats !== null, 'Storage stats retrieved');
    assert(stats.fileCount === 2, 'File count correct');
    assert(stats.totalSize > 0, 'Total size calculated');

    // Test 11: Remove Storage Path
    log('\n📋 Test 11: Remove Storage Path', 'bright');
    const removeResult = storage.removeStoragePath('test-path-3');
    assert(removeResult === true, 'Storage path removed successfully');
    assert(storage.storagePaths.length === 2, 'Storage paths count decreased');
    assert(storage.getPathStatus('test-path-3') === null, 'Status removed for deleted path');

    // Test 12: Non-existent Path Health Check
    log('\n📋 Test 12: Non-existent Path Health Check', 'bright');
    const nonExistentPath = path.join(tmpDir, 'nonexistent');
    const healthCheck = await storage.checkPath(nonExistentPath);
    assert(healthCheck.status === 'unavailable', 'Non-existent path marked as unavailable');
    assert(healthCheck.accessible === false, 'Non-existent path not accessible');
    assert(healthCheck.error !== null, 'Error message provided for non-existent path');

    // Test 13: Read-only Path Detection
    log('\n📋 Test 13: Read-only Path Detection', 'bright');
    const readOnlyPath = path.join(tmpDir, 'readonly');
    fs.mkdirSync(readOnlyPath, { recursive: true });
    fs.chmodSync(readOnlyPath, 0o444); // Read-only
    
    const roHealthCheck = await storage.checkPath(readOnlyPath);
    // Note: This test might pass if running as root or with certain permissions
    if (roHealthCheck.writable === false) {
      assert(roHealthCheck.status === 'degraded', 'Read-only path marked as degraded');
      logInfo('Read-only path correctly detected as degraded');
    } else {
      logWarning('Read-only test skipped (running with elevated permissions)');
    }
    
    // Restore permissions for cleanup
    fs.chmodSync(readOnlyPath, 0o755);

    // Test 14: Cleanup
    log('\n📋 Test 14: Cleanup', 'bright');
    storage.destroy();
    assert(storage.healthCheckTimer === null, 'Health check timer stopped');
    assert(storage.storagePaths.length === 0, 'Storage paths cleared');
    assert(storage.pathStatus.size === 0, 'Path status map cleared');

  } catch (error) {
    logError(`Test suite error: ${error.message}`);
    console.error(error);
  } finally {
    // Cleanup test directories
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      logInfo(`Cleaned up test directories: ${tmpDir}`);
    } catch (err) {
      logWarning(`Failed to clean up test directories: ${err.message}`);
    }
  }

  // Print summary
  log('\n' + '='.repeat(80), 'bright');
  log('Test Summary', 'bright');
  log('='.repeat(80), 'bright');
  log(`Total Tests: ${testsRun}`, 'blue');
  log(`Passed: ${testsPassed}`, 'green');
  log(`Failed: ${testsFailed}`, 'red');
  
  if (testsFailed === 0) {
    log('\n🎉 All tests passed!', 'green');
    process.exit(0);
  } else {
    log(`\n❌ ${testsFailed} test(s) failed`, 'red');
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  logError(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
