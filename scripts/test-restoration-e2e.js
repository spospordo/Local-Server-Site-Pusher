#!/usr/bin/env node

/**
 * End-to-end test for static file restoration via API
 * Tests missing file detection and restoration through the admin API
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.TEST_PORT || 3000;
const HOST = process.env.TEST_HOST || 'localhost';

// Test admin credentials (default)
const USERNAME = process.env.TEST_ADMIN_USER || 'admin';
const PASSWORD = process.env.TEST_ADMIN_PASS || 'admin123';

const publicDir = path.join(__dirname, '..', 'public');
const testFile = 'index.html';
const testFilePath = path.join(publicDir, testFile);
const backupPath = path.join('/tmp', 'test-backup-index.html');

let testsPassed = 0;
let testsFailed = 0;

/**
 * Make an HTTP request
 */
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });
    
    req.on('error', reject);
    
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    
    req.end();
  });
}

/**
 * Login and get session cookie
 */
async function login() {
  console.log('\n🔐 Logging in...');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/admin/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };
  
  const postData = `username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`;
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const cookie = res.headers['set-cookie'];
      
      if (cookie && (res.statusCode === 302 || res.statusCode === 200)) {
        console.log('✅ Login successful');
        resolve(cookie[0].split(';')[0]);
      } else {
        console.log('❌ Login failed - no cookie received');
        resolve(null);
      }
      
      res.on('data', () => {});
      res.on('end', () => {});
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Test 1: Backup the test file
 */
function testBackupFile() {
  console.log('\n📋 Test 1: Backup test file...');
  
  try {
    if (fs.existsSync(testFilePath)) {
      fs.copyFileSync(testFilePath, backupPath);
      console.log(`  ✅ Backed up ${testFile}`);
      console.log('✅ Test 1 passed');
      testsPassed++;
      return true;
    } else {
      console.log(`  ❌ Test file doesn't exist`);
      console.log('❌ Test 1 failed');
      testsFailed++;
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    console.log('❌ Test 1 failed');
    testsFailed++;
    return false;
  }
}

/**
 * Test 2: Delete the test file
 */
function testDeleteFile() {
  console.log('\n📋 Test 2: Delete test file to simulate missing file...');
  
  try {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
      console.log(`  ✅ Deleted ${testFile}`);
      
      if (!fs.existsSync(testFilePath)) {
        console.log('  ✅ File confirmed missing');
        console.log('✅ Test 2 passed');
        testsPassed++;
        return true;
      } else {
        console.log('  ❌ File still exists after deletion');
        console.log('❌ Test 2 failed');
        testsFailed++;
        return false;
      }
    } else {
      console.log('  ⚠️  File already missing');
      console.log('✅ Test 2 passed (file already missing)');
      testsPassed++;
      return true;
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    console.log('❌ Test 2 failed');
    testsFailed++;
    return false;
  }
}

/**
 * Test 3: Trigger regeneration via API
 */
async function testTriggerRegeneration(sessionCookie) {
  console.log('\n📋 Test 3: Trigger regeneration via API...');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/admin/api/regenerate-public',
    method: 'POST',
    headers: {
      'Cookie': sessionCookie,
      'Content-Type': 'application/json'
    }
  };
  
  try {
    const response = await makeRequest(options, { force: false });
    
    if (response.status === 200 && response.data.success) {
      console.log('  ✅ API call successful');
      console.log('  📊 Result:', JSON.stringify(response.data.result.staticFiles, null, 2));
      
      // Check if file was restored
      const staticFilesResult = response.data.result.staticFiles;
      if (staticFilesResult.restored > 0 && staticFilesResult.restoredFiles.includes(testFile)) {
        console.log(`  ✅ File ${testFile} was restored`);
        console.log('✅ Test 3 passed');
        testsPassed++;
        return true;
      } else {
        console.log(`  ⚠️  File was not restored. Restored: ${staticFilesResult.restored}, Files: ${staticFilesResult.restoredFiles.join(', ')}`);
        console.log('❌ Test 3 failed');
        testsFailed++;
        return false;
      }
    } else {
      console.log('  ❌ API call failed:', response.data);
      console.log('❌ Test 3 failed');
      testsFailed++;
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    console.log('❌ Test 3 failed');
    testsFailed++;
    return false;
  }
}

/**
 * Test 4: Verify file was physically restored
 */
function testVerifyFileRestored() {
  console.log('\n📋 Test 4: Verify file was physically restored...');
  
  try {
    if (fs.existsSync(testFilePath)) {
      console.log(`  ✅ File ${testFile} exists on disk`);
      
      const stats = fs.statSync(testFilePath);
      console.log(`  📊 File size: ${stats.size} bytes`);
      
      console.log('✅ Test 4 passed');
      testsPassed++;
      return true;
    } else {
      console.log(`  ❌ File ${testFile} still missing`);
      console.log('❌ Test 4 failed');
      testsFailed++;
      return false;
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    console.log('❌ Test 4 failed');
    testsFailed++;
    return false;
  }
}

/**
 * Test 5: Restore original file from backup
 */
function testRestoreBackup() {
  console.log('\n📋 Test 5: Restore original from backup...');
  
  try {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, testFilePath);
      console.log(`  ✅ Restored ${testFile} from backup`);
      
      // Clean up backup
      fs.unlinkSync(backupPath);
      console.log('  ✅ Cleaned up backup file');
      
      console.log('✅ Test 5 passed');
      testsPassed++;
      return true;
    } else {
      console.log('  ⚠️  Backup file not found, skipping restore');
      console.log('✅ Test 5 passed (no backup to restore)');
      testsPassed++;
      return true;
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    console.log('❌ Test 5 failed');
    testsFailed++;
    return false;
  }
}

/**
 * Wait for server to be ready
 */
async function waitForServer(maxAttempts = 30) {
  console.log('⏳ Waiting for server to be ready...');
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const options = {
        hostname: HOST,
        port: PORT,
        path: '/api/status',
        method: 'GET'
      };
      
      const response = await makeRequest(options);
      
      if (response.status === 200) {
        console.log('✅ Server is ready');
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('❌ Server did not become ready in time');
  return false;
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('='.repeat(80));
  console.log('🧪 Static File Restoration - E2E API Tests');
  console.log('='.repeat(80));
  
  try {
    // Wait for server
    const serverReady = await waitForServer();
    if (!serverReady) {
      console.log('\n❌ Cannot run tests - server not available');
      process.exit(1);
    }
    
    // Login
    const sessionCookie = await login();
    if (!sessionCookie) {
      console.log('\n❌ Cannot run tests - login failed');
      process.exit(1);
    }
    
    // Run tests
    const backedUp = testBackupFile();
    if (!backedUp) {
      console.log('\n❌ Cannot continue - backup failed');
      process.exit(1);
    }
    
    testDeleteFile();
    await testTriggerRegeneration(sessionCookie);
    testVerifyFileRestored();
    testRestoreBackup();
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Test Summary');
    console.log('='.repeat(80));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Total: ${testsPassed + testsFailed}`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed!');
      console.log('\n✨ Static file restoration is working correctly via API!');
      process.exit(0);
    } else {
      console.log(`\n❌ ${testsFailed} test(s) failed`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
}

// Run tests
runTests();
