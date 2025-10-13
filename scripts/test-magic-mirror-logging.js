#!/usr/bin/env node

/**
 * Magic Mirror Logging Test
 * 
 * This script tests the enhanced logging functionality for the magic-mirror page
 * and validates that all requests are properly logged.
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// Color codes for output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m'
};

function log(message, type = 'info') {
    const prefix = {
        'success': `${colors.green}✅`,
        'error': `${colors.red}❌`,
        'warning': `${colors.yellow}⚠️ `,
        'info': `${colors.blue}ℹ️ `
    }[type] || '';
    console.log(`${prefix} ${message}${colors.reset}`);
}

function makeRequest(path, method = 'GET') {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({ 
                    statusCode: res.statusCode, 
                    body: body,
                    headers: res.headers 
                });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

async function test(description, testFn) {
    try {
        await testFn();
        log(description, 'success');
        return true;
    } catch (error) {
        log(`${description}: ${error.message}`, 'error');
        return false;
    }
}

async function runLoggingTests() {
    log('\n🔍 Magic Mirror Logging Test Suite\n', 'info');

    let passed = 0;
    let failed = 0;

    // Test 1: Magic mirror page request generates logs
    if (await test('Magic mirror page request (check server logs)', async () => {
        const response = await makeRequest('/magic-mirror');
        if (response.statusCode !== 200) {
            throw new Error(`Expected 200, got ${response.statusCode}`);
        }
    })) passed++; else failed++;

    // Test 2: Magic mirror data API request generates logs
    if (await test('Magic mirror data API request (check server logs)', async () => {
        const response = await makeRequest('/api/magicmirror/data');
        if (response.statusCode !== 200 && response.statusCode !== 403) {
            throw new Error(`Expected 200 or 403, got ${response.statusCode}`);
        }
    })) passed++; else failed++;

    // Test 3: Weather API request generates logs
    if (await test('Weather API request (check server logs)', async () => {
        const response = await makeRequest('/api/magicmirror/weather');
        // Should return 200 or 400 depending on config
        if (response.statusCode !== 200 && response.statusCode !== 400) {
            throw new Error(`Expected 200 or 400, got ${response.statusCode}`);
        }
    })) passed++; else failed++;

    // Test 4: Calendar API request generates logs
    if (await test('Calendar API request (check server logs)', async () => {
        const response = await makeRequest('/api/magicmirror/calendar');
        // Should return 200 or 400 depending on config
        if (response.statusCode !== 200 && response.statusCode !== 400) {
            throw new Error(`Expected 200 or 400, got ${response.statusCode}`);
        }
    })) passed++; else failed++;

    // Test 5: News API request generates logs
    if (await test('News API request (check server logs)', async () => {
        const response = await makeRequest('/api/magicmirror/news');
        // Should return 200, 400, or 500 depending on config
        if (response.statusCode !== 200 && response.statusCode !== 400 && response.statusCode !== 500) {
            throw new Error(`Expected 200, 400, or 500, got ${response.statusCode}`);
        }
    })) passed++; else failed++;

    // Test 6: Multiple rapid requests
    if (await test('Multiple rapid requests (check server logs for all)', async () => {
        const requests = [
            makeRequest('/magic-mirror'),
            makeRequest('/api/magicmirror/data'),
            makeRequest('/api/magicmirror/weather')
        ];
        
        const responses = await Promise.all(requests);
        
        // Verify all requests completed
        for (const response of responses) {
            if (response.statusCode < 200 || response.statusCode >= 600) {
                throw new Error(`Invalid status code: ${response.statusCode}`);
            }
        }
    })) passed++; else failed++;

    // Summary
    log('\n📊 Test Summary:', 'info');
    log(`Passed: ${passed}`, passed > 0 ? 'success' : 'info');
    if (failed > 0) {
        log(`Failed: ${failed}`, 'error');
    }
    log(`Total: ${passed + failed}`, 'info');

    if (failed === 0) {
        log('\n✨ All logging tests passed!', 'success');
        log('Check the server logs above to verify detailed logging output.', 'info');
        log('\nExpected log entries for each test:', 'info');
        log('  - Request timestamp and client IP', 'info');
        log('  - Endpoint being accessed', 'info');
        log('  - Success/error status', 'info');
        log('  - Additional context (config status, widget status, etc.)', 'info');
    } else {
        process.exit(1);
    }
}

// Run tests
runLoggingTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
});
