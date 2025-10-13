#!/usr/bin/env node

/**
 * Magic Mirror HTML Generation Test Suite
 * Tests the magic-mirror.html generation functionality
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const MAGIC_MIRROR_PATH = path.join(__dirname, '..', 'public', 'magic-mirror.html');
const BACKUP_PATH = path.join(__dirname, '..', 'public', 'magic-mirror.html.test-backup');

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

function backupFile() {
    if (fs.existsSync(MAGIC_MIRROR_PATH)) {
        fs.copyFileSync(MAGIC_MIRROR_PATH, BACKUP_PATH);
        log('📦 Backed up existing magic-mirror.html', 'info');
    }
}

function restoreFile() {
    if (fs.existsSync(BACKUP_PATH)) {
        fs.copyFileSync(BACKUP_PATH, MAGIC_MIRROR_PATH);
        fs.unlinkSync(BACKUP_PATH);
        log('♻️  Restored original magic-mirror.html', 'info');
    }
}

function removeFile() {
    if (fs.existsSync(MAGIC_MIRROR_PATH)) {
        fs.unlinkSync(MAGIC_MIRROR_PATH);
    }
}

async function runTests() {
    log('\n🧪 Magic Mirror Generation Test Suite\n', 'info');

    // Backup existing file
    backupFile();

    try {
        // Test 1: Server is running
        await test('Server is running', async () => {
            const response = await makeRequest('/api/status');
            if (response.statusCode !== 200) {
                throw new Error(`Server returned status ${response.statusCode}`);
            }
        });

        // Test 2: Generate endpoint exists
        await test('Generate endpoint exists', async () => {
            // First remove the file if it exists
            removeFile();
            
            const response = await makeRequest('/api/magicmirror/generate', 'POST');
            if (response.statusCode !== 200 && response.statusCode !== 400) {
                throw new Error(`Unexpected status code: ${response.statusCode}`);
            }
        });

        // Test 3: Can generate magic-mirror.html when missing
        await test('Can generate magic-mirror.html when missing', async () => {
            // Remove file first
            removeFile();
            
            if (fs.existsSync(MAGIC_MIRROR_PATH)) {
                throw new Error('File should not exist before generation');
            }
            
            const response = await makeRequest('/api/magicmirror/generate', 'POST');
            
            if (response.statusCode !== 200) {
                throw new Error(`Expected status 200, got ${response.statusCode}`);
            }
            
            if (!response.body.success) {
                throw new Error('Generation should succeed');
            }
            
            if (!fs.existsSync(MAGIC_MIRROR_PATH)) {
                throw new Error('File should exist after generation');
            }
        });

        // Test 4: Generated file is valid HTML
        await test('Generated file is valid HTML', async () => {
            const content = fs.readFileSync(MAGIC_MIRROR_PATH, 'utf8');
            
            if (!content.includes('<!DOCTYPE html>')) {
                throw new Error('Missing DOCTYPE declaration');
            }
            
            if (!content.includes('Magic Mirror Dashboard')) {
                throw new Error('Missing dashboard title');
            }
            
            if (!content.includes('clock-widget') || !content.includes('weather-widget')) {
                throw new Error('Missing widget structure');
            }
        });

        // Test 5: Cannot generate when file already exists
        await test('Cannot generate when file already exists', async () => {
            // File should exist from previous test
            if (!fs.existsSync(MAGIC_MIRROR_PATH)) {
                throw new Error('File should exist for this test');
            }
            
            const response = await makeRequest('/api/magicmirror/generate', 'POST');
            
            if (response.statusCode !== 400) {
                throw new Error(`Expected status 400, got ${response.statusCode}`);
            }
            
            if (response.body.success !== false) {
                throw new Error('Generation should fail when file exists');
            }
            
            if (!response.body.error.includes('already exists')) {
                throw new Error('Error message should mention file already exists');
            }
        });

        // Test 6: /magic-mirror route shows error page when file missing
        await test('/magic-mirror route shows error page when file missing', async () => {
            // Remove file
            removeFile();
            
            const response = await makeRequest('/magic-mirror');
            
            if (response.statusCode !== 404) {
                throw new Error(`Expected status 404, got ${response.statusCode}`);
            }
            
            if (!response.body.includes('Magic Mirror Not Found')) {
                throw new Error('Error page should show "Magic Mirror Not Found"');
            }
            
            if (!response.body.includes('Generate Magic Mirror Page')) {
                throw new Error('Error page should show "Generate" button');
            }
        });

        // Test 7: /magic-mirror route serves file when present
        await test('/magic-mirror route serves file when present', async () => {
            // Generate file
            await makeRequest('/api/magicmirror/generate', 'POST');
            
            const response = await makeRequest('/magic-mirror');
            
            if (response.statusCode !== 200) {
                throw new Error(`Expected status 200, got ${response.statusCode}`);
            }
            
            if (!response.body.includes('Magic Mirror Dashboard')) {
                throw new Error('Should serve the dashboard page');
            }
        });

        // Summary
        log('\n📊 Test Summary', 'info');
        log(`✅ Passed: ${testsPassed}`, 'success');
        if (testsFailed > 0) {
            log(`❌ Failed: ${testsFailed}`, 'error');
        }
        log(`📈 Total: ${testsPassed + testsFailed}\n`, 'info');

    } finally {
        // Always restore the original file
        restoreFile();
    }

    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
    log('Fatal error running tests: ' + err.message, 'error');
    restoreFile();
    process.exit(1);
});
