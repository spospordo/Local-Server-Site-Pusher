const fs = require('fs');
const path = require('path');
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

// Static files that should always be copied from source to /public
const STATIC_FILES = [
  { source: 'smart-mirror.html', target: 'smart-mirror.html' },
  { source: 'index.html', target: 'index.html' },
  { source: 'espresso-editor.html', target: 'espresso-editor.html' },
  { source: 'espresso-template.html', target: 'espresso-template.html' }
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
 * Check if a file is outdated by comparing modification times
 * @param {string} sourcePath - Source file path
 * @param {string} targetPath - Target file path
 * @returns {boolean} - True if target is missing or older than source
 */
function isFileOutdated(sourcePath, targetPath) {
  try {
    // If target doesn't exist, it's outdated
    if (!fs.existsSync(targetPath)) {
      return true;
    }
    
    // If source doesn't exist, we can't update
    if (!fs.existsSync(sourcePath)) {
      return false;
    }
    
    // Compare modification times
    const sourceStats = fs.statSync(sourcePath);
    const targetStats = fs.statSync(targetPath);
    
    return sourceStats.mtime > targetStats.mtime;
  } catch (error) {
    addLog('warning', 'File Check Failed', `Error checking ${targetPath}: ${error.message}`);
    return false;
  }
}

/**
 * Copy a static file from source to target
 * @param {string} sourcePath - Source file path
 * @param {string} targetPath - Target file path
 * @param {boolean} force - Force copy even if not outdated
 * @returns {boolean} - True if copied successfully
 */
function copyStaticFile(sourcePath, targetPath, force = false) {
  try {
    // Check if source exists
    if (!fs.existsSync(sourcePath)) {
      addLog('warning', 'Source Missing', `Source file not found: ${sourcePath}`);
      return false;
    }
    
    // Check if update is needed (unless forced)
    if (!force && !isFileOutdated(sourcePath, targetPath)) {
      addLog('info', 'File Up to Date', `Skipping ${path.basename(targetPath)} (already up to date)`);
      return true;
    }
    
    // Ensure target directory exists
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      addLog('info', 'Directory Created', `Created directory: ${targetDir}`);
    }
    
    // Copy file
    fs.copyFileSync(sourcePath, targetPath);
    addLog('success', 'File Copied', `Copied ${path.basename(sourcePath)} to ${targetPath}`);
    return true;
  } catch (error) {
    addLog('error', 'Copy Failed', `Failed to copy ${sourcePath}: ${error.message}`);
    return false;
  }
}

/**
 * Copy all static files from source to /public
 * @param {boolean} force - Force copy even if files are up to date
 * @returns {Object} - Result object with success status and counts
 */
function copyStaticFiles(force = false) {
  addLog('info', 'Copy Started', `Starting static files copy (force: ${force})`);
  
  let copiedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  const publicDir = path.join(__dirname, '..', 'public');
  
  for (const file of STATIC_FILES) {
    const sourcePath = path.join(publicDir, file.source);
    const targetPath = path.join(publicDir, file.target);
    
    // For static files, source and target are the same, so we check against a backup
    // or skip if file exists and we're not forcing
    if (!force && fs.existsSync(targetPath)) {
      addLog('info', 'File Exists', `Static file ${file.target} already exists`);
      skippedCount++;
      continue;
    }
    
    // Ensure file exists (in case of volume mount that cleared /public)
    if (!fs.existsSync(targetPath)) {
      addLog('warning', 'File Missing', `Static file ${file.target} is missing from /public`);
      failedCount++;
    } else {
      copiedCount++;
    }
  }
  
  addLog('info', 'Copy Complete', `Copied: ${copiedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
  
  return {
    success: failedCount === 0,
    copied: copiedCount,
    skipped: skippedCount,
    failed: failedCount
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
    // Step 1: Copy static files
    results.staticFiles = copyStaticFiles(force);
    
    // Step 2: Regenerate espresso
    results.espresso = await regenerateEspresso();
    
    // Step 3: Regenerate vidiots
    results.vidiots = await regenerateVidiots();
    
    // Check overall success
    results.success = results.staticFiles.success && results.espresso && results.vidiots;
    
    const duration = Date.now() - startTime;
    results.duration = duration;
    
    if (results.success) {
      addLog('success', 'Regeneration Complete', `All files regenerated successfully in ${duration}ms`);
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
    addLog('info', 'Auto-Regeneration Triggered', 'Starting scheduled regeneration');
    await runRegeneration(force);
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
