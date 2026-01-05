#!/usr/bin/env node

/**
 * Test script for bump-version.js
 * 
 * Tests the version bump logic without making actual changes
 */

const { 
  determineBumpType, 
  bumpVersion 
} = require('./bump-version.js');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runTest(testName, testFn) {
  try {
    testFn();
    log(`✓ ${testName}`, 'green');
    return true;
  } catch (error) {
    log(`✗ ${testName}`, 'red');
    log(`  Error: ${error.message}`, 'red');
    return false;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

log('\n🧪 Running Version Bump Tests\n', 'cyan');

let passed = 0;
let failed = 0;

// Test 1: Patch bump detection
if (runTest('Patch bump detection (fix:)', () => {
  const commits = ['fix: resolve issue with widget positioning'];
  const result = determineBumpType(commits);
  assertEqual(result, 'patch', 'Should detect patch bump');
})) passed++; else failed++;

// Test 2: Minor bump detection
if (runTest('Minor bump detection (feat:)', () => {
  const commits = ['feat: add new dashboard widget'];
  const result = determineBumpType(commits);
  assertEqual(result, 'minor', 'Should detect minor bump');
})) passed++; else failed++;

// Test 3: Major bump detection (BREAKING CHANGE)
if (runTest('Major bump detection (BREAKING CHANGE)', () => {
  const commits = ['BREAKING CHANGE: remove deprecated API'];
  const result = determineBumpType(commits);
  assertEqual(result, 'major', 'Should detect major bump');
})) passed++; else failed++;

// Test 4: Major bump detection (major:)
if (runTest('Major bump detection (major:)', () => {
  const commits = ['major: redesign entire authentication system'];
  const result = determineBumpType(commits);
  assertEqual(result, 'major', 'Should detect major bump');
})) passed++; else failed++;

// Test 5: Multiple commits - major takes precedence
if (runTest('Multiple commits - major precedence', () => {
  const commits = [
    'fix: minor bug fix',
    'feat: new feature',
    'BREAKING CHANGE: removed old API'
  ];
  const result = determineBumpType(commits);
  assertEqual(result, 'major', 'Major should take precedence');
})) passed++; else failed++;

// Test 6: Multiple commits - minor over patch
if (runTest('Multiple commits - minor precedence', () => {
  const commits = [
    'fix: bug fix',
    'docs: update readme',
    'feat: new feature'
  ];
  const result = determineBumpType(commits);
  assertEqual(result, 'minor', 'Minor should take precedence over patch');
})) passed++; else failed++;

// Test 7: Default to patch for unknown patterns
if (runTest('Default to patch for unknown patterns', () => {
  const commits = ['docs: update documentation'];
  const result = determineBumpType(commits);
  assertEqual(result, 'patch', 'Should default to patch');
})) passed++; else failed++;

// Test 8: Version bump calculation - patch
if (runTest('Version bump calculation - patch', () => {
  const result = bumpVersion('2.2.4', 'patch');
  assertEqual(result, '2.2.5', 'Should increment patch');
})) passed++; else failed++;

// Test 9: Version bump calculation - minor
if (runTest('Version bump calculation - minor', () => {
  const result = bumpVersion('2.2.4', 'minor');
  assertEqual(result, '2.3.0', 'Should increment minor and reset patch');
})) passed++; else failed++;

// Test 10: Version bump calculation - major
if (runTest('Version bump calculation - major', () => {
  const result = bumpVersion('2.2.4', 'major');
  assertEqual(result, '3.0.0', 'Should increment major and reset minor/patch');
})) passed++; else failed++;

// Test 11: No commits returns null
if (runTest('No commits returns null', () => {
  const commits = [];
  const result = determineBumpType(commits);
  assertEqual(result, null, 'Should return null for empty commits');
})) passed++; else failed++;

// Test 12: Case insensitive detection
if (runTest('Case insensitive detection', () => {
  const commits = ['FEAT: new feature in caps'];
  const result = determineBumpType(commits);
  assertEqual(result, 'minor', 'Should detect regardless of case');
})) passed++; else failed++;

// Test 13: Feature keyword variant
if (runTest('Feature keyword variant', () => {
  const commits = ['feature: add new capability'];
  const result = determineBumpType(commits);
  assertEqual(result, 'minor', 'Should detect "feature:" keyword');
})) passed++; else failed++;

// Test 14: Breaking keyword variant
if (runTest('Breaking keyword variant', () => {
  const commits = ['breaking: change API contract'];
  const result = determineBumpType(commits);
  assertEqual(result, 'major', 'Should detect "breaking:" keyword');
})) passed++; else failed++;

log(`\n${'='.repeat(50)}`, 'cyan');
log(`Tests passed: ${passed}`, 'green');
log(`Tests failed: ${failed}`, failed > 0 ? 'red' : 'green');
log('='.repeat(50), 'cyan');

if (failed > 0) {
  process.exit(1);
} else {
  log('\n✅ All tests passed!', 'green');
  process.exit(0);
}
