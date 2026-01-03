const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

let config = null;
const CONFIG_FILE = path.join(__dirname, '..', 'config', 'smartmirror-config.json.enc');
const ENCRYPTION_KEY = process.env.SMARTMIRROR_KEY || 'smartmirror-default-key-change-in-production';

// Warn if using default encryption key
if (!process.env.SMARTMIRROR_KEY) {
  console.warn('⚠️  [Smart Mirror] Using default encryption key. Set SMARTMIRROR_KEY environment variable for production.');
  logger.warning(logger.categories.SMART_MIRROR, 'Using default encryption key - set SMARTMIRROR_KEY for production');
} else {
  logger.info(logger.categories.SMART_MIRROR, 'Using custom SMARTMIRROR_KEY from environment');
}

// Log initialization details
logger.debug(logger.categories.SMART_MIRROR, `Config file path: ${CONFIG_FILE}`);

// Initialize the smart mirror module with server config
function init(serverConfig) {
  config = serverConfig;
  console.log('📱 [Smart Mirror] Module initialized');
  logger.info(logger.categories.SMART_MIRROR, 'Smart Mirror module initialized');
  logger.logSmartMirrorDiagnostics('Module initialization', {
    configFile: CONFIG_FILE,
    configFileExists: fs.existsSync(CONFIG_FILE),
    hasCustomEncryptionKey: !!process.env.SMARTMIRROR_KEY
  });
}

// Get default smart mirror configuration
function getDefaultConfig() {
  return {
    enabled: false,
    widgets: {
      clock: {
        enabled: true,
        area: 'top-left',
        size: 'medium',
        gridPosition: { x: 0, y: 0, width: 2, height: 1 }
      },
      calendar: {
        enabled: true,
        area: 'top-right',
        size: 'large',
        gridPosition: { x: 2, y: 0, width: 2, height: 2 },
        calendarUrl: ''
      },
      weather: {
        enabled: false,
        area: 'bottom-left',
        size: 'medium',
        gridPosition: { x: 0, y: 2, width: 2, height: 1 },
        apiKey: '',
        location: ''
      },
      news: {
        enabled: false,
        area: 'bottom-right',
        size: 'medium',
        gridPosition: { x: 2, y: 2, width: 2, height: 1 },
        feedUrl: ''
      }
    },
    gridSize: {
      columns: 4,
      rows: 3
    },
    theme: 'dark',
    refreshInterval: 60000 // 1 minute
  };
}

// Encrypt data
function encrypt(text) {
  try {
    logger.debug(logger.categories.SMART_MIRROR, 'Encrypting configuration data');
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    logger.debug(logger.categories.SMART_MIRROR, `Encryption successful (data length: ${text.length} bytes)`);
    return iv.toString('hex') + ':' + encrypted;
  } catch (err) {
    console.error('❌ [Smart Mirror] Encryption error:', err.message);
    logger.error(logger.categories.SMART_MIRROR, `Encryption failed: ${err.message}`);
    return null;
  }
}

// Decrypt data
function decrypt(text) {
  try {
    logger.debug(logger.categories.SMART_MIRROR, 'Decrypting configuration data');
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    logger.debug(logger.categories.SMART_MIRROR, `Decryption successful (data length: ${decrypted.length} bytes)`);
    return decrypted;
  } catch (err) {
    console.error('❌ [Smart Mirror] Decryption error:', err.message);
    logger.error(logger.categories.SMART_MIRROR, `Decryption failed: ${err.message}`);
    return null;
  }
}

// Load configuration from encrypted file
function loadConfig() {
  logger.debug(logger.categories.SMART_MIRROR, `Loading configuration from: ${CONFIG_FILE}`);
  
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      logger.info(logger.categories.SMART_MIRROR, 'Configuration file found, reading encrypted data');
      const encryptedData = fs.readFileSync(CONFIG_FILE, 'utf8');
      logger.debug(logger.categories.SMART_MIRROR, `Read ${encryptedData.length} bytes of encrypted data`);
      
      const decryptedData = decrypt(encryptedData);
      if (decryptedData) {
        const loadedConfig = JSON.parse(decryptedData);
        console.log('📱 [Smart Mirror] Configuration loaded from file');
        logger.success(logger.categories.SMART_MIRROR, `Configuration loaded successfully (enabled: ${loadedConfig.enabled})`);
        logger.logSmartMirrorDiagnostics('Config loaded from file', {
          configFile: CONFIG_FILE,
          enabled: loadedConfig.enabled,
          theme: loadedConfig.theme,
          widgetCount: Object.keys(loadedConfig.widgets || {}).length,
          enabledWidgets: Object.keys(loadedConfig.widgets || {}).filter(k => loadedConfig.widgets[k]?.enabled)
        });
        return loadedConfig;
      } else {
        logger.error(logger.categories.SMART_MIRROR, 'Failed to decrypt configuration data');
      }
    } else {
      logger.warning(logger.categories.SMART_MIRROR, `Configuration file does not exist: ${CONFIG_FILE}`);
    }
  } catch (err) {
    console.error('❌ [Smart Mirror] Error loading config:', err.message);
    logger.error(logger.categories.SMART_MIRROR, `Error loading config: ${err.message} (stack: ${err.stack})`);
  }
  
  // Return default config if file doesn't exist or can't be loaded
  console.log('📱 [Smart Mirror] Using default configuration');
  logger.info(logger.categories.SMART_MIRROR, 'Falling back to default configuration');
  return getDefaultConfig();
}

