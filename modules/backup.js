/**
 * Backup Module
 * 
 * Handles export and import of all site configurations and data
 * for backup and restoration purposes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

// Import other modules to access their data functions
const finance = require('./finance');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const BACKUP_VERSION = '1.0.0';

// Load application version once at module initialization for performance
let APP_VERSION = '2.2.4';
try {
  const packageJson = require('../package.json');
  APP_VERSION = packageJson.version || APP_VERSION;
} catch (e) {
  // Use default if package.json not found
}

/**
 * Get the current timestamp in ISO format
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Generate a checksum for data integrity verification
 */
function generateChecksum(data) {
  const dataString = JSON.stringify(data);
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

/**
 * Verify checksum for imported data
 */
function verifyChecksum(data, checksum) {
  const calculatedChecksum = generateChecksum(data);
  return calculatedChecksum === checksum;
}

/**
 * Load main config.json
 */
function loadMainConfig() {
  const configPath = path.join(CONFIG_DIR, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[Backup] Error loading main config: ${error.message}`);
  }
  return null;
}

/**
 * Load espresso data
 */
function loadEspressoData() {
  const espressoPath = path.join(CONFIG_DIR, 'espresso-data.json');
  try {
    if (fs.existsSync(espressoPath)) {
      return JSON.parse(fs.readFileSync(espressoPath, 'utf8'));
    }
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[Backup] Error loading espresso data: ${error.message}`);
  }
  return null;
}

/**
 * Load Ollama config (encrypted)
 */
function loadOllamaConfig() {
  const ollamaPath = path.join(CONFIG_DIR, 'ollama-config.json.enc');
  try {
    if (fs.existsSync(ollamaPath)) {
      // Return the encrypted data as-is - we'll import it as-is
      return fs.readFileSync(ollamaPath, 'utf8');
    }
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[Backup] Error loading Ollama config: ${error.message}`);
  }
  return null;
}

/**
 * Export all site configurations and data
 * Returns a structured backup object
 */
function exportAllData(config) {
  logger.info(logger.categories.SYSTEM, '[Backup] Starting data export...');
  
  const backup = {
    metadata: {
      version: BACKUP_VERSION,
      exportedAt: getTimestamp(),
      applicationVersion: APP_VERSION
    },
    data: {}
  };
  
  try {
    // 1. Main configuration (includes server, homeAssistant, cockpit, webContent, 
    //    storage, usefulLinks, client, connectedDevices, drinkMixer, vidiots, espresso settings)
    const mainConfig = config || loadMainConfig();
    if (mainConfig) {
      // Create a sanitized copy without sensitive passwords
      const sanitizedConfig = JSON.parse(JSON.stringify(mainConfig));
      
      // Don't export admin password - user will need to set it up again
      if (sanitizedConfig.server?.admin) {
        delete sanitizedConfig.server.admin.password;
      }
      
      // Don't export GitHub tokens for security
      if (sanitizedConfig.vidiots?.githubPages?.accessToken) {
        sanitizedConfig.vidiots.githubPages.accessToken = '';
      }
      if (sanitizedConfig.espresso?.githubPages?.accessToken) {
        sanitizedConfig.espresso.githubPages.accessToken = '';
      }
      
      // Don't export Home Assistant token
      if (sanitizedConfig.homeAssistant?.token) {
        sanitizedConfig.homeAssistant.token = '';
      }
      
      backup.data.mainConfig = sanitizedConfig;
      logger.info(logger.categories.SYSTEM, '[Backup] Main configuration exported');
    }
    
    // 2. Espresso data
    const espressoData = loadEspressoData();
    if (espressoData) {
      backup.data.espressoData = espressoData;
      logger.info(logger.categories.SYSTEM, '[Backup] Espresso data exported');
    }
    
    // 4. Finance data (using finance module - returns decrypted data)
    try {
      const financeAccounts = finance.getAccounts();
      const financeDemographics = finance.getDemographics();
      const financeAdvancedSettings = finance.getAdvancedSettings();
      const financeHistory = finance.getHistory();
      
      backup.data.finance = {
        accounts: financeAccounts,
        demographics: financeDemographics,
        advancedSettings: financeAdvancedSettings,
        history: financeHistory
      };
      logger.info(logger.categories.SYSTEM, '[Backup] Finance data exported');
    } catch (error) {
      logger.warning(logger.categories.SYSTEM, `[Backup] Finance data export skipped: ${error.message}`);
    }
    
    // Generate checksum for data integrity
    backup.metadata.checksum = generateChecksum(backup.data);
    
    logger.success(logger.categories.SYSTEM, '[Backup] Export completed successfully');
    
    return {
      success: true,
      backup: backup,
      message: 'Data exported successfully'
    };
    
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[Backup] Export failed: ${error.message}`);
    return {
      success: false,
      error: 'Export failed: ' + error.message
    };
  }
}

