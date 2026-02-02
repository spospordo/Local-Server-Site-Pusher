#!/usr/bin/env node

/**
 * Test script for Clock Widget Additional Timezones Feature
 * Tests that additionalTimezones configuration is properly included in public config
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 15000;
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'smart-mirror-config.json');

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: TEST_TIMEOUT
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body.length > 0 ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (err) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Read current config
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    return null;
  } catch (error) {
    console.error('Error reading config:', error.message);
    return null;
  }
}

// Write config with backup
function writeConfig(config) {
  try {
    // Create backup
    if (fs.existsSync(CONFIG_PATH)) {
      const backupPath = CONFIG_PATH + '.backup';
      fs.copyFileSync(CONFIG_PATH, backupPath);
    }
    
    // Ensure config directory exists
    const configDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing config:', error.message);
    return false;
  }
}

// Restore config from backup
function restoreConfig() {
  try {
    const backupPath = CONFIG_PATH + '.backup';
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, CONFIG_PATH);
      fs.unlinkSync(backupPath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error restoring config:', error.message);
    return false;
  }
}

// Test functions
async function testAdditionalTimezonesInPublicConfig() {
  console.log('\n🧪 Test 1: Additional timezones included in public config API');
  
  let originalConfig = readConfig();
  let testConfig = originalConfig ? JSON.parse(JSON.stringify(originalConfig)) : {
    enabled: true,
    theme: 'light',
    gridSize: 8,
    refreshInterval: 300000,
    widgets: {}
  };
  
  // Add test additional timezones to clock widget
  if (!testConfig.widgets.clock) {
    testConfig.widgets.clock = {
      enabled: true,
      area: { x: 0, y: 0, width: 4, height: 2 },
      size: 'small'
    };
  }
  
  testConfig.widgets.clock.additionalTimezones = [
    { city: 'London', timezone: 'Europe/London' },
    { city: 'Tokyo', timezone: 'Asia/Tokyo' },
    { city: 'New York', timezone: 'America/New_York' }
  ];
  
  // Write test config
  if (!writeConfig(testConfig)) {
    console.log('❌ Failed to write test config');
    return false;
  }
  
  // Wait a bit for config to be reloaded (if server watches file)
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    // Get public config from API
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body?.success) {
      const config = result.body.config;
      
      // Check if clock widget exists
      if (!config.widgets?.clock) {
        console.log('❌ Clock widget not found in public config');
        return false;
      }
      
      // Check if additionalTimezones is included
      if (!config.widgets.clock.additionalTimezones) {
        console.log('❌ additionalTimezones not found in clock widget public config');
        console.log('   Clock widget config:', JSON.stringify(config.widgets.clock, null, 2));
        return false;
      }
      
      // Verify the data matches
      const timezones = config.widgets.clock.additionalTimezones;
      if (!Array.isArray(timezones) || timezones.length !== 3) {
        console.log('❌ additionalTimezones is not the expected array');
        console.log('   Got:', JSON.stringify(timezones, null, 2));
        return false;
      }
      
      // Check for specific timezones
      const hasLondon = timezones.some(tz => tz.city === 'London' && tz.timezone === 'Europe/London');
      const hasTokyo = timezones.some(tz => tz.city === 'Tokyo' && tz.timezone === 'Asia/Tokyo');
      const hasNewYork = timezones.some(tz => tz.city === 'New York' && tz.timezone === 'America/New_York');
      
      if (!hasLondon || !hasTokyo || !hasNewYork) {
        console.log('❌ Expected timezones not found');
        console.log('   Got:', JSON.stringify(timezones, null, 2));
        return false;
      }
      
      console.log('✅ additionalTimezones correctly included in public config');
      console.log('   - London timezone: ✓');
      console.log('   - Tokyo timezone: ✓');
      console.log('   - New York timezone: ✓');
      return true;
    } else {
      console.log('❌ Config endpoint failed');
      console.log('   Status:', result.statusCode);
      console.log('   Body:', result.body);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  } finally {
    // Restore original config
    if (originalConfig) {
      restoreConfig();
    }
  }
}

async function testWithoutAdditionalTimezones() {
  console.log('\n🧪 Test 2: Config without additionalTimezones (should not fail)');
  
  let originalConfig = readConfig();
  let testConfig = originalConfig ? JSON.parse(JSON.stringify(originalConfig)) : {
    enabled: true,
    theme: 'light',
    gridSize: 8,
    refreshInterval: 300000,
    widgets: {}
  };
  
  // Ensure clock widget exists but without additionalTimezones
  if (!testConfig.widgets.clock) {
    testConfig.widgets.clock = {
      enabled: true,
      area: { x: 0, y: 0, width: 4, height: 2 },
      size: 'small'
    };
  }
  
  // Remove additionalTimezones if it exists
  delete testConfig.widgets.clock.additionalTimezones;
  
  // Write test config
  if (!writeConfig(testConfig)) {
    console.log('❌ Failed to write test config');
    return false;
  }
  
  // Wait for config reload
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body?.success) {
      const config = result.body.config;
      
      // Should still have clock widget
      if (!config.widgets?.clock) {
        console.log('❌ Clock widget not found in public config');
        return false;
      }
      
      // additionalTimezones should not be present or be undefined
      if (config.widgets.clock.additionalTimezones !== undefined) {
        console.log('⚠️  additionalTimezones is present but should be undefined');
        console.log('   Value:', config.widgets.clock.additionalTimezones);
        // This is acceptable, just note it
      }
      
      console.log('✅ Config works correctly without additionalTimezones');
      return true;
    } else {
      console.log('❌ Config endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  } finally {
    // Restore original config
    if (originalConfig) {
      restoreConfig();
    }
  }
}

async function testSimpleAdditionalTimezones() {
  console.log('\n🧪 Test 3: Simple check - additionalTimezones field present in API');
  
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body?.success) {
      const config = result.body.config;
      
      // Check if clock widget exists
      if (!config.widgets?.clock) {
        console.log('❌ Clock widget not found in public config');
        return false;
      }
      
      // Check if additionalTimezones field is accessible (even if empty)
      const hasField = 'additionalTimezones' in config.widgets.clock;
      
      if (hasField) {
        const timezones = config.widgets.clock.additionalTimezones;
        console.log('✅ additionalTimezones field is present in public config');
        if (Array.isArray(timezones) && timezones.length > 0) {
          console.log(`   - Found ${timezones.length} additional timezone(s):`);
          timezones.forEach(tz => {
            console.log(`     • ${tz.city}: ${tz.timezone}`);
          });
        } else {
          console.log('   - No additional timezones configured (field is empty/undefined)');
        }
        return true;
      } else {
        console.log('❌ additionalTimezones field not found in clock widget config');
        console.log('   This means the fix was not applied correctly');
        return false;
      }
    } else {
      console.log('❌ Config endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Clock Widget Additional Timezones Test Suite');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Testing server at:', BASE_URL);
  
  const results = {
    passed: 0,
    failed: 0,
    total: 3
  };
  
  // Run tests - start with simple test first
  if (await testSimpleAdditionalTimezones()) results.passed++; else results.failed++;
  if (await testAdditionalTimezonesInPublicConfig()) results.passed++; else results.failed++;
  if (await testWithoutAdditionalTimezones()) results.passed++; else results.failed++;
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Test Results Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Tests: ${results.total}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (results.failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
    process.exit(1);
  }
}

// Check if server is running before starting tests
async function checkServer() {
  console.log('\nChecking if server is running...');
  try {
    await makeRequest('GET', '/');
    console.log('✅ Server is running\n');
    return true;
  } catch (error) {
    console.log('❌ Server is not running or not accessible');
    console.log('   Please start the server with: npm start');
    console.log('   Error:', error.message);
    return false;
  }
}

// Main execution
(async () => {
  if (await checkServer()) {
    await runTests();
  } else {
    process.exit(1);
  }
})();
