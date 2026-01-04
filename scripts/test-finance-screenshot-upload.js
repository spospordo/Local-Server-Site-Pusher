#!/usr/bin/env node

/**
 * Test Script for Finance Screenshot Upload Feature
 * 
 * Tests the OCR parsing functionality with sample text data
 */

const finance = require('../modules/finance');

console.log('🧪 Testing Finance Screenshot Upload Feature\n');

// Initialize finance module with mock config
finance.init({});

// Test 1: Test parsing function with sample OCR text
console.log('Test 1: Parse sample account text');
console.log('=' .repeat(50));

const sampleText = `
$100,000
+3.14% all worth at 00:00

Goals

Cash                                           $10,000

My Personal Cash Account                       $1,000
Individual 3,325 APY

Home Projects                                  $1,000
Individual

Emergency fund                                 $1,000
Individual

Joint Cash Account                             $1,000
Individual 3.55% APY

Vacation                                       $600

Individual Cash Account                        10,000
Investment: Individual Cash Account            $1,000

Savings                                        $1,000
Individual

Checking                                       $1,000
Chase
2 days ago

Investments                                    $10,000

My Roth IRA                                    $1,000
Roth IRA

Individual Investment Account                  $1,000
Individual

S&P 500 Direct Portfolio                       $1,000
Individual

Wall Replacement Investment Account            $1,000
Individual
Temporarily Down

Automated Bond Portfolio                       $1,000
Individual

Individual Automated Bond Ladder               $1,000
Individual

Individual Investment Account                  $1,000
Wealthfront - Individual Automated Investing

Roth IRA                                       $1,000
Roth IRA
5 days ago

Traditional 401K                               $1,000
Employer Plan - Retirement Plan

401K                                           $1,000
Employer Plan - Build Your Retirement Plan
24 hours ago

Real estate                                    $10,000

Home                                           $1,000
Redfin
2 days ago

Home                                           $1,000
Redfin

Liabilities                                    $10,000

Credit Card                                    $000
Chase
2 days ago

Credit Card                                    $1,000
Chase

Mortgage                                       $1,000
Chase
6 days ago
`;

// Parse the text using the internal parsing function (we'll need to export it for testing)
const parseResult = finance.parseAccountsFromText ? 
  finance.parseAccountsFromText(sampleText) : 
  { success: false, error: 'Parse function not exported' };

if (parseResult.success) {
  console.log(`✅ Successfully parsed ${parseResult.accounts.length} accounts`);
  console.log(`   Net Worth: $${parseResult.netWorth ? parseResult.netWorth.toLocaleString() : 'N/A'}`);
  console.log(`   Groups found: ${Object.keys(parseResult.groups).length}`);
  
  console.log('\n📋 Accounts by category:');
  const categories = {};
  parseResult.accounts.forEach(account => {
    if (!categories[account.category]) {
      categories[account.category] = [];
    }
    categories[account.category].push(account);
  });
  
  Object.keys(categories).forEach(category => {
    console.log(`\n  ${category.toUpperCase()}:`);
    categories[category].forEach(account => {
      console.log(`    - ${account.name}: $${account.balance.toLocaleString()}`);
    });
  });
  
  console.log('\n');
} else {
  console.error(`❌ Parsing failed: ${parseResult.error}`);
  if (parseResult.rawText) {
    console.log('\nFirst 500 chars of text:');
    console.log(parseResult.rawText);
  }
}

// Test 2: API endpoint test (requires running server)
console.log('\nTest 2: API Endpoint Test');
console.log('=' .repeat(50));
console.log('ℹ️  To test the full upload feature:');
console.log('   1. Start the server: npm start');
console.log('   2. Log in to admin dashboard');
console.log('   3. Navigate to Finance > My Data');
console.log('   4. Upload a screenshot using the upload button');
console.log('   5. Check the console for processing logs');
console.log('\n✅ Test script completed!\n');

// Note: We can't actually test the full OCR without a real image file
// and the server running. This test validates the parsing logic only.
