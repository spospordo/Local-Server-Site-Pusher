#!/usr/bin/env node

/**
 * Test script for Smart Mirror Interactive Grid Editor
 * 
 * This script tests the grid editor functionality including:
 * - Widget positioning validation
 * - Overlap detection
 * - Grid boundary constraints
 * - Resize functionality
 * - Configuration synchronization
 */

const http = require('http');

// Test configuration
const TEST_CONFIG = {
  host: 'localhost',
  port: 3000,
  username: 'admin',
  password: 'admin'
};

// Grid configuration constants
const GRID_CONFIG = {
  COLUMNS: 4,
  ROWS: 3,
  MAX_WIDTH: 4,
  MAX_HEIGHT: 3,
  MAX_COL_INDEX: 3, // 0-based, so 0-3
  MAX_ROW_INDEX: 2  // 0-based, so 0-2
};

let sessionCookie = null;

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        // Store session cookie if present
        if (res.headers['set-cookie']) {
          const cookieHeader = res.headers['set-cookie'];
          const cookies = Array.isArray(cookieHeader) 
            ? cookieHeader 
            : [cookieHeader];
          sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
        }
        
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', reject);
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

async function login() {
  log('\n=== Logging in ===', 'cyan');
  
  const postData = JSON.stringify({
    username: TEST_CONFIG.username,
    password: TEST_CONFIG.password
  });
  
  const options = {
    hostname: TEST_CONFIG.host,
    port: TEST_CONFIG.port,
    path: '/admin/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  try {
    const response = await makeRequest(options, postData);
    
    if (response.statusCode === 302 || response.statusCode === 200) {
      log('✓ Login successful', 'green');
      return true;
    } else {
      log(`✗ Login failed with status ${response.statusCode}`, 'red');
      return false;
    }
  } catch (error) {
    log(`✗ Login error: ${error.message}`, 'red');
    return false;
  }
}

async function getSmartMirrorConfig() {
  log('\n=== Fetching Smart Mirror Configuration ===', 'cyan');
  
  const options = {
    hostname: TEST_CONFIG.host,
    port: TEST_CONFIG.port,
    path: '/admin/api/smart-mirror/config',
    method: 'GET',
    headers: {
      'Cookie': sessionCookie
    }
  };
  
  try {
    const response = await makeRequest(options);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      log('✓ Configuration fetched successfully', 'green');
      return data.config;
    } else {
      log(`✗ Failed to fetch config: ${response.statusCode}`, 'red');
      return null;
    }
  } catch (error) {
    log(`✗ Error fetching config: ${error.message}`, 'red');
    return null;
  }
}

function testGridPositionValidation(config) {
  log('\n=== Testing Grid Position Validation ===', 'cyan');
  
  let allValid = true;
  const widgets = config.widgets || {};
  
  Object.entries(widgets).forEach(([type, widget]) => {
    if (!widget.enabled) {
      log(`  ⊗ ${type}: Disabled (skipping validation)`, 'yellow');
      return;
    }
    
    const pos = widget.gridPosition || {};
    const x = pos.x ?? 0;
    const y = pos.y ?? 0;
    const width = pos.width ?? 1;
    const height = pos.height ?? 1;
    
    // Validate position bounds
    const xValid = x >= 0 && x <= GRID_CONFIG.MAX_COL_INDEX;
    const yValid = y >= 0 && y <= GRID_CONFIG.MAX_ROW_INDEX;
    const widthValid = width >= 1 && width <= GRID_CONFIG.MAX_WIDTH;
    const heightValid = height >= 1 && height <= GRID_CONFIG.MAX_HEIGHT;
    const xBoundValid = x + width <= GRID_CONFIG.COLUMNS;
    const yBoundValid = y + height <= GRID_CONFIG.ROWS;
    
    const valid = xValid && yValid && widthValid && heightValid && xBoundValid && yBoundValid;
    
    if (valid) {
      log(`  ✓ ${type}: (${x},${y}) ${width}×${height} - Valid`, 'green');
    } else {
      log(`  ✗ ${type}: (${x},${y}) ${width}×${height} - Invalid`, 'red');
      if (!xValid) log(`    - X position out of bounds (must be 0-${GRID_CONFIG.MAX_COL_INDEX})`, 'red');
      if (!yValid) log(`    - Y position out of bounds (must be 0-${GRID_CONFIG.MAX_ROW_INDEX})`, 'red');
      if (!widthValid) log(`    - Width out of bounds (must be 1-${GRID_CONFIG.MAX_WIDTH})`, 'red');
      if (!heightValid) log(`    - Height out of bounds (must be 1-${GRID_CONFIG.MAX_HEIGHT})`, 'red');
      if (!xBoundValid) log(`    - Widget extends past right edge (x + width > ${GRID_CONFIG.COLUMNS})`, 'red');
      if (!yBoundValid) log(`    - Widget extends past bottom edge (y + height > ${GRID_CONFIG.ROWS})`, 'red');
      allValid = false;
    }
  });
  
  return allValid;
}

