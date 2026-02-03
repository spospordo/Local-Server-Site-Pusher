const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const axios = require('axios');
const Parser = require('rss-parser');
const ical = require('node-ical');
const SunCalc = require('suncalc');

// Read version from package.json
const packageJson = require('../package.json');
const APP_VERSION = packageJson.version;
const APP_NAME = packageJson.name;

// Configuration constants
const CACHE_MIN_INTERVAL_MS = 5000; // Minimum time between Home Assistant requests
const DEFAULT_CALENDAR_CACHE_TTL = 600; // Default: 10 minutes in seconds
const CALENDAR_CACHE_BACKOFF_MS = 30000; // 30 seconds backoff on errors

let config = null;
const CONFIG_FILE = path.join(__dirname, '..', 'config', 'smartmirror-config.json.enc');
const ENCRYPTION_KEY = process.env.SMARTMIRROR_KEY || 'smartmirror-default-key-change-in-production';

// Calendar cache state - stores fetched calendar data with metadata
const calendarCache = {
  data: null,           // Cached calendar events
  timestamp: 0,         // When data was last fetched
  etags: {},           // ETags by URL for conditional requests
  lastModified: {},    // Last-Modified headers by URL
  errors: {},          // Error state by URL
  lastFetchAttempt: 0  // Last attempt timestamp (for backoff)
};

// Shared axios configuration for Home Assistant requests
const HOME_ASSISTANT_AXIOS_CONFIG = {
  headers: {
    'User-Agent': `${APP_NAME}/${APP_VERSION} (Smart Mirror Widget)`
  },
  maxRedirects: 0,
  validateStatus: function (status) {
    return status >= 200 && status < 300; // Only accept 2xx as success
  }
};

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

// Get default widget configuration (shared by both orientations)
function getDefaultWidgets() {
  return {
    clock: {
      enabled: true,
      area: 'top-left',
      size: 'medium',
      apiKey: '',
      location: '',
      units: 'imperial',
      calendarUrls: [],
      feedUrls: [],
      days: 5,
      additionalTimezones: []
    },
    calendar: {
      enabled: true,
      area: 'top-right',
      size: 'large',
      calendarUrls: [], // Support multiple calendar feeds (breaking change from calendarUrl string)
      apiKey: '',
      location: '',
      units: 'imperial',
      feedUrls: [],
      days: 5
    },
    weather: {
      enabled: false,
      area: 'bottom-left',
      size: 'medium',
      apiKey: '',
      location: '',
      units: 'imperial', // imperial or metric
      calendarUrls: [],
      feedUrls: [],
      days: 5
    },
    forecast: {
      enabled: false,
      area: 'bottom-center',
      size: 'large',
      apiKey: '',
      location: '',
      days: 5, // 3, 5, or 10
      units: 'imperial', // imperial or metric
      calendarUrls: [],
      feedUrls: []
    },
    news: {
      enabled: false,
      area: 'bottom-right',
      size: 'medium',
      feedUrls: [], // Support multiple RSS feeds
      apiKey: '',
      location: '',
      units: 'imperial',
      calendarUrls: [],
      days: 5
    },
    media: {
      enabled: false,
      area: 'middle-center',
      size: 'large',
      homeAssistantUrl: '', // e.g., http://homeassistant.local:8123
      homeAssistantToken: '', // Long-lived access token
      entityIds: [], // Array of media player entity IDs (e.g., ['media_player.spotify', 'media_player.chromecast'])
      apiKey: '',
      location: '',
      units: 'imperial',
      calendarUrls: [],
      feedUrls: [],
      days: 5
    },
    vacation: {
      enabled: false,
      area: 'bottom-right',
      size: 'medium',
      apiKey: '',
      location: '',
      units: 'imperial',
      calendarUrls: [],
      feedUrls: [],
      days: 5
    },
    smartWidget: {
      enabled: false,
      area: 'middle-center',
      size: 'large',
      // Sub-widget management
      subWidgets: [
        { type: 'rainForecast', enabled: true, priority: 1 },
        { type: 'upcomingVacation', enabled: true, priority: 2 },
        { type: 'homeAssistantMedia', enabled: true, priority: 3 },
        { type: 'party', enabled: true, priority: 4 }
      ],
      // Display settings
      displayMode: 'cycle', // 'cycle', 'simultaneous', or 'priority'
      cycleSpeed: 10, // seconds between cycles
      simultaneousMax: 2, // max sub-widgets to show at once in simultaneous mode
      // Shared configuration for sub-widgets
      apiKey: '', // For weather API (rain forecast)
      location: '', // For weather location
      units: 'imperial',
      homeAssistantUrl: '', // For media widget
      homeAssistantToken: '', // For media widget
      entityIds: [] // Media player entity IDs
    }
  };
}

// Get default layout configuration for portrait orientation
// Portrait uses finer vertical granularity (4 cols × 6 rows)
function getDefaultPortraitLayout() {
  return {
    clock: { x: 0, y: 0, width: 2, height: 2 },
    calendar: { x: 2, y: 0, width: 2, height: 4 },
    weather: { x: 0, y: 2, width: 2, height: 2 },
    forecast: { x: 0, y: 4, width: 4, height: 2 },
    news: { x: 2, y: 2, width: 2, height: 2 },
    media: { x: 0, y: 4, width: 4, height: 2 },
    vacation: { x: 2, y: 4, width: 2, height: 2 },
    smartWidget: { x: 0, y: 2, width: 4, height: 2 }
  };
}

// Get default layout configuration for landscape orientation
// Landscape uses finer horizontal granularity (8 cols × 4 rows)
function getDefaultLandscapeLayout() {
  return {
    clock: { x: 0, y: 0, width: 2, height: 1 },
    calendar: { x: 2, y: 0, width: 4, height: 3 },
    weather: { x: 6, y: 0, width: 2, height: 1 },
    news: { x: 0, y: 1, width: 2, height: 2 },
    forecast: { x: 0, y: 3, width: 8, height: 1 },
    media: { x: 6, y: 1, width: 2, height: 2 },
    vacation: { x: 6, y: 3, width: 2, height: 1 },
    smartWidget: { x: 2, y: 1, width: 4, height: 2 }
  };
}

// Get default smart mirror configuration
function getDefaultConfig() {
  return {
    enabled: false,
    widgets: getDefaultWidgets(),
    layouts: {
      portrait: getDefaultPortraitLayout(),
      landscape: getDefaultLandscapeLayout()
    },
    gridSize: {
      portrait: {
        columns: 4,
        rows: 6  // Finer vertical granularity for portrait
      },
      landscape: {
        columns: 8,  // Finer horizontal granularity for landscape
        rows: 4
      }
    },
    theme: 'dark',
    refreshInterval: 60000, // 1 minute
    calendarCacheTTL: DEFAULT_CALENDAR_CACHE_TTL, // 10 minutes - cache duration for calendar feeds
    autoThemeSwitch: {
      portrait: {
        enabled: false,
        latitude: null,
        longitude: null,
        timezone: 'America/New_York'
      },
      landscape: {
        enabled: false,
        latitude: null,
        longitude: null,
        timezone: 'America/New_York'
      }
    }
  };
}

