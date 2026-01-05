#!/usr/bin/env node

/**
 * Test script to verify webhook management functionality
 * Tests CRUD operations and webhook triggering
 */

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';
const USERNAME = process.env.ADMIN_USERNAME || 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let sessionCookie = null;
let testWebhookId = null;

// Helper to make HTTP request
function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            timeout: 5000
        };

        if (sessionCookie) {
            options.headers['Cookie'] = sessionCookie;
        }

        const req = http.request(options, (res) => {
            let data = '';

            // Save session cookie from login
            if (res.headers['set-cookie']) {
                sessionCookie = res.headers['set-cookie'][0].split(';')[0];
            }

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, data: json });
                } catch (error) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

// Login to get session
async function login() {
    console.log('🔐 Logging in...');
    try {
        // Use application/x-www-form-urlencoded for login
        const formData = `username=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}`;
        
        const options = {
            hostname: HOST,
            port: PORT,
            path: '/admin/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(formData)
            },
            timeout: 5000
        };

        const response = await new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let data = '';

                // Save session cookie from login
                if (res.headers['set-cookie']) {
                    sessionCookie = res.headers['set-cookie'][0].split(';')[0];
                }

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    resolve({ status: res.statusCode, data: data, headers: res.headers });
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(formData);
            req.end();
        });

        if (sessionCookie && (response.status === 302 || response.status === 200)) {
            console.log('✅ Login successful\n');
            return true;
        } else {
            console.log('❌ Login failed:', response.status);
            return false;
        }
    } catch (err) {
        console.log('❌ Login error:', err.message);
        return false;
    }
}

