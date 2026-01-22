/**
 * NFS Module
 * 
 * Handles NFS (Network File System) network drive connections for backups and restores.
 * Provides functionality to configure, mount, and manage NFS shares for data transfer.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, exec } = require('child_process');
const logger = require('./logger');
const { formatNFSMountError, formatFileSystemError, logError, createErrorResponse } = require('./error-helper');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const NFS_CONFIG_FILE = path.join(CONFIG_DIR, 'nfs-config.json.enc');
const NFS_MOUNT_BASE = path.join(__dirname, '..', 'nfs-mounts');
const ENCRYPTION_KEY_FILE = path.join(CONFIG_DIR, '.nfs-key');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * Get or create encryption key for NFS credentials
 */
function getEncryptionKey() {
  try {
    if (fs.existsSync(ENCRYPTION_KEY_FILE)) {
      return fs.readFileSync(ENCRYPTION_KEY_FILE, 'utf8');
    }
    
    // Generate new encryption key
    const key = crypto.randomBytes(32).toString('base64');
    fs.writeFileSync(ENCRYPTION_KEY_FILE, key, { mode: 0o600 });
    return key;
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[NFS] Error managing encryption key: ${error.message}`);
    throw error;
  }
}

/**
 * Encrypt sensitive data
 */
function encrypt(data) {
  try {
    const key = Buffer.from(getEncryptionKey(), 'base64');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data), 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[NFS] Encryption error: ${error.message}`);
    throw error;
  }
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedData) {
  try {
    const key = Buffer.from(getEncryptionKey(), 'base64');
    const buffer = Buffer.from(encryptedData, 'base64');
    
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
    logger.error(logger.categories.SYSTEM, `[NFS] Decryption error: ${error.message}`);
    throw error;
  }
}

/**
 * Load NFS configuration
 */
function loadConfig() {
  try {
    if (fs.existsSync(NFS_CONFIG_FILE)) {
      const encryptedData = fs.readFileSync(NFS_CONFIG_FILE, 'utf8');
      return decrypt(encryptedData);
    }
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[NFS] Error loading config: ${error.message}`);
  }
  
  return {
    enabled: false,
    connections: []
  };
}

/**
 * Save NFS configuration
 */
function saveConfig(config) {
  try {
    const encryptedData = encrypt(config);
    fs.writeFileSync(NFS_CONFIG_FILE, encryptedData, { mode: 0o600 });
    logger.info(logger.categories.SYSTEM, '[NFS] Configuration saved');
    return true;
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[NFS] Error saving config: ${error.message}`);
    return false;
  }
}

/**
 * Validate mount options for NFS compatibility
 * Detects SMB/CIFS-specific options that are not compatible with NFS
 */
function validateMountOptions(mountOptions) {
  const warnings = [];
  const errors = [];
  
  if (!mountOptions || mountOptions.trim() === '') {
    return { valid: true, warnings: [], errors: [] };
  }
  
  // SMB/CIFS-only options that should not be used with NFS
  const smbOnlyOptions = [
    'uid=', 'gid=', 'file_mode=', 'dir_mode=', 
    'username=', 'password=', 'domain=', 'credentials=',
    'sec=', 'vers=1.', 'vers=2.', 'vers=3.', // SMB versions
    'iocharset=', 'codepage='
  ];
  
  // Check for SMB/CIFS-specific options
  const optionsLower = mountOptions.toLowerCase();
  for (const smbOption of smbOnlyOptions) {
    if (optionsLower.includes(smbOption)) {
      errors.push(`Invalid NFS option detected: "${smbOption}" is a SMB/CIFS option and not compatible with NFS mounts`);
    }
  }
  
  // Synology-specific recommendations
  const hasNfsVersion = /vers=/i.test(mountOptions);
  if (!hasNfsVersion) {
    warnings.push('No NFS version specified. Synology servers often work best with "vers=3". Consider adding "vers=3" or "vers=4" to mount options.');
  }
  
  // Check for Synology NFSv4 issues
  if (/vers=4/i.test(mountOptions)) {
    warnings.push('Using NFSv4. If connection fails with Synology, try "vers=3" as Synology often defaults to NFSv3.');
  }
  
  // Recommend _netdev for network mounts in fstab
  if (mountOptions && !/_netdev/i.test(mountOptions)) {
    warnings.push('Consider adding "_netdev" option for reliable network mount handling, especially for automatic mounts.');
  }
  
  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}

