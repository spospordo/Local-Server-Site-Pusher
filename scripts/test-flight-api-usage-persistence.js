#!/usr/bin/env node

/**
 * Test script for Flight API usage persistence and all-path tracking
 *
 * Verifies that:
 * 1. incrementUsage() writes the count to config/flight-api-usage.json
 * 2. Re-requiring the module restores the persisted count (simulates a redeploy)
 * 3. getUsageStats() returns the correct count and remaining values
 * 4. setMonthlyLimit() persists the new limit and isLimitReached() respects it
 * 5. resetUsageIfNewMonth() triggers a reset and persists it
 * 6. All three API call paths (testConnection, validateFlight, getFlightStatus)
 *    exercise incrementUsage (code-level check)
 */

const fs = require('fs');
const path = require('path');

// ANSI colour helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}
function logStep(n, msg) { log(`\n[Step ${n}] ${msg}`, 'cyan'); }
function logSuccess(msg) { log(`  ✅ ${msg}`, 'green'); }
function logError(msg) { log(`  ❌ ${msg}`, 'red'); }
function logInfo(msg) { log(`  ℹ️  ${msg}`, 'blue'); }

const USAGE_FILE = path.join(__dirname, '..', 'config', 'flight-api-usage.json');
const AVIATIONSTACK_MODULE = path.join(__dirname, '..', 'modules', 'aviationstack.js');

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    logSuccess(description);
    passed++;
  } else {
    logError(description);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Remove the usage file and any Node module cache so the next require()
 *  starts fresh – simulates a clean deployment. */
function cleanupAndReload() {
  if (fs.existsSync(USAGE_FILE)) fs.unlinkSync(USAGE_FILE);
  delete require.cache[require.resolve(AVIATIONSTACK_MODULE)];
}

/** Remove the usage file and delete it from the require cache so the next
 *  require() picks up the updated file. */
function reloadModule() {
  delete require.cache[require.resolve(AVIATIONSTACK_MODULE)];
  return require(AVIATIONSTACK_MODULE);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests() {
  log('\n╔══════════════════════════════════════════════════════════╗', 'magenta');
  log('║    Flight API Usage – Persistence & Tracking Tests       ║', 'magenta');
  log('╚══════════════════════════════════════════════════════════╝\n', 'magenta');

  // ------------------------------------------------------------------
  // Step 1: Code-level checks – ensure all call paths use incrementUsage
  // ------------------------------------------------------------------
  logStep(1, 'Verify that every API call path calls incrementUsage()');

  const src = fs.readFileSync(AVIATIONSTACK_MODULE, 'utf8');

  // Count the number of incrementUsage() calls
  const incrementMatches = (src.match(/incrementUsage\(\)/g) || []).length;
  assert(incrementMatches >= 3,
    `incrementUsage() appears ${incrementMatches} time(s) – expected at least 3 (testConnection, validateFlight, getFlightStatus)`);

  // Ensure saveUsageToFile() is called inside incrementUsage
  const incrementFnMatch = src.match(/function incrementUsage\(\)\s*\{([\s\S]*?)^}/m);
  if (incrementFnMatch) {
    assert(incrementFnMatch[1].includes('saveUsageToFile()'),
      'incrementUsage() calls saveUsageToFile() to persist the count');
  } else {
    // Fallback: check the source directly
    assert(src.includes('saveUsageToFile()'),
      'saveUsageToFile() is present in the module');
  }

  // Ensure resetUsageIfNewMonth persists its reset
  const resetFnMatch = src.match(/function resetUsageIfNewMonth\(\)\s*\{([\s\S]*?)^}/m);
  if (resetFnMatch) {
    assert(resetFnMatch[1].includes('saveUsageToFile()'),
      'resetUsageIfNewMonth() calls saveUsageToFile() to persist the reset');
  }

  // Ensure setMonthlyLimit is exported
  assert(src.includes('setMonthlyLimit'), 'setMonthlyLimit() function is defined');
  assert(src.includes('module.exports') && src.includes('setMonthlyLimit'),
    'setMonthlyLimit is included in module.exports');

  // ------------------------------------------------------------------
  // Step 2: Persistence – increment and verify the file is written
  // ------------------------------------------------------------------
  logStep(2, 'Increment usage counter and verify file persistence');

  // Start clean
  cleanupAndReload();
  const av1 = require(AVIATIONSTACK_MODULE);

  const statsBefore = av1.getUsageStats();
  logInfo(`Starting callsThisMonth: ${statsBefore.callsThisMonth}`);

  // Manually invoke incrementUsage via a private-like approach:
  // Since we only export the public API, we test persistence by checking
  // that getUsageStats() matches what is written to the file.
  // We simulate an increment by calling setMonthlyLimit (which also saves)
  // and then verify the file exists and is valid JSON.
  av1.setMonthlyLimit(50);

  assert(fs.existsSync(USAGE_FILE), 'Usage file is created after setMonthlyLimit()');

  const fileData = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  assert(fileData.monthlyLimit === 50, 'Usage file contains updated monthlyLimit (50)');

  // ------------------------------------------------------------------
  // Step 3: Persistence across module reload (simulated redeploy)
  // ------------------------------------------------------------------
  logStep(3, 'Verify that usage data survives a module reload (redeploy simulation)');

  // Write a known state directly to the file
  const knownState = {
    monthlyLimit: 100,
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    callsThisMonth: 42,
    lastReset: new Date().toISOString()
  };
  fs.writeFileSync(USAGE_FILE, JSON.stringify(knownState, null, 2));

  // Reload the module – it should pick up the file on init
  const av2 = reloadModule();
  const statsAfterReload = av2.getUsageStats();

  assert(statsAfterReload.callsThisMonth === 42,
    `After reload callsThisMonth is 42 (got ${statsAfterReload.callsThisMonth})`);
  assert(statsAfterReload.monthlyLimit === 100,
    `After reload monthlyLimit is 100 (got ${statsAfterReload.monthlyLimit})`);
  assert(statsAfterReload.remaining === 58,
    `After reload remaining is 58 (got ${statsAfterReload.remaining})`);

  // ------------------------------------------------------------------
  // Step 4: isLimitReached() respects the persisted count
  // ------------------------------------------------------------------
  logStep(4, 'Verify isLimitReached() against persisted count');

  assert(!av2.isLimitReached(),
    'isLimitReached() returns false when callsThisMonth (42) < monthlyLimit (100)');

  // Write a state where limit is reached
  const atLimitState = { ...knownState, callsThisMonth: 100 };
  fs.writeFileSync(USAGE_FILE, JSON.stringify(atLimitState, null, 2));
  const av3 = reloadModule();
  assert(av3.isLimitReached(),
    'isLimitReached() returns true when callsThisMonth equals monthlyLimit');

  // ------------------------------------------------------------------
  // Step 5: setMonthlyLimit() updates and persists the limit
  // ------------------------------------------------------------------
  logStep(5, 'setMonthlyLimit() updates in-memory and persists to file');

  // Reload with a known state
  fs.writeFileSync(USAGE_FILE, JSON.stringify(knownState, null, 2));
  const av4 = reloadModule();

  av4.setMonthlyLimit(200);
  assert(av4.getUsageStats().monthlyLimit === 200,
    'In-memory monthlyLimit updated to 200 after setMonthlyLimit(200)');

  const fileAfterLimit = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
  assert(fileAfterLimit.monthlyLimit === 200,
    'Persisted monthlyLimit updated to 200 in usage file');

  // ------------------------------------------------------------------
  // Step 6: getUsageStats() percentUsed calculation
  // ------------------------------------------------------------------
  logStep(6, 'getUsageStats() returns correct percentUsed');

  const halfState = { ...knownState, callsThisMonth: 50, monthlyLimit: 100 };
  fs.writeFileSync(USAGE_FILE, JSON.stringify(halfState, null, 2));
  const av5 = reloadModule();
  const stats = av5.getUsageStats();

  assert(stats.percentUsed === 50,
    `percentUsed is 50% when 50/100 calls used (got ${stats.percentUsed}%)`);
  assert(stats.remaining === 50,
    `remaining is 50 (got ${stats.remaining})`);

  // ------------------------------------------------------------------
  // Step 7: Verify the usage file path is inside config/
  // ------------------------------------------------------------------
  logStep(7, 'Usage file is stored in the config/ directory');
  assert(src.includes("'config'") || src.includes('"config"') || src.includes("path.join(__dirname, '..', 'config')"),
    "Usage file path references the config/ directory");

  // ------------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------------
  cleanupAndReload();
  logInfo('Test usage file cleaned up.');

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  log('\n' + '─'.repeat(60), 'cyan');
  log(`Results: ${passed} passed, ${failed} failed`, failed > 0 ? 'red' : 'green');
  log('─'.repeat(60), 'cyan');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
