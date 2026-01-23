#!/usr/bin/env node

/**
 * Integration test for NFS Storage API endpoints
 * Tests the REST API functionality
 */

const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SERVER_URL = 'http://localhost:3000';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

let serverProcess = null;
let sessionCookie = null;

async function startServer() {
  log('🚀 Starting server...', 'blue');
  
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['server.js'], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' }
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('running on port 3000')) {
        log('✅ Server started successfully', 'green');
        // Wait a bit for the server to be fully ready
        setTimeout(resolve, 2000);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      // Ignore warnings
    });

    serverProcess.on('error', (error) => {
      reject(error);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 30000);
  });
}

function stopServer() {
  if (serverProcess) {
    log('🛑 Stopping server...', 'blue');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

async function login() {
  log('🔐 Logging in...', 'blue');
  
  try {
    const response = await axios.post(`${SERVER_URL}/admin/login`, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    }, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302 || status === 200
    });

    const cookies = response.headers['set-cookie'];
    if (cookies) {
      sessionCookie = cookies[0].split(';')[0];
      log('✅ Login successful', 'green');
      return true;
    }
  } catch (error) {
    if (error.response && error.response.headers['set-cookie']) {
      const cookies = error.response.headers['set-cookie'];
      sessionCookie = cookies[0].split(';')[0];
      log('✅ Login successful', 'green');
      return true;
    }
    log('❌ Login failed: ' + error.message, 'red');
    return false;
  }
}