// Save configuration to encrypted file
function saveConfig(newConfig) {
  logger.info(logger.categories.SMART_MIRROR, `Saving configuration to: ${CONFIG_FILE}`);
  logger.logSmartMirrorDiagnostics('Config save requested', {
    enabled: newConfig.enabled,
    theme: newConfig.theme,
    widgetCount: Object.keys(newConfig.widgets || {}).length
  });
  
  try {
    // Ensure config directory exists
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      logger.info(logger.categories.SMART_MIRROR, `Creating config directory: ${configDir}`);
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Validate config structure
    const configToSave = {
      ...getDefaultConfig(),
      ...newConfig,
      widgets: {
        ...getDefaultConfig().widgets,
        ...(newConfig.widgets || {})
      }
    };
    
    logger.debug(logger.categories.SMART_MIRROR, `Merged configuration with defaults`);
    
    const jsonData = JSON.stringify(configToSave, null, 2);
    logger.debug(logger.categories.SMART_MIRROR, `Serialized config to JSON (${jsonData.length} bytes)`);
    
    const encryptedData = encrypt(jsonData);
    
    if (encryptedData) {
      fs.writeFileSync(CONFIG_FILE, encryptedData, 'utf8');
      console.log('✅ [Smart Mirror] Configuration saved successfully');
      logger.success(logger.categories.SMART_MIRROR, `Configuration saved successfully to ${CONFIG_FILE}`);
      logger.logSmartMirrorDiagnostics('Config saved', {
        configFile: CONFIG_FILE,
        fileSize: encryptedData.length,
        enabled: configToSave.enabled,
        enabledWidgets: Object.keys(configToSave.widgets || {}).filter(k => configToSave.widgets[k]?.enabled)
      });
      return { success: true, config: configToSave };
    } else {
      throw new Error('Failed to encrypt configuration');
    }
  } catch (err) {
    console.error('❌ [Smart Mirror] Error saving config:', err.message);
    logger.error(logger.categories.SMART_MIRROR, `Error saving config: ${err.message} (stack: ${err.stack})`);
    return { success: false, error: err.message };
  }
}

// Get sanitized config for public API (removes sensitive data)
function getPublicConfig() {
  logger.debug(logger.categories.SMART_MIRROR, 'Getting public configuration (sanitized)');
  const fullConfig = loadConfig();
  
  // Remove sensitive data like API keys
  const publicConfig = {
    ...fullConfig,
    widgets: {}
  };
  
  // Sanitize widgets - remove API keys and other sensitive data
  Object.keys(fullConfig.widgets).forEach(widgetKey => {
    const widget = fullConfig.widgets[widgetKey];
    publicConfig.widgets[widgetKey] = {
      enabled: widget.enabled,
      area: widget.area,
      size: widget.size,
      gridPosition: widget.gridPosition
    };
    
    // Add non-sensitive widget-specific data
    if (widgetKey === 'calendar' && widget.calendarUrl) {
      publicConfig.widgets[widgetKey].calendarUrl = widget.calendarUrl;
    }
    if (widgetKey === 'weather' && widget.location) {
      publicConfig.widgets[widgetKey].location = widget.location;
      // Don't include API key
    }
    if (widgetKey === 'news' && widget.feedUrl) {
      publicConfig.widgets[widgetKey].feedUrl = widget.feedUrl;
    }
  });
  
  logger.info(logger.categories.SMART_MIRROR, `Public config generated (API keys removed)`);
  return publicConfig;
}

module.exports = {
  init,
  loadConfig,
  saveConfig,
  getPublicConfig,
  getDefaultConfig
};
