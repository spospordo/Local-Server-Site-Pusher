const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

/**
 * Public Files Regenerator Module
 * 
 * Handles automatic regeneration and syncing of public files on server startup
 * and after redeploy. Ensures static files and feature-generated dynamic content
 * are present in /public after each deployment.
 */

let config = null;
let lastRegenerationTime = null;
let regenerationLog = [];
const MAX_LOG_ENTRIES = 500; // Maximum log entries to keep in memory

// Static files that should always be present in /public
// These are baked into the Docker image and this list is used to verify their presence
// Each entry includes the filename and SHA-256 checksum of the original file
const STATIC_FILES = [
  {
    name: 'smart-mirror.html',
    checksum: 'fc5046445cf585255ba8a85ac808dee48286ceb73079af7b5958a7502848b949'
  },
  {
    name: 'index.html',
    checksum: '96f396452ad0634f74adc8c6cc3666bb3b082cc0af6c9dddd523df5c2be7d0a4'
  },
  {
    name: 'espresso-editor.html',
    checksum: 'e0ef9c6dd5e858555c8e3dbadd0f629eae4f3b9ecbe78c362070100443479d0e'
  },
  {
    name: 'espresso-template.html',
    checksum: 'b9a7932e8d502f9356c6d559592502d907f569a700a65a1a9d6477699cbd3ea7'
  }
];

/**
 * Initialize the regenerator module
 * @param {Object} serverConfig - Server configuration object
 */
function init(serverConfig) {
  config = serverConfig;
  regenerationLog = [];
  logger.info(logger.categories.SYSTEM, 'Public files regenerator module initialized');
}

/**
 * Add a log entry
 * @param {string} level - Log level (info, success, warning, error)
 * @param {string} action - Action performed
 * @param {string} details - Details about the action
 */
function addLog(level, action, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    action,
    details
  };
  regenerationLog.push(entry);
  
  // Trim log to max entries
  if (regenerationLog.length > MAX_LOG_ENTRIES) {
    regenerationLog = regenerationLog.slice(-MAX_LOG_ENTRIES);
  }
  
  // Emit to console with emoji based on level
  const emoji = {
    info: '📋',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  };
  
  console.log(`${emoji[level] || '📋'} [Public Regenerator] ${action}: ${details}`);
  
  // Log to logger system with proper method
  if (logger && logger[level]) {
    logger[level](logger.categories.SYSTEM, `[Public Regenerator] ${action}: ${details}`);
  }
}

/**
 * Calculate SHA-256 checksum of a file
 * @param {string} filePath - Path to the file
 * @returns {string|null} - Checksum hex string, or null if file doesn't exist
 */
function calculateChecksum(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (error) {
    addLog('error', 'Checksum Failed', `Failed to calculate checksum for ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Check if a file has been customized by comparing checksums
 * @param {string} filePath - Path to the file to check
 * @param {string} expectedChecksum - Expected checksum of the original file
 * @returns {boolean} - True if file is customized (checksum differs), false if original
 */
function isFileCustomized(filePath, expectedChecksum) {
  const actualChecksum = calculateChecksum(filePath);
  if (!actualChecksum) {
    return false; // File doesn't exist, so not customized
  }
  return actualChecksum !== expectedChecksum;
}

/**
 * Restore a static file from the repository source to /public
 * @param {string} fileName - Name of the file to restore
 * @param {string} expectedChecksum - Expected checksum for customization detection
 * @param {boolean} force - Force overwrite even if customized
 * @returns {Object} - Result object with success status and action taken
 */
function restoreStaticFile(fileName, expectedChecksum, force = false) {
  const publicDir = path.join(__dirname, '..', 'public');
  const targetPath = path.join(publicDir, fileName);
  
  // The source file should be from the backup location created during Docker build
  // This location is never volume-mounted and always contains the original files
  const backupDir = path.join(__dirname, '..', '.static-files-backup');
  const sourcePath = path.join(backupDir, fileName);
  
  // Fallback: if backup doesn't exist (dev environment), try public directory
  const fallbackSourcePath = path.join(process.cwd(), 'public', fileName);
  
  try {
    // Check if target already exists
    const targetExists = fs.existsSync(targetPath);
    
    if (targetExists) {
      // Check if file is customized
      const customized = isFileCustomized(targetPath, expectedChecksum);
      
      if (customized && !force) {
        addLog('info', 'Restore Skipped', `${fileName} has been customized, skipping restore (use force=true to overwrite)`);
        return {
          success: true,
          action: 'skipped',
          reason: 'customized',
          message: `File ${fileName} is customized and force=false`
        };
      }
      
      if (customized && force) {
        addLog('warning', 'Force Restore', `${fileName} is customized but force=true, overwriting with original`);
      }
    }
    
    // Determine which source to use
    let actualSourcePath = sourcePath;
    if (!fs.existsSync(sourcePath)) {
      addLog('info', 'Backup Not Found', `Backup location not found, using fallback source for ${fileName}`);
      actualSourcePath = fallbackSourcePath;
    }
    
    // Check if source exists and is readable
    if (!fs.existsSync(actualSourcePath)) {
      addLog('error', 'Restore Failed', `Source file ${fileName} not found at ${actualSourcePath}`);
      return {
        success: false,
        action: 'failed',
        reason: 'source_not_found',
        message: `Source file not found at ${actualSourcePath}`
      };
    }
    
    // Verify source file checksum matches expected
    const sourceChecksum = calculateChecksum(actualSourcePath);
    if (sourceChecksum !== expectedChecksum) {
      addLog('warning', 'Checksum Mismatch', `Source file ${fileName} checksum doesn't match expected (expected: ${expectedChecksum}, got: ${sourceChecksum})`);
      // We'll still copy it, but log the warning
    }
    
    // Copy the file
    fs.copyFileSync(actualSourcePath, targetPath);
    
    // Verify the copy
    const copiedChecksum = calculateChecksum(targetPath);
    if (copiedChecksum === expectedChecksum) {
      addLog('success', 'File Restored', `${fileName} successfully restored to /public`);
      return {
        success: true,
        action: 'restored',
        message: `File ${fileName} restored successfully`
      };
    } else {
      addLog('warning', 'Restore Partial', `${fileName} copied but checksum verification failed`);
      return {
        success: true,
        action: 'restored',
        warning: 'checksum_mismatch',
        message: `File ${fileName} restored but checksum differs`
      };
    }
    
  } catch (error) {
    addLog('error', 'Restore Failed', `Failed to restore ${fileName}: ${error.message}`);
    return {
      success: false,
      action: 'failed',
      reason: 'copy_error',
      message: error.message
    };
  }
}

