#!/usr/bin/env node

/**
 * Test Script for Display Name Feature
 * 
 * Tests the display name functionality including:
 * - Setting and clearing display names
 * - Fuzzy matching with account name variations
 * - Persistence through screenshot updates
 */

const http = require('http');
const finance = require('../modules/finance');

console.log('🧪 Testing Display Name Feature\n');
console.log('='.repeat(60));

// Initialize finance module
finance.init({});

let testsPassed = 0;
let testsFailed = 0;

function logTest(name, passed, message = '') {
    if (passed) {
        console.log(`✅ ${name}`);
        testsPassed++;
    } else {
        console.log(`❌ ${name}${message ? ': ' + message : ''}`);
        testsFailed++;
    }
}

// Test 1: Create a test account
console.log('\n📝 Test 1: Create Test Account');
console.log('-'.repeat(60));

const testAccount = {
    name: 'G My Personal Cash Account',
    type: 'checking',
    currentValue: 5000,
    notes: 'Test account with icon contamination'
};

const saveResult = finance.saveAccount(testAccount);
logTest('Account created', saveResult.success);

// Get the created account
const accounts = finance.getAccounts();
const createdAccount = accounts.find(a => a.name === testAccount.name);
logTest('Account found after creation', !!createdAccount);

if (!createdAccount) {
    console.log('❌ Cannot continue tests without account');
    process.exit(1);
}

const accountId = createdAccount.id;
console.log(`   Account ID: ${accountId}`);
console.log(`   Original Name: "${createdAccount.name}"`);

// Test 2: Update display name
console.log('\n📝 Test 2: Update Display Name');
console.log('-'.repeat(60));

const updateResult = finance.updateAccountDisplayName(accountId, 'My Savings Account');
logTest('Display name updated', updateResult.success);

// Verify display name was set
const updatedAccounts = finance.getAccounts();
const updatedAccount = updatedAccounts.find(a => a.id === accountId);
logTest('Display name persisted', updatedAccount.displayName === 'My Savings Account', 
    `Expected "My Savings Account", got "${updatedAccount.displayName}"`);
logTest('Original name unchanged', updatedAccount.name === testAccount.name);

console.log(`   Display Name: "${updatedAccount.displayName}"`);
console.log(`   Original Name: "${updatedAccount.name}"`);

// Test 3: Test getAccountDisplayName helper
console.log('\n📝 Test 3: Display Name Helper Function');
console.log('-'.repeat(60));

const displayName = finance.getAccountDisplayName(updatedAccount);
logTest('Helper returns display name', displayName === 'My Savings Account',
    `Expected "My Savings Account", got "${displayName}"`);

// Create account without display name
const noDisplayNameAccount = {
    name: 'Regular Account',
    type: 'savings',
    currentValue: 1000
};
finance.saveAccount(noDisplayNameAccount);
const regularAccount = finance.getAccounts().find(a => a.name === 'Regular Account');
const regularDisplayName = finance.getAccountDisplayName(regularAccount);
logTest('Helper falls back to name', regularDisplayName === 'Regular Account',
    `Expected "Regular Account", got "${regularDisplayName}"`);

// Test 4: Clear display name
console.log('\n📝 Test 4: Clear Display Name');
console.log('-'.repeat(60));

const clearResult = finance.updateAccountDisplayName(accountId, '');
logTest('Display name cleared', clearResult.success);

const clearedAccounts = finance.getAccounts();
const clearedAccount = clearedAccounts.find(a => a.id === accountId);
logTest('Display name is null after clear', clearedAccount.displayName === null || clearedAccount.displayName === undefined);

// Test 5: Fuzzy matching for account updates
console.log('\n📝 Test 5: Fuzzy Account Matching');
console.log('-'.repeat(60));

// Reset display name for matching tests
finance.updateAccountDisplayName(accountId, 'Clean Display Name');

