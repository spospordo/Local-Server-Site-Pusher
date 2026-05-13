#!/usr/bin/env node

/**
 * Test script for account unmerge functionality
 * This script tests the unmerge feature by creating, merging, and then unmerging test accounts
 */

const finance = require('../modules/finance');
const path = require('path');

// Test configuration
const TEST_DELAY_MS = 100; // Delay between account creation to ensure different timestamps

// Initialize finance module with dummy config
finance.init({ configPath: path.join(__dirname, '..', 'config') });

console.log('🧪 Testing Account Unmerge Functionality\n');

async function runTests() {
  try {
    // Clean up any existing test accounts first
    console.log('🧹 Cleaning up any existing test accounts...');
    const existingAccounts = finance.getAccounts();
    const existingTestAccounts = existingAccounts.filter(a => a.name.startsWith('Test Unmerge'));
    for (const acc of existingTestAccounts) {
      finance.deleteAccount(acc.id);
    }
    console.log(`   Deleted ${existingTestAccounts.length} existing test account(s)\n`);
    
    // Step 1: Create test accounts
    console.log('📝 Step 1: Creating test accounts...');
    
    const account1 = {
      name: 'Test Unmerge Savings 1',
      type: 'savings',
      currentValue: 5000,
      notes: 'First test account for unmerge'
    };
    
    const account2 = {
      name: 'Test Unmerge Savings 2',
      type: 'savings',
      currentValue: 7500,
      notes: 'Second test account for unmerge (more recent)'
    };
    
    const account3 = {
      name: 'Test Unmerge Checking',
      type: 'checking',
      currentValue: 2000,
      notes: 'Different account (should not be affected)'
    };
    
    // Save accounts with slight delay to ensure different timestamps
    const result1 = finance.saveAccount(account1);
    await new Promise(resolve => setTimeout(resolve, TEST_DELAY_MS));
    
    const result2 = finance.saveAccount(account2);
    await new Promise(resolve => setTimeout(resolve, TEST_DELAY_MS));
    
    const result3 = finance.saveAccount(account3);
    
    if (!result1.success || !result2.success || !result3.success) {
      console.error('❌ Failed to create test accounts');
      return;
    }
    
    // Get created accounts
    let accounts = finance.getAccounts();
    let testAccounts = accounts.filter(a => a.name.startsWith('Test Unmerge'));
    
    if (testAccounts.length < 3) {
      console.error('❌ Test accounts not created properly');
      return;
    }
    
    console.log(`✅ Created ${testAccounts.length} test accounts:`);
    testAccounts.forEach(acc => {
      console.log(`   - ${acc.name}: $${acc.currentValue} (ID: ${acc.id})`);
    });
    
    // Add some balance updates to create history
    console.log('\n💰 Adding balance updates to create history...');
    const savingsAccounts = testAccounts.filter(a => a.name.includes('Savings'));
    
    for (const acc of savingsAccounts) {
      await new Promise(resolve => setTimeout(resolve, TEST_DELAY_MS));
      finance.updateAccountBalance(acc.id, acc.currentValue + 100);
      console.log(`   - Updated ${acc.name} balance to $${acc.currentValue + 100}`);
    }
    
    // Step 2: Perform merge
    console.log('\n🔀 Step 2: Merging duplicate accounts...');
    
    const accountsToMerge = testAccounts.filter(a => a.name.includes('Savings'));
    
    if (accountsToMerge.length < 2) {
      console.error('❌ Not enough savings accounts to merge');
      return;
    }
    
    const mergeIds = accountsToMerge.map(a => a.id);
    console.log(`   Merging account IDs: ${mergeIds.join(', ')}`);
    
    const mergeResult = finance.mergeAccounts(mergeIds);
    
    if (!mergeResult.success) {
      console.error('❌ Merge failed:', mergeResult.error);
      return;
    }
    
    console.log(`✅ Successfully merged ${mergeResult.mergedCount} account(s)`);
    console.log(`   Surviving account: ${mergeResult.survivingAccount.name}`);
    console.log(`   Merged accounts: ${mergeResult.mergedAccountNames.join(', ')}`);
    console.log(`   Previous names stored: ${mergeResult.previousNames.join(', ')}`);
    
    const survivingAccountId = mergeResult.survivingAccount.id;
    
    // Step 3: Verify merge
    console.log('\n🔍 Step 3: Verifying merge results...');
    
    accounts = finance.getAccounts();
    testAccounts = accounts.filter(a => a.name.startsWith('Test Unmerge'));
    
    console.log(`   Accounts remaining after merge: ${testAccounts.length}`);
    
    if (testAccounts.length !== 2) {
      console.error(`❌ Expected 2 accounts after merge, got ${testAccounts.length}`);
      return;
    }
    
    const mergedAccount = testAccounts.find(a => a.id === survivingAccountId);
    
    if (!mergedAccount) {
      console.error('❌ Merged account not found');
      return;
    }
    
    console.log('   Merged account details:');
    console.log(`   - Name: ${mergedAccount.name}`);
    console.log(`   - Balance: $${mergedAccount.currentValue}`);
    console.log(`   - Previous names: ${mergedAccount.previousNames ? mergedAccount.previousNames.join(', ') : 'none'}`);
    
    if (!mergedAccount.previousNames || mergedAccount.previousNames.length === 0) {
      console.error('❌ Previous names not stored in merged account');
      return;
    }
    
    console.log('✅ Merge verified successfully');
    
    // Step 4: Perform unmerge
    console.log('\n🔓 Step 4: Unmerging account...');
    
    const unmergeResult = finance.unmergeAccount(survivingAccountId);
    
    if (!unmergeResult.success) {
      console.error('❌ Unmerge failed:', unmergeResult.error);
      return;
    }
    
    console.log(`✅ Successfully unmerged account`);
    console.log(`   Source account: ${unmergeResult.sourceAccount.name}`);
    console.log(`   Recreated ${unmergeResult.recreatedCount} account(s):`);
    unmergeResult.recreatedAccounts.forEach(acc => {
      console.log(`   - ${acc.name}: $${acc.currentValue} (ID: ${acc.id})`);
    });
    
    // Step 5: Verify unmerge
    console.log('\n🔍 Step 5: Verifying unmerge results...');
    
    accounts = finance.getAccounts();
    testAccounts = accounts.filter(a => a.name.startsWith('Test Unmerge'));
    
    console.log(`   Total accounts after unmerge: ${testAccounts.length}`);
    
    if (testAccounts.length !== 3) {
      console.error(`❌ Expected 3 accounts after unmerge (2 savings + 1 checking), got ${testAccounts.length}`);
      return;
    }
    
    // Check that recreated accounts exist
    const recreatedAccountNames = unmergeResult.recreatedAccountNames;
    for (const name of recreatedAccountNames) {
      const found = testAccounts.find(a => a.name === name);
      if (!found) {
        console.error(`❌ Recreated account "${name}" not found`);
        return;
      }
      console.log(`   ✓ Found recreated account: ${name} with balance $${found.currentValue}`);
    }
    
    // Verify that source account no longer has previousNames
    const sourceAccountAfter = testAccounts.find(a => a.id === survivingAccountId);
    if (sourceAccountAfter && sourceAccountAfter.previousNames && sourceAccountAfter.previousNames.length > 0) {
      console.error('❌ Source account still has previousNames after unmerge');
      return;
    }
    console.log('   ✓ Source account previousNames cleared');
    
    // Step 6: Verify history
    console.log('\n📊 Step 6: Checking audit trail...');
    
    const history = finance.getHistory();
    const unmergeEntry = history.find(h => h.type === 'accounts_unmerged');
    
    if (!unmergeEntry) {
      console.error('❌ Unmerge audit entry not found in history');
      return;
    }
    
    console.log('✅ Unmerge audit entry found:');
    console.log(`   - Recreated ${unmergeEntry.recreatedAccountIds.length} account(s)`);
    console.log(`   - Source: ${unmergeEntry.sourceAccountName}`);
    console.log(`   - Timestamp: ${unmergeEntry.timestamp}`);
    console.log(`   - Manual balances used: ${unmergeEntry.manualBalancesUsed}`);
    
    // Check if balance history was restored
    const recreatedAccounts = accounts.filter(a => 
      unmergeResult.recreatedAccountIds.includes(a.id)
    );
    
    for (const acc of recreatedAccounts) {
      const accHistory = finance.getHistory(acc.id);
      if (accHistory.length > 0) {
        console.log(`   - Account "${acc.name}" has ${accHistory.length} history entries`);
      } else {
        console.warn(`   ⚠️  Account "${acc.name}" has no history entries`);
      }
    }
    
    // Step 7: Test clearMergeLink
    console.log('\n🔗 Step 7: Testing clearMergeLink...');

    // Create two more accounts for clearMergeLink test
    const clAcct1 = finance.saveAccount({
      name: 'Test Unmerge CL Source',
      type: 'savings',
      currentValue: 3000,
      notes: 'clearMergeLink test source'
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    const clAcct2 = finance.saveAccount({
      name: 'Test Unmerge CL Merged',
      type: 'savings',
      currentValue: 3500,
      notes: 'clearMergeLink test merged'
    });

    if (!clAcct1.success || !clAcct2.success) {
      console.error('❌ Failed to create clearMergeLink test accounts');
      return;
    }

    const clAccounts = finance.getAccounts().filter(a => a.name.startsWith('Test Unmerge CL'));
    const clMergeIds = clAccounts.map(a => a.id);
    const clMergeResult = finance.mergeAccounts(clMergeIds);

    if (!clMergeResult.success) {
      console.error('❌ clearMergeLink test merge failed:', clMergeResult.error);
      return;
    }

    const clSurvivingId = clMergeResult.survivingAccount.id;
    console.log(`   Merged into: ${clMergeResult.survivingAccount.name}`);
    console.log(`   Previous names before clear: ${clMergeResult.previousNames.join(', ')}`);

    const clearResult = finance.clearMergeLink(clSurvivingId);
    if (!clearResult.success) {
      console.error('❌ clearMergeLink failed:', clearResult.error);
      return;
    }

    const clAccountAfter = finance.getAccounts().find(a => a.id === clSurvivingId);
    if (!clAccountAfter) {
      console.error('❌ Account disappeared after clearMergeLink');
      return;
    }
    if (clAccountAfter.previousNames && clAccountAfter.previousNames.length > 0) {
      console.error('❌ previousNames not cleared by clearMergeLink');
      return;
    }

    console.log('✅ clearMergeLink succeeded:');
    console.log(`   - Account "${clAccountAfter.name}" still exists`);
    console.log(`   - previousNames cleared (cleared names: ${clearResult.clearedNames.join(', ')})`);

    // Clean up
    console.log('\n🧹 Cleaning up test accounts...');
    
    const cleanupAccounts = finance.getAccounts().filter(a => 
      a.name.startsWith('Test Unmerge')
    );
    
    for (const acc of cleanupAccounts) {
      finance.deleteAccount(acc.id);
    }
    
    console.log(`✅ Deleted ${cleanupAccounts.length} test account(s)`);
    
    console.log('\n✅ All unmerge tests passed! 🎉\n');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
  }
}

// Run tests
runTests().catch(console.error);