/**
 * Check all static files and report status
 * @param {boolean} force - Force restoration even if files are customized
 * @returns {Object} - Result object with success status and counts
 */
function checkStaticFiles(force = false) {
  addLog('info', 'Check Started', `Checking static files (force: ${force})`);
  
  let presentCount = 0;
  let missingCount = 0;
  let restoredCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const missingFiles = [];
  const restoredFiles = [];
  const skippedFiles = [];
  const failedFiles = [];
  
  const publicDir = path.join(__dirname, '..', 'public');
  
  for (const fileInfo of STATIC_FILES) {
    const fileName = fileInfo.name;
    const expectedChecksum = fileInfo.checksum;
    const filePath = path.join(publicDir, fileName);
    
    if (fs.existsSync(filePath)) {
      // File exists, check if it's customized
      const customized = isFileCustomized(filePath, expectedChecksum);
      
      if (customized && !force) {
        addLog('info', 'File Customized', `Static file ${fileName} has been customized`);
        presentCount++;
      } else if (customized && force) {
        // File exists but is customized and force=true, restore it
        addLog('info', 'Force Restore', `Static file ${fileName} is customized, force restoring`);
        const result = restoreStaticFile(fileName, expectedChecksum, true);
        
        if (result.success) {
          restoredCount++;
          restoredFiles.push(fileName);
        } else {
          failedCount++;
          failedFiles.push(fileName);
        }
      } else {
        // File exists and matches original
        addLog('info', 'File Present', `Static file ${fileName} exists and is original`);
        presentCount++;
      }
    } else {
      // File is missing, attempt to restore
      addLog('warning', 'File Missing', `Static file ${fileName} is missing from /public, attempting restore`);
      missingFiles.push(fileName);
      
      const result = restoreStaticFile(fileName, expectedChecksum, force);
      
      if (result.success && result.action === 'restored') {
        restoredCount++;
        restoredFiles.push(fileName);
      } else if (result.success && result.action === 'skipped') {
        skippedCount++;
        skippedFiles.push(fileName);
      } else {
        failedCount++;
        failedFiles.push(fileName);
      }
      
      missingCount++;
    }
  }
  
  // Log summary
  if (restoredCount > 0) {
    addLog('success', 'Files Restored', `${restoredCount} static file(s) restored: ${restoredFiles.join(', ')}`);
  }
  
  if (failedCount > 0) {
    addLog('error', 'Restore Failed', `${failedCount} static file(s) failed to restore: ${failedFiles.join(', ')}`);
  }
  
  if (skippedCount > 0) {
    addLog('info', 'Files Skipped', `${skippedCount} static file(s) skipped: ${skippedFiles.join(', ')}`);
  }
  
  if (missingCount === 0 && failedCount === 0) {
    addLog('success', 'Check Complete', `All ${presentCount + restoredCount} static files are present`);
  } else if (failedCount > 0) {
    addLog('error', 'Check Failed', `${failedCount} file(s) could not be restored`);
  } else {
    addLog('success', 'Check Complete', `Static files verified (${presentCount} present, ${restoredCount} restored)`);
  }
  
  return {
    success: failedCount === 0,
    checked: STATIC_FILES.length,
    present: presentCount,
    missing: missingCount,
    restored: restoredCount,
    skipped: skippedCount,
    failed: failedCount,
    missingFiles: missingFiles,
    restoredFiles: restoredFiles,
    skippedFiles: skippedFiles,
    failedFiles: failedFiles
  };
}

