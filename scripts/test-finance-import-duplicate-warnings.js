#!/usr/bin/env node

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const finance = require('../modules/finance');

const configDir = path.join(__dirname, '..', 'config');
const managedFiles = [
  path.join(configDir, '.finance_data'),
  path.join(configDir, '.finance_key')
];
const originalFiles = new Map();
const today = new Date().toISOString().split('T')[0];

function snapshotOriginalFiles() {
  managedFiles.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      originalFiles.set(filePath, {
        contents: fs.readFileSync(filePath),
        mode: fs.statSync(filePath).mode
      });
    }
  });
}

function restoreOriginalFiles() {
  managedFiles.forEach(filePath => {
    if (originalFiles.has(filePath)) {
      const original = originalFiles.get(filePath);
      fs.writeFileSync(filePath, original.contents, { mode: original.mode });
      fs.chmodSync(filePath, original.mode);
    } else if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}

function resetFinanceStorage() {
  if (fs.existsSync(managedFiles[0])) fs.unlinkSync(managedFiles[0]);
  finance.init({});
}

function saveData(data) {
  assert.strictEqual(finance.saveFinanceData(data).success, true);
}

function existingAccount(overrides = {}) {
  return {
    id: 'existing-account',
    name: 'Main Checking',
    type: 'checking',
    currentValue: 100,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
    ...overrides
  };
}

async function run() {
  snapshotOriginalFiles();
  try {
    if (!fs.existsSync(managedFiles[1])) {
      fs.writeFileSync(managedFiles[1], crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    }
    resetFinanceStorage();

    saveData({
      accounts: [existingAccount()],
      history: [],
      deletedAccounts: []
    });
    const nearDuplicateReview = await finance.confirmScreenshotImport(
      [{ name: 'Other Wallet', balance: 110, category: 'cash' }],
      {},
      null,
      today,
      undefined
    );
    assert.strictEqual(nearDuplicateReview.requiresConfirmation, true, '10% balance difference requires review');
    assert.strictEqual(nearDuplicateReview.ambiguousRows[0].nearDuplicateAccounts[0].id, 'existing-account');
    assert.ok(
      nearDuplicateReview.ambiguousRows[0].ambiguityReasons.some(reason => reason.code === 'near_duplicate_balance')
    );
    const keptSeparate = await finance.confirmScreenshotImport(
      [{ name: 'Other Wallet', balance: 110, category: 'cash' }],
      {},
      null,
      today,
      [{ rowIndex: 0, action: 'create' }]
    );
    assert.strictEqual(keptSeparate.success, true, 'A potential duplicate can be kept separate');
    assert.strictEqual(keptSeparate.accountsCreated, 1);
    assert.strictEqual(finance.loadFinanceData().accounts.length, 2);

    resetFinanceStorage();
    saveData({
      accounts: [existingAccount()],
      history: [],
      deletedAccounts: []
    });
    const outsideNearDuplicateRange = await finance.confirmScreenshotImport(
      [{ name: 'Other Wallet', balance: 110.01, category: 'cash' }],
      {},
      null,
      today,
      undefined
    );
    assert.strictEqual(outsideNearDuplicateRange.success, true, 'A difference above 10% does not trigger duplicate review');
    assert.strictEqual(outsideNearDuplicateRange.accountsCreated, 1);

    resetFinanceStorage();
    saveData({
      accounts: [existingAccount({ displayName: 'Primary Checking' })],
      history: [],
      deletedAccounts: []
    });
    const mergedImport = await finance.confirmScreenshotImport(
      [{ name: 'Other Wallet', balance: 105, category: 'cash' }],
      {},
      null,
      today,
      [{ rowIndex: 0, action: 'merge', accountId: 'existing-account' }]
    );
    assert.strictEqual(mergedImport.success, true, 'The selected near-duplicate account can be merged');
    assert.strictEqual(mergedImport.accountsCreated, 0);
    assert.strictEqual(mergedImport.accountsUpdated, 1);
    const mergedImportAccount = finance.loadFinanceData().accounts[0];
    assert.strictEqual(mergedImportAccount.name, 'Main Checking');
    assert.strictEqual(mergedImportAccount.displayName, 'Primary Checking');
    assert.ok(mergedImportAccount.previousNames.includes('Other Wallet'));

    resetFinanceStorage();
    saveData({
      accounts: [existingAccount()],
      history: [],
      deletedAccounts: []
    });
    const tenPercentChange = await finance.confirmScreenshotImport(
      [{ name: 'Main Checking', balance: 110, category: 'cash' }],
      {},
      null,
      today,
      undefined
    );
    assert.strictEqual(tenPercentChange.success, true);
    assert.strictEqual(tenPercentChange.significantBalanceChanges.length, 0, 'Exactly 10% is not a large-change warning');

    resetFinanceStorage();
    saveData({
      accounts: [existingAccount()],
      history: [],
      deletedAccounts: []
    });
    const overTenPercentChange = await finance.confirmScreenshotImport(
      [{ name: 'Main Checking', balance: 111, category: 'cash' }],
      {},
      null,
      today,
      undefined
    );
    assert.strictEqual(overTenPercentChange.success, true);
    assert.deepStrictEqual(overTenPercentChange.significantBalanceChanges[0], {
      name: 'Main Checking',
      oldBalance: 100,
      newBalance: 111,
      percentageChange: 11
    });

    resetFinanceStorage();
    saveData({
      accounts: [
        existingAccount({
          id: 'older',
          name: 'Older Account',
          displayName: 'Older Display Name',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2022-01-01T00:00:00.000Z'
        }),
        existingAccount({
          id: 'newer',
          name: 'Newer Account',
          displayName: 'Newer Display Name',
          currentValue: 250,
          createdAt: '2021-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        })
      ],
      history: [],
      deletedAccounts: []
    });
    const manualMerge = finance.mergeAccounts(['newer', 'older']);
    assert.strictEqual(manualMerge.success, true);
    assert.strictEqual(manualMerge.survivingAccount.id, 'older');
    assert.strictEqual(manualMerge.survivingAccount.name, 'Older Account');
    assert.strictEqual(manualMerge.survivingAccount.displayName, 'Older Display Name');
    assert.strictEqual(manualMerge.survivingAccount.currentValue, 250, 'The newest balance remains after merging');
    assert.ok(manualMerge.previousNames.includes('Newer Account'));
    assert.ok(manualMerge.previousNames.includes('Newer Display Name'));

    console.log('✅ Finance import duplicate, merge naming, and balance-change tests passed');
  } finally {
    restoreOriginalFiles();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
