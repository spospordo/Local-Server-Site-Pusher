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

// Sample text with icon contamination and wrapped names (simulating real OCR output)
const sampleText = `
$100,000
+3.14% all worth at 00:00

Goals

Cash                                           $10,000

G My Personal Cash Account                     $1,000
Individual 3,325 APY

anHome Projects                                $1,000
Individual

anEmergency fund                               $1,000
Individual

Joint Cash Account                             $1,000
Individual 3.55% APY

Vacation                                       $600

Individual Cash Account ( )                    10,000
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

Individual Investment Account ( )              $1,000
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

// Expected accounts that should be parsed (for validation)
const expectedAccounts = [
  'My Personal Cash Account',
  'Home Projects',
  'Emergency fund',
  'Joint Cash Account',
  'Vacation',
  'Individual Cash Account',
  'Savings',
  'Checking',
  'My Roth IRA',
  'Individual Investment Account',
  'S&P 500 Direct Portfolio',
  'Wall Replacement Investment Account',
  'Automated Bond Portfolio',
  'Individual Automated Bond Ladder',
  'Roth IRA',
  'Traditional 401K',
  '401K',
  'Home',
  'Credit Card',
  'Mortgage'
];

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
  
  // Validation: Check for expected accounts
  console.log('\n🔍 Validation Results:');
  console.log('=' .repeat(50));
  
  const parsedNames = parseResult.accounts.map(a => a.name.toLowerCase());
  const missingAccounts = [];
  const contaminatedAccounts = [];
  
  expectedAccounts.forEach(expectedName => {
    const found = parsedNames.some(parsed => 
      parsed.includes(expectedName.toLowerCase()) || 
      expectedName.toLowerCase().includes(parsed)
    );
    if (!found) {
      missingAccounts.push(expectedName);
    }
  });
  
  // Check for icon contamination
  parseResult.accounts.forEach(account => {
    // Check if name starts with 1-3 lowercase letters followed by uppercase (icon pattern)
    if (/^[a-z]{1,3}[A-Z]/.test(account.name)) {
      contaminatedAccounts.push(account.name);
    }
  });
  
  if (missingAccounts.length === 0) {
    console.log('✅ All expected accounts were captured!');
  } else {
    console.log(`⚠️  Missing ${missingAccounts.length} expected account(s):`);
    missingAccounts.forEach(name => console.log(`   - ${name}`));
  }
  
  if (contaminatedAccounts.length === 0) {
    console.log('✅ No icon character contamination detected!');
  } else {
    console.log(`⚠️  Found ${contaminatedAccounts.length} account(s) with potential icon contamination:`);
    contaminatedAccounts.forEach(name => console.log(`   - ${name}`));
  }
  
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