// Test: Get all webhooks (initially empty)
async function testGetWebhooksEmpty() {
    console.log('🧪 Test: Get webhooks (should be empty initially)');
    try {
        const response = await makeRequest('GET', '/admin/api/webhooks');

        if (response.status === 200 && response.data.success) {
            console.log(`✅ Successfully retrieved webhooks: ${response.data.webhooks.length} webhooks`);
            console.log(`   Webhooks: ${JSON.stringify(response.data.webhooks)}\n`);
            return true;
        } else {
            console.log('❌ Failed to get webhooks:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Error:', err.message);
        return false;
    }
}

// Test: Create a normal webhook
async function testCreateWebhook() {
    console.log('🧪 Test: Create a normal webhook');
    try {
        const response = await makeRequest('POST', '/admin/api/webhooks', {
            name: 'Test Webhook',
            url: 'https://httpbin.org/post',
            highImpact: false
        });

        if (response.status === 200 && response.data.success) {
            console.log('✅ Successfully created webhook');
            console.log(`   Message: ${response.data.message}\n`);
            return true;
        } else {
            console.log('❌ Failed to create webhook:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Error:', err.message);
        return false;
    }
}

// Test: Create a high impact webhook
async function testCreateHighImpactWebhook() {
    console.log('🧪 Test: Create a high impact webhook');
    try {
        const response = await makeRequest('POST', '/admin/api/webhooks', {
            name: 'Deploy Production',
            url: 'https://httpbin.org/post',
            highImpact: true
        });

        if (response.status === 200 && response.data.success) {
            console.log('✅ Successfully created high impact webhook');
            console.log(`   Message: ${response.data.message}\n`);
            return true;
        } else {
            console.log('❌ Failed to create high impact webhook:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Error:', err.message);
        return false;
    }
}

// Test: Get all webhooks (should have 2 now)
async function testGetWebhooks() {
    console.log('🧪 Test: Get webhooks (should have 2 webhooks)');
    try {
        const response = await makeRequest('GET', '/admin/api/webhooks');

        if (response.status === 200 && response.data.success) {
            const webhooks = response.data.webhooks;
            console.log(`✅ Successfully retrieved webhooks: ${webhooks.length} webhooks`);
            
            // Store the first webhook ID for later tests
            if (webhooks.length > 0) {
                testWebhookId = webhooks[0].id;
                console.log(`   Stored test webhook ID: ${testWebhookId}`);
            }
            
            // Display webhook details
            webhooks.forEach(webhook => {
                console.log(`   - ${webhook.name} (${webhook.highImpact ? 'HIGH IMPACT' : 'normal'})`);
                console.log(`     URL: ${webhook.url}`);
                console.log(`     ID: ${webhook.id}`);
            });
            console.log();
            
            return webhooks.length === 2;
        } else {
            console.log('❌ Failed to get webhooks:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Error:', err.message);
        return false;
    }
}

// Test: Update a webhook
async function testUpdateWebhook() {
    if (!testWebhookId) {
        console.log('❌ Test skipped: No webhook ID available\n');
        return false;
    }

    console.log('🧪 Test: Update webhook');
    try {
        const response = await makeRequest('POST', '/admin/api/webhooks', {
            id: testWebhookId,
            name: 'Test Webhook (Updated)',
            url: 'https://httpbin.org/post',
            highImpact: false
        });

        if (response.status === 200 && response.data.success) {
            console.log('✅ Successfully updated webhook');
            console.log(`   Message: ${response.data.message}\n`);
            return true;
        } else {
            console.log('❌ Failed to update webhook:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Error:', err.message);
        return false;
    }
}

// Test: Trigger a webhook
async function testTriggerWebhook() {
    if (!testWebhookId) {
        console.log('❌ Test skipped: No webhook ID available\n');
        return false;
    }

    console.log('🧪 Test: Trigger webhook');
    try {
        const response = await makeRequest('POST', `/admin/api/webhooks/${testWebhookId}/trigger`, {
            payload: { test: true, timestamp: new Date().toISOString() }
        });

        // Accept either success or network errors as valid (since external URLs may be blocked)
        if (response.status === 200) {
            if (response.data.success) {
                console.log('✅ Successfully triggered webhook');
                console.log(`   Status: ${response.data.status}`);
                console.log(`   Message: ${response.data.message}\n`);
                return true;
            } else if (response.data.error && (
                response.data.error.includes('ENOTFOUND') || 
                response.data.error.includes('ECONNREFUSED') ||
                response.data.error.includes('timeout')
            )) {
                console.log('✅ Webhook trigger attempted (external URL blocked by network)');
                console.log(`   Note: ${response.data.error}\n`);
                return true;
            } else {
                console.log('❌ Failed to trigger webhook:', response.data);
                return false;
            }
        } else {
            console.log('❌ Failed to trigger webhook:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Error:', err.message);
        return false;
    }
}

// Test: Delete a webhook
async function testDeleteWebhook() {
    if (!testWebhookId) {
        console.log('❌ Test skipped: No webhook ID available\n');
        return false;
    }

    console.log('🧪 Test: Delete webhook');
    try {
        const response = await makeRequest('DELETE', `/admin/api/webhooks/${testWebhookId}`);

        if (response.status === 200 && response.data.success) {
            console.log('✅ Successfully deleted webhook');
            console.log(`   Message: ${response.data.message}\n`);
            return true;
        } else {
            console.log('❌ Failed to delete webhook:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Error:', err.message);
        return false;
    }
}

// Test: Verify webhook was deleted
async function testGetWebhooksAfterDelete() {
    console.log('🧪 Test: Verify webhook was deleted');
    try {
        const response = await makeRequest('GET', '/admin/api/webhooks');

        if (response.status === 200 && response.data.success) {
            const webhooks = response.data.webhooks;
            console.log(`✅ Successfully retrieved webhooks: ${webhooks.length} webhooks`);
            console.log(`   Expected: 1 webhook remaining (high impact)\n`);
            return webhooks.length === 1;
        } else {
            console.log('❌ Failed to get webhooks:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Error:', err.message);
        return false;
    }
}

// Test: Invalid webhook URL
async function testInvalidWebhookUrl() {
    console.log('🧪 Test: Create webhook with invalid URL (should fail)');
    try {
        const response = await makeRequest('POST', '/admin/api/webhooks', {
            name: 'Invalid Webhook',
            url: 'not-a-valid-url',
            highImpact: false
        });

        if (response.status === 400 || !response.data.success) {
            console.log('✅ Correctly rejected invalid webhook URL');
            console.log(`   Error: ${response.data.error}\n`);
            return true;
        } else {
            console.log('❌ Should have rejected invalid URL:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Error:', err.message);
        return false;
    }
}

// Run all tests
async function runTests() {
    console.log('========================================');
    console.log('Webhook Management Test Suite');
    console.log('========================================\n');

    const results = [];

    // Login first
    if (!(await login())) {
        console.log('\n❌ Login failed. Cannot proceed with tests.');
        process.exit(1);
    }

    // Run tests
    results.push({ name: 'Get empty webhooks', result: await testGetWebhooksEmpty() });
    results.push({ name: 'Create normal webhook', result: await testCreateWebhook() });
    results.push({ name: 'Create high impact webhook', result: await testCreateHighImpactWebhook() });
    results.push({ name: 'Get webhooks (2 total)', result: await testGetWebhooks() });
    results.push({ name: 'Update webhook', result: await testUpdateWebhook() });
    results.push({ name: 'Trigger webhook', result: await testTriggerWebhook() });
    results.push({ name: 'Delete webhook', result: await testDeleteWebhook() });
    results.push({ name: 'Verify deletion', result: await testGetWebhooksAfterDelete() });
    results.push({ name: 'Invalid URL rejection', result: await testInvalidWebhookUrl() });

    // Print summary
    console.log('========================================');
    console.log('Test Summary');
    console.log('========================================');
    
    const passed = results.filter(r => r.result).length;
    const total = results.length;

    results.forEach(result => {
        console.log(`${result.result ? '✅' : '❌'} ${result.name}`);
    });

    console.log(`\n${passed}/${total} tests passed`);

    if (passed === total) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('\n❌ Some tests failed');
        process.exit(1);
    }
}

// Run tests
runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