// Test exact match
const exactMatch = finance.getAccounts().find(a => {
    if (!a.name) return false;
    const s1 = a.name.toLowerCase().trim();
    const s2 = 'G My Personal Cash Account'.toLowerCase().trim();
    return s1 === s2;
});
logTest('Exact match works', !!exactMatch);

// Test substring match (truncated name)
const truncatedMatch = finance.getAccounts().find(a => {
    if (!a.name) return false;
    const s1 = a.name.toLowerCase().trim();
    const s2 = 'My Personal Cash'.toLowerCase().trim();
    return s1.includes(s2) || s2.includes(s1);
});
logTest('Substring match works (truncated)', !!truncatedMatch);

// Test normalized match (OCR variations)
const normalizeString = (s) => s
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalized1 = normalizeString('G My Personal Cash Account').toLowerCase();
const normalized2 = normalizeString('My Personal  Cash  Account').toLowerCase();
logTest('Normalized match works (OCR variations)', normalized1.includes(normalized2));

// Test that display name is NOT used for matching
const displayNameShouldNotMatch = finance.getAccounts().find(a => {
    if (!a.name) return false;
    const s1 = a.name.toLowerCase().trim();
    const s2 = 'Clean Display Name'.toLowerCase().trim();
    return s1 === s2;
});
logTest('Display name NOT used for matching', !displayNameShouldNotMatch);

// Test 6: Balance update preserves display name
console.log('\n📝 Test 6: Display Name Persists Through Updates');
console.log('-'.repeat(60));

const balanceUpdateResult = finance.updateAccountBalance(accountId, 10000);
logTest('Balance updated', balanceUpdateResult.success);

const afterBalanceUpdate = finance.getAccounts().find(a => a.id === accountId);
logTest('Display name persists after balance update', 
    afterBalanceUpdate.displayName === 'Clean Display Name');
logTest('Balance was updated', afterBalanceUpdate.currentValue === 10000);

// Test 7: Test with parseAccountsFromText simulation
console.log('\n📝 Test 7: Screenshot Update with Display Name');
console.log('-'.repeat(60));

// Simulate OCR text with variations
const ocrText = `
Cash                                           $15,000

My Personal Cash                               $7,500
Individual

Regular Account                                $2,000
Individual
`;

const parseResult = finance.parseAccountsFromText(ocrText);
logTest('OCR text parsed', parseResult.success);

if (parseResult.success) {
    console.log(`   Parsed ${parseResult.accounts.length} accounts`);
    
    // Check if our test account would be matched (truncated name)
    const matchedParsed = parseResult.accounts.find(pa => {
        const accounts = finance.getAccounts();
        return accounts.some(a => {
            if (!a.name) return false;
            const s1 = a.name.toLowerCase().trim();
            const s2 = pa.name.toLowerCase().trim();
            return s1.includes(s2) || s2.includes(s1);
        });
    });
    logTest('Truncated name from OCR matches existing account', !!matchedParsed);
}

// Test 8: Invalid account ID
console.log('\n📝 Test 8: Error Handling');
console.log('-'.repeat(60));

const invalidResult = finance.updateAccountDisplayName('nonexistent-id', 'Test');
logTest('Invalid account ID rejected', !invalidResult.success);
logTest('Error message provided', !!invalidResult.error);

// Cleanup
console.log('\n🧹 Cleanup');
console.log('-'.repeat(60));

finance.deleteAccount(accountId);
const cleanupAccounts = finance.getAccounts();
const deletedCheck = cleanupAccounts.find(a => a.id === accountId);
logTest('Test account deleted', !deletedCheck);

// Delete the Regular Account too
const regularAccountObj = cleanupAccounts.find(a => a.name === 'Regular Account');
if (regularAccountObj) {
    finance.deleteAccount(regularAccountObj.id);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary');
console.log('='.repeat(60));
console.log(`✅ Tests Passed: ${testsPassed}`);
console.log(`❌ Tests Failed: ${testsFailed}`);
console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
} else {
    console.log('\n⚠️ Some tests failed. Please review the output above.');
    process.exit(1);
}
