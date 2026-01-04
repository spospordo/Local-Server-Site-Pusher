#!/usr/bin/env node

/**
 * Test Script for Finance History Functionality
 * 
 * This script tests the new Finance History features including:
 * - History API endpoints
 * - Data aggregation by account type
 * - Net worth history calculation
 * - Single account balance history
 * - Date filtering
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

// Test configuration
let sessionCookie = '';
const testAccountIds = [];

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        if (sessionCookie) {
            options.headers['Cookie'] = sessionCookie;
        }

        const req = http.request(options, (res) => {
            let body = '';
            
            // Capture session cookie from login
            if (res.headers['set-cookie']) {
                sessionCookie = res.headers['set-cookie'][0].split(';')[0];
            }

            res.on('data', (chunk) => {
                body += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    resolve({ status: res.statusCode, data: response, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body, headers: res.headers });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

// Test functions
async function testLogin() {
    console.log('\n🔐 Test 1: Login to admin');
    try {
        const response = await makeRequest('POST', '/admin/login', {
            username: 'admin',
            password: 'admin123'
        });

        if (sessionCookie && response.status === 302) {
            console.log('✅ Login successful - session cookie obtained');
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

async function testCreateTestAccounts() {
    console.log('\n📊 Test 2: Create test accounts with historical data');
    try {
        const accounts = [
            { name: 'Test Savings', type: 'savings', currentValue: 5000 },
            { name: 'Test 401k', type: '401k', currentValue: 50000 },
            { name: 'Test Credit Card', type: 'credit_card', currentValue: 2000 }
        ];

        for (const account of accounts) {
            const response = await makeRequest('POST', '/admin/api/finance/accounts', account);
            
            if (response.status === 200 && response.data.success) {
                console.log(`✅ Created account: ${account.name}`);
            } else {
                console.log(`❌ Failed to create account: ${account.name}`);
                return false;
            }
        }

        // Fetch the created accounts to get their IDs
        const getResponse = await makeRequest('GET', '/admin/api/finance/accounts');
        if (getResponse.status === 200 && Array.isArray(getResponse.data)) {
            // Filter to only test accounts created just now
            const testAccounts = getResponse.data.filter(acc => 
                acc.name.startsWith('Test ')
            );
            
            testAccounts.forEach(acc => {
                testAccountIds.push(acc.id);
                console.log(`   Found account ID: ${acc.id} for ${acc.name}`);
            });
            
            return testAccountIds.length >= accounts.length;
        }

        return false;
    } catch (err) {
        console.log('❌ Account creation error:', err.message);
        return false;
    }
}

async function testUpdateAccountBalances() {
    console.log('\n💰 Test 3: Update account balances to create history');
    try {
        // Create history by updating balances with different dates
        const updates = [
            { accountId: testAccountIds[0], balance: 4500, date: '2024-01-01' },
            { accountId: testAccountIds[0], balance: 4800, date: '2024-06-01' },
            { accountId: testAccountIds[0], balance: 5000, date: '2024-12-01' },
            { accountId: testAccountIds[1], balance: 45000, date: '2024-01-01' },
            { accountId: testAccountIds[1], balance: 47500, date: '2024-06-01' },
            { accountId: testAccountIds[1], balance: 50000, date: '2024-12-01' },
        ];

        for (const update of updates) {
            const response = await makeRequest('POST', `/admin/api/finance/accounts/${update.accountId}/balance`, {
                balance: update.balance,
                balanceDate: update.date
            });
            
            if (response.status === 200 && response.data.success) {
                console.log(`✅ Updated balance for account ${update.accountId}: $${update.balance} on ${update.date}`);
            } else {
                console.log(`❌ Failed to update balance for account ${update.accountId}`);
            }
        }

        return true;
    } catch (err) {
        console.log('❌ Balance update error:', err.message);
        return false;
    }
}

async function testGetHistory() {
    console.log('\n📜 Test 4: Get basic history');
    try {
        const response = await makeRequest('GET', '/admin/api/finance/history');
        
        if (response.status === 200 && Array.isArray(response.data)) {
            console.log(`✅ Retrieved ${response.data.length} history entries`);
            console.log(`   Sample entry:`, response.data[0]);
            return true;
        } else {
            console.log('❌ Failed to get history:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ History retrieval error:', err.message);
        return false;
    }
}

async function testGetHistoryByAccountType() {
    console.log('\n📊 Test 5: Get history grouped by account type');
    try {
        const response = await makeRequest('GET', '/admin/api/finance/history/by-type');
        
        if (response.status === 200 && typeof response.data === 'object') {
            const categories = Object.keys(response.data);
            console.log(`✅ Retrieved history for ${categories.length} account categories`);
            console.log(`   Categories: ${categories.join(', ')}`);
            
            // Show sample data for each category
            categories.forEach(cat => {
                console.log(`   ${cat}: ${response.data[cat].length} entries`);
            });
            
            return true;
        } else {
            console.log('❌ Failed to get history by type:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ History by type error:', err.message);
        return false;
    }
}

async function testGetNetWorthHistory() {
    console.log('\n💎 Test 6: Get net worth history');
    try {
        const response = await makeRequest('GET', '/admin/api/finance/history/net-worth');
        
        if (response.status === 200 && Array.isArray(response.data)) {
            console.log(`✅ Retrieved ${response.data.length} net worth snapshots`);
            
            if (response.data.length > 0) {
                const latest = response.data[response.data.length - 1];
                console.log(`   Latest snapshot:`);
                console.log(`   - Net Worth: $${latest.netWorth.toLocaleString()}`);
                console.log(`   - Assets: $${latest.assets.toLocaleString()}`);
                console.log(`   - Liabilities: $${latest.liabilities.toLocaleString()}`);
                console.log(`   - Date: ${new Date(latest.timestamp).toLocaleDateString()}`);
            }
            
            return true;
        } else {
            console.log('❌ Failed to get net worth history:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Net worth history error:', err.message);
        return false;
    }
}

async function testGetAccountBalanceHistory() {
    console.log('\n📈 Test 7: Get single account balance history');
    try {
        const accountId = testAccountIds[0];
        const response = await makeRequest('GET', `/admin/api/finance/history/account/${accountId}`);
        
        if (response.status === 200 && Array.isArray(response.data)) {
            console.log(`✅ Retrieved ${response.data.length} balance snapshots for account ${accountId}`);
            
            if (response.data.length > 0) {
                console.log(`   Account: ${response.data[0].accountName}`);
                response.data.forEach((snapshot, idx) => {
                    const balance = snapshot.balance != null ? snapshot.balance : 0;
                    console.log(`   [${idx + 1}] ${new Date(snapshot.timestamp).toLocaleDateString()}: $${balance.toLocaleString()}`);
                });
            }
            
            return true;
        } else {
            console.log('❌ Failed to get account balance history:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Account balance history error:', err.message);
        return false;
    }
}

async function testHistoryDateFiltering() {
    console.log('\n🗓️  Test 8: Test date range filtering');
    try {
        const startDate = '2024-06-01';
        const endDate = '2024-12-31';
        const response = await makeRequest('GET', `/admin/api/finance/history?startDate=${startDate}&endDate=${endDate}`);
        
        if (response.status === 200 && Array.isArray(response.data)) {
            console.log(`✅ Retrieved ${response.data.length} history entries between ${startDate} and ${endDate}`);
            
            // Verify all entries are within the date range
            const allInRange = response.data.every(entry => {
                const entryDate = new Date(entry.timestamp);
                return entryDate >= new Date(startDate) && entryDate <= new Date(endDate);
            });
            
            if (allInRange) {
                console.log('✅ All entries are within the specified date range');
            } else {
                console.log('⚠️  Some entries are outside the date range');
            }
            
            return true;
        } else {
            console.log('❌ Failed to filter history by date:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Date filtering error:', err.message);
        return false;
    }
}

async function testHistoryAccountFiltering() {
    console.log('\n🔍 Test 9: Test account filtering');
    try {
        const accountId = testAccountIds[0];
        const response = await makeRequest('GET', `/admin/api/finance/history?accountId=${accountId}`);
        
        if (response.status === 200 && Array.isArray(response.data)) {
            console.log(`✅ Retrieved ${response.data.length} history entries for account ${accountId}`);
            
            // Verify all entries are for the specified account
            const allForAccount = response.data.every(entry => entry.accountId === accountId);
            
            if (allForAccount) {
                console.log('✅ All entries are for the specified account');
            } else {
                console.log('⚠️  Some entries are for other accounts');
            }
            
            return true;
        } else {
            console.log('❌ Failed to filter history by account:', response.data);
            return false;
        }
    } catch (err) {
        console.log('❌ Account filtering error:', err.message);
        return false;
    }
}

async function testCleanup() {
    console.log('\n🧹 Test 10: Cleanup test accounts');
    try {
        for (const accountId of testAccountIds) {
            const response = await makeRequest('DELETE', `/admin/api/finance/accounts/${accountId}`);
            
            if (response.status === 200) {
                console.log(`✅ Deleted account ${accountId}`);
            } else {
                console.log(`❌ Failed to delete account ${accountId}`);
            }
        }
        
        return true;
    } catch (err) {
        console.log('❌ Cleanup error:', err.message);
        return false;
    }
}

// Main test runner
async function runTests() {
    console.log('🚀 Starting Finance History API Tests');
    console.log('=====================================');
    
    let passed = 0;
    let failed = 0;

    const tests = [
        testLogin,
        testCreateTestAccounts,
        testUpdateAccountBalances,
        testGetHistory,
        testGetHistoryByAccountType,
        testGetNetWorthHistory,
        testGetAccountBalanceHistory,
        testHistoryDateFiltering,
        testHistoryAccountFiltering,
        testCleanup
    ];

    for (const test of tests) {
        try {
            const result = await test();
            if (result) {
                passed++;
            } else {
                failed++;
            }
        } catch (err) {
            console.log('❌ Test exception:', err.message);
            failed++;
        }
    }

    console.log('\n=====================================');
    console.log('📊 Test Results');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
    
    if (failed === 0) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed');
        process.exit(1);
    }
}

// Check if server is running
http.get(`http://${HOST}:${PORT}/`, (res) => {
    console.log(`✅ Server is running on port ${PORT}`);
    runTests();
}).on('error', (err) => {
    console.error(`❌ Server is not running on port ${PORT}`);
    console.error('Please start the server with: npm start');
    process.exit(1);
});
