// Centralized Logging Module
// Captures and stores logs from all system modules for the Settings > Logs interface

class Logger {
  constructor(maxLogs = 500) {
    this.logs = [];
    this.maxLogs = maxLogs;
    
    // Log categories/modules
    this.categories = {
      SYSTEM: 'System',
      DEPLOYMENT: 'Deployment',
      BUILD: 'Build',
      FINANCE: 'Finance',
      GITHUB: 'GitHub',
      SERVER: 'Server',
      CLIENT: 'Client',
      OLLAMA: 'Ollama',
      MEDIA: 'Media Streaming',
      HOME_ASSISTANT: 'Home Assistant',
      SMART_MIRROR: 'Smart Mirror'
    };
  }

  /**
   * Add a log entry
   * @param {string} level - Log level: INFO, WARNING, ERROR, SUCCESS
   * @param {string} category - Module/category from this.categories
   * @param {string} message - Log message
   */
  log(level, category, message) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      category: category || this.categories.SYSTEM,
      message: message
    };

    this.logs.unshift(entry); // Add to beginning of array (newest first)

    // Trim to max logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Also output to console for container logs
    const levelEmoji = {
      'INFO': 'ℹ️',
      'SUCCESS': '✅',
      'WARNING': '⚠️',
      'ERROR': '❌',
      'DEBUG': '🔍'
    }[level.toUpperCase()] || '📝';

    console.log(`${levelEmoji} [${category}] ${message}`);
  }

  info(category, message) {
    this.log('INFO', category, message);
  }

  success(category, message) {
    this.log('SUCCESS', category, message);
  }

  warning(category, message) {
    this.log('WARNING', category, message);
  }

  error(category, message) {
    this.log('ERROR', category, message);
  }

  debug(category, message) {
    this.log('DEBUG', category, message);
  }

  /**
   * Get logs, optionally filtered by category
   * @param {string} category - Optional category filter
   * @param {number} limit - Optional limit on number of logs returned
   * @returns {Array} Array of log entries
   */
  getLogs(category = null, limit = null) {
    let filtered = this.logs;

    if (category && category !== 'ALL') {
      filtered = this.logs.filter(log => log.category === category);
    }

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }

  /**
   * Get all available categories
   * @returns {Object} Categories object
   */
  getCategories() {
    return this.categories;
  }

  /**
   * Clear all logs
   */
  clear() {
    this.logs = [];
    this.info(this.categories.SYSTEM, 'All logs cleared');
  }

  /**
   * Log detailed diagnostics for Smart Mirror with environment detection
   * @param {string} context - Context of the diagnostic (e.g., 'route access', 'config load')
   * @param {Object} details - Additional details to log
   */
  logSmartMirrorDiagnostics(context, details = {}) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const diagnostics = {
      context,
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        isDocker: fs.existsSync('/.dockerenv'),
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        nodeVersion: process.version,
        uptime: process.uptime()
      },
      paths: {
        cwd: process.cwd(),
        dirname: __dirname
      },
      ...details
    };
    
    // Log as JSON for structured logging
    this.debug(this.categories.SMART_MIRROR, `[DIAGNOSTIC] ${context}: ${JSON.stringify(diagnostics, null, 2)}`);
    
    return diagnostics;
  }
}

// Singleton instance
const logger = new Logger();

module.exports = logger;
