/**
 * Remote Management Module
 *
 * Manages secure, token-authenticated remote management of Raspberry Pi
 * smart-mirror devices.  The server stores a registry of registered devices
 * together with a queue of pending commands.  Each Pi device runs a companion
 * daemon (pi-daemon/mirror-daemon.js) that polls this server for commands,
 * executes them locally and reports results back.
 *
 * SSH Bridge: if a device has SSH credentials configured, commands issued via
 * the admin GUI are executed immediately over SSH instead of being left in the
 * HTTP polling queue.  The HTTP polling path remains fully operational for
 * daemons that do not have SSH credentials set up.
 *
 * Storage layout (encrypted with AES-256-CBC):
 *   config/remote-devices.json.enc
 *
 * Schema:
 * {
 *   devices: [
 *     {
 *       id:               string   – UUID
 *       name:             string   – human-readable label
 *       tokenHash:        string   – PBKDF2 hash of the bearer token
 *       createdAt:        string   – ISO timestamp
 *       lastSeen:         string   – ISO timestamp (updated on every poll/heartbeat)
 *       status:           string   – "online" | "offline" | "unknown"
 *       platform:         string   – optional, e.g. "raspberrypi"
 *       version:          string   – optional, daemon version
 *       sshHost:          string   – optional, SSH host/IP
 *       sshPort:          number   – optional, SSH port (default 22)
 *       sshUsername:      string   – optional, SSH username
 *       sshPrivateKey:    string   – optional, OpenSSH private key (PEM)
 *       daemonConfigPath: string   – optional, path to daemon-config.json on device
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
 *       executedVia: string   – "ssh" | "poll" – how the command was executed
 *     }
 *   ]
 * }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client: SshClient } = require('ssh2');
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
  'display_auto',
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

// SSH connection timeout (ms)
const SSH_CONNECT_TIMEOUT_MS = 15000;
// Maximum time to wait for a single SSH command to complete (ms)
const SSH_EXEC_TIMEOUT_MS = 30000;

/**
 * Daemon command names sent to the Pi for each command type when the SSH bridge
 * is used.  The Pi's authorized_keys uses a forced command that runs
 * mirror_cmd.py, which receives these names via SSH_ORIGINAL_COMMAND and
 * forwards them to mirror_daemon.py over a Unix socket.  All actual shell
 * execution happens inside the daemon on the Pi side.
 *   display_on / display_off  → mirror_cmd.py display_on / display_off
 *   browser/dashboard restart → mirror_cmd.py restart_browser
 *   reboot / shutdown         → mirror_cmd.py reboot / shutdown
 *   daemon_ping               → mirror_cmd.py get_status
 *   config_update             → mirror_cmd.py update_config key=value …
 *                               (built dynamically in buildSshShellCommand)
 */
const SSH_COMMAND_STRINGS = {
  display_on:        'display_on',
  display_off:       'display_off',
  display_auto:      'display_auto',
  browser_restart:   'restart_browser',
  dashboard_restart: 'restart_browser',
  pi_reboot:         'reboot',
  pi_shutdown:       'shutdown',
  daemon_ping:       'get_status',
};

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
 * List all registered devices (tokens and SSH private keys are never returned).
 */
