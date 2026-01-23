/**
 * NFS Storage Module
 * 
 * Manages NFS-mounted storage paths for backups and data storage.
 * Supports validation, health checks, and graceful fallback to local storage.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Storage path information
 * @typedef {Object} StoragePath
 * @property {string} id - Unique identifier for the storage path
 * @property {string} name - Human-readable name/label
 * @property {string} path - Absolute path to the storage location
 * @property {string} type - Type of storage (nfs, local, etc.)
 * @property {boolean} enabled - Whether this path is enabled
 * @property {string} purpose - Purpose of storage (backup, uploads, media, etc.)
 * @property {Object} status - Current health status
 */

/**
 * Health check result
 * @typedef {Object} HealthCheckResult
 * @property {boolean} accessible - Whether the path is accessible
 * @property {boolean} writable - Whether the path is writable
 * @property {boolean} readable - Whether the path is readable
 * @property {string} status - Overall status (healthy, degraded, unavailable)
 * @property {string|null} error - Error message if any
 * @property {Object} stats - File system stats if available
 * @property {number} lastChecked - Timestamp of last check
 */

class NFSStorageManager {
  constructor(config = {}) {
    this.config = config;
    this.storagePaths = config.storagePaths || [];
    this.healthCheckInterval = config.healthCheckInterval || 300000; // 5 minutes default
    this.autoFailover = config.autoFailover !== false; // true by default
    this.fallbackToLocal = config.fallbackToLocal !== false; // true by default
    this.healthCheckTimer = null;
    this.pathStatus = new Map();
    
    // Initialize status for all paths
    this.storagePaths.forEach(storagePath => {
      this.pathStatus.set(storagePath.id, {
        accessible: false,
        writable: false,
        readable: false,
        status: 'unknown',
        error: null,
        stats: null,
        lastChecked: 0
      });
    });
  }

