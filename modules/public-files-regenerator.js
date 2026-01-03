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
const MAX_LOG_ENTRIES = 500; // Maximum log entries to keep in memory

// Static files that should always be present in /public
// These are baked into the Docker image and this list is used to verify their presence
const STATIC_FILES = [
  'smart-mirror.html',
  'index.html',
  'espresso-editor.html',
  'espresso-template.html'
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
 * Check all static files and report status
 * @param {boolean} force - Force verification even if files exist
 * @returns {Object} - Result object with success status and counts
 */
function checkStaticFiles(force = false) {
  addLog('info', 'Check Started', `Checking static files (force: ${force})`);
  
  let presentCount = 0;
  let missingCount = 0;
  const missingFiles = [];
  
  const publicDir = path.join(__dirname, '..', 'public');
  
  for (const file of STATIC_FILES) {
    const filePath = path.join(publicDir, file);
    
    if (fs.existsSync(filePath)) {
      addLog('info', 'File Present', `Static file ${file} exists`);
      presentCount++;
    } else {
      addLog('warning', 'File Missing', `Static file ${file} is missing from /public`);
      missingFiles.push(file);
      missingCount++;
    }
  }
  
  if (missingCount > 0) {
    addLog('warning', 'Missing Files Detected', `${missingCount} static file(s) missing. This may indicate a volume mount issue. Missing: ${missingFiles.join(', ')}`);
  } else {
    addLog('success', 'Check Complete', `All ${presentCount} static files are present`);
  }
  
  return {
    success: missingCount === 0,
    checked: presentCount + missingCount,
    present: presentCount,
    missing: missingCount,
    missingFiles: missingFiles
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
    // Step 1: Check static files
    results.staticFiles = checkStaticFiles(force);
    
    // Step 2: Regenerate espresso
    results.espresso = await regenerateEspresso();
    
    // Step 3: Regenerate vidiots
    results.vidiots = await regenerateVidiots();
    
    // Check overall success (we don't fail on missing static files as they're in the container image)
    results.success = results.espresso && results.vidiots;
    
    const duration = Date.now() - startTime;
    results.duration = duration;
    
    if (results.success) {
      addLog('success', 'Regeneration Complete', `All dynamic content regenerated successfully in ${duration}ms`);
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