function listDevices() {
  const data = loadData();
  return data.devices.map(device => {
    const { tokenHash, sshPrivateKey, ...safe } = device; // eslint-disable-line no-unused-vars
    // Compute live online status
    const lastSeenMs = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
    const isOnline = lastSeenMs > 0 && (Date.now() - lastSeenMs) < DEVICE_OFFLINE_THRESHOLD_MS;
    return {
      ...safe,
      status: isOnline ? 'online' : 'offline',
      sshConfigured: !!(device.sshHost && device.sshUsername && device.sshPrivateKey),
    };
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
// Public API – SSH credential management
// ---------------------------------------------------------------------------

/**
 * Store SSH credentials for a device.
 * Credentials are persisted inside the existing encrypted device registry.
 *
 * @param {string} deviceId
 * @param {object} opts
 * @param {string}  opts.host           – hostname or IP of the Pi
 * @param {number}  [opts.port=22]      – SSH port
 * @param {string}  opts.username       – SSH login username
 * @param {string}  opts.privateKey     – OpenSSH private key (PEM string)
 * @param {string}  [opts.daemonConfigPath] – absolute path to daemon-config.json on the Pi
 */
function setDeviceSshConfig(deviceId, { host, port, username, privateKey, daemonConfigPath } = {}) {
  if (!host || typeof host !== 'string' || !host.trim()) {
    throw new Error('SSH host is required');
  }
  if (!username || typeof username !== 'string' || !username.trim()) {
    throw new Error('SSH username is required');
  }

  const data = loadData();
  const device = data.devices.find(d => d.id === deviceId);
  if (!device) {
    return { success: false, error: 'Device not found' };
  }

  // Private key: required when no key is currently stored; optional otherwise
  // (allows updating host/username without re-entering the key).
  const hasNewKey = privateKey && typeof privateKey === 'string' && privateKey.trim();
  if (!hasNewKey && !device.sshPrivateKey) {
    throw new Error('SSH private key is required');
  }

  device.sshHost = host.trim();
  device.sshPort = (typeof port === 'number' && port > 0) ? port : 22;
  device.sshUsername = username.trim();
  if (hasNewKey) {
    device.sshPrivateKey = privateKey.trim();
  }
  if (daemonConfigPath && typeof daemonConfigPath === 'string') {
    device.daemonConfigPath = daemonConfigPath.trim();
  } else {
    // Clear any previous path when not provided
    delete device.daemonConfigPath;
  }

  saveData(data);
  logger.info('REMOTE_MGMT', `Saved SSH credentials for device: ${device.name} (${deviceId})`);
  return { success: true };
}

/**
 * Return the SSH configuration status for a device (credentials are never returned).
 * @param {string} deviceId
 * @returns {{ configured: boolean, host?: string, port?: number, username?: string, daemonConfigPath?: string }}
 */
function getDeviceSshConfigStatus(deviceId) {
  const data = loadData();
  const device = data.devices.find(d => d.id === deviceId);
  if (!device) {
    return { success: false, error: 'Device not found' };
  }
  const configured = !!(device.sshHost && device.sshUsername && device.sshPrivateKey);
  return {
    success: true,
    configured,
    host: device.sshHost || null,
    port: device.sshPort || 22,
    username: device.sshUsername || null,
    daemonConfigPath: device.daemonConfigPath || null,
  };
}

/**
 * Remove SSH credentials from a device.
 */
function clearDeviceSshConfig(deviceId) {
  const data = loadData();
  const device = data.devices.find(d => d.id === deviceId);
  if (!device) {
    return { success: false, error: 'Device not found' };
  }
  delete device.sshHost;
  delete device.sshPort;
  delete device.sshUsername;
  delete device.sshPrivateKey;
  delete device.daemonConfigPath;
  saveData(data);
  logger.info('REMOTE_MGMT', `Cleared SSH credentials for device: ${device.name} (${deviceId})`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// SSH execution helpers
// ---------------------------------------------------------------------------

/**
 * Build the command string for the given command type and payload.
 * Returns null if the command cannot be executed via SSH.
 *
 * Commands are sent to mirror_cmd.py via the SSH forced command mechanism.
 * mirror_cmd.py receives the original command string through SSH_ORIGINAL_COMMAND
 * and forwards it to mirror_daemon.py over a Unix socket.
 *
 * @param {string} type    – command type
 * @param {object} payload – command payload
 * @param {string} [daemonConfigPath] – kept for backwards compatibility; mirror_cmd.py
 *                                      handles config file location internally
 * @returns {string|null}
 */
function buildSshShellCommand(type, payload, daemonConfigPath) { // eslint-disable-line no-unused-vars
  if (type === 'config_update') {
    if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
      return null;
    }
    // Protect device credentials from being overwritten remotely (mirrors daemon logic)
    const { deviceToken: _deviceToken, serverUrl: _serverUrl, ...safePayload } = payload; // eslint-disable-line no-unused-vars
    if (Object.keys(safePayload).length === 0) {
      return null;
    }
    // Build "update_config key1=value1 key2=value2" format for mirror_cmd.py
    const pairs = Object.entries(safePayload)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
    return `update_config ${pairs}`;
  }

  return SSH_COMMAND_STRINGS[type] || null;
}

/**
 * Execute a command on a remote device via SSH.
 * Resolves with { success, output, error }.
 *
 * @param {object} device   – device record (must include sshHost, sshUsername, sshPrivateKey)
 * @param {string} type     – command type
 * @param {object} [payload]
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
function executeViaSSH(device, type, payload = {}) {
  return new Promise((resolve) => {
    const shellCmd = buildSshShellCommand(type, payload, device.daemonConfigPath);
    if (!shellCmd) {
      return resolve({
        success: false,
        error: `Command "${type}" cannot be executed via SSH bridge`,
      });
    }

    const conn = new SshClient();
    let settled = false;

    const finish = (result) => {
      if (!settled) {
        settled = true;
        conn.end();
        resolve(result);
      }
    };

    const connectTimeout = setTimeout(() => {
      finish({ success: false, error: 'SSH connection timed out' });
    }, SSH_CONNECT_TIMEOUT_MS);

    conn.on('ready', () => {
      clearTimeout(connectTimeout);
      conn.exec(shellCmd, { pty: false }, (err, stream) => {
        if (err) {
          return finish({ success: false, error: `SSH exec error: ${err.message}` });
        }

        let stdout = '';
        let stderr = '';
        let execTimeout;

        execTimeout = setTimeout(() => {
          finish({ success: false, error: 'SSH command execution timed out' });
        }, SSH_EXEC_TIMEOUT_MS);

        stream.on('data', (chunk) => { stdout += chunk; });
        stream.stderr.on('data', (chunk) => { stderr += chunk; });

        stream.on('close', (code) => {
          clearTimeout(execTimeout);
          // Exit code null means the SSH channel was closed without an exit status,
          // which is expected for reboot/shutdown commands where the remote end
          // terminates the connection before sending the exit code.
          const success = (code === 0 || code === null);
          finish({
            success,
            output: stdout.trim() || undefined,
            error: success ? undefined : (stderr.trim() || `Exit code ${code}`),
          });
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(connectTimeout);
      finish({ success: false, error: `SSH error: ${err.message}` });
    });

    try {
      conn.connect({
        host: device.sshHost,
        port: device.sshPort || 22,
        username: device.sshUsername,
        privateKey: device.sshPrivateKey,
        readyTimeout: SSH_CONNECT_TIMEOUT_MS,
        // Disable strict host key checking for managed devices
        algorithms: { serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'] },
      });
    } catch (connErr) {
      clearTimeout(connectTimeout);
      finish({ success: false, error: `SSH connect failed: ${connErr.message}` });
    }
  });
}

// ---------------------------------------------------------------------------
// Public API – Command management
// ---------------------------------------------------------------------------

/**
 * Queue a command for a specific device (HTTP polling path).
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
 * Issue a command to a device:
 *   1. Creates the command record (status "pending").
 *   2. If the device has SSH credentials configured and the command type supports
 *      SSH execution, runs the command immediately via SSH and updates the record.
 *   3. Otherwise the command remains "pending" for the HTTP polling daemon to pick up.
 *
 * This is the preferred entry-point for admin-initiated commands.
 *
 * @param {string} deviceId
 * @param {string} type     – one of SUPPORTED_COMMANDS
 * @param {object} [payload]
 * @returns {Promise<{ command: object, executedVia: string }>}
 */
async function issueCommand(deviceId, type, payload = {}) {
  // Create the queued command record first
  const command = queueCommand(deviceId, type, payload);

  // Check whether the device has SSH credentials
  const data = loadData();
  const device = data.devices.find(d => d.id === deviceId);
  const hasSsh = device && device.sshHost && device.sshUsername && device.sshPrivateKey;

  // Check whether this command type can be executed via SSH
  const sshShellCmd = buildSshShellCommand(type, payload, device && device.daemonConfigPath);
  const sshSupported = hasSsh && sshShellCmd !== null;

  if (!sshSupported) {
    // Leave in queue for HTTP polling daemon
    logger.info(
      'REMOTE_MGMT',
      `Command "${type}" for device ${device ? device.name : deviceId} queued for HTTP polling`
    );
    return { command, executedVia: 'poll' };
  }

  // Attempt immediate SSH execution
  logger.info('REMOTE_MGMT', `Executing "${type}" via SSH on device ${device.name} (${deviceId})`);

  let sshResult;
  try {
    sshResult = await executeViaSSH(device, type, payload);
  } catch (err) {
    sshResult = { success: false, error: err.message };
  }

  // Update the command record with the SSH execution result
  const now = new Date().toISOString();
  const freshData = loadData();
  const cmdRecord = freshData.commands.find(c => c.id === command.id);
  if (cmdRecord) {
    cmdRecord.status = sshResult.success ? 'completed' : 'failed';
    cmdRecord.deliveredAt = now;
    cmdRecord.completedAt = now;
    cmdRecord.executedVia = 'ssh';
    cmdRecord.result = {
      success: sshResult.success,
      output: sshResult.output || null,
      error: sshResult.error || null,
    };
    // Update device lastSeen
    const deviceRecord = freshData.devices.find(d => d.id === deviceId);
    if (deviceRecord) deviceRecord.lastSeen = now;
    saveData(freshData);
  }

  const level = sshResult.success ? 'success' : 'warning';
  logger[level](
    'REMOTE_MGMT',
    `SSH "${type}" ${sshResult.success ? 'succeeded' : 'failed'} on device ${device.name}: ` +
    `${sshResult.output || sshResult.error || ''}`
  );

  // Return fresh record
  const updated = Object.assign({}, command, cmdRecord || {});
  return { command: updated, executedVia: 'ssh' };
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
  // SSH credential management
  setDeviceSshConfig,
  getDeviceSshConfigStatus,
  clearDeviceSshConfig,
  // Command management
  queueCommand,
  issueCommand,
  getCommandHistory,
  // Device-side
  authenticateDevice,
  devicePoll,
  recordCommandResult,
};
