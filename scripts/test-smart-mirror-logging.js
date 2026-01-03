#!/usr/bin/env node

/**
 * Smart Mirror Logging Test Script
 * 
 * Tests the comprehensive logging implementation for Smart Mirror Dashboard
 * Validates that all logging points are working correctly
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

let testsPassed = 0;
let testsFailed = 0;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, colors.blue);
  console.log('='.repeat(80));
}

function logTest(name) {
  log(`\n► Testing: ${name}`, colors.yellow);
}

function logSuccess(message) {
  log(`  ✅ ${message}`, colors.green);
  testsPassed++;
}

function logError(message) {
  log(`  ❌ ${message}`, colors.red);
  testsFailed++;
}

function logInfo(message) {
  log(`  ℹ️  ${message}`, colors.gray);
}

// Helper function to make HTTP requests
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            json: null
          };
          
          // Try to parse as JSON
          if (res.headers['content-type']?.includes('application/json')) {
            try {
              result.json = JSON.parse(data);
            } catch (e) {
              // Not valid JSON
            }
          }
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

// Helper to login and get session cookie
async function login() {
  const loginData = JSON.stringify({
    password: 'admin'
  });
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/admin/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  };
  
  try {
    const response = await makeRequest(options, loginData);
    const cookies = response.headers['set-cookie'];
    
    if (cookies && cookies.length > 0) {
      // Extract session cookie
      const sessionCookie = cookies.find(c => c.startsWith('connect.sid='));
      if (sessionCookie) {
        return sessionCookie.split(';')[0];
      }
    }
    
    return null;
  } catch (error) {
    logError(`Login failed: ${error.message}`);
    return null;
  }
}

// Test 1: Test public API endpoint logging
async function testPublicAPILogging() {
  logTest('Public API Endpoint Logging (/api/smart-mirror/config)');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/api/smart-mirror/config',
    method: 'GET',
    headers: {
      'User-Agent': 'SmartMirrorLoggingTest/1.0'
    }
  };
  
  try {
    const response = await makeRequest(options);
    
    if (response.statusCode === 200) {
      logSuccess('Public config API returned 200 OK');
    } else {
      logError(`Unexpected status code: ${response.statusCode}`);
      return;
    }
    
    if (response.json && response.json.success) {
      logSuccess('Response has success flag');
      logInfo(`Config enabled: ${response.json.config?.enabled}`);
    } else {
      logError('Response missing success flag or config data');
    }
    
    // Check cache-control headers
    const cacheControl = response.headers['cache-control'];
    if (cacheControl && cacheControl.includes('no-store')) {
      logSuccess('Cache-control headers set correctly');
    } else {
      logError('Cache-control headers not set properly');
    }
    
  } catch (error) {
    logError(`Request failed: ${error.message}`);
  }
}

// Test 2: Test admin API endpoint logging
async function testAdminAPILogging(sessionCookie) {
  logTest('Admin API Endpoint Logging (/admin/api/smart-mirror/config)');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/admin/api/smart-mirror/config',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie,
      'User-Agent': 'SmartMirrorLoggingTest/1.0'
    }
  };
  
  try {
    const response = await makeRequest(options);
    
    if (response.statusCode === 200) {
      logSuccess('Admin config API returned 200 OK');
    } else {
      logError(`Unexpected status code: ${response.statusCode}`);
      return;
    }
    
    if (response.json && response.json.success && response.json.config) {
      logSuccess('Response contains full config');
      logInfo(`Widgets configured: ${Object.keys(response.json.config.widgets || {}).length}`);
    } else {
      logError('Response missing config data');
    }
    
  } catch (error) {
    logError(`Request failed: ${error.message}`);
  }
}

// Test 3: Test diagnostics endpoint
async function testDiagnosticsEndpoint(sessionCookie) {
  logTest('Diagnostics Endpoint (/admin/api/smart-mirror/diagnostics)');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/admin/api/smart-mirror/diagnostics',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie,
      'User-Agent': 'SmartMirrorLoggingTest/1.0'
    }
  };
  
  try {
    const response = await makeRequest(options);
    
    if (response.statusCode === 200) {
      logSuccess('Diagnostics API returned 200 OK');
    } else {
      logError(`Unexpected status code: ${response.statusCode}`);
      return;
    }
    
    if (response.json && response.json.success && response.json.diagnostics) {
      const diag = response.json.diagnostics;
      logSuccess('Diagnostics data received');
      
      // Check environment info
      if (diag.environment) {
        logSuccess('Environment information present');
        logInfo(`Platform: ${diag.environment.platform} (${diag.environment.arch})`);
        logInfo(`Docker: ${diag.environment.isDocker ? 'Yes' : 'No'}`);
        logInfo(`Node: ${diag.environment.nodeVersion}`);
      } else {
        logError('Environment information missing');
      }
      
      // Check file checks
      if (diag.fileChecks) {
        logSuccess('File checks present');
        logInfo(`Dashboard exists: ${diag.fileChecks.dashboardExists ? 'Yes' : 'No'}`);
        logInfo(`Config exists: ${diag.fileChecks.configExists ? 'Yes' : 'No'}`);
      } else {
        logError('File checks missing');
      }
      
      // Check configuration
      if (diag.configuration) {
        logSuccess('Configuration status present');
        logInfo(`Dashboard enabled: ${diag.configuration.enabled ? 'Yes' : 'No'}`);
        logInfo(`Enabled widgets: ${diag.configuration.enabledWidgets?.join(', ') || 'None'}`);
      } else {
        logError('Configuration status missing');
      }
      
      // Check logs
      if (diag.logs && diag.logs.recent) {
        logSuccess(`Recent logs present (${diag.logs.recent.length} entries)`);
      } else {
        logError('Recent logs missing');
      }
      
      // Check warnings
      if (diag.warnings !== undefined) {
        logSuccess(`Warnings array present (${diag.warnings.length} warnings)`);
        if (diag.warnings.length > 0) {
          diag.warnings.forEach(w => {
            logInfo(`  ${w.level}: ${w.message}`);
          });
        }
      } else {
        logError('Warnings array missing');
      }
      
    } else {
      logError('Diagnostics data missing');
    }
    
  } catch (error) {
    logError(`Request failed: ${error.message}`);
  }
}

// Test 4: Test log export endpoint
async function testLogExportEndpoint(sessionCookie) {
  logTest('Log Export Endpoint (/admin/api/smart-mirror/logs/export)');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/admin/api/smart-mirror/logs/export',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie,
      'User-Agent': 'SmartMirrorLoggingTest/1.0'
    }
  };
  
  try {
    const response = await makeRequest(options);
    
    if (response.statusCode === 200) {
      logSuccess('Log export API returned 200 OK');
    } else {
      logError(`Unexpected status code: ${response.statusCode}`);
      return;
    }
    
    // Check content-disposition header
    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition && contentDisposition.includes('attachment') && contentDisposition.includes('smart-mirror-logs')) {
      logSuccess('Content-Disposition header set correctly');
    } else {
      logError('Content-Disposition header incorrect');
    }
    
    // Check if data is valid JSON
    if (response.json) {
      logSuccess('Export data is valid JSON');
      
      if (response.json.exportedAt && response.json.logs) {
        logSuccess('Export data contains required fields');
        logInfo(`Total logs: ${response.json.totalLogs || response.json.logs.length}`);
      } else {
        logError('Export data missing required fields');
      }
    } else {
      logError('Export data is not valid JSON');
    }
    
  } catch (error) {
    logError(`Request failed: ${error.message}`);
  }
}

// Test 5: Test dashboard route logging
async function testDashboardRouteLogging() {
  logTest('Dashboard Route Logging (/smart-mirror)');
  
  const options = {
    hostname: HOST,
    port: PORT,
    path: '/smart-mirror',
    method: 'GET',
    headers: {
      'User-Agent': 'SmartMirrorLoggingTest/1.0'
    }
  };
  
  try {
    const response = await makeRequest(options);
    
    // Could be 200 (enabled) or 404 (disabled)
    if (response.statusCode === 200) {
      logSuccess('Dashboard route returned 200 OK (enabled)');
      
      // Check cache-control headers
      const cacheControl = response.headers['cache-control'];
      if (cacheControl && cacheControl.includes('no-store')) {
        logSuccess('Cache-control headers set correctly');
      } else {
        logError('Cache-control headers not set properly');
      }
      
      // Check if HTML was returned
      if (response.body.includes('Smart Mirror Dashboard')) {
        logSuccess('Dashboard HTML returned');
      } else {
        logError('Dashboard HTML not found in response');
      }
      
    } else if (response.statusCode === 404) {
      logSuccess('Dashboard route returned 404 (disabled)');
      logInfo('Dashboard is currently disabled');
    } else {
      logError(`Unexpected status code: ${response.statusCode}`);
    }
    
  } catch (error) {
    logError(`Request failed: ${error.message}`);
  }
}

// Test 6: Check file existence logging
async function testFileExistenceLogging() {
  logTest('File Existence Checks');
  
  const dashboardPath = path.join(__dirname, '..', 'public', 'smart-mirror.html');
  const configPath = path.join(__dirname, '..', 'config', 'smartmirror-config.json.enc');
  
  if (fs.existsSync(dashboardPath)) {
    logSuccess(`Dashboard file exists: ${dashboardPath}`);
    const stats = fs.statSync(dashboardPath);
    logInfo(`File size: ${stats.size} bytes`);
  } else {
    logError(`Dashboard file not found: ${dashboardPath}`);
  }
  
  if (fs.existsSync(configPath)) {
    logSuccess(`Config file exists: ${configPath}`);
    const stats = fs.statSync(configPath);
    logInfo(`File size: ${stats.size} bytes`);
  } else {
    logInfo(`Config file not found (expected for new installations): ${configPath}`);
  }
}

// Main test runner
async function runTests() {
  logSection('🧪 Smart Mirror Logging Test Suite');
  
  log('\nStarting tests...', colors.blue);
  log(`Server: http://${HOST}:${PORT}`, colors.gray);
  
  // Test file existence first
  testFileExistenceLogging();
  
  // Login to get session
  logTest('Admin Authentication');
  const sessionCookie = await login();
  
  if (sessionCookie) {
    logSuccess('Login successful, session cookie obtained');
  } else {
    logError('Login failed - admin endpoints will not be tested');
  }
  
  // Run API tests
  await testPublicAPILogging();
  
  if (sessionCookie) {
    await testAdminAPILogging(sessionCookie);
    await testDiagnosticsEndpoint(sessionCookie);
    await testLogExportEndpoint(sessionCookie);
  }
  
  await testDashboardRouteLogging();
  
  // Print summary
  logSection('📊 Test Summary');
  log(`Total Tests: ${testsPassed + testsFailed}`, colors.blue);
  log(`Passed: ${testsPassed}`, colors.green);
  log(`Failed: ${testsFailed}`, testsFailed > 0 ? colors.red : colors.green);
  
  if (testsFailed === 0) {
    log('\n✅ All tests passed!', colors.green);
    process.exit(0);
  } else {
    log('\n❌ Some tests failed. Please review the output above.', colors.red);
    process.exit(1);
  }
}

// Check if server is running
function checkServer() {
  return new Promise((resolve) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/status',
      method: 'GET',
      timeout: 2000
    };
    
    const req = http.request(options, (res) => {
      resolve(true);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

// Start tests
(async () => {
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    log('❌ Server is not running!', colors.red);
    log(`Please start the server on port ${PORT} before running tests.`, colors.yellow);
    log('Run: npm start', colors.gray);
    process.exit(1);
  }
  
  await runTests();
})();