/**
 * Generate recommended mount options for Synology NFS servers
 */
function getSynologyRecommendedOptions() {
  return {
    basic: 'rw,_netdev,vers=3',
    reliable: 'rw,_netdev,vers=3,soft,timeo=30',
    highPerformance: 'rw,_netdev,vers=3,rsize=8192,wsize=8192,noatime',
    readOnly: 'ro,_netdev,vers=3'
  };
}

/**
 * Validate NFS connection parameters
 */
function validateConnection(connection) {
  const errors = [];
  const warnings = [];
  
  if (!connection.name || connection.name.trim() === '') {
    errors.push('Connection name is required');
  }
  
  if (!connection.host || connection.host.trim() === '') {
    errors.push('NFS server host/IP is required');
  }
  
  if (!connection.exportPath || connection.exportPath.trim() === '') {
    errors.push('Export path is required');
  }
  
  // Validate export path format (should start with /)
  if (connection.exportPath && !connection.exportPath.startsWith('/')) {
    errors.push('Export path must start with /');
  }
  
  // Validate mount options
  if (connection.mountOptions) {
    const optionValidation = validateMountOptions(connection.mountOptions);
    errors.push(...optionValidation.errors);
    warnings.push(...optionValidation.warnings);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get mount point path for a connection
 */
function getMountPoint(connectionId) {
  return path.join(NFS_MOUNT_BASE, connectionId);
}

/**
 * Check if NFS is supported on the system
 */
function isNfsSupported() {
  try {
    // Check if mount.nfs exists
    execSync('which mount.nfs', { stdio: 'pipe' });
    return { supported: true };
  } catch (error) {
    return {
      supported: false,
      message: 'NFS client tools not installed',
      solution: [
        'Install NFS client packages based on your system:',
        '  - Debian/Ubuntu: apt-get install nfs-common',
        '  - RHEL/CentOS/Fedora: yum install nfs-utils',
        '  - Alpine Linux: apk add nfs-utils',
        '  - Arch Linux: pacman -S nfs-utils',
        '',
        'After installation, verify with: which mount.nfs',
        '',
        'If running in Docker, ensure the NFS packages are included in your Dockerfile.'
      ].join('\n')
    };
  }
}

/**
 * Test NFS connection
 */
async function testConnection(connection) {
  return new Promise((resolve) => {
    const validation = validateConnection(connection);
    if (!validation.valid) {
      resolve({
        success: false,
        error: validation.errors.join(', '),
        warnings: validation.warnings
      });
      return;
    }
    
    // Include warnings even if validation passes
    const responseWarnings = validation.warnings;
    
    // Check NFS support
    const nfsSupport = isNfsSupported();
    if (!nfsSupport.supported) {
      resolve({
        success: false,
        error: nfsSupport.message,
        requiresInstall: true
      });
      return;
    }
    
    const testId = `test-${Date.now()}`;
    const mountPoint = getMountPoint(testId);
    
    try {
      // Create mount point
      if (!fs.existsSync(mountPoint)) {
        fs.mkdirSync(mountPoint, { recursive: true });
      }
      
      // Build mount command
      let mountCmd = `mount -t nfs`;
      
      // Add mount options
      const options = [];
      if (connection.readOnly) {
        options.push('ro');
      } else {
        options.push('rw');
      }
      
      if (connection.mountOptions) {
        options.push(connection.mountOptions);
      }
      
      if (options.length > 0) {
        mountCmd += ` -o ${options.join(',')}`;
      }
      
      mountCmd += ` ${connection.host}:${connection.exportPath} ${mountPoint}`;
      
      // Execute mount with timeout
      const timeout = setTimeout(() => {
        exec(`umount ${mountPoint}`, () => {
          fs.rmSync(mountPoint, { recursive: true, force: true });
        });
        resolve({
          success: false,
          error: 'Connection timeout - NFS server may be unreachable'
        });
      }, 10000);
      
      exec(mountCmd, (error, stdout, stderr) => {
        clearTimeout(timeout);
        
        if (error) {
          // Cleanup
          exec(`umount ${mountPoint}`, () => {
            fs.rmSync(mountPoint, { recursive: true, force: true });
          });
          
          // Format error with detailed diagnostics
          const enhancedError = formatNFSMountError({ 
            message: stderr || error.message, 
            code: error.code 
          }, connection);
          
          logError(logger.categories.SYSTEM, enhancedError, {
            operation: 'NFS mount test',
            host: connection.host,
            path: connection.exportPath
          });
          
          resolve({
            success: false,
            ...createErrorResponse(enhancedError)
          });
          return;
        }
        
        // Verify mount is successful
        try {
          const testFile = path.join(mountPoint, '.nfs-test');
          if (!connection.readOnly) {
            fs.writeFileSync(testFile, 'test', 'utf8');
            fs.unlinkSync(testFile);
          } else {
            // For read-only, just check if we can list the directory
            fs.readdirSync(mountPoint);
          }
          
          // Unmount test connection
          exec(`umount ${mountPoint}`, (unmountError) => {
            fs.rmSync(mountPoint, { recursive: true, force: true });
            
            if (unmountError) {
              logger.warning(logger.categories.SYSTEM, `[NFS] Test unmount warning: ${unmountError.message}`);
            }
            
            resolve({
              success: true,
              message: 'Connection successful',
              warnings: responseWarnings
            });
          });
        } catch (testError) {
          // Cleanup
          exec(`umount ${mountPoint}`, () => {
            fs.rmSync(mountPoint, { recursive: true, force: true });
          });
          
          const enhancedError = formatNFSMountError(testError, connection);
          logError(logger.categories.SYSTEM, enhancedError, {
            operation: 'NFS connection test',
            stage: 'file access verification'
          });
          
          resolve({
            success: false,
            ...createErrorResponse(enhancedError)
          });
        }
      });
    } catch (error) {
      // Cleanup
      try {
        exec(`umount ${mountPoint}`, () => {
          fs.rmSync(mountPoint, { recursive: true, force: true });
        });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      const enhancedError = formatNFSMountError(error, connection);
      logError(logger.categories.SYSTEM, enhancedError, {
        operation: 'NFS connection test',
        stage: 'mount point setup'
      });
      
      resolve({
        success: false,
        ...createErrorResponse(enhancedError)
      });
    }
  });
}

/**
 * Mount an NFS connection
 */
async function mountConnection(connectionId) {
  return new Promise((resolve) => {
    const config = loadConfig();
    const connection = config.connections.find(c => c.id === connectionId);
    
    if (!connection) {
      resolve({
        success: false,
        error: 'Connection not found'
      });
      return;
    }
    
    const mountPoint = getMountPoint(connectionId);
    
    try {
      // Check if already mounted
      if (connection.mounted) {
        resolve({
          success: true,
          message: 'Already mounted',
          mountPoint
        });
        return;
      }
      
      // Create mount point
      if (!fs.existsSync(mountPoint)) {
        fs.mkdirSync(mountPoint, { recursive: true });
      }
      
      // Build mount command
      let mountCmd = `mount -t nfs`;
      
      const options = [];
      if (connection.readOnly) {
        options.push('ro');
      } else {
        options.push('rw');
      }
      
      if (connection.mountOptions) {
        options.push(connection.mountOptions);
      }
      
      if (options.length > 0) {
        mountCmd += ` -o ${options.join(',')}`;
      }
      
      mountCmd += ` ${connection.host}:${connection.exportPath} ${mountPoint}`;
      
      exec(mountCmd, (error, stdout, stderr) => {
        if (error) {
          const enhancedError = formatNFSMountError({ 
            message: stderr || error.message, 
            code: error.code 
          }, connection);
          
          logError(logger.categories.SYSTEM, enhancedError, {
            operation: 'NFS mount',
            host: connection.host,
            path: connection.exportPath,
            mountPoint
          });
          
          resolve({
            success: false,
            ...createErrorResponse(enhancedError)
          });
          return;
        }
        
        // Update connection status
        connection.mounted = true;
        connection.mountPoint = mountPoint;
        saveConfig(config);
        
        logger.success(logger.categories.SYSTEM, `[NFS] Mounted ${connection.name} at ${mountPoint}`);
        resolve({
          success: true,
          message: 'Mounted successfully',
          mountPoint
        });
      });
    } catch (error) {
      const enhancedError = formatNFSMountError(error, connection);
      logError(logger.categories.SYSTEM, enhancedError, {
        operation: 'NFS mount',
        stage: 'mount preparation'
      });
      
      resolve({
        success: false,
        ...createErrorResponse(enhancedError)
      });
    }
  });
}

/**
 * Unmount an NFS connection
 */
async function unmountConnection(connectionId) {
  return new Promise((resolve) => {
    const config = loadConfig();
    const connection = config.connections.find(c => c.id === connectionId);
    
    if (!connection) {
      resolve({
        success: false,
        error: 'Connection not found'
      });
      return;
    }
    
    const mountPoint = getMountPoint(connectionId);
    
    if (!connection.mounted) {
      resolve({
        success: true,
        message: 'Not mounted'
      });
      return;
    }
    
    exec(`umount ${mountPoint}`, (error, stdout, stderr) => {
      if (error) {
        const enhancedError = formatNFSMountError({ 
          message: stderr || error.message, 
          code: error.code 
        }, { ...connection, operation: 'unmount' });
        
        logError(logger.categories.SYSTEM, enhancedError, {
          operation: 'NFS unmount',
          host: connection.host,
          path: connection.exportPath,
          mountPoint
        });
        
        resolve({
          success: false,
          ...createErrorResponse(enhancedError)
        });
        return;
      }
      
      // Update connection status
      connection.mounted = false;
      connection.mountPoint = null;
      saveConfig(config);
      
      // Cleanup mount point directory
      try {
        fs.rmSync(mountPoint, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warning(logger.categories.SYSTEM, `[NFS] Mount point cleanup warning: ${cleanupError.message}`);
      }
      
      logger.success(logger.categories.SYSTEM, `[NFS] Unmounted ${connection.name}`);
      resolve({
        success: true,
        message: 'Unmounted successfully'
      });
    });
  });
}

/**
 * Add a new NFS connection
 */
function addConnection(connection) {
  const validation = validateConnection(connection);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join(', '),
      warnings: validation.warnings
    };
  }
  
  const config = loadConfig();
  
  // Generate unique ID
  connection.id = crypto.randomBytes(16).toString('hex');
  connection.createdAt = new Date().toISOString();
  connection.mounted = false;
  connection.mountPoint = null;
  
  config.connections.push(connection);
  
  if (saveConfig(config)) {
    logger.info(logger.categories.SYSTEM, `[NFS] Added connection: ${connection.name}`);
    return {
      success: true,
      connection,
      warnings: validation.warnings
    };
  }
  
  return {
    success: false,
    error: 'Failed to save connection'
  };
}

/**
 * Update an existing NFS connection
 */
function updateConnection(connectionId, updates) {
  const config = loadConfig();
  const connectionIndex = config.connections.findIndex(c => c.id === connectionId);
  
  if (connectionIndex === -1) {
    return {
      success: false,
      error: 'Connection not found'
    };
  }
  
  const connection = config.connections[connectionIndex];
  
  // Prevent updating mounted connection
  if (connection.mounted) {
    return {
      success: false,
      error: 'Cannot update mounted connection. Unmount first.'
    };
  }
  
  // Merge updates
  const updatedConnection = { ...connection, ...updates, id: connectionId };
  
  const validation = validateConnection(updatedConnection);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.errors.join(', '),
      warnings: validation.warnings
    };
  }
  
  config.connections[connectionIndex] = updatedConnection;
  
  if (saveConfig(config)) {
    logger.info(logger.categories.SYSTEM, `[NFS] Updated connection: ${updatedConnection.name}`);
    return {
      success: true,
      connection: updatedConnection,
      warnings: validation.warnings
    };
  }
  
  return {
    success: false,
    error: 'Failed to save connection'
  };
}