/**
 * Validate backup data structure and integrity
 */
function validateBackup(backup) {
  const errors = [];
  const warnings = [];
  
  // Check required metadata
  if (!backup.metadata) {
    errors.push('Missing metadata section');
    return { valid: false, errors, warnings };
  }
  
  if (!backup.metadata.version) {
    errors.push('Missing backup version');
  }
  
  if (!backup.metadata.exportedAt) {
    warnings.push('Missing export timestamp');
  }
  
  if (!backup.data) {
    errors.push('Missing data section');
    return { valid: false, errors, warnings };
  }
  
  // Verify checksum if present
  if (backup.metadata.checksum) {
    if (!verifyChecksum(backup.data, backup.metadata.checksum)) {
      errors.push('Data integrity check failed - checksum mismatch');
    }
  } else {
    warnings.push('No checksum present - data integrity cannot be verified');
  }
  
  // Validate main config structure
  if (backup.data.mainConfig) {
    if (!backup.data.mainConfig.server) {
      warnings.push('Main config missing server section');
    }
  }
  
  // Validate finance data structure
  if (backup.data.finance) {
    if (!Array.isArray(backup.data.finance.accounts)) {
      warnings.push('Finance accounts should be an array');
    }
    if (!backup.data.finance.demographics) {
      warnings.push('Finance demographics missing');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Import all site configurations and data from backup
 */
function importAllData(backup, currentConfig) {
  logger.info(logger.categories.SYSTEM, '[Backup] Starting data import...');
  
  // Validate backup first
  const validation = validateBackup(backup);
  if (!validation.valid) {
    logger.error(logger.categories.SYSTEM, `[Backup] Validation failed: ${validation.errors.join(', ')}`);
    return {
      success: false,
      error: 'Backup validation failed: ' + validation.errors.join(', '),
      warnings: validation.warnings
    };
  }
  
  if (validation.warnings.length > 0) {
    logger.warning(logger.categories.SYSTEM, `[Backup] Validation warnings: ${validation.warnings.join(', ')}`);
  }
  
  const results = {
    imported: [],
    skipped: [],
    errors: []
  };
  
  try {
    // 1. Import main configuration
    if (backup.data.mainConfig) {
      try {
        const configPath = path.join(CONFIG_DIR, 'config.json');
        const existingConfig = currentConfig || loadMainConfig() || {};
        
        // Merge backup data with existing config, preserving sensitive data
        const mergedConfig = JSON.parse(JSON.stringify(backup.data.mainConfig));
        
        // Preserve existing admin password
        if (existingConfig.server?.admin?.password) {
          if (!mergedConfig.server) mergedConfig.server = {};
          if (!mergedConfig.server.admin) mergedConfig.server.admin = {};
          mergedConfig.server.admin.password = existingConfig.server.admin.password;
        } else {
          // Generate a random password if none exists - user will need to reset via server restart
          if (!mergedConfig.server) mergedConfig.server = {};
          if (!mergedConfig.server.admin) mergedConfig.server.admin = {};
          if (!mergedConfig.server.admin.password) {
            // Generate a secure random password using URL-safe base64 (20 chars)
            mergedConfig.server.admin.password = crypto.randomBytes(15).toString('base64url');
            logger.warning(logger.categories.SYSTEM, '[Backup] Generated new admin password - please check config.json');
          }
        }
        
        // Preserve existing GitHub tokens if not in backup
        if (existingConfig.vidiots?.githubPages?.accessToken && 
            (!mergedConfig.vidiots?.githubPages?.accessToken)) {
          if (!mergedConfig.vidiots) mergedConfig.vidiots = {};
          if (!mergedConfig.vidiots.githubPages) mergedConfig.vidiots.githubPages = {};
          mergedConfig.vidiots.githubPages.accessToken = existingConfig.vidiots.githubPages.accessToken;
        }
        
        if (existingConfig.espresso?.githubPages?.accessToken && 
            (!mergedConfig.espresso?.githubPages?.accessToken)) {
          if (!mergedConfig.espresso) mergedConfig.espresso = {};
          if (!mergedConfig.espresso.githubPages) mergedConfig.espresso.githubPages = {};
          mergedConfig.espresso.githubPages.accessToken = existingConfig.espresso.githubPages.accessToken;
        }
        
        // Preserve Home Assistant token
        if (existingConfig.homeAssistant?.token && 
            (!mergedConfig.homeAssistant?.token)) {
          if (!mergedConfig.homeAssistant) mergedConfig.homeAssistant = {};
          mergedConfig.homeAssistant.token = existingConfig.homeAssistant.token;
        }
        
        fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));
        results.imported.push('Main configuration');
        logger.info(logger.categories.SYSTEM, '[Backup] Main configuration imported');
      } catch (error) {
        results.errors.push('Main configuration: ' + error.message);
        logger.error(logger.categories.SYSTEM, `[Backup] Main config import failed: ${error.message}`);
      }
    }
    
    // 2. Import Espresso data
    if (backup.data.espressoData) {
      try {
        const espressoPath = path.join(CONFIG_DIR, 'espresso-data.json');
        fs.writeFileSync(espressoPath, JSON.stringify(backup.data.espressoData, null, 2));
        results.imported.push('Espresso data');
        logger.info(logger.categories.SYSTEM, '[Backup] Espresso data imported');
      } catch (error) {
        results.errors.push('Espresso data: ' + error.message);
        logger.error(logger.categories.SYSTEM, `[Backup] Espresso data import failed: ${error.message}`);
      }
    }
    
    // 4. Import Finance data
    if (backup.data.finance) {
      try {
        // Import demographics first
        if (backup.data.finance.demographics) {
          finance.updateDemographics(backup.data.finance.demographics);
        }
        
        // Import advanced settings
        if (backup.data.finance.advancedSettings) {
          finance.updateAdvancedSettings(backup.data.finance.advancedSettings);
        }
        
        // Import accounts - need to handle carefully
        if (Array.isArray(backup.data.finance.accounts)) {
          // Get existing accounts to avoid duplicates
          const existingAccounts = finance.getAccounts();
          const existingIds = new Set(existingAccounts.map(a => a.id));
          
          let importedCount = 0;
          let updatedCount = 0;
          
          for (const account of backup.data.finance.accounts) {
            if (existingIds.has(account.id)) {
              // Update existing account
              finance.saveAccount(account);
              updatedCount++;
            } else {
              // Add new account
              finance.saveAccount(account);
              importedCount++;
            }
          }
          
          logger.info(logger.categories.SYSTEM, `[Backup] Accounts: ${importedCount} new, ${updatedCount} updated`);
        }
        
        results.imported.push('Finance data');
        logger.info(logger.categories.SYSTEM, '[Backup] Finance data imported');
      } catch (error) {
        results.errors.push('Finance data: ' + error.message);
        logger.error(logger.categories.SYSTEM, `[Backup] Finance data import failed: ${error.message}`);
      }
    }
    
    const success = results.errors.length === 0;
    if (success) {
      logger.success(logger.categories.SYSTEM, '[Backup] Import completed successfully');
    } else {
      logger.warning(logger.categories.SYSTEM, '[Backup] Import completed with errors');
    }
    
    return {
      success,
      results,
      warnings: validation.warnings,
      message: success 
        ? `Successfully imported: ${results.imported.join(', ')}` 
        : `Import completed with errors in: ${results.errors.join(', ')}`
    };
    
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `[Backup] Import failed: ${error.message}`);
    return {
      success: false,
      error: 'Import failed: ' + error.message,
      results
    };
  }
}