/**
 * Regenerate espresso HTML if enabled
 * @returns {Promise<boolean>} - True if regenerated successfully
 */
async function regenerateEspresso() {
  try {
    const espressoConfig = config.espresso || {};
    
    if (!espressoConfig.enabled) {
      addLog('info', 'Espresso Skipped', 'Espresso module not enabled');
      return true;
    }
    
    addLog('info', 'Espresso Regeneration', 'Starting espresso HTML regeneration');
    
    // Load espresso module and generate HTML
    const espresso = require('./espresso');
    const espressoData = espresso.loadEspressoData();
    
    if (!espressoData) {
      addLog('warning', 'Espresso Data Missing', 'No espresso data available for regeneration');
      return false;
    }
    
    // Generate HTML
    await espresso.generateHTMLImmediate(espressoData);
    
    addLog('success', 'Espresso Regenerated', 'Espresso HTML regenerated successfully');
    return true;
  } catch (error) {
    addLog('error', 'Espresso Failed', `Failed to regenerate espresso: ${error.message}`);
    return false;
  }
}

/**
 * Regenerate vidiots HTML if enabled
 * @returns {Promise<boolean>} - True if regenerated successfully
 */
async function regenerateVidiots() {
  try {
    const vidiotsConfig = config.vidiots || {};
    
    if (!vidiotsConfig.enabled) {
      addLog('info', 'Vidiots Skipped', 'Vidiots module not enabled');
      return true;
    }
    
    addLog('info', 'Vidiots Regeneration', 'Starting vidiots HTML regeneration');
    
    // Load vidiots module and trigger scrape
    const vidiots = require('./vidiots');
    
    // Trigger scrape which will regenerate HTML and posters
    await vidiots.triggerScrape();
    
    addLog('success', 'Vidiots Regenerated', 'Vidiots HTML and posters regenerated successfully');
    return true;
  } catch (error) {
    addLog('error', 'Vidiots Failed', `Failed to regenerate vidiots: ${error.message}`);
    return false;
  }
}

/**
 * Run full regeneration process
 * @param {boolean} force - Force regeneration even if files are up to date
 * @returns {Promise<Object>} - Result object with success status and details
 */
async function runRegeneration(force = false) {
  const startTime = Date.now();
  addLog('info', 'Regeneration Started', `Starting full public files regeneration (force: ${force})`);
  
  const results = {
    success: true,
    startTime: new Date().toISOString(),
    staticFiles: null,
    espresso: false,
    vidiots: false,
    duration: 0
  };
  
  try {
    // Step 1: Check and restore static files
    results.staticFiles = checkStaticFiles(force);
    
    // Step 2: Regenerate espresso
    results.espresso = await regenerateEspresso();
    
    // Step 3: Regenerate vidiots
    results.vidiots = await regenerateVidiots();
    
    // Check overall success - now includes static file restoration
    results.success = results.staticFiles.success && results.espresso && results.vidiots;
    
    const duration = Date.now() - startTime;
    results.duration = duration;
    
    if (results.success) {
      addLog('success', 'Regeneration Complete', `All content regenerated successfully in ${duration}ms`);
    } else {
      addLog('warning', 'Regeneration Partial', `Regeneration completed with some failures in ${duration}ms`);
    }
    
    lastRegenerationTime = new Date();
    
  } catch (error) {
    const duration = Date.now() - startTime;
    results.duration = duration;
    results.success = false;
    addLog('error', 'Regeneration Failed', `Regeneration failed after ${duration}ms: ${error.message}`);
  }
  
  return results;
}

/**
 * Start auto-regeneration with configurable delay
 * @param {number} delaySeconds - Delay in seconds before starting regeneration (default: 5)
 * @param {boolean} force - Force regeneration even if files are up to date
 */
function startAutoRegeneration(delaySeconds = 5, force = false) {
  addLog('info', 'Auto-Regeneration Scheduled', `Will start in ${delaySeconds} seconds`);
  
  setTimeout(async () => {
    try {
      addLog('info', 'Auto-Regeneration Triggered', 'Starting scheduled regeneration');
      await runRegeneration(force);
    } catch (error) {
      addLog('error', 'Auto-Regeneration Error', `Scheduled regeneration failed: ${error.message}`);
    }
  }, delaySeconds * 1000);
}

/**
 * Get regeneration status and logs
 * @returns {Object} - Status object with logs and last regeneration time
 */
function getStatus() {
  return {
    lastRegeneration: lastRegenerationTime,
    logCount: regenerationLog.length,
    recentLogs: regenerationLog.slice(-50) // Last 50 logs
  };
}

/**
 * Get full regeneration log
 * @returns {Array} - Array of log entries
 */
function getLogs() {
  return regenerationLog;
}

/**
 * Clear regeneration logs
 */
function clearLogs() {
  regenerationLog = [];
  addLog('info', 'Logs Cleared', 'Regeneration logs have been cleared');
}

module.exports = {
  init,
  runRegeneration,
  startAutoRegeneration,
  getStatus,
  getLogs,
  clearLogs
};