/**
 * Delete an NFS connection
 */
async function deleteConnection(connectionId) {
  const config = loadConfig();
  const connection = config.connections.find(c => c.id === connectionId);
  
  if (!connection) {
    return {
      success: false,
      error: 'Connection not found'
    };
  }
  
  // Unmount if mounted
  if (connection.mounted) {
    const unmountResult = await unmountConnection(connectionId);
    if (!unmountResult.success) {
      return {
        success: false,
        error: `Cannot delete: ${unmountResult.error}`
      };
    }
  }
  
  // Remove connection
  config.connections = config.connections.filter(c => c.id !== connectionId);
  
  if (saveConfig(config)) {
    logger.info(logger.categories.SYSTEM, `[NFS] Deleted connection: ${connection.name}`);
    return {
      success: true,
      message: 'Connection deleted'
    };
  }
  
  return {
    success: false,
    error: 'Failed to delete connection'
  };
}

/**
 * Get all NFS connections (with sanitized credentials)
 */
function getConnections() {
  const config = loadConfig();
  
  // Return sanitized connections (without sensitive data in plain text)
  return config.connections.map(conn => ({
    id: conn.id,
    name: conn.name,
    host: conn.host,
    exportPath: conn.exportPath,
    mountOptions: conn.mountOptions,
    readOnly: conn.readOnly,
    useForBackups: conn.useForBackups,
    mounted: conn.mounted,
    mountPoint: conn.mountPoint,
    createdAt: conn.createdAt
  }));
}

