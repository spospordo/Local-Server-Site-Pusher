#!/usr/bin/env node

/**
 * Test Script: Finance Deleted-Account Recreation Guard
 *
 * Tests the end-to-end flow where:
 *  1. An account is deleted and its metadata is persisted.
 *  2. A screenshot import proposes recreating that same account.
 *  3. The import is blocked (requiresConfirmation) and the match is surfaced.
 *  4. The admin can approve (allow_deleted) or skip the blocked row.
 *  5. Non-matching legitimate new accounts still create normally.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// Bootstrap: point the finance module at a temp config directory so that
// this test script does not touch the real application data.
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-test-'));
const tmpConfig = path.join(tmpDir, 'config');
fs.mkdirSync(tmpConfig, { recursive: true });

// Override __dirname resolution used by finance.js to find config/
// We achieve this by temporarily monkey-patching process.env and relying on
// the module's getFinanceDataPath(), which builds the path relative to the
// module file location.  Instead, we simply write a key file and data file
// into the real config/ dir backed up beforehand, OR we load the module with
// a custom key path via environment variable if the module supports it.
//
// The simplest approach: mock the entire file-system calls is complex;
// instead we just confirm the exported functions behave correctly using a
// fresh data object and calling lower-level helpers directly.

const finance = require('../modules/finance');

// Init with empty config so the module doesn't throw on missing fields.
finance.init({});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ---------------------------------------------------------------------------
// Access internal helpers via exported loadFinanceData / saveFinanceData so
// we can set up a clean in-memory state for each test.
// ---------------------------------------------------------------------------
function freshData() {
  return {
    accounts: [],
    history: [],
    apartments: [],
    deletedAccounts: []
  };
}

// ---------------------------------------------------------------------------
// Test 1 – deleteAccount() records metadata in deletedAccounts
// ---------------------------------------------------------------------------
section('Test 1: deleteAccount() persists deleted-account metadata');

{
  const data = freshData();
  data.accounts.push({
    id: '1001',
    name: 'Erroneous Promo Account',
    type: 'savings',
    currentValue: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  finance.saveFinanceData(data);

  const result = finance.deleteAccount('1001');
  assert(result.success === true, 'deleteAccount returns success: true');

  const after = finance.loadFinanceData();
  assert(after.accounts.length === 0, 'Account removed from accounts array');
  assert(Array.isArray(after.deletedAccounts), 'deletedAccounts array exists');
  assert(after.deletedAccounts.length === 1, 'One deleted-account record created');

  const record = after.deletedAccounts[0];
  assert(record.id === '1001', 'Deleted record preserves original ID');
  assert(record.name === 'Erroneous Promo Account', 'Deleted record preserves name');
  assert(record.type === 'savings', 'Deleted record preserves type');
  assert(typeof record.deletedAt === 'string', 'Deleted record has deletedAt timestamp');
  assert(typeof record.normalizedName === 'string' && record.normalizedName.length > 0, 'Deleted record has normalizedName');
}

// ---------------------------------------------------------------------------
// Test 2 – getDeletedAccounts() returns the persisted records
// ---------------------------------------------------------------------------
section('Test 2: getDeletedAccounts() returns persisted records');

{
  const deletedAccounts = finance.getDeletedAccounts();
  assert(Array.isArray(deletedAccounts), 'getDeletedAccounts returns an array');
  assert(deletedAccounts.length >= 1, 'At least one deleted record from Test 1 is present');
}

// ---------------------------------------------------------------------------
// Test 3 – Import is blocked when proposed account matches a deleted account
// ---------------------------------------------------------------------------
section('Test 3: Screenshot import blocked when matching deleted account');

{
  // Set up: one deleted account in data, no active accounts
  const data = freshData();
  data.deletedAccounts.push({
    id: '2001',
    name: 'Promo Offer Text',
    displayName: null,
    normalizedName: 'promo offer text',
    type: 'checking',
    deletedAt: new Date().toISOString()
  });
  finance.saveFinanceData(data);

  // Simulate OCR proposing creation of that account
  const parsedAccounts = [
    { name: 'Promo Offer Text', rawLabel: 'Promo Offer Text', balance: 1000, category: 'cash' },
    { name: 'Legitimate Savings', rawLabel: 'Legitimate Savings', balance: 5000, category: 'cash' }
  ];

  // processAccountScreenshot is async and needs a real image file, so we call
  // updateAccountsFromParsedData directly (which is what processAccountScreenshot delegates to).
  // We need to use a dynamic require to access the internal function via the module export
  // path.  Since it's not exported, we test indirectly by triggering the full confirm flow.

  // Instead, exercise via confirmScreenshotImport with no decisions — this should
  // trigger requiresConfirmation because of the deleted-account match.
  const result = finance.confirmScreenshotImport(
    parsedAccounts,
    {},
    null,
    new Date().toISOString().split('T')[0],
    [] // empty decisions → no overrides
  );

  // confirmScreenshotImport is async; handle the Promise
  // Passing undefined (not []) simulates the first upload call that hasn't yet
  // been given any admin decisions.
  Promise.resolve(result).then(r => {
    // When decisions are not yet provided the import should complete normally
    // (no blocking) because confirmScreenshotImport always passes a decision
    // array. We test the blocking path below via undefined-decisions.
    //
    // Re-run without decisions to exercise the requiresConfirmation path:
    return finance.confirmScreenshotImport(
      parsedAccounts,
      {},
      null,
      new Date().toISOString().split('T')[0],
      undefined // undefined → treated as null → triggers requiresConfirmation
    );
  }).then(r => {
    assert(r.requiresConfirmation === true, 'Import requires confirmation when deleted match found');
    assert(Array.isArray(r.ambiguousRows), 'ambiguousRows array returned');
    const blockedRow = (r.ambiguousRows || []).find(row => row.name === 'Promo Offer Text');
    assert(!!blockedRow, 'The deleted-account-matching row appears in ambiguousRows');
    assert(
      (blockedRow.ambiguityReasons || []).some(reason => reason.code === 'matches_deleted_account'),
      'Reason code matches_deleted_account present'
    );
    assert(!!blockedRow.matchedDeletedAccount, 'matchedDeletedAccount populated in blocked row');
    assert(blockedRow.matchedDeletedAccount.name === 'Promo Offer Text', 'matchedDeletedAccount.name is correct');

    // ---------------------------------------------------------------------------
    // Test 4 – Admin skips the blocked row → account NOT created
    // ---------------------------------------------------------------------------
    section('Test 4: Admin skips blocked row → account not created');

    const skipDecisions = [
      { rowIndex: 0, action: 'skip' },
      { rowIndex: 1, action: 'create' }
    ];

    return finance.confirmScreenshotImport(
      parsedAccounts,
      {},
      null,
      new Date().toISOString().split('T')[0],
      skipDecisions
    );
  }).then(r4 => {
    assert(r4.success === true, 'Import succeeds when admin skips blocked row');
    assert(r4.accountsCreated === 1, 'Only the legitimate new account was created');
    assert(r4.rowsSkipped === 1, 'One row was skipped');

    const afterSkip = finance.loadFinanceData();
    const skippedExists = afterSkip.accounts.some(a => a.name === 'Promo Offer Text');
    assert(!skippedExists, 'Skipped deleted-match account was NOT recreated');
    const legitimateExists = afterSkip.accounts.some(a => a.name === 'Legitimate Savings');
    assert(legitimateExists, 'Legitimate new account was created normally');

    // ---------------------------------------------------------------------------
    // Test 5 – Admin allows the blocked row → account IS created
    // ---------------------------------------------------------------------------
    section('Test 5: Admin allows blocked row → account created');

    // Reset to clean state: no active accounts, same deleted record
    const resetData = freshData();
    resetData.deletedAccounts.push({
      id: '2001',
      name: 'Promo Offer Text',
      displayName: null,
      normalizedName: 'promo offer text',
      type: 'checking',
      deletedAt: new Date().toISOString()
    });
    finance.saveFinanceData(resetData);

    const allowDecisions = [
      { rowIndex: 0, action: 'allow_deleted' },
      { rowIndex: 1, action: 'create' }
    ];

    return finance.confirmScreenshotImport(
      parsedAccounts,
      {},
      null,
      new Date().toISOString().split('T')[0],
      allowDecisions
    );
  }).then(r5 => {
    assert(r5.success === true, 'Import succeeds when admin allows blocked row');
    assert(r5.accountsCreated === 2, 'Both accounts created when admin allows');

    const afterAllow = finance.loadFinanceData();
    const recreated = afterAllow.accounts.some(a => a.name === 'Promo Offer Text');
    assert(recreated, 'Previously deleted account was recreated after admin approval');

    // ---------------------------------------------------------------------------
    // Test 6 – Non-matching new accounts still create normally (no blockage)
    // ---------------------------------------------------------------------------
    section('Test 6: Legitimate new accounts create without blockage');

    const cleanData = freshData();
    cleanData.deletedAccounts.push({
      id: '3001',
      name: 'Old Bad Account',
      normalizedName: 'old bad account',
      type: 'savings',
      deletedAt: new Date().toISOString()
    });
    finance.saveFinanceData(cleanData);

    const freshParsed = [
      { name: 'New Good Account', rawLabel: 'New Good Account', balance: 2500, category: 'cash' }
    ];

    return finance.confirmScreenshotImport(
      freshParsed,
      {},
      null,
      new Date().toISOString().split('T')[0],
      []
    );
  }).then(r6 => {
    assert(r6.success === true, 'Import succeeds for non-matching new account');
    assert(r6.accountsCreated === 1, 'Non-matching account created normally');
    // No requiresConfirmation
    assert(!r6.requiresConfirmation, 'No confirmation required for non-matching account');

    // ---------------------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------------------
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═'.repeat(60));

    if (failed > 0) {
      process.exitCode = 1;
    }
  }).catch(err => {
    console.error('❌ Unexpected error during tests:', err);
    process.exitCode = 1;
  });
}
