const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let config = null;
const CONFIG_FILE = path.join(__dirname, '..', 'config', 'smartmirror-config.json.enc');
const ENCRYPTION_KEY = process.env.SMARTMIRROR_KEY || 'smartmirror-default-key-change-in-production';

// Initialize the smart mirror module with server config
function init(serverConfig) {
  config = serverConfig;
  console.log('📱 [Smart Mirror] Module initialized');
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
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (err) {
    console.error('❌ [Smart Mirror] Encryption error:', err.message);
    return null;
  }
}

// Decrypt data
function decrypt(text) {
  try {
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('❌ [Smart Mirror] Decryption error:', err.message);
    return null;
  }
}

// Load configuration from encrypted file
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const encryptedData = fs.readFileSync(CONFIG_FILE, 'utf8');
      const decryptedData = decrypt(encryptedData);
      if (decryptedData) {
        const loadedConfig = JSON.parse(decryptedData);
        console.log('📱 [Smart Mirror] Configuration loaded from file');
        return loadedConfig;
      }
    }
  } catch (err) {
    console.error('❌ [Smart Mirror] Error loading config:', err.message);
  }
  
  // Return default config if file doesn't exist or can't be loaded
  console.log('📱 [Smart Mirror] Using default configuration');
  return getDefaultConfig();
}

// Save configuration to encrypted file
function saveConfig(newConfig) {
  try {
    // Ensure config directory exists
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
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
    
    const jsonData = JSON.stringify(configToSave, null, 2);
    const encryptedData = encrypt(jsonData);
    
    if (encryptedData) {
      fs.writeFileSync(CONFIG_FILE, encryptedData, 'utf8');
      console.log('✅ [Smart Mirror] Configuration saved successfully');
      return { success: true, config: configToSave };
    } else {
      throw new Error('Failed to encrypt configuration');
    }
  } catch (err) {
    console.error('❌ [Smart Mirror] Error saving config:', err.message);
    return { success: false, error: err.message };
  }
}

// Get sanitized config for public API (removes sensitive data)
function getPublicConfig() {
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
  
  return publicConfig;
}

module.exports = {
  init,
  loadConfig,
  saveConfig,
  getPublicConfig,
  getDefaultConfig
};
