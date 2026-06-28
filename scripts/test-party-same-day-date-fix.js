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
 * Fix: a parseDateStringLocal() helper in server.js parses YYYY-MM-DD strings in
 * local time (not UTC) and validates the result against the input to catch overflow
 * dates like "2025-02-30".
 *
 * This test extracts parseDateStringLocal() directly from server.js so that any
 * future change to the production implementation is automatically tested here.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
// Extract parseDateStringLocal from server.js
// ---------------------------------------------------------------------------

const serverSource = fs.readFileSync(
  path.join(__dirname, '..', 'server.js'),
  'utf8'
);

/**
 * Extract the first top-level named function matching the given name.
 * Only handles traditional function declarations (`function name(`).
 */
function extractFunction(source, name) {
  const pattern = new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = source.match(pattern);
  if (!match || match.index === undefined) {
    throw new Error(`Could not find function: ${name}`);
  }
  const start = match.index;
  let i = start + match[0].length - 1;
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not parse function body for: ${name}`);
}

const parseDateStringLocalFn = extractFunction(serverSource, 'parseDateStringLocal');

const context = {};
vm.createContext(context);
vm.runInContext(parseDateStringLocalFn, context);
const { parseDateStringLocal } = context;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a YYYY-MM-DD string for today offset by `deltaDays`, in local time.
 */
function localDateString(deltaDays) {
  const d = new Date();
  d.setDate(d.getDate() + deltaDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysUntil(dateStr) {
  const partyDate = parseDateStringLocal(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((partyDate - today) / (1000 * 60 * 60 * 24));
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

// --- parseDateStringLocal: basic parsing -------------------------------------
console.log('parseDateStringLocal() – basic parsing');
test('returns a valid Date for a well-formed YYYY-MM-DD string', () => {
  const d = parseDateStringLocal('2099-12-31');
  assert.ok(!isNaN(d.getTime()), 'expected valid Date');
});
test('parsed date components match input (local time, not UTC)', () => {
  const d = parseDateStringLocal('2099-06-15');
  assert.strictEqual(d.getFullYear(), 2099);
  assert.strictEqual(d.getMonth() + 1, 6);
  assert.strictEqual(d.getDate(), 15);
});
test('returns Invalid Date for non-string input', () => {
  assert.ok(isNaN(parseDateStringLocal(null).getTime()));
  assert.ok(isNaN(parseDateStringLocal(20250628).getTime()));
});
test('returns Invalid Date for wrong format (with time suffix)', () => {
  assert.ok(isNaN(parseDateStringLocal('2025-06-28T18:00:00').getTime()));
});
test('returns Invalid Date for empty string', () => {
  assert.ok(isNaN(parseDateStringLocal('').getTime()));
});
test('returns Invalid Date for overflow date "2025-02-30"', () => {
  assert.ok(isNaN(parseDateStringLocal('2025-02-30').getTime()),
    '"2025-02-30" must not silently roll over to March 2');
});

// --- Past date ---------------------------------------------------------------
console.log('\nPast date (yesterday)');
test('parseDateStringLocal gives a date < today for yesterday', () => {
  const partyDate = parseDateStringLocal(localDateString(-1));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  assert.ok(partyDate < today, 'yesterday should be < today');
});
test('daysUntil returns -1 for yesterday', () => {
  assert.strictEqual(daysUntil(localDateString(-1)), -1);
});

// --- Today's date (core bug scenario) ----------------------------------------
console.log('\nToday\'s date (same-day bug scenario)');
test('parseDateStringLocal gives a date equal to today for today', () => {
  const partyDate = parseDateStringLocal(localDateString(0));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  assert.ok(partyDate >= today,
    'Today\'s party must NOT be classified as passed (partyDate must be >= today)');
});
test('daysUntil returns 0 for today', () => {
  assert.strictEqual(daysUntil(localDateString(0)), 0,
    'daysUntil for today must be 0');
});

// --- Future dates ------------------------------------------------------------
console.log('\nFuture dates');
test('parseDateStringLocal gives a date > today for tomorrow', () => {
  const partyDate = parseDateStringLocal(localDateString(1));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  assert.ok(partyDate > today);
});
test('daysUntil returns 1 for tomorrow', () => {
  assert.strictEqual(daysUntil(localDateString(1)), 1);
});
test('daysUntil returns 7 for 7 days from now', () => {
  assert.strictEqual(daysUntil(localDateString(7)), 7);
});

// --- Timezone safety ---------------------------------------------------------
console.log('\nTimezone-safety: new Date("YYYY-MM-DD") is UTC midnight (broken pattern)');
test('parseDateStringLocal date components match local calendar for today', () => {
  const todayStr = localDateString(0);
  const [y, m, d] = todayStr.split('-').map(Number);
  const parsed = parseDateStringLocal(todayStr);
  assert.strictEqual(parsed.getFullYear(), y,
    'Year must match local calendar (not UTC)');
  assert.strictEqual(parsed.getMonth() + 1, m,
    'Month must match local calendar (not UTC)');
  assert.strictEqual(parsed.getDate(), d,
    'Day must match local calendar (not UTC)');
  // Informational: show whether UTC parse would differ in this environment
  const utcParsed = new Date(todayStr);
  const utcDay = `${utcParsed.getFullYear()}-${String(utcParsed.getMonth()+1).padStart(2,'0')}-${String(utcParsed.getDate()).padStart(2,'0')}`;
  if (utcDay !== todayStr) {
    console.log(`     ℹ️  UTC-parse shift confirmed: UTC=${utcDay}, local=${todayStr}`);
  }
});

// --- Widget Validation & Preview logic ---------------------------------------
console.log('\nWidget Validation & Preview logic');
test('Preview shown (daysUntil >= 0) for today', () => {
  assert.ok(daysUntil(localDateString(0)) >= 0);
});
test('Preview blocked (daysUntil < 0) for yesterday', () => {
  assert.ok(daysUntil(localDateString(-1)) < 0);
});
test('Preview shown (daysUntil >= 0) for tomorrow', () => {
  assert.ok(daysUntil(localDateString(1)) >= 0);
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
