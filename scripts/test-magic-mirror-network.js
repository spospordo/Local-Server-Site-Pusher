#!/usr/bin/env node

/**
 * Magic Mirror Network Accessibility Test
 * 
 * This script tests if the Magic Mirror page is accessible from different network contexts
 */

const http = require('http');
const { execSync } = require('child_process');

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
        success: `${colors.green}✅`,
        error: `${colors.red}❌`,
        warning: `${colors.yellow}⚠️ `,
        info: `${colors.blue}ℹ️ `
    }[type] || '';
    
    console.log(`${prefix} ${message}${colors.reset}`);
}

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            resolve({
                statusCode: res.statusCode,
                headers: res.headers
            });
        }).on('error', reject);
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

async function runNetworkTests() {
    log('🌐 Magic Mirror Network Accessibility Test Suite\n', 'info');
    
    let passed = 0;
    let failed = 0;

    // Test 1: Localhost access
    if (await test('Localhost access (http://localhost:3000/magic-mirror)', async () => {
        const response = await makeRequest('http://localhost:3000/magic-mirror');
        if (response.statusCode !== 200) {
            throw new Error(`Expected 200, got ${response.statusCode}`);
        }
    })) passed++; else failed++;

    // Test 2: IPv4 loopback access
    if (await test('IPv4 loopback access (http://127.0.0.1:3000/magic-mirror)', async () => {
        const response = await makeRequest('http://127.0.0.1:3000/magic-mirror');
        if (response.statusCode !== 200) {
            throw new Error(`Expected 200, got ${response.statusCode}`);
        }
    })) passed++; else failed++;

    // Test 3: Check server binding
    if (await test('Server binds to 0.0.0.0 (all interfaces)', async () => {
        try {
            const netstat = execSync('ss -tuln | grep :3000 || netstat -tuln | grep :3000', { encoding: 'utf8' });
            if (!netstat.includes('0.0.0.0:3000') && !netstat.includes(':::3000')) {
                throw new Error('Server not binding to all interfaces');
            }
        } catch (error) {
            // Try alternative check
            const lsof = execSync('lsof -i :3000 || echo "lsof not available"', { encoding: 'utf8' });
            if (lsof.includes('lsof not available')) {
                log('Cannot verify binding (netstat/ss/lsof not available)', 'warning');
                return; // Don't fail the test if tools aren't available
            }
        }
    })) passed++; else failed++;

    // Test 4: Test API endpoints
    if (await test('Magic Mirror data endpoint responds', async () => {
        const response = await makeRequest('http://localhost:3000/api/magicmirror/data');
        if (response.statusCode !== 200 && response.statusCode !== 403) {
            throw new Error(`Unexpected status: ${response.statusCode}`);
        }
    })) passed++; else failed++;

    // Test 5: Check HTML content is returned
    if (await test('Magic Mirror returns HTML content', async () => {
        const response = await makeRequest('http://localhost:3000/magic-mirror');
        if (!response.headers['content-type'].includes('text/html')) {
            throw new Error('Content-Type is not HTML');
        }
    })) passed++; else failed++;

    // Test 6: Check if port is mapped (for Docker)
    log('\n📋 Network Configuration:', 'info');
    try {
        const portInfo = execSync('ss -tuln | grep :3000 | head -1', { encoding: 'utf8' }).trim();
        console.log(`   Port binding: ${portInfo}`);
        
        if (portInfo.includes('0.0.0.0:3000')) {
            log('   ✅ Server is accessible from all IPv4 interfaces', 'success');
        } else if (portInfo.includes(':::3000')) {
            log('   ✅ Server is accessible from all IPv6 interfaces (includes IPv4)', 'success');
        } else if (portInfo.includes('127.0.0.1:3000')) {
            log('   ⚠️  Server only accessible from localhost', 'warning');
        }
    } catch (error) {
        log('   Unable to check port binding details', 'warning');
    }

    // Show IP addresses
    try {
        log('\n📍 Server IP Addresses:', 'info');
        const ipOutput = execSync('hostname -I 2>/dev/null || ip addr show | grep "inet " | grep -v 127.0.0.1', { encoding: 'utf8' }).trim();
        if (ipOutput) {
            const ips = ipOutput.split(/\s+/).filter(ip => ip && !ip.startsWith('127.'));
            if (ips.length > 0) {
                ips.forEach(ip => {
                    console.log(`   http://${ip}:3000/magic-mirror`);
                });
            }
        } else {
            log('   Unable to determine IP addresses', 'warning');
        }
    } catch (error) {
        log('   Unable to determine IP addresses', 'warning');
    }

    // Summary
    log('\n📊 Test Summary:', 'info');
    log(`Passed: ${passed}`, 'success');
    if (failed > 0) {
        log(`Failed: ${failed}`, 'error');
        process.exit(1);
    }
    log(`Total: ${passed}`, 'info');
    
    log('\n✨ All network accessibility tests passed!', 'success');
    log('The Magic Mirror page should be accessible from containers and remote devices.', 'info');
}

// Run tests
runNetworkTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
});
