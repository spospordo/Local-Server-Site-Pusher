#!/usr/bin/env node
/**
 * Test script for the Remote Management module.
 * Tests device registration, token auth, command queuing, and result recording.
 *
 * Run: node scripts/test-remote-management.js
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// Redirect module storage to a temp directory so we don't pollute config/
// ---------------------------------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-mgmt-test-'));
process.env.REMOTE_MGMT_KEY = 'test-key-for-unit-tests';

// Redirect all reads/writes to a temporary directory so the tests never touch
// config/remote-devices.json.enc in the real project directory.
const DEVICES_FILE_REAL = path.join(__dirname, '..', 'config', 'remote-devices.json.enc');
const DEVICES_FILE_TMP  = path.join(tmpDir, 'remote-devices.json.enc');
const _origReadFileSync  = fs.readFileSync.bind(fs);
const _origWriteFileSync = fs.writeFileSync.bind(fs);
const _origExistsSync    = fs.existsSync.bind(fs);
const _origMkdirSync     = fs.mkdirSync.bind(fs);

fs.readFileSync  = (p, ...args) => _origReadFileSync (p === DEVICES_FILE_REAL ? DEVICES_FILE_TMP : p, ...args);
fs.writeFileSync = (p, ...args) => _origWriteFileSync(p === DEVICES_FILE_REAL ? DEVICES_FILE_TMP : p, ...args);
fs.existsSync    = (p)          => _origExistsSync   (p === DEVICES_FILE_REAL ? DEVICES_FILE_TMP : p);
fs.mkdirSync     = (p, ...args) => {
  if (p === path.join(__dirname, '..', 'config')) return; // real config dir already exists
  _origMkdirSync(p, ...args);
};

// Require the module *after* patching so it picks up the redirected file paths.
const remoteMgmt = require('../modules/remote-management');

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\n🔍 Testing remote-management module\n');

// --- List (empty) ---
console.log('Test: listDevices (empty)');
{
  const devices = remoteMgmt.listDevices();
  assert(Array.isArray(devices), 'returns array');
  assert(devices.length === 0, 'initially empty');
}

// --- Register ---
console.log('\nTest: registerDevice');
let deviceId;
let plainToken;
{
  const result = remoteMgmt.registerDevice({ name: 'Test Pi' });
  assert(typeof result.token === 'string' && result.token.length >= 32, 'token returned');
  assert(result.device.name === 'Test Pi', 'name stored');
  assert(typeof result.device.id === 'string', 'id assigned');
  assert(!result.device.tokenHash, 'tokenHash not leaked');
  deviceId = result.device.id;
  plainToken = result.token;
}

// --- List after register ---
console.log('\nTest: listDevices after register');
{
  const devices = remoteMgmt.listDevices();
  assert(devices.length === 1, 'one device');
  assert(!devices[0].tokenHash, 'tokenHash not in list');
}

// --- Register with missing name ---
console.log('\nTest: registerDevice missing name');
{
  try {
    remoteMgmt.registerDevice({ name: '' });
    assert(false, 'should throw');
  } catch (err) {
    assert(/name is required/i.test(err.message), 'throws with helpful message');
  }
}

// --- Auth ---
console.log('\nTest: authenticateDevice');
{
  const device = remoteMgmt.authenticateDevice(plainToken);
  assert(device !== null, 'valid token accepted');
  assert(device.id === deviceId, 'returns correct device');
  assert(!device.tokenHash, 'tokenHash not returned');

  const bad = remoteMgmt.authenticateDevice('wrong-token');
  assert(bad === null, 'invalid token rejected');

  const empty = remoteMgmt.authenticateDevice('');
  assert(empty === null, 'empty token rejected');
}

// --- Queue command ---
console.log('\nTest: queueCommand');
let commandId;
{
  const cmd = remoteMgmt.queueCommand(deviceId, 'daemon_ping', {});
  assert(cmd.status === 'pending', 'status is pending');
  assert(cmd.deviceId === deviceId, 'deviceId stored');
  assert(cmd.type === 'daemon_ping', 'type stored');
  commandId = cmd.id;
}

// --- Queue unsupported command ---
console.log('\nTest: queueCommand unsupported type');
{
  try {
    remoteMgmt.queueCommand(deviceId, 'launch_missiles', {});
    assert(false, 'should throw');
  } catch (err) {
    assert(/unsupported command/i.test(err.message), 'throws with helpful message');
  }
}

// --- Queue config_update with empty payload ---
console.log('\nTest: queueCommand config_update empty payload');
{
  try {
    remoteMgmt.queueCommand(deviceId, 'config_update', {});
    assert(false, 'should throw');
  } catch (err) {
    assert(/non-empty payload/i.test(err.message), 'throws with helpful message');
  }
}

// --- devicePoll ---
console.log('\nTest: devicePoll');
{
  const pending = remoteMgmt.devicePoll(deviceId, { platform: 'linux', version: '1.0.0' });
  assert(pending.length === 1, 'one pending command returned');
  assert(pending[0].id === commandId, 'correct command returned');
  assert(pending[0].status === 'delivered', 'status updated to delivered');

  // Second poll – no more pending commands
  const pending2 = remoteMgmt.devicePoll(deviceId, {});
  assert(pending2.length === 0, 'no more pending after first poll');
}

// --- recordCommandResult ---
console.log('\nTest: recordCommandResult');
{
  const ok = remoteMgmt.recordCommandResult(deviceId, commandId, {
    success: true,
    output: 'pong',
  });
  assert(ok === true, 'result recorded');

  const history = remoteMgmt.getCommandHistory(deviceId);
  const cmd = history.find(c => c.id === commandId);
  assert(cmd.status === 'completed', 'status is completed');
  assert(cmd.result.output === 'pong', 'output stored');
}

// --- recordCommandResult unknown command ---
console.log('\nTest: recordCommandResult unknown command');
{
  const ok = remoteMgmt.recordCommandResult(deviceId, 'unknown-id', { success: true });
  assert(ok === false, 'returns false for unknown command');
}

// --- Rotate token ---
console.log('\nTest: rotateDeviceToken');
{
  const result = remoteMgmt.rotateDeviceToken(deviceId);
  assert(result.success === true, 'rotation succeeded');
  assert(typeof result.token === 'string' && result.token.length >= 32, 'new token returned');

  // Old token should no longer work
  const oldAuth = remoteMgmt.authenticateDevice(plainToken);
  assert(oldAuth === null, 'old token rejected after rotation');

  // New token should work
  const newAuth = remoteMgmt.authenticateDevice(result.token);
  assert(newAuth !== null, 'new token accepted');
}

// --- Delete device ---
console.log('\nTest: deleteDevice');
{
  const result = remoteMgmt.deleteDevice(deviceId);
  assert(result.success === true, 'deletion succeeded');

  const devices = remoteMgmt.listDevices();
  assert(devices.length === 0, 'device list empty after deletion');

  const history = remoteMgmt.getCommandHistory(deviceId);
  assert(history.length === 0, 'command history removed');

  const notFound = remoteMgmt.deleteDevice(deviceId);
  assert(notFound.success === false, 'double-delete returns error');
}

// --- SUPPORTED_COMMANDS export ---
console.log('\nTest: SUPPORTED_COMMANDS list');
{
  const required = [
    'display_on', 'display_off', 'display_auto', 'browser_restart', 'dashboard_restart',
    'pi_reboot', 'pi_shutdown', 'config_update', 'daemon_ping',
  ];
  for (const cmd of required) {
    assert(remoteMgmt.SUPPORTED_COMMANDS.includes(cmd), `${cmd} is listed`);
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

// Restore patched fs functions
fs.readFileSync = _origReadFileSync;
fs.writeFileSync = _origWriteFileSync;
fs.existsSync = _origExistsSync;
fs.mkdirSync = _origMkdirSync;
fs.rmSync(tmpDir, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
