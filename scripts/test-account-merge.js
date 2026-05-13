#!/usr/bin/env node

/**
 * Test script for account merge functionality
 * This script tests the merge feature by creating test accounts and merging them
 */

const finance = require('../modules/finance');
const path = require('path');

// Test configuration
const TEST_DELAY_MS = 100; // Delay between account creation to ensure different timestamps

// Initialize finance module with dummy config
finance.init({ configPath: path.join(__dirname, '..', 'config') });

console.log('🧪 Testing Account Merge Functionality\n');

async function runTests() {
  // Pre-cleanup: remove any leftover test accounts from a prior failed run
  console.log('🧹 Cleaning up any existing test accounts...');
  const preCleanup = finance.getAccounts().filter(a => a.name.startsWith('Test '));
  for (const acc of preCleanup) {
    finance.deleteAccount(acc.id);
  }
  console.log(`   Deleted ${preCleanup.length} existing test account(s)\n`);

  let allPassed = true;

  try {
    // Step 1: Create test accounts
    console.log('📝 Step 1: Creating test accounts...');
    
    const account1 = {
      name: 'Test Savings Account',
      type: 'savings',
      currentValue: 5000,
      notes: 'First test account'
    };
    
    const account2 = {
      name: 'Test Savings Acct',
      type: 'savings',
      currentValue: 5500,
      notes: 'Duplicate account (more recent)'
    };
    
    const account3 = {
      name: 'Test Checking',
      type: 'checking',
      currentValue: 2000,
      notes: 'Different account (should not be merged)'
    };
    
    // Save accounts with slight delay to ensure different createdAt timestamps
    const result1 = finance.saveAccount(account1);
    await new Promise(resolve => setTimeout(resolve, TEST_DELAY_MS));
    
    const result2 = finance.saveAccount(account2);
    await new Promise(resolve => setTimeout(resolve, TEST_DELAY_MS));
    
    const result3 = finance.saveAccount(account3);
    
    if (!result1.success || !result2.success || !result3.success) {
      console.error('❌ Failed to create test accounts');
      allPassed = false;
    } else {
      // Get created accounts
      const accounts = finance.getAccounts();
      const testAccounts = accounts.filter(a => a.name.startsWith('Test '));
      
      if (testAccounts.length < 3) {
        console.error('❌ Test accounts not created properly');
        allPassed = false;
      } else {
        console.log(`✅ Created ${testAccounts.length} test accounts:`);
        testAccounts.forEach(acc => {
          console.log(`   - ${acc.name}: $${acc.currentValue} (ID: ${acc.id})`);
        });
        
        // Step 2: Perform merge
        console.log('\n🔀 Step 2: Merging duplicate accounts...');
        
        const accountsToMerge = testAccounts.filter(a => a.name.includes('Savings'));
        
        if (accountsToMerge.length < 2) {
          console.error('❌ Not enough savings accounts to merge');
          allPassed = false;
        } else {
          const mergeIds = accountsToMerge.map(a => a.id);
          console.log(`   Merging account IDs: ${mergeIds.join(', ')}`);
          
          const mergeResult = finance.mergeAccounts(mergeIds);
          
          if (!mergeResult.success) {
            console.error('❌ Merge failed:', mergeResult.error);
            allPassed = false;
          } else {
            console.log(`✅ Successfully merged ${mergeResult.mergedCount} account(s)`);
            console.log(`   Surviving account: ${mergeResult.survivingAccount.name}`);
            console.log(`   Merged accounts: ${mergeResult.mergedAccountNames.join(', ')}`);
            console.log(`   Previous names stored: ${mergeResult.previousNames.join(', ')}`);
            
            // Step 3: Verify merge
            console.log('\n🔍 Step 3: Verifying merge results...');
            
            const accountsAfter = finance.getAccounts();
            const testAccountsAfter = accountsAfter.filter(a => a.name.startsWith('Test '));
            
            console.log(`   Accounts remaining: ${testAccountsAfter.length}`);
            
            if (testAccountsAfter.length !== 2) {
              console.error(`❌ Expected 2 accounts after merge, got ${testAccountsAfter.length}`);
              allPassed = false;
            } else {
              const survivingAccount = testAccountsAfter.find(a => a.id === mergeResult.survivingAccount.id);
              
              if (!survivingAccount) {
                console.error('❌ Surviving account not found');
                allPassed = false;
              } else {
                console.log('   Surviving account details:');
                console.log(`   - Name: ${survivingAccount.name}`);
                console.log(`   - Balance: $${survivingAccount.currentValue}`);
                console.log(`   - Previous names: ${survivingAccount.previousNames ? survivingAccount.previousNames.join(', ') : 'none'}`);
                
                if (!survivingAccount.previousNames || survivingAccount.previousNames.length === 0) {
                  console.error('❌ Previous names not stored');
                  allPassed = false;
                } else {
                  console.log('✅ Previous names stored correctly');
                  
                  // Step 4: Verify history
                  console.log('\n📊 Step 4: Checking audit trail...');
                  
                  const history = finance.getHistory();
                  const mergeEntry = history.find(h => h.type === 'accounts_merged');
                  
                  if (!mergeEntry) {
                    console.error('❌ Merge audit entry not found in history');
                    allPassed = false;
                  } else {
                    console.log('✅ Merge audit entry found:');
                    console.log(`   - Merged ${mergeEntry.mergedAccountIds.length} account(s)`);
                    console.log(`   - Surviving: ${mergeEntry.survivingAccountName}`);
                    console.log(`   - Timestamp: ${mergeEntry.timestamp}`);
                    
                    // Step 5: Test lookup by previous name.
                    // The surviving account absorbed the other, so the merged-away account's
                    // name must appear in survivingAccount.previousNames.
                    console.log('\n🔍 Step 5: Testing lookup by previous name...');
                    
                    const mergedAwayName = mergeResult.mergedAccountNames[0];
                    const allAccountsNow = finance.getAccounts();
                    const foundByPrevName = allAccountsNow.find(a =>
                      a.previousNames && a.previousNames.some(n => n === mergedAwayName)
                    );
                    
                    if (!foundByPrevName) {
                      console.error(`❌ Could not find account with "${mergedAwayName}" in previousNames`);
                      allPassed = false;
                    } else {
                      console.log(`✅ Successfully found account by previous name`);
                      console.log(`   Surviving account: ${foundByPrevName.name}`);
                      console.log(`   Previous name stored: ${mergedAwayName}`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
    allPassed = false;
  } finally {
    // Always clean up test accounts
    console.log('\n🧹 Cleaning up test accounts...');
    const cleanupAccounts = finance.getAccounts().filter(a => a.name.startsWith('Test '));
    for (const acc of cleanupAccounts) {
      finance.deleteAccount(acc.id);
    }
    console.log(`✅ Deleted ${cleanupAccounts.length} test account(s)`);
  }

  if (allPassed) {
    console.log('\n✅ All tests passed! 🎉\n');
  } else {
    console.error('\n❌ Some tests failed.\n');
    process.exitCode = 1;
  }
}

// Run tests
runTests().catch(console.error);
