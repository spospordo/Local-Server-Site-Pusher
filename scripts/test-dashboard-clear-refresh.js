#!/usr/bin/env node

/**
 * Test script for Magic Mirror Clear & Refresh Dashboard functionality
 * 
 * Tests:
 * 1. Clear and refresh updates config version
 * 2. Clear and refresh adds lastClearTimestamp
 * 3. Config version is bumped by at least 1000ms
 * 4. Dashboard detects new version and would reload
 * 5. Enabled widgets are preserved after clear
 */

const magicMirror = require('../modules/magicmirror');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
        testsFailed++;
    }
}

function assertEquals(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
    }
}

function assertGreaterThan(actual, expected, message) {
    if (actual <= expected) {
        throw new Error(`${message || 'Assertion failed'}: expected ${actual} to be greater than ${expected}`);
    }
}

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed: expected true');
    }
}

console.log('🧪 Testing Magic Mirror Clear & Refresh Dashboard...\n');

// Test 1: Basic clear and refresh functionality
test('clearAndRefreshDashboard returns success', () => {
    const result = magicMirror.clearAndRefreshDashboard();
    assertTrue(result.success, 'Result should have success: true');
    assertTrue(result.configVersion, 'Result should have configVersion');
    assertTrue(result.clearTimestamp, 'Result should have clearTimestamp');
});

// Test 2: Clear updates config version
test('clearAndRefreshDashboard updates configVersion', () => {
    const configBefore = magicMirror.getConfig();
    const versionBefore = configBefore.configVersion || 0;
    
    // Wait a moment to ensure timestamp difference
    const startTime = Date.now();
    while (Date.now() - startTime < 10); // Wait 10ms
    
    const result = magicMirror.clearAndRefreshDashboard();
    const configAfter = magicMirror.getConfig();
    
    assertGreaterThan(configAfter.configVersion, versionBefore, 
        'Config version should be newer after clear');
});

// Test 3: Config version is bumped by at least 1000ms
test('clearAndRefreshDashboard bumps version by 1000ms+', () => {
    const timestampBefore = Date.now();
    const result = magicMirror.clearAndRefreshDashboard();
    
    // The clear function adds 1000ms to current time to ensure it's seen as newer
    assertGreaterThan(result.configVersion, timestampBefore + 999, 
        'Config version should be at least current time + 1000ms');
});

// Test 4: lastClearTimestamp is set
test('clearAndRefreshDashboard sets lastClearTimestamp', () => {
    const result = magicMirror.clearAndRefreshDashboard();
    const config = magicMirror.getConfig();
    
    assertTrue(config.lastClearTimestamp, 'lastClearTimestamp should be set');
    assertEquals(config.lastClearTimestamp, result.clearTimestamp, 
        'lastClearTimestamp in config should match result');
});

// Test 5: Enabled widgets are preserved
test('clearAndRefreshDashboard preserves widget configuration', () => {
    // Enable some widgets
    const testConfig = {
        enabled: true,
        widgets: {
            clock: { enabled: true, area: 'upper-left', size: 'box' },
            weather: { enabled: true, area: 'upper-center', size: 'box' },
            forecast: { enabled: false, area: 'upper-right', size: 'box' }
        }
    };
    
    magicMirror.updateConfig(testConfig);
    
    // Clear and refresh
    const result = magicMirror.clearAndRefreshDashboard();
    
    // Check widgets are still configured
    const configAfter = magicMirror.getConfig();
    assertTrue(configAfter.widgets.clock.enabled, 'Clock should still be enabled');
    assertTrue(configAfter.widgets.weather.enabled, 'Weather should still be enabled');
    assertTrue(!configAfter.widgets.forecast.enabled, 'Forecast should still be disabled');
});

// Test 6: Dashboard state is "cleared" (new version forces reload)
test('clearAndRefreshDashboard creates new version that triggers reload', () => {
    const config1 = magicMirror.getConfig();
    const version1 = config1.configVersion;
    
    // Simulate some time passing
    const startTime = Date.now();
    while (Date.now() - startTime < 50); // Wait 50ms
    
    // Clear and refresh
    const result = magicMirror.clearAndRefreshDashboard();
    
    const config2 = magicMirror.getConfig();
    const version2 = config2.configVersion;
    
    // New version should be different and newer than before
    assertGreaterThan(version2, version1, 
        'Version should be newer after clear to trigger reload');
    
    // The version should be within reasonable range (current time + 1000ms + some buffer)
    const maxExpectedVersion = Date.now() + 2000; // 2 seconds buffer
    assertTrue(version2 <= maxExpectedVersion, 
        'Version should be reasonable (not too far in future)');
});

// Test 7: Multiple clears in sequence all work
test('clearAndRefreshDashboard works multiple times in sequence', () => {
    const result1 = magicMirror.clearAndRefreshDashboard();
    assertTrue(result1.success, 'First clear should succeed');
    
    const startTime = Date.now();
    while (Date.now() - startTime < 50); // Wait 50ms
    
    const result2 = magicMirror.clearAndRefreshDashboard();
    assertTrue(result2.success, 'Second clear should succeed');
    
    assertGreaterThan(result2.configVersion, result1.configVersion, 
        'Second clear should have newer version than first');
});

// Test 8: Clear preserves Magic Mirror enabled state
test('clearAndRefreshDashboard preserves enabled state', () => {
    // Set enabled to true
    magicMirror.updateConfig({ enabled: true });
    
    const result = magicMirror.clearAndRefreshDashboard();
    const config = magicMirror.getConfig();
    
    assertTrue(config.enabled, 'Magic Mirror should still be enabled after clear');
});

// Test 9: Clear preserves widget settings (area, size)
test('clearAndRefreshDashboard preserves widget area and size', () => {
    const testConfig = {
        widgets: {
            news: { 
                enabled: true, 
                area: 'bottom-left', 
                size: 'bar',
                gridPosition: { col: 1, row: 5, colSpan: 12, rowSpan: 2 }
            }
        }
    };
    
    magicMirror.updateConfig(testConfig);
    magicMirror.clearAndRefreshDashboard();
    
    const config = magicMirror.getConfig();
    assertEquals(config.widgets.news.area, 'bottom-left', 'News area should be preserved');
    assertEquals(config.widgets.news.size, 'bar', 'News size should be preserved');
    assertTrue(config.widgets.news.gridPosition, 'News grid position should be preserved');
});

// Test 10: Clear preserves weather API settings
test('clearAndRefreshDashboard preserves weather settings', () => {
    const testConfig = {
        weather: {
            location: 'Test City',
            apiKey: 'test-api-key-12345'
        }
    };
    
    magicMirror.updateConfig(testConfig);
    magicMirror.clearAndRefreshDashboard();
    
    const config = magicMirror.getFullConfig(); // Use getFullConfig to get API key
    assertEquals(config.weather.location, 'Test City', 'Weather location should be preserved');
    assertEquals(config.weather.apiKey, 'test-api-key-12345', 'Weather API key should be preserved');
});

// Summary
console.log('\n' + '='.repeat(60));
console.log(`Tests passed: ${testsPassed}/${testsPassed + testsFailed}`);
console.log(`Tests failed: ${testsFailed}/${testsPassed + testsFailed}`);
console.log('='.repeat(60));

if (testsFailed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}