// Calculate sunrise and sunset times for a given date and location
// Note: timezone is not used in calculation as SunCalc returns times based on the date object's timezone
// The timezone is stored in config for display/reference purposes only
function calculateSunTimes(latitude, longitude, timezone, date = new Date()) {
  if (!latitude || !longitude) {
    logger.warning(logger.categories.SMART_MIRROR, 'Cannot calculate sun times: latitude or longitude not provided');
    return null;
  }

  try {
    // Get sun times for the location
    // SunCalc returns Date objects in the timezone of the input date
    const times = SunCalc.getTimes(date, latitude, longitude);
    
    logger.debug(logger.categories.SMART_MIRROR, `Sun times calculated for lat=${latitude}, lon=${longitude}, tz=${timezone || 'system'}: sunrise=${times.sunrise}, sunset=${times.sunset}`);
    
    return {
      sunrise: times.sunrise,
      sunset: times.sunset,
      sunriseISO: times.sunrise.toISOString(),
      sunsetISO: times.sunset.toISOString()
    };
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Error calculating sun times: ${err.message}`);
    return null;
  }
}

// Calculate theme based on current time and sunrise/sunset times
// Light theme: 30 minutes before sunrise to 30 minutes after sunset
// Dark theme: all other times
function calculateCurrentTheme(autoThemeConfig, manualTheme = 'dark') {
  // If auto theme switching is disabled, return manual theme
  if (!autoThemeConfig || !autoThemeConfig.enabled) {
    logger.debug(logger.categories.SMART_MIRROR, `Auto theme disabled, using manual theme: ${manualTheme}`);
    return {
      theme: manualTheme,
      autoMode: false,
      nextSwitch: null,
      sunTimes: null
    };
  }

  // Validate coordinates
  if (!autoThemeConfig.latitude || !autoThemeConfig.longitude) {
    logger.warning(logger.categories.SMART_MIRROR, 'Auto theme enabled but location not configured, using manual theme');
    return {
      theme: manualTheme,
      autoMode: false,
      error: 'Location not configured',
      nextSwitch: null,
      sunTimes: null
    };
  }

  try {
    const now = new Date();
    const sunTimes = calculateSunTimes(autoThemeConfig.latitude, autoThemeConfig.longitude, autoThemeConfig.timezone, now);
    
    if (!sunTimes) {
      logger.error(logger.categories.SMART_MIRROR, 'Failed to calculate sun times');
      return {
        theme: manualTheme,
        autoMode: false,
        error: 'Failed to calculate sun times',
        nextSwitch: null,
        sunTimes: null
      };
    }

    // Apply 30-minute buffers
    const BUFFER_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
    const lightStart = new Date(sunTimes.sunrise.getTime() - BUFFER_MS);
    const lightEnd = new Date(sunTimes.sunset.getTime() + BUFFER_MS);

    // Determine current theme
    const currentTheme = (now >= lightStart && now <= lightEnd) ? 'light' : 'dark';
    
    // Calculate next switch time
    let nextSwitch;
    if (currentTheme === 'light') {
      // Currently light, next switch is to dark (30min after sunset)
      nextSwitch = lightEnd;
    } else if (now < lightStart) {
      // Before light period starts, next switch is to light (30min before sunrise)
      nextSwitch = lightStart;
    } else {
      // After light period ends, next switch is tomorrow's light start
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowSunTimes = calculateSunTimes(autoThemeConfig.latitude, autoThemeConfig.longitude, autoThemeConfig.timezone, tomorrow);
      if (tomorrowSunTimes) {
        nextSwitch = new Date(tomorrowSunTimes.sunrise.getTime() - BUFFER_MS);
      } else {
        nextSwitch = null;
      }
    }

    logger.info(logger.categories.SMART_MIRROR, `Auto theme calculated: ${currentTheme} (next switch: ${nextSwitch ? nextSwitch.toISOString() : 'unknown'})`);
    
    return {
      theme: currentTheme,
      autoMode: true,
      nextSwitch: nextSwitch ? nextSwitch.toISOString() : null,
      sunTimes: {
        sunrise: sunTimes.sunriseISO,
        sunset: sunTimes.sunsetISO,
        lightStart: lightStart.toISOString(),
        lightEnd: lightEnd.toISOString()
      }
    };
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Error in calculateCurrentTheme: ${err.message}`);
    return {
      theme: manualTheme,
      autoMode: false,
      error: err.message,
      nextSwitch: null,
      sunTimes: null
    };
  }
}

// Helper function to scale widget position to new grid size
function scaleWidgetPosition(position, oldGridSize, newGridSize) {
  // Calculate scale factors
  const scaleX = newGridSize.columns / oldGridSize.columns;
  const scaleY = newGridSize.rows / oldGridSize.rows;
  
  // Use floor for position to avoid exceeding grid bounds
  // Use max(1, round) for size to ensure at least 1 cell
  const newX = Math.floor(position.x * scaleX);
  const newY = Math.floor(position.y * scaleY);
  const newWidth = Math.max(1, Math.round(position.width * scaleX));
  const newHeight = Math.max(1, Math.round(position.height * scaleY));
  
  // Ensure widget doesn't exceed grid bounds
  return {
    x: Math.min(newX, newGridSize.columns - 1),
    y: Math.min(newY, newGridSize.rows - 1),
    width: Math.min(newWidth, newGridSize.columns - newX),
    height: Math.min(newHeight, newGridSize.rows - newY)
  };
}

