#!/usr/bin/env node
/**
 * Regression tests for the same-day party date fix.
 *
 * Root cause: new Date("YYYY-MM-DD") parses ISO date-only strings as UTC midnight.
 * In timezones behind UTC (e.g. UTC-5) a party date of "2025-06-28" would become
 * June 27 at 7 PM local time, and after setHours(0,0,0,0) would become June 27 at
 * midnight — one full day earlier than intended.  This caused today's party to be
 * treated as already passed, blocking the Widget Validation & Preview.
 *
 * Fix: append 'T00:00:00' when parsing YYYY-MM-DD strings so they are interpreted
 * in local time, not UTC.
 *
 * This test validates the fixed date comparison logic without starting a server.
 * It simulates the same logic used in:
 *   - server.js validatePartyScheduling()
 *   - server.js GET /admin/api/party/scheduling/validate
 *   - admin/dashboard.html showWidgetPreview()
 */

'use strict';

const assert = require('assert');

// ---------------------------------------------------------------------------
// Helper – mirrors the FIXED logic used in both server.js and dashboard.html
// ---------------------------------------------------------------------------

/**
 * Returns true if the given YYYY-MM-DD date string represents a date that is
 * strictly in the past relative to the local calendar day.
 *
 * Uses the same algorithm as the patched code (append 'T00:00:00' to force
 * local-time parsing before normalising both sides to midnight).
 */
function isPartyDateInPast(dateStr) {
  const partyDate = new Date(dateStr + 'T00:00:00');
  partyDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return partyDate < today;
}

/**
 * Returns the daysUntil value for the given YYYY-MM-DD date string, using
 * the same algorithm as the patched code.
 */
function daysUntilParty(dateStr) {
  const partyDate = new Date(dateStr + 'T00:00:00');
  partyDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((partyDate - today) / (1000 * 60 * 60 * 24));
}

/**
 * Returns a YYYY-MM-DD string for a date offset by `deltaDays` from today,
 * computed in local time to match how users enter dates.
 */
function localDateString(deltaDays) {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

console.log('\n🎉 Party same-day date fix – regression tests\n');

// --- Past date -----------------------------------------------------------------
console.log('Past date (yesterday)');
test('isPartyDateInPast returns true for yesterday', () => {
  assert.strictEqual(isPartyDateInPast(localDateString(-1)), true);
});
test('daysUntilParty returns -1 for yesterday', () => {
  assert.strictEqual(daysUntilParty(localDateString(-1)), -1);
});

// --- Today's date --------------------------------------------------------------
console.log('\nToday\'s date (same-day bug scenario)');
test('isPartyDateInPast returns false for today', () => {
  assert.strictEqual(isPartyDateInPast(localDateString(0)), false,
    'Today\'s party must NOT be classified as passed');
});
test('daysUntilParty returns 0 for today', () => {
  assert.strictEqual(daysUntilParty(localDateString(0)), 0,
    'daysUntil for today must be 0');
});

// --- Future dates --------------------------------------------------------------
console.log('\nFuture dates');
test('isPartyDateInPast returns false for tomorrow', () => {
  assert.strictEqual(isPartyDateInPast(localDateString(1)), false);
});
test('daysUntilParty returns 1 for tomorrow', () => {
  assert.strictEqual(daysUntilParty(localDateString(1)), 1);
});
test('isPartyDateInPast returns false for 7 days from now', () => {
  assert.strictEqual(isPartyDateInPast(localDateString(7)), false);
});
test('daysUntilParty returns 7 for 7 days from now', () => {
  assert.strictEqual(daysUntilParty(localDateString(7)), 7);
});
test('isPartyDateInPast returns false for far-future date', () => {
  assert.strictEqual(isPartyDateInPast('2099-12-31'), false);
});

// --- Old (broken) parsing must NOT be used ------------------------------------
console.log('\nTimezone-safety: new Date("YYYY-MM-DD") is UTC midnight (broken pattern)');
test('new Date("YYYY-MM-DD") parses as UTC, T00:00:00 parses as local', () => {
  const todayStr = localDateString(0);
  // This demonstrates why the old code could fail in UTC-offset timezones:
  // new Date(todayStr) is UTC midnight; if local offset is negative, the
  // resulting local date may be the *previous* calendar day.
  const utcParsed = new Date(todayStr);
  const localParsed = new Date(todayStr + 'T00:00:00');
  // Both should represent today when timezone offset is 0, but in UTC-5 the
  // UTC-parsed version is yesterday local-time.  We simply confirm that the
  // local parse gives a date matching the date components we passed.
  const [y, m, d] = todayStr.split('-').map(Number);
  assert.strictEqual(localParsed.getFullYear(), y);
  assert.strictEqual(localParsed.getMonth() + 1, m);
  assert.strictEqual(localParsed.getDate(), d);
  // Whereas the UTC-parsed date may differ (this is informational; we don't
  // fail the test if offset happens to be 0 in the current environment).
  const utcDateStr = `${utcParsed.getFullYear()}-${String(utcParsed.getMonth()+1).padStart(2,'0')}-${String(utcParsed.getDate()).padStart(2,'0')}`;
  if (utcDateStr !== todayStr) {
    console.log(`     ℹ️  Confirmed UTC-parse shift detected (UTC date=${utcDateStr}, local date=${todayStr})`);
  }
});

// --- Widget preview logic (mirrors dashboard.html showWidgetPreview) -----------
console.log('\nWidget Validation & Preview logic');
test('Preview should be shown (daysUntil >= 0) for today', () => {
  const days = daysUntilParty(localDateString(0));
  assert.ok(days >= 0, `daysUntil must be >= 0 for today, got ${days}`);
});
test('Preview should be blocked (daysUntil < 0) for yesterday', () => {
  const days = daysUntilParty(localDateString(-1));
  assert.ok(days < 0, `daysUntil must be < 0 for yesterday, got ${days}`);
});
test('Preview should be shown (daysUntil >= 0) for tomorrow', () => {
  const days = daysUntilParty(localDateString(1));
  assert.ok(days >= 0, `daysUntil must be >= 0 for tomorrow, got ${days}`);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(60)}`);
if (failed === 0) {
  console.log(`✅ All ${passed} tests passed.\n`);
} else {
  console.error(`❌ ${failed} test(s) failed, ${passed} passed.\n`);
  process.exit(1);
}
