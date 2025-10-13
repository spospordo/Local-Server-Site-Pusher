#!/usr/bin/env node

/**
 * Magic Mirror Dashboard Generation Test Suite
 * Tests that the dashboard is properly generated and displays appropriate messages
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const HTML_PATH = path.join(__dirname, '..', 'public', 'magic-mirror.html');

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
                    resolve({ statusCode: res.statusCode, body: parsedBody, rawBody: body });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: body, rawBody: body });
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
    log('\n🧪 Magic Mirror Dashboard Generation Test Suite\n', 'info');

    // Test 1: Dashboard HTML file exists
    await test('Dashboard HTML file exists', async () => {
        if (!fs.existsSync(HTML_PATH)) {
            throw new Error('magic-mirror.html not found');
        }
    });

    // Test 2: Dashboard HTML contains all required widgets
    await test('Dashboard HTML contains all required widgets', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        const requiredElements = [
            'clock-widget',
            'weather-widget',
            'calendar-widget',
            'news-widget',
            'disabled-container',
            'dashboard-container'
        ];
        
        for (const element of requiredElements) {
            if (!htmlContent.includes(element)) {
                throw new Error(`Missing required element: ${element}`);
            }
        }
    });

    // Test 3: Dashboard HTML contains initialization script
    await test('Dashboard HTML contains initialization script', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('initDashboard')) {
            throw new Error('Missing initDashboard function');
        }
        
        if (!htmlContent.includes('updateClock')) {
            throw new Error('Missing updateClock function');
        }
        
        if (!htmlContent.includes('updateWeather')) {
            throw new Error('Missing updateWeather function');
        }
        
        if (!htmlContent.includes('updateCalendar')) {
            throw new Error('Missing updateCalendar function');
        }
        
        if (!htmlContent.includes('updateNews')) {
            throw new Error('Missing updateNews function');
        }
    });

    // Test 4: Dashboard HTML contains error handling
    await test('Dashboard HTML contains error handling', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('error-message')) {
            throw new Error('Missing error message styling');
        }
        
        if (!htmlContent.includes('catch')) {
            throw new Error('Missing error catching logic');
        }
    });

    // Test 5: Dashboard page is accessible via HTTP
    await test('Dashboard page is accessible via HTTP', async () => {
        const response = await makeRequest('/magic-mirror');
        
        if (response.statusCode !== 200) {
            throw new Error(`Expected 200, got ${response.statusCode}`);
        }
        
        if (!response.rawBody.includes('Magic Mirror Dashboard')) {
            throw new Error('Dashboard title not found in response');
        }
    });

    // Test 6: Dashboard handles disabled state
    await test('Dashboard handles disabled state', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('Magic Mirror is Disabled')) {
            throw new Error('Missing disabled state message');
        }
        
        if (!htmlContent.includes('response.status === 403')) {
            throw new Error('Missing disabled state detection logic');
        }
    });

    // Test 7: Dashboard contains proper styling
    await test('Dashboard contains proper styling', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('<style>')) {
            throw new Error('Missing style tag');
        }
        
        if (!htmlContent.includes('widget-grid')) {
            throw new Error('Missing widget grid styling');
        }
    });

    // Test 8: Dashboard is larger than placeholder
    await test('Dashboard is fully implemented (not a placeholder)', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        // Full dashboard should be much larger than placeholder (>1000 lines)
        const lines = htmlContent.split('\n').length;
        if (lines < 100) {
            throw new Error(`Dashboard appears to be a placeholder (${lines} lines, expected >100)`);
        }
    });

    // Test 9: Dashboard contains proper title
    await test('Dashboard has correct title', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('<title>Magic Mirror Dashboard</title>')) {
            throw new Error('Incorrect or missing page title');
        }
    });

    // Test 10: Dashboard displays current when accessed
    await test('Dashboard displays successfully when accessed', async () => {
        const response = await makeRequest('/magic-mirror');
        
        // Should return HTML content
        if (!response.rawBody.includes('<!DOCTYPE html>')) {
            throw new Error('Response is not valid HTML');
        }
        
        // Should contain widget containers
        if (!response.rawBody.includes('clock-widget')) {
            throw new Error('Response missing clock widget container');
        }
    });

    // Summary
    log('\n📊 Test Summary', 'info');
    log(`✅ Passed: ${testsPassed}`, 'success');
    if (testsFailed > 0) {
        log(`❌ Failed: ${testsFailed}`, 'error');
    }
    log(`Total: ${testsPassed + testsFailed}\n`, 'info');

    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
});