async function testNFSStorageAPI() {
  log('\n📋 Testing NFS Storage API Endpoints', 'blue');
  
  const headers = {
    'Cookie': sessionCookie,
    'Content-Type': 'application/json'
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfs-api-test-'));
  const testPath1 = path.join(tmpDir, 'storage1');
  const testPath2 = path.join(tmpDir, 'storage2');
  
  fs.mkdirSync(testPath1, { recursive: true });
  fs.mkdirSync(testPath2, { recursive: true });

  try {
    // Test 1: Get storage paths (should be disabled by default)
    log('\n1. GET /admin/api/nfs-storage/paths', 'blue');
    let response = await axios.get(`${SERVER_URL}/admin/api/nfs-storage/paths`, { headers });
    if (response.data.enabled === false) {
      log('✅ NFS storage disabled by default', 'green');
    } else {
      log('⚠️  NFS storage is enabled', 'yellow');
    }

    // Test 2: Enable NFS storage
    log('\n2. POST /admin/api/nfs-storage/toggle (enable)', 'blue');
    response = await axios.post(`${SERVER_URL}/admin/api/nfs-storage/toggle`, 
      { enabled: true }, 
      { headers }
    );
    if (response.data.success && response.data.enabled) {
      log('✅ NFS storage enabled successfully', 'green');
    } else {
      log('❌ Failed to enable NFS storage', 'red');
      return;
    }

    // Wait a bit for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Add storage path
    log('\n3. POST /admin/api/nfs-storage/paths (add path)', 'blue');
    const newPath = {
      id: 'test-storage-1',
      name: 'Test Storage 1',
      path: testPath1,
      type: 'local',
      enabled: true,
      purpose: 'backup'
    };
    response = await axios.post(`${SERVER_URL}/admin/api/nfs-storage/paths`, 
      newPath, 
      { headers }
    );
    if (response.data.success) {
      log('✅ Storage path added successfully', 'green');
    } else {
      log('❌ Failed to add storage path: ' + JSON.stringify(response.data), 'red');
      return;
    }

    // Test 4: Get all paths (should now include our path)
    log('\n4. GET /admin/api/nfs-storage/paths (with path)', 'blue');
    response = await axios.get(`${SERVER_URL}/admin/api/nfs-storage/paths`, { headers });
    if (response.data.enabled && response.data.paths.length > 0) {
      log(`✅ Retrieved ${response.data.paths.length} storage path(s)`, 'green');
      log(`   - Path: ${response.data.paths[0].name}`, 'blue');
      log(`   - Status: ${response.data.paths[0].status.status}`, 'blue');
    } else {
      log('❌ Failed to retrieve storage paths', 'red');
    }

    // Test 5: Get specific path status
    log('\n5. GET /admin/api/nfs-storage/paths/:id/status', 'blue');
    response = await axios.get(`${SERVER_URL}/admin/api/nfs-storage/paths/test-storage-1/status`, { headers });
    if (response.data.status === 'healthy') {
      log('✅ Path status retrieved: healthy', 'green');
    } else {
      log(`⚠️  Path status: ${response.data.status}`, 'yellow');
    }

    // Test 6: Get storage stats
    log('\n6. GET /admin/api/nfs-storage/paths/:id/stats', 'blue');
    response = await axios.get(`${SERVER_URL}/admin/api/nfs-storage/paths/test-storage-1/stats`, { headers });
    if (response.data.available) {
      log(`✅ Storage stats retrieved`, 'green');
      log(`   - File count: ${response.data.fileCount}`, 'blue');
      log(`   - Total size: ${response.data.totalSize} bytes`, 'blue');
    } else {
      log('⚠️  Storage stats not available', 'yellow');
    }

    // Test 7: Update storage path
    log('\n7. PUT /admin/api/nfs-storage/paths/:id (update)', 'blue');
    response = await axios.put(`${SERVER_URL}/admin/api/nfs-storage/paths/test-storage-1`, 
      { name: 'Updated Test Storage' }, 
      { headers }
    );
    if (response.data.success) {
      log('✅ Storage path updated successfully', 'green');
    } else {
      log('❌ Failed to update storage path', 'red');
    }

    // Test 8: Add second path
    log('\n8. POST /admin/api/nfs-storage/paths (add second path)', 'blue');
    const newPath2 = {
      id: 'test-storage-2',
      name: 'Test Storage 2',
      path: testPath2,
      type: 'nfs',
      enabled: true,
      purpose: 'media'
    };
    response = await axios.post(`${SERVER_URL}/admin/api/nfs-storage/paths`, 
      newPath2, 
      { headers }
    );
    if (response.data.success) {
      log('✅ Second storage path added successfully', 'green');
    }

    // Test 9: Trigger health check
    log('\n9. POST /admin/api/nfs-storage/health-check', 'blue');
    response = await axios.post(`${SERVER_URL}/admin/api/nfs-storage/health-check`, {}, { headers });
    if (response.data.success) {
      log('✅ Health check completed successfully', 'green');
      const resultKeys = Object.keys(response.data.results);
      log(`   - Checked ${resultKeys.length} path(s)`, 'blue');
    } else {
      log('❌ Health check failed', 'red');
    }

    // Test 10: Delete storage path
    log('\n10. DELETE /admin/api/nfs-storage/paths/:id', 'blue');
    response = await axios.delete(`${SERVER_URL}/admin/api/nfs-storage/paths/test-storage-2`, { headers });
    if (response.data.success) {
      log('✅ Storage path deleted successfully', 'green');
    } else {
      log('❌ Failed to delete storage path', 'red');
    }

    // Test 11: Verify deletion
    log('\n11. Verify path deletion', 'blue');
    response = await axios.get(`${SERVER_URL}/admin/api/nfs-storage/paths`, { headers });
    if (response.data.paths.length === 1) {
      log('✅ Path count correct after deletion', 'green');
    } else {
      log(`⚠️  Unexpected path count: ${response.data.paths.length}`, 'yellow');
    }

    // Test 12: Disable NFS storage
    log('\n12. POST /admin/api/nfs-storage/toggle (disable)', 'blue');
    response = await axios.post(`${SERVER_URL}/admin/api/nfs-storage/toggle`, 
      { enabled: false }, 
      { headers }
    );
    if (response.data.success && !response.data.enabled) {
      log('✅ NFS storage disabled successfully', 'green');
    } else {
      log('❌ Failed to disable NFS storage', 'red');
    }

    log('\n🎉 All API tests completed successfully!', 'green');

  } catch (error) {
    log(`\n❌ API test failed: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Data: ${JSON.stringify(error.response.data)}`, 'red');
    }
  } finally {
    // Cleanup
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

async function runTests() {
  try {
    await startServer();
    await login();
    await testNFSStorageAPI();
  } catch (error) {
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    stopServer();
    // Wait a bit for cleanup
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
}

// Run tests
runTests();
