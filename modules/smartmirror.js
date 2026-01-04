const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');
const axios = require('axios');
const Parser = require('rss-parser');
const ical = require('node-ical');

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
      days: 5
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
    news: { x: 2, y: 2, width: 2, height: 2 }
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
    forecast: { x: 0, y: 3, width: 8, height: 1 }
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
    refreshInterval: 60000 // 1 minute
  };
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
    if (configToSave.widgets.weather) {
      if (!configToSave.widgets.weather.apiKey && existingConfig.widgets?.weather?.apiKey) {
        logger.info(logger.categories.SMART_MIRROR, 'Preserving existing weather API key');
        configToSave.widgets.weather.apiKey = existingConfig.widgets.weather.apiKey;
      }
    }
    if (configToSave.widgets.forecast) {
      if (!configToSave.widgets.forecast.apiKey && existingConfig.widgets?.forecast?.apiKey) {
        logger.info(logger.categories.SMART_MIRROR, 'Preserving existing forecast API key');
        configToSave.widgets.forecast.apiKey = existingConfig.widgets.forecast.apiKey;
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

// Fetch calendar events from ICS feed
async function fetchCalendarEvents(calendarUrls) {
  logger.debug(logger.categories.SMART_MIRROR, `Fetching calendar events from ${calendarUrls.length} feeds`);
  
  if (!calendarUrls || calendarUrls.length === 0) {
    logger.warning(logger.categories.SMART_MIRROR, 'No calendar URLs configured');
    return { success: false, error: 'No calendar URLs configured', events: [] };
  }
  
  const allEvents = [];
  const errors = [];
  
  for (let url of calendarUrls) {
    if (!url || url.trim() === '') continue;
    
    // Convert webcal:// to https:// for Apple Calendar feeds
    url = url.trim().replace(/^webcal:\/\//i, 'https://');
    
    try {
      logger.info(logger.categories.SMART_MIRROR, `Fetching calendar from: ${url}`);
      const response = await axios.get(url, { timeout: 10000 });
      const events = await ical.async.parseICS(response.data);
      
      // Process events
      const now = new Date();
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
          if (startDate && startDate > now) {
            const daysFromNow = Math.floor((startDate - now) / (1000 * 60 * 60 * 24));
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
      logger.success(logger.categories.SMART_MIRROR, `Fetched ${upcomingEvents.length} upcoming events from calendar`);
    } catch (err) {
      const errorMsg = `Failed to fetch calendar from ${url}: ${err.message}`;
      logger.error(logger.categories.SMART_MIRROR, errorMsg);
      errors.push(errorMsg);
    }
  }
  
  // Sort events by start date
  allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  
  // Limit to 10 most recent events
  const limitedEvents = allEvents.slice(0, 10);
  
  return {
    success: true,
    events: limitedEvents,
    errors: errors.length > 0 ? errors : null
  };
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

module.exports = {
  init,
  loadConfig,
  saveConfig,
  getPublicConfig,
  getDefaultConfig,
  fetchCalendarEvents,
  fetchNews,
  fetchWeather,
  fetchForecast
};
