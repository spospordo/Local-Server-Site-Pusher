/**
 * Remote Management Module
 *
 * Manages secure, token-authenticated remote management of Raspberry Pi
 * smart-mirror devices.  The server stores a registry of registered devices
 * together with a queue of pending commands.  Each Pi device runs a companion
 * daemon (pi-daemon/mirror-daemon.js) that polls this server for commands,
 * executes them locally and reports results back.
 *
 * Storage layout (encrypted with AES-256-CBC):
 *   config/remote-devices.json.enc
 *
 * Schema:
 * {
 *   devices: [
 *     {
 *       id:          string   – UUID
 *       name:        string   – human-readable label
 *       tokenHash:   string   – PBKDF2 hash of the bearer token
 *       createdAt:   string   – ISO timestamp
 *       lastSeen:    string   – ISO timestamp (updated on every poll/heartbeat)
 *       status:      string   – "online" | "offline" | "unknown"
 *       platform:    string   – optional, e.g. "raspberrypi"
 *       version:     string   – optional, daemon version
 *     }
 *   ],
 *   commands: [
 *     {
 *       id:          string   – UUID
 *       deviceId:    string
 *       type:        string   – see SUPPORTED_COMMANDS
 *       payload:     object   – optional command parameters
 *       status:      string   – "pending" | "delivered" | "completed" | "failed"
 *       createdAt:   string
 *       deliveredAt: string   – when the device received it
 *       completedAt: string   – when the device finished
 *       result:      object   – { success, output, error }
 *     }
 *   ]
 * }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const DEVICES_FILE = path.join(CONFIG_DIR, 'remote-devices.json.enc');
const ENCRYPTION_KEY = process.env.REMOTE_MGMT_KEY || 'remote-mgmt-default-key-change-in-production';

const SUPPORTED_COMMANDS = [
  'display_on',
  'display_off',
  'browser_restart',
  'dashboard_restart',
  'pi_reboot',
  'pi_shutdown',
  'config_update',
  'daemon_ping',
];

const DEVICE_OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// PBKDF2 parameters for token hashing
const TOKEN_SALT_ROUNDS = 10000;
const TOKEN_KEY_LENGTH = 64;

// ---------------------------------------------------------------------------
// Startup warnings
// ---------------------------------------------------------------------------

if (!process.env.REMOTE_MGMT_KEY) {
  logger.warning(
    'REMOTE_MGMT',
    'Using default encryption key for remote management storage. ' +
    'Set REMOTE_MGMT_KEY environment variable for production.'
  );
}

// ---------------------------------------------------------------------------
// Encryption helpers (mirror the pattern used in webhooks.js)
// ---------------------------------------------------------------------------

function encrypt(text) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'remote-mgmt-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'remote-mgmt-salt', 32);
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random bearer token for a device.
 * @returns {string} 48-byte hex string (96 characters)
 */
function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Hash a plain-text token for safe storage (non-reversible).
 */
function hashToken(token) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(token, salt, TOKEN_SALT_ROUNDS, TOKEN_KEY_LENGTH, 'sha512')
    .toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a plain-text token against a stored hash.
 */
