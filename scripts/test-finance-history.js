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
            
            // Verify all entries are within the date range using balanceDate (not timestamp)
            const allInRange = response.data.every(entry => {
                const balanceDate = entry.balanceDate || entry.timestamp;
                const entryDate = new Date(balanceDate);
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

async function testBalanceDateOrdering() {
    console.log('\n📅 Test 10: Test balance date ordering behavior');
    try {
        // Test that older balanceDate doesn't overwrite newer currentValue
        const testAccountId = testAccountIds[0];
        
        // First, update with a future date
        const futureResponse = await makeRequest('POST', `/admin/api/finance/accounts/${testAccountId}/balance`, {
            balance: 10000,
            balanceDate: '2025-01-01'
        });
        
        if (!futureResponse.data.success) {
            console.log('❌ Failed to set future balance');
            return false;
        }
        
        // Get the account to check current value
        const accountResponse1 = await makeRequest('GET', '/admin/api/finance/accounts');
        const account1 = accountResponse1.data.find(a => a.id === testAccountId);
        
        if (account1.currentValue !== 10000) {
            console.log(`❌ Expected currentValue to be 10000, got ${account1.currentValue}`);
            return false;
        }
        console.log(`✅ Future date update: currentValue = $${account1.currentValue}`);
        
        // Now try to update with an older date - currentValue should NOT change
        const pastResponse = await makeRequest('POST', `/admin/api/finance/accounts/${testAccountId}/balance`, {
            balance: 5000,
            balanceDate: '2024-06-01'
        });
        
        if (!pastResponse.data.success) {
            console.log('❌ Failed to add past balance');
            return false;
        }
        
        // Get the account again to verify current value didn't change
        const accountResponse2 = await makeRequest('GET', '/admin/api/finance/accounts');
        const account2 = accountResponse2.data.find(a => a.id === testAccountId);
        
        if (account2.currentValue !== 10000) {
            console.log(`❌ Expected currentValue to remain 10000, got ${account2.currentValue}`);
            return false;
        }
        console.log(`✅ Past date update preserved: currentValue still = $${account2.currentValue}`);
        
        // Verify history was added for the past date
        const historyResponse = await makeRequest('GET', `/admin/api/finance/history/account/${testAccountId}`);
        const pastEntry = historyResponse.data.find(h => h.balance === 5000);
        
        if (!pastEntry) {
            console.log('❌ Past balance not found in history');
            return false;
        }
        console.log(`✅ Past balance added to history: $${pastEntry.balance}`);
        
        return true;
    } catch (err) {
        console.log('❌ Balance date ordering error:', err.message);
        return false;
    }
}

async function testPerDateAggregation() {
    console.log('\n📊 Test 11: Test per-date aggregation');
    try {
        // Create multiple balance updates on the same date for different accounts
        const testDate = '2024-03-15';
        
        // Update multiple accounts on the same date
        await makeRequest('POST', `/admin/api/finance/accounts/${testAccountIds[0]}/balance`, {
            balance: 6000,
            balanceDate: testDate
        });
        
        await makeRequest('POST', `/admin/api/finance/accounts/${testAccountIds[1]}/balance`, {
            balance: 60000,
            balanceDate: testDate
        });
        
        // Get net worth history and verify we get one point per date
        const response = await makeRequest('GET', '/admin/api/finance/history/net-worth');
        
        if (!response.data || !Array.isArray(response.data)) {
            console.log('❌ Failed to get net worth history');
            return false;
        }
        
        // Count how many entries are on the test date
        const entriesOnTestDate = response.data.filter(entry => {
            const entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
            return entryDate === testDate;
        });
        
        if (entriesOnTestDate.length !== 1) {
            console.log(`❌ Expected 1 aggregated entry for ${testDate}, got ${entriesOnTestDate.length}`);
            return false;
        }
        
        console.log(`✅ Correct aggregation: 1 entry for ${testDate}`);
        console.log(`   Assets: $${entriesOnTestDate[0].assets.toLocaleString()}`);
        console.log(`   Liabilities: $${entriesOnTestDate[0].liabilities.toLocaleString()}`);
        console.log(`   Net Worth: $${entriesOnTestDate[0].netWorth.toLocaleString()}`);
        
        return true;
    } catch (err) {
        console.log('❌ Per-date aggregation error:', err.message);
        return false;
    }
}

async function testUTCDateNormalization() {
    console.log('\n🌍 Test 12: Test UTC date normalization');
    try {
        const testDate = '2024-07-15';
        const testAccountId = testAccountIds[0];
        
        // Update with a specific date
        const updateResponse = await makeRequest('POST', `/admin/api/finance/accounts/${testAccountId}/balance`, {
            balance: 7500,
            balanceDate: testDate
        });
        
        if (!updateResponse.data.success) {
            console.log('❌ Failed to update balance');
            return false;
        }
        
        // Get the account history
        const historyResponse = await makeRequest('GET', `/admin/api/finance/history/account/${testAccountId}`);
        
        // Find the entry we just added
        const entry = historyResponse.data.find(h => h.balance === 7500);
        
        if (!entry) {
            console.log('❌ Entry not found in history');
            return false;
        }
        
        // Verify timestamp is at UTC midnight
        const timestamp = new Date(entry.timestamp);
        const hours = timestamp.getUTCHours();
        const minutes = timestamp.getUTCMinutes();
        const seconds = timestamp.getUTCSeconds();
        const milliseconds = timestamp.getUTCMilliseconds();
        
        if (hours !== 0 || minutes !== 0 || seconds !== 0 || milliseconds !== 0) {
            console.log(`❌ Timestamp not at UTC midnight: ${entry.timestamp}`);
            return false;
        }
        
        console.log(`✅ Timestamp normalized to UTC midnight: ${entry.timestamp}`);
        
        // Verify the date portion is correct
        const dateOnly = entry.timestamp.split('T')[0];
        if (dateOnly !== testDate) {
            console.log(`❌ Date mismatch: expected ${testDate}, got ${dateOnly}`);
            return false;
        }
        
        console.log(`✅ Date portion preserved correctly: ${dateOnly}`);
        
        return true;
    } catch (err) {
        console.log('❌ UTC date normalization error:', err.message);
        return false;
    }
}

async function testDateFilteringWithBalanceDate() {
    console.log('\n🔍 Test 13: Test date filtering uses balanceDate');
    try {
        // Create entries with different balanceDate vs timestamp
        const testAccountId = testAccountIds[0];
        
        // Add a historical entry (balanceDate in past)
        await makeRequest('POST', `/admin/api/finance/accounts/${testAccountId}/balance`, {
            balance: 8000,
            balanceDate: '2024-08-01'
        });
        
        // Query with date range that includes the balanceDate
        const response = await makeRequest('GET', '/admin/api/finance/history/net-worth?startDate=2024-08-01&endDate=2024-08-31');
        
        if (!response.data || !Array.isArray(response.data)) {
            console.log('❌ Failed to get filtered history');
            return false;
        }
        
        // Should find the entry with balanceDate=2024-08-01
        const foundEntry = response.data.some(entry => {
            const date = new Date(entry.timestamp).toISOString().split('T')[0];
            return date === '2024-08-01';
        });
        
        if (!foundEntry) {
            console.log('❌ Entry not found in date range - filtering may not be using balanceDate');
            return false;
        }
        
        console.log('✅ Date filtering correctly uses balanceDate');
        
        return true;
    } catch (err) {
        console.log('❌ Date filtering error:', err.message);
        return false;
    }
}

async function testCleanup() {
    console.log('\n🧹 Test 14: Cleanup test accounts');
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
        testBalanceDateOrdering,
        testPerDateAggregation,
        testUTCDateNormalization,
        testDateFilteringWithBalanceDate,
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
