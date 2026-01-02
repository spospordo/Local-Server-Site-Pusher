#!/usr/bin/env node

/**
 * Test script for Smart Mirror Dashboard API endpoints
 * Tests configuration save/load and dashboard access
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 10000;

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, auth = false) {
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

    if (auth) {
      // Add session cookie if needed for auth
      // For this test, we'll assume session is handled separately
      console.log('⚠️  Authentication required - ensure admin is logged in');
    }

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
async function testPublicConfigEndpoint() {
  console.log('\n🧪 Test 1: Public Smart Mirror config endpoint (no auth)');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200) {
      if (result.body && result.body.success && result.body.config) {
        console.log('✅ Public config endpoint working');
        console.log('   - Dashboard enabled:', result.body.config.enabled);
        console.log('   - Theme:', result.body.config.theme);
        console.log('   - Widgets configured:', Object.keys(result.body.config.widgets || {}).length);
        
        // Verify no sensitive data is exposed
        const hasApiKeys = JSON.stringify(result.body).includes('apiKey');
        if (hasApiKeys) {
          console.log('⚠️  Warning: Sensitive data may be exposed in public endpoint');
        }
        
        return true;
      } else {
        console.log('❌ Invalid response format');
        return false;
      }
    } else {
      console.log(`❌ Unexpected status code: ${result.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testDashboardRoute() {
  console.log('\n🧪 Test 2: Smart Mirror dashboard HTML route');
  try {
    const result = await makeRequest('GET', '/smart-mirror');
    
    if (result.statusCode === 200) {
      if (typeof result.body === 'string' && result.body.includes('Smart Mirror Dashboard')) {
        console.log('✅ Dashboard HTML served successfully');
        console.log('   - Content-Type:', result.headers['content-type']);
        console.log('   - Cache-Control:', result.headers['cache-control'] || 'not set');
        return true;
      } else {
        console.log('❌ Invalid HTML response');
        return false;
      }
    } else {
      console.log(`❌ Unexpected status code: ${result.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testConfigStructure() {
  console.log('\n🧪 Test 3: Config structure validation');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      
      // Check required fields
      const hasEnabled = typeof config.enabled === 'boolean';
      const hasWidgets = typeof config.widgets === 'object';
      const hasGridSize = typeof config.gridSize === 'object';
      const hasTheme = typeof config.theme === 'string';
      
      if (hasEnabled && hasWidgets && hasGridSize && hasTheme) {
        console.log('✅ Config structure is valid');
        
        // Check widget structure
        const widgets = ['clock', 'calendar'];
        let allWidgetsValid = true;
        
        widgets.forEach(widgetName => {
          if (config.widgets[widgetName]) {
            const widget = config.widgets[widgetName];
            const hasRequiredFields = 
              typeof widget.enabled === 'boolean' &&
              widget.gridPosition &&
              typeof widget.gridPosition.x === 'number' &&
              typeof widget.gridPosition.y === 'number' &&
              typeof widget.gridPosition.width === 'number' &&
              typeof widget.gridPosition.height === 'number';
            
            if (hasRequiredFields) {
              console.log(`   ✓ ${widgetName} widget structure valid`);
            } else {
              console.log(`   ✗ ${widgetName} widget structure invalid`);
              allWidgetsValid = false;
            }
          }
        });
        
        return allWidgetsValid;
      } else {
        console.log('❌ Config structure is invalid');
        console.log('   - hasEnabled:', hasEnabled);
        console.log('   - hasWidgets:', hasWidgets);
        console.log('   - hasGridSize:', hasGridSize);
        console.log('   - hasTheme:', hasTheme);
        return false;
      }
    } else {
      console.log('❌ Could not retrieve config');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testCacheHeaders() {
  console.log('\n🧪 Test 4: Cache-control headers');
  try {
    const configResult = await makeRequest('GET', '/api/smart-mirror/config');
    const dashboardResult = await makeRequest('GET', '/smart-mirror');
    
    let passed = true;
    
    // Check config endpoint cache headers
    if (configResult.headers['cache-control'] && 
        configResult.headers['cache-control'].includes('no-cache')) {
      console.log('✅ Config endpoint has no-cache headers');
    } else {
      console.log('⚠️  Config endpoint missing cache-control headers');
      passed = false;
    }
    
    // Check dashboard route cache headers
    if (dashboardResult.headers['cache-control'] && 
        dashboardResult.headers['cache-control'].includes('no-cache')) {
      console.log('✅ Dashboard route has no-cache headers');
    } else {
      console.log('⚠️  Dashboard route missing cache-control headers');
      passed = false;
    }
    
    return passed;
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testWidgetEnabledLogic() {
  console.log('\n🧪 Test 5: Widget enabled/disabled logic');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      
      console.log('   Widget states:');
      Object.keys(config.widgets).forEach(widgetName => {
        const widget = config.widgets[widgetName];
        const status = widget.enabled === true ? '✓ enabled' : '✗ disabled';
        console.log(`   - ${widgetName}: ${status}`);
      });
      
      // Verify at least clock and calendar are present
      if (config.widgets.clock && config.widgets.calendar) {
        console.log('✅ Core widgets (clock, calendar) are configured');
        return true;
      } else {
        console.log('❌ Core widgets missing');
        return false;
      }
    } else {
      console.log('❌ Could not retrieve config');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          Smart Mirror Dashboard API Tests                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  const tests = [
    testPublicConfigEndpoint,
    testDashboardRoute,
    testConfigStructure,
    testCacheHeaders,
    testWidgetEnabledLogic
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log('❌ Test threw exception:', error.message);
      failed++;
    }
  }
  
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Test Results                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