  /**
   * Initialize the storage manager and start health checks
   */
  async initialize() {
    logger.info(logger.categories.SYSTEM, '[NFS Storage] Initializing NFS storage manager');
    
    // Perform initial health check for all paths
    await this.checkAllPaths();
    
    // Start periodic health checks if enabled
    if (this.config.enabled && this.healthCheckInterval > 0) {
      this.startHealthChecks();
      logger.info(logger.categories.SYSTEM, `[NFS Storage] Health checks scheduled every ${this.healthCheckInterval}ms`);
    }
    
    return this;
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(() => {
      this.checkAllPaths().catch(err => {
        logger.error(logger.categories.SYSTEM, `[NFS Storage] Health check error: ${err.message}`);
      });
    }, this.healthCheckInterval);
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      logger.info(logger.categories.SYSTEM, '[NFS Storage] Health checks stopped');
    }
  }

  /**
   * Check health of all configured storage paths
   */
  async checkAllPaths() {
    const results = {};
    
    for (const storagePath of this.storagePaths) {
      if (!storagePath.enabled) {
        continue;
      }
      
      try {
        const result = await this.checkPath(storagePath.path);
        this.pathStatus.set(storagePath.id, result);
        results[storagePath.id] = result;
        
        if (result.status === 'healthy') {
          logger.success(logger.categories.SYSTEM, `[NFS Storage] Path "${storagePath.name}" is healthy`);
        } else if (result.status === 'degraded') {
          logger.warning(logger.categories.SYSTEM, `[NFS Storage] Path "${storagePath.name}" is degraded: ${result.error}`);
        } else {
          logger.error(logger.categories.SYSTEM, `[NFS Storage] Path "${storagePath.name}" is unavailable: ${result.error}`);
        }
      } catch (err) {
        logger.error(logger.categories.SYSTEM, `[NFS Storage] Error checking path "${storagePath.name}": ${err.message}`);
        results[storagePath.id] = {
          accessible: false,
          writable: false,
          readable: false,
          status: 'unavailable',
          error: err.message,
          stats: null,
          lastChecked: Date.now()
        };
        this.pathStatus.set(storagePath.id, results[storagePath.id]);
      }
    }
    
    return results;
  }

  /**
   * Check health of a single storage path
   * @param {string} storagePath - Path to check
   * @returns {Promise<HealthCheckResult>}
   */
  async checkPath(storagePath) {
    const result = {
      accessible: false,
      writable: false,
      readable: false,
      status: 'unavailable',
      error: null,
      stats: null,
      lastChecked: Date.now()
    };

    try {
      // Check if path exists
      if (!fs.existsSync(storagePath)) {
        result.error = 'Path does not exist';
        return result;
      }

      result.accessible = true;

      // Get path stats
      try {
        result.stats = fs.statSync(storagePath);
        if (!result.stats.isDirectory()) {
          result.error = 'Path is not a directory';
          result.status = 'degraded';
          return result;
        }
      } catch (err) {
        result.error = `Cannot stat path: ${err.message}`;
        return result;
      }

      // Check read permissions
      try {
        fs.accessSync(storagePath, fs.constants.R_OK);
        result.readable = true;
      } catch (err) {
        result.error = 'Path is not readable';
        result.status = 'degraded';
      }

      // Check write permissions
      const testFile = path.join(storagePath, `.nfs-test-${Date.now()}`);
      try {
        fs.writeFileSync(testFile, 'test', { mode: 0o644 });
        fs.unlinkSync(testFile);
        result.writable = true;
      } catch (err) {
        if (!result.error) {
          result.error = 'Path is not writable';
        }
        result.status = result.readable ? 'degraded' : 'unavailable';
      }

      // Overall status
      if (result.readable && result.writable) {
        result.status = 'healthy';
        result.error = null;
      } else if (result.readable || result.writable) {
        result.status = 'degraded';
      }

    } catch (err) {
      result.error = err.message;
      result.status = 'unavailable';
    }

    return result;
  }

  /**
   * Get the status of a specific storage path
   * @param {string} pathId - Storage path ID
   * @returns {HealthCheckResult|null}
   */
  getPathStatus(pathId) {
    return this.pathStatus.get(pathId) || null;
  }

  /**
   * Get all storage paths with their current status
   * @returns {Array}
   */
  getAllPathsWithStatus() {
    return this.storagePaths.map(storagePath => ({
      ...storagePath,
      status: this.pathStatus.get(storagePath.id) || {
        accessible: false,
        writable: false,
        readable: false,
        status: 'unknown',
        error: 'Not yet checked',
        stats: null,
        lastChecked: 0
      }
    }));
  }

  /**
   * Get the best available storage path for a given purpose
   * @param {string} purpose - Purpose (backup, uploads, media, etc.)
   * @returns {Object|null} Storage path object or null if none available
   */
  getBestPath(purpose = null) {
    // Filter enabled paths, optionally by purpose
    let candidates = this.storagePaths.filter(p => {
      if (!p.enabled) return false;
      if (purpose && p.purpose !== purpose) return false;
      
      const status = this.pathStatus.get(p.id);
      return status && status.status === 'healthy';
    });

    // If no healthy paths, try degraded paths if failover is enabled
    if (candidates.length === 0 && this.autoFailover) {
      candidates = this.storagePaths.filter(p => {
        if (!p.enabled) return false;
        if (purpose && p.purpose !== purpose) return false;
        
        const status = this.pathStatus.get(p.id);
        return status && status.status === 'degraded';
      });
    }

    // Return first available candidate (could be enhanced with priority logic)
    return candidates.length > 0 ? candidates[0] : null;
  }

  /**
   * Validate a storage path configuration
   * @param {StoragePath} pathConfig - Path configuration to validate
   * @returns {Object} Validation result with success flag and errors
   */
  validatePathConfig(pathConfig) {
    const errors = [];

    if (!pathConfig.id || typeof pathConfig.id !== 'string') {
      errors.push('Path ID is required and must be a string');
    }

    if (!pathConfig.name || typeof pathConfig.name !== 'string') {
      errors.push('Path name is required and must be a string');
    }

    if (!pathConfig.path || typeof pathConfig.path !== 'string') {
      errors.push('Path is required and must be a string');
    } else if (!path.isAbsolute(pathConfig.path)) {
      errors.push('Path must be an absolute path');
    }

    if (pathConfig.type && !['nfs', 'local', 'smb', 'other'].includes(pathConfig.type)) {
      errors.push('Path type must be one of: nfs, local, smb, other');
    }

    if (pathConfig.purpose && !['backup', 'uploads', 'media', 'general'].includes(pathConfig.purpose)) {
      errors.push('Purpose must be one of: backup, uploads, media, general');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Add a new storage path
   * @param {StoragePath} pathConfig - Path configuration
   * @returns {Promise<Object>} Result with success flag and any errors
   */
  async addStoragePath(pathConfig) {
    // Validate configuration
    const validation = this.validatePathConfig(pathConfig);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors
      };
    }

    // Check if ID already exists
    if (this.storagePaths.find(p => p.id === pathConfig.id)) {
      return {
        success: false,
        errors: ['A storage path with this ID already exists']
      };
    }

    // Add defaults
    const newPath = {
      type: 'nfs',
      enabled: true,
      purpose: 'general',
      ...pathConfig
    };

    // Add to storage paths
    this.storagePaths.push(newPath);

    // Initialize status
    this.pathStatus.set(newPath.id, {
      accessible: false,
      writable: false,
      readable: false,
      status: 'unknown',
      error: null,
      stats: null,
      lastChecked: 0
    });

    // Perform initial health check
    const healthCheck = await this.checkPath(newPath.path);
    this.pathStatus.set(newPath.id, healthCheck);

    logger.info(logger.categories.SYSTEM, `[NFS Storage] Added new storage path: ${newPath.name} (${newPath.id})`);

    return {
      success: true,
      path: newPath,
      status: healthCheck
    };
  }

  /**
   * Remove a storage path
   * @param {string} pathId - ID of path to remove
   * @returns {boolean} Success flag
   */
  removeStoragePath(pathId) {
    const index = this.storagePaths.findIndex(p => p.id === pathId);
    if (index === -1) {
      return false;
    }

    this.storagePaths.splice(index, 1);
    this.pathStatus.delete(pathId);
    
    logger.info(logger.categories.SYSTEM, `[NFS Storage] Removed storage path: ${pathId}`);
    return true;
  }

  /**
   * Update a storage path configuration
   * @param {string} pathId - ID of path to update
   * @param {Object} updates - Properties to update
   * @returns {Promise<Object>} Result with success flag
   */
  async updateStoragePath(pathId, updates) {
    const pathIndex = this.storagePaths.findIndex(p => p.id === pathId);
    if (pathIndex === -1) {
      return {
        success: false,
        error: 'Storage path not found'
      };
    }

    const currentPath = this.storagePaths[pathIndex];
    const updatedPath = { ...currentPath, ...updates };

    // Validate updated configuration
    const validation = this.validatePathConfig(updatedPath);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors
      };
    }

    // Update the path
    this.storagePaths[pathIndex] = updatedPath;

    // Re-check health if path changed
    if (updates.path || updates.enabled !== undefined) {
      const healthCheck = await this.checkPath(updatedPath.path);
      this.pathStatus.set(pathId, healthCheck);
    }

    logger.info(logger.categories.SYSTEM, `[NFS Storage] Updated storage path: ${pathId}`);

    return {
      success: true,
      path: updatedPath
    };
  }

  /**
   * Get storage statistics for a path
   * @param {string} pathId - Storage path ID
   * @returns {Object|null} Storage statistics or null
   */
  getStorageStats(pathId) {
    const storagePath = this.storagePaths.find(p => p.id === pathId);
    if (!storagePath) {
      return null;
    }

    const status = this.pathStatus.get(pathId);
    if (!status || !status.stats) {
      return null;
    }

    try {
      // Get directory size (basic implementation)
      // Note: For large NFS mounts, consider caching this
      const files = fs.readdirSync(storagePath.path);
      let totalSize = 0;
      let fileCount = 0;

      files.forEach(file => {
        try {
          const filePath = path.join(storagePath.path, file);
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            totalSize += stats.size;
            fileCount++;
          }
        } catch (err) {
          // Skip files we can't access
        }
      });

      return {
        path: storagePath.path,
        totalSize,
        fileCount,
        available: true
      };
    } catch (err) {
      logger.error(logger.categories.SYSTEM, `[NFS Storage] Error getting stats for ${pathId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopHealthChecks();
    this.storagePaths = [];
    this.pathStatus.clear();
    logger.info(logger.categories.SYSTEM, '[NFS Storage] Storage manager destroyed');
  }
}

module.exports = NFSStorageManager;