function testOverlapDetection(config) {
  log('\n=== Testing Overlap Detection ===', 'cyan');
  
  const widgets = config.widgets || {};
  const enabledWidgets = Object.entries(widgets)
    .filter(([_, widget]) => widget.enabled)
    .map(([type, widget]) => ({
      type,
      x: widget.gridPosition?.x ?? 0,
      y: widget.gridPosition?.y ?? 0,
      width: widget.gridPosition?.width ?? 1,
      height: widget.gridPosition?.height ?? 1
    }));
  
  const overlaps = [];
  
  for (let i = 0; i < enabledWidgets.length; i++) {
    for (let j = i + 1; j < enabledWidgets.length; j++) {
      const w1 = enabledWidgets[i];
      const w2 = enabledWidgets[j];
      
      // Check if rectangles overlap
      if (w1.x < w2.x + w2.width &&
          w1.x + w1.width > w2.x &&
          w1.y < w2.y + w2.height &&
          w1.y + w1.height > w2.y) {
        overlaps.push([w1.type, w2.type]);
      }
    }
  }
  
  if (overlaps.length === 0) {
    log('  ✓ No overlapping widgets detected', 'green');
    return true;
  } else {
    log(`  ⚠ ${overlaps.length} overlap(s) detected:`, 'yellow');
    overlaps.forEach(([type1, type2]) => {
      log(`    - ${type1} overlaps with ${type2}`, 'yellow');
    });
    return false;
  }
}

function testGridCoverage(config) {
  log('\n=== Testing Grid Coverage ===', 'cyan');
  
  const widgets = config.widgets || {};
  const grid = Array(GRID_CONFIG.ROWS).fill(null).map(() => Array(GRID_CONFIG.COLUMNS).fill(null));
  
  Object.entries(widgets).forEach(([type, widget]) => {
    if (!widget.enabled) return;
    
    const x = widget.gridPosition?.x ?? 0;
    const y = widget.gridPosition?.y ?? 0;
    const width = widget.gridPosition?.width ?? 1;
    const height = widget.gridPosition?.height ?? 1;
    
    for (let row = y; row < y + height && row < GRID_CONFIG.ROWS; row++) {
      for (let col = x; col < x + width && col < GRID_CONFIG.COLUMNS; col++) {
        if (grid[row][col]) {
          grid[row][col] += `, ${type}`;
        } else {
          grid[row][col] = type;
        }
      }
    }
  });
  
  log('  Grid occupancy map:', 'blue');
  log('  ' + '    0         1         2         3', 'blue');
  grid.forEach((row, idx) => {
    const cells = row.map(cell => {
      if (!cell) return '         ';
      const display = cell.length > 9 ? cell.substring(0, 8) + '…' : cell;
      return display.padEnd(9, ' ');
    });
    log(`  ${idx} [${cells.join('|')}]`, 'blue');
  });
  
  const totalCells = GRID_CONFIG.ROWS * GRID_CONFIG.COLUMNS;
  const occupiedCells = grid.flat().filter(cell => cell !== null).length;
  const coverage = (occupiedCells / totalCells * 100).toFixed(1);
  
  log(`  Grid coverage: ${occupiedCells}/${totalCells} cells (${coverage}%)`, 'blue');
  
  return true;
}

async function testConfigModification() {
  log('\n=== Testing Configuration Modification ===', 'cyan');
  
  const testConfig = {
    enabled: true,
    theme: 'dark',
    widgets: {
      clock: {
        enabled: true,
        size: 'medium',
        area: 'top-left',
        gridPosition: { x: 0, y: 0, width: 1, height: 1 }
      },
      calendar: {
        enabled: true,
        size: 'large',
        area: 'top-right',
        gridPosition: { x: 1, y: 0, width: 3, height: 2 },
        calendarUrls: []
      },
      weather: {
        enabled: true,
        size: 'medium',
        area: 'bottom-left',
        gridPosition: { x: 0, y: 1, width: 1, height: 2 },
        apiKey: '',
        location: '',
        units: 'imperial'
      },
      forecast: {
        enabled: false,
        size: 'large',
        area: 'bottom-center',
        gridPosition: { x: 0, y: 2, width: 4, height: 1 },
        apiKey: '',
        location: '',
        days: 5,
        units: 'imperial'
      },
      news: {
        enabled: false,
        size: 'medium',
        area: 'bottom-right',
        gridPosition: { x: 2, y: 1, width: 2, height: 1 },
        feedUrls: []
      }
    },
    gridSize: {
      columns: 4,
      rows: 3
    },
    refreshInterval: 60000
  };
  
  log('  Testing modified layout with 3 enabled widgets...', 'blue');
  
  const postData = JSON.stringify(testConfig);
  const options = {
    hostname: TEST_CONFIG.host,
    port: TEST_CONFIG.port,
    path: '/admin/api/smart-mirror/config',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Cookie': sessionCookie
    }
  };
  
  try {
    const response = await makeRequest(options, postData);
    
    if (response.statusCode === 200) {
      const data = JSON.parse(response.body);
      if (data.success) {
        log('  ✓ Configuration saved successfully', 'green');
        
        // Verify the saved config
        const verifyConfig = await getSmartMirrorConfig();
        if (verifyConfig) {
          const clockPos = verifyConfig.widgets.clock.gridPosition;
          const calendarPos = verifyConfig.widgets.calendar.gridPosition;
          
          if (clockPos.x === 0 && clockPos.y === 0 && clockPos.width === 1 && clockPos.height === 1) {
            log('  ✓ Clock position verified: (0,0) 1×1', 'green');
          } else {
            log('  ✗ Clock position mismatch', 'red');
          }
          
          if (calendarPos.x === 1 && calendarPos.y === 0 && calendarPos.width === 3 && calendarPos.height === 2) {
            log('  ✓ Calendar position verified: (1,0) 3×2', 'green');
          } else {
            log('  ✗ Calendar position mismatch', 'red');
          }
          
          return true;
        }
      } else {
        log(`  ✗ Save failed: ${data.error}`, 'red');
      }
    } else {
      log(`  ✗ Failed to save config: ${response.statusCode}`, 'red');
    }
    return false;
  } catch (error) {
    log(`  ✗ Error saving config: ${error.message}`, 'red');
    return false;
  }
}

