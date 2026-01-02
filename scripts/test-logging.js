#!/usr/bin/env node

/**
 * Test script for centralized logging system
 * Verifies that the logger module and API endpoints work correctly
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
    const prefix = {
        'success': `${colors.green}✅`,
        'error': `${colors.red}❌`,
        'warning': `${colors.yellow}⚠️ `,
        'info': `${colors.blue}ℹ️ `
    }[type] || '';
    console.log(`${prefix} ${message}${colors.reset}`);
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
                resolve({ 
                    statusCode: res.statusCode, 
                    body: body,
                    headers: res.headers 
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

async function test(description, testFn) {
    try {
        await testFn();
        log(description, 'success');
        testsPassed++;
        return true;
    } catch (error) {
        log(`${description}: ${error.message}`, 'error');
        testsFailed++;
        return false;
    }
}

async function runLoggingTests() {
    log('\n🧪 Running Centralized Logging System Tests\n', 'info');

    // Test 1: Logger module can be required
    await test('Logger module loads successfully', async () => {
        const logger = require('../modules/logger');
        if (!logger) {
            throw new Error('Logger module not found');
        }
        if (typeof logger.log !== 'function') {
            throw new Error('Logger.log is not a function');
        }
    });

    // Test 2: Logger has required methods
    await test('Logger has all required methods', async () => {
        const logger = require('../modules/logger');
        const requiredMethods = ['log', 'info', 'success', 'warning', 'error', 'getLogs', 'getCategories', 'clear'];
        
        for (const method of requiredMethods) {
            if (typeof logger[method] !== 'function') {
                throw new Error(`Logger.${method} is not a function`);
            }
        }
    });

    // Test 3: Logger has all required categories
    await test('Logger has all required categories', async () => {
        const logger = require('../modules/logger');
        const categories = logger.getCategories();
        const requiredCategories = ['SYSTEM', 'DEPLOYMENT', 'BUILD', 'FINANCE', 'GITHUB', 'SERVER', 'CLIENT'];
        
        for (const category of requiredCategories) {
            if (!categories[category]) {
                throw new Error(`Missing category: ${category}`);
            }
        }
    });

    // Test 4: Logger can add log entries
    await test('Logger can add log entries', async () => {
        const logger = require('../modules/logger');
        const initialCount = logger.getLogs().length;
        
        logger.info(logger.categories.SYSTEM, 'Test log entry');
        
        const afterCount = logger.getLogs().length;
        if (afterCount !== initialCount + 1) {
            throw new Error(`Expected ${initialCount + 1} logs, got ${afterCount}`);
        }
    });

    // Test 5: Logger stores logs in correct format
    await test('Logger stores logs in correct format', async () => {
        const logger = require('../modules/logger');
        logger.success(logger.categories.SYSTEM, 'Test success message');
        
        const logs = logger.getLogs();
        const latestLog = logs[0];
        
        if (!latestLog.timestamp || !latestLog.level || !latestLog.category || !latestLog.message) {
            throw new Error('Log entry missing required fields');
        }
        
        if (latestLog.level !== 'SUCCESS') {
            throw new Error(`Expected level SUCCESS, got ${latestLog.level}`);
        }
    });

    // Test 6: Logger can filter by category
    await test('Logger can filter logs by category', async () => {
        const logger = require('../modules/logger');
        logger.info(logger.categories.GITHUB, 'GitHub test');
        logger.info(logger.categories.SYSTEM, 'System test');
        
        const githubLogs = logger.getLogs(logger.categories.GITHUB);
        const hasOnlyGitHub = githubLogs.every(log => log.category === logger.categories.GITHUB);
        
        if (!hasOnlyGitHub) {
            throw new Error('Filter by category not working correctly');
        }
    });

    // Test 7: API endpoint returns logs (without auth will fail, but we test structure)
    await test('Logs API endpoint exists', async () => {
        const response = await makeRequest('/admin/api/logs');
        
        // Expect 401 or similar since we're not authenticated
        if (response.statusCode === 404) {
            throw new Error('Logs API endpoint not found (404)');
        }
    });

    // Summary
    log('\n📊 Test Summary', 'info');
    log(`✅ Passed: ${testsPassed}`, 'success');
    if (testsFailed > 0) {
        log(`❌ Failed: ${testsFailed}`, 'error');
        process.exit(1);
    } else {
        log('\n🎉 All tests passed!', 'success');
        process.exit(0);
    }
}

// Run tests
runLoggingTests().catch(err => {
    log(`Test runner error: ${err.message}`, 'error');
    process.exit(1);
});
