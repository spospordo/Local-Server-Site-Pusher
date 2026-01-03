#!/usr/bin/env node

/**
 * Test script for Smart Mirror Grid Granularity Enhancement
 * Tests that the new per-orientation grid sizes work correctly
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 10000;

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
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

// Test functions
async function testGridSizeStructure() {
  console.log('\n🧪 Test 1: Verify gridSize has portrait and landscape configurations');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      
      // Check gridSize structure
      if (!config.gridSize) {
        console.log('❌ FAIL: gridSize is missing from config');
        return false;
      }
      
      // Check for per-orientation grid sizes
      if (config.gridSize.portrait && config.gridSize.landscape) {
        console.log('✅ PASS: gridSize has portrait and landscape configurations');
        console.log(`   Portrait: ${config.gridSize.portrait.columns}×${config.gridSize.portrait.rows}`);
        console.log(`   Landscape: ${config.gridSize.landscape.columns}×${config.gridSize.landscape.rows}`);
        return true;
      } else if (config.gridSize.columns && config.gridSize.rows) {
        console.log('⚠️  WARN: gridSize uses old format (single columns/rows)');
        console.log(`   Grid: ${config.gridSize.columns}×${config.gridSize.rows}`);
        console.log('   This should be migrated to per-orientation format');
        return false;
      } else {
        console.log('❌ FAIL: gridSize has unexpected structure:', config.gridSize);
        return false;
      }
    } else {
      console.log('❌ FAIL: Could not fetch config');
      return false;
    }
  } catch (err) {
    console.log('❌ FAIL: Error:', err.message);
    return false;
  }
}

async function testPortraitGridSize() {
  console.log('\n🧪 Test 2: Verify portrait orientation has finer vertical grid');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config?orientation=portrait');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      const gridSize = config.gridSize?.portrait || config.gridSize;
      
      if (!gridSize) {
        console.log('❌ FAIL: No grid size found');
        return false;
      }
      
      console.log(`   Portrait grid: ${gridSize.columns}×${gridSize.rows}`);
      
      // Check that vertical granularity is finer (more rows than the old 3)
      if (gridSize.rows > 3) {
        console.log(`✅ PASS: Portrait has ${gridSize.rows} rows (finer vertical granularity)`);
        return true;
      } else {
        console.log(`❌ FAIL: Portrait has only ${gridSize.rows} rows (expected > 3 for finer granularity)`);
        return false;
      }
    } else {
      console.log('❌ FAIL: Could not fetch portrait config');
      return false;
    }
  } catch (err) {
    console.log('❌ FAIL: Error:', err.message);
    return false;
  }
}

async function testLandscapeGridSize() {
  console.log('\n🧪 Test 3: Verify landscape orientation has finer horizontal grid');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config?orientation=landscape');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      const gridSize = config.gridSize?.landscape || config.gridSize;
      
      if (!gridSize) {
        console.log('❌ FAIL: No grid size found');
        return false;
      }
      
      console.log(`   Landscape grid: ${gridSize.columns}×${gridSize.rows}`);
      
      // Check that horizontal granularity is finer (more columns than the old 4)
      if (gridSize.columns > 4) {
        console.log(`✅ PASS: Landscape has ${gridSize.columns} columns (finer horizontal granularity)`);
        return true;
      } else {
        console.log(`❌ FAIL: Landscape has only ${gridSize.columns} columns (expected > 4 for finer granularity)`);
        return false;
      }
    } else {
      console.log('❌ FAIL: Could not fetch landscape config');
      return false;
    }
  } catch (err) {
    console.log('❌ FAIL: Error:', err.message);
    return false;
  }
}

async function testWidgetPositionsValid() {
  console.log('\n🧪 Test 4: Verify widget positions are valid for their grid sizes');
  try {
    let allValid = true;
    
    // Test portrait
    const portraitResult = await makeRequest('GET', '/api/smart-mirror/config?orientation=portrait');
    if (portraitResult.statusCode === 200 && portraitResult.body && portraitResult.body.config) {
      const config = portraitResult.body.config;
      const gridSize = config.gridSize?.portrait || config.gridSize;
      const layout = config.layouts?.portrait || {};
      
      console.log('   Checking portrait layout...');
      Object.keys(layout).forEach(widgetName => {
        const pos = layout[widgetName];
        if (pos.x + pos.width > gridSize.columns) {
          console.log(`   ❌ ${widgetName}: position exceeds grid width (${pos.x} + ${pos.width} > ${gridSize.columns})`);
          allValid = false;
        }
        if (pos.y + pos.height > gridSize.rows) {
          console.log(`   ❌ ${widgetName}: position exceeds grid height (${pos.y} + ${pos.height} > ${gridSize.rows})`);
          allValid = false;
        }
      });
    }
    
    // Test landscape
    const landscapeResult = await makeRequest('GET', '/api/smart-mirror/config?orientation=landscape');
    if (landscapeResult.statusCode === 200 && landscapeResult.body && landscapeResult.body.config) {
      const config = landscapeResult.body.config;
      const gridSize = config.gridSize?.landscape || config.gridSize;
      const layout = config.layouts?.landscape || {};
      
      console.log('   Checking landscape layout...');
      Object.keys(layout).forEach(widgetName => {
        const pos = layout[widgetName];
        if (pos.x + pos.width > gridSize.columns) {
          console.log(`   ❌ ${widgetName}: position exceeds grid width (${pos.x} + ${pos.width} > ${gridSize.columns})`);
          allValid = false;
        }
        if (pos.y + pos.height > gridSize.rows) {
          console.log(`   ❌ ${widgetName}: position exceeds grid height (${pos.y} + ${pos.height} > ${gridSize.rows})`);
          allValid = false;
        }
      });
    }
    
    if (allValid) {
      console.log('✅ PASS: All widget positions are valid for their grid sizes');
      return true;
    } else {
      console.log('❌ FAIL: Some widget positions are invalid');
      return false;
    }
  } catch (err) {
    console.log('❌ FAIL: Error:', err.message);
    return false;
  }
}

async function testSmartMirrorHtmlLoads() {
  console.log('\n🧪 Test 5: Verify Smart Mirror dashboard HTML loads');
  try {
    const result = await makeRequest('GET', '/smart-mirror');
    
    if (result.statusCode === 200) {
      console.log('✅ PASS: Smart Mirror dashboard loads successfully');
      return true;
    } else {
      console.log(`❌ FAIL: Smart Mirror dashboard returned status ${result.statusCode}`);
      return false;
    }
  } catch (err) {
    console.log('❌ FAIL: Error:', err.message);
    return false;
  }
}

async function testSmartMirrorLandscapeHtmlLoads() {
  console.log('\n🧪 Test 6: Verify Smart Mirror landscape dashboard HTML loads');
  try {
    const result = await makeRequest('GET', '/smart-mirror-l');
    
    if (result.statusCode === 200) {
      console.log('✅ PASS: Smart Mirror landscape dashboard loads successfully');
      return true;
    } else {
      console.log(`❌ FAIL: Smart Mirror landscape dashboard returned status ${result.statusCode}`);
      return false;
    }
  } catch (err) {
    console.log('❌ FAIL: Error:', err.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('🚀 Starting Grid Granularity Enhancement Tests\n');
  console.log('=' .repeat(60));
  
  const results = [];
  
  results.push(await testGridSizeStructure());
  results.push(await testPortraitGridSize());
  results.push(await testLandscapeGridSize());
  results.push(await testWidgetPositionsValid());
  results.push(await testSmartMirrorHtmlLoads());
  results.push(await testSmartMirrorLandscapeHtmlLoads());
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:');
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`   Passed: ${passed}/${total}`);
  console.log(`   Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    await makeRequest('GET', '/');
    return true;
  } catch (err) {
    console.error('❌ Error: Server is not running at', BASE_URL);
    console.error('   Please start the server with: npm start');
    process.exit(1);
  }
}

// Main execution
(async () => {
  await checkServer();
  await runTests();
})();
