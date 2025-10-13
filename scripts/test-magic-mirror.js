#!/usr/bin/env node

/**
 * Magic Mirror Functionality Test Suite
 * Tests the magic mirror configuration, API endpoints, and data flow
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'magicmirror-config.json.enc');

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
    log('\n🧪 Magic Mirror Test Suite\n', 'info');

    // Test 1: Check if magic mirror module exists
    await test('Magic mirror module exists', async () => {
        const modulePath = path.join(__dirname, '..', 'modules', 'magicmirror.js');
        if (!fs.existsSync(modulePath)) {
            throw new Error('Magic mirror module not found');
        }
    });

    // Test 2: Check if magic mirror HTML page exists
    await test('Magic mirror HTML page exists', async () => {
        const htmlPath = path.join(__dirname, '..', 'public', 'magic-mirror.html');
        if (!fs.existsSync(htmlPath)) {
            throw new Error('Magic mirror HTML page not found');
        }
    });

    // Test 3: Check if server is running
    await test('Server is running', async () => {
        const response = await makeRequest('/api/status');
        if (response.statusCode !== 200) {
            throw new Error(`Server returned status ${response.statusCode}`);
        }
    });

    // Test 4: Magic mirror config endpoint (should require auth)
    await test('Magic mirror config endpoint exists', async () => {
        const response = await makeRequest('/admin/api/magicmirror/config');
        // Should return 401 or 403 without auth, not 404
        if (response.statusCode === 404) {
            throw new Error('Config endpoint not found');
        }
    });

    // Test 5: Magic mirror data endpoint (when disabled)
    await test('Magic mirror data endpoint handles disabled state', async () => {
        const response = await makeRequest('/api/magicmirror/data');
        // Should return 403 when disabled or 200 when enabled
        if (response.statusCode !== 403 && response.statusCode !== 200) {
            throw new Error(`Unexpected status code: ${response.statusCode}`);
        }
    });

    // Test 6: Magic mirror display page exists
    await test('Magic mirror display page is accessible', async () => {
        const response = await makeRequest('/magic-mirror');
        if (response.statusCode !== 200) {
            throw new Error(`Display page returned status ${response.statusCode}`);
        }
    });

    // Test 7: Weather API endpoint exists
    await test('Weather API endpoint exists', async () => {
        const response = await makeRequest('/api/magicmirror/weather');
        // Should return 400 or 200, not 404
        if (response.statusCode === 404) {
            throw new Error('Weather API endpoint not found');
        }
    });

    // Test 8: Calendar API endpoint exists
    await test('Calendar API endpoint exists', async () => {
        const response = await makeRequest('/api/magicmirror/calendar');
        // Should return 400 or 200, not 404
        if (response.statusCode === 404) {
            throw new Error('Calendar API endpoint not found');
        }
    });

    // Test 9: News API endpoint exists
    await test('News API endpoint exists', async () => {
        const response = await makeRequest('/api/magicmirror/news');
        // Should return 400 or 200, not 404
        if (response.statusCode === 404) {
            throw new Error('News API endpoint not found');
        }
    });

    // Test 10: Config directory exists
    await test('Config directory exists', async () => {
        if (!fs.existsSync(CONFIG_DIR)) {
            throw new Error('Config directory not found');
        }
    });

    // Test 11: Encryption is set up
    await test('Magic mirror encryption key is created', async () => {
        const keyFile = path.join(CONFIG_DIR, '.magicmirror-key');
        if (!fs.existsSync(keyFile)) {
            throw new Error('Encryption key file not found');
        }
        const keyContent = fs.readFileSync(keyFile, 'utf8');
        if (keyContent.length !== 64) { // 32 bytes in hex = 64 characters
            throw new Error('Invalid encryption key length');
        }
    });

    // Test 12: HTML contains placeholder text
    await test('Magic mirror HTML contains placeholder text', async () => {
        const htmlPath = path.join(__dirname, '..', 'public', 'magic-mirror.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        if (!htmlContent.includes('dashboard placeholder')) {
            throw new Error('Missing placeholder text: "dashboard placeholder"');
        }
    });

    // Test 13: HTML is minimal placeholder (for troubleshooting)
    await test('Magic mirror HTML is minimal placeholder', async () => {
        const htmlPath = path.join(__dirname, '..', 'public', 'magic-mirror.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        
        // Verify it's a simple HTML structure
        if (!htmlContent.includes('<!DOCTYPE html>')) {
            throw new Error('Missing DOCTYPE declaration');
        }
        
        // Ensure it's truly minimal (less than 500 bytes is reasonable for placeholder)
        if (htmlContent.length > 500) {
            throw new Error('HTML is not minimal - should be a simple placeholder');
        }
    });

    // Test 14: Placeholder serves successfully via HTTP
    await test('Magic mirror placeholder serves via HTTP', async () => {
        const response = await makeRequest('/magic-mirror');
        
        if (response.statusCode !== 200) {
            throw new Error(`Placeholder returned status ${response.statusCode}`);
        }
        
        if (!response.body.includes('dashboard placeholder')) {
            throw new Error('Response does not contain placeholder text');
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
