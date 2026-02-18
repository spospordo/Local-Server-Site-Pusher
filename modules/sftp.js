/**
 * SFTP Module
 * 
 * Handles SFTP connections for backup upload/download management.
 * Supports both password and key-based authentication with secure credential storage.
 */

const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const SFTP_CONFIG_FILE = path.join(CONFIG_DIR, 'sftp-config.json.enc');

// Encryption settings - AES-256-GCM for secure credential storage
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;

/**
 * Derive encryption key from application secret
 * Uses PBKDF2 for key derivation
 */
function deriveKey() {
  // Use a combination of system-specific data for key derivation
  const secret = process.env.ENCRYPTION_SECRET || 'default-secret-change-in-production';
  const salt = 'sftp-config-salt-v1'; // Static salt is acceptable here as we're deriving from a secret
  
  return crypto.pbkdf2Sync(secret, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt sensitive data
 */
function encrypt(data) {
  try {
    const key = deriveKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine iv + authTag + encrypted data
    const result = Buffer.concat([iv, authTag, encrypted]);
    return result.toString('base64');
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] Encryption failed: ${error.message}`);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedData) {
  try {
    const key = deriveKey();
    const buffer = Buffer.from(encryptedData, 'base64');
    
    // Extract iv, authTag, and encrypted data
    const iv = buffer.slice(0, IV_LENGTH);
    const authTag = buffer.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.slice(IV_LENGTH + AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] Decryption failed: ${error.message}`);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Save SFTP configuration securely
 */
function saveConfig(config) {
  try {
    // Validate required fields
    if (!config.host) {
      throw new Error('Host is required');
    }
    if (!config.port || config.port < 1 || config.port > 65535) {
      throw new Error('Valid port number is required (1-65535)');
    }
    if (!config.username) {
      throw new Error('Username is required');
    }
    
    // Validate authentication method
    if (config.authMethod === 'password') {
      if (!config.password) {
        throw new Error('Password is required for password authentication');
      }
    } else if (config.authMethod === 'key') {
      if (!config.privateKey) {
        throw new Error('Private key is required for key-based authentication');
      }
    } else {
      throw new Error('Invalid authentication method. Use "password" or "key"');
    }
    
    // Sanitize config before saving
    const sanitizedConfig = {
      host: config.host.trim(),
      port: parseInt(config.port),
      username: config.username.trim(),
      authMethod: config.authMethod,
      remotePath: config.remotePath?.trim() || '/',
      enabled: config.enabled !== false
    };
    
    // Add authentication credentials
    if (config.authMethod === 'password') {
      sanitizedConfig.password = config.password;
    } else if (config.authMethod === 'key') {
      sanitizedConfig.privateKey = config.privateKey;
      if (config.passphrase) {
        sanitizedConfig.passphrase = config.passphrase;
      }
    }
    
    // Encrypt and save
    const encrypted = encrypt(sanitizedConfig);
    
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    fs.writeFileSync(SFTP_CONFIG_FILE, encrypted, { mode: 0o600 });
    
    logger.info(logger.categories.SYSTEM, '[SFTP] Configuration saved successfully');
    
    return { success: true, message: 'SFTP configuration saved successfully' };
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] Failed to save config: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Load SFTP configuration
 * Returns decrypted config or null if not configured
 */
function loadConfig() {
  try {
    if (!fs.existsSync(SFTP_CONFIG_FILE)) {
      return null;
    }
    
    const encrypted = fs.readFileSync(SFTP_CONFIG_FILE, 'utf8');
    const config = decrypt(encrypted);
    
    return config;
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] Failed to load config: ${error.message}`);
    return null;
  }
}

/**
 * Get SFTP configuration without sensitive data
 * Safe to send to frontend
 */
function getConfigSafe() {
  try {
    const config = loadConfig();
    if (!config) {
      return null;
    }
    
    // Return config without credentials
    return {
      host: config.host,
      port: config.port,
      username: config.username,
      authMethod: config.authMethod,
      remotePath: config.remotePath,
      enabled: config.enabled,
      hasPassword: !!config.password,
      hasPrivateKey: !!config.privateKey,
      hasPassphrase: !!config.passphrase
    };
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] Failed to get safe config: ${error.message}`);
    return null;
  }
}

/**
 * Delete SFTP configuration
 */
function deleteConfig() {
  try {
    if (fs.existsSync(SFTP_CONFIG_FILE)) {
      fs.unlinkSync(SFTP_CONFIG_FILE);
      logger.info(logger.categories.SYSTEM, '[SFTP] Configuration deleted');
    }
    return { success: true, message: 'SFTP configuration deleted' };
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] Failed to delete config: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Create SFTP connection with retry logic
 */
async function createConnection(config = null, retries = 3) {
  const sftpConfig = config || loadConfig();
  
  if (!sftpConfig) {
    throw new Error('SFTP not configured');
  }
  
  if (!sftpConfig.enabled) {
    throw new Error('SFTP is disabled');
  }
  
  const sftp = new SftpClient();
  
  // Build connection config
  const connectionConfig = {
    host: sftpConfig.host,
    port: sftpConfig.port,
    username: sftpConfig.username,
    readyTimeout: 30000, // 30 seconds
    retries: retries,
    retry_minTimeout: 2000
  };
  
  // Add authentication
  if (sftpConfig.authMethod === 'password') {
    connectionConfig.password = sftpConfig.password;
  } else if (sftpConfig.authMethod === 'key') {
    connectionConfig.privateKey = sftpConfig.privateKey;
    if (sftpConfig.passphrase) {
      connectionConfig.passphrase = sftpConfig.passphrase;
    }
  }
  
  try {
    await sftp.connect(connectionConfig);
    return sftp;
  } catch (error) {
    // Enhanced error diagnostics
    const diagnostic = diagnoseConnectionError(error);
    error.diagnostic = diagnostic;
    throw error;
  }
}

/**
 * Diagnose connection errors and provide actionable suggestions
 */
function diagnoseConnectionError(error) {
  const diagnostic = {
    error: error.message,
    suggestions: []
  };
  
  if (error.message.includes('ECONNREFUSED')) {
    diagnostic.suggestions.push('Connection refused - check if SFTP server is running');
    diagnostic.suggestions.push('Verify the host address and port number are correct');
    diagnostic.suggestions.push('Check firewall settings on the server');
  } else if (error.message.includes('ETIMEDOUT')) {
    diagnostic.suggestions.push('Connection timeout - server may be unreachable');
    diagnostic.suggestions.push('Check network connectivity between client and server');
    diagnostic.suggestions.push('Verify firewall rules allow SFTP connections');
  } else if (error.message.includes('ENOTFOUND')) {
    diagnostic.suggestions.push('Host not found - check the hostname or IP address');
    diagnostic.suggestions.push('Verify DNS resolution is working correctly');
  } else if (error.message.includes('Authentication failed') || error.message.includes('All configured authentication')) {
    diagnostic.suggestions.push('Authentication failed - verify username and password/key');
    diagnostic.suggestions.push('For key-based auth: ensure private key format is correct (OpenSSH format)');
    diagnostic.suggestions.push('For key-based auth: check if passphrase is required and provided');
    diagnostic.suggestions.push('Verify the user has SFTP access permissions on the server');
  } else if (error.message.includes('Permission denied')) {
    diagnostic.suggestions.push('Permission denied - check file/directory permissions on server');
    diagnostic.suggestions.push('Verify the remote path exists and user has access');
  } else if (error.message.includes('No such file')) {
    diagnostic.suggestions.push('File or directory not found on server');
    diagnostic.suggestions.push('Verify the remote path is correct');
  } else {
    diagnostic.suggestions.push('Check SFTP server logs for more details');
    diagnostic.suggestions.push('Verify SFTP service is properly configured on the server');
  }
  
  return diagnostic;
}

/**
 * Test SFTP connection
 * Returns detailed diagnostic information
 */
async function testConnection(config = null) {
  const startTime = Date.now();
  let sftp = null;
  
  try {
    logger.info(logger.categories.SYSTEM, '[SFTP] Testing connection...');
    
    const sftpConfig = config || loadConfig();
    if (!sftpConfig) {
      return {
        success: false,
        error: 'SFTP not configured',
        suggestions: ['Configure SFTP connection details first']
      };
    }
    
    sftp = await createConnection(sftpConfig, 1);
    
    // Test access to remote path
    const remotePath = sftpConfig.remotePath || '/';
    const exists = await sftp.exists(remotePath);
    
    if (!exists) {
      return {
        success: false,
        error: `Remote path does not exist: ${remotePath}`,
        suggestions: [
          'Verify the remote path is correct',
          'Create the directory on the server if needed',
          'Check user permissions for the path'
        ]
      };
    }
    
    // Try to list directory
    try {
      await sftp.list(remotePath);
    } catch (listError) {
      return {
        success: false,
        error: `Cannot list directory: ${listError.message}`,
        suggestions: [
          'User may not have read permissions on the directory',
          'Verify the path is a directory, not a file'
        ]
      };
    }
    
    const duration = Date.now() - startTime;
    
    logger.success(logger.categories.SYSTEM, `[SFTP] Connection test successful (${duration}ms)`);
    
    return {
      success: true,
      message: 'SFTP connection successful',
      details: {
        host: sftpConfig.host,
        port: sftpConfig.port,
        username: sftpConfig.username,
        remotePath: remotePath,
        duration: duration
      }
    };
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] Connection test failed: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      suggestions: error.diagnostic?.suggestions || ['Check server logs for more details']
    };
  } finally {
    if (sftp) {
      try {
        await sftp.end();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Upload backup file to SFTP server
 * Streams file for memory efficiency with large files
 */
async function uploadBackup(localFilePath, remoteFileName = null) {
  let sftp = null;
  const startTime = Date.now();
  
  try {
    // Verify local file exists
    if (!fs.existsSync(localFilePath)) {
      throw new Error('Local file not found');
    }
    
    const stats = fs.statSync(localFilePath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    
    logger.info(logger.categories.SYSTEM, `[SFTP] Starting upload: ${path.basename(localFilePath)} (${fileSizeMB} MB)`);
    
    const config = loadConfig();
    if (!config) {
      throw new Error('SFTP not configured');
    }
    
    sftp = await createConnection(config);
    
    // Determine remote file path
    const fileName = remoteFileName || path.basename(localFilePath);
    const remotePath = config.remotePath || '/';
    const remoteFilePath = path.join(remotePath, fileName).replace(/\\/g, '/');
    
    // Ensure remote directory exists
    try {
      await sftp.mkdir(remotePath, true);
    } catch (e) {
      // Directory may already exist, that's ok
    }
    
    // Upload with streaming
    await sftp.fastPut(localFilePath, remoteFilePath, {
      step: (totalTransferred, chunk, total) => {
        const percent = ((totalTransferred / total) * 100).toFixed(1);
        if (totalTransferred === total) {
          logger.info(logger.categories.SYSTEM, `[SFTP] Upload progress: 100%`);
        }
      }
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.success(logger.categories.SYSTEM, `[SFTP] Upload completed: ${fileName} (${duration}s)`);
    
    return {
      success: true,
      message: 'Backup uploaded successfully',
      details: {
        fileName: fileName,
        remotePath: remoteFilePath,
        size: stats.size,
        duration: duration
      }
    };
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] Upload failed: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      suggestions: error.diagnostic?.suggestions || ['Check server logs and permissions']
    };
  } finally {
    if (sftp) {
      try {
        await sftp.end();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Download backup file from SFTP server
 * Streams file for memory efficiency with large files
 */
async function downloadBackup(remoteFileName, localFilePath) {
  let sftp = null;
  const startTime = Date.now();
  
  try {
    logger.info(logger.categories.SYSTEM, `[SFTP] Starting download: ${remoteFileName}`);
    
    const config = loadConfig();
    if (!config) {
      throw new Error('SFTP not configured');
    }
    
    sftp = await createConnection(config);
    
    const remotePath = config.remotePath || '/';
    const remoteFilePath = path.join(remotePath, remoteFileName).replace(/\\/g, '/');
    
    // Verify remote file exists
    const exists = await sftp.exists(remoteFilePath);
    if (!exists) {
      throw new Error('Remote file not found');
    }
    
    // Get file size for progress tracking
    const stat = await sftp.stat(remoteFilePath);
    const fileSizeMB = (stat.size / 1024 / 1024).toFixed(2);
    
    // Download with streaming
    await sftp.fastGet(remoteFilePath, localFilePath, {
      step: (totalTransferred, chunk, total) => {
        const percent = ((totalTransferred / total) * 100).toFixed(1);
        if (totalTransferred === total) {
          logger.info(logger.categories.SYSTEM, `[SFTP] Download progress: 100%`);
        }
      }
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    logger.success(logger.categories.SYSTEM, `[SFTP] Download completed: ${remoteFileName} (${duration}s)`);
    
    return {
      success: true,
      message: 'Backup downloaded successfully',
      details: {
        fileName: remoteFileName,
        localPath: localFilePath,
        size: stat.size,
        duration: duration
      }
    };
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] Download failed: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      suggestions: error.diagnostic?.suggestions || ['Check server logs and permissions']
    };
  } finally {
    if (sftp) {
      try {
        await sftp.end();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * List backup files on SFTP server
 */
async function listBackups() {
  let sftp = null;
  
  try {
    logger.info(logger.categories.SYSTEM, '[SFTP] Listing remote backups...');
    
    const config = loadConfig();
    if (!config) {
      throw new Error('SFTP not configured');
    }
    
    sftp = await createConnection(config);
    
    const remotePath = config.remotePath || '/';
    const files = await sftp.list(remotePath);
    
    // Filter for backup files and format response
    const backups = files
      .filter(file => file.type === '-' && file.name.includes('backup'))
      .map(file => ({
        name: file.name,
        size: file.size,
        modifiedTime: file.modifyTime,
        sizeFormatted: formatFileSize(file.size)
      }))
      .sort((a, b) => b.modifiedTime - a.modifiedTime); // Newest first
    
    logger.info(logger.categories.SYSTEM, `[SFTP] Found ${backups.length} backup files`);
    
    return {
      success: true,
      backups: backups,
      remotePath: remotePath
    };
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[SFTP] List failed: ${error.message}`);
    
    return {
      success: false,
      error: error.message,
      suggestions: error.diagnostic?.suggestions || ['Check server logs and permissions']
    };
  } finally {
    if (sftp) {
      try {
        await sftp.end();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

module.exports = {
  saveConfig,
  loadConfig,
  getConfigSafe,
  deleteConfig,
  testConnection,
  uploadBackup,
  downloadBackup,
  listBackups
};
