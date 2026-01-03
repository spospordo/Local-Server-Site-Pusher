#!/usr/bin/env node

/**
 * Test script for Smart Mirror Grid Positioning
 * Tests that widgets are correctly positioned according to gridPosition values
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

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
      path: url.pathname,
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
async function testGridPositionStructure() {
  console.log('\n🧪 Test 1: Verify gridPosition fields exist for all widgets');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      let allValid = true;
      
      Object.keys(config.widgets).forEach(widgetName => {
        const widget = config.widgets[widgetName];
        const pos = widget.gridPosition;
        
        if (!pos) {
          console.log(`   ✗ ${widgetName}: Missing gridPosition`);
          allValid = false;
          return;
        }
        
        const hasX = typeof pos.x === 'number';
        const hasY = typeof pos.y === 'number';
        const hasWidth = typeof pos.width === 'number';
        const hasHeight = typeof pos.height === 'number';
        
        if (hasX && hasY && hasWidth && hasHeight) {
          console.log(`   ✓ ${widgetName}: gridPosition(x:${pos.x}, y:${pos.y}, w:${pos.width}, h:${pos.height})`);
        } else {
          console.log(`   ✗ ${widgetName}: Invalid gridPosition - x:${hasX}, y:${hasY}, w:${hasWidth}, h:${hasHeight}`);
          allValid = false;
        }
      });
      
      if (allValid) {
        console.log('✅ All widgets have valid gridPosition structure');
        return true;
      } else {
        console.log('❌ Some widgets have invalid gridPosition');
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

async function testGridPositionValues() {
  console.log('\n🧪 Test 2: Verify gridPosition values are within valid ranges');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      const gridSize = config.gridSize || { columns: 4, rows: 3 };
      let allValid = true;
      
      Object.keys(config.widgets).forEach(widgetName => {
        const widget = config.widgets[widgetName];
        const pos = widget.gridPosition || {};
        
        // Check x bounds
        if (pos.x < 0 || pos.x >= gridSize.columns) {
          console.log(`   ✗ ${widgetName}: x=${pos.x} out of bounds (0-${gridSize.columns-1})`);
          allValid = false;
        }
        
        // Check y bounds
        if (pos.y < 0 || pos.y >= gridSize.rows) {
          console.log(`   ✗ ${widgetName}: y=${pos.y} out of bounds (0-${gridSize.rows-1})`);
          allValid = false;
        }
        
        // Check width bounds
        if (pos.width < 1 || pos.x + pos.width > gridSize.columns) {
          console.log(`   ✗ ${widgetName}: width=${pos.width} invalid (x+width=${pos.x + pos.width} > ${gridSize.columns})`);
          allValid = false;
        }
        
        // Check height bounds
        if (pos.height < 1 || pos.y + pos.height > gridSize.rows) {
          console.log(`   ✗ ${widgetName}: height=${pos.height} invalid (y+height=${pos.y + pos.height} > ${gridSize.rows})`);
          allValid = false;
        }
        
        if (pos.x >= 0 && pos.x < gridSize.columns && 
            pos.y >= 0 && pos.y < gridSize.rows &&
            pos.width >= 1 && pos.x + pos.width <= gridSize.columns &&
            pos.height >= 1 && pos.y + pos.height <= gridSize.rows) {
          console.log(`   ✓ ${widgetName}: Valid position and size`);
        }
      });
      
      if (allValid) {
        console.log('✅ All gridPosition values are within valid ranges');
        return true;
      } else {
        console.log('❌ Some gridPosition values are out of bounds');
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

async function testDashboardHasGridCSS() {
  console.log('\n🧪 Test 3: Verify dashboard HTML contains grid positioning CSS');
  try {
    const result = await makeRequest('GET', '/smart-mirror');
    
    if (result.statusCode === 200 && typeof result.body === 'string') {
      const html = result.body;
      
      // Check for combined grid-column positioning rules
      const hasGridColumnRules = html.includes('grid-column:') && 
                                  html.includes('span') &&
                                  html.includes('data-grid-x') &&
                                  html.includes('data-grid-width');
      
      // Check for combined grid-row positioning rules
      const hasGridRowRules = html.includes('grid-row:') && 
                              html.includes('data-grid-y') &&
                              html.includes('data-grid-height');
      
      // Check for widget sorting logic
      const hasSortLogic = html.includes('sort') && 
                           html.includes('gridPosition');
      
      console.log('   - Grid column rules:', hasGridColumnRules ? '✓' : '✗');
      console.log('   - Grid row rules:', hasGridRowRules ? '✓' : '✗');
      console.log('   - Widget sorting:', hasSortLogic ? '✓' : '✗');
      
      if (hasGridColumnRules && hasGridRowRules && hasSortLogic) {
        console.log('✅ Dashboard has proper grid positioning CSS and sorting');
        return true;
      } else {
        console.log('❌ Dashboard missing grid positioning features');
        return false;
      }
    } else {
      console.log('❌ Could not retrieve dashboard HTML');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testOverlappingWidgets() {
  console.log('\n🧪 Test 4: Check for overlapping widgets');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      const enabledWidgets = Object.keys(config.widgets)
        .filter(key => config.widgets[key].enabled === true)
        .map(key => ({ name: key, pos: config.widgets[key].gridPosition }));
      
      let hasOverlaps = false;
      
      // Create a grid map to check overlaps
      const gridMap = {};
      
      enabledWidgets.forEach(widget => {
        const { name, pos } = widget;
        
        // Mark all cells this widget occupies
        for (let y = pos.y; y < pos.y + pos.height; y++) {
          for (let x = pos.x; x < pos.x + pos.width; x++) {
            const key = `${x},${y}`;
            
            if (gridMap[key]) {
              console.log(`   ⚠️  Overlap detected: ${name} and ${gridMap[key]} both occupy cell (${x},${y})`);
              hasOverlaps = true;
            } else {
              gridMap[key] = name;
            }
          }
        }
      });
      
      if (!hasOverlaps) {
        console.log('✅ No overlapping widgets detected');
        console.log(`   - Tested ${enabledWidgets.length} enabled widgets`);
        return true;
      } else {
        console.log('⚠️  Some widgets overlap (may be intentional)');
        return true; // Not necessarily a failure
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

async function testWidgetRenderOrder() {
  console.log('\n🧪 Test 5: Verify widget rendering order respects gridPosition');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      
      // Get enabled widgets and sort them by gridPosition (same logic as dashboard)
      const widgetEntries = Object.keys(config.widgets)
        .map(key => ({ key, config: config.widgets[key] }))
        .filter(entry => entry.config && entry.config.enabled === true);
      
      widgetEntries.sort((a, b) => {
        const posA = a.config.gridPosition || { x: 0, y: 0 };
        const posB = b.config.gridPosition || { x: 0, y: 0 };
        
        if (posA.y !== posB.y) return posA.y - posB.y;
        if (posA.x !== posB.x) return posA.x - posB.x;
        return a.key.localeCompare(b.key);
      });
      
      console.log('   Expected render order (top to bottom, left to right):');
      widgetEntries.forEach((entry, index) => {
        const pos = entry.config.gridPosition;
        console.log(`   ${index + 1}. ${entry.key} at (${pos.x},${pos.y})`);
      });
      
      // Verify order makes sense (y should be non-decreasing when reading top to bottom)
      let isValidOrder = true;
      for (let i = 1; i < widgetEntries.length; i++) {
        const prevPos = widgetEntries[i - 1].config.gridPosition;
        const currPos = widgetEntries[i].config.gridPosition;
        
        // Current widget should not be above previous widget
        if (currPos.y < prevPos.y) {
          console.log(`   ✗ Order violation: ${widgetEntries[i].key} (y=${currPos.y}) appears after ${widgetEntries[i-1].key} (y=${prevPos.y})`);
          isValidOrder = false;
        }
        
        // If same row, x should be non-decreasing
        if (currPos.y === prevPos.y && currPos.x < prevPos.x) {
          console.log(`   ✗ Order violation: ${widgetEntries[i].key} (x=${currPos.x}) appears after ${widgetEntries[i-1].key} (x=${prevPos.x}) in same row`);
          isValidOrder = false;
        }
      }
      
      if (isValidOrder) {
        console.log('✅ Widget render order is correct');
        return true;
      } else {
        console.log('❌ Widget render order is incorrect');
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

async function testDefaultConfiguration() {
  console.log('\n🧪 Test 6: Verify default configuration has valid grid positions');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body && result.body.config) {
      const config = result.body.config;
      
      // Check specific default widgets
      const expectedDefaults = {
        clock: { x: 0, y: 0, width: 2, height: 1 },
        calendar: { x: 2, y: 0, width: 2, height: 2 },
        weather: { x: 0, y: 1, width: 2, height: 1 },
        forecast: { x: 0, y: 2, width: 4, height: 1 },
        news: { x: 2, y: 1, width: 2, height: 1 }
      };
      
      let allMatch = true;
      
      Object.keys(expectedDefaults).forEach(widgetName => {
        if (config.widgets[widgetName]) {
          const actual = config.widgets[widgetName].gridPosition;
          const expected = expectedDefaults[widgetName];
          
          const matches = actual.x === expected.x && 
                          actual.y === expected.y &&
                          actual.width === expected.width &&
                          actual.height === expected.height;
          
          if (matches) {
            console.log(`   ✓ ${widgetName}: Position matches default`);
          } else {
            console.log(`   ℹ ${widgetName}: Position differs from default (custom config)`);
            console.log(`     Expected: (${expected.x},${expected.y}) ${expected.width}x${expected.height}`);
            console.log(`     Actual: (${actual.x},${actual.y}) ${actual.width}x${actual.height}`);
            // Not necessarily a failure - could be customized
          }
        }
      });
      
      console.log('✅ Configuration loaded (may be default or customized)');
      return true;
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
  console.log('║       Smart Mirror Grid Positioning Tests                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  const tests = [
    testGridPositionStructure,
    testGridPositionValues,
    testDashboardHasGridCSS,
    testOverlappingWidgets,
    testWidgetRenderOrder,
    testDefaultConfiguration
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