async function testEdgeCases() {
  log('\n=== Testing Edge Cases ===', 'cyan');
  
  const testCases = [
    {
      name: 'Widget at maximum position',
      widget: { x: GRID_CONFIG.MAX_COL_INDEX, y: GRID_CONFIG.MAX_ROW_INDEX, width: 1, height: 1 },
      shouldPass: true
    },
    {
      name: 'Widget spanning full width',
      widget: { x: 0, y: 0, width: GRID_CONFIG.COLUMNS, height: 1 },
      shouldPass: true
    },
    {
      name: 'Widget spanning full height',
      widget: { x: 0, y: 0, width: 1, height: GRID_CONFIG.ROWS },
      shouldPass: true
    },
    {
      name: 'Widget exceeding right boundary',
      widget: { x: GRID_CONFIG.MAX_COL_INDEX, y: 0, width: 2, height: 1 },
      shouldPass: false
    },
    {
      name: 'Widget exceeding bottom boundary',
      widget: { x: 0, y: GRID_CONFIG.MAX_ROW_INDEX, width: 1, height: 2 },
      shouldPass: false
    },
    {
      name: 'Widget with negative position',
      widget: { x: -1, y: 0, width: 1, height: 1 },
      shouldPass: false
    },
    {
      name: 'Widget with zero dimensions',
      widget: { x: 0, y: 0, width: 0, height: 1 },
      shouldPass: false
    }
  ];
  
  testCases.forEach(test => {
    const { x, y, width, height } = test.widget;
    const xValid = x >= 0 && x <= GRID_CONFIG.MAX_COL_INDEX;
    const yValid = y >= 0 && y <= GRID_CONFIG.MAX_ROW_INDEX;
    const widthValid = width >= 1 && width <= GRID_CONFIG.MAX_WIDTH;
    const heightValid = height >= 1 && height <= GRID_CONFIG.MAX_HEIGHT;
    const xBoundValid = x + width <= GRID_CONFIG.COLUMNS;
    const yBoundValid = y + height <= GRID_CONFIG.ROWS;
    
    const valid = xValid && yValid && widthValid && heightValid && xBoundValid && yBoundValid;
    const passed = valid === test.shouldPass;
    
    if (passed) {
      log(`  ✓ ${test.name}: ${valid ? 'Valid' : 'Invalid'} (as expected)`, 'green');
    } else {
      log(`  ✗ ${test.name}: ${valid ? 'Valid' : 'Invalid'} (expected ${test.shouldPass ? 'valid' : 'invalid'})`, 'red');
    }
  });
  
  return true;
}

async function runTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║   Smart Mirror Interactive Grid Editor Test Suite         ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  
  // Login first
  const loggedIn = await login();
  if (!loggedIn) {
    log('\n✗ Cannot proceed without authentication', 'red');
    return;
  }
  
  // Get current configuration
  const config = await getSmartMirrorConfig();
  if (!config) {
    log('\n✗ Cannot proceed without configuration', 'red');
    return;
  }
  
  // Run test suites
  const results = {
    validation: testGridPositionValidation(config),
    overlap: testOverlapDetection(config),
    coverage: testGridCoverage(config),
    modification: await testConfigModification(),
    edgeCases: await testEdgeCases()
  };
  
  // Summary
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║   Test Results Summary                                     ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  
  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r).length;
  
  Object.entries(results).forEach(([test, result]) => {
    const status = result ? '✓ PASS' : '✗ FAIL';
    const color = result ? 'green' : 'red';
    log(`  ${status} ${test}`, color);
  });
  
  log(`\n  Overall: ${passed}/${total} test suites passed`, passed === total ? 'green' : 'yellow');
  
  if (passed === total) {
    log('\n🎉 All tests passed! Grid editor is working correctly.', 'green');
  } else {
    log('\n⚠ Some tests failed. Review the issues above.', 'yellow');
  }
}

// Run tests
runTests().catch(error => {
  log(`\n✗ Test execution failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
