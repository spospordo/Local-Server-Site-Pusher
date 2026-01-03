#!/usr/bin/env node

/**
 * Test script for auto-regeneration functionality
 * Tests the public files regenerator API endpoints
 */

const http = require('http');

const PORT = process.env.TEST_PORT || 3000;
const HOST = process.env.TEST_HOST || 'localhost';

// Test admin credentials (default)
const USERNAME = process.env.TEST_ADMIN_USER || 'admin';
const PASSWORD = process.env.TEST_ADMIN_PASS || 'admin123';

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
  
  // Use form-urlencoded format
  const postData = `username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`;
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      // For login, we expect a redirect and need to capture the cookie
      const cookie = res.headers['set-cookie'];
      
      if (cookie && (res.statusCode === 302 || res.statusCode === 200)) {
        console.log('✅ Login successful');
        resolve(cookie[0].split(';')[0]);
      } else {
        console.log('❌ Login failed - no cookie received');
        resolve(null);
      }
      
      // Consume response data
      res.on('data', () => {});
      res.on('end', () => {});
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Test regeneration status endpoint
 */
async function testStatus(sessionCookie) {
  console.log('\n📊 Testing regeneration status endpoint...');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/admin/api/regenerate-public/status',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie
    }
  };
  
  const response = await makeRequest(options);
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Status endpoint works');
    console.log('   Status:', JSON.stringify(response.data.status, null, 2));
    testsPassed++;
    return true;
  } else {
    console.log('❌ Status endpoint failed:', response.data);
    testsFailed++;
    return false;
  }
}

/**
 * Test regeneration logs endpoint
 */
async function testLogs(sessionCookie) {
  console.log('\n📋 Testing regeneration logs endpoint...');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/admin/api/regenerate-public/logs',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie
    }
  };
  
  const response = await makeRequest(options);
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Logs endpoint works');
    console.log(`   Found ${response.data.logs.length} log entries`);
    if (response.data.logs.length > 0) {
      console.log('   Most recent log:', response.data.logs[response.data.logs.length - 1]);
    }
    testsPassed++;
    return true;
  } else {
    console.log('❌ Logs endpoint failed:', response.data);
    testsFailed++;
    return false;
  }
}

/**
 * Test manual regeneration trigger
 */
async function testManualRegeneration(sessionCookie, force = false) {
  console.log(`\n🔄 Testing manual regeneration (force: ${force})...`);
  
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
  
  const response = await makeRequest(options, { force });
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Manual regeneration successful');
    console.log('   Result:', JSON.stringify(response.data.result, null, 2));
    testsPassed++;
    return true;
  } else {
    console.log('❌ Manual regeneration failed:', response.data);
    testsFailed++;
    return false;
  }
}

/**
 * Test clear logs endpoint
 */
async function testClearLogs(sessionCookie) {
  console.log('\n🗑️  Testing clear logs endpoint...');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/admin/api/regenerate-public/logs/clear',
    method: 'POST',
    headers: {
      'Cookie': sessionCookie
    }
  };
  
  const response = await makeRequest(options);
  
  if (response.status === 200 && response.data.success) {
    console.log('✅ Clear logs successful');
    testsPassed++;
    return true;
  } else {
    console.log('❌ Clear logs failed:', response.data);
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
  console.log('🧪 Auto-Regeneration API Tests');
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
    await testStatus(sessionCookie);
    await testLogs(sessionCookie);
    await testManualRegeneration(sessionCookie, false);
    
    // Wait a bit for regeneration to complete
    console.log('\n⏳ Waiting for regeneration to complete...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check logs again
    await testLogs(sessionCookie);
    
    // Test force regeneration
    await testManualRegeneration(sessionCookie, true);
    
    // Wait again
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check logs one more time
    await testLogs(sessionCookie);
    
    // Clear logs
    await testClearLogs(sessionCookie);
    
    // Verify logs are cleared
    await testLogs(sessionCookie);
    
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Test Summary');
    console.log('='.repeat(80));
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📈 Total: ${testsPassed + testsFailed}`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed!');
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