/**
 * Get a specific connection by ID
 */
function getConnection(connectionId) {
  const config = loadConfig();
  const connection = config.connections.find(c => c.id === connectionId);
  
  if (!connection) {
    return null;
  }
  
  // Return sanitized connection
  return {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    exportPath: connection.exportPath,
    mountOptions: connection.mountOptions,
    readOnly: connection.readOnly,
    useForBackups: connection.useForBackups,
    mounted: connection.mounted,
    mountPoint: connection.mountPoint,
    createdAt: connection.createdAt
  };
}

/**
 * Upload a file to NFS share
 */
async function uploadFile(connectionId, localPath, remotePath) {
  return new Promise(async (resolve) => {
    try {
      const connection = getConnection(connectionId);
      
      if (!connection) {
        resolve({
          success: false,
          error: 'Connection not found'
        });
        return;
      }
      
      if (!connection.mounted) {
        // Auto-mount if not mounted
        const mountResult = await mountConnection(connectionId);
        if (!mountResult.success) {
          resolve({
            success: false,
            error: `Failed to mount: ${mountResult.error}`
          });
          return;
        }
      }
      
      const mountPoint = getMountPoint(connectionId);
      const destPath = path.join(mountPoint, remotePath);
      const destDir = path.dirname(destPath);
      
      // Ensure destination directory exists
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Copy file
      fs.copyFileSync(localPath, destPath);
      
      logger.success(logger.categories.SYSTEM, `[NFS] Uploaded file to ${connection.name}: ${remotePath}`);
      resolve({
        success: true,
        message: 'File uploaded successfully',
        remotePath
      });
    } catch (error) {
      const enhancedError = formatFileSystemError(error, 'upload file', destPath);
      
      logError(logger.categories.SYSTEM, enhancedError, {
        operation: 'NFS file upload',
        connection: connection.name,
        localPath,
        remotePath
      });
      
      resolve({
        success: false,
        ...createErrorResponse(enhancedError)
      });
    }
  });
}