function verifyToken(token, storedHash) {
  if (!storedHash) return false;
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const verifyHash = crypto
    .pbkdf2Sync(token, salt, TOKEN_SALT_ROUNDS, TOKEN_KEY_LENGTH, 'sha512')
    .toString('hex');
  // Constant-time comparison
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadData() {
  try {
    if (!fs.existsSync(DEVICES_FILE)) {
      return { devices: [], commands: [] };
    }
    const encryptedData = fs.readFileSync(DEVICES_FILE, 'utf8');
    const decryptedData = decrypt(encryptedData);
    return JSON.parse(decryptedData);
  } catch (error) {
    logger.error('REMOTE_MGMT', `Failed to load remote management data: ${error.message}`);
    return { devices: [], commands: [] };
  }
}

function saveData(data) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const jsonData = JSON.stringify(data, null, 2);
    const encryptedData = encrypt(jsonData);
    fs.writeFileSync(DEVICES_FILE, encryptedData, { mode: 0o600 });
    return true;
  } catch (error) {
    logger.error('REMOTE_MGMT', `Failed to save remote management data: ${error.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API – Device management
// ---------------------------------------------------------------------------

/**
 * List all registered devices (tokens are never returned).
 */
function listDevices() {
  const data = loadData();
  return data.devices.map(device => {
    const { tokenHash, ...safe } = device; // eslint-disable-line no-unused-vars
    // Compute live online status
    const lastSeenMs = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
    const isOnline = lastSeenMs > 0 && (Date.now() - lastSeenMs) < DEVICE_OFFLINE_THRESHOLD_MS;
    return { ...safe, status: isOnline ? 'online' : 'offline' };
  });
}

/**
 * Register a new device.
 * @param {object} opts
 * @param {string} opts.name – human-readable label
 * @returns {{ device: object, token: string }} device record (without tokenHash) and the plain token
 */
function registerDevice({ name }) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Device name is required');
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const device = {
    id,
    name: name.trim(),
    tokenHash,
    createdAt: now,
    lastSeen: null,
    status: 'unknown',
    platform: null,
    version: null,
  };

  const data = loadData();
  data.devices.push(device);
  saveData(data);

  logger.info('REMOTE_MGMT', `Registered new device: ${name} (${id})`);

  const { tokenHash: _th, ...safeDevice } = device; // eslint-disable-line no-unused-vars
  return { device: safeDevice, token };
}

/**
 * Delete a device and all its queued/historical commands.
 */
function deleteDevice(id) {
  const data = loadData();
  const idx = data.devices.findIndex(d => d.id === id);
  if (idx === -1) {
    return { success: false, error: 'Device not found' };
  }
  const [removed] = data.devices.splice(idx, 1);
  // Remove all commands for this device
  data.commands = data.commands.filter(c => c.deviceId !== id);
  saveData(data);
  logger.info('REMOTE_MGMT', `Deleted device: ${removed.name} (${id})`);
  return { success: true };
}

/**
 * Regenerate the bearer token for a device.
 * @returns {{ token: string }} the new plain token
 */
function rotateDeviceToken(id) {
  const data = loadData();
  const device = data.devices.find(d => d.id === id);
  if (!device) {
    return { success: false, error: 'Device not found' };
  }
  const token = generateToken();
  device.tokenHash = hashToken(token);
  saveData(data);
  logger.info('REMOTE_MGMT', `Rotated token for device: ${device.name} (${id})`);
  return { success: true, token };
}

// ---------------------------------------------------------------------------
// Public API – Command management
// ---------------------------------------------------------------------------

/**
 * Queue a command for a specific device.
 * @param {string} deviceId
 * @param {string} type – one of SUPPORTED_COMMANDS
 * @param {object} [payload] – optional command parameters
 * @returns {object} the new command record
 */
function queueCommand(deviceId, type, payload = {}) {
  if (!SUPPORTED_COMMANDS.includes(type)) {
    throw new Error(`Unsupported command type: ${type}. Supported: ${SUPPORTED_COMMANDS.join(', ')}`);
  }

  const data = loadData();
  const device = data.devices.find(d => d.id === deviceId);
  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  // Validate config_update payload has at least one key
  if (type === 'config_update' && (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0)) {
    throw new Error('config_update command requires a non-empty payload object');
  }

  const command = {
    id: crypto.randomUUID(),
    deviceId,
    type,
    payload,
    status: 'pending',
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    completedAt: null,
    result: null,
  };

  data.commands.push(command);

  // Keep history reasonable – retain last 200 commands per device
  const deviceCmds = data.commands.filter(c => c.deviceId === deviceId);
  if (deviceCmds.length > 200) {
    const toRemove = deviceCmds.slice(0, deviceCmds.length - 200).map(c => c.id);
    data.commands = data.commands.filter(c => !toRemove.includes(c.id));
  }

  saveData(data);
  logger.info('REMOTE_MGMT', `Queued command "${type}" for device ${device.name} (${deviceId})`);
  return command;
}

/**
 * Get command history for a device.
 * @param {string} deviceId
 * @param {number} [limit=50]
 */
function getCommandHistory(deviceId, limit = 50) {
  const data = loadData();
  const cmds = data.commands
    .filter(c => c.deviceId === deviceId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
  return cmds;
}

// ---------------------------------------------------------------------------
// Public API – Device-side endpoints (called by the Pi daemon)
// ---------------------------------------------------------------------------

/**
 * Authenticate a device using its bearer token.
 * @param {string} token – plain bearer token from the Authorization header
 * @returns {{ device: object }|null} the device record (without tokenHash), or null on failure
 */
function authenticateDevice(token) {
  if (!token || typeof token !== 'string') return null;
  const data = loadData();
  for (const device of data.devices) {
    if (verifyToken(token, device.tokenHash)) {
      const { tokenHash: _th, ...safe } = device; // eslint-disable-line no-unused-vars
      return safe;
    }
  }
  return null;
}

/**
 * Record a device heartbeat / poll.  Updates lastSeen and any reported metadata.
 * Returns the list of pending commands for the device (marks them as "delivered").
 *
 * @param {string} deviceId
 * @param {object} [meta] – optional { platform, version } reported by the daemon
 * @returns {Array} pending commands to execute
 */
function devicePoll(deviceId, meta = {}) {
  const data = loadData();
  const device = data.devices.find(d => d.id === deviceId);
  if (!device) {
    logger.warning('REMOTE_MGMT', `Poll from unknown device: ${deviceId}`);
    return [];
  }

  const now = new Date().toISOString();
  device.lastSeen = now;
  device.status = 'online';
  if (meta.platform) device.platform = meta.platform;
  if (meta.version) device.version = meta.version;

  // Fetch pending commands and mark them delivered
  const pending = data.commands.filter(
    c => c.deviceId === deviceId && c.status === 'pending'
  );

  pending.forEach(c => {
    c.status = 'delivered';
    c.deliveredAt = now;
  });

  saveData(data);

  if (pending.length > 0) {
    logger.info('REMOTE_MGMT', `Delivered ${pending.length} command(s) to device ${device.name}`);
  }

  return pending;
}

/**
 * Record the result of a command execution reported by the Pi daemon.
 *
 * @param {string} deviceId
 * @param {string} commandId
 * @param {{ success: boolean, output?: string, error?: string }} result
 */
function recordCommandResult(deviceId, commandId, result) {
  const data = loadData();
  const command = data.commands.find(c => c.id === commandId && c.deviceId === deviceId);
  if (!command) {
    logger.warning('REMOTE_MGMT', `Result for unknown command ${commandId} from device ${deviceId}`);
    return false;
  }

  command.status = result.success ? 'completed' : 'failed';
  command.completedAt = new Date().toISOString();
  command.result = {
    success: result.success,
    output: result.output || null,
    error: result.error || null,
  };

  // Update device lastSeen
  const device = data.devices.find(d => d.id === deviceId);
  if (device) {
    device.lastSeen = new Date().toISOString();
  }

  saveData(data);

  const level = result.success ? 'info' : 'warning';
  logger[level](
    'REMOTE_MGMT',
    `Command "${command.type}" ${result.success ? 'completed' : 'failed'} on device ${deviceId}: ${result.output || result.error || ''}`
  );

  return true;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  SUPPORTED_COMMANDS,
  listDevices,
  registerDevice,
  deleteDevice,
  rotateDeviceToken,
  queueCommand,
  getCommandHistory,
  authenticateDevice,
  devicePoll,
  recordCommandResult,
};