/**
 * Get a summary of what's included in a backup
 */
function getBackupSummary(backup) {
  if (!backup || !backup.data) {
    return null;
  }
  
  const summary = {
    metadata: backup.metadata,
    contents: {}
  };
  
  // Main config summary
  if (backup.data.mainConfig) {
    summary.contents.mainConfig = {
      hasServerConfig: !!backup.data.mainConfig.server,
      hasHomeAssistant: !!backup.data.mainConfig.homeAssistant,
      usefulLinksCount: backup.data.mainConfig.usefulLinks?.length || 0,
      connectedDevicesCount: backup.data.mainConfig.connectedDevices?.length || 0,
      hasDrinkMixer: !!backup.data.mainConfig.drinkMixer,
      alcoholsCount: backup.data.mainConfig.drinkMixer?.alcohols?.length || 0,
      mixersCount: backup.data.mainConfig.drinkMixer?.mixers?.length || 0,
      recipesCount: backup.data.mainConfig.drinkMixer?.recipes?.length || 0,
      hasVidiots: !!backup.data.mainConfig.vidiots,
      hasEspresso: !!backup.data.mainConfig.espresso,
      hasClient: !!backup.data.mainConfig.client,
      tournamentsCount: backup.data.mainConfig.tournaments?.length || 0
    };
  }
  
  // Espresso data summary
  if (backup.data.espressoData) {
    summary.contents.espressoData = {
      hasData: true,
      fieldsCount: Object.keys(backup.data.espressoData).length
    };
  }
  
  // Finance summary
  if (backup.data.finance) {
    summary.contents.finance = {
      accountsCount: backup.data.finance.accounts?.length || 0,
      hasDemographics: !!backup.data.finance.demographics,
      hasAdvancedSettings: !!backup.data.finance.advancedSettings,
      historyEntriesCount: backup.data.finance.history?.length || 0
    };
  }
  
  return summary;
}

module.exports = {
  exportAllData,
  importAllData,
  validateBackup,
  getBackupSummary,
  generateChecksum,
  verifyChecksum,
  BACKUP_VERSION
};