// Migrate old config format to new dual-layout format
function migrateConfig(oldConfig) {
  // Check if config already has layouts structure
  if (oldConfig.layouts) {
    // Check if gridSize needs migration from single object to per-orientation
    if (oldConfig.gridSize && !oldConfig.gridSize.portrait && !oldConfig.gridSize.landscape) {
      logger.info(logger.categories.SMART_MIRROR, 'Migrating gridSize to per-orientation format');
      
      const oldGridSize = oldConfig.gridSize;
      const defaultConfig = getDefaultConfig();
      const newPortraitGridSize = defaultConfig.gridSize.portrait;
      const newLandscapeGridSize = defaultConfig.gridSize.landscape;
      
      // Scale existing layouts to new grid sizes
      const scaledPortraitLayout = {};
      const scaledLandscapeLayout = {};
      
      Object.keys(oldConfig.layouts.portrait || {}).forEach(widgetKey => {
        scaledPortraitLayout[widgetKey] = scaleWidgetPosition(
          oldConfig.layouts.portrait[widgetKey],
          oldGridSize,
          newPortraitGridSize
        );
      });
      
      Object.keys(oldConfig.layouts.landscape || {}).forEach(widgetKey => {
        scaledLandscapeLayout[widgetKey] = scaleWidgetPosition(
          oldConfig.layouts.landscape[widgetKey],
          oldGridSize,
          newLandscapeGridSize
        );
      });
      
      return {
        ...oldConfig,
        gridSize: {
          portrait: newPortraitGridSize,
          landscape: newLandscapeGridSize
        },
        layouts: {
          portrait: scaledPortraitLayout,
          landscape: scaledLandscapeLayout
        }
      };
    }
    
    // Already in new format - but check for missing widgets
    const defaultWidgets = getDefaultWidgets();
    const defaultPortrait = getDefaultPortraitLayout();
    const defaultLandscape = getDefaultLandscapeLayout();
    
    let needsUpdate = false;
    const updatedWidgets = { ...oldConfig.widgets };
    const updatedPortrait = { ...(oldConfig.layouts.portrait || {}) };
    const updatedLandscape = { ...(oldConfig.layouts.landscape || {}) };
    
    // Add any missing widgets with defaults
    Object.keys(defaultWidgets).forEach(widgetKey => {
      if (!updatedWidgets[widgetKey]) {
        logger.info(logger.categories.SMART_MIRROR, `Adding missing widget: ${widgetKey}`);
        updatedWidgets[widgetKey] = defaultWidgets[widgetKey];
        updatedPortrait[widgetKey] = defaultPortrait[widgetKey];
        updatedLandscape[widgetKey] = defaultLandscape[widgetKey];
        needsUpdate = true;
      }
    });
    
    if (needsUpdate) {
      return {
        ...oldConfig,
        widgets: updatedWidgets,
        layouts: {
          portrait: updatedPortrait,
          landscape: updatedLandscape
        }
      };
    }
    
    // Check if autoThemeSwitch is missing and add it
    if (!oldConfig.autoThemeSwitch) {
      logger.info(logger.categories.SMART_MIRROR, 'Adding missing autoThemeSwitch configuration');
      return {
        ...oldConfig,
        autoThemeSwitch: getDefaultConfig().autoThemeSwitch
      };
    }
    
    // Already in new format
    return oldConfig;
  }
  
  logger.info(logger.categories.SMART_MIRROR, 'Migrating config to dual-layout format');
  
  // Determine old grid size
  const oldGridSize = oldConfig.gridSize || { columns: 4, rows: 3 };
  const defaultConfig = getDefaultConfig();
  const newPortraitGridSize = defaultConfig.gridSize.portrait;
  const newLandscapeGridSize = defaultConfig.gridSize.landscape;
  
  const migratedConfig = {
    enabled: oldConfig.enabled,
    theme: oldConfig.theme || 'dark',
    gridSize: {
      portrait: newPortraitGridSize,
      landscape: newLandscapeGridSize
    },
    refreshInterval: oldConfig.refreshInterval || 60000,
    autoThemeSwitch: oldConfig.autoThemeSwitch || defaultConfig.autoThemeSwitch,
    widgets: {},
    layouts: {
      portrait: {},
      landscape: {}
    }
  };
  
  // Migrate widgets and extract gridPosition to layouts
  if (oldConfig.widgets) {
    Object.keys(oldConfig.widgets).forEach(widgetKey => {
      const oldWidget = oldConfig.widgets[widgetKey];
      
      // Copy widget properties (without gridPosition)
      migratedConfig.widgets[widgetKey] = {
        enabled: oldWidget.enabled,
        area: oldWidget.area,
        size: oldWidget.size
      };
      
      // Copy widget-specific properties
      if (widgetKey === 'calendar' && oldWidget.calendarUrls) {
        migratedConfig.widgets[widgetKey].calendarUrls = oldWidget.calendarUrls;
      }
      if ((widgetKey === 'weather' || widgetKey === 'forecast') && oldWidget.location) {
        migratedConfig.widgets[widgetKey].location = oldWidget.location;
        migratedConfig.widgets[widgetKey].apiKey = oldWidget.apiKey || '';
        migratedConfig.widgets[widgetKey].units = oldWidget.units || 'imperial';
      }
      if (widgetKey === 'forecast' && oldWidget.days) {
        migratedConfig.widgets[widgetKey].days = oldWidget.days;
      }
      if (widgetKey === 'news' && oldWidget.feedUrls) {
        migratedConfig.widgets[widgetKey].feedUrls = oldWidget.feedUrls;
      }
      
      // Migrate gridPosition to layouts with scaling
      if (oldWidget.gridPosition) {
        // Scale position for portrait
        migratedConfig.layouts.portrait[widgetKey] = scaleWidgetPosition(
          oldWidget.gridPosition,
          oldGridSize,
          newPortraitGridSize
        );
        // Scale position for landscape  
        migratedConfig.layouts.landscape[widgetKey] = scaleWidgetPosition(
          oldWidget.gridPosition,
          oldGridSize,
          newLandscapeGridSize
        );
      } else {
        // Use defaults if gridPosition doesn't exist
        const defaultPortrait = getDefaultPortraitLayout();
        const defaultLandscape = getDefaultLandscapeLayout();
        migratedConfig.layouts.portrait[widgetKey] = defaultPortrait[widgetKey] || { x: 0, y: 0, width: 1, height: 1 };
        migratedConfig.layouts.landscape[widgetKey] = defaultLandscape[widgetKey] || { x: 0, y: 0, width: 1, height: 1 };
      }
    });
  }
  
  // Fill in any missing widgets with defaults
  const defaultWidgets = getDefaultWidgets();
  const defaultPortrait = getDefaultPortraitLayout();
  const defaultLandscape = getDefaultLandscapeLayout();
  
  Object.keys(defaultWidgets).forEach(widgetKey => {
    if (!migratedConfig.widgets[widgetKey]) {
      migratedConfig.widgets[widgetKey] = defaultWidgets[widgetKey];
      migratedConfig.layouts.portrait[widgetKey] = defaultPortrait[widgetKey];
      migratedConfig.layouts.landscape[widgetKey] = defaultLandscape[widgetKey];
    }
  });
  
  logger.success(logger.categories.SMART_MIRROR, 'Config migration completed');
  return migratedConfig;
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
        const rawConfig = JSON.parse(decryptedData);
        // Migrate old config format to new dual-layout format
        const loadedConfig = migrateConfig(rawConfig);
        console.log('📱 [Smart Mirror] Configuration loaded from file');
        logger.success(logger.categories.SMART_MIRROR, `Configuration loaded successfully (enabled: ${loadedConfig.enabled})`);
        logger.logSmartMirrorDiagnostics('Config loaded from file', {
          configFile: CONFIG_FILE,
          enabled: loadedConfig.enabled,
          theme: loadedConfig.theme,
          widgetCount: Object.keys(loadedConfig.widgets || {}).length,
          enabledWidgets: Object.keys(loadedConfig.widgets || {}).filter(k => loadedConfig.widgets[k]?.enabled),
          hasLayouts: !!(loadedConfig.layouts)
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
    
    // Load existing config to preserve API keys if not provided
    const existingConfig = loadConfig();
    
    // Migrate and validate config structure
    const migratedConfig = migrateConfig(newConfig);
    const defaultConfig = getDefaultConfig();
    
    const configToSave = {
      ...defaultConfig,
      ...migratedConfig,
      widgets: {
        ...defaultConfig.widgets,
        ...(migratedConfig.widgets || {})
      },
      layouts: {
        portrait: {
          ...defaultConfig.layouts.portrait,
          ...(migratedConfig.layouts?.portrait || {})
        },
        landscape: {
          ...defaultConfig.layouts.landscape,
          ...(migratedConfig.layouts?.landscape || {})
        }
      }
    };
    
    // Preserve API keys for weather and forecast widgets if not provided in new config
    const widgetsToPreserve = ['weather', 'forecast'];
    widgetsToPreserve.forEach(widgetKey => {
      if (configToSave.widgets[widgetKey]) {
        if (!configToSave.widgets[widgetKey].apiKey && existingConfig.widgets?.[widgetKey]?.apiKey) {
          logger.info(logger.categories.SMART_MIRROR, `Preserving existing ${widgetKey} API key`);
          configToSave.widgets[widgetKey].apiKey = existingConfig.widgets[widgetKey].apiKey;
        }
      }
    });
    
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
// orientation parameter: 'portrait', 'landscape', or undefined (returns both)
function getPublicConfig(orientation = null) {
  logger.debug(logger.categories.SMART_MIRROR, `Getting public configuration (sanitized, orientation: ${orientation || 'all'})`);
  const fullConfig = loadConfig();
  
  // Remove sensitive data like API keys
  const publicConfig = {
    enabled: fullConfig.enabled,
    theme: fullConfig.theme,
    gridSize: fullConfig.gridSize,
    refreshInterval: fullConfig.refreshInterval,
    calendarCacheTTL: fullConfig.calendarCacheTTL || DEFAULT_CALENDAR_CACHE_TTL,
    widgets: {}
  };
  
  // Add layouts based on orientation parameter
  if (orientation === 'portrait' && fullConfig.layouts?.portrait) {
    publicConfig.layouts = { portrait: fullConfig.layouts.portrait };
  } else if (orientation === 'landscape' && fullConfig.layouts?.landscape) {
    publicConfig.layouts = { landscape: fullConfig.layouts.landscape };
  } else {
    // Return both layouts if orientation not specified
    publicConfig.layouts = fullConfig.layouts || {
      portrait: getDefaultPortraitLayout(),
      landscape: getDefaultLandscapeLayout()
    };
  }
  
  // Add auto theme switch configuration (sanitized)
  if (fullConfig.autoThemeSwitch) {
    publicConfig.autoThemeSwitch = {};
    
    if (orientation === 'portrait' && fullConfig.autoThemeSwitch.portrait) {
      publicConfig.autoThemeSwitch.portrait = {
        enabled: fullConfig.autoThemeSwitch.portrait.enabled,
        latitude: fullConfig.autoThemeSwitch.portrait.latitude,
        longitude: fullConfig.autoThemeSwitch.portrait.longitude,
        timezone: fullConfig.autoThemeSwitch.portrait.timezone
      };
    } else if (orientation === 'landscape' && fullConfig.autoThemeSwitch.landscape) {
      publicConfig.autoThemeSwitch.landscape = {
        enabled: fullConfig.autoThemeSwitch.landscape.enabled,
        latitude: fullConfig.autoThemeSwitch.landscape.latitude,
        longitude: fullConfig.autoThemeSwitch.landscape.longitude,
        timezone: fullConfig.autoThemeSwitch.landscape.timezone
      };
    } else {
      // Return both if orientation not specified
      publicConfig.autoThemeSwitch = {
        portrait: fullConfig.autoThemeSwitch.portrait || getDefaultConfig().autoThemeSwitch.portrait,
        landscape: fullConfig.autoThemeSwitch.landscape || getDefaultConfig().autoThemeSwitch.landscape
      };
    }
  }
  
  // Calculate current theme based on orientation
  if (orientation && fullConfig.autoThemeSwitch && fullConfig.autoThemeSwitch[orientation]) {
    const themeInfo = calculateCurrentTheme(fullConfig.autoThemeSwitch[orientation], fullConfig.theme);
    publicConfig.calculatedTheme = themeInfo.theme;
    publicConfig.themeInfo = themeInfo;
  }
  
  // Sanitize widgets - remove API keys and other sensitive data
  Object.keys(fullConfig.widgets).forEach(widgetKey => {
    const widget = fullConfig.widgets[widgetKey];
    publicConfig.widgets[widgetKey] = {
      enabled: widget.enabled,
      area: widget.area,
      size: widget.size
    };
    
    // Add non-sensitive widget-specific data
    if (widgetKey === 'calendar' && widget.calendarUrls) {
      publicConfig.widgets[widgetKey].calendarUrls = widget.calendarUrls;
    }
    if (widgetKey === 'clock' && widget.additionalTimezones) {
      publicConfig.widgets[widgetKey].additionalTimezones = widget.additionalTimezones;
    }
    if (widgetKey === 'weather' && widget.location) {
      publicConfig.widgets[widgetKey].location = widget.location;
      publicConfig.widgets[widgetKey].units = widget.units || 'imperial';
      // Don't include API key
    }
    if (widgetKey === 'forecast') {
      publicConfig.widgets[widgetKey].location = widget.location;
      publicConfig.widgets[widgetKey].days = widget.days || 5;
      publicConfig.widgets[widgetKey].units = widget.units || 'imperial';
      // Don't include API key
    }
    if (widgetKey === 'news' && widget.feedUrls) {
      publicConfig.widgets[widgetKey].feedUrls = widget.feedUrls;
    }
  });
  
  logger.info(logger.categories.SMART_MIRROR, `Public config generated (API keys removed, orientation: ${orientation || 'all'})`);
  return publicConfig;
}

// Fetch calendar events from ICS feed with server-side caching
async function fetchCalendarEvents(calendarUrls, forceRefresh = false) {
  logger.debug(logger.categories.SMART_MIRROR, `Fetching calendar events from ${calendarUrls.length} feeds (forceRefresh: ${forceRefresh})`);
  
  if (!calendarUrls || calendarUrls.length === 0) {
    logger.warning(logger.categories.SMART_MIRROR, 'No calendar URLs configured');
    return { success: false, error: 'No calendar URLs configured', events: [], cached: false };
  }
  
  // Load config to get cache TTL
  const config = loadConfig();
  const cacheTTL = (config.calendarCacheTTL || DEFAULT_CALENDAR_CACHE_TTL) * 1000; // Convert to milliseconds
  const now = Date.now();
  
  // Check if we have valid cached data
  const cacheAge = now - calendarCache.timestamp;
  const isCacheValid = calendarCache.data !== null && cacheAge < cacheTTL && !forceRefresh;
  
  if (isCacheValid) {
    logger.info(logger.categories.SMART_MIRROR, `Returning cached calendar data (age: ${Math.floor(cacheAge / 1000)}s, TTL: ${cacheTTL / 1000}s)`);
    return {
      ...calendarCache.data,
      cached: true,
      cacheAge: Math.floor(cacheAge / 1000),
      lastFetch: new Date(calendarCache.timestamp).toISOString()
    };
  }
  
  // Prevent rapid re-fetches on errors (backoff period defined by constant)
  const timeSinceLastAttempt = now - calendarCache.lastFetchAttempt;
  if (timeSinceLastAttempt < CALENDAR_CACHE_BACKOFF_MS && calendarCache.data !== null && !forceRefresh) {
    logger.warning(logger.categories.SMART_MIRROR, `Using stale cache due to recent fetch attempt (${Math.floor(timeSinceLastAttempt / 1000)}s ago)`);
    return {
      ...calendarCache.data,
      cached: true,
      stale: true,
      cacheAge: Math.floor(cacheAge / 1000),
      lastFetch: new Date(calendarCache.timestamp).toISOString()
    };
  }
  
  // Update last fetch attempt timestamp
  calendarCache.lastFetchAttempt = now;
  
  logger.info(logger.categories.SMART_MIRROR, `Cache expired or invalid, fetching fresh calendar data`);
  
  const allEvents = [];
  const errors = [];
  const fetchStatus = {};
  
  for (let url of calendarUrls) {
    if (!url || url.trim() === '') continue;
    
    // Convert webcal:// to https:// for Apple Calendar feeds
    url = url.trim().replace(/^webcal:\/\//i, 'https://');
    
    try {
      logger.info(logger.categories.SMART_MIRROR, `Fetching calendar from: ${url}`);
      
      // Prepare conditional request headers
      const headers = {};
      if (calendarCache.etags[url]) {
        headers['If-None-Match'] = calendarCache.etags[url];
        logger.debug(logger.categories.SMART_MIRROR, `Using ETag for conditional request: ${calendarCache.etags[url]}`);
      }
      if (calendarCache.lastModified[url]) {
        headers['If-Modified-Since'] = calendarCache.lastModified[url];
        logger.debug(logger.categories.SMART_MIRROR, `Using Last-Modified for conditional request: ${calendarCache.lastModified[url]}`);
      }
      
      const response = await axios.get(url, { 
        timeout: 10000,
        headers,
        validateStatus: (status) => {
          // Accept 200 (OK), 304 (Not Modified), and treat others as errors
          return status === 200 || status === 304;
        }
      });
      
      // Handle 304 Not Modified - content hasn't changed
      if (response.status === 304) {
        logger.info(logger.categories.SMART_MIRROR, `Calendar feed unchanged (304 Not Modified): ${url}`);
        fetchStatus[url] = { status: 'not_modified', cached: true };
        
        // Use cached events for this URL if available
        if (calendarCache.data && calendarCache.data.eventsByUrl && calendarCache.data.eventsByUrl[url]) {
          allEvents.push(...calendarCache.data.eventsByUrl[url]);
        }
        continue;
      }
      
      // Store ETag and Last-Modified for future requests
      if (response.headers.etag) {
        calendarCache.etags[url] = response.headers.etag;
        logger.debug(logger.categories.SMART_MIRROR, `Stored ETag: ${response.headers.etag}`);
      }
      if (response.headers['last-modified']) {
        calendarCache.lastModified[url] = response.headers['last-modified'];
        logger.debug(logger.categories.SMART_MIRROR, `Stored Last-Modified: ${response.headers['last-modified']}`);
      }
      
      const events = await ical.async.parseICS(response.data);
      
      // Process events
      const nowDate = new Date();
      const upcomingEvents = [];
      
      for (const [key, event] of Object.entries(events)) {
        if (event.type === 'VEVENT') {
          const startDate = event.start ? new Date(event.start) : null;
          const endDate = event.end ? new Date(event.end) : null;
          
          // Detect all-day events (when start has no time component or datetype is 'date')
          const isAllDay = event.datetype === 'date' || 
                          (startDate && endDate && 
                           startDate.getHours() === 0 && 
                           startDate.getMinutes() === 0 &&
                           endDate.getHours() === 0 &&
                           endDate.getMinutes() === 0);
          
          // Only include future events (within next 30 days)
          if (startDate && startDate > nowDate) {
            const daysFromNow = Math.floor((startDate - nowDate) / (1000 * 60 * 60 * 24));
            if (daysFromNow <= 30) {
              upcomingEvents.push({
                title: event.summary || 'Untitled Event',
                start: startDate.toISOString(),
                end: endDate ? endDate.toISOString() : null,
                location: event.location || '',
                description: event.description || '',
                daysFromNow,
                isAllDay
              });
            }
          }
        }
      }
      
      allEvents.push(...upcomingEvents);
      fetchStatus[url] = { status: 'success', eventCount: upcomingEvents.length };
      logger.success(logger.categories.SMART_MIRROR, `Fetched ${upcomingEvents.length} upcoming events from calendar`);
      
      // Clear error state for this URL on success
      if (calendarCache.errors[url]) {
        delete calendarCache.errors[url];
      }
      
    } catch (err) {
      const errorMsg = `Failed to fetch calendar from ${url}: ${err.message}`;
      logger.error(logger.categories.SMART_MIRROR, errorMsg);
      
      // Store error state
      calendarCache.errors[url] = {
        message: err.message,
        timestamp: now,
        statusCode: err.response?.status
      };
      
      // Handle rate limiting (429) or server errors (5xx) by using stale cache
      if (err.response?.status === 429 || (err.response?.status >= 500 && err.response?.status < 600)) {
        logger.warning(logger.categories.SMART_MIRROR, `Rate limited or server error for ${url}, using stale cache if available`);
        errors.push(`${errorMsg} (using cached data)`);
        fetchStatus[url] = { status: 'error_cached', error: err.message, statusCode: err.response?.status };
        
        // Use cached events for this URL if available
        if (calendarCache.data && calendarCache.data.eventsByUrl && calendarCache.data.eventsByUrl[url]) {
          allEvents.push(...calendarCache.data.eventsByUrl[url]);
        }
      } else {
        errors.push(errorMsg);
        fetchStatus[url] = { status: 'error', error: err.message };
      }
    }
  }
  
  // Sort events by start date
  allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  
  // Limit to 10 most recent events
  const limitedEvents = allEvents.slice(0, 10);
  
  // Build eventsByUrl map for future 304 handling
  // NOTE: This is a simplified implementation that stores all events for each URL.
  // This means when a feed returns 304 Not Modified, we use all previously cached events,
  // not just the ones that came from that specific feed. This works well enough for most
  // use cases but could lead to duplicate events if multiple feeds have overlapping events.
  // A more sophisticated implementation would track which events came from which feed,
  // but that would require significant additional complexity and memory overhead.
  const eventsByUrl = {};
  for (let url of calendarUrls) {
    url = url.trim().replace(/^webcal:\/\//i, 'https://');
    if (url) {
      eventsByUrl[url] = allEvents; // Store all events for simplicity
    }
  }
  
  // Update cache
  const result = {
    success: true,
    events: limitedEvents,
    errors: errors.length > 0 ? errors : null,
    fetchStatus,
    cached: false,
    lastFetch: new Date(now).toISOString()
  };
  
  calendarCache.data = {
    ...result,
    eventsByUrl // Store for 304 handling
  };
  calendarCache.timestamp = now;
  
  logger.success(logger.categories.SMART_MIRROR, `Calendar cache updated with ${limitedEvents.length} events`);
  
  return result;
}

// Fetch news from RSS feeds
async function fetchNews(feedUrls) {
  logger.debug(logger.categories.SMART_MIRROR, `Fetching news from ${feedUrls.length} feeds`);
  
  if (!feedUrls || feedUrls.length === 0) {
    logger.warning(logger.categories.SMART_MIRROR, 'No news feed URLs configured');
    return { success: false, error: 'No news feed URLs configured', items: [] };
  }
  
  const parser = new Parser({
    timeout: 10000,
    customFields: {
      item: ['media:content', 'media:thumbnail']
    }
  });
  
  const allItems = [];
  const errors = [];
  
  for (const url of feedUrls) {
    if (!url || url.trim() === '') continue;
    
    try {
      logger.info(logger.categories.SMART_MIRROR, `Fetching RSS feed from: ${url}`);
      const feed = await parser.parseURL(url);
      
      const items = feed.items.slice(0, 5).map(item => ({
        title: item.title || 'Untitled',
        link: item.link || '',
        pubDate: item.pubDate || item.isoDate || '',
        source: feed.title || url,
        description: item.contentSnippet || item.content || '',
        image: item['media:thumbnail']?.[0]?.$ || item['media:content']?.[0]?.$ || null
      }));
      
      allItems.push(...items);
      logger.success(logger.categories.SMART_MIRROR, `Fetched ${items.length} news items from ${feed.title || url}`);
    } catch (err) {
      const errorMsg = `Failed to fetch RSS feed from ${url}: ${err.message}`;
      logger.error(logger.categories.SMART_MIRROR, errorMsg);
      errors.push(errorMsg);
    }
  }
  
  // Sort by date (newest first)
  allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  
  // Limit to 15 most recent items
  const limitedItems = allItems.slice(0, 15);
  
  return {
    success: true,
    items: limitedItems,
    errors: errors.length > 0 ? errors : null
  };
}

// Get calendar cache status (for admin UI)
function getCalendarCacheStatus() {
  const config = loadConfig();
  const cacheTTL = (config.calendarCacheTTL || DEFAULT_CALENDAR_CACHE_TTL) * 1000;
  const now = Date.now();
  const cacheAge = calendarCache.timestamp > 0 ? now - calendarCache.timestamp : null;
  const isValid = calendarCache.data !== null && cacheAge < cacheTTL;
  
  return {
    enabled: true,
    lastFetch: calendarCache.timestamp > 0 ? new Date(calendarCache.timestamp).toISOString() : null,
    cacheAge: cacheAge !== null ? Math.floor(cacheAge / 1000) : null,
    cacheTTL: cacheTTL / 1000,
    isValid,
    hasData: calendarCache.data !== null,
    eventCount: calendarCache.data?.events?.length || 0,
    errors: calendarCache.errors,
    etags: Object.keys(calendarCache.etags).length,
    lastModified: Object.keys(calendarCache.lastModified).length
  };
}

// Refresh calendar cache (for manual refresh button)
async function refreshCalendarCache() {
  logger.info(logger.categories.SMART_MIRROR, 'Manual calendar cache refresh requested');
  const config = loadConfig();
  const calendarConfig = config.widgets?.calendar;
  
  if (!calendarConfig || !calendarConfig.enabled) {
    return { success: false, error: 'Calendar widget not enabled' };
  }
  
  const calendarUrls = calendarConfig.calendarUrls || [];
  if (calendarUrls.length === 0) {
    return { success: false, error: 'No calendar URLs configured' };
  }
  
  // Force refresh by passing forceRefresh=true
  return await fetchCalendarEvents(calendarUrls, true);
}

// Fetch current weather from OpenWeatherMap
async function fetchWeather(apiKey, location, units = 'imperial') {
  logger.debug(logger.categories.SMART_MIRROR, `Fetching current weather (units: ${units})`);
  
  if (!apiKey || !location) {
    const errorMsg = 'API key and location are required for weather';
    logger.warning(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
  
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=${units}`;
    logger.info(logger.categories.SMART_MIRROR, `Fetching weather from OpenWeatherMap API for location: ${location}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    
    const weatherData = {
      temp: Math.round(data.main.temp),
      tempMin: Math.round(data.main.temp_min),
      tempMax: Math.round(data.main.temp_max),
      feelsLike: Math.round(data.main.feels_like),
      condition: data.weather[0]?.main || 'Unknown',
      description: data.weather[0]?.description || '',
      icon: data.weather[0]?.icon || '',
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      windSpeed: Math.round(data.wind.speed),
      windDeg: data.wind.deg,
      clouds: data.clouds.all,
      sunrise: data.sys.sunrise ? new Date(data.sys.sunrise * 1000).toISOString() : null,
      sunset: data.sys.sunset ? new Date(data.sys.sunset * 1000).toISOString() : null,
      location: data.name,
      country: data.sys.country,
      units
    };
    
    logger.success(logger.categories.SMART_MIRROR, `Weather data fetched successfully for ${data.name}`);
    return { success: true, data: weatherData };
  } catch (err) {
    const errorMsg = `Failed to fetch weather: ${err.response?.data?.message || err.message}`;
    logger.error(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Fetch weather forecast from OpenWeatherMap
async function fetchForecast(apiKey, location, days = 5, units = 'imperial') {
  logger.debug(logger.categories.SMART_MIRROR, `Fetching ${days}-day forecast (units: ${units})`);
  
  if (!apiKey || !location) {
    const errorMsg = 'API key and location are required for forecast';
    logger.warning(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
  
  // Validate days parameter (only 3 and 5 supported with free tier)
  if (![3, 5].includes(days)) {
    days = 5; // Default to 5 days
  }
  
  try {
    // Use 5-day forecast endpoint (free tier)
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&appid=${apiKey}&units=${units}`;
    logger.info(logger.categories.SMART_MIRROR, `Fetching forecast from OpenWeatherMap API for location: ${location}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    
    // Group forecast by day and get daily summary
    const dailyForecasts = {};
    
    data.list.forEach(item => {
      const date = new Date(item.dt * 1000);
      const dateKey = date.toISOString().split('T')[0];
      
      if (!dailyForecasts[dateKey]) {
        dailyForecasts[dateKey] = {
          date: dateKey,
          temps: [],
          conditions: [],
          humidity: [],
          windSpeed: [],
          pop: [], // probability of precipitation
          icons: []
        };
      }
      
      dailyForecasts[dateKey].temps.push(item.main.temp);
      dailyForecasts[dateKey].conditions.push(item.weather[0]?.main);
      dailyForecasts[dateKey].humidity.push(item.main.humidity);
      dailyForecasts[dateKey].windSpeed.push(item.wind.speed);
      dailyForecasts[dateKey].pop.push(item.pop || 0);
      dailyForecasts[dateKey].icons.push(item.weather[0]?.icon);
    });
    
    // Process daily summaries
    const forecastDays = Object.keys(dailyForecasts)
      .sort()
      .slice(0, days)
      .map(dateKey => {
        const day = dailyForecasts[dateKey];
        const tempMax = Math.round(Math.max(...day.temps));
        const tempMin = Math.round(Math.min(...day.temps));
        const avgHumidity = Math.round(day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length);
        const avgWindSpeed = Math.round(day.windSpeed.reduce((a, b) => a + b, 0) / day.windSpeed.length);
        const maxPop = Math.round(Math.max(...day.pop) * 100);
        
        // Get most common condition and icon
        const conditionCounts = {};
        day.conditions.forEach(c => conditionCounts[c] = (conditionCounts[c] || 0) + 1);
        const condition = Object.keys(conditionCounts).reduce((a, b) => 
          conditionCounts[a] > conditionCounts[b] ? a : b
        );
        
        // Get icon from most common condition time
        const icon = day.icons[Math.floor(day.icons.length / 2)] || day.icons[0];
        
        return {
          date: dateKey,
          dayName: new Date(dateKey).toLocaleDateString('en-US', { weekday: 'short' }),
          tempHigh: tempMax,
          tempLow: tempMin,
          condition,
          icon,
          humidity: avgHumidity,
          windSpeed: avgWindSpeed,
          precipChance: maxPop
        };
      });
    
    logger.success(logger.categories.SMART_MIRROR, `Forecast data fetched successfully for ${data.city.name}`);
    return {
      success: true,
      location: data.city.name,
      country: data.city.country,
      days: forecastDays,
      units
    };
  } catch (err) {
    const errorMsg = `Failed to fetch forecast: ${err.response?.data?.message || err.message}`;
    logger.error(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Fetch weather forecast for a specific date with hourly details
async function fetchWeatherForDate(apiKey, location, targetDate, units = 'imperial') {
  logger.debug(logger.categories.SMART_MIRROR, `Fetching weather for date ${targetDate} (units: ${units})`);
  
  if (!apiKey || !location) {
    const errorMsg = 'API key and location are required for weather';
    logger.warning(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
  
  if (!targetDate) {
    const errorMsg = 'Target date is required';
    logger.warning(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
  
  try {
    // Use 5-day forecast endpoint (free tier) - provides 3-hour interval data
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&appid=${apiKey}&units=${units}`;
    logger.info(logger.categories.SMART_MIRROR, `Fetching forecast for date ${targetDate} from OpenWeatherMap API`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    
    // Normalize target date to YYYY-MM-DD format
    const targetDateStr = typeof targetDate === 'string' ? targetDate : new Date(targetDate).toISOString().split('T')[0];
    
    // Filter forecast items for the target date
    const hourlyItems = data.list.filter(item => {
      const itemDate = new Date(item.dt * 1000).toISOString().split('T')[0];
      return itemDate === targetDateStr;
    });
    
    if (hourlyItems.length === 0) {
      // Date is outside forecast range (>5 days)
      logger.warning(logger.categories.SMART_MIRROR, `No forecast data available for ${targetDateStr}`);
      return { success: false, error: 'Date outside forecast range (max 5 days)' };
    }
    
    // Extract hourly forecast data
    const hourlyForecast = hourlyItems.map(item => {
      const itemDate = new Date(item.dt * 1000);
      return {
        time: itemDate.toISOString(),
        hour: itemDate.getHours(),
        temp: Math.round(item.main.temp),
        feelsLike: Math.round(item.main.feels_like),
        condition: item.weather[0]?.main || 'Unknown',
        description: item.weather[0]?.description || '',
        icon: item.weather[0]?.icon || '',
        humidity: item.main.humidity,
        windSpeed: Math.round(item.wind.speed),
        precipChance: Math.round((item.pop || 0) * 100)
      };
    });
    
    // Calculate daily summary from hourly data
    const temps = hourlyItems.map(item => item.main.temp);
    const pops = hourlyItems.map(item => item.pop || 0);
    const conditions = hourlyItems.map(item => item.weather[0]?.main);
    
    const conditionCounts = {};
    conditions.forEach(c => conditionCounts[c] = (conditionCounts[c] || 0) + 1);
    const mostCommonCondition = Object.keys(conditionCounts).reduce((a, b) => 
      conditionCounts[a] > conditionCounts[b] ? a : b
    );
    
    const summary = {
      date: targetDateStr,
      tempHigh: Math.round(Math.max(...temps)),
      tempLow: Math.round(Math.min(...temps)),
      condition: mostCommonCondition,
      icon: hourlyItems[Math.floor(hourlyItems.length / 2)]?.weather[0]?.icon || hourlyItems[0]?.weather[0]?.icon || '',
      precipChance: Math.round(Math.max(...pops) * 100)
    };
    
    logger.success(logger.categories.SMART_MIRROR, `Weather data for ${targetDateStr} fetched successfully`);
    return {
      success: true,
      location: data.city.name,
      country: data.city.country,
      date: targetDateStr,
      summary,
      hourly: hourlyForecast,
      units
    };
  } catch (err) {
    const errorMsg = `Failed to fetch weather for date: ${err.response?.data?.message || err.message}`;
    logger.error(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Fetch Home Assistant media player state
async function fetchHomeAssistantMedia(haUrl, haToken, entityIds) {
  if (!haUrl || !haToken || !entityIds || entityIds.length === 0) {
    return { success: false, error: 'Home Assistant URL, token, and entity IDs are required' };
  }

  try {
    // Remove trailing slash from URL if present
    const baseUrl = haUrl.replace(/\/$/, '');
    
    // Fetch state for all specified entities
    const statePromises = entityIds.map(async entityId => {
      try {
        const response = await axios.get(
          `${baseUrl}/api/states/${entityId}`,
          {
            ...HOME_ASSISTANT_AXIOS_CONFIG,
            headers: {
              ...HOME_ASSISTANT_AXIOS_CONFIG.headers,
              'Authorization': `Bearer ${haToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }
        );
        return { entityId, data: response.data, error: null };
      } catch (err) {
        // Log detailed error information for debugging
        if (err.response) {
          // Server responded with error status
          if (err.response.status === 401) {
            logger.error(logger.categories.SMART_MIRROR, `Home Assistant authentication failed for ${entityId}: Invalid or expired token`);
          } else if (err.response.status === 404) {
            logger.warning(logger.categories.SMART_MIRROR, `Entity ${entityId} not found in Home Assistant`);
          } else {
            logger.warning(logger.categories.SMART_MIRROR, `Failed to fetch entity ${entityId}: HTTP ${err.response.status}`);
          }
        } else if (err.request) {
          // Request made but no response received
          logger.warning(logger.categories.SMART_MIRROR, `No response from Home Assistant for ${entityId}: ${err.message}`);
        } else {
          // Error setting up the request
          logger.warning(logger.categories.SMART_MIRROR, `Failed to fetch entity ${entityId}: ${err.message}`);
        }
        return { entityId, data: null, error: err.message };
      }
    });

    const results = await Promise.all(statePromises);
    
    // Find first playing or paused media player, or first idle/standby
    let activePlayer = results.find(r => r.data && (r.data.state === 'playing' || r.data.state === 'paused'));
    if (!activePlayer) {
      activePlayer = results.find(r => r.data && r.data.state);
    }

    if (!activePlayer || !activePlayer.data) {
      return { 
        success: true, 
        state: 'idle',
        message: 'No active media players found'
      };
    }

    const playerData = activePlayer.data;
    const attributes = playerData.attributes || {};

    // Extract platform/app name from entity_picture or app_name
    let platform = attributes.app_name || attributes.source || '';
    if (!platform && attributes.entity_picture) {
      // Try to extract platform from entity picture URL
      const picMatch = attributes.entity_picture.match(/\/(spotify|plex|chromecast|sonos|youtube|netflix)/i);
      if (picMatch) {
        platform = picMatch[1].charAt(0).toUpperCase() + picMatch[1].slice(1);
      }
    }

    logger.success(logger.categories.SMART_MIRROR, `Media player data fetched for ${activePlayer.entityId}`);

    return {
      success: true,
      entityId: activePlayer.entityId,
      entityName: attributes.friendly_name || activePlayer.entityId,
      state: playerData.state,
      title: attributes.media_title || '',
      artist: attributes.media_artist || '',
      album: attributes.media_album_name || '',
      artworkUrl: attributes.entity_picture ? `${baseUrl}${attributes.entity_picture}` : null,
      platform: platform || 'Media Player',
      duration: attributes.media_duration || 0,
      position: attributes.media_position || 0,
      volume: attributes.volume_level ? Math.round(attributes.volume_level * 100) : null
    };
  } catch (err) {
    const errorMsg = `Failed to fetch Home Assistant media: ${err.message}`;
    logger.error(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Test weather API connection
async function testWeatherConnection(apiKey, location, units = 'imperial') {
  logger.info(logger.categories.SMART_MIRROR, `Testing weather API connection for location: ${location}`);
  
  if (!apiKey || !location) {
    return {
      success: false,
      error: 'API key and location are required',
      message: 'Please provide both an API key and location to test the connection.'
    };
  }
  
  if (!apiKey.trim()) {
    return {
      success: false,
      error: 'Invalid API Key',
      message: 'API key cannot be empty.'
    };
  }
  
  if (!location.trim()) {
    return {
      success: false,
      error: 'Invalid Location',
      message: 'Location cannot be empty.'
    };
  }
  
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=${units}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.status === 200 && response.data) {
      logger.success(logger.categories.SMART_MIRROR, `Weather API test successful for ${location}`);
      return {
        success: true,
        message: `Successfully connected to OpenWeatherMap API. Found weather data for "${response.data.name}".`,
        data: {
          location: response.data.name,
          temp: Math.round(response.data.main.temp),
          condition: response.data.weather[0]?.main || 'Unknown'
        }
      };
    }
    
    return {
      success: false,
      error: 'Unexpected Response',
      message: 'Received an unexpected response from the weather API.'
    };
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Weather API test failed: ${err.message}`);
    
    if (err.response) {
      if (err.response.status === 401) {
        return {
          success: false,
          error: 'Invalid API Key',
          message: 'The API key is invalid. Please check your OpenWeatherMap API key and try again.'
        };
      } else if (err.response.status === 404) {
        return {
          success: false,
          error: 'Location Not Found',
          message: `Could not find weather data for "${location}". Please check the location name and try again.`
        };
      } else if (err.response.status >= 500) {
        return {
          success: false,
          error: 'Server Error',
          message: 'OpenWeatherMap API is currently unavailable. Please try again later.'
        };
      }
      return {
        success: false,
        error: `HTTP ${err.response.status}`,
        message: `Received error ${err.response.status} from OpenWeatherMap API.`
      };
    }
    
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return {
        success: false,
        error: 'Cannot Reach Server',
        message: 'Could not connect to OpenWeatherMap API. Please check your internet connection.'
      };
    }
    
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      return {
        success: false,
        error: 'Connection Timeout',
        message: 'Connection to OpenWeatherMap API timed out. Please try again.'
      };
    }
    
    return {
      success: false,
      error: 'Connection Failed',
      message: `Failed to connect to weather API: ${err.message}`
    };
  }
}

// Test calendar feed connection
async function testCalendarFeed(feedUrls) {
  logger.info(logger.categories.SMART_MIRROR, `Testing calendar feed connection for ${feedUrls.length} feeds`);
  
  if (!feedUrls || feedUrls.length === 0) {
    return {
      success: false,
      error: 'No URLs Provided',
      message: 'Please provide at least one calendar feed URL.'
    };
  }
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  for (const url of feedUrls) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) continue;
    
    // Convert webcal:// to https:// securely
    let finalUrl = trimmedUrl;
    if (trimmedUrl.toLowerCase().startsWith('webcal://')) {
      finalUrl = 'https://' + trimmedUrl.substring(9);
    } else if (trimmedUrl.toLowerCase().startsWith('webcals://')) {
      finalUrl = 'https://' + trimmedUrl.substring(10);
    }
    
    // Validate URL format
    try {
      const parsedUrl = new URL(finalUrl);
      // Only allow http and https protocols
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        results.push({
          url: trimmedUrl,
          success: false,
          error: 'Invalid Protocol',
          message: 'Only HTTP and HTTPS protocols are supported.'
        });
        errorCount++;
        continue;
      }
    } catch (err) {
      results.push({
        url: trimmedUrl,
        success: false,
        error: 'Malformed URL',
        message: 'The URL format is invalid.'
      });
      errorCount++;
      continue;
    }
    
    try {
      logger.info(logger.categories.SMART_MIRROR, `Testing calendar feed: ${finalUrl}`);
      const response = await axios.get(finalUrl, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Local-Server-Site-Pusher/1.0'
        }
      });
      
      if (response.status === 200 && response.data) {
        // Try to parse the iCal data
        const events = await ical.async.parseICS(response.data);
        const eventCount = Object.keys(events).length;
        
        logger.success(logger.categories.SMART_MIRROR, `Calendar feed test successful: ${finalUrl} (${eventCount} items)`);
        results.push({
          url: trimmedUrl,
          success: true,
          message: `Successfully fetched calendar feed with ${eventCount} items.`,
          eventCount
        });
        successCount++;
      } else {
        results.push({
          url: trimmedUrl,
          success: false,
          error: 'Unexpected Response',
          message: `Received HTTP ${response.status} from the server.`
        });
        errorCount++;
      }
    } catch (err) {
      logger.error(logger.categories.SMART_MIRROR, `Calendar feed test failed for ${finalUrl}: ${err.message}`);
      
      let errorMessage = 'Failed to fetch calendar feed.';
      let errorType = 'Connection Failed';
      
      if (err.response) {
        if (err.response.status === 401) {
          errorType = 'Unauthorized';
          errorMessage = 'Authentication required. The calendar feed requires valid credentials.';
        } else if (err.response.status === 403) {
          errorType = 'Access Denied';
          errorMessage = 'Access to the calendar feed is forbidden. Check permissions.';
        } else if (err.response.status === 404) {
          errorType = 'Not Found';
          errorMessage = 'Calendar feed not found at this URL.';
        } else if (err.response.status >= 500) {
          errorType = 'Server Error';
          errorMessage = 'The calendar server is currently unavailable.';
        } else {
          errorMessage = `Received error ${err.response.status} from the server.`;
        }
      } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        errorType = 'Cannot Reach Server';
        errorMessage = 'Could not connect to the calendar server.';
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        errorType = 'Connection Timeout';
        errorMessage = 'Connection timed out while fetching the calendar feed.';
      }
      
      results.push({
        url: trimmedUrl,
        success: false,
        error: errorType,
        message: errorMessage
      });
      errorCount++;
    }
  }
  
  const overallSuccess = successCount > 0 && errorCount === 0;
  const message = errorCount === 0
    ? `Successfully tested ${successCount} calendar feed(s).`
    : `Tested ${successCount + errorCount} feed(s): ${successCount} successful, ${errorCount} failed.`;
  
  return {
    success: overallSuccess,
    message,
    results,
    summary: {
      total: successCount + errorCount,
      successful: successCount,
      failed: errorCount
    }
  };
}

// Test news feed connection
async function testNewsFeed(feedUrls) {
  logger.info(logger.categories.SMART_MIRROR, `Testing news feed connection for ${feedUrls.length} feeds`);
  
  if (!feedUrls || feedUrls.length === 0) {
    return {
      success: false,
      error: 'No URLs Provided',
      message: 'Please provide at least one news feed URL.'
    };
  }
  
  const parser = new Parser({
    timeout: 10000,
    customFields: {
      item: ['media:content', 'media:thumbnail']
    }
  });
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  for (const url of feedUrls) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) continue;
    
    // Validate URL format
    try {
      new URL(trimmedUrl);
    } catch (err) {
      results.push({
        url: trimmedUrl,
        success: false,
        error: 'Malformed URL',
        message: 'The URL format is invalid.'
      });
      errorCount++;
      continue;
    }
    
    try {
      logger.info(logger.categories.SMART_MIRROR, `Testing news feed: ${trimmedUrl}`);
      const feed = await parser.parseURL(trimmedUrl);
      
      const itemCount = feed.items?.length || 0;
      logger.success(logger.categories.SMART_MIRROR, `News feed test successful: ${trimmedUrl} (${itemCount} items)`);
      
      results.push({
        url: trimmedUrl,
        success: true,
        message: `Successfully fetched RSS feed "${feed.title || 'Unknown'}" with ${itemCount} items.`,
        feedTitle: feed.title,
        itemCount
      });
      successCount++;
    } catch (err) {
      logger.error(logger.categories.SMART_MIRROR, `News feed test failed for ${trimmedUrl}: ${err.message}`);
      
      let errorMessage = 'Failed to fetch news feed.';
      let errorType = 'Connection Failed';
      
      if (err.message.includes('Status code 401')) {
        errorType = 'Unauthorized';
        errorMessage = 'Authentication required for this feed.';
      } else if (err.message.includes('Status code 403')) {
        errorType = 'Access Denied';
        errorMessage = 'Access to the news feed is forbidden.';
      } else if (err.message.includes('Status code 404')) {
        errorType = 'Not Found';
        errorMessage = 'News feed not found at this URL.';
      } else if (err.message.includes('Status code 5')) {
        errorType = 'Server Error';
        errorMessage = 'The news server is currently unavailable.';
      } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
        errorType = 'Cannot Reach Server';
        errorMessage = 'Could not connect to the news server.';
      } else if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
        errorType = 'Connection Timeout';
        errorMessage = 'Connection timed out while fetching the feed.';
      } else if (err.message.includes('Invalid RSS') || err.message.includes('parse')) {
        errorType = 'Invalid Feed Format';
        errorMessage = 'The feed is not in a valid RSS/Atom format.';
      }
      
      results.push({
        url: trimmedUrl,
        success: false,
        error: errorType,
        message: errorMessage
      });
      errorCount++;
    }
  }
  
  const overallSuccess = successCount > 0 && errorCount === 0;
  const message = errorCount === 0
    ? `Successfully tested ${successCount} news feed(s).`
    : `Tested ${successCount + errorCount} feed(s): ${successCount} successful, ${errorCount} failed.`;
  
  return {
    success: overallSuccess,
    message,
    results,
    summary: {
      total: successCount + errorCount,
      successful: successCount,
      failed: errorCount
    }
  };
}

// Test Home Assistant media connection
async function testHomeAssistantMedia(url, token, entityIds) {
  logger.info(logger.categories.SMART_MIRROR, `Testing Home Assistant media connection to ${url}`);
  
  if (!url || !token) {
    return {
      success: false,
      error: 'Missing Configuration',
      message: 'Home Assistant URL and access token are required.'
    };
  }
  
  if (!url.trim()) {
    return {
      success: false,
      error: 'Invalid URL',
      message: 'Home Assistant URL cannot be empty.'
    };
  }
  
  if (!token.trim()) {
    return {
      success: false,
      error: 'Invalid Token',
      message: 'Home Assistant access token cannot be empty.'
    };
  }
  
  // Validate URL format
  try {
    new URL(url);
  } catch (err) {
    return {
      success: false,
      error: 'Malformed URL',
      message: 'The Home Assistant URL format is invalid. Use format: http://hostname:port'
    };
  }
  
  try {
    // Test basic connection first
    const apiUrl = `${url.replace(/\/$/, '')}/api/`;
    logger.info(logger.categories.SMART_MIRROR, `Testing Home Assistant API: ${apiUrl}`);
    
    const response = await axios.get(apiUrl, {
      ...HOME_ASSISTANT_AXIOS_CONFIG,
      headers: {
        ...HOME_ASSISTANT_AXIOS_CONFIG.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.status === 200) {
      logger.success(logger.categories.SMART_MIRROR, 'Home Assistant API connection successful');
      
      // If entity IDs are provided, test fetching their states
      if (entityIds && entityIds.length > 0) {
        const statesUrl = `${url.replace(/\/$/, '')}/api/states`;
        const statesResponse = await axios.get(statesUrl, {
          ...HOME_ASSISTANT_AXIOS_CONFIG,
          headers: {
            ...HOME_ASSISTANT_AXIOS_CONFIG.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        const allStates = statesResponse.data;
        const foundEntities = entityIds.filter(id => 
          allStates.some(state => state.entity_id === id.trim())
        );
        
        const mediaPlayers = foundEntities.filter(id => id.startsWith('media_player.'));
        
        return {
          success: true,
          message: `Successfully connected to Home Assistant. Found ${foundEntities.length} of ${entityIds.length} configured entities (${mediaPlayers.length} media players).`,
          data: {
            homeAssistantVersion: response.data.message || 'Unknown',
            totalEntities: allStates.length,
            foundEntities: foundEntities.length,
            configuredEntities: entityIds.length,
            mediaPlayers: mediaPlayers.length
          }
        };
      }
      
      return {
        success: true,
        message: 'Successfully connected to Home Assistant.',
        data: {
          homeAssistantVersion: response.data.message || 'Unknown'
        }
      };
    }
    
    return {
      success: false,
      error: 'Unexpected Response',
      message: `Received HTTP ${response.status} from Home Assistant.`
    };
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Home Assistant test failed: ${err.message}`);
    
    if (err.response) {
      if (err.response.status === 401) {
        return {
          success: false,
          error: 'Invalid Access Token',
          message: 'The access token is invalid or expired. Please create a new long-lived access token in Home Assistant.'
        };
      } else if (err.response.status === 403) {
        return {
          success: false,
          error: 'Access Denied',
          message: 'The access token does not have permission to access the API.'
        };
      } else if (err.response.status === 404) {
        return {
          success: false,
          error: 'Not Found',
          message: 'Home Assistant API not found at this URL. Check the URL and port number.'
        };
      } else if (err.response.status >= 500) {
        return {
          success: false,
          error: 'Server Error',
          message: 'Home Assistant server is experiencing errors.'
        };
      }
      return {
        success: false,
        error: `HTTP ${err.response.status}`,
        message: `Received error ${err.response.status} from Home Assistant.`
      };
    }
    
    if (err.code === 'ENOTFOUND') {
      return {
        success: false,
        error: 'Host Not Found',
        message: 'Could not resolve the Home Assistant hostname. Check the URL.'
      };
    }
    
    if (err.code === 'ECONNREFUSED') {
      return {
        success: false,
        error: 'Connection Refused',
        message: 'Connection refused by Home Assistant. Check the URL and port number, and ensure Home Assistant is running.'
      };
    }
    
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      return {
        success: false,
        error: 'Connection Timeout',
        message: 'Connection to Home Assistant timed out. Check the URL and network connectivity.'
      };
    }
    
    return {
      success: false,
      error: 'Connection Failed',
      message: `Failed to connect to Home Assistant: ${err.message}`
    };
  }
}

// Fetch timezone information for a location
async function fetchLocationTimezone(apiKey, location) {
  logger.debug(logger.categories.SMART_MIRROR, `Fetching timezone info for location: ${location}`);
  
  if (!apiKey || !location) {
    const errorMsg = 'API key and location are required for timezone';
    logger.warning(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
  
  try {
    // Use OpenWeatherMap API to get coordinates and timezone offset
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}`;
    logger.info(logger.categories.SMART_MIRROR, `Fetching timezone from OpenWeatherMap API for location: ${location}`);
    
    const response = await axios.get(url, { timeout: 10000 });
    const data = response.data;
    
    const timezoneData = {
      location: data.name,
      country: data.sys.country,
      timezoneOffset: data.timezone, // Offset in seconds from UTC
      lat: data.coord.lat,
      lon: data.coord.lon
    };
    
    logger.success(logger.categories.SMART_MIRROR, `Timezone data fetched successfully for ${data.name}: UTC${data.timezone >= 0 ? '+' : ''}${data.timezone / 3600}`);
    return { success: true, data: timezoneData };
  } catch (err) {
    const errorMsg = `Failed to fetch timezone: ${err.response?.data?.message || err.message}`;
    logger.error(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
}

module.exports = {
  init,
  loadConfig,
  saveConfig,
  getPublicConfig,
  getDefaultConfig,
  calculateCurrentTheme,
  calculateSunTimes,
  fetchCalendarEvents,
  getCalendarCacheStatus,
  refreshCalendarCache,
  fetchNews,
  fetchWeather,
  fetchForecast,
  fetchWeatherForDate,
  fetchHomeAssistantMedia,
  fetchLocationTimezone,
  testWeatherConnection,
  testCalendarFeed,
  testNewsFeed,
  testHomeAssistantMedia,
  // Export constants for use in other modules
  CACHE_MIN_INTERVAL_MS,
  DEFAULT_CALENDAR_CACHE_TTL,
  CALENDAR_CACHE_BACKOFF_MS
};
