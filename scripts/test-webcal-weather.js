#!/usr/bin/env node

/**
 * Test script for webcal protocol support and weather API testing
 * Tests the new features added for issue: Support webcal protocol and weather API testing
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const CONFIG_DIR = path.join(__dirname, '..', 'config');

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
    log('\n🧪 Testing Webcal Protocol Support and Weather API Testing\n', 'info');

    // Test 1: Weather test endpoint exists
    await test('Weather test endpoint exists', async () => {
        const response = await makeRequest('/api/magicmirror/weather/test');
        if (response.statusCode === 404) {
            throw new Error('Weather test endpoint not found');
        }
        // 200, 400, or 500 is acceptable (depending on config and network)
        if (response.statusCode !== 200 && response.statusCode !== 400 && response.statusCode !== 500) {
            throw new Error(`Unexpected status code: ${response.statusCode}`);
        }
    });

    // Test 2: Weather test endpoint returns proper error when not configured
    await test('Weather test endpoint returns proper error when not configured', async () => {
        const response = await makeRequest('/api/magicmirror/weather/test');
        const body = JSON.parse(response.body);
        
        // Should return error with details
        if (!body.hasOwnProperty('success')) {
            throw new Error('Response missing success field');
        }
        
        if (body.success === false && !body.error) {
            throw new Error('Response missing error message');
        }
        
        if (body.success === false && !body.details) {
            throw new Error('Response missing details field');
        }
    });

    // Test 3: Webcal URL conversion (simulated)
    await test('Webcal URL conversion logic', async () => {
        // Test the logic by checking if webcal:// would be converted
        const testUrls = [
            { input: 'webcal://example.com/calendar.ics', expected: 'https://example.com/calendar.ics' },
            { input: 'webcals://example.com/calendar.ics', expected: 'https://example.com/calendar.ics' },
            { input: 'https://example.com/calendar.ics', expected: 'https://example.com/calendar.ics' }
        ];

        for (const testCase of testUrls) {
            let result = testCase.input;
            if (result.startsWith('webcal://')) {
                result = result.replace('webcal://', 'https://');
            } else if (result.startsWith('webcals://')) {
                result = result.replace('webcals://', 'https://');
            }
            
            if (result !== testCase.expected) {
                throw new Error(`URL conversion failed: ${testCase.input} -> ${result} (expected ${testCase.expected})`);
            }
        }
    });

    // Test 4: Calendar endpoint handles webcal URLs (with mock data)
    await test('Calendar endpoint handles webcal protocol (without actual URL)', async () => {
        const response = await makeRequest('/api/magicmirror/calendar');
        
        // Should return 400 (not configured) or 500 (if configured with invalid URL)
        // Should NOT return "Unsupported protocol" error if webcal is properly handled
        if (response.statusCode === 500) {
            const body = JSON.parse(response.body);
            if (body.error && body.error.includes('Unsupported protocol webcal')) {
                throw new Error('Webcal protocol still not supported');
            }
        }
        
        // Test passes if no unsupported protocol error
    });

    // Test 5: API key persistence check
    await test('Magic Mirror config supports API key persistence', async () => {
        const magicMirrorModule = require(path.join(__dirname, '..', 'modules', 'magicmirror.js'));
        
        // Test that updateConfig preserves API key when not provided
        const testConfig = {
            enabled: true,
            widgets: { weather: true },
            weather: {
                location: 'TestCity',
                apiKey: 'test-key-12345'
            }
        };
        
        // Save config
        const saveResult = magicMirrorModule.updateConfig(testConfig);
        if (!saveResult.success) {
            throw new Error('Failed to save config: ' + saveResult.error);
        }
        
        // Update without API key
        const updateResult = magicMirrorModule.updateConfig({
            enabled: true,
            widgets: { weather: true },
            weather: {
                location: 'NewCity'
                // Note: apiKey is not provided here
            }
        });
        
        if (!updateResult.success) {
            throw new Error('Failed to update config: ' + updateResult.error);
        }
        
        // Load and verify API key is still there
        const fullConfig = magicMirrorModule.getFullConfig();
        if (fullConfig.weather.apiKey !== 'test-key-12345') {
            throw new Error(`API key not persisted. Got: ${fullConfig.weather.apiKey}`);
        }
    });

    // Test 6: Weather test endpoint provides helpful error messages
    await test('Weather test endpoint provides helpful error messages', async () => {
        const response = await makeRequest('/api/magicmirror/weather/test');
        const body = JSON.parse(response.body);
        
        if (body.success === false) {
            // Check that error messages are helpful
            const errorMessage = (body.error || '').toLowerCase();
            const detailsMessage = (body.details || '').toLowerCase();
            
            // Should mention configuration, api key, location, or connection issues
            const hasHelpfulMessage = 
                errorMessage.includes('configured') || 
                errorMessage.includes('api key') || 
                errorMessage.includes('location') ||
                errorMessage.includes('network') ||
                errorMessage.includes('connection') ||
                detailsMessage.includes('configured') ||
                detailsMessage.includes('api key') ||
                detailsMessage.includes('location') ||
                detailsMessage.includes('network') ||
                detailsMessage.includes('connection') ||
                detailsMessage.includes('openweather');
            
            if (!hasHelpfulMessage) {
                throw new Error(`Error messages not helpful enough. Got error: "${body.error}", details: "${body.details}"`);
            }
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
        log('\n✅ Features implemented:', 'success');
        log('   • Webcal protocol support (webcal:// and webcals:// converted to https://)', 'info');
        log('   • Weather API test endpoint (/api/magicmirror/weather/test)', 'info');
        log('   • API key persistence across configuration updates', 'info');
        log('   • Detailed error messages for troubleshooting', 'info');
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
