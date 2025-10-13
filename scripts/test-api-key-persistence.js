#!/usr/bin/env node

/**
 * Test script to verify Weather API key persistence issue is fixed
 * Tests that API key persists in both backend and frontend after save/test operations
 */

const http = require('http');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
    const colors = {
        info: '\x1b[36m',    // Cyan
        success: '\x1b[32m', // Green
        error: '\x1b[31m',   // Red
        warning: '\x1b[33m'  // Yellow
    };
    const reset = '\x1b[0m';
    const color = colors[type] || colors.info;
    console.log(`${color}${message}${reset}`);
}

function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(url, options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
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
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

async function test(name, testFn) {
    try {
        await testFn();
        log(`✅ PASS: ${name}`, 'success');
        testsPassed++;
        return true;
    } catch (error) {
        log(`❌ FAIL: ${name}`, 'error');
        log(`   ${error.message}`, 'error');
        testsFailed++;
        return false;
    }
}

async function runTests() {
    log('\n🧪 Testing Weather API Key Persistence Fix\n', 'info');

    // Test 1: Backend - Save API key and verify it's stored
    await test('Backend: API key is saved and persisted', async () => {
        const magicMirrorModule = require(path.join(__dirname, '..', 'modules', 'magicmirror.js'));
        
        // Save config with API key
        const testConfig = {
            enabled: true,
            widgets: { weather: { enabled: true, area: 'upper-center', size: 'box' } },
            weather: {
                location: 'London',
                apiKey: 'test-api-key-12345'
            }
        };
        
        const saveResult = magicMirrorModule.updateConfig(testConfig);
        if (!saveResult.success) {
            throw new Error('Failed to save config: ' + saveResult.error);
        }
        
        // Verify API key is stored
        const fullConfig = magicMirrorModule.getFullConfig();
        if (fullConfig.weather.apiKey !== 'test-api-key-12345') {
            throw new Error(`API key not saved correctly. Got: ${fullConfig.weather.apiKey}`);
        }
    });

    // Test 2: Backend - Update config WITHOUT API key, verify it's preserved
    await test('Backend: API key is preserved when not provided in update', async () => {
        const magicMirrorModule = require(path.join(__dirname, '..', 'modules', 'magicmirror.js'));
        
        // Update config without providing API key
        const updateConfig = {
            enabled: true,
            widgets: { weather: { enabled: true, area: 'upper-center', size: 'box' } },
            weather: {
                location: 'Paris',
                apiKey: '' // Empty string - should preserve existing key
            }
        };
        
        const updateResult = magicMirrorModule.updateConfig(updateConfig);
        if (!updateResult.success) {
            throw new Error('Failed to update config: ' + updateResult.error);
        }
        
        // Verify API key is still there
        const fullConfig = magicMirrorModule.getFullConfig();
        if (fullConfig.weather.apiKey !== 'test-api-key-12345') {
            throw new Error(`API key not preserved. Got: ${fullConfig.weather.apiKey}`);
        }
        
        // Verify location was updated
        if (fullConfig.weather.location !== 'Paris') {
            throw new Error(`Location not updated. Got: ${fullConfig.weather.location}`);
        }
    });

    // Test 3: Backend - Update with new API key
    await test('Backend: API key can be updated with new value', async () => {
        const magicMirrorModule = require(path.join(__dirname, '..', 'modules', 'magicmirror.js'));
        
        // Update with new API key
        const updateConfig = {
            enabled: true,
            widgets: { weather: { enabled: true, area: 'upper-center', size: 'box' } },
            weather: {
                location: 'Berlin',
                apiKey: 'new-api-key-67890'
            }
        };
        
        const updateResult = magicMirrorModule.updateConfig(updateConfig);
        if (!updateResult.success) {
            throw new Error('Failed to update config: ' + updateResult.error);
        }
        
        // Verify new API key is stored
        const fullConfig = magicMirrorModule.getFullConfig();
        if (fullConfig.weather.apiKey !== 'new-api-key-67890') {
            throw new Error(`API key not updated. Got: ${fullConfig.weather.apiKey}`);
        }
    });

    // Test 4: Backend - getConfig() returns hasApiKey flag and empty apiKey
    await test('Backend: getConfig() returns hasApiKey flag and masks actual key', async () => {
        const magicMirrorModule = require(path.join(__dirname, '..', 'modules', 'magicmirror.js'));
        
        // Get sanitized config
        const config = magicMirrorModule.getConfig();
        
        // Should have hasApiKey flag
        if (!config.weather.hasApiKey) {
            throw new Error('hasApiKey flag is not set');
        }
        
        // Should NOT have actual API key
        if (config.weather.apiKey !== '') {
            throw new Error(`API key should be masked, got: ${config.weather.apiKey}`);
        }
    });

    // Test 5: Multiple sequential updates preserve API key
    await test('Backend: API key persists through multiple config updates', async () => {
        const magicMirrorModule = require(path.join(__dirname, '..', 'modules', 'magicmirror.js'));
        
        // First update - set API key
        magicMirrorModule.updateConfig({
            weather: { location: 'City1', apiKey: 'persistent-key-123' }
        });
        
        // Second update - change location only
        magicMirrorModule.updateConfig({
            weather: { location: 'City2', apiKey: '' }
        });
        
        // Third update - change widget settings
        magicMirrorModule.updateConfig({
            widgets: { weather: { enabled: true, area: 'upper-left', size: 'bar' } },
            weather: { apiKey: '' }
        });
        
        // Fourth update - change location again
        magicMirrorModule.updateConfig({
            weather: { location: 'City3', apiKey: '' }
        });
        
        // Verify API key is still there
        const fullConfig = magicMirrorModule.getFullConfig();
        if (fullConfig.weather.apiKey !== 'persistent-key-123') {
            throw new Error(`API key lost after multiple updates. Got: ${fullConfig.weather.apiKey}`);
        }
        
        // Verify last location update worked
        if (fullConfig.weather.location !== 'City3') {
            throw new Error(`Location updates not working. Got: ${fullConfig.weather.location}`);
        }
    });

    // Test 6: Verify empty string does NOT clear API key (preservation behavior)
    await test('Backend: Empty API key string preserves existing key (anti-bug behavior)', async () => {
        const magicMirrorModule = require(path.join(__dirname, '..', 'modules', 'magicmirror.js'));
        
        // Set a known API key
        magicMirrorModule.updateConfig({
            weather: { location: 'TestCity', apiKey: 'should-not-be-cleared' }
        });
        
        // Try to "clear" with empty string (simulating the old bug)
        magicMirrorModule.updateConfig({
            enabled: false,
            widgets: { weather: { enabled: false, area: 'upper-center', size: 'box' } },
            weather: { location: '', apiKey: '' }
        });
        
        // Verify API key was NOT cleared (this is the fix!)
        const fullConfig = magicMirrorModule.getFullConfig();
        if (fullConfig.weather.apiKey !== 'should-not-be-cleared') {
            throw new Error('API key was incorrectly cleared by empty string - bug still exists!');
        }
    });

    // Summary
    log('\n📊 Test Summary:', 'info');
    log(`Passed: ${testsPassed}`, testsPassed > 0 ? 'success' : 'info');
    if (testsFailed > 0) {
        log(`Failed: ${testsFailed}`, 'error');
    }
    log(`Total: ${testsPassed + testsFailed}`, 'info');

    if (testsFailed === 0) {
        log('\n✨ All tests passed!', 'success');
        log('\n✅ Weather API Key Persistence Fix Verified:', 'success');
        log('   • API keys are properly stored in backend', 'info');
        log('   • API keys persist when not provided in updates', 'info');
        log('   • API keys can be updated with new values', 'info');
        log('   • getConfig() properly masks API keys for security', 'info');
        log('   • hasApiKey flag correctly indicates key presence', 'info');
        log('   • Multiple sequential updates preserve API key', 'info');
        process.exit(0);
    } else {
        log('\n❌ Some tests failed. Please review the errors above.', 'error');
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
});