/**
 * Download a file from NFS share
 */
async function downloadFile(connectionId, remotePath, localPath) {
  return new Promise(async (resolve) => {
    try {
      const connection = getConnection(connectionId);
      
      if (!connection) {
        resolve({
          success: false,
          error: 'Connection not found'
        });
        return;
      }
      
      if (!connection.mounted) {
        // Auto-mount if not mounted
        const mountResult = await mountConnection(connectionId);
        if (!mountResult.success) {
          resolve({
            success: false,
            error: `Failed to mount: ${mountResult.error}`
          });
          return;
        }
      }
      
      const mountPoint = getMountPoint(connectionId);
      const sourcePath = path.join(mountPoint, remotePath);
      
      if (!fs.existsSync(sourcePath)) {
        resolve({
          success: false,
          error: 'File not found on NFS share'
        });
        return;
      }
      
      // Ensure local directory exists
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      
      // Copy file
      fs.copyFileSync(sourcePath, localPath);
      
      logger.success(logger.categories.SYSTEM, `[NFS] Downloaded file from ${connection.name}: ${remotePath}`);
      resolve({
        success: true,
        message: 'File downloaded successfully',
        localPath
      });
    } catch (error) {
      const enhancedError = formatFileSystemError(error, 'download file', sourcePath);
      
      logError(logger.categories.SYSTEM, enhancedError, {
        operation: 'NFS file download',
        connection: connection.name,
        remotePath,
        localPath
      });
      
      resolve({
        success: false,
        ...createErrorResponse(enhancedError)
      });
    }
  });
}

