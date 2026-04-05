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
const DEFAULT_HA_REFRESH_INTERVAL_MS = 60000; // Default HA data refresh: 1 minute

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

// Minimum traffic delay (in seconds) considered notable enough to highlight in the UI
const NOTABLE_TRAFFIC_DELAY_SECONDS = 300; // 5 minutes
const driveTimeCache = {
  geocode: {},  // normalizedAddress -> { lat, lon, timestamp }
  routes: {},   // "lat,lon:lat,lon" -> { travelTimeSeconds, trafficDelaySeconds, timestamp }
  weather: {}   // "lat,lon:dateStr" -> { temp, icon, uvIndex, hasRain, precipChance, condition, units, timestamp }
};
const DRIVE_TIME_GEOCODE_TTL = 24 * 60 * 60 * 1000; // 24 hours for geocoded addresses
const DRIVE_TIME_ROUTE_TTL = 30 * 60 * 1000;         // 30 minutes for route calculations
const DRIVE_TIME_WEATHER_TTL = 30 * 60 * 1000;       // 30 minutes for destination weather

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
      days: 5,
      // Vacation region-based news
      vacationNewsEnabled: false,
      vacationNewsDaysInAdvance: 7,
      vacationNewsHeadlinesCount: 2,
      // Calendar event region-based news
      calendarNewsEnabled: false,
      calendarNewsDaysInAdvance: 2,
      calendarNewsHeadlinesCount: 2
    },
    media: {
      enabled: false,
      area: 'middle-center',
      size: 'large',
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
    airQuality: {
      enabled: false,
      area: 'bottom-right',
      size: 'small',
      apiKey: '',
      location: '',
      units: 'imperial',
      highlightFavorableConditions: true, // Highlight when AQI is good and temp <= 75°F
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
        { type: 'rainForecast', enabled: true, priority: 1, cycleTime: 10 },
        { type: 'highHeat', enabled: true, priority: 1, cycleTime: 10, threshold: 95 },
        { type: 'tempChange', enabled: true, priority: 1, cycleTime: 10, threshold: 15 },
        { type: 'upcomingVacation', enabled: true, priority: 2, cycleTime: 10 },
        { type: 'driveTime', enabled: true, priority: 2, cycleTime: 15 },
        { type: 'homeAssistantMedia', enabled: true, priority: 3, cycleTime: 10 },
        { type: 'homeAssistantBattery', enabled: true, priority: 3, cycleTime: 15, trackedDevices: [], haRefreshInterval: DEFAULT_HA_REFRESH_INTERVAL_MS },
        { type: 'party', enabled: true, priority: 4, cycleTime: 10 }
      ],
      // Display settings
      displayMode: 'cycle', // 'cycle', 'simultaneous', 'priority', or 'adaptive'
      cycleSpeed: 10, // seconds between cycles
      simultaneousMax: 2, // max sub-widgets to show at once in simultaneous mode
      // Adaptive mode settings
      adaptiveStackThreshold: 'medium', // 'small', 'medium', or 'large' - max size to stack (larger widgets cycle)
      // Shared configuration for sub-widgets
      apiKey: '', // For weather API (rain forecast)
      location: '', // For weather location
      units: 'imperial',
      entityIds: [], // Media player entity IDs
      homeAddress: ''   // Starting address for drive-time calculations
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
    airQuality: { x: 0, y: 4, width: 1, height: 1 },
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
    airQuality: { x: 6, y: 1, width: 1, height: 1 },
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
    },
    flightApi: {
      provider: 'aviationstack',
      apiKey: '',
      enabled: false,
      monthlyLimit: 100
    },
    tomtomApiKey: '', // For drive-time sub-widget (TomTom Routing & Search API)
    calendarEventFilters: {
      enabled: false,
      rules: []
      // Each rule structure:
      // {
      //   id: 'unique-id',
      //   keywords: ['keyword1', 'keyword2'],  // Case-insensitive keywords to match
      //   action: 'hide' | 'replace',          // Action to take when matched
      //   replacementTitle: 'New Title',       // Used when action is 'replace'
      //   replacementDescription: 'New Desc'   // Used when action is 'replace'
      // }
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
    
    // Migrate TomTom API key from widgets.smartWidget to top-level if needed
    if (!oldConfig.tomtomApiKey && oldConfig.widgets?.smartWidget?.tomtomApiKey) {
      logger.info(logger.categories.SMART_MIRROR, 'Migrating TomTom API key to top-level configuration');
      const { tomtomApiKey, ...smartWidgetWithoutKey } = oldConfig.widgets.smartWidget;
      return {
        ...oldConfig,
        tomtomApiKey,
        widgets: {
          ...oldConfig.widgets,
          smartWidget: smartWidgetWithoutKey
        }
      };
    }

    // Migrate homeAssistantBattery sub-widget: preserve existing friendlyName as groupName override
    // and add missing haRefreshInterval
    {
      const subWidgets = oldConfig.widgets?.smartWidget?.subWidgets;
      if (Array.isArray(subWidgets)) {
        const batteryIdx = subWidgets.findIndex(sw => sw.type === 'homeAssistantBattery');
        if (batteryIdx !== -1) {
          const battery = subWidgets[batteryIdx];
          let changed = false;
          const updatedDevices = (battery.trackedDevices || []).map(device => {
            // Migrate non-empty friendlyName to groupName if groupName not yet set,
            // so existing custom names are preserved as explicit overrides.
            if (device.friendlyName && !device.groupName) {
              changed = true;
              return { ...device, groupName: device.friendlyName, friendlyName: '' };
            }
            return device;
          });
          const needsRefreshInterval = battery.haRefreshInterval === undefined || battery.haRefreshInterval === null;
          if (changed || needsRefreshInterval) {
            logger.info(logger.categories.SMART_MIRROR,
              'Migrating homeAssistantBattery sub-widget (groupName/haRefreshInterval)');
            const updatedSubWidgets = [...subWidgets];
            updatedSubWidgets[batteryIdx] = {
              ...battery,
              trackedDevices: changed ? updatedDevices : battery.trackedDevices,
              haRefreshInterval: needsRefreshInterval ? DEFAULT_HA_REFRESH_INTERVAL_MS : battery.haRefreshInterval
            };
            return {
              ...oldConfig,
              widgets: {
                ...oldConfig.widgets,
                smartWidget: {
                  ...oldConfig.widgets.smartWidget,
                  subWidgets: updatedSubWidgets
                }
              }
            };
          }
        }
      }
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
    
    // Preserve flight API configuration by merging with existing settings
    // This ensures API key and other settings are retained when saving
    if (existingConfig.flightApi) {
      configToSave.flightApi = {
        ...existingConfig.flightApi,
        ...configToSave.flightApi
      };
      
      // Explicitly preserve API key if not provided in new config
      if (!configToSave.flightApi.apiKey && existingConfig.flightApi.apiKey) {
        logger.info(logger.categories.SMART_MIRROR, 'Preserving existing flight API key');
        configToSave.flightApi.apiKey = existingConfig.flightApi.apiKey;
      }
      
      logger.debug(logger.categories.SMART_MIRROR, 'Merged flight API configuration with existing settings');
    }
    
    // Preserve top-level TomTom API key if not provided in new config (empty string or undefined)
    // Also migrate from the legacy widgets.smartWidget.tomtomApiKey location on first save
    if (!configToSave.tomtomApiKey) {
      if (existingConfig.tomtomApiKey) {
        logger.info(logger.categories.SMART_MIRROR, 'Preserving existing TomTom API key');
        configToSave.tomtomApiKey = existingConfig.tomtomApiKey;
      } else if (existingConfig.widgets?.smartWidget?.tomtomApiKey) {
        logger.info(logger.categories.SMART_MIRROR, 'Migrating TomTom API key from smartWidget to top-level');
        configToSave.tomtomApiKey = existingConfig.widgets.smartWidget.tomtomApiKey;
      }
    }
    
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

/**
 * Helper function to extract string value from iCal properties
 * node-ical can return properties as either strings or objects with a 'val' property
 * This is particularly common with holiday calendars
 */
function _extractICalStringValue(property) {
  if (!property) return '';
  if (typeof property === 'string') return property;
  if (typeof property === 'object' && property.val) return String(property.val);
  if (typeof property === 'object') {
    // Some implementations use 'value' instead of 'val'
    if (property.value !== undefined) return String(property.value);
    // If it's an object but we can't extract a value, return empty string to avoid [object Object]
    logger.warning(logger.categories.SMART_MIRROR, `Unexpected iCal property format (event may display incorrectly): ${JSON.stringify(property)}`);
    return '';
  }
  return String(property);
}

/**
 * Apply keyword-based filters to calendar events
 * @param {Array} events - Array of calendar events
 * @param {Object} filterConfig - Filter configuration from config
 * @returns {Array} - Filtered/modified events
 */
function _applyEventFilters(events, filterConfig) {
  // If filtering is disabled or no rules, return events unchanged
  if (!filterConfig || !filterConfig.enabled || !filterConfig.rules || filterConfig.rules.length === 0) {
    return events;
  }
  
  logger.debug(logger.categories.SMART_MIRROR, `Applying ${filterConfig.rules.length} event filter rules`);
  
  const filteredEvents = [];
  
  for (const event of events) {
    let shouldHide = false;
    let modifiedEvent = { ...event };
    
    // Check each filter rule
    for (const rule of filterConfig.rules) {
      if (!rule.keywords || rule.keywords.length === 0) continue;
      
      // Check if any keyword matches the title or description (case-insensitive)
      const titleLower = (event.title || '').toLowerCase();
      const descriptionLower = (event.description || '').toLowerCase();
      
      const hasMatch = rule.keywords.some(keyword => {
        const keywordLower = keyword.toLowerCase();
        return titleLower.includes(keywordLower) || descriptionLower.includes(keywordLower);
      });
      
      if (hasMatch) {
        logger.debug(logger.categories.SMART_MIRROR, `Event "${event.title}" matched filter rule with keywords: ${rule.keywords.join(', ')}`);
        
        if (rule.action === 'hide') {
          shouldHide = true;
          logger.debug(logger.categories.SMART_MIRROR, `Hiding event: "${event.title}"`);
          break; // No need to check more rules if we're hiding
        } else if (rule.action === 'replace') {
          // Replace title and/or description if provided
          if (rule.replacementTitle) {
            modifiedEvent.title = rule.replacementTitle;
            logger.debug(logger.categories.SMART_MIRROR, `Replaced title: "${event.title}" -> "${rule.replacementTitle}"`);
          }
          if (rule.replacementDescription !== undefined) {
            modifiedEvent.description = rule.replacementDescription;
            logger.debug(logger.categories.SMART_MIRROR, `Replaced description for event: "${event.title}"`);
          }
          // Continue checking other rules in case we also want to hide
        }
      }
    }
    
    // Add event to result if not hidden
    if (!shouldHide) {
      filteredEvents.push(modifiedEvent);
    }
  }
  
  const removedCount = events.length - filteredEvents.length;
  if (removedCount > 0) {
    logger.info(logger.categories.SMART_MIRROR, `Event filtering: ${removedCount} event(s) hidden, ${filteredEvents.length} event(s) remaining`);
  }
  
  return filteredEvents;
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
                title: _extractICalStringValue(event.summary) || 'Untitled Event',
                start: startDate.toISOString(),
                end: endDate ? endDate.toISOString() : null,
                location: _extractICalStringValue(event.location) || '',
                description: _extractICalStringValue(event.description) || '',
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
  
  // Apply keyword-based filters if configured
  const filteredEvents = _applyEventFilters(allEvents, config.calendarEventFilters);
  
  // Limit to 10 most recent events
  const limitedEvents = filteredEvents.slice(0, 10);
  
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

/**
 * Build a Google News RSS URL for a specific region/query.
 * Falls back to a plain query search if region is not granular enough.
 */
function _buildGoogleNewsUrl(region) {
  const encoded = encodeURIComponent(region);
  return `https://news.google.com/rss/search?q=${encoded}&hl=en&gl=US&ceid=US:en`;
}

/**
 * Fetch region-specific news headlines using Google News RSS.
 * @param {string} region - Location/region name (e.g., "Paris, France")
 * @param {number} count  - Maximum number of headlines to return
 * @returns {Promise<{region: string, items: Array, error?: string}>}
 */
async function fetchRegionNews(region, count = 2) {
  if (!region || region.trim() === '') {
    return { region, items: [], error: 'No region specified' };
  }
  const trimmedRegion = region.trim();
  const url = _buildGoogleNewsUrl(trimmedRegion);
  const parser = new Parser({
    timeout: 10000,
    customFields: { item: ['media:content', 'media:thumbnail'] }
  });
  try {
    logger.info(logger.categories.SMART_MIRROR, `Fetching region news for "${trimmedRegion}" from Google News RSS`);
    const feed = await parser.parseURL(url);
    const items = feed.items.slice(0, count).map(item => ({
      title: item.title || 'Untitled',
      link: item.link || '',
      pubDate: item.pubDate || item.isoDate || '',
      source: item.creator || feed.title || 'Google News',
      description: item.contentSnippet || item.content || '',
      image: item['media:thumbnail']?.[0]?.$ || item['media:content']?.[0]?.$ || null
    }));
    logger.success(logger.categories.SMART_MIRROR, `Fetched ${items.length} region news items for "${trimmedRegion}"`);
    return { region: trimmedRegion, items };
  } catch (err) {
    logger.warning(logger.categories.SMART_MIRROR, `Failed to fetch region news for "${trimmedRegion}": ${err.message}`);
    return { region: trimmedRegion, items: [], error: err.message };
  }
}

/**
 * Fetch region-based news for upcoming vacation destinations.
 * Uses vacation dates that start within the configured days-in-advance window.
 * @param {Array}  vacationDates - Array of vacation date objects from house data
 * @param {object} newsConfig    - News widget configuration
 * @returns {Promise<{success: boolean, regions: Array}>}
 */
/**
 * Return an array of destination name strings from a vacation date object.
 * Supports both the new `destinations[]` array format and the legacy `destination` string.
 */
function _getVacationDestinationNames(vacation) {
  if (vacation.destinations && vacation.destinations.length > 0) {
    return vacation.destinations.map(d => d.name).filter(Boolean);
  }
  return vacation.destination ? [vacation.destination] : [];
}

async function fetchVacationRegionNews(vacationDates, newsConfig) {
  const daysInAdvance = newsConfig.vacationNewsDaysInAdvance ?? 7;
  const headlinesCount = newsConfig.vacationNewsHeadlinesCount ?? 2;
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysInAdvance * 24 * 60 * 60 * 1000);

  // Collect all distinct destination names within the window
  const destinations = new Set();
  for (const vacation of (vacationDates || [])) {
    const startDate = new Date(vacation.startDate);
    if (startDate >= now && startDate <= cutoff) {
      for (const d of _getVacationDestinationNames(vacation)) destinations.add(d);
    }
  }

  if (destinations.size === 0) {
    return { success: true, regions: [] };
  }

  const regions = [];
  for (const destination of destinations) {
    const result = await fetchRegionNews(destination, headlinesCount);
    regions.push(result);
  }

  return { success: true, regions };
}

/**
 * Fetch region-based news for upcoming calendar events that have a location.
 * Uses events that start within the configured days-in-advance window.
 * @param {Array}  calendarUrls - Array of ICS calendar URLs
 * @param {object} newsConfig   - News widget configuration
 * @returns {Promise<{success: boolean, regions: Array}>}
 */
async function fetchCalendarRegionNews(calendarUrls, newsConfig) {
  const daysInAdvance = newsConfig.calendarNewsDaysInAdvance ?? 2;
  const headlinesCount = newsConfig.calendarNewsHeadlinesCount ?? 2;
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysInAdvance * 24 * 60 * 60 * 1000);

  // Fetch calendar events
  const calendarResult = await fetchCalendarEvents(calendarUrls || []);
  const events = calendarResult.events || [];

  // Collect distinct locations for events in the window
  const locations = new Set();
  for (const event of events) {
    if (!event.location || !event.location.trim()) continue;
    const start = new Date(event.start);
    if (start >= now && start <= cutoff) {
      locations.add(event.location.trim());
    }
  }

  if (locations.size === 0) {
    return { success: true, regions: [] };
  }

  const regions = [];
  for (const location of locations) {
    const result = await fetchRegionNews(location, headlinesCount);
    regions.push(result);
  }

  return { success: true, regions };
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

// Fetch air quality data from OpenWeatherMap Air Pollution API
async function fetchAirQuality(apiKey, location, units = 'imperial') {
  logger.debug(logger.categories.SMART_MIRROR, 'Fetching air quality data');
  
  if (!apiKey || !location) {
    const errorMsg = 'API key and location are required for air quality';
    logger.warning(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
  
  try {
    // First, get coordinates for the location
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`;
    const geoResponse = await axios.get(geoUrl, { timeout: 10000 });
    
    if (!geoResponse.data || geoResponse.data.length === 0) {
      throw new Error('Location not found');
    }
    
    const { lat, lon, name, country } = geoResponse.data[0];
    
    // Fetch current air quality
    const currentAqUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;
    const currentResponse = await axios.get(currentAqUrl, { timeout: 10000 });
    const currentData = currentResponse.data.list[0];
    
    // Fetch air quality forecast (5 days)
    const forecastAqUrl = `https://api.openweathermap.org/data/2.5/air_pollution/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}`;
    const forecastResponse = await axios.get(forecastAqUrl, { timeout: 10000 });
    const forecastData = forecastResponse.data.list;
    
    // Get current weather for temperature check
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${units}`;
    const weatherResponse = await axios.get(weatherUrl, { timeout: 10000 });
    const currentTemp = Math.round(weatherResponse.data.main.temp);
    
    // Process current AQI
    const currentAqi = currentData.main.aqi;
    const currentComponents = currentData.components;
    
    // Get today and tomorrow's forecast (average of readings)
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    
    // Filter forecast data for today and tomorrow
    const todayData = forecastData.filter(item => {
      const itemDate = new Date(item.dt * 1000);
      return itemDate >= today && itemDate < tomorrow;
    });
    
    const tomorrowData = forecastData.filter(item => {
      const itemDate = new Date(item.dt * 1000);
      return itemDate >= tomorrow && itemDate < dayAfterTomorrow;
    });
    
    // Calculate average AQI for today and tomorrow
    const todayAqi = todayData.length > 0 
      ? Math.round(todayData.reduce((sum, item) => sum + item.main.aqi, 0) / todayData.length)
      : currentAqi;
    
    const tomorrowAqi = tomorrowData.length > 0
      ? Math.round(tomorrowData.reduce((sum, item) => sum + item.main.aqi, 0) / tomorrowData.length)
      : null;
    
    // AQI classification (1-5 scale from OpenWeatherMap)
    const getAqiLabel = (aqi) => {
      const labels = {
        1: 'Good',
        2: 'Fair',
        3: 'Moderate',
        4: 'Poor',
        5: 'Very Poor'
      };
      return labels[aqi] || 'Unknown';
    };
    
    const airQualityData = {
      location: name,
      country: country,
      coordinates: { lat, lon },
      current: {
        aqi: currentAqi,
        label: getAqiLabel(currentAqi),
        components: {
          co: currentComponents.co,
          no: currentComponents.no,
          no2: currentComponents.no2,
          o3: currentComponents.o3,
          so2: currentComponents.so2,
          pm2_5: currentComponents.pm2_5,
          pm10: currentComponents.pm10,
          nh3: currentComponents.nh3
        }
      },
      today: {
        aqi: todayAqi,
        label: getAqiLabel(todayAqi)
      },
      tomorrow: tomorrowAqi ? {
        aqi: tomorrowAqi,
        label: getAqiLabel(tomorrowAqi)
      } : null,
      currentTemp: currentTemp,
      units: units,
      // Determine if conditions are favorable (good AQI and temp <= 75°F or 24°C)
      isFavorable: currentAqi === 1 && (
        (units === 'imperial' && currentTemp <= 75) ||
        (units === 'metric' && currentTemp <= 24)
      )
    };
    
    logger.success(logger.categories.SMART_MIRROR, `Air quality data fetched successfully for ${name}`);
    return { success: true, data: airQualityData };
  } catch (err) {
    const errorMsg = `Failed to fetch air quality: ${err.response?.data?.message || err.message}`;
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
          condition: response.data.weather[0]?.main || 'Unknown',
          country: response.data.sys?.country || '',
          timezoneOffset: response.data.timezone,
          lat: response.data.coord?.lat,
          lon: response.data.coord?.lon
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

// Fetch destination weather by coordinates for drive-time events.
// Returns temp, weather icon code, UV index (if available), rain flag, and precip chance.
// Results are cached for 30 minutes.
async function fetchDestinationWeatherByCoords(lat, lon, weatherApiKey, units = 'imperial', eventDateStr = null) {
  if (!weatherApiKey) return null;

  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}:${eventDateStr || 'today'}`;
  const cached = driveTimeCache.weather[cacheKey];
  if (cached && (Date.now() - cached.timestamp) < DRIVE_TIME_WEATHER_TTL) {
    logger.debug(logger.categories.SMART_MIRROR, `Drive-time: using cached destination weather for ${cacheKey}`);
    return cached;
  }

  try {
    // Fetch current weather by coordinates
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=${units}`;
    const weatherResponse = await axios.get(weatherUrl, { timeout: 10000 });
    const wd = weatherResponse.data;

    const result = {
      temp: Math.round(wd.main.temp),
      icon: wd.weather[0]?.icon || '',
      condition: wd.weather[0]?.main || '',
      uvIndex: null,
      hasRain: false,
      precipChance: 0,
      units,
      timestamp: Date.now()
    };

    // Fetch UV index (OWM 2.5 UV endpoint, free tier)
    try {
      const uviUrl = `https://api.openweathermap.org/data/2.5/uvi?lat=${lat}&lon=${lon}&appid=${weatherApiKey}`;
      const uviResponse = await axios.get(uviUrl, { timeout: 8000 });
      if (typeof uviResponse.data?.value === 'number') {
        result.uvIndex = Math.round(uviResponse.data.value * 10) / 10;
      }
    } catch (uviErr) {
      // UV index is best-effort; log at debug level and continue without it
      logger.debug(logger.categories.SMART_MIRROR, `Drive-time: UV index unavailable for ${lat},${lon}: ${uviErr.message}`);
    }

    // Check forecast for rain on the event date (or today if no date given)
    try {
      const targetDate = eventDateStr || new Date().toISOString().split('T')[0];
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${weatherApiKey}&units=${units}&cnt=40`;
      const forecastResponse = await axios.get(forecastUrl, { timeout: 10000 });
      const forecastItems = forecastResponse.data?.list || [];

      const dayItems = forecastItems.filter(item => {
        const itemDate = new Date(item.dt * 1000).toISOString().split('T')[0];
        return itemDate === targetDate;
      });

      if (dayItems.length > 0) {
        const maxPop = Math.max(...dayItems.map(item => item.pop || 0));
        result.precipChance = Math.round(maxPop * 100);
        const rainConditions = ['Rain', 'Drizzle', 'Thunderstorm'];
        result.hasRain = dayItems.some(item =>
          rainConditions.includes(item.weather[0]?.main) || (item.pop || 0) >= 0.4
        );
        // Also update icon/condition using a midday slot for the event day
        const middayItem = dayItems[Math.floor(dayItems.length / 2)] || dayItems[0];
        result.icon = middayItem.weather[0]?.icon || result.icon;
        result.condition = middayItem.weather[0]?.main || result.condition;
      }
    } catch (forecastErr) {
      logger.debug(logger.categories.SMART_MIRROR, `Drive-time: rain forecast unavailable for ${lat},${lon}: ${forecastErr.message}`);
    }

    driveTimeCache.weather[cacheKey] = result;
    logger.debug(logger.categories.SMART_MIRROR,
      `Drive-time: destination weather ${lat},${lon} → ${result.temp}°, rain:${result.hasRain}, UV:${result.uvIndex}`);
    return result;
  } catch (err) {
    logger.debug(logger.categories.SMART_MIRROR, `Drive-time: destination weather fetch failed for ${lat},${lon}: ${err.message}`);
    return null;
  }
}

// Geocode an address using TomTom Search API
// Results are cached for 24 hours to minimise API usage
async function geocodeAddressTomTom(address, apiKey) {
  const normalizedKey = address.toLowerCase().trim();
  const cached = driveTimeCache.geocode[normalizedKey];
  if (cached && (Date.now() - cached.timestamp) < DRIVE_TIME_GEOCODE_TTL) {
    logger.debug(logger.categories.SMART_MIRROR, `Drive-time: using cached geocode for "${address}"`);
    return cached;
  }

  const encodedAddress = encodeURIComponent(address);
  const url = `https://api.tomtom.com/search/2/geocode/${encodedAddress}.json?key=${apiKey}&limit=1`;
  logger.debug(logger.categories.SMART_MIRROR, `Drive-time: geocoding address "${address}"`);

  const response = await axios.get(url, { timeout: 10000 });
  const results = response.data?.results;
  if (!results || results.length === 0) {
    logger.debug(logger.categories.SMART_MIRROR, `Drive-time: no geocode results for "${address}"`);
    return null;
  }

  const { lat, lon } = results[0].position;
  const result = { lat, lon, timestamp: Date.now() };
  driveTimeCache.geocode[normalizedKey] = result;
  logger.debug(logger.categories.SMART_MIRROR, `Drive-time: geocoded "${address}" → ${lat}, ${lon}`);
  return result;
}

// Get route information using TomTom Routing API with live or forecasted traffic.
// Pass an ISO 8601 local datetime string (YYYY-MM-DDThh:mm:ss) as departAt to request
// forecasted traffic conditions; omit it (or pass null) for live traffic.
// Results are cached for 30 minutes to balance freshness and API usage.
async function getRouteTomTom(originLat, originLon, destLat, destLon, apiKey, departAt = null) {
  const cacheKey = `${originLat.toFixed(5)},${originLon.toFixed(5)}:${destLat.toFixed(5)},${destLon.toFixed(5)}${departAt ? `:${departAt}` : ''}`;
  const cached = driveTimeCache.routes[cacheKey];
  if (cached && (Date.now() - cached.timestamp) < DRIVE_TIME_ROUTE_TTL) {
    logger.debug(logger.categories.SMART_MIRROR, `Drive-time: using cached route for ${cacheKey}`);
    return cached;
  }

  let url = `https://api.tomtom.com/routing/1/calculateRoute/${originLat},${originLon}:${destLat},${destLon}/json?key=${apiKey}&traffic=true`;
  if (departAt) {
    url += `&departAt=${encodeURIComponent(departAt)}`;
  }
  logger.debug(logger.categories.SMART_MIRROR, `Drive-time: fetching route ${originLat},${originLon} → ${destLat},${destLon}${departAt ? ` (departAt ${departAt})` : ''}`);

  const response = await axios.get(url, { timeout: 15000 });
  const routes = response.data?.routes;
  if (!routes || routes.length === 0) {
    logger.debug(logger.categories.SMART_MIRROR, 'Drive-time: no routes returned from TomTom API');
    return null;
  }

  const summary = routes[0].summary;
  const result = {
    travelTimeSeconds: summary.travelTimeInSeconds,
    trafficDelaySeconds: summary.trafficDelayInSeconds || 0,
    timestamp: Date.now()
  };
  driveTimeCache.routes[cacheKey] = result;
  logger.debug(logger.categories.SMART_MIRROR,
    `Drive-time: route fetched: ${Math.round(result.travelTimeSeconds / 60)} min travel, ${Math.round(result.trafficDelaySeconds / 60)} min delay`);
  return result;
}

// Fetch drive times for calendar events in the next two days using TomTom API.
// Optionally enriches each event with destination weather when weatherApiKey is provided.
async function fetchDriveTimes(calendarUrls, tomtomApiKey, homeAddress, weatherApiKey = null, units = 'imperial') {
  if (!tomtomApiKey || !homeAddress) {
    const missing = !tomtomApiKey ? 'TomTom API key' : 'home address';
    logger.warning(logger.categories.SMART_MIRROR, `Drive-time: ${missing} not configured`);
    return { success: false, error: `${missing} not configured`, events: [] };
  }

  if (!calendarUrls || calendarUrls.length === 0) {
    logger.debug(logger.categories.SMART_MIRROR, 'Drive-time: no calendar URLs configured');
    return { success: true, events: [] };
  }

  // Fetch calendar events (uses existing cache)
  const calendarResult = await fetchCalendarEvents(calendarUrls);
  if (!calendarResult.success) {
    logger.warning(logger.categories.SMART_MIRROR, `Drive-time: calendar fetch failed - ${calendarResult.error}`);
    return { success: false, error: 'Could not fetch calendar events', events: [] };
  }

  // Filter to events in the next 2 days that have a location field
  const now = new Date();
  const twoDaysEnd = new Date(now);
  twoDaysEnd.setDate(twoDaysEnd.getDate() + 2);
  twoDaysEnd.setHours(23, 59, 59, 999);

  const eventsWithLocation = (calendarResult.events || [])
    .filter(event => {
      const start = new Date(event.start);
      return start >= now && start <= twoDaysEnd && event.location && event.location.trim();
    })
    .slice(0, 5); // Cap at 5 to limit API calls

  if (eventsWithLocation.length === 0) {
    logger.debug(logger.categories.SMART_MIRROR, 'Drive-time: no events with locations found in the next 2 days');
    return { success: true, events: [] };
  }

  // Geocode the home address (cached for 24 hours)
  let homeCoords;
  try {
    homeCoords = await geocodeAddressTomTom(homeAddress, tomtomApiKey);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Drive-time: failed to geocode home address: ${err.message}`);
    return { success: false, error: `Could not geocode home address: ${err.message}`, events: [] };
  }

  if (!homeCoords) {
    return { success: false, error: 'Home address location could not be found', events: [] };
  }

  const eventsWithDriveTimes = [];

  for (const event of eventsWithLocation) {
    try {
      const destCoords = await geocodeAddressTomTom(event.location, tomtomApiKey);
      if (!destCoords) {
        logger.debug(logger.categories.SMART_MIRROR, `Drive-time: skipping "${event.title}" – location not geocodable`);
        continue;
      }

      const startDate = new Date(event.start);
      // For future events, request forecasted traffic at departure time; fall back to
      // live traffic if the event time has already passed.
      // TomTom's departAt parameter expects a timezone-naive ISO 8601 string
      // (YYYY-MM-DDThh:mm:ss). We use the UTC representation of the event time,
      // which is adequate for routing forecasts when exact local timezone is
      // unavailable from the calendar data.
      const departAt = startDate > now ? startDate.toISOString().substring(0, 19) : null;

      const routeInfo = await getRouteTomTom(
        homeCoords.lat, homeCoords.lon,
        destCoords.lat, destCoords.lon,
        tomtomApiKey,
        departAt
      );

      if (routeInfo) {
        // Calculate daysFromNow using calendar day boundaries (midnight-to-midnight)
        // so "Today" covers the whole current day and "Tomorrow" covers the next full day.
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const startOfEventDay = new Date(startDate);
        startOfEventDay.setHours(0, 0, 0, 0);
        const daysFromNow = Math.round((startOfEventDay - startOfToday) / (1000 * 60 * 60 * 24));
        const travelMinutes = Math.round(routeInfo.travelTimeSeconds / 60);
        const delayMinutes = Math.round(routeInfo.trafficDelaySeconds / 60);

        // Fetch destination weather when a weather API key is available
        const eventDateStr = startDate.toISOString().split('T')[0];
        const destWeather = weatherApiKey
          ? await fetchDestinationWeatherByCoords(destCoords.lat, destCoords.lon, weatherApiKey, units, eventDateStr)
          : null;

        eventsWithDriveTimes.push({
          title: event.title || 'Event',
          location: event.location,
          startTime: event.start,
          daysFromNow,
          travelTimeMinutes: travelMinutes,
          trafficDelayMinutes: delayMinutes,
          hasTrafficDelay: routeInfo.trafficDelaySeconds > NOTABLE_TRAFFIC_DELAY_SECONDS,
          weather: destWeather
        });

        logger.debug(logger.categories.SMART_MIRROR,
          `Drive-time: "${event.title}" → ${travelMinutes} min travel, ${delayMinutes} min delay`);
      }
    } catch (err) {
      logger.warning(logger.categories.SMART_MIRROR,
        `Drive-time: error calculating route for "${event.title}": ${err.message}`);
    }
  }

  logger.success(logger.categories.SMART_MIRROR,
    `Drive-time: calculated times for ${eventsWithDriveTimes.length} event(s)`);

  return {
    success: true,
    events: eventsWithDriveTimes,
    homeAddress
  };
}

// Test TomTom API connectivity using a simple geocode request
async function testTomTomConnection(apiKey) {
  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  try {
    const testAddress = encodeURIComponent('New York, NY, USA');
    const url = `https://api.tomtom.com/search/2/geocode/${testAddress}.json?key=${apiKey}&limit=1`;
    logger.info(logger.categories.SMART_MIRROR, 'Testing TomTom API connection');

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data?.results?.length > 0) {
      const sample = response.data.results[0].address?.freeformAddress || 'OK';
      logger.success(logger.categories.SMART_MIRROR, 'TomTom API connection successful');
      return { success: true, message: 'TomTom API connection successful', sampleResult: sample };
    }

    return { success: false, error: 'No results returned – check API key validity' };
  } catch (err) {
    const status = err.response?.status;
    let errorMessage = err.message;
    if (status === 403) {
      errorMessage = 'Invalid API key or access denied (403)';
    } else if (status === 429) {
      errorMessage = 'API quota exceeded (429)';
    }
    logger.error(logger.categories.SMART_MIRROR, `TomTom API test failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// Search Home Assistant entities that look like battery sensors
// Returns a list of candidate entities matching the keyword
async function searchHomeAssistantBatteryEntities(haUrl, haToken, keyword) {
  if (!haUrl || !haToken) {
    return { success: false, error: 'Home Assistant URL and token are required' };
  }

  try {
    const baseUrl = haUrl.replace(/\/$/, '');
    const response = await axios.get(`${baseUrl}/api/states`, {
      ...HOME_ASSISTANT_AXIOS_CONFIG,
      headers: {
        ...HOME_ASSISTANT_AXIOS_CONFIG.headers,
        'Authorization': `Bearer ${haToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const allStates = response.data || [];
    const kw = (keyword || '').toLowerCase().trim();

    // Filter entities that are battery-related:
    // - device_class === 'battery' (numeric level)
    // - device_class === 'battery_charging' (binary_sensor)
    // - entity_id or friendly_name contains "battery"
    const batteryEntities = allStates.filter(entity => {
      const attrs = entity.attributes || {};
      const deviceClass = (attrs.device_class || '').toLowerCase();
      const entityId = (entity.entity_id || '').toLowerCase();
      const friendlyName = (attrs.friendly_name || '').toLowerCase();

      const isBattery = deviceClass === 'battery' ||
                        deviceClass === 'battery_charging' ||
                        entityId.includes('battery') ||
                        friendlyName.includes('battery') ||
                        entityId.includes('charging');

      if (!isBattery) return false;
      if (!kw) return true;
      return entityId.includes(kw) || friendlyName.includes(kw);
    }).map(entity => ({
      entityId: entity.entity_id,
      friendlyName: entity.attributes?.friendly_name || entity.entity_id,
      state: entity.state,
      deviceClass: entity.attributes?.device_class || null,
      unitOfMeasurement: entity.attributes?.unit_of_measurement || null
    }));

    return { success: true, entities: batteryEntities };
  } catch (err) {
    const errorMsg = `Failed to search Home Assistant entities: ${err.message}`;
    logger.error(logger.categories.SMART_MIRROR, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Fetch battery & charging state for all tracked devices in the battery sub-widget
// trackedDevices: array of { entityId, groupName, friendlyName, lowBatteryThreshold, showWhenCharging, showWhenFull, showWhenLow, chargingEntityId }
// groupName: explicit admin-set device group name (highest priority for display)
// friendlyName: legacy fallback (used only when HA entity name is unavailable)
// When the HA entity is reachable its attrs.friendly_name is auto-used unless groupName overrides it.
async function fetchHomeAssistantBatteryDevices(haUrl, haToken, trackedDevices) {
  if (!haUrl || !haToken || !trackedDevices || trackedDevices.length === 0) {
    return { success: false, error: 'Home Assistant URL, token, and tracked devices are required' };
  }

  try {
    const baseUrl = haUrl.replace(/\/$/, '');

    // Collect all entity IDs we need to fetch (battery + optional charging sensors)
    const entityIdsNeeded = new Set();
    trackedDevices.forEach(device => {
      if (device.entityId) entityIdsNeeded.add(device.entityId);
      if (device.chargingEntityId) entityIdsNeeded.add(device.chargingEntityId);
    });

    // Fetch all states at once for efficiency
    const response = await axios.get(`${baseUrl}/api/states`, {
      ...HOME_ASSISTANT_AXIOS_CONFIG,
      headers: {
        ...HOME_ASSISTANT_AXIOS_CONFIG.headers,
        'Authorization': `Bearer ${haToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const allStates = response.data || [];
    const stateMap = {};
    allStates.forEach(entity => {
      stateMap[entity.entity_id] = entity;
    });

    const devices = trackedDevices.map(device => {
      const entityState = stateMap[device.entityId];
      if (!entityState) {
        return {
          entityId: device.entityId,
          friendlyName: device.groupName || device.friendlyName || device.entityId,
          available: false,
          batteryLevel: null,
          isCharging: false,
          isFull: false,
          isLow: false,
          state: 'unavailable',
          lastUpdated: null,
          connectionError: 'Entity not found in Home Assistant',
          lowBatteryThreshold: device.lowBatteryThreshold || 25,
          showWhenCharging: device.showWhenCharging !== false,
          showWhenFull: device.showWhenFull !== false,
          showWhenLow: device.showWhenLow !== false
        };
      }

      const attrs = entityState.attributes || {};
      const rawState = entityState.state;
      const lastUpdated = entityState.last_updated || null;
      const deviceClass = (attrs.device_class || '').toLowerCase();

      // Treat HA 'unavailable' or 'unknown' states as connection errors
      if (rawState === 'unavailable' || rawState === 'unknown') {
        return {
          entityId: device.entityId,
          friendlyName: device.groupName || attrs.friendly_name || device.friendlyName || device.entityId,
          available: false,
          batteryLevel: null,
          isCharging: false,
          isFull: false,
          isLow: false,
          state: rawState,
          lastUpdated,
          connectionError: 'Device may be offline or unreachable',
          lowBatteryThreshold: device.lowBatteryThreshold || 25,
          showWhenCharging: device.showWhenCharging !== false,
          showWhenFull: device.showWhenFull !== false,
          showWhenLow: device.showWhenLow !== false
        };
      }

      // Determine battery level
      let batteryLevel = null;
      if (deviceClass === 'battery' || attrs.unit_of_measurement === '%') {
        const parsed = parseFloat(rawState);
        if (!isNaN(parsed)) batteryLevel = Math.round(parsed);
      } else if (deviceClass !== 'battery_charging') {
        // Try numeric parse as a fallback
        const parsed = parseFloat(rawState);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) batteryLevel = Math.round(parsed);
      }

      // Determine charging state
      let isCharging = false;
      if (device.chargingEntityId && stateMap[device.chargingEntityId]) {
        const chargingState = stateMap[device.chargingEntityId].state;
        isCharging = chargingState === 'on' || chargingState === 'true' || chargingState === 'charging';
      } else if (deviceClass === 'battery_charging') {
        isCharging = rawState === 'on' || rawState === 'true';
        batteryLevel = null; // This entity is a charging indicator, not a level
      } else if (typeof attrs.battery_charging === 'boolean') {
        isCharging = attrs.battery_charging;
      } else if (attrs.charging === true || attrs.battery_state === 'Charging') {
        isCharging = true;
      }

      const lowBatteryThreshold = device.lowBatteryThreshold ?? 25;
      const isFull = batteryLevel !== null && batteryLevel >= 100 && !isCharging;
      const isLow = batteryLevel !== null && batteryLevel <= lowBatteryThreshold && !isCharging;

      // Determine display state
      let displayState = 'normal';
      if (isCharging && batteryLevel !== null && batteryLevel >= 100) {
        displayState = 'full';
      } else if (isCharging) {
        displayState = 'charging';
      } else if (isFull) {
        displayState = 'full';
      } else if (isLow) {
        displayState = 'low';
      }

      return {
        entityId: device.entityId,
        // groupName (admin override) takes highest priority; otherwise auto-use the HA
        // friendly_name so that name changes in Home Assistant are reflected immediately.
        // Fall back to the legacy stored friendlyName, then the raw entity ID.
        friendlyName: device.groupName || attrs.friendly_name || device.friendlyName || device.entityId,
        available: true,
        batteryLevel,
        isCharging,
        isFull: displayState === 'full',
        isLow,
        state: displayState,
        lastUpdated,
        connectionError: null,
        lowBatteryThreshold,
        showWhenCharging: device.showWhenCharging !== false,
        showWhenFull: device.showWhenFull !== false,
        showWhenLow: device.showWhenLow !== false
      };
    });

    // Only include devices that are available and match at least one display scenario
    const visibleDevices = devices.filter(d => {
      if (!d.available) return false;
      if (d.state === 'charging' && d.showWhenCharging) return true;
      if (d.state === 'full' && d.showWhenFull) return true;
      if (d.state === 'low' && d.showWhenLow) return true;
      return false;
    });

    logger.info(logger.categories.SMART_MIRROR, `Battery sub-widget: ${visibleDevices.length} of ${trackedDevices.length} devices visible`);

    // Log a warning for any devices with connection errors so they are discoverable
    const errorDevices = devices.filter(d => d.connectionError);
    if (errorDevices.length > 0) {
      errorDevices.forEach(d => {
        logger.warning(logger.categories.SMART_MIRROR, `Battery sub-widget connection issue — ${d.connectionError}`);
      });
    }

    return {
      success: true,
      devices,
      visibleDevices
    };
  } catch (err) {
    const errorMsg = `Failed to fetch Home Assistant battery devices: ${err.message}`;
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
  fetchRegionNews,
  fetchVacationRegionNews,
  fetchCalendarRegionNews,
  fetchWeather,
  fetchForecast,
  fetchWeatherForDate,
  fetchAirQuality,
  fetchHomeAssistantMedia,
  searchHomeAssistantBatteryEntities,
  fetchHomeAssistantBatteryDevices,
  fetchLocationTimezone,
  fetchDriveTimes,
  testWeatherConnection,
  testCalendarFeed,
  testNewsFeed,
  testHomeAssistantMedia,
  testTomTomConnection,
  // Export constants for use in other modules
  CACHE_MIN_INTERVAL_MS,
  DEFAULT_CALENDAR_CACHE_TTL,
  CALENDAR_CACHE_BACKOFF_MS,
  DEFAULT_HA_REFRESH_INTERVAL_MS
};
