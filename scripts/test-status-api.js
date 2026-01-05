#!/usr/bin/env node

/**
 * Test script to verify the /api/status endpoint returns correct data
 * Tests that memory and uptime values are properly formatted
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

// Make HTTP request
function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            port: PORT,
            path: path,
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
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

        req.end();
    });
}

// Test the /api/status endpoint
async function testStatusEndpoint() {
    console.log('🧪 Testing /api/status endpoint...\n');

    try {
        const response = await makeRequest('/api/status');
        
        console.log('✅ Successfully fetched /api/status');
        console.log(`   Status code: ${response.status}\n`);

        const { data } = response;

        // Test 1: Check if response has required fields
        console.log('📋 Test 1: Verifying response structure...');
        const requiredFields = ['timestamp', 'server', 'memory', 'version'];
        const missingFields = requiredFields.filter(field => !(field in data));
        
        if (missingFields.length > 0) {
            console.log(`❌ Missing required fields: ${missingFields.join(', ')}\n`);
            return false;
        }
        console.log('✅ All required fields present\n');

        // Test 2: Check server.uptime is a number
        console.log('📋 Test 2: Verifying server.uptime...');
        if (typeof data.server.uptime !== 'number') {
            console.log(`❌ server.uptime should be a number, got: ${typeof data.server.uptime}\n`);
            return false;
        }
        console.log(`✅ server.uptime is a number: ${data.server.uptime} seconds\n`);

        // Test 3: Check memory object has required fields
        console.log('📋 Test 3: Verifying memory object...');
        const memoryFields = ['heapUsed', 'heapTotal', 'rss', 'external'];
        const missingMemoryFields = memoryFields.filter(field => !(field in data.memory));
        
        if (missingMemoryFields.length > 0) {
            console.log(`❌ Missing memory fields: ${missingMemoryFields.join(', ')}\n`);
            return false;
        }
        console.log('✅ All memory fields present');
        console.log(`   heapUsed: ${data.memory.heapUsed} bytes (${Math.round(data.memory.heapUsed / 1024 / 1024)} MB)`);
        console.log(`   heapTotal: ${data.memory.heapTotal} bytes (${Math.round(data.memory.heapTotal / 1024 / 1024)} MB)\n`);

        // Test 4: Verify memory values are reasonable
        console.log('📋 Test 4: Verifying memory values...');
        if (data.memory.heapUsed > data.memory.heapTotal) {
            console.log('❌ heapUsed should not be greater than heapTotal\n');
            return false;
        }
        console.log('✅ Memory values are reasonable (heapUsed <= heapTotal)\n');

        // Test 5: Verify server port
        console.log('📋 Test 5: Verifying server port...');
        if (data.server.port != PORT) {
            console.log(`❌ Expected port ${PORT}, got ${data.server.port}\n`);
            return false;
        }
        console.log(`✅ Server port is correct: ${data.server.port}\n`);

        // Test 6: Verify server status
        console.log('📋 Test 6: Verifying server status...');
        if (data.server.status !== 'running') {
            console.log(`❌ Expected status "running", got "${data.server.status}"\n`);
            return false;
        }
        console.log(`✅ Server status is "running"\n`);

        return true;

    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        console.error(`   Make sure the server is running on port ${PORT}\n`);
        return false;
    }
}

// Run tests
(async () => {
    console.log(`${'='.repeat(60)}`);
    console.log('Server Status API Test');
    console.log(`${'='.repeat(60)}\n`);

    const success = await testStatusEndpoint();

    console.log(`${'='.repeat(60)}`);
    if (success) {
        console.log('✅ All tests passed!');
        console.log(`${'='.repeat(60)}\n`);
        process.exit(0);
    } else {
        console.log('❌ Some tests failed!');
        console.log(`${'='.repeat(60)}\n`);
        process.exit(1);
    }
})();