/**
 * List files in NFS share directory
 */
async function listFiles(connectionId, remotePath = '/') {
  return new Promise(async (resolve) => {
    try {
      const connection = getConnection(connectionId);
      
      if (!connection) {
        resolve({
          success: false,
          error: 'Connection not found'
        });
        return;
      }
      
      if (!connection.mounted) {
        // Auto-mount if not mounted
        const mountResult = await mountConnection(connectionId);
        if (!mountResult.success) {
          resolve({
            success: false,
            error: `Failed to mount: ${mountResult.error}`
          });
          return;
        }
      }
      
      const mountPoint = getMountPoint(connectionId);
      const fullPath = path.join(mountPoint, remotePath);
      
      if (!fs.existsSync(fullPath)) {
        resolve({
          success: false,
          error: 'Directory not found'
        });
        return;
      }
      
      const items = fs.readdirSync(fullPath, { withFileTypes: true });
      const files = items.map(item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        isFile: item.isFile(),
        path: path.join(remotePath, item.name)
      }));
      
      resolve({
        success: true,
        files
      });
    } catch (error) {
      logger.error(logger.categories.SYSTEM, `[NFS] List files failed: ${error.message}`);
      resolve({
        success: false,
        error: `List files failed: ${error.message}`
      });
    }
  });
}

module.exports = {
  loadConfig,
  saveConfig,
  isNfsSupported,
  validateConnection,
  validateMountOptions,
  getSynologyRecommendedOptions,
  testConnection,
  mountConnection,
  unmountConnection,
  addConnection,
  updateConnection,
  deleteConnection,
  getConnections,
  getConnection,
  uploadFile,
  downloadFile,
  listFiles
};
