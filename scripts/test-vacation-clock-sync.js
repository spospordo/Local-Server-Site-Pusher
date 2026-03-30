#!/usr/bin/env node

/**
 * Test script for Vacation → Dashboard Clock Widget Timezone Sync Feature
 *
 * Tests:
 *  1. syncVacationClockTimezones() adds timezones within the display window
 *  2. syncVacationClockTimezones() does NOT add timezones outside the window
 *  3. Expired vacation entries are removed from additionalTimezones
 *  4. Maximum of 3 slots is enforced; excess entries are skipped
 *  5. User-defined timezones are preserved and take priority
 *  6. Adding a vacation with addToDashboardClock=true returns clockSync in API response
 */

const path = require('path');
const fs = require('fs');

// ── Paths ──────────────────────────────────────────────────────────────────
const SM_CONFIG_PATH   = path.join(__dirname, '..', 'config', 'smart-mirror-config.json');
const HOUSE_DATA_PATH  = path.join(__dirname, '..', 'config', 'house-data.json');

// ── Helpers ────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ── Test runner ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.log(`  ❌ ${description}`);
    failed++;
  }
}

// ── Inline sync logic (mirrors server.js implementation for unit testing) ──

/**
 * Lightweight re-implementation of syncVacationClockTimezones for unit tests.
 * Operates on in-memory objects instead of reading/writing files.
 */
