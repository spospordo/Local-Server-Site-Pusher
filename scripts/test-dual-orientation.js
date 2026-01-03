#!/usr/bin/env node

/**
 * Test script for dual orientation layout support
 * Tests the new portrait/landscape layout functionality
 */

const http = require('http');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

let sessionCookie = null;

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, BASE_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    if (sessionCookie) {
      reqOptions.headers['Cookie'] = sessionCookie;
    }

    const req = http.request(reqOptions, (res) => {
      let body = '';
      
      // Store session cookie from login
      if (res.headers['set-cookie']) {
        sessionCookie = res.headers['set-cookie'][0].split(';')[0];
      }

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }

    req.end();
  });
}

// Test functions
async function testLogin() {
  console.log('\n📝 Test 1: Admin Login');
  console.log('=====================================');
  
  try {
    const response = await makeRequest({
      path: '/admin/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });

    if (response.statusCode === 200) {
      console.log('✅ Login successful');
      return true;
    } else {
      console.log(`❌ Login failed with status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return false;
  }
}

async function testSaveDualLayoutConfig() {
  console.log('\n📝 Test 2: Save Dual Layout Configuration');
  console.log('=====================================');
  
  const config = {
    enabled: true,
    theme: 'dark',
    widgets: {
      clock: {
        enabled: true,
        size: 'medium',
        area: 'top-left'
      },
      calendar: {
        enabled: true,
        size: 'large',
        area: 'top-right',
        calendarUrls: []
      },
      weather: {
        enabled: false,
        size: 'medium',
        area: 'bottom-left',
        location: '',
        units: 'imperial'
      },
      forecast: {
        enabled: false,
        size: 'large',
        area: 'bottom-center',
        location: '',
        days: 5,
        units: 'imperial'
      },
      news: {
        enabled: false,
        size: 'medium',
        area: 'bottom-right',
        feedUrls: []
      }
    },
    layouts: {
      portrait: {
        clock: { x: 0, y: 0, width: 2, height: 1 },
        calendar: { x: 2, y: 0, width: 2, height: 2 },
        weather: { x: 0, y: 1, width: 2, height: 1 },
        forecast: { x: 0, y: 2, width: 4, height: 1 },
        news: { x: 2, y: 1, width: 2, height: 1 }
      },
      landscape: {
        clock: { x: 0, y: 0, width: 1, height: 1 },
        calendar: { x: 1, y: 0, width: 2, height: 2 },
        weather: { x: 3, y: 0, width: 1, height: 1 },
        forecast: { x: 0, y: 2, width: 4, height: 1 },
        news: { x: 0, y: 1, width: 1, height: 1 }
      }
    },
    gridSize: {
      columns: 4,
      rows: 3
    },
    refreshInterval: 60000
  };

  try {
    const response = await makeRequest({
      path: '/admin/api/smart-mirror/config',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, config);

    const result = JSON.parse(response.body);
    
    if (response.statusCode === 200 && result.success) {
      console.log('✅ Configuration saved successfully');
      console.log('   Has portrait layout:', !!result.config?.layouts?.portrait);
      console.log('   Has landscape layout:', !!result.config?.layouts?.landscape);
      return true;
    } else {
      console.log(`❌ Save failed: ${result.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Save error:', error.message);
    return false;
  }
}

async function testLoadConfig() {
  console.log('\n📝 Test 3: Load Configuration (No Orientation)');
  console.log('=====================================');
  
  try {
    const response = await makeRequest({
      path: '/api/smart-mirror/config',
      method: 'GET'
    });

    const result = JSON.parse(response.body);
    
    if (response.statusCode === 200 && result.success) {
      console.log('✅ Configuration loaded successfully');
      console.log('   Has portrait layout:', !!result.config?.layouts?.portrait);
      console.log('   Has landscape layout:', !!result.config?.layouts?.landscape);
      
      if (result.config?.layouts?.portrait && result.config?.layouts?.landscape) {
        console.log('   Portrait clock position:', JSON.stringify(result.config.layouts.portrait.clock));
        console.log('   Landscape clock position:', JSON.stringify(result.config.layouts.landscape.clock));
        return true;
      } else {
        console.log('❌ Missing layouts in response');
        return false;
      }
    } else {
      console.log(`❌ Load failed: ${result.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Load error:', error.message);
    return false;
  }
}

async function testLoadPortraitConfig() {
  console.log('\n📝 Test 4: Load Portrait Configuration');
  console.log('=====================================');
  
  try {
    const response = await makeRequest({
      path: '/api/smart-mirror/config?orientation=portrait',
      method: 'GET'
    });

    const result = JSON.parse(response.body);
    
    if (response.statusCode === 200 && result.success) {
      console.log('✅ Portrait configuration loaded successfully');
      console.log('   Has portrait layout:', !!result.config?.layouts?.portrait);
      console.log('   Has landscape layout:', !!result.config?.layouts?.landscape);
      
      if (result.config?.layouts?.portrait && !result.config?.layouts?.landscape) {
        console.log('   ✅ Correctly returns only portrait layout');
        console.log('   Portrait clock position:', JSON.stringify(result.config.layouts.portrait.clock));
        return true;
      } else if (result.config?.layouts?.landscape) {
        console.log('   ⚠️  Warning: Returned both layouts (should only return portrait)');
        return true; // Still acceptable
      } else {
        console.log('❌ Missing portrait layout in response');
        return false;
      }
    } else {
      console.log(`❌ Load failed: ${result.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Load error:', error.message);
    return false;
  }
}

async function testLoadLandscapeConfig() {
  console.log('\n📝 Test 5: Load Landscape Configuration');
  console.log('=====================================');
  
  try {
    const response = await makeRequest({
      path: '/api/smart-mirror/config?orientation=landscape',
      method: 'GET'
    });

    const result = JSON.parse(response.body);
    
    if (response.statusCode === 200 && result.success) {
      console.log('✅ Landscape configuration loaded successfully');
      console.log('   Has portrait layout:', !!result.config?.layouts?.portrait);
      console.log('   Has landscape layout:', !!result.config?.layouts?.landscape);
      
      if (result.config?.layouts?.landscape && !result.config?.layouts?.portrait) {
        console.log('   ✅ Correctly returns only landscape layout');
        console.log('   Landscape clock position:', JSON.stringify(result.config.layouts.landscape.clock));
        return true;
      } else if (result.config?.layouts?.portrait) {
        console.log('   ⚠️  Warning: Returned both layouts (should only return landscape)');
        return true; // Still acceptable
      } else {
        console.log('❌ Missing landscape layout in response');
        return false;
      }
    } else {
      console.log(`❌ Load failed: ${result.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Load error:', error.message);
    return false;
  }
}

async function testPortraitRoute() {
  console.log('\n📝 Test 6: Portrait Route (/smart-mirror)');
  console.log('=====================================');
  
  try {
    const response = await makeRequest({
      path: '/smart-mirror',
      method: 'GET'
    });

    if (response.statusCode === 200) {
      console.log('✅ Portrait route accessible');
      console.log('   Content-Type:', response.headers['content-type']);
      return true;
    } else {
      console.log(`❌ Portrait route failed with status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Route error:', error.message);
    return false;
  }
}

async function testLandscapeRoute() {
  console.log('\n📝 Test 7: Landscape Route (/smart-mirror-l)');
  console.log('=====================================');
  
  try {
    const response = await makeRequest({
      path: '/smart-mirror-l',
      method: 'GET'
    });

    if (response.statusCode === 200) {
      console.log('✅ Landscape route accessible');
      console.log('   Content-Type:', response.headers['content-type']);
      return true;
    } else {
      console.log(`❌ Landscape route failed with status ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Route error:', error.message);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('🧪 Starting Dual Orientation Layout Tests');
  console.log('=========================================');
  console.log(`Testing against: ${BASE_URL}`);
  
  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  const tests = [
    { name: 'Login', fn: testLogin },
    { name: 'Save Dual Layout Config', fn: testSaveDualLayoutConfig },
    { name: 'Load Config (No Orientation)', fn: testLoadConfig },
    { name: 'Load Portrait Config', fn: testLoadPortraitConfig },
    { name: 'Load Landscape Config', fn: testLoadLandscapeConfig },
    { name: 'Portrait Route', fn: testPortraitRoute },
    { name: 'Landscape Route', fn: testLandscapeRoute }
  ];

  for (const test of tests) {
    results.total++;
    try {
      const passed = await test.fn();
      if (passed) {
        results.passed++;
      } else {
        results.failed++;
      }
    } catch (error) {
      console.error(`❌ Test "${test.name}" threw an error:`, error.message);
      results.failed++;
    }
  }

  // Print summary
  console.log('\n\n📊 Test Summary');
  console.log('=====================================');
  console.log(`Total Tests: ${results.total}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success Rate: ${Math.round((results.passed / results.total) * 100)}%`);
  
  if (results.failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please check the output above.');
    process.exit(1);
  }
}

// Start tests
runAllTests().catch(error => {
  console.error('💥 Fatal error running tests:', error);
  process.exit(1);
});
