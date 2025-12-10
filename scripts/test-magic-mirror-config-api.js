#!/usr/bin/env node

/**
 * Magic Mirror Config API Test Suite
 * Tests that /api/magic-mirror/config returns processed config with normalized widgets
 * This validates the fix for issue #268 where widgets weren't showing enabled/disabled correctly
 */

const http = require('http');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
    const colors = {
        success: '\x1b[32m',
        error: '\x1b[31m',
        info: '\x1b[36m',
        warn: '\x1b[33m',
        reset: '\x1b[0m'
    };
    console.log(`${colors[type]}${message}${colors.reset}`);
}

function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsedBody = body ? JSON.parse(body) : {};
                    resolve({ statusCode: res.statusCode, body: parsedBody });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: body });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function test(name, testFn) {
    try {
        await testFn();
        log(`✅ ${name}`, 'success');
        testsPassed++;
    } catch (error) {
        log(`❌ ${name}: ${error.message}`, 'error');
        testsFailed++;
    }
}

async function runTests() {
    log('\n🧪 Magic Mirror Config API Test Suite\n', 'info');
    log('Testing that /api/magic-mirror/config returns processed/normalized config\n', 'info');

    // Test 1: Check if server is running
    await test('Server is running', async () => {
        const response = await makeRequest('/api/status');
        if (response.statusCode !== 200) {
            throw new Error(`Server returned status ${response.statusCode}`);
        }
    });

    // Test 2: Config API returns success response structure
    await test('Config API returns proper response structure', async () => {
        const response = await makeRequest('/api/magic-mirror/config');
        
        // Should be 200 (enabled) or 403 (disabled)
        if (response.statusCode !== 200 && response.statusCode !== 403) {
            throw new Error(`Unexpected status code: ${response.statusCode}`);
        }
        
        if (response.statusCode === 403) {
            // If disabled, check for proper error structure
            if (response.body.success !== false) {
                throw new Error('Missing success=false in disabled response');
            }
            if (!response.body.error) {
                throw new Error('Missing error message in disabled response');
            }
            log('  (Magic Mirror is disabled - skipping enabled state tests)', 'warn');
            return;
        }
        
        // If enabled, check for success structure
        if (!response.body.success) {
            throw new Error('Missing success field in response');
        }
        if (!response.body.config) {
            throw new Error('Missing config field in response');
        }
    });

    // Test 3: Config API returns processed widgets (not raw format)
    await test('Config API returns processed widget format', async () => {
        const response = await makeRequest('/api/magic-mirror/config');
        
        if (response.statusCode === 403) {
            log('  (Magic Mirror is disabled - skipping widget format test)', 'warn');
            return;
        }
        
        if (response.statusCode !== 200) {
            throw new Error(`Unexpected status code: ${response.statusCode}`);
        }
        
        const config = response.body.config;
        if (!config.widgets) {
            throw new Error('Config missing widgets object');
        }
        
        // Check that widgets are in object format with enabled field
        const widgetNames = Object.keys(config.widgets);
        if (widgetNames.length === 0) {
            log('  (No widgets configured)', 'warn');
            return;
        }
        
        for (const widgetName of widgetNames) {
            const widget = config.widgets[widgetName];
            
            // Widget should be an object, not a boolean
            if (typeof widget === 'boolean') {
                throw new Error(`Widget ${widgetName} is boolean (raw format), should be object (processed format)`);
            }
            
            if (typeof widget !== 'object') {
                throw new Error(`Widget ${widgetName} is not an object: ${typeof widget}`);
            }
            
            // Widget object should have enabled field
            if (!('enabled' in widget)) {
                throw new Error(`Widget ${widgetName} missing 'enabled' field`);
            }
            
            // enabled field should be boolean
            if (typeof widget.enabled !== 'boolean') {
                throw new Error(`Widget ${widgetName} enabled field is ${typeof widget.enabled}, should be boolean`);
            }
            
            // Widget should have area and size fields for layout
            if (!widget.area) {
                throw new Error(`Widget ${widgetName} missing 'area' field`);
            }
            if (!widget.size) {
                throw new Error(`Widget ${widgetName} missing 'size' field`);
            }
        }
        
        log(`  (Validated ${widgetNames.length} widgets: ${widgetNames.join(', ')})`, 'info');
    });

    // Test 4: Config API doesn't expose raw API keys
    await test('Config API sanitizes sensitive data (API keys)', async () => {
        const response = await makeRequest('/api/magic-mirror/config');
        
        if (response.statusCode === 403) {
            log('  (Magic Mirror is disabled - skipping API key test)', 'warn');
            return;
        }
        
        if (response.statusCode !== 200) {
            throw new Error(`Unexpected status code: ${response.statusCode}`);
        }
        
        const config = response.body.config;
        
        // Check weather config - API key should not be exposed or should be empty
        if (config.weather) {
            if (config.weather.apiKey && config.weather.apiKey.length > 10) {
                throw new Error('Weather API key is exposed in config response');
            }
            // Should have hasApiKey flag instead
            if (!('hasApiKey' in config.weather)) {
                log('  (Warning: missing hasApiKey indicator)', 'warn');
            }
        }
    });

    // Test 5: Compare with legacy endpoint to ensure consistency
    await test('Config API matches legacy /api/magicmirror/data format', async () => {
        const newApiResponse = await makeRequest('/api/magic-mirror/config');
        const legacyApiResponse = await makeRequest('/api/magicmirror/data');
        
        // Both should have same enabled/disabled status
        const newApiDisabled = newApiResponse.statusCode === 403;
        const legacyApiDisabled = legacyApiResponse.statusCode === 403;
        
        if (newApiDisabled !== legacyApiDisabled) {
            throw new Error(`Enabled state mismatch: new API ${newApiDisabled ? 'disabled' : 'enabled'}, legacy API ${legacyApiDisabled ? 'disabled' : 'enabled'}`);
        }
        
        if (newApiDisabled) {
            log('  (Both APIs correctly return disabled state)', 'info');
            return;
        }
        
        // If enabled, both should return processed config with widgets
        const newConfig = newApiResponse.body.config;
        const legacyConfig = legacyApiResponse.body;
        
        if (!newConfig.widgets || !legacyConfig.widgets) {
            throw new Error('One or both APIs missing widgets object');
        }
        
        // Compare widget names
        const newWidgets = Object.keys(newConfig.widgets).sort();
        const legacyWidgets = Object.keys(legacyConfig.widgets).sort();
        
        if (JSON.stringify(newWidgets) !== JSON.stringify(legacyWidgets)) {
            throw new Error(`Widget lists don't match: new=[${newWidgets.join(',')}], legacy=[${legacyWidgets.join(',')}]`);
        }
        
        // Compare enabled status for each widget
        for (const widgetName of newWidgets) {
            const newEnabled = newConfig.widgets[widgetName].enabled;
            const legacyEnabled = legacyConfig.widgets[widgetName].enabled;
            
            if (newEnabled !== legacyEnabled) {
                throw new Error(`Widget ${widgetName} enabled state mismatch: new=${newEnabled}, legacy=${legacyEnabled}`);
            }
        }
        
        log(`  (Both APIs return consistent widget configuration)`, 'info');
    });

    // Test 6: Verify config version tracking
    await test('Config includes version tracking for cache invalidation', async () => {
        const response = await makeRequest('/api/magic-mirror/config');
        
        if (response.statusCode === 403) {
            log('  (Magic Mirror is disabled - skipping version test)', 'warn');
            return;
        }
        
        if (response.statusCode !== 200) {
            throw new Error(`Unexpected status code: ${response.statusCode}`);
        }
        
        const config = response.body.config;
        
        if (!config.configVersion) {
            log('  (Warning: missing configVersion field for cache management)', 'warn');
        } else {
            if (typeof config.configVersion !== 'number') {
                throw new Error(`configVersion should be number, got ${typeof config.configVersion}`);
            }
            log(`  (Config version: ${config.configVersion})`, 'info');
        }
    });

    // Summary
    log('\n📊 Test Summary', 'info');
    log(`✅ Passed: ${testsPassed}`, 'success');
    if (testsFailed > 0) {
        log(`❌ Failed: ${testsFailed}`, 'error');
    }
    log(`Total: ${testsPassed + testsFailed}\n`, 'info');
    
    if (testsFailed === 0) {
        log('✨ All tests passed! Config API correctly returns processed widget configuration.', 'success');
        log('This confirms the fix for issue #268 - dashboard should now reflect admin widget settings.\n', 'success');
    }

    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
});
