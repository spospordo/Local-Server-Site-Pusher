#!/usr/bin/env node
/**
 * Test script for Smart Mirror route functionality
 * Tests that:
 * 1. Route returns 404 when Smart Mirror is disabled
 * 2. Route returns 200 when Smart Mirror is enabled
 * 3. Proper error messages are displayed
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const CONFIG_FILE = path.join(__dirname, '..', 'config', 'smartmirror-config.json.enc');

let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
  const symbols = {
    success: '✅',
    error: '❌',
    info: 'ℹ️ ',
    warning: '⚠️ '
  };
  console.log(`${symbols[type] || ''} ${message}`);
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data, headers: res.headers });
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function test(description, testFn) {
  try {
    await testFn();
    log(`PASS: ${description}`, 'success');
    testsPassed++;
  } catch (err) {
    log(`FAIL: ${description}`, 'error');
    log(`  ${err.message}`, 'error');
    testsFailed++;
  }
}

async function runTests() {
  log('Starting Smart Mirror route tests...\n', 'info');

  // Backup existing config if it exists
  const configBackup = CONFIG_FILE + '.test-backup';
  if (fs.existsSync(CONFIG_FILE)) {
    fs.copyFileSync(CONFIG_FILE, configBackup);
    log('Backed up existing Smart Mirror config', 'info');
  }

  try {
    // Test 1: Route returns 404 when disabled
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    log('\nTest 1: Smart Mirror disabled (no config)', 'info');
    await test('Returns 404 status code when disabled', async () => {
      const response = await makeRequest('/smart-mirror');
      if (response.statusCode !== 404) {
        throw new Error(`Expected 404, got ${response.statusCode}`);
      }
    });

    await test('Returns helpful error message when disabled', async () => {
      const response = await makeRequest('/smart-mirror');
      if (!response.body.includes('Smart Mirror dashboard is currently disabled')) {
        throw new Error('Error message not found in response');
      }
    });

    await test('Includes link to admin settings when disabled', async () => {
      const response = await makeRequest('/smart-mirror');
      if (!response.body.includes('/admin')) {
        throw new Error('Admin link not found in response');
      }
    });

    // Test 2: Enable Smart Mirror and test again
    log('\nTest 2: Enabling Smart Mirror...', 'info');
    const smartMirror = require('../modules/smartmirror');
    smartMirror.init({});
    const defaultConfig = smartMirror.getDefaultConfig();
    defaultConfig.enabled = true;
    smartMirror.saveConfig(defaultConfig);
    
    // Wait a moment for config to be written
    await new Promise(resolve => setTimeout(resolve, 100));

    await test('Returns 200 status code when enabled', async () => {
      const response = await makeRequest('/smart-mirror');
      if (response.statusCode !== 200) {
        throw new Error(`Expected 200, got ${response.statusCode}`);
      }
    });

    await test('Returns HTML dashboard when enabled', async () => {
      const response = await makeRequest('/smart-mirror');
      if (!response.body.includes('<!DOCTYPE html>')) {
        throw new Error('HTML not found in response');
      }
      if (!response.body.includes('Smart Mirror Dashboard')) {
        throw new Error('Dashboard title not found in response');
      }
    });

    await test('Sets cache-control headers', async () => {
      const response = await makeRequest('/smart-mirror');
      const cacheControl = response.headers['cache-control'];
      if (!cacheControl || !cacheControl.includes('no-store')) {
        throw new Error('Cache-control header not set correctly');
      }
    });

    // Test 3: Config API endpoint
    log('\nTest 3: Smart Mirror config API', 'info');
    await test('Config API returns success', async () => {
      const response = await makeRequest('/api/smart-mirror/config');
      const data = JSON.parse(response.body);
      if (!data.success) {
        throw new Error('API did not return success');
      }
    });

    await test('Config API returns enabled state', async () => {
      const response = await makeRequest('/api/smart-mirror/config');
      const data = JSON.parse(response.body);
      if (data.config.enabled !== true) {
        throw new Error('Config API did not return enabled state');
      }
    });

  } finally {
    // Restore backed up config
    if (fs.existsSync(configBackup)) {
      fs.copyFileSync(configBackup, CONFIG_FILE);
      fs.unlinkSync(configBackup);
      log('\nRestored Smart Mirror config from backup', 'info');
    } else {
      // Clean up test config
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
      }
    }
  }

  // Print summary
  log('\n' + '='.repeat(50), 'info');
  log('Test Summary:', 'info');
  log(`  Passed: ${testsPassed}`, 'success');
  if (testsFailed > 0) {
    log(`  Failed: ${testsFailed}`, 'error');
  }
  log('='.repeat(50) + '\n', 'info');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Check if server is running
http.get(BASE_URL + '/api/status', (res) => {
  if (res.statusCode === 200) {
    log('Server is running, starting tests...', 'success');
    runTests().catch(err => {
      log('Test suite failed:', 'error');
      log(err.message, 'error');
      process.exit(1);
    });
  }
}).on('error', () => {
  log('Server is not running. Please start the server first:', 'error');
  log('  npm start', 'info');
  process.exit(1);
});