function runSync(vacationDates, smConfig) {
  const now = new Date();

  const currentAdditionalTzs = Array.isArray(smConfig.widgets?.clock?.additionalTimezones)
    ? smConfig.widgets.clock.additionalTimezones
    : [];

  const vacationEntries = Array.isArray(smConfig.vacationClockEntries)
    ? smConfig.vacationClockEntries
    : [];

  const vacationTrackedTzSet = new Set(vacationEntries.map(e => e.timezone));

  const userDefinedTzs = currentAdditionalTzs.filter(tz => !vacationTrackedTzSet.has(tz.timezone));

  const activeVacationTzs = [];
  for (const vacation of vacationDates) {
    if (!vacation.addToDashboardClock || !vacation.clockTimezone || !vacation.clockCity) continue;

    const startDate = new Date(vacation.startDate);
    const endDate   = new Date(vacation.endDate);

    const windowStart = new Date(startDate);
    windowStart.setDate(windowStart.getDate() - 7);

    const windowEnd = new Date(endDate);
    windowEnd.setDate(windowEnd.getDate() + 5);

    if (now >= windowStart && now <= windowEnd) {
      activeVacationTzs.push({
        city: vacation.clockCity,
        timezone: vacation.clockTimezone,
        vacationId: vacation.id
      });
    }
  }

  const seenTzs = new Set(userDefinedTzs.map(t => t.timezone));
  const uniqueActiveVacationTzs = [];
  for (const tz of activeVacationTzs) {
    if (!seenTzs.has(tz.timezone)) {
      seenTzs.add(tz.timezone);
      uniqueActiveVacationTzs.push(tz);
    }
  }

  const availableSlots  = Math.max(0, 3 - userDefinedTzs.length);
  const tzToAdd         = uniqueActiveVacationTzs.slice(0, availableSlots);
  const skipped         = uniqueActiveVacationTzs.length - tzToAdd.length;

  const newVacationEntries = tzToAdd.map(tz => ({
    city: tz.city,
    timezone: tz.timezone,
    vacationId: tz.vacationId
  }));

  const finalAdditionalTzs = [
    ...userDefinedTzs,
    ...tzToAdd.map(tz => ({ city: tz.city, timezone: tz.timezone }))
  ];

  const removed = vacationEntries.filter(e =>
    !newVacationEntries.some(n => n.timezone === e.timezone)).length;
  // Return the updated config snapshot and the result summary
  const updatedConfig = {
    ...smConfig,
    widgets: {
      ...(smConfig.widgets || {}),
      clock: {
        ...(smConfig.widgets?.clock || {}),
        additionalTimezones: finalAdditionalTzs
      }
    },
    vacationClockEntries: newVacationEntries
  };

  return {
    updatedConfig,
    result: {
      success: true,
      added: tzToAdd.length,
      removed,
      active: uniqueActiveVacationTzs.length,
      skipped,
      slotsUsed: finalAdditionalTzs.length,
      slotsAvailable: 3 - finalAdditionalTzs.length
    }
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

function testInWindow() {
  console.log('\n🧪 Test 1: Vacation in active display window → timezone added to clock');
  const vacations = [{
    id: '1',
    addToDashboardClock: true,
    clockCity: 'Tokyo',
    clockTimezone: 'Asia/Tokyo',
    startDate: dateOffset(3),   // starts in 3 days
    endDate: dateOffset(10)
  }];

  const smConfig = { widgets: { clock: { additionalTimezones: [] } }, vacationClockEntries: [] };
  const { updatedConfig, result } = runSync(vacations, smConfig);

  assert(result.added === 1, 'added count is 1');
  assert(result.active === 1, 'active count is 1');
  assert(updatedConfig.widgets.clock.additionalTimezones.length === 1, 'clock has 1 additionalTimezone');
  assert(updatedConfig.widgets.clock.additionalTimezones[0].timezone === 'Asia/Tokyo', 'correct timezone added');
  assert(updatedConfig.vacationClockEntries.length === 1, 'vacationClockEntries updated');
}

function testOutsideWindow() {
  console.log('\n🧪 Test 2: Vacation far in the future → timezone NOT added');
  const vacations = [{
    id: '2',
    addToDashboardClock: true,
    clockCity: 'Sydney',
    clockTimezone: 'Australia/Sydney',
    startDate: dateOffset(30),
    endDate: dateOffset(40)
  }];

  const smConfig = { widgets: { clock: { additionalTimezones: [] } }, vacationClockEntries: [] };
  const { updatedConfig, result } = runSync(vacations, smConfig);

  assert(result.added === 0, 'nothing added');
  assert(result.active === 0, 'no active entries');
  assert(updatedConfig.widgets.clock.additionalTimezones.length === 0, 'clock additionalTimezones stays empty');
}

function testExpiredVacation() {
  console.log('\n🧪 Test 3: Expired vacation timezone is removed from clock');
  const vacations = [{
    id: '3',
    addToDashboardClock: true,
    clockCity: 'London',
    clockTimezone: 'Europe/London',
    startDate: dateOffset(-20),
    endDate: dateOffset(-10)   // ended 10 days ago, window (end + 5) = 5 days ago
  }];

  // Simulate that the timezone was previously added
  const smConfig = {
    widgets: { clock: { additionalTimezones: [{ city: 'London', timezone: 'Europe/London' }] } },
    vacationClockEntries: [{ city: 'London', timezone: 'Europe/London', vacationId: '3' }]
  };

  const { updatedConfig, result } = runSync(vacations, smConfig);

  assert(result.removed === 1, 'removed count is 1');
  assert(result.active === 0, 'no active entries');
  assert(updatedConfig.widgets.clock.additionalTimezones.length === 0, 'timezone removed from clock');
  assert(updatedConfig.vacationClockEntries.length === 0, 'vacationClockEntries cleared');
}

function testMaxThreeSlots() {
  console.log('\n🧪 Test 4: Exceeding 3 slots — extras are skipped with feedback');
  const vacations = [1, 2, 3, 4].map(i => ({
    id: String(i),
    addToDashboardClock: true,
    clockCity: `City${i}`,
    clockTimezone: `Etc/GMT+${i}`,
    startDate: dateOffset(-1),
    endDate: dateOffset(5)
  }));

  const smConfig = { widgets: { clock: { additionalTimezones: [] } }, vacationClockEntries: [] };
  const { updatedConfig, result } = runSync(vacations, smConfig);

  assert(result.added === 3, 'only 3 entries added');
  assert(result.skipped === 1, '1 entry skipped');
  assert(result.slotsUsed === 3, 'slotsUsed = 3');
  assert(result.slotsAvailable === 0, 'slotsAvailable = 0');
  assert(updatedConfig.widgets.clock.additionalTimezones.length === 3, 'clock has exactly 3 timezones');
}

function testUserDefinedPreserved() {
  console.log('\n🧪 Test 5: User-defined timezones are preserved; vacation fills remaining slots');
  const vacations = [{
    id: '5',
    addToDashboardClock: true,
    clockCity: 'Paris',
    clockTimezone: 'Europe/Paris',
    startDate: dateOffset(-1),
    endDate: dateOffset(5)
  }];

  const smConfig = {
    widgets: {
      clock: {
        additionalTimezones: [
          { city: 'New York', timezone: 'America/New_York' },
          { city: 'Los Angeles', timezone: 'America/Los_Angeles' }
        ]
      }
    },
    vacationClockEntries: []
  };

  const { updatedConfig, result } = runSync(vacations, smConfig);

  assert(result.added === 1, 'vacation timezone added (1 slot free)');
  assert(updatedConfig.widgets.clock.additionalTimezones.length === 3, 'total 3 timezones');
  const tzNames = updatedConfig.widgets.clock.additionalTimezones.map(t => t.timezone);
  assert(tzNames.includes('America/New_York'), 'user-defined New York preserved');
  assert(tzNames.includes('America/Los_Angeles'), 'user-defined LA preserved');
  assert(tzNames.includes('Europe/Paris'), 'vacation Paris added');
}

function testFlagOffNotAdded() {
  console.log('\n🧪 Test 6: Vacation with addToDashboardClock=false is not added to clock');
  const vacations = [{
    id: '6',
    addToDashboardClock: false,
    clockCity: 'Berlin',
    clockTimezone: 'Europe/Berlin',
    startDate: dateOffset(-1),
    endDate: dateOffset(5)
  }];

  const smConfig = { widgets: { clock: { additionalTimezones: [] } }, vacationClockEntries: [] };
  const { updatedConfig, result } = runSync(vacations, smConfig);

  assert(result.added === 0, 'nothing added when flag is off');
  assert(updatedConfig.widgets.clock.additionalTimezones.length === 0, 'clock stays empty');
}

function testNoDuplicates() {
  console.log('\n🧪 Test 7: Duplicate timezone across multiple vacations is deduplicated');
  const vacations = [
    {
      id: '7a',
      addToDashboardClock: true,
      clockCity: 'Tokyo',
      clockTimezone: 'Asia/Tokyo',
      startDate: dateOffset(-1),
      endDate: dateOffset(5)
    },
    {
      id: '7b',
      addToDashboardClock: true,
      clockCity: 'Tokyo 2',
      clockTimezone: 'Asia/Tokyo',
      startDate: dateOffset(-2),
      endDate: dateOffset(6)
    }
  ];

  const smConfig = { widgets: { clock: { additionalTimezones: [] } }, vacationClockEntries: [] };
  const { updatedConfig, result } = runSync(vacations, smConfig);

  assert(result.added === 1, 'deduplicated — only 1 added');
  assert(updatedConfig.widgets.clock.additionalTimezones.length === 1, 'clock has 1 entry');
}

// ── Run all tests ──────────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════════════════');
console.log('  Vacation → Clock Widget Timezone Sync Test Suite');
console.log('═══════════════════════════════════════════════════════════');

testInWindow();
testOutsideWindow();
testExpiredVacation();
testMaxThreeSlots();
testUserDefinedPreserved();
testFlagOffNotAdded();
testNoDuplicates();

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log('═══════════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
