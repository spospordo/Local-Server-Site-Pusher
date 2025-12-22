const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { execSync } = require('child_process');
const axios = require('axios');
const logger = require('./modules/logger');
const vidiots = require('./modules/vidiots');
const espresso = require('./modules/espresso');
const githubUpload = require('./modules/github-upload');
const finance = require('./modules/finance');
const OllamaIntegration = require('./modules/ollama');
const magicMirror = require('./modules/magicmirror');
const backup = require('./modules/backup');

const app = express();
const configDir = path.join(__dirname, 'config');
const configPath = path.join(configDir, 'config.json');
const clientPasswordPath = path.join(configDir, '.client_auth');
const uploadsDir = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Client password encryption utilities
const SALT_ROUNDS = 12;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, SALT_ROUNDS * 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function validatePasswordSecurity(password) {
  // Check for potentially dangerous characters that could cause issues
  // Null bytes and control characters can cause security issues
  if (password.includes('\0')) {
    return { valid: false, reason: 'Password cannot contain null characters' };
  }
  
  // Check for other control characters (ASCII 0-31 except tab, newline, carriage return)
  const dangerousChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
  if (dangerousChars.test(password)) {
    return { valid: false, reason: 'Password contains invalid control characters' };
  }
  
  return { valid: true };
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false;
  const [salt, hash] = storedPassword.split(':');
  if (!salt || !hash) return false;
  const verifyHash = crypto.pbkdf2Sync(password, salt, SALT_ROUNDS * 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

function saveClientPasswordHash(passwordHash) {
  try {
    fs.writeFileSync(clientPasswordPath, passwordHash, { mode: 0o600 });
    return { success: true };
  } catch (err) {
    console.warn('Cannot write client password file:', err.message);
    return { success: false, error: err.message, code: err.code };
  }
}

function loadClientPasswordHash() {
  try {
    if (fs.existsSync(clientPasswordPath)) {
      return fs.readFileSync(clientPasswordPath, 'utf8').trim();
    }
    return null;
  } catch (err) {
    console.warn('Cannot read client password file:', err.message);
    return null;
  }
}

function deleteClientPasswordHash() {
  try {
    if (fs.existsSync(clientPasswordPath)) {
      fs.unlinkSync(clientPasswordPath);
    }
    return true;
  } catch (err) {
    console.warn('Cannot delete client password file:', err.message);
    return false;
  }
}

// File upload utilities
function parseFileSize(sizeStr) {
  const units = { 'B': 1, 'KB': 1024, 'MB': 1024*1024, 'GB': 1024*1024*1024 };
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([A-Z]*B?)$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase() || 'B';
  return value * (units[unit] || 1);
}

function getFileTypeFromMime(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
  return 'other';
}

function ensureClientUploadDir(deviceId) {
  const clientDir = path.join(uploadsDir, deviceId);
  if (!fs.existsSync(clientDir)) {
    fs.mkdirSync(clientDir, { recursive: true });
  }
  return clientDir;
}

// Multer configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Use a temporary directory first, we'll move it later
    const tempDir = path.join(uploadsDir, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, basename + '-' + uniqueSuffix + ext);
  }
});

// Multer configuration (will be initialized after config is loaded)
let upload;

// File metadata management
function getClientFilesMetadata(deviceId) {
  const metadataPath = path.join(uploadsDir, deviceId, '.metadata.json');
  try {
    if (fs.existsSync(metadataPath)) {
      return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    }
  } catch (err) {
    console.warn('Error reading file metadata:', err.message);
  }
  return { files: {} };
}

function saveClientFilesMetadata(deviceId, metadata) {
  const metadataPath = path.join(uploadsDir, deviceId, '.metadata.json');
  try {
    ensureClientUploadDir(deviceId);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    return true;
  } catch (err) {
    console.warn('Error saving file metadata:', err.message);
    return false;
  }
}

function addFileMetadata(deviceId, filename, fileInfo) {
  const metadata = getClientFilesMetadata(deviceId);
  metadata.files[filename] = {
    originalName: fileInfo.originalName,
    size: fileInfo.size,
    mimeType: fileInfo.mimeType,
    uploadDate: new Date().toISOString(),
    sharing: fileInfo.sharing || 'none' // none, admin, all
  };
  return saveClientFilesMetadata(deviceId, metadata);
}

function updateFileSharing(deviceId, filename, sharing) {
  const metadata = getClientFilesMetadata(deviceId);
  if (metadata.files[filename]) {
    metadata.files[filename].sharing = sharing;
    return saveClientFilesMetadata(deviceId, metadata);
  }
  return false;
}

function removeFileMetadata(deviceId, filename) {
  const metadata = getClientFilesMetadata(deviceId);
  if (metadata.files[filename]) {
    delete metadata.files[filename];
    return saveClientFilesMetadata(deviceId, metadata);
  }
  return false;
}

// Home Assistant Media Streaming Integration
async function getHomeAssistantMediaPlayers() {
  try {
    const haConfig = config.homeAssistant;
    
    if (!haConfig.enabled || !haConfig.url || !haConfig.token) {
      return { success: false, error: 'Home Assistant not properly configured' };
    }

    // Validate and normalize URL
    const urlValidation = validateHomeAssistantUrl(haConfig.url);
    if (!urlValidation.valid) {
      return { success: false, error: urlValidation.error };
    }

    const response = await axios.get(`${haConfig.url}/api/states`, {
      headers: {
        'Authorization': `Bearer ${haConfig.token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const mediaPlayers = response.data
      .filter(entity => entity.entity_id.startsWith('media_player.'))
      .filter(entity => {
        // Filter based on include/exclude configuration
        const deviceConfig = haConfig.mediaPlayers;
        const entityId = entity.entity_id;
        
        // Check exclude devices list (skip if excludeDevices is undefined or empty)
        const excludeDevices = deviceConfig.excludeDevices || [];
        if (excludeDevices.length > 0 && excludeDevices.includes(entityId)) {
          return false;
        }
        
        // Check include devices list (skip if includeDevices is undefined or empty)
        const includeDevices = deviceConfig.includeDevices || [];
        if (includeDevices.length > 0 && !includeDevices.includes(entityId)) {
          return false;
        }
        
        return true;
      })
      .map(entity => ({
        entity_id: entity.entity_id,
        state: entity.state,
        friendly_name: entity.attributes.friendly_name || entity.entity_id.replace('media_player.', ''),
        media_title: entity.attributes.media_title || null,
        media_artist: entity.attributes.media_artist || null,
        media_album_name: entity.attributes.media_album_name || null,
        media_content_type: entity.attributes.media_content_type || null,
        media_duration: entity.attributes.media_duration || null,
        media_position: entity.attributes.media_position || null,
        media_position_updated_at: entity.attributes.media_position_updated_at || null,
        volume_level: entity.attributes.volume_level || null,
        entity_picture: entity.attributes.entity_picture || null,
        source: entity.attributes.source || null,
        supported_features: entity.attributes.supported_features || 0,
        last_updated: entity.last_updated
      }))
      .filter(player => player.state !== 'unavailable' && player.state !== 'unknown');

    return { success: true, players: mediaPlayers };
  } catch (error) {
    console.error('Error fetching Home Assistant media players:', error.message);
    return { 
      success: false, 
      error: formatHomeAssistantError(error, config.homeAssistant.url)
    };
  }
}

// URL validation helper
function validateHomeAssistantUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Home Assistant URL is required' };
  }

  try {
    const parsedUrl = new URL(url);
    
    // Check for .local domains which often cause DNS issues
    if (parsedUrl.hostname.endsWith('.local')) {
      return { 
        valid: false, 
        error: 'Cannot resolve .local domains (mDNS). Please use the IP address instead (e.g., http://192.168.1.100:8123). You can find your Home Assistant IP in your router settings or Home Assistant network configuration.' 
      };
    }

    // Validate protocol
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { 
        valid: false, 
        error: 'URL must use http:// or https:// protocol' 
      };
    }

    // Check for localhost in server environments
    if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
      return {
        valid: false,
        error: 'localhost/127.0.0.1 may not work in containerized environments. Please use your device\'s network IP address instead (e.g., http://192.168.1.100:8123)'
      };
    }

    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: `Invalid URL format: ${error.message}` 
    };
  }
}

// Error formatting helper
function formatHomeAssistantError(error, url) {
  const hostname = url ? new URL(url).hostname : 'unknown';
  
  if (error.code === 'ENOTFOUND' || error.code === 'EAI_NONAME') {
    if (hostname.endsWith('.local')) {
      return `Cannot resolve ${hostname} (.local domains use mDNS which may not work here). Please use your Home Assistant IP address instead (e.g., http://192.168.1.100:8123)`;
    }
    return `Cannot resolve hostname ${hostname}. Please verify the address is correct and accessible from this server`;
  }
  
  if (error.code === 'ECONNREFUSED') {
    return `Connection refused to ${hostname}. Please verify Home Assistant is running and accessible on the specified port`;
  }
  
  if (error.code === 'ETIMEDOUT' || error.code === 'ETIMEOUT') {
    return `Connection timeout to ${hostname}. Please verify the address is correct and Home Assistant is accessible from this server`;
  }
  
  // Handle axios timeout errors
  if (error.message && error.message.includes('timeout') && error.message.includes('exceeded')) {
    return `Connection timeout to ${hostname}. Please verify the address is correct and Home Assistant is accessible from this server`;
  }
  
  if (error.code === 'ECONNRESET') {
    return `Connection reset by ${hostname}. Please verify the URL is correct and Home Assistant is running`;
  }

  if (error.response && error.response.status === 401) {
    return 'Authentication failed. Please verify your Home Assistant access token is correct and has not expired';
  }

  if (error.response && error.response.status === 403) {
    return 'Access forbidden. Please verify your Home Assistant access token has the required permissions';
  }

  if (error.response && error.response.status === 404) {
    return 'Home Assistant API endpoint not found. Please verify the URL is correct and includes the port number (e.g., :8123)';
  }

  return error.message || 'Unknown connection error';
}

function formatMediaStreamingData(players) {
  if (!players || players.length === 0) {
    return {
      hasActiveMedia: false,
      totalDevices: 0,
      activeDevices: 0,
      players: []
    };
  }

  const activeStates = ['playing', 'paused'];
  const activePlayers = players.filter(player => activeStates.includes(player.state));
  
  return {
    hasActiveMedia: activePlayers.length > 0,
    totalDevices: players.length,
    activeDevices: activePlayers.length,
    players: players.map(player => ({
      ...player,
      isActive: activeStates.includes(player.state),
      displayText: player.media_title ? 
        `${player.media_title}${player.media_artist ? ` - ${player.media_artist}` : ''}` : 
        player.friendly_name,
      deviceType: getDeviceTypeFromEntityId(player.entity_id)
    }))
  };
}

function getDeviceTypeFromEntityId(entityId) {
  const id = entityId.toLowerCase();
  if (id.includes('apple_tv') || id.includes('appletv')) return 'Apple TV';
  if (id.includes('apple') || id.includes('iphone') || id.includes('ipad')) return 'Apple Device';
  if (id.includes('speaker') || id.includes('sonos') || id.includes('echo')) return 'Wireless Speaker';
  if (id.includes('spotify')) return 'Spotify';
  if (id.includes('cast') || id.includes('chromecast')) return 'Chromecast';
  return 'Media Player';
}

// Default configuration
const defaultConfig = {
  "server": {
    "port": 3000,
    "admin": {
      "username": "admin",
      "password": "admin123"
    }
  },
  "homeAssistant": {
    "enabled": true,
    "url": "http://localhost:8123",
    "token": "",
    "mediaPlayers": {
      "enabled": true,
      "refreshInterval": 5000,
      "includeDevices": [],
      "excludeDevices": []
    }
  },
  "cockpit": {
    "enabled": true,
    "url": "http://localhost:9090"
  },
  "webContent": {
    "directory": "./public",
    "defaultFile": "index.html"
  },
  "storage": {
    "maxTotalSize": "1GB",
    "maxFileSizes": {
      "image": "50MB",
      "video": "500MB",
      "document": "100MB",
      "other": "10MB"
    }
  },
  "usefulLinks": [],
  "client": {
    "enabled": true,
    "requirePassword": false,
    "showServerStatus": true,
    "showUsefulLinks": true,
    "welcomeMessage": "Welcome to Local Server Site Pusher"
  },
  "connectedDevices": [],
  "drinkMixer": {
    "alcohols": [],
    "mixers": [],
    "recipes": []
  },
  "vidiots": {
    "enabled": false,
    "outputFile": "./public/vidiots/index.html",
    "posterDirectory": "./public/vidiots/posters",
    "posterBaseUrl": "/vidiots/posters/",
    "cronSchedule": "0 6,12 * * *",
    "forceUpdate": false,
    "maxAgeHours": 24,
    "githubPages": {
      "enabled": false,
      "repoOwner": "",
      "repoName": "",
      "branch": "main",
      "repoLocalPath": "",
      "accessToken": "",
      "commitMessage": "Automated vidiots update"
    }
  },
  "espresso": {
    "enabled": false,
    "dataFilePath": "./config/espresso-data.json",
    "templatePath": "",
    "outputPath": "./public/espresso/index.html",
    "imagePaths": {},
    "localRepo": {
      "enabled": false,
      "outputPath": "espresso/index.html",
      "imagePath": "espresso/images"
    },
    "githubPages": {
      "enabled": false,
      "repoOwner": "",
      "repoName": "",
      "branch": "main",
      "repoLocalPath": "",
      "accessToken": "",
      "remotePath": "espresso/index.html",
      "imageRemotePath": "espresso/images",
      "commitMessage": "Automated espresso update"
    }
  }
};

// Function to safely create config file
function createConfigFile(configPath, config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.warn('Cannot write config file:', err.message);
    return false;
  }
}

// Function to check if directory is writable
function isDirectoryWritable(dirPath) {
  try {
    const testFile = path.join(dirPath, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch (err) {
    return false;
  }
}

// Function to validate and repair configuration
function validateAndRepairConfig(config) {
  let needsRepair = false;
  const repairedConfig = JSON.parse(JSON.stringify(config)); // Deep clone
  
  // Ensure all required sections exist
  const requiredSections = {
    'server': defaultConfig.server,
    'server.admin': defaultConfig.server.admin,
    'homeAssistant': defaultConfig.homeAssistant,
    'cockpit': defaultConfig.cockpit,
    'webContent': defaultConfig.webContent,
    'storage': defaultConfig.storage,
    'client': defaultConfig.client,
    'drinkMixer': defaultConfig.drinkMixer,
    'vidiots': defaultConfig.vidiots,
    'espresso': defaultConfig.espresso
  };
  
  for (const [sectionPath, defaultValue] of Object.entries(requiredSections)) {
    const parts = sectionPath.split('.');
    let current = repairedConfig;
    let valid = true;
    
    // Check if path exists
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        valid = false;
        break;
      }
      current = current[part];
    }
    
    const lastPart = parts[parts.length - 1];
    if (!valid || !current[lastPart]) {
      console.log(`Repairing missing config section: ${sectionPath}`);
      
      // Navigate to parent and set default
      let target = repairedConfig;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!target[part] || typeof target[part] !== 'object') {
          target[part] = {};
        }
        target = target[part];
      }
      target[lastPart] = defaultValue;
      needsRepair = true;
    } else if (typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
      // Merge default with existing object to ensure all required fields exist
      // But preserve existing values over defaults
      const existingValue = current[lastPart];
      const mergedValue = { ...defaultValue, ...existingValue };
      
      // Check if merge is needed (if any default keys are missing)
      const defaultKeys = Object.keys(defaultValue);
      const existingKeys = Object.keys(existingValue);
      const needsMerge = defaultKeys.some(key => !(key in existingValue));
      
      if (needsMerge) {
        console.log(`Merging config section: ${sectionPath}`);
        current[lastPart] = mergedValue;
        needsRepair = true;
      }
    }
  }
  
  // Ensure arrays exist
  if (!Array.isArray(repairedConfig.usefulLinks)) {
    repairedConfig.usefulLinks = [];
    needsRepair = true;
  }
  if (!Array.isArray(repairedConfig.connectedDevices)) {
    repairedConfig.connectedDevices = [];
    needsRepair = true;
  }
  
  // Validate port
  if (!repairedConfig.server.port || isNaN(parseInt(repairedConfig.server.port))) {
    repairedConfig.server.port = 3000;
    needsRepair = true;
  }
  
  return { config: repairedConfig, needsRepair };
}

// Load configuration with fallback to default
let config = {};
let configWritable = false;

try {
  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    try {
      fs.mkdirSync(configDir, { recursive: true });
      console.log('Created config directory');
    } catch (err) {
      console.warn('Cannot create config directory:', err.message);
    }
  }
  
  // Check if config directory is writable
  configWritable = isDirectoryWritable(configDir);
  
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Loaded configuration from config/config.json');
    logger.success(logger.categories.SYSTEM, 'Configuration loaded from config/config.json');
    
    // Validate and repair configuration
    const validation = validateAndRepairConfig(config);
    if (validation.needsRepair) {
      console.log('Configuration validation found issues, applying repairs...');
      logger.warning(logger.categories.SYSTEM, 'Configuration validation found issues, applying repairs');
      config = validation.config;
      
      if (configWritable) {
        if (createConfigFile(configPath, config)) {
          console.log('Repaired configuration saved to file');
          logger.success(logger.categories.SYSTEM, 'Repaired configuration saved to file');
        } else {
          console.warn('Could not save repaired configuration, using in-memory repairs');
          logger.warning(logger.categories.SYSTEM, 'Could not save repaired configuration, using in-memory repairs');
        }
      } else {
        console.warn('Config directory not writable, repairs applied in-memory only');
        logger.warning(logger.categories.SYSTEM, 'Config directory not writable, repairs applied in-memory only');
      }
    } else {
      console.log('Configuration validation passed');
      logger.info(logger.categories.SYSTEM, 'Configuration validation passed');
    }
  } else {
    config = defaultConfig;
    if (configWritable) {
      if (createConfigFile(configPath, defaultConfig)) {
        console.log('Created default configuration file');
        logger.success(logger.categories.SYSTEM, 'Created default configuration file');
      }
    } else {
      console.log('Config directory not writable, using in-memory configuration only');
      logger.warning(logger.categories.SYSTEM, 'Config directory not writable, using in-memory configuration only');
    }
  }
} catch (err) {
  console.error('Error loading config, using defaults:', err);
  config = defaultConfig;
  
  // Even with defaults, validate to ensure consistency
  const validation = validateAndRepairConfig(config);
  config = validation.config;
  
  // Try to create config file only if directory is writable
  if (configWritable) {
    if (!createConfigFile(configPath, config)) {
      console.log('Could not create config file, using in-memory defaults');
    } else {
      console.log('Created default configuration file after error recovery');
    }
  } else {
    console.log('Config directory not writable, using in-memory defaults');
  }
}

const PORT = config.server.port || 3000;

// Initialize vidiots module
vidiots.init(config);

// Initialize espresso module  
espresso.init(config);

// Initialize finance module
finance.init(config);

// Initialize Ollama integration module
const ollama = new OllamaIntegration(configDir);

// Initialize multer configuration after config is loaded
upload = multer({
  storage: storage,
  limits: {
    fileSize: parseFileSize(config.storage?.maxFileSizes?.other || '10MB')
  },
  fileFilter: function (req, file, cb) {
    // Check file size limits based on type
    const fileType = getFileTypeFromMime(file.mimetype);
    const maxSize = parseFileSize(config.storage?.maxFileSizes?.[fileType] || '10MB');
    
    // Note: actual size check happens in multer limits, this is just for type validation
    cb(null, true);
  }
});

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || config.server.sessionSecret || 'local-server-secret-' + Date.now(),
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
};

// Control session store warnings based on environment and preference
const isProduction = process.env.NODE_ENV === 'production';
const suppressWarnings = process.env.SUPPRESS_SESSION_WARNINGS === 'true';

// Suppress express-session MemoryStore warning unless explicitly in production without suppression
if (!isProduction || suppressWarnings) {
  // Temporarily capture stderr to suppress the express-session warning
  const originalStderrWrite = process.stderr.write;
  process.stderr.write = function(chunk, encoding, callback) {
    if (typeof chunk === 'string' && chunk.includes('Warning: connect.session() MemoryStore is not')) {
      // Skip this warning in development or when suppressed
      return true;
    }
    return originalStderrWrite.apply(process.stderr, arguments);
  };
  
  // Restore stderr after a short delay to allow session middleware setup
  setTimeout(() => {
    process.stderr.write = originalStderrWrite;
  }, 100);
}

if (isProduction && !suppressWarnings) {
  console.log('INFO: Using in-memory session store. For production with multiple instances, consider using a persistent session store like Redis.');
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Apply stderr suppression for session middleware if needed
if (isProduction && !suppressWarnings) {
  const originalStderrWrite = process.stderr.write;
  process.stderr.write = function(chunk, encoding, callback) {
    if (typeof chunk === 'string' && chunk.includes('Warning: connect.session() MemoryStore is not')) {
      // In production, replace with our own more concise warning
      console.log('INFO: Session store using memory (not recommended for production clusters)');
      return true;
    }
    return originalStderrWrite.apply(process.stderr, arguments);
  };
  
  app.use(session(sessionConfig));
  
  // Restore stderr after session setup
  setTimeout(() => {
    process.stderr.write = originalStderrWrite;
  }, 50);
} else {
  app.use(session(sessionConfig));
}

// Static files for public web content
app.use('/public', express.static(path.join(__dirname, 'public')));

// Serve Magic Mirror static assets (CSS, JS, etc.)
// The static middleware will automatically serve index.html when accessing /magic-mirror/
app.use('/magic-mirror', express.static(path.join(__dirname, 'public', 'magic-mirror'), {
    index: false  // Don't auto-serve index.html for the root path without trailing slash
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) {
    next();
  } else {
    // Check if this is an API request that expects JSON
    if (req.path.startsWith('/admin/api/') || 
        req.get('Accept')?.includes('application/json') ||
        req.get('Content-Type')?.includes('application/json')) {
      // Return JSON error for API requests
      res.status(401).json({ 
        success: false, 
        error: 'Authentication required', 
        code: 'UNAUTHORIZED' 
      });
    } else {
      // Redirect to login for regular page requests
      res.redirect('/admin/login');
    }
  }
};

// Serve admin static files
app.use('/admin/static', express.static(path.join(__dirname, 'admin')));

// Admin login page
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

// API to check if default credentials are still in use (public endpoint)
app.get('/admin/api/default-credentials-status', (req, res) => {
  const isDefaultPassword = config.server.admin.password === 'admin123';
  const isDefaultUsername = config.server.admin.username === 'admin';
  res.json({
    showDefaultCredentials: isDefaultPassword && isDefaultUsername
  });
});

// Admin login POST
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === config.server.admin.username && password === config.server.admin.password) {
    req.session.authenticated = true;
    // Check if using default password
    req.session.isDefaultPassword = (password === 'admin123');
    logger.success(logger.categories.SYSTEM, `Admin login successful for user: ${username}`);
    if (password === 'admin123') {
      logger.warning(logger.categories.SYSTEM, 'Admin is using default password - security risk!');
    }
    res.redirect('/admin');
  } else {
    logger.warning(logger.categories.SYSTEM, `Failed login attempt for user: ${username}`);
    res.redirect('/admin/login?error=1');
  }
});

// Admin logout
app.post('/admin/logout', (req, res) => {
  logger.info(logger.categories.SYSTEM, 'Admin logged out');
  req.session.destroy();
  res.redirect('/admin/login');
});

// Client authentication middleware
const requireClientAuth = (req, res, next) => {
  const deviceId = req.session.deviceId || req.body.deviceId || req.query.deviceId;
  
  if (!deviceId) {
    return res.status(401).json({ error: 'Device ID required' });
  }
  
  // Check if device is registered
  const device = config.connectedDevices?.find(d => d.deviceId === deviceId);
  if (!device) {
    return res.status(401).json({ error: 'Device not registered' });
  }
  
  // Check if client access is enabled
  if (!config.client?.enabled) {
    return res.status(403).json({ error: 'Client access disabled' });
  }
  
  // If password is required, check it
  if (config.client?.requirePassword) {
    const clientPassword = req.body.password || req.headers['x-client-password'];
    const storedHash = loadClientPasswordHash();
    
    if (!storedHash || !clientPassword || !verifyPassword(clientPassword, storedHash)) {
      return res.status(401).json({ error: 'Client password required' });
    }
  }
  
  req.deviceId = deviceId;
  req.device = device;
  next();
};

// Admin dashboard
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// API to get current config
app.get('/admin/api/config', requireAuth, (req, res) => {
  res.json(config);
});

// API to check if using default password
app.get('/admin/api/password-status', requireAuth, (req, res) => {
  res.json({
    isDefaultPassword: req.session.isDefaultPassword || false,
    username: config.server.admin.username
  });
});

// API to change admin password
app.post('/admin/api/change-password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }
    
    // Verify current password
    if (currentPassword !== config.server.admin.password) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Validate new password
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }
    
    if (newPassword === 'admin123') {
      return res.status(400).json({ error: 'Cannot use default password as new password' });
    }
    
    // Update password in config
    config.server.admin.password = newPassword;
    
    // Clear default password flag from session
    req.session.isDefaultPassword = false;
    
    // Try to write to file if possible
    if (configWritable) {
      if (createConfigFile(configPath, config)) {
        res.json({ 
          success: true, 
          message: 'Password changed successfully and saved to file',
          persistent: true
        });
      } else {
        res.json({ 
          success: true, 
          message: 'Password changed successfully in memory (file save failed - config directory not writable)',
          persistent: false
        });
      }
    } else {
      res.json({ 
        success: true, 
        message: 'Password changed successfully in memory only (config directory not writable)',
        persistent: false
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password: ' + err.message });
  }
});

// API to update config
app.post('/admin/api/config', requireAuth, (req, res) => {
  try {
    const newConfig = req.body;
    
    // Validate config structure
    if (!newConfig.server || !newConfig.server.admin) {
      return res.status(400).json({ error: 'Invalid config structure' });
    }
    
    // Update config in memory first
    config = newConfig;
    
    // Try to write to file if possible
    if (configWritable) {
      if (createConfigFile(configPath, newConfig)) {
        res.json({ 
          success: true, 
          message: 'Configuration updated and saved to file successfully',
          persistent: true
        });
      } else {
        res.json({ 
          success: true, 
          message: 'Configuration updated in memory (file save failed - config directory not writable)',
          persistent: false
        });
      }
    } else {
      res.json({ 
        success: true, 
        message: 'Configuration updated in memory only (config directory not writable)',
        persistent: false
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update configuration: ' + err.message });
  }
});

// API endpoint for managing useful links
app.get('/admin/api/links', requireAuth, (req, res) => {
  res.json(config.usefulLinks || []);
});

app.post('/admin/api/links', requireAuth, (req, res) => {
  try {
    const { name, url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Initialize usefulLinks if it doesn't exist
    if (!config.usefulLinks) {
      config.usefulLinks = [];
    }
    
    // Use URL as name if name is empty or not provided
    const linkName = name && name.trim() ? name.trim() : url;
    
    // Add the new link
    config.usefulLinks.push({ name: linkName, url, id: Date.now() });
    
    // Try to persist to file
    if (configWritable) {
      if (createConfigFile(configPath, config)) {
        res.json({ 
          success: true, 
          message: 'Link added successfully',
          persistent: true,
          links: config.usefulLinks
        });
      } else {
        res.json({ 
          success: true, 
          message: 'Link added (in memory only - file save failed)',
          persistent: false,
          links: config.usefulLinks
        });
      }
    } else {
      res.json({ 
        success: true, 
        message: 'Link added (in memory only)',
        persistent: false,
        links: config.usefulLinks
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add link: ' + err.message });
  }
});

// API endpoint for removing useful links
app.delete('/admin/api/links/:id', requireAuth, (req, res) => {
  try {
    const linkId = parseInt(req.params.id);
    
    if (!config.usefulLinks) {
      return res.status(404).json({ error: 'No links found' });
    }
    
    const initialLength = config.usefulLinks.length;
    config.usefulLinks = config.usefulLinks.filter(link => link.id !== linkId);
    
    if (config.usefulLinks.length === initialLength) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    // Try to persist to file
    if (configWritable) {
      if (createConfigFile(configPath, config)) {
        res.json({ 
          success: true, 
          message: 'Link removed successfully',
          persistent: true,
          links: config.usefulLinks
        });
      } else {
        res.json({ 
          success: true, 
          message: 'Link removed (in memory only - file save failed)',
          persistent: false,
          links: config.usefulLinks
        });
      }
    } else {
      res.json({ 
        success: true, 
        message: 'Link removed (in memory only)',
        persistent: false,
        links: config.usefulLinks
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove link: ' + err.message });
  }
});

// API endpoint for system logs
app.get('/admin/api/logs', requireAuth, (req, res) => {
  const category = req.query.category || null;
  const limit = req.query.limit ? parseInt(req.query.limit) : null;
  
  const logs = logger.getLogs(category, limit);
  
  res.json({
    logs: logs,
    categories: logger.getCategories()
  });
});

// Clear logs endpoint
app.post('/admin/api/logs/clear', requireAuth, (req, res) => {
  logger.clear();
  res.json({ success: true, message: 'All logs cleared' });
});

// Status endpoint for Home Assistant and other tools
app.get('/api/status', (req, res) => {
  const status = {
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      port: PORT,
      status: 'running'
    },
    config: {
      homeAssistant: config.homeAssistant,
      cockpit: config.cockpit
    },
    memory: process.memoryUsage(),
    version: require('./package.json').version
  };
  
  res.json(status);
});

// API endpoint for external POST requests
app.post('/api/webhook', (req, res) => {
  console.log('Received webhook:', req.body);
  res.json({ 
    received: true, 
    timestamp: new Date().toISOString(),
    data: req.body 
  });
});

// API endpoint for external GET requests
app.get('/api/data', (req, res) => {
  res.json({
    message: 'Data endpoint',
    timestamp: new Date().toISOString(),
    parameters: req.query
  });
});

// Home Assistant Media Streaming API endpoint
app.get('/api/media-streaming', async (req, res) => {
  try {
    const haConfig = config.homeAssistant || {};
    const mediaConfig = haConfig.mediaPlayers || {};

    if (!haConfig.enabled) {
      return res.json({
        success: false,
        error: 'Home Assistant integration is disabled',
        data: formatMediaStreamingData([])
      });
    }

    if (!mediaConfig.enabled) {
      return res.json({
        success: false,
        error: 'Media player integration is disabled',
        data: formatMediaStreamingData([])
      });
    }

    const result = await getHomeAssistantMediaPlayers();
    
    if (!result.success) {
      return res.json({
        success: false,
        error: result.error,
        data: formatMediaStreamingData([])
      });
    }

    const formattedData = formatMediaStreamingData(result.players);
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data: formattedData
    });
  } catch (error) {
    console.error('Error in media streaming API:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      data: formatMediaStreamingData([])
    });
  }
});

// Client access routes and APIs
app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.html'));
});

// Kiosk dashboard route for large TV displays
app.get('/kiosk', (req, res) => {
  res.sendFile(path.join(__dirname, 'kiosk.html'));
});

// Client API endpoints
app.get('/api/client/config', (req, res) => {
  // Ensure client config exists with defaults
  const clientConfig = config.client || {
    enabled: true,
    requirePassword: false,
    showServerStatus: true,
    showUsefulLinks: true,
    welcomeMessage: "Welcome to Local Server Site Pusher"
  };
  
  res.json({
    enabled: clientConfig.enabled,
    requirePassword: clientConfig.requirePassword,
    showServerStatus: clientConfig.showServerStatus,
    showUsefulLinks: clientConfig.showUsefulLinks,
    welcomeMessage: clientConfig.welcomeMessage
  });
});

app.post('/api/client/authenticate', (req, res) => {
  const { password } = req.body;
  
  // Ensure client config exists
  const clientConfig = config.client || { requirePassword: false };
  
  if (!clientConfig.requirePassword) {
    return res.json({ success: true, message: 'No password required' });
  }
  
  // Load the hashed password from secure file
  const storedPasswordHash = loadClientPasswordHash();
  
  if (!storedPasswordHash) {
    return res.status(401).json({ success: false, error: 'No password set. Please set up a password first.' });
  }
  
  if (verifyPassword(password, storedPasswordHash)) {
    req.session.clientAuthenticated = true;
    logger.success(logger.categories.CLIENT, 'Client authentication successful');
    res.json({ success: true, message: 'Authentication successful' });
  } else {
    logger.warning(logger.categories.CLIENT, 'Failed client authentication attempt');
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// Client password management endpoints
app.post('/api/client/set-password', (req, res) => {
  const { newPassword } = req.body;
  
  // Validate input
  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' });
  }
  
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long' });
  }
  
  // Check for security issues with the password
  const securityCheck = validatePasswordSecurity(newPassword);
  if (!securityCheck.valid) {
    return res.status(400).json({ error: securityCheck.reason });
  }
  
  try {
    // Hash and save the new password
    const hashedPassword = hashPassword(newPassword);
    
    const saveResult = saveClientPasswordHash(hashedPassword);
    if (saveResult.success) {
      // Enable password protection in config
      if (!config.client) {
        config.client = {
          enabled: true,
          requirePassword: true,
          showServerStatus: true,
          showUsefulLinks: true,
          welcomeMessage: "Welcome to Local Server Site Pusher"
        };
      } else {
        config.client.requirePassword = true;
      }
      
      // Save config
      if (configWritable) {
        createConfigFile(configPath, config);
      }
      
      res.json({ 
        success: true, 
        message: 'Password set successfully. Password protection is now enabled.' 
      });
    } else {
      // Provide specific error message based on the error type
      let errorMessage = 'Failed to save password';
      if (saveResult.code === 'EACCES') {
        errorMessage = 'Failed to save password: Permission denied. Check that the config directory is writable.';
      } else if (saveResult.code === 'ENOSPC') {
        errorMessage = 'Failed to save password: No space left on device.';
      } else if (saveResult.code === 'ENOENT') {
        errorMessage = 'Failed to save password: Config directory does not exist.';
      } else if (saveResult.error) {
        errorMessage = `Failed to save password: ${saveResult.error}`;
      }
      
      res.status(500).json({ error: errorMessage });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to set password: ' + err.message });
  }
});

app.post('/api/client/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  // Validate input
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters long' });
  }
  
  // Check for security issues with the new password
  const securityCheck = validatePasswordSecurity(newPassword);
  if (!securityCheck.valid) {
    return res.status(400).json({ error: securityCheck.reason });
  }
  
  try {
    // Load and verify current password
    const storedPasswordHash = loadClientPasswordHash();
    
    if (!storedPasswordHash) {
      return res.status(400).json({ error: 'No password currently set' });
    }
    
    if (!verifyPassword(currentPassword, storedPasswordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Hash and save the new password
    const hashedPassword = hashPassword(newPassword);
    
    const saveResult = saveClientPasswordHash(hashedPassword);
    if (saveResult.success) {
      res.json({ 
        success: true, 
        message: 'Password changed successfully' 
      });
    } else {
      // Provide specific error message based on the error type
      let errorMessage = 'Failed to save new password';
      if (saveResult.code === 'EACCES') {
        errorMessage = 'Failed to save new password: Permission denied. Check that the config directory is writable.';
      } else if (saveResult.code === 'ENOSPC') {
        errorMessage = 'Failed to save new password: No space left on device.';
      } else if (saveResult.code === 'ENOENT') {
        errorMessage = 'Failed to save new password: Config directory does not exist.';
      } else if (saveResult.error) {
        errorMessage = `Failed to save new password: ${saveResult.error}`;
      }
      
      res.status(500).json({ error: errorMessage });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password: ' + err.message });
  }
});

app.post('/api/client/remove-password', (req, res) => {
  const { currentPassword } = req.body;
  
  // Validate input
  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required' });
  }
  
  try {
    // Load and verify current password
    const storedPasswordHash = loadClientPasswordHash();
    
    if (!storedPasswordHash) {
      return res.status(400).json({ error: 'No password currently set' });
    }
    
    if (!verifyPassword(currentPassword, storedPasswordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Remove password file and disable password protection
    if (deleteClientPasswordHash()) {
      // Disable password protection in config
      if (config.client) {
        config.client.requirePassword = false;
      }
      
      // Save config
      if (configWritable) {
        createConfigFile(configPath, config);
      }
      
      // Clear any existing client authentication sessions
      // Note: This won't affect existing sessions, but new access won't require password
      
      res.json({ 
        success: true, 
        message: 'Password protection removed successfully' 
      });
    } else {
      res.status(500).json({ error: 'Failed to remove password' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove password: ' + err.message });
  }
});

app.get('/api/client/password-status', (req, res) => {
  try {
    const hasPassword = loadClientPasswordHash() !== null;
    const clientConfig = config.client || { requirePassword: false };
    
    res.json({
      hasPassword: hasPassword,
      requirePassword: clientConfig.requirePassword,
      isProtected: hasPassword && clientConfig.requirePassword
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check password status: ' + err.message });
  }
});

app.post('/api/client/register', (req, res) => {
  try {
    // Check if client access is enabled (no device check needed for registration)
    if (!config.client?.enabled) {
      return res.status(403).json({ error: 'Client access disabled' });
    }
    
    const { deviceId, deviceType, browserInfo, userAgent } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }
    
    // Initialize connectedDevices if it doesn't exist
    if (!config.connectedDevices) {
      config.connectedDevices = [];
    }
    
    // Find existing device or create new one
    let device = config.connectedDevices.find(d => d.deviceId === deviceId);
    
    if (device) {
      // Update existing device
      device.lastSeen = new Date().toISOString();
      device.deviceType = deviceType || device.deviceType;
      device.browserInfo = browserInfo || device.browserInfo;
      device.userAgent = userAgent || device.userAgent;
      device.ip = req.ip || req.connection.remoteAddress;
    } else {
      // Create new device entry
      device = {
        deviceId: deviceId,
        deviceType: deviceType || 'Unknown',
        browserInfo: browserInfo || 'Unknown',
        userAgent: userAgent || '',
        name: '',
        ip: req.ip || req.connection.remoteAddress,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      config.connectedDevices.push(device);
    }
    
    // Try to persist to file
    if (configWritable) {
      createConfigFile(configPath, config);
    }
    
    res.json({ 
      success: true, 
      message: 'Device registered successfully',
      deviceName: device.name
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to register device: ' + error.message });
  }
});

app.post('/api/client/update-name', requireClientAuth, (req, res) => {
  try {
    const { deviceId, name } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }
    
    if (!config.connectedDevices) {
      config.connectedDevices = [];
    }
    
    const device = config.connectedDevices.find(d => d.deviceId === deviceId);
    
    if (device) {
      device.name = name || '';
      device.lastSeen = new Date().toISOString();
      
      // Try to persist to file
      if (configWritable) {
        createConfigFile(configPath, config);
      }
      
      res.json({ success: true, message: 'Device name updated successfully' });
    } else {
      res.status(404).json({ error: 'Device not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update device name: ' + error.message });
  }
});

app.get('/api/client/links', (req, res) => {
  res.json(config.usefulLinks || []);
});

app.get('/api/client/ip', (req, res) => {
  res.json({ 
    ip: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown'
  });
});

// Get visitor status endpoint (no authentication required)
app.get('/api/visitor/status/:deviceId', (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    
    // Initialize connectedDevices if it doesn't exist
    if (!config.connectedDevices) {
      config.connectedDevices = [];
    }
    
    const device = config.connectedDevices.find(d => d.deviceId === deviceId);
    
    res.json({
      isRecognized: !!device,
      hasPassword: device ? !!device.password : false,
      name: device ? device.name : null,
      firstSeen: device ? device.firstSeen : null,
      deviceType: device ? device.deviceType : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get visitor status: ' + error.message });
  }
});

// Get server info for visitors (no authentication required)
app.get('/api/visitor/server-info', (req, res) => {
  try {
    // Get server name from config or use default
    const serverName = config.server?.name || 'Local Server Site Pusher';
    
    // Get connected devices (without sensitive info)
    const connectedUsers = (config.connectedDevices || []).map(device => ({
      name: device.name || 'Anonymous',
      deviceType: device.deviceType || 'Unknown',
      firstSeen: device.firstSeen,
      lastSeen: device.lastSeen,
      isOnline: device.lastSeen && (new Date() - new Date(device.lastSeen)) < 300000 // 5 minutes
    })).filter(user => user.name !== 'Anonymous'); // Only show named users
    
    // Get useful links
    const usefulLinks = config.usefulLinks || [
      { name: 'Admin Dashboard', url: '/admin' },
      { name: 'Client Access', url: '/client' },
      { name: 'Server Status', url: '/api/status' }
    ];
    
    // Server description
    const description = config.server?.description || 
      'A containerized system for building websites and managing web content. ' +
      'This server allows you to upload, build, and deploy web projects with ease.';
    
    res.json({
      serverName,
      description,
      usefulLinks,
      connectedUsers,
      serverUptime: Math.floor(process.uptime()),
      serverVersion: require('./package.json').version
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get server info: ' + error.message });
  }
});

// Visitor registration endpoint (no authentication required)
app.post('/api/visitor/register', (req, res) => {
  try {
    const { name, deviceId, deviceType, userAgent, password } = req.body;
    
    if (!name || !deviceId) {
      return res.status(400).json({ error: 'Name and device ID are required' });
    }
    
    // Initialize connectedDevices if it doesn't exist
    if (!config.connectedDevices) {
      config.connectedDevices = [];
    }
    
    // Check if device already exists
    let device = config.connectedDevices.find(d => d.deviceId === deviceId);
    
    if (device) {
      // Update existing device
      device.name = name;
      device.lastSeen = new Date().toISOString();
      device.deviceType = deviceType || device.deviceType;
      device.userAgent = userAgent || device.userAgent;
      device.ip = req.ip || req.connection.remoteAddress;
      if (password) {
        device.password = password; // In production, this should be hashed
      }
    } else {
      // Create new device entry
      device = {
        deviceId: deviceId,
        name: name,
        deviceType: deviceType || 'Visitor',
        browserInfo: 'Unknown',
        userAgent: userAgent || '',
        password: password || null, // In production, this should be hashed
        ip: req.ip || req.connection.remoteAddress,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      config.connectedDevices.push(device);
    }
    
    // Try to persist to file
    if (configWritable) {
      createConfigFile(configPath, config);
    }
    
    res.json({ 
      success: true, 
      message: 'Visitor registered successfully',
      deviceId: deviceId,
      name: name,
      hasPassword: !!password,
      unlockFeatures: !!password
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to register visitor: ' + error.message });
  }
});

// Admin API for managing client settings
app.get('/admin/api/client', requireAuth, (req, res) => {
  // Ensure client config exists with defaults
  const clientConfig = config.client || {
    enabled: true,
    requirePassword: false,
    showServerStatus: true,
    showUsefulLinks: true,
    welcomeMessage: "Welcome to Local Server Site Pusher"
  };
  
  // Check if client has a password set (but don't expose it)
  const hasPassword = loadClientPasswordHash() !== null;
  
  res.json({
    config: {
      enabled: clientConfig.enabled,
      requirePassword: clientConfig.requirePassword,
      hasPassword: hasPassword,
      showServerStatus: clientConfig.showServerStatus,
      showUsefulLinks: clientConfig.showUsefulLinks,
      welcomeMessage: clientConfig.welcomeMessage
    },
    connectedDevices: config.connectedDevices || []
  });
});

app.post('/admin/api/client', requireAuth, (req, res) => {
  try {
    const { enabled, showServerStatus, showUsefulLinks, welcomeMessage } = req.body;
    
    // Ensure client config exists
    if (!config.client) {
      config.client = {
        enabled: true,
        requirePassword: false,
        showServerStatus: true,
        showUsefulLinks: true,
        welcomeMessage: "Welcome to Local Server Site Pusher"
      };
    }
    
    // Admin can only modify these settings, not password-related ones
    config.client = {
      enabled: enabled !== undefined ? enabled : config.client.enabled,
      requirePassword: config.client.requirePassword, // Keep existing password requirement setting
      showServerStatus: showServerStatus !== undefined ? showServerStatus : config.client.showServerStatus,
      showUsefulLinks: showUsefulLinks !== undefined ? showUsefulLinks : config.client.showUsefulLinks,
      welcomeMessage: welcomeMessage !== undefined ? welcomeMessage : config.client.welcomeMessage
    };
    
    // Try to persist to file
    if (configWritable) {
      if (createConfigFile(configPath, config)) {
        res.json({ 
          success: true, 
          message: 'Client configuration updated successfully',
          persistent: true
        });
      } else {
        res.json({ 
          success: true, 
          message: 'Client configuration updated in memory (file save failed)',
          persistent: false
        });
      }
    } else {
      res.json({ 
        success: true, 
        message: 'Client configuration updated in memory only',
        persistent: false
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update client configuration: ' + error.message });
  }
});

app.delete('/admin/api/client/device/:deviceId', requireAuth, (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    
    if (!config.connectedDevices) {
      return res.status(404).json({ error: 'No devices found' });
    }
    
    const initialLength = config.connectedDevices.length;
    config.connectedDevices = config.connectedDevices.filter(device => device.deviceId !== deviceId);
    
    if (config.connectedDevices.length === initialLength) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Try to persist to file
    if (configWritable) {
      createConfigFile(configPath, config);
    }
    
    res.json({ 
      success: true, 
      message: 'Device removed successfully',
      devices: config.connectedDevices
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove device: ' + error.message });
  }
});

// Delete client and all their data (device record + files)
app.delete('/admin/api/client/:deviceId', requireAuth, (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    
    if (!config.connectedDevices) {
      return res.status(404).json({ error: 'No devices found' });
    }
    
    // Find the device to get its name for the response
    const device = config.connectedDevices.find(d => d.deviceId === deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Remove device from connected devices list
    const initialLength = config.connectedDevices.length;
    config.connectedDevices = config.connectedDevices.filter(device => device.deviceId !== deviceId);
    
    // Check if this was the last client - if so, clear global password data
    const wasLastClient = config.connectedDevices.length === 0;
    let passwordCleared = false;
    
    if (wasLastClient) {
      // Clear global client password since no clients remain
      if (deleteClientPasswordHash()) {
        passwordCleared = true;
        console.log('Cleared global client password - no clients remaining');
        
        // Disable password protection in config
        if (config.client) {
          config.client.requirePassword = false;
        }
      } else {
        console.warn('Failed to clear global client password on last client deletion');
      }
    }
    
    // Delete all client files and directory
    const clientDir = path.join(uploadsDir, deviceId);
    if (fs.existsSync(clientDir)) {
      try {
        fs.rmSync(clientDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`Error deleting client directory ${clientDir}:`, err.message);
        // Continue with device removal even if file deletion fails
      }
    }
    
    // Try to persist config changes to file
    if (configWritable) {
      createConfigFile(configPath, config);
    }
    
    let message = `Client "${device.name || 'Unnamed Device'}" and all associated data deleted successfully`;
    if (passwordCleared) {
      message += '. Global password protection has been cleared since no clients remain.';
    }
    
    res.json({ 
      success: true, 
      message: message,
      deletedDevice: {
        deviceId: device.deviceId,
        name: device.name,
        deviceType: device.deviceType
      },
      remainingDevices: config.connectedDevices,
      passwordCleared: passwordCleared
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete client: ' + error.message });
  }
});

// Client file upload endpoints
app.post('/api/client/files/upload', (req, res) => {
  const uploadSingle = upload.single('file');
  
  uploadSingle(req, res, function (err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large' });
      }
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Perform client authentication after multer has processed the form data
    const deviceId = req.session.deviceId || req.body.deviceId || req.query.deviceId;
    
    if (!deviceId) {
      // Clean up uploaded file before returning error
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(401).json({ error: 'Device ID required' });
    }
    
    // Check if device is registered
    const device = config.connectedDevices?.find(d => d.deviceId === deviceId);
    if (!device) {
      // Clean up uploaded file before returning error
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(401).json({ error: 'Device not registered' });
    }
    
    // Check if client access is enabled
    if (!config.client?.enabled) {
      // Clean up uploaded file before returning error
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(403).json({ error: 'Client access disabled' });
    }
    
    // If password is required, check it
    if (config.client?.requirePassword) {
      const clientPassword = req.body.password || req.headers['x-client-password'];
      const storedHash = loadClientPasswordHash();
      
      if (!storedHash || !clientPassword || !verifyPassword(clientPassword, storedHash)) {
        // Clean up uploaded file before returning error
        if (req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(401).json({ error: 'Client password required' });
      }
    }
    
    try {
      // Move file from temp directory to client directory
      const clientDir = ensureClientUploadDir(deviceId);
      const tempPath = req.file.path;
      const finalPath = path.join(clientDir, req.file.filename);
      
      // Move the file
      fs.renameSync(tempPath, finalPath);
      
      // Add file metadata
      const sharing = req.body.sharing || 'none';
      if (!['none', 'admin', 'all'].includes(sharing)) {
        // Clean up file if sharing is invalid
        fs.unlinkSync(finalPath);
        return res.status(400).json({ error: 'Invalid sharing option' });
      }
      
      const success = addFileMetadata(deviceId, req.file.filename, {
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        sharing: sharing
      });
      
      if (!success) {
        console.warn('Failed to save file metadata');
      }
      
      res.json({
        success: true,
        message: 'File uploaded successfully',
        file: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          sharing: sharing
        }
      });
    } catch (error) {
      // Clean up file if something went wrong
      try {
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cleanupErr) {
        console.warn('Failed to clean up temporary file:', cleanupErr.message);
      }
      
      res.status(500).json({ error: 'Failed to process upload: ' + error.message });
    }
  });
});

// List client files
app.get('/api/client/files', requireClientAuth, (req, res) => {
  try {
    const metadata = getClientFilesMetadata(req.deviceId);
    const fileList = Object.entries(metadata.files).map(([filename, info]) => ({
      filename,
      originalName: info.originalName,
      size: info.size,
      mimeType: info.mimeType,
      uploadDate: info.uploadDate,
      sharing: info.sharing
    }));
    
    res.json({
      success: true,
      files: fileList
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list files: ' + error.message });
  }
});

// Update file sharing permissions
app.patch('/api/client/files/:filename/sharing', requireClientAuth, (req, res) => {
  try {
    const { filename } = req.params;
    const { sharing } = req.body;
    
    if (!['none', 'admin', 'all'].includes(sharing)) {
      return res.status(400).json({ error: 'Invalid sharing option' });
    }
    
    const success = updateFileSharing(req.deviceId, filename, sharing);
    if (!success) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.json({
      success: true,
      message: 'File sharing updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update file sharing: ' + error.message });
  }
});

// Delete client file
app.delete('/api/client/files/:filename', requireClientAuth, (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, req.deviceId, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete the file
    fs.unlinkSync(filePath);
    
    // Remove metadata
    removeFileMetadata(req.deviceId, filename);
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file: ' + error.message });
  }
});

// Serve client files with permission checks
app.get('/files/:deviceId/:filename', (req, res) => {
  try {
    const { deviceId, filename } = req.params;
    const filePath = path.join(uploadsDir, deviceId, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Get file metadata to check sharing permissions
    const metadata = getClientFilesMetadata(deviceId);
    const fileInfo = metadata.files[filename];
    
    if (!fileInfo) {
      return res.status(404).json({ error: 'File metadata not found' });
    }
    
    // Check sharing permissions
    if (fileInfo.sharing === 'none') {
      // Only the owner can access
      if (req.session.deviceId !== deviceId) {
        return res.status(403).json({ error: 'File not shared' });
      }
    } else if (fileInfo.sharing === 'admin') {
      // Admin or owner can access
      if (!req.session.authenticated && req.session.deviceId !== deviceId) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }
    // 'all' sharing allows anyone to access
    
    // Set appropriate content type
    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileInfo.originalName}"`);
    
    // Serve the file
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to serve file: ' + error.message });
  }
});

// Admin endpoint to view all client files
app.get('/admin/api/client/files', requireAuth, (req, res) => {
  try {
    const allFiles = [];
    
    // Read all client directories
    if (fs.existsSync(uploadsDir)) {
      const clientDirs = fs.readdirSync(uploadsDir).filter(item => {
        const itemPath = path.join(uploadsDir, item);
        return fs.statSync(itemPath).isDirectory();
      });
      
      clientDirs.forEach(deviceId => {
        const metadata = getClientFilesMetadata(deviceId);
        const device = config.connectedDevices?.find(d => d.deviceId === deviceId);
        
        Object.entries(metadata.files).forEach(([filename, info]) => {
          allFiles.push({
            deviceId,
            deviceName: device?.name || 'Unknown Device',
            filename,
            originalName: info.originalName,
            size: info.size,
            mimeType: info.mimeType,
            uploadDate: info.uploadDate,
            sharing: info.sharing,
            url: `/files/${deviceId}/${filename}`
          });
        });
      });
    }
    
    res.json({
      success: true,
      files: allFiles
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list client files: ' + error.message });
  }
});

// Get system disk space information
app.get('/admin/api/system/disk-space', requireAuth, (req, res) => {
  try {
    const stats = fs.statSync(uploadsDir);
    
    // Use statvfs-like approach via df command as fallback
    try {
      const dfOutput = execSync(`df -B1 "${uploadsDir}"`, { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');
      const dataLine = lines[lines.length - 1];
      const [, totalBytes, usedBytes, availableBytes] = dataLine.split(/\s+/);
      
      res.json({
        success: true,
        diskSpace: {
          total: parseInt(totalBytes),
          used: parseInt(usedBytes),
          available: parseInt(availableBytes),
          uploadDir: uploadsDir
        }
      });
    } catch (dfError) {
      // Fallback to approximate calculation if df command fails
      res.json({
        success: true,
        diskSpace: {
          total: 50 * 1024 * 1024 * 1024, // 50GB default assumption
          used: 25 * 1024 * 1024 * 1024, // 25GB default assumption  
          available: 25 * 1024 * 1024 * 1024, // 25GB available
          uploadDir: uploadsDir,
          approximate: true
        }
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get disk space information: ' + error.message 
    });
  }
});

// Get client storage usage statistics by category
app.get('/admin/api/client/storage-stats', requireAuth, (req, res) => {
  try {
    const clientStats = {};
    
    // Read all client directories
    if (fs.existsSync(uploadsDir)) {
      const clientDirs = fs.readdirSync(uploadsDir).filter(item => {
        const itemPath = path.join(uploadsDir, item);
        return fs.statSync(itemPath).isDirectory();
      });
      
      clientDirs.forEach(deviceId => {
        const metadata = getClientFilesMetadata(deviceId);
        const device = config.connectedDevices?.find(d => d.deviceId === deviceId);
        
        const stats = {
          deviceId,
          deviceName: device?.name || 'Unknown Device',
          categories: {
            image: { count: 0, size: 0 },
            video: { count: 0, size: 0 },
            document: { count: 0, size: 0 },
            other: { count: 0, size: 0 }
          },
          totalSize: 0,
          totalFiles: 0
        };
        
        Object.entries(metadata.files).forEach(([filename, info]) => {
          const fileType = getFileTypeFromMime(info.mimeType);
          stats.categories[fileType].count += 1;
          stats.categories[fileType].size += info.size;
          stats.totalSize += info.size;
          stats.totalFiles += 1;
        });
        
        clientStats[deviceId] = stats;
      });
    }
    
    res.json({
      success: true,
      clients: clientStats
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get storage statistics: ' + error.message });
  }
});

// Home Assistant Media Streaming Admin API endpoints
app.get('/admin/api/media-streaming/config', requireAuth, (req, res) => {
  try {
    const haConfig = config.homeAssistant || {};
    const mediaConfig = haConfig.mediaPlayers || {};
    
    res.json({
      homeAssistant: {
        enabled: haConfig.enabled || false,
        url: haConfig.url || 'http://localhost:8123',
        hasToken: !!(haConfig.token && haConfig.token.length > 0),
        mediaPlayers: {
          enabled: mediaConfig.enabled || false,
          refreshInterval: mediaConfig.refreshInterval || 5000,
          includeDevices: mediaConfig.includeDevices || [],
          excludeDevices: mediaConfig.excludeDevices || []
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get media streaming configuration: ' + error.message });
  }
});

app.post('/admin/api/media-streaming/config', requireAuth, (req, res) => {
  try {
    const { homeAssistant } = req.body;
    
    // Ensure homeAssistant config exists
    if (!config.homeAssistant) {
      config.homeAssistant = {
        enabled: true,
        url: 'http://localhost:8123',
        token: '',
        mediaPlayers: {
          enabled: true,
          refreshInterval: 5000,
          includeDevices: [],
          excludeDevices: []
        }
      };
    }
    
    // Update configuration
    if (homeAssistant.enabled !== undefined) config.homeAssistant.enabled = homeAssistant.enabled;
    if (homeAssistant.url !== undefined) {
      // Validate URL before saving
      const urlValidation = validateHomeAssistantUrl(homeAssistant.url);
      if (!urlValidation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: urlValidation.error 
        });
      }
      config.homeAssistant.url = homeAssistant.url;
    }
    if (homeAssistant.token !== undefined) config.homeAssistant.token = homeAssistant.token;
    
    if (homeAssistant.mediaPlayers) {
      if (!config.homeAssistant.mediaPlayers) {
        config.homeAssistant.mediaPlayers = {};
      }
      
      const mp = homeAssistant.mediaPlayers;
      if (mp.enabled !== undefined) config.homeAssistant.mediaPlayers.enabled = mp.enabled;
      if (mp.refreshInterval !== undefined) config.homeAssistant.mediaPlayers.refreshInterval = mp.refreshInterval;
      if (mp.includeDevices !== undefined) config.homeAssistant.mediaPlayers.includeDevices = mp.includeDevices;
      if (mp.excludeDevices !== undefined) config.homeAssistant.mediaPlayers.excludeDevices = mp.excludeDevices;
    }
    
    // Try to persist to file
    if (configWritable) {
      if (createConfigFile(configPath, config)) {
        res.json({ 
          success: true, 
          message: 'Media streaming configuration updated successfully',
          persistent: true
        });
      } else {
        res.json({ 
          success: true, 
          message: 'Media streaming configuration updated in memory (file save failed)',
          persistent: false
        });
      }
    } else {
      res.json({ 
        success: true, 
        message: 'Media streaming configuration updated in memory only',
        persistent: false
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to update media streaming configuration: ' + error.message });
  }
});

app.get('/admin/api/media-streaming/test', requireAuth, async (req, res) => {
  try {
    const result = await getHomeAssistantMediaPlayers();
    
    if (!result.success) {
      return res.json({
        success: false,
        error: result.error,
        players: []
      });
    }
    
    const formattedData = formatMediaStreamingData(result.players);
    
    res.json({
      success: true,
      message: `Found ${formattedData.totalDevices} media players (${formattedData.activeDevices} active)`,
      data: formattedData
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test Home Assistant connection: ' + error.message,
      players: []
    });
  }
});

// Vidiots API endpoints
app.get('/admin/api/vidiots/status', requireAuth, (req, res) => {
  try {
    const status = vidiots.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get vidiots status: ' + error.message 
    });
  }
});

app.get('/admin/api/vidiots/config', requireAuth, (req, res) => {
  try {
    const vidiotsConfig = config.vidiots || {};
    res.json({
      success: true,
      config: vidiotsConfig
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get vidiots configuration: ' + error.message 
    });
  }
});

app.post('/admin/api/vidiots/config', requireAuth, (req, res) => {
  try {
    const { vidiots: newVidiotsConfig } = req.body;
    
    // Validate required fields
    if (!newVidiotsConfig || typeof newVidiotsConfig !== 'object') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid vidiots configuration' 
      });
    }
    
    // Update config with special handling for githubPages.accessToken
    // Preserve existing accessToken if not provided in the new config
    const updatedConfig = {
      ...config.vidiots,
      ...newVidiotsConfig
    };
    
    // Special handling for githubPages.accessToken to prevent it from disappearing
    if (newVidiotsConfig.githubPages && config.vidiots?.githubPages) {
      // If accessToken is not provided in the update, preserve the existing one
      if (!newVidiotsConfig.githubPages.hasOwnProperty('accessToken') && config.vidiots.githubPages.accessToken) {
        updatedConfig.githubPages.accessToken = config.vidiots.githubPages.accessToken;
      }
    }
    
    config.vidiots = updatedConfig;
    
    // Reinitialize vidiots module with new config
    vidiots.init(config);
    
    // Try to write to file if possible
    if (configWritable) {
      if (createConfigFile(configPath, config)) {
        res.json({
          success: true,
          message: 'Vidiots configuration updated and saved to file'
        });
      } else {
        res.json({
          success: true,
          message: 'Vidiots configuration updated (in memory only - file not writable)'
        });
      }
    } else {
      res.json({
        success: true,
        message: 'Vidiots configuration updated (in memory only - config directory not writable)'
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update vidiots configuration: ' + error.message 
    });
  }
});

app.post('/admin/api/vidiots/trigger', requireAuth, async (req, res) => {
  try {
    console.log('🚀 Manual vidiots scrape triggered from admin interface');
    logger.info(logger.categories.BUILD, 'Vidiots scrape operation started');
    const result = await vidiots.triggerScrape();
    
    if (result.success) {
      if (result.updated) {
        logger.success(logger.categories.BUILD, 'Vidiots scrape completed - content updated');
      } else {
        logger.info(logger.categories.BUILD, 'Vidiots scrape completed - no changes detected');
      }
    } else {
      logger.error(logger.categories.BUILD, `Vidiots scrape failed: ${result.error || 'Unknown error'}`);
    }
    
    res.json({
      success: result.success,
      message: result.success ? 
        (result.updated ? 'Scrape completed successfully - content updated' : 'Scrape completed successfully - no changes detected') :
        'Scrape failed',
      ...result
    });
  } catch (error) {
    logger.error(logger.categories.BUILD, `Vidiots scrape error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to trigger vidiots scrape: ' + error.message 
    });
  }
});

app.post('/admin/api/vidiots/github/test', requireAuth, async (req, res) => {
  try {
    console.log('🧪 [GitHub] Testing GitHub connection from admin interface');
    const result = await vidiots.githubUpload.testConnection();
    
    res.json({
      success: result.success,
      message: result.success ? 'GitHub connection test successful' : 'GitHub connection test failed',
      ...result
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test GitHub connection: ' + error.message 
    });
  }
});

app.post('/admin/api/vidiots/github/upload', requireAuth, async (req, res) => {
  try {
    console.log('📤 [GitHub] Manual GitHub Pages upload triggered from admin interface');
    logger.info(logger.categories.GITHUB, 'Manual GitHub Pages upload triggered');
    const result = await vidiots.githubUpload.uploadVidiots();
    
    if (result.success) {
      logger.success(logger.categories.GITHUB, 'GitHub Pages upload successful');
    } else {
      logger.error(logger.categories.GITHUB, `GitHub Pages upload failed: ${result.error || 'Unknown error'}`);
    }
    
    res.json({
      success: result.success,
      message: result.success ? 'Upload to GitHub Pages successful' : 'Upload to GitHub Pages failed',
      ...result
    });
  } catch (error) {
    logger.error(logger.categories.GITHUB, `GitHub Pages upload error: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload to GitHub Pages: ' + error.message 
    });
  }
});

// Clone or pull GitHub.io repository
app.post('/admin/api/vidiots/github/clone', requireAuth, async (req, res) => {
  try {
    console.log('📥 [GitHub] Clone/pull repository triggered from admin interface');
    logger.info(logger.categories.GITHUB, 'Clone/pull repository operation started');
    const result = await vidiots.githubUpload.cloneOrPullRepository();
    
    res.json({
      success: result.success,
      message: result.success ? 
        `Repository ${result.action} successfully` : 
        'Repository operation failed',
      ...result
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clone/pull repository: ' + error.message 
    });
  }
});

// Browse GitHub.io repository files
app.get('/admin/api/vidiots/github/browse', requireAuth, (req, res) => {
  try {
    const { path: browsePath = '' } = req.query;
    
    // Validate path parameter type and content
    if (typeof browsePath !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Path parameter must be a string' 
      });
    }
    
    console.log(`📁 [GitHub] Browsing repository path: "${browsePath}"`);
    
    const result = vidiots.githubUpload.browseRepository(browsePath);
    
    res.json({
      success: result.success,
      ...result
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to browse repository: ' + error.message 
    });
  }
});

// Download file from GitHub.io repository
app.get('/admin/api/vidiots/github/download', requireAuth, (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'File path is required and must be a string' 
      });
    }
    
    console.log(`⬇️ [GitHub] Downloading file: "${filePath}"`);
    
    const result = vidiots.githubUpload.getFileContent(filePath);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    // Set appropriate headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', result.size);
    
    res.send(result.content);
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to download file: ' + error.message 
    });
  }
});

// Delete file from GitHub.io repository
app.delete('/admin/api/vidiots/github/delete', requireAuth, (req, res) => {
  try {
    const { path: filePath } = req.query;
    
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'File path is required and must be a string' 
      });
    }
    
    console.log(`🗑️ [GitHub] Deleting file: "${filePath}"`);
    
    const result = vidiots.githubUpload.deleteFile(filePath);
    
    res.json({
      success: result.success,
      message: result.success ? result.message : undefined,
      error: result.success ? undefined : result.error
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete file: ' + error.message 
    });
  }
});

// Configure Git identity for GitHub operations  
app.post('/admin/api/vidiots/github/git-config', requireAuth, async (req, res) => {
  try {
    const { userName, userEmail } = req.body;
    
    // Validate input
    if (!userName || typeof userName !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User name is required and must be a string'
      });
    }
    
    if (!userEmail || typeof userEmail !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User email is required and must be a string'
      });
    }
    
    // Additional security validations
    if (userName.length > 100 || userEmail.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'User name and email must be under 100 characters'
      });
    }
    
    // Check for dangerous characters
    const dangerousChars = /[`$\\]/;
    if (dangerousChars.test(userName) || dangerousChars.test(userEmail)) {
      return res.status(400).json({
        success: false,
        error: 'User name and email cannot contain backticks, dollar signs, or backslashes'
      });
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address'
      });
    }
    
    console.log(`🔧 [GitHub] Updating git identity from admin interface: ${userName} <${userEmail}>`);
    const result = vidiots.githubUpload.updateGitIdentity(userName, userEmail);
    
    res.json({
      success: result.success,
      message: result.success ? 
        'Git identity configured successfully' : 
        'Failed to configure git identity',
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to configure git identity: ' + error.message
    });
  }
});

// Get current Git identity configuration
app.get('/admin/api/vidiots/github/git-config', requireAuth, (req, res) => {
  try {
    console.log('📋 [GitHub] Retrieving current git identity configuration');
    const result = vidiots.githubUpload.getCurrentGitIdentity();
    
    res.json({
      success: result.success,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve git identity: ' + error.message
    });
  }
});

// Public vidiots content endpoint
app.get('/vidiots', (req, res) => {
  try {
    const vidiotsConfig = config.vidiots || {};
    const outputFile = vidiotsConfig.outputFile || './public/vidiots/index.html';
    
    // Validate the output file path to prevent path traversal
    const normalizedPath = path.resolve(outputFile);
    
    if (fs.existsSync(normalizedPath)) {
      res.sendFile(normalizedPath);
    } else {
      res.status(404).send('Vidiots content not yet generated. Please check back later.');
    }
  } catch (error) {
    // Sanitize error message to prevent XSS
    const sanitizedError = error.message.replace(/[<>"']/g, '');
    res.status(500).send('Error serving vidiots content: ' + sanitizedError);
  }
});

// ================================================================
// ESPRESSO API ENDPOINTS
// ================================================================

// Get espresso data
app.get('/get-text', (req, res) => {
  try {
    console.log('📊 [Espresso] GET /get-text - Fetching espresso data');
    const espressoData = espresso.getEspressoData();
    res.json(espressoData);
  } catch (error) {
    console.error('❌ [Espresso] Error fetching data:', error.message);
    res.status(500).json({ error: 'Failed to fetch espresso data' });
  }
});

// Update espresso data
app.post('/update-texts', express.json(), async (req, res) => {
  try {
    console.log('📝 [Espresso] POST /update-texts - Updating espresso data');
    const updatedData = req.body;
    
    if (!updatedData || typeof updatedData !== 'object') {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    
    const result = await espresso.updateEspressoData(updatedData);
    
    if (result.success) {
      console.log('✅ [Espresso] Data updated successfully');
      res.status(200).json({ 
        message: 'Text values updated successfully',
        htmlGenerated: result.htmlGenerated,
        outputPath: result.outputPath
      });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('❌ [Espresso] Error updating data:', error.message);
    res.status(500).json({ error: 'Failed to update espresso data' });
  }
});

// ================================================================
// HOME ASSISTANT COMPATIBLE API ENDPOINTS
// ================================================================

// Home Assistant compatible GET endpoint for espresso data
app.get('/api/espresso', (req, res) => {
  try {
    console.log('📊 [Home Assistant] GET /api/espresso - Fetching espresso data');
    const espressoData = espresso.getEspressoData();
    res.json({
      success: true,
      data: espressoData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ [Home Assistant] Error fetching espresso data:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch espresso data',
      timestamp: new Date().toISOString()
    });
  }
});

// Home Assistant compatible POST endpoint for updating espresso data
app.post('/api/espresso', express.json(), async (req, res) => {
  try {
    console.log('📝 [Home Assistant] POST /api/espresso - Updating espresso data');
    const updatedData = req.body;
    
    if (!updatedData || typeof updatedData !== 'object') {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid data format. Expected JSON object.',
        timestamp: new Date().toISOString()
      });
    }
    
    const result = await espresso.updateEspressoData(updatedData);
    
    if (result.success) {
      console.log('✅ [Home Assistant] Espresso data updated successfully');
      res.status(200).json({ 
        success: true,
        message: 'Espresso data updated successfully',
        htmlGenerated: result.htmlGenerated,
        outputPath: result.outputPath,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({ 
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('❌ [Home Assistant] Error updating espresso data:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update espresso data',
      timestamp: new Date().toISOString()
    });
  }
});

// Admin espresso status endpoint
app.get('/admin/api/espresso/status', requireAuth, (req, res) => {
  try {
    const status = espresso.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('❌ [Espresso] Error getting status:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get espresso status: ' + error.message
    });
  }
});

// Admin espresso config endpoint  
app.get('/admin/api/espresso/config', requireAuth, (req, res) => {
  try {
    const espressoConfig = config.espresso || {};
    res.json({
      success: true,
      config: espressoConfig
    });
  } catch (error) {
    console.error('❌ [Espresso] Error getting config:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get espresso config: ' + error.message
    });
  }
});

// Update espresso config
app.post('/admin/api/espresso/config', requireAuth, (req, res) => {
  try {
    const { espresso: newEspressoConfig } = req.body;
    
    if (!newEspressoConfig) {
      return res.status(400).json({
        success: false,
        error: 'No espresso configuration provided'
      });
    }
    
    // Update config with special handling for githubPages.accessToken
    // Preserve existing accessToken if not provided in the new config
    const updatedConfig = {
      ...config.espresso,
      ...newEspressoConfig
    };
    
    // Special handling for githubPages.accessToken to prevent it from disappearing
    if (newEspressoConfig.githubPages && config.espresso?.githubPages) {
      // If accessToken is not provided in the update, preserve the existing one
      if (!newEspressoConfig.githubPages.hasOwnProperty('accessToken') && config.espresso.githubPages.accessToken) {
        updatedConfig.githubPages.accessToken = config.espresso.githubPages.accessToken;
      }
    }
    
    config.espresso = updatedConfig;
    
    // Reinitialize espresso module with new config
    espresso.init(config);
    
    // Try to write to file if possible
    if (configWritable) {
      if (createConfigFile(configPath, config)) {
        res.json({
          success: true,
          message: 'Espresso configuration saved successfully',
          config: config.espresso
        });
      } else {
        res.json({
          success: true, 
          message: 'Espresso configuration updated (file save failed but config active)',
          config: config.espresso,
          warning: 'Configuration file could not be written'
        });
      }
    } else {
      res.json({
        success: true,
        message: 'Espresso configuration updated (temporary - file not writable)',
        config: config.espresso,
        warning: 'Changes will be lost on server restart'
      });
    }
  } catch (error) {
    console.error('❌ [Espresso] Error updating config:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update espresso configuration: ' + error.message
    });
  }
});

// Trigger HTML generation
app.post('/admin/api/espresso/generate', requireAuth, async (req, res) => {
  try {
    console.log('🚀 [Espresso] Manual HTML generation triggered from admin interface');
    logger.info(logger.categories.BUILD, 'Espresso HTML generation started');
    const espressoData = espresso.getEspressoData();
    const result = await espresso.generateHTMLImmediate(espressoData);
    
    if (result.success) {
      logger.success(logger.categories.BUILD, `Espresso HTML generated successfully: ${result.outputPath}`);
      res.json({
        success: true,
        message: 'HTML generated successfully and saved to local repository',
        outputPath: result.outputPath
      });
    } else {
      logger.error(logger.categories.BUILD, `Espresso HTML generation failed: ${result.error}`);
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ [Espresso] Error generating HTML:', error.message);
    logger.error(logger.categories.BUILD, `Espresso HTML generation error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to generate HTML: ' + error.message
    });
  }
});

// Admin espresso data endpoint - get espresso data for editing
app.get('/admin/api/espresso/data', requireAuth, (req, res) => {
  try {
    console.log('📊 [Espresso] GET /admin/api/espresso/data - Fetching espresso data for admin');
    const espressoData = espresso.getEspressoData();
    res.json({
      success: true,
      data: espressoData
    });
  } catch (error) {
    console.error('❌ [Espresso] Error fetching data for admin:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch espresso data: ' + error.message
    });
  }
});

// Admin espresso data endpoint - update espresso data from admin interface
app.post('/admin/api/espresso/data', requireAuth, async (req, res) => {
  try {
    console.log('📝 [Espresso] POST /admin/api/espresso/data - Updating espresso data from admin');
    const updatedData = req.body;
    
    if (!updatedData || typeof updatedData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid data format'
      });
    }
    
    const result = await espresso.updateEspressoData(updatedData);
    
    if (result.success) {
      console.log('✅ [Espresso] Data updated successfully from admin interface');
      res.json({
        success: true,
        message: 'Espresso data updated successfully',
        htmlGenerated: result.htmlGenerated,
        outputPath: result.outputPath
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ [Espresso] Error updating data from admin:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update espresso data: ' + error.message
    });
  }
});

// Public espresso content endpoint
app.get('/espresso', (req, res) => {
  try {
    const espressoConfig = config.espresso || {};
    const outputFile = espressoConfig.outputPath || './public/espresso/index.html';
    
    // Validate the output file path to prevent path traversal
    const normalizedPath = path.resolve(outputFile);
    
    if (fs.existsSync(normalizedPath)) {
      res.sendFile(normalizedPath);
    } else {
      res.status(404).send('Espresso content not yet generated. Please check back later.');
    }
  } catch (error) {
    // Sanitize error message to prevent XSS
    const sanitizedError = error.message.replace(/[<>"']/g, '');
    res.status(500).send('Error serving espresso content: ' + sanitizedError);
  }
});

// Public espresso data editor endpoint
app.get('/espresso-editor', (req, res) => {
  try {
    const editorPath = path.join(__dirname, 'public', 'espresso-editor.html');
    console.log(`📝 [Espresso Editor] Checking path: ${editorPath}`);
    
    if (fs.existsSync(editorPath)) {
      console.log('✅ [Espresso Editor] File found, serving espresso-editor.html');
      res.sendFile(editorPath);
    } else {
      console.log(`❌ [Espresso Editor] File not found at: ${editorPath}`);
      console.log(`📁 [Espresso Editor] Current working directory: ${process.cwd()}`);
      
      // Try to list the public directory for debugging
      try {
        const publicDir = path.join(__dirname, 'public');
        if (fs.existsSync(publicDir)) {
          const files = fs.readdirSync(publicDir);
          console.log(`📂 [Espresso Editor] Public directory contents: ${files.join(', ')}`);
        } else {
          console.log(`📂 [Espresso Editor] Public directory does not exist: ${publicDir}`);
        }
      } catch (listError) {
        console.log(`📂 [Espresso Editor] Could not list public directory: ${listError.message}`);
      }
      
      res.status(404).send('Espresso editor not found.');
    }
  } catch (error) {
    console.error(`❌ [Espresso Editor] Error serving espresso editor:`, error);
    const sanitizedError = error.message.replace(/[<>"']/g, '');
    res.status(500).send('Error serving espresso editor: ' + sanitizedError);
  }
});

// Public espresso data API endpoint - get espresso data (no auth required)
app.get('/api/espresso/data', (req, res) => {
  try {
    console.log('📊 [Espresso] GET /api/espresso/data - Fetching espresso data for public editor');
    const espressoData = espresso.getEspressoData();
    res.json({
      success: true,
      data: espressoData
    });
  } catch (error) {
    console.error('❌ [Espresso] Error fetching data for public editor:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch espresso data: ' + error.message
    });
  }
});

// Public espresso data API endpoint - update espresso data (no auth required)
app.post('/api/espresso/data', express.json(), async (req, res) => {
  try {
    console.log('📝 [Espresso] POST /api/espresso/data - Updating espresso data from public editor');
    const updatedData = req.body;
    
    if (!updatedData || typeof updatedData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid data format'
      });
    }
    
    const result = await espresso.updateEspressoData(updatedData);
    
    if (result.success) {
      console.log('✅ [Espresso] Data updated successfully from public editor');
      res.json({
        success: true,
        message: 'Espresso data updated successfully',
        htmlGenerated: result.htmlGenerated,
        outputPath: result.outputPath
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('❌ [Espresso] Error updating data from public editor:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to update espresso data: ' + error.message
    });
  }
});

// Espresso template upload endpoint
app.post('/admin/api/espresso/upload-template', requireAuth, (req, res) => {
  const uploadSingle = upload.single('templateFile');
  
  uploadSingle(req, res, function (err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Template file too large' });
      }
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No template file uploaded' });
    }
    
    try {
      // Ensure espresso templates directory exists
      const templatesDir = path.join(uploadsDir, 'espresso', 'templates');
      if (!fs.existsSync(templatesDir)) {
        fs.mkdirSync(templatesDir, { recursive: true });
      }
      
      // Validate file type
      const fileExt = path.extname(req.file.originalname).toLowerCase();
      const allowedExtensions = ['.html', '.htm', '.png', '.jpg', '.jpeg', '.gif', '.svg'];
      
      if (!allowedExtensions.includes(fileExt)) {
        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ error: 'Invalid file type. Only HTML templates and images are allowed.' });
      }
      
      // Determine target filename
      let targetFilename = req.file.originalname;
      
      // If it's an HTML file, always name it index.html to be the main template
      if (['.html', '.htm'].includes(fileExt)) {
        targetFilename = 'index.html';
      }
      
      const targetPath = path.join(templatesDir, targetFilename);
      
      // Move file from temp location to templates directory
      fs.renameSync(req.file.path, targetPath);
      
      console.log(`📁 [Espresso] Template file uploaded: ${targetFilename}`);
      
      res.json({
        success: true,
        message: `Template file uploaded successfully: ${targetFilename}`,
        filename: targetFilename,
        originalName: req.file.originalname,
        size: req.file.size
      });
      
    } catch (error) {
      // Clean up uploaded file on error
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      console.error('❌ [Espresso] Template upload error:', error.message);
      res.status(500).json({ error: 'Failed to upload template: ' + error.message });
    }
  });
});

// Get uploaded template files list
app.get('/admin/api/espresso/template-files', requireAuth, (req, res) => {
  try {
    const files = espresso.getUploadedTemplateFiles();
    res.json({
      success: true,
      files
    });
  } catch (error) {
    console.error('❌ [Espresso] Error getting template files:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get template files: ' + error.message
    });
  }
});

// Delete uploaded template file
app.delete('/admin/api/espresso/template-files/:filename', requireAuth, (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const success = espresso.deleteUploadedTemplateFile(filename);
    
    if (success) {
      res.json({
        success: true,
        message: `Template file deleted: ${filename}`
      });
    } else {
      res.status(404).json({ error: 'Template file not found' });
    }
  } catch (error) {
    console.error('❌ [Espresso] Error deleting template file:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to delete template file: ' + error.message
    });
  }
});

// Get available images for configuration UI
app.get('/admin/api/espresso/available-images', requireAuth, (req, res) => {
  try {
    const images = espresso.getAvailableImages();
    res.json({
      success: true,
      images
    });
  } catch (error) {
    console.error('❌ [Espresso] Error getting available images:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get available images: ' + error.message
    });
  }
});

// Get current template path information
app.get('/admin/api/espresso/template-path', requireAuth, (req, res) => {
  try {
    const templatePathInfo = espresso.getCurrentTemplatePath();
    res.json({
      success: true,
      templatePath: templatePathInfo
    });
  } catch (error) {
    console.error('❌ [Espresso] Error getting template path:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get template path: ' + error.message
    });
  }
});

// Manual GitHub Pages upload for espresso
app.post('/admin/api/espresso/github/upload', requireAuth, async (req, res) => {
  try {
    console.log('📤 [Espresso] Manual GitHub Pages upload triggered from admin interface');
    
    const espressoConfig = config.espresso || {};
    if (!espressoConfig.githubPages?.enabled) {
      return res.status(400).json({
        success: false,
        error: 'GitHub Pages integration is not enabled for Espresso. Please enable it in the configuration.'
      });
    }
    
    // Get current espresso data
    const currentData = espresso.getEspressoData();
    
    // Generate GitHub version of HTML with absolute URLs
    const githubHtmlResult = await espresso.generateHTML(currentData, true);
    if (!githubHtmlResult.success) {
      throw new Error(`GitHub HTML generation failed: ${githubHtmlResult.error}`);
    }
    
    // Get uploaded image files
    const imageFiles = [];
    const uploadsDir = path.join(__dirname, 'uploads', 'espresso', 'templates');
    
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      
      files.forEach(file => {
        const filePath = path.join(uploadsDir, file);
        const fileExt = path.extname(file).toLowerCase();
        
        // Check if it's an image file
        if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(fileExt)) {
          imageFiles.push({
            filename: file,
            localPath: filePath
          });
        }
      });
    }
    
    // Prepare files for upload
    const filesToUpload = [];
    
    // Add HTML file
    filesToUpload.push({
      localPath: githubHtmlResult.outputPath,
      remotePath: espressoConfig.githubPages.remotePath || 'espresso/index.html'
    });
    
    // Add image files
    const imageRemotePath = espressoConfig.githubPages.imageRemotePath || 'espresso/images';
    imageFiles.forEach(imageFile => {
      filesToUpload.push({
        localPath: imageFile.localPath,
        remotePath: `${imageRemotePath}/${imageFile.filename}`
      });
    });
    
    console.log(`📋 [Espresso] Uploading ${filesToUpload.length} files (1 HTML + ${imageFiles.length} images)`);
    
    // Upload files using the espresso-specific GitHub configuration
    const result = await githubUpload.uploadFiles(
      filesToUpload,
      espressoConfig.githubPages.commitMessage || 'Manual espresso upload',
      espressoConfig.githubPages
    );
    
    res.json({
      success: result.success,
      message: result.success ? 'Upload to GitHub Pages successful' : 'Upload to GitHub Pages failed',
      filesUploaded: filesToUpload.length,
      imagesUploaded: imageFiles.length,
      ...result
    });
    
  } catch (error) {
    console.error('❌ [Espresso] Manual GitHub upload failed:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to upload to GitHub Pages: ' + error.message
    });
  }
});

// Clone espresso template from git repository
app.post('/admin/api/espresso/clone-template', requireAuth, async (req, res) => {
  try {
    console.log('📋 [Espresso] Template repository clone/pull triggered from admin interface');
    
    const { repoUrl, branch, localPath } = req.body;
    
    if (!repoUrl || !localPath) {
      return res.status(400).json({
        success: false,
        error: 'Repository URL and local path are required'
      });
    }
    
    const repoConfig = {
      repoUrl,
      branch: branch || 'main',
      localPath
    };
    
    const result = await espresso.cloneTemplateRepository(repoConfig);
    
    if (result.success) {
      console.log(`✅ [Espresso] Template repository ${result.action} successfully`);
      res.json({
        success: true,
        message: `Repository ${result.action} successfully`,
        action: result.action,
        filesCopied: result.filesCopied || 0,
        output: result.output
      });
    } else {
      console.error(`❌ [Espresso] Template repository operation failed: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ [Espresso] Error in template clone operation:', error.message);
    res.status(500).json({
      success: false,
      error: 'Template repository clone failed: ' + error.message
    });
  }
});

// Serve uploaded espresso template assets
app.get('/uploads/espresso/templates/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).send('Invalid filename');
    }
    
    const filePath = path.join(uploadsDir, 'espresso', 'templates', filename);
    
    if (fs.existsSync(filePath)) {
      res.sendFile(path.resolve(filePath));
    } else {
      res.status(404).send('File not found');
    }
  } catch (error) {
    console.error('❌ [Espresso] Error serving template file:', error.message);
    res.status(500).send('Error serving template file');
  }
});

// Drink Mixer API endpoints
// Get all alcohols
app.get('/admin/api/drink-mixer/alcohols', requireAuth, (req, res) => {
  const alcohols = config.drinkMixer?.alcohols || [];
  res.json(alcohols);
});

// Add or update alcohol
app.post('/admin/api/drink-mixer/alcohols', requireAuth, (req, res) => {
  try {
    const { name, available } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Initialize drinkMixer if it doesn't exist
    if (!config.drinkMixer) {
      config.drinkMixer = { alcohols: [], mixers: [], recipes: [] };
    }
    
    // Check if alcohol already exists
    const existingIndex = config.drinkMixer.alcohols.findIndex(a => a.name.toLowerCase() === name.toLowerCase());
    
    const alcoholData = {
      id: existingIndex >= 0 ? config.drinkMixer.alcohols[existingIndex].id : Date.now(),
      name: name.trim(),
      available: available !== false // default to true if not specified
    };
    
    if (existingIndex >= 0) {
      config.drinkMixer.alcohols[existingIndex] = alcoholData;
    } else {
      config.drinkMixer.alcohols.push(alcoholData);
    }
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Alcohol saved successfully',
        alcohol: alcoholData
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Alcohol saved in memory (file save failed)',
        alcohol: alcoholData
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save alcohol: ' + err.message });
  }
});

// Delete alcohol
app.delete('/admin/api/drink-mixer/alcohols/:id', requireAuth, (req, res) => {
  try {
    const alcoholId = parseInt(req.params.id);
    
    if (!config.drinkMixer?.alcohols) {
      return res.status(404).json({ error: 'No alcohols found' });
    }
    
    const initialLength = config.drinkMixer.alcohols.length;
    config.drinkMixer.alcohols = config.drinkMixer.alcohols.filter(a => a.id !== alcoholId);
    
    if (config.drinkMixer.alcohols.length === initialLength) {
      return res.status(404).json({ error: 'Alcohol not found' });
    }
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Alcohol removed successfully'
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Alcohol removed (in memory only)'
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove alcohol: ' + err.message });
  }
});

// Get all mixers
app.get('/admin/api/drink-mixer/mixers', requireAuth, (req, res) => {
  const mixers = config.drinkMixer?.mixers || [];
  res.json(mixers);
});

// Add or update mixer
app.post('/admin/api/drink-mixer/mixers', requireAuth, (req, res) => {
  try {
    const { name, available } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Initialize drinkMixer if it doesn't exist
    if (!config.drinkMixer) {
      config.drinkMixer = { alcohols: [], mixers: [], recipes: [] };
    }
    
    // Check if mixer already exists
    const existingIndex = config.drinkMixer.mixers.findIndex(m => m.name.toLowerCase() === name.toLowerCase());
    
    const mixerData = {
      id: existingIndex >= 0 ? config.drinkMixer.mixers[existingIndex].id : Date.now(),
      name: name.trim(),
      available: available !== false // default to true if not specified
    };
    
    if (existingIndex >= 0) {
      config.drinkMixer.mixers[existingIndex] = mixerData;
    } else {
      config.drinkMixer.mixers.push(mixerData);
    }
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Mixer saved successfully',
        mixer: mixerData
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Mixer saved in memory (file save failed)',
        mixer: mixerData
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save mixer: ' + err.message });
  }
});

// Delete mixer
app.delete('/admin/api/drink-mixer/mixers/:id', requireAuth, (req, res) => {
  try {
    const mixerId = parseInt(req.params.id);
    
    if (!config.drinkMixer?.mixers) {
      return res.status(404).json({ error: 'No mixers found' });
    }
    
    const initialLength = config.drinkMixer.mixers.length;
    config.drinkMixer.mixers = config.drinkMixer.mixers.filter(m => m.id !== mixerId);
    
    if (config.drinkMixer.mixers.length === initialLength) {
      return res.status(404).json({ error: 'Mixer not found' });
    }
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Mixer removed successfully'
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Mixer removed (in memory only)'
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove mixer: ' + err.message });
  }
});

// Get all recipes
app.get('/admin/api/drink-mixer/recipes', requireAuth, (req, res) => {
  const recipes = config.drinkMixer?.recipes || [];
  res.json(recipes);
});

// Add or update recipe
app.post('/admin/api/drink-mixer/recipes', requireAuth, (req, res) => {
  try {
    const { name, ingredients, directions } = req.body;
    
    if (!name || !ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'Name and ingredients array are required' });
    }
    
    // Validate ingredients
    for (const ingredient of ingredients) {
      if (!ingredient.name || typeof ingredient.amount !== 'number' || ingredient.amount <= 0) {
        return res.status(400).json({ error: 'Each ingredient must have a name and positive amount' });
      }
      // Validate unit
      const validUnits = ['oz', 'dash', 'unit'];
      if (!ingredient.unit || !validUnits.includes(ingredient.unit)) {
        return res.status(400).json({ error: 'Each ingredient must have a valid unit (oz, dash, or unit)' });
      }
    }
    
    // Initialize drinkMixer if it doesn't exist
    if (!config.drinkMixer) {
      config.drinkMixer = { alcohols: [], mixers: [], recipes: [] };
    }
    
    // Check if recipe already exists
    const existingIndex = config.drinkMixer.recipes.findIndex(r => r.name.toLowerCase() === name.toLowerCase());
    
    const recipeData = {
      id: existingIndex >= 0 ? config.drinkMixer.recipes[existingIndex].id : Date.now(),
      name: name.trim(),
      ingredients: ingredients.map(ing => ({
        name: ing.name.trim(),
        amount: parseFloat(ing.amount),
        unit: ing.unit
      })),
      directions: directions ? directions.trim() : ''
    };
    
    if (existingIndex >= 0) {
      config.drinkMixer.recipes[existingIndex] = recipeData;
    } else {
      config.drinkMixer.recipes.push(recipeData);
    }
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Recipe saved successfully',
        recipe: recipeData
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Recipe saved in memory (file save failed)',
        recipe: recipeData
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save recipe: ' + err.message });
  }
});

// Delete recipe
app.delete('/admin/api/drink-mixer/recipes/:id', requireAuth, (req, res) => {
  try {
    const recipeId = parseInt(req.params.id);
    
    if (!config.drinkMixer?.recipes) {
      return res.status(404).json({ error: 'No recipes found' });
    }
    
    const initialLength = config.drinkMixer.recipes.length;
    config.drinkMixer.recipes = config.drinkMixer.recipes.filter(r => r.id !== recipeId);
    
    if (config.drinkMixer.recipes.length === initialLength) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Recipe removed successfully'
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Recipe removed (in memory only)'
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove recipe: ' + err.message });
  }
});

// Fuzzy matching utility for ingredient names
function calculateLevenshteinDistance(str1, str2) {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }
  
  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1, // deletion
        matrix[j - 1][i] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

function normalizeIngredientName(name) {
  return name.toLowerCase()
    .trim()
    .replace(/s$/, '') // Remove trailing 's' (plural)
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' '); // Normalize spaces
}

function fuzzyMatchIngredient(ingredientName, availableIngredients) {
  const normalized = normalizeIngredientName(ingredientName);
  
  // First try exact match (normalized)
  for (const available of availableIngredients) {
    if (normalizeIngredientName(available) === normalized) {
      return true;
    }
  }
  
  // Then try fuzzy match with threshold
  const threshold = Math.max(2, Math.floor(normalized.length * 0.2)); // 20% of length or min 2 chars
  
  for (const available of availableIngredients) {
    const availableNormalized = normalizeIngredientName(available);
    const distance = calculateLevenshteinDistance(normalized, availableNormalized);
    
    if (distance <= threshold) {
      return true;
    }
  }
  
  return false;
}

// Get available ingredients for dropdown (admin endpoint)
app.get('/admin/api/drink-mixer/available-ingredients', requireAuth, (req, res) => {
  try {
    const alcohols = config.drinkMixer?.alcohols || [];
    const mixers = config.drinkMixer?.mixers || [];
    
    const ingredients = [
      ...alcohols.map(a => ({ name: a.name, type: 'alcohol' })),
      ...mixers.map(m => ({ name: m.name, type: 'mixer' }))
    ];
    
    res.json(ingredients);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get available ingredients: ' + err.message });
  }
});

// Get available drinks (public endpoint for clients)
app.get('/api/drink-mixer/available-drinks', (req, res) => {
  try {
    const recipes = config.drinkMixer?.recipes || [];
    const alcohols = config.drinkMixer?.alcohols || [];
    const mixers = config.drinkMixer?.mixers || [];
    
    // Get list of available ingredient names for fuzzy matching
    const availableAlcoholNames = alcohols.filter(a => a.available).map(a => a.name);
    const availableMixerNames = mixers.filter(m => m.available).map(m => m.name);
    const allAvailableIngredients = [...availableAlcoholNames, ...availableMixerNames];
    
    // Filter recipes to only include those where all ingredients are available (with fuzzy matching)
    const availableDrinks = recipes.filter(recipe => {
      return recipe.ingredients.every(ingredient => {
        return fuzzyMatchIngredient(ingredient.name, allAvailableIngredients);
      });
    });
    
    res.json({
      availableDrinks,
      totalRecipes: recipes.length,
      availableCount: availableDrinks.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get available drinks: ' + err.message });
  }
});

// Tournament Bracket API Endpoints

// Get all tournaments
app.get('/admin/api/tournaments', requireAuth, (req, res) => {
  const tournaments = config.tournaments || [];
  res.json(tournaments);
});

// Create a new tournament
app.post('/admin/api/tournaments', requireAuth, (req, res) => {
  try {
    const { name, description, tournamentType = 'single-elimination', maxParticipants = 8 } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Tournament name is required' });
    }
    
    // Initialize tournaments if it doesn't exist
    if (!config.tournaments) {
      config.tournaments = [];
    }
    
    const tournamentData = {
      id: Date.now(),
      name: name.trim(),
      description: description ? description.trim() : '',
      tournamentType,
      maxParticipants,
      participants: [],
      bracket: [],
      currentRound: 0,
      status: 'setup', // setup, active, completed
      winner: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    config.tournaments.push(tournamentData);
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Tournament created successfully',
        tournament: tournamentData
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Tournament created in memory (file save failed)',
        tournament: tournamentData
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to create tournament: ' + err.message });
  }
});

// Get a specific tournament
app.get('/admin/api/tournaments/:id', requireAuth, (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const tournament = config.tournaments?.find(t => t.id === tournamentId);
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get tournament: ' + err.message });
  }
});

// Add participant to tournament
app.post('/admin/api/tournaments/:id/participants', requireAuth, (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const { name, linkedClientId = null, teamMembers = [] } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Participant name is required' });
    }
    
    const tournament = config.tournaments?.find(t => t.id === tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    if (tournament.status !== 'setup') {
      return res.status(400).json({ error: 'Cannot add participants to active tournament' });
    }
    
    if (tournament.participants.length >= tournament.maxParticipants) {
      return res.status(400).json({ error: 'Tournament is full' });
    }
    
    const participant = {
      id: Date.now(),
      name: name.trim(),
      linkedClientId,
      teamMembers: teamMembers.map(member => member.trim()).filter(member => member),
      wins: 0,
      losses: 0,
      addedAt: new Date().toISOString()
    };
    
    tournament.participants.push(participant);
    tournament.updatedAt = new Date().toISOString();
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Participant added successfully',
        participant,
        tournament
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Participant added in memory (file save failed)',
        participant,
        tournament
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add participant: ' + err.message });
  }
});

// Generate tournament bracket
app.post('/admin/api/tournaments/:id/generate-bracket', requireAuth, (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const tournament = config.tournaments?.find(t => t.id === tournamentId);
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    if (tournament.status !== 'setup') {
      return res.status(400).json({ error: 'Bracket already generated' });
    }
    
    if (tournament.participants.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 participants' });
    }
    
    // Generate single-elimination bracket
    const bracket = generateSingleEliminationBracket(tournament.participants);
    tournament.bracket = bracket;
    tournament.status = 'active';
    tournament.currentRound = 1;
    tournament.updatedAt = new Date().toISOString();
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Tournament bracket generated successfully',
        tournament
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Tournament bracket generated in memory (file save failed)',
        tournament
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate bracket: ' + err.message });
  }
});

// Update match result
app.post('/admin/api/tournaments/:id/matches/:matchId/result', requireAuth, (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const matchId = parseInt(req.params.matchId);
    const { winnerId, score = null } = req.body;
    
    const tournament = config.tournaments?.find(t => t.id === tournamentId);
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    if (tournament.status !== 'active') {
      return res.status(400).json({ error: 'Tournament is not active' });
    }
    
    // Find the match in the bracket
    let match = null;
    let matchFound = false;
    
    for (let round of tournament.bracket) {
      match = round.matches.find(m => m.id === matchId);
      if (match) {
        matchFound = true;
        break;
      }
    }
    
    if (!matchFound || !match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    if (match.completed) {
      return res.status(400).json({ error: 'Match already completed' });
    }
    
    // Validate winner
    if (winnerId !== match.participant1?.id && winnerId !== match.participant2?.id) {
      return res.status(400).json({ error: 'Invalid winner ID' });
    }
    
    // Update match result
    match.winnerId = winnerId;
    match.score = score;
    match.completed = true;
    match.completedAt = new Date().toISOString();
    
    // Update participant stats
    const winner = tournament.participants.find(p => p.id === winnerId);
    const loser = tournament.participants.find(p => 
      p.id === (winnerId === match.participant1?.id ? match.participant2?.id : match.participant1?.id)
    );
    
    if (winner) winner.wins++;
    if (loser) loser.losses++;
    
    // Check if round is complete and advance tournament
    const currentRound = tournament.bracket.find(r => r.round === tournament.currentRound);
    const roundComplete = currentRound && currentRound.matches.every(m => m.completed);
    
    if (roundComplete) {
      advanceTournament(tournament);
    }
    
    tournament.updatedAt = new Date().toISOString();
    
    // Try to persist to file
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ 
        success: true, 
        message: 'Match result updated successfully',
        tournament,
        roundComplete
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Match result updated in memory (file save failed)',
        tournament,
        roundComplete
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update match result: ' + err.message });
  }
});

// Client endpoints for viewing tournaments
app.get('/api/tournaments', (req, res) => {
  try {
    const tournaments = (config.tournaments || []).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      status: t.status,
      participantCount: t.participants.length,
      maxParticipants: t.maxParticipants,
      currentRound: t.currentRound,
      winner: t.winner,
      createdAt: t.createdAt
    }));
    
    res.json(tournaments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get tournaments: ' + err.message });
  }
});

// Get tournament bracket for client view
app.get('/api/tournaments/:id/bracket', (req, res) => {
  try {
    const tournamentId = parseInt(req.params.id);
    const tournament = config.tournaments?.find(t => t.id === tournamentId);
    
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }
    
    res.json({
      id: tournament.id,
      name: tournament.name,
      description: tournament.description,
      status: tournament.status,
      bracket: tournament.bracket,
      participants: tournament.participants.map(p => ({
        id: p.id,
        name: p.name,
        teamMembers: p.teamMembers,
        wins: p.wins,
        losses: p.losses
      })),
      currentRound: tournament.currentRound,
      winner: tournament.winner
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get tournament bracket: ' + err.message });
  }
});

// Tournament utility functions
function generateSingleEliminationBracket(participants) {
  const bracket = [];
  let currentParticipants = [...participants];
  
  // Shuffle participants for fair random seeding
  for (let i = currentParticipants.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [currentParticipants[i], currentParticipants[j]] = [currentParticipants[j], currentParticipants[i]];
  }
  
  let round = 1;
  
  // Generate first round
  const firstRoundMatches = [];
  for (let i = 0; i < currentParticipants.length; i += 2) {
    const match = {
      id: Date.now() + i,
      round: round,
      participant1: currentParticipants[i],
      participant2: currentParticipants[i + 1] || null, // Handle odd number of participants
      winnerId: null,
      score: null,
      completed: false
    };
    
    // Auto-advance if no opponent (bye)
    if (!match.participant2) {
      match.winnerId = match.participant1.id;
      match.completed = true;
      match.score = 'BYE';
      match.completedAt = new Date().toISOString();
    }
    
    firstRoundMatches.push(match);
  }
  
  bracket.push({
    round: round,
    matches: firstRoundMatches,
    name: `Round ${round}`
  });
  
  // Generate subsequent rounds until we have a winner
  let nextRoundParticipants = firstRoundMatches.map(match => 
    match.completed ? participants.find(p => p.id === match.winnerId) : null
  ).filter(p => p);
  
  while (nextRoundParticipants.length > 1) {
    round++;
    const roundMatches = [];
    
    for (let i = 0; i < nextRoundParticipants.length; i += 2) {
      const match = {
        id: Date.now() + round * 1000 + i,
        round: round,
        participant1: nextRoundParticipants[i],
        participant2: nextRoundParticipants[i + 1] || null,
        winnerId: null,
        score: null,
        completed: false
      };
      
      if (!match.participant2) {
        match.winnerId = match.participant1.id;
        match.completed = true;
        match.score = 'BYE';
        match.completedAt = new Date().toISOString();
      }
      
      roundMatches.push(match);
    }
    
    const roundName = nextRoundParticipants.length === 2 ? 'Final' : 
                     nextRoundParticipants.length === 4 ? 'Semi-Final' : 
                     `Round ${round}`;
    
    bracket.push({
      round: round,
      matches: roundMatches,
      name: roundName
    });
    
    nextRoundParticipants = roundMatches.map(match => 
      match.completed ? participants.find(p => p.id === match.winnerId) : null
    ).filter(p => p);
  }
  
  return bracket;
}

function advanceTournament(tournament) {
  const currentRound = tournament.bracket.find(r => r.round === tournament.currentRound);
  if (!currentRound) return;
  
  // Check if tournament is complete
  if (currentRound.name === 'Final' && currentRound.matches.every(m => m.completed)) {
    const finalMatch = currentRound.matches[0];
    tournament.winner = tournament.participants.find(p => p.id === finalMatch.winnerId);
    tournament.status = 'completed';
    return;
  }
  
  // Advance to next round
  const nextRound = tournament.bracket.find(r => r.round === tournament.currentRound + 1);
  if (nextRound) {
    // Populate next round matches with winners
    const winners = currentRound.matches.map(match => 
      tournament.participants.find(p => p.id === match.winnerId)
    ).filter(w => w);
    
    let winnerIndex = 0;
    for (let match of nextRound.matches) {
      if (!match.participant1 && winners[winnerIndex]) {
        match.participant1 = winners[winnerIndex++];
      }
      if (!match.participant2 && winners[winnerIndex]) {
        match.participant2 = winners[winnerIndex++];
      }
      
      // Auto-advance if only one participant
      if (match.participant1 && !match.participant2) {
        match.winnerId = match.participant1.id;
        match.completed = true;
        match.score = 'BYE';
        match.completedAt = new Date().toISOString();
      }
    }
    
    tournament.currentRound++;
  }
}

// Finance Module API Endpoints
// Get all account types with descriptions
app.get('/admin/api/finance/account-types', requireAuth, (req, res) => {
  try {
    const accountTypes = finance.getAccountTypes();
    res.json(accountTypes);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get account types: ' + err.message });
  }
});

// Get all accounts
app.get('/admin/api/finance/accounts', requireAuth, (req, res) => {
  try {
    const accounts = finance.getAccounts();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get accounts: ' + err.message });
  }
});

// Create or update account
app.post('/admin/api/finance/accounts', requireAuth, (req, res) => {
  try {
    const result = finance.saveAccount(req.body);
    if (result.success) {
      logger.success(logger.categories.FINANCE, `Financial account saved: ${req.body.name || 'Unnamed'}`);
      res.json({ success: true, message: 'Account saved successfully' });
    } else {
      logger.error(logger.categories.FINANCE, `Failed to save account: ${result.error}`);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    logger.error(logger.categories.FINANCE, `Account save error: ${err.message}`);
    res.status(500).json({ error: 'Failed to save account: ' + err.message });
  }
});

// Delete account
app.delete('/admin/api/finance/accounts/:id', requireAuth, (req, res) => {
  try {
    const result = finance.deleteAccount(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'Account deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete account: ' + err.message });
  }
});

// Update account balance
app.post('/admin/api/finance/accounts/:id/balance', requireAuth, (req, res) => {
  try {
    const { balance, balanceDate } = req.body;
    const result = finance.updateAccountBalance(req.params.id, balance, balanceDate);
    if (result.success) {
      res.json({ success: true, message: 'Account balance updated successfully' });
    } else {
      res.status(404).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update account balance: ' + err.message });
  }
});

// Get demographics
app.get('/admin/api/finance/demographics', requireAuth, (req, res) => {
  try {
    const demographics = finance.getDemographics();
    res.json(demographics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get demographics: ' + err.message });
  }
});

// Update demographics
app.post('/admin/api/finance/demographics', requireAuth, (req, res) => {
  try {
    const result = finance.updateDemographics(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Demographics updated successfully' });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update demographics: ' + err.message });
  }
});

// Add history entry
app.post('/admin/api/finance/history', requireAuth, (req, res) => {
  try {
    const result = finance.addHistoryEntry(req.body);
    if (result.success) {
      res.json({ success: true, message: 'History entry added successfully' });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add history entry: ' + err.message });
  }
});

// Get history
app.get('/admin/api/finance/history', requireAuth, (req, res) => {
  try {
    const { accountId, startDate, endDate } = req.query;
    const history = finance.getHistory(accountId, startDate, endDate);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get history: ' + err.message });
  }
});

// Get recommendations
app.get('/admin/api/finance/recommendations', requireAuth, (req, res) => {
  try {
    const recommendations = finance.getRecommendations();
    res.json(recommendations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get recommendations: ' + err.message });
  }
});

// Retirement planning evaluation endpoint
app.get('/admin/api/finance/retirement-evaluation', requireAuth, (req, res) => {
  try {
    const evaluation = finance.evaluateRetirementPlan();
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to evaluate retirement plan: ' + err.message });
  }
});

// Demo Finance Data Endpoints
// Get demo accounts
app.get('/admin/api/finance/demo/accounts', requireAuth, (req, res) => {
  try {
    const accounts = finance.getDemoAccounts();
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get demo accounts: ' + err.message });
  }
});

// Get demo demographics
app.get('/admin/api/finance/demo/demographics', requireAuth, (req, res) => {
  try {
    const demographics = finance.getDemoDemographics();
    res.json(demographics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get demo demographics: ' + err.message });
  }
});

// Get demo history
app.get('/admin/api/finance/demo/history', requireAuth, (req, res) => {
  try {
    const { accountId, startDate, endDate } = req.query;
    const history = finance.getDemoHistory(accountId, startDate, endDate);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get demo history: ' + err.message });
  }
});

// Get demo recommendations
app.get('/admin/api/finance/demo/recommendations', requireAuth, (req, res) => {
  try {
    const recommendations = finance.getDemoRecommendations();
    res.json(recommendations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get demo recommendations: ' + err.message });
  }
});

// Get demo retirement evaluation
app.get('/admin/api/finance/demo/retirement-evaluation', requireAuth, (req, res) => {
  try {
    const evaluation = finance.evaluateDemoRetirementPlan();
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: 'Failed to evaluate demo retirement plan: ' + err.message });
  }
});

// Advanced Settings API endpoints
app.get('/admin/api/finance/advanced-settings', requireAuth, (req, res) => {
  try {
    const settings = finance.getAdvancedSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get advanced settings: ' + err.message });
  }
});

app.post('/admin/api/finance/advanced-settings', requireAuth, (req, res) => {
  try {
    const result = finance.updateAdvancedSettings(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update advanced settings: ' + err.message });
  }
});

// Backup and Export/Import API Endpoints
// Export all site configurations and data
app.get('/admin/api/backup/export', requireAuth, (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    logger.info(logger.categories.SYSTEM, 'Admin initiated data export');
    
    const result = backup.exportAllData(config);
    
    if (result.success) {
      logger.success(logger.categories.SYSTEM, 'Data export completed successfully');
      
      // Set headers for file download
      const filename = `site-backup-${timestamp.replace(/[:.]/g, '-')}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.json(result.backup);
    } else {
      logger.error(logger.categories.SYSTEM, `Data export failed: ${result.error}`);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    logger.error(logger.categories.SYSTEM, `Data export error: ${err.message}`);
    res.status(500).json({ error: 'Failed to export data: ' + err.message });
  }
});

// Get backup summary (preview) from uploaded file
app.post('/admin/api/backup/preview', requireAuth, (req, res) => {
  try {
    const backupData = req.body;
    
    if (!backupData) {
      return res.status(400).json({ error: 'No backup data provided' });
    }
    
    // Validate the backup
    const validation = backup.validateBackup(backupData);
    
    // Get summary of backup contents
    const summary = backup.getBackupSummary(backupData);
    
    res.json({
      success: true,
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      summary: summary
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to preview backup: ' + err.message });
  }
});

// Import all site configurations and data from backup
app.post('/admin/api/backup/import', requireAuth, (req, res) => {
  try {
    const backupData = req.body;
    const timestamp = new Date().toISOString();
    
    if (!backupData) {
      return res.status(400).json({ error: 'No backup data provided' });
    }
    
    logger.info(logger.categories.SYSTEM, 'Admin initiated data import');
    
    // Perform the import
    const result = backup.importAllData(backupData, config);
    
    if (result.success) {
      logger.success(logger.categories.SYSTEM, `Data import completed: ${result.results.imported.join(', ')}`);
      
      // Reload the configuration after import
      try {
        const newConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // Update the in-memory config
        Object.assign(config, newConfig);
        
        // Re-initialize modules with new config
        vidiots.init(config);
        espresso.init(config);
        finance.init(config);
        
        logger.info(logger.categories.SYSTEM, 'Configuration reloaded after import');
      } catch (reloadErr) {
        logger.warning(logger.categories.SYSTEM, `Config reload warning: ${reloadErr.message}`);
      }
      
      res.json({
        success: true,
        message: result.message,
        results: result.results,
        warnings: result.warnings
      });
    } else {
      logger.error(logger.categories.SYSTEM, `Data import failed: ${result.error}`);
      res.status(400).json({
        success: false,
        error: result.error,
        results: result.results,
        warnings: result.warnings
      });
    }
  } catch (err) {
    logger.error(logger.categories.SYSTEM, `Data import error: ${err.message}`);
    res.status(500).json({ error: 'Failed to import data: ' + err.message });
  }
});

// Ollama/Open WebUI Integration API Endpoints
// Get Ollama configuration
app.get('/admin/api/ollama/config', requireAuth, (req, res) => {
  try {
    const config = ollama.loadConfig();
    // Don't send the API key to frontend, just indicate if it exists
    const sanitizedConfig = {
      webUIUrl: config.webUIUrl || '',
      model: config.model || '',
      hasApiKey: !!config.apiKey,
      enabled: config.enabled || false
    };
    res.json(sanitizedConfig);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get Ollama configuration: ' + err.message });
  }
});

// Save Ollama configuration
app.post('/admin/api/ollama/config', requireAuth, (req, res) => {
  try {
    const { webUIUrl, apiKey, model, enabled } = req.body;
    
    // Load existing config to preserve apiKey if not provided
    const existingConfig = ollama.loadConfig();
    
    const configToSave = {
      webUIUrl: webUIUrl !== undefined ? webUIUrl : existingConfig.webUIUrl,
      apiKey: apiKey !== undefined ? apiKey : existingConfig.apiKey,
      model: model !== undefined ? model : existingConfig.model,
      enabled: enabled !== undefined ? enabled : existingConfig.enabled
    };
    
    const result = ollama.saveConfig(configToSave);
    if (result.success) {
      res.json({ success: true, message: result.message });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save Ollama configuration: ' + err.message });
  }
});

// Test connection to Open WebUI
app.post('/admin/api/ollama/test-connection', requireAuth, async (req, res) => {
  try {
    const config = ollama.loadConfig();
    const result = await ollama.testConnection(config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      connected: false,
      error: 'Failed to test connection: ' + err.message 
    });
  }
});

// Get available models
app.get('/admin/api/ollama/models', requireAuth, async (req, res) => {
  try {
    const config = ollama.loadConfig();
    const result = await ollama.getModels(config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get models: ' + err.message,
      models: []
    });
  }
});

// Send chat prompt to Ollama
app.post('/admin/api/ollama/chat', requireAuth, async (req, res) => {
  try {
    const { prompt, conversationHistory } = req.body;
    
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required' 
      });
    }
    
    const config = ollama.loadConfig();
    const result = await ollama.sendPrompt(config, prompt, conversationHistory || []);
    res.json(result);
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send prompt: ' + err.message 
    });
  }
});

// Magic Mirror API endpoints

// Get Magic Mirror configuration
app.get('/admin/api/magicmirror/config', requireAuth, (req, res) => {
  try {
    const config = magicMirror.getConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get Magic Mirror configuration: ' + err.message });
  }
});

// Save Magic Mirror configuration
app.post('/admin/api/magicmirror/config', requireAuth, (req, res) => {
  try {
    const newConfig = req.body;
    const result = magicMirror.updateConfig(newConfig);
    
    if (result.success) {
      res.json({ success: true, message: 'Configuration saved successfully' });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save Magic Mirror configuration: ' + err.message });
  }
});

// Public read-only API endpoint for Magic Mirror config (for dashboard page load)
app.get('/api/magic-mirror/config', (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`📊 [Magic Mirror Config API] ${timestamp} - Request from ${clientIp}`);
  
  // CRITICAL FIX: Prevent browser caching of config API responses
  // This ensures dashboard always gets the latest config without stale data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  try {
    // Fix: Use getConfig() instead of getFullConfig() to return processed/normalized config
    // This ensures widgets are properly converted to { enabled: true/false } format
    // and matches the behavior of the legacy /api/magicmirror/data endpoint
    const config = magicMirror.getConfig();
    
    // Check if Magic Mirror is enabled
    if (!config.enabled) {
      console.log(`⚠️  [Magic Mirror Config API] ${timestamp} - Access denied: Magic Mirror is disabled`);
      logger.warning(logger.categories.MAGIC_MIRROR, `Config API access denied from ${clientIp}: Magic Mirror is disabled`);
      return res.status(403).json({ 
        success: false,
        error: 'Magic Mirror is not enabled',
        message: 'Please enable Magic Mirror in the admin settings'
      });
    }
    
    // Count widgets for logging
    const widgets = config.widgets || {};
    const allWidgets = Object.keys(widgets);
    const enabledWidgets = allWidgets.filter(w => widgets[w]?.enabled === true);
    const disabledWidgets = allWidgets.filter(w => widgets[w]?.enabled !== true);
    
    console.log(`✅ [Magic Mirror Config API] ${timestamp} - Config loaded successfully`);
    console.log(`   Total widgets: ${allWidgets.length}`);
    console.log(`   Enabled (${enabledWidgets.length}): ${enabledWidgets.join(', ') || 'NONE'}`);
    console.log(`   Disabled (${disabledWidgets.length}): ${disabledWidgets.join(', ') || 'NONE'}`);
    
    logger.success(logger.categories.MAGIC_MIRROR, 
      `Config API: Loaded config for ${clientIp} - ${enabledWidgets.length} enabled, ${disabledWidgets.length} disabled widgets`);
    
    // Return success response with full config
    res.json({
      success: true,
      config: config
    });
    
  } catch (err) {
    const configPath = require('path').join(__dirname, 'config', 'magicmirror-config.json.enc');
    console.error(`❌ [Magic Mirror Config API] ${timestamp} - Error loading config:`, err.message);
    console.error(`   Config path: ${configPath}`);
    console.error(`   Error details:`, err.stack);
    
    logger.error(logger.categories.MAGIC_MIRROR, 
      `Config API error for ${clientIp}: ${err.message} (path: ${configPath})`);
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to load Magic Mirror configuration',
      message: err.message,
      details: {
        path: configPath,
        timestamp: timestamp
      }
    });
  }
});

// Regenerate Magic Mirror dashboard
// Health check endpoint for Magic Mirror configuration
app.get('/admin/api/magicmirror/health', requireAuth, (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`🏥 [Magic Mirror] ${timestamp} - Admin ${clientIp} requested health check`);
  logger.info(logger.categories.MAGIC_MIRROR, `Admin ${clientIp} requested health check`);
  
  try {
    const health = magicMirror.checkHealth();
    
    console.log(`✅ [Magic Mirror] ${timestamp} - Health check completed: ${health.status}`);
    logger.info(logger.categories.MAGIC_MIRROR, `Health check completed: ${health.status}`);
    
    res.json({
      success: true,
      health
    });
  } catch (err) {
    console.error(`❌ [Magic Mirror] ${timestamp} - Health check error:`, err.message);
    logger.error(logger.categories.MAGIC_MIRROR, `Health check error: ${err.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Health check failed: ' + err.message 
    });
  }
});

// Clear and completely refresh Magic Mirror dashboard - removes cached/stale state
// Get Magic Mirror data for display page (includes full config with API keys)
// Magic Mirror weather API endpoint
app.get('/api/magicmirror/weather', async (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`🌤️  [Magic Mirror Weather] ${timestamp} - Request from ${clientIp}`);
  
  try {
    const config = magicMirror.getFullConfig();
    
    if (!config.enabled || !config.widgets?.weather || !config.weather?.location) {
      console.log(`⚠️  [Magic Mirror Weather] ${timestamp} - Widget not configured or disabled`);
      return res.status(400).json({ error: 'Weather widget not configured' });
    }

    // If API key is provided, fetch real weather data
    if (config.weather.apiKey) {
      const axios = require('axios');
      const apiKey = config.weather.apiKey;
      const location = config.weather.location;
      
      const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;
      
      const response = await axios.get(weatherUrl);
      const data = response.data;
      
      console.log(`✅ [Magic Mirror Weather] ${timestamp} - Successfully fetched weather for ${data.name}`);
      
      // Calculate temperature in both Celsius and Fahrenheit
      const tempCelsius = Math.round(data.main.temp);
      const tempFahrenheit = Math.round((data.main.temp * 9/5) + 32);
      
      res.json({
        temperature: tempFahrenheit, // Primary temperature in Fahrenheit
        temperatureF: tempFahrenheit,
        temperatureC: tempCelsius,
        description: data.weather[0].description,
        condition: data.weather[0].main, // Main weather condition (Clear, Clouds, Rain, etc.)
        icon: data.weather[0].icon,
        location: data.name,
        humidity: data.main.humidity,
        windSpeed: data.wind.speed,
        unit: 'F' // Primary unit is now Fahrenheit
      });
    } else {
      console.log(`⚠️  [Magic Mirror Weather] ${timestamp} - Returning placeholder (no API key configured)`);
      // Return placeholder data if no API key
      res.json({
        temperature: '--',
        temperatureF: '--',
        temperatureC: '--',
        description: 'API key required',
        condition: 'N/A',
        location: config.weather.location,
        humidity: '--',
        windSpeed: '--',
        unit: 'F',
        placeholder: true
      });
    }
  } catch (err) {
    console.error(`❌ [Magic Mirror Weather] ${timestamp} - Error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch weather data: ' + err.message });
  }
});

// Magic Mirror weather API test endpoint
app.get('/api/magicmirror/weather/test', async (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`🧪 [Magic Mirror Weather Test] ${timestamp} - Request from ${clientIp}`);
  
  try {
    const config = magicMirror.getFullConfig();
    
    // Check if weather widget is configured
    if (!config.enabled || !config.widgets?.weather) {
      console.log(`⚠️  [Magic Mirror Weather Test] ${timestamp} - Widget not enabled`);
      return res.status(400).json({ 
        success: false, 
        error: 'Weather widget not enabled',
        details: 'Enable the weather widget in Magic Mirror configuration first'
      });
    }

    // Check if location is configured
    if (!config.weather?.location) {
      console.log(`⚠️  [Magic Mirror Weather Test] ${timestamp} - Location not configured`);
      return res.status(400).json({ 
        success: false, 
        error: 'Location not configured',
        details: 'Please configure a location (city name) in the weather settings'
      });
    }

    // Check if API key is configured
    if (!config.weather.apiKey || config.weather.apiKey.trim() === '') {
      console.log(`⚠️  [Magic Mirror Weather Test] ${timestamp} - API key not configured`);
      return res.status(400).json({ 
        success: false, 
        error: 'API key not configured',
        details: 'Please configure your OpenWeather API key in the weather settings. Get one at https://openweathermap.org/api'
      });
    }

    // Test the actual API connection
    const axios = require('axios');
    const apiKey = config.weather.apiKey;
    const location = config.weather.location;
    
    console.log(`🔍 [Magic Mirror Weather Test] ${timestamp} - Testing connection with location: ${location}`);
    
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;
    
    try {
      const response = await axios.get(weatherUrl);
      const data = response.data;
      
      console.log(`✅ [Magic Mirror Weather Test] ${timestamp} - Connection successful for ${data.name}`);
      
      // Calculate temperature in both Celsius and Fahrenheit
      const tempCelsius = Math.round(data.main.temp);
      const tempFahrenheit = Math.round((data.main.temp * 9/5) + 32);
      
      res.json({
        success: true,
        message: 'Weather API connection successful',
        details: {
          location: data.name,
          country: data.sys?.country,
          temperature: tempFahrenheit, // Primary temperature in Fahrenheit
          temperatureF: tempFahrenheit,
          temperatureC: tempCelsius,
          description: data.weather[0].description,
          coordinates: {
            lat: data.coord.lat,
            lon: data.coord.lon
          }
        }
      });
    } catch (apiError) {
      console.error(`❌ [Magic Mirror Weather Test] ${timestamp} - API Error:`, apiError.message);
      
      // Provide detailed error messages based on response status
      if (apiError.response) {
        const status = apiError.response.status;
        const errorData = apiError.response.data;
        
        if (status === 401) {
          return res.status(400).json({
            success: false,
            error: 'Invalid API key',
            details: `Your OpenWeather API key is invalid. Please check your API key at https://openweathermap.org/api. Error: ${errorData.message || 'Unauthorized'}`
          });
        } else if (status === 404) {
          return res.status(400).json({
            success: false,
            error: 'Location not found',
            details: `The location "${location}" could not be found. Please check the spelling or try a different city name. You can also try using "City, Country Code" format (e.g., "London, UK")`
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'API request failed',
            details: `OpenWeather API returned status ${status}: ${errorData.message || apiError.message}`
          });
        }
      } else if (apiError.code === 'ENOTFOUND' || apiError.code === 'ECONNREFUSED') {
        return res.status(500).json({
          success: false,
          error: 'Network connection error',
          details: 'Cannot reach OpenWeather API. Please check your internet connection and firewall settings.'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Connection failed',
          details: apiError.message
        });
      }
    }
  } catch (err) {
    console.error(`❌ [Magic Mirror Weather Test] ${timestamp} - Error:`, err.message);
    res.status(500).json({ 
      success: false,
      error: 'Test failed', 
      details: err.message 
    });
  }
});

// Magic Mirror forecast API endpoint
app.get('/api/magicmirror/forecast', async (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`🌦️  [Magic Mirror Forecast] ${timestamp} - Request from ${clientIp}`);
  
  try {
    const config = magicMirror.getFullConfig();
    
    if (!config.enabled || !config.widgets?.forecast || !config.weather?.location) {
      console.log(`⚠️  [Magic Mirror Forecast] ${timestamp} - Widget not configured or disabled`);
      return res.status(400).json({ error: 'Forecast widget not configured' });
    }

    // If API key is provided, fetch real forecast data
    if (config.weather.apiKey) {
      const axios = require('axios');
      const apiKey = config.weather.apiKey;
      const location = config.weather.location;
      
      // Get the number of days to forecast (default to 5, support 1, 3, 5, or 10)
      const days = config.forecast?.days || 5;
      const daysToFetch = Math.min(Math.max(1, days), 10); // Limit between 1 and 10
      
      const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric&cnt=${daysToFetch * 8}`; // 8 readings per day (3-hour intervals)
      
      const response = await axios.get(forecastUrl);
      const data = response.data;
      
      console.log(`✅ [Magic Mirror Forecast] ${timestamp} - Successfully fetched forecast for ${data.city.name}`);
      
      // Group forecast by day
      const forecastByDay = {};
      
      data.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        if (!forecastByDay[dateKey]) {
          forecastByDay[dateKey] = {
            date: dateKey,
            temps: [],
            conditions: [],
            humidity: [],
            windSpeed: [],
            icons: []
          };
        }
        
        forecastByDay[dateKey].temps.push(item.main.temp);
        forecastByDay[dateKey].conditions.push(item.weather[0].main);
        forecastByDay[dateKey].humidity.push(item.main.humidity);
        forecastByDay[dateKey].windSpeed.push(item.wind.speed);
        forecastByDay[dateKey].icons.push(item.weather[0].icon);
      });
      
      // Calculate daily averages and select most common condition
      const forecast = Object.values(forecastByDay).slice(0, daysToFetch).map(day => {
        const avgTempC = day.temps.reduce((a, b) => a + b, 0) / day.temps.length;
        const maxTempC = Math.max(...day.temps);
        const minTempC = Math.min(...day.temps);
        
        // Calculate Fahrenheit values
        const avgTempF = Math.round((avgTempC * 9/5) + 32);
        const maxTempF = Math.round((maxTempC * 9/5) + 32);
        const minTempF = Math.round((minTempC * 9/5) + 32);
        
        // Find most common condition
        const conditionCount = {};
        day.conditions.forEach(c => {
          conditionCount[c] = (conditionCount[c] || 0) + 1;
        });
        const condition = Object.keys(conditionCount).reduce((a, b) => 
          conditionCount[a] > conditionCount[b] ? a : b
        );
        
        const avgHumidity = Math.round(day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length);
        const avgWindSpeed = (day.windSpeed.reduce((a, b) => a + b, 0) / day.windSpeed.length).toFixed(1);
        
        return {
          date: day.date,
          temperature: avgTempF, // Primary temperature in Fahrenheit
          temperatureF: avgTempF,
          temperatureC: Math.round(avgTempC),
          maxTemp: maxTempF, // Primary max temperature in Fahrenheit
          maxTempF: maxTempF,
          maxTempC: Math.round(maxTempC),
          minTemp: minTempF, // Primary min temperature in Fahrenheit
          minTempF: minTempF,
          minTempC: Math.round(minTempC),
          condition,
          humidity: avgHumidity,
          windSpeed: avgWindSpeed,
          icon: day.icons[Math.floor(day.icons.length / 2)] // Pick middle icon
        };
      });
      
      res.json({
        location: data.city.name,
        forecast,
        unit: 'F' // Primary unit is now Fahrenheit
      });
    } else {
      console.log(`⚠️  [Magic Mirror Forecast] ${timestamp} - Returning placeholder (no API key configured)`);
      // Return placeholder data if no API key
      res.json({
        location: config.weather.location,
        forecast: [],
        unit: 'F',
        placeholder: true
      });
    }
  } catch (err) {
    console.error(`❌ [Magic Mirror Forecast] ${timestamp} - Error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch forecast data: ' + err.message });
  }
});

// Magic Mirror calendar API endpoint
app.get('/api/magicmirror/calendar', async (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`📅 [Magic Mirror Calendar] ${timestamp} - Request from ${clientIp}`);
  
  try {
    const config = magicMirror.getFullConfig();
    
    if (!config.enabled || !config.widgets?.calendar || !config.calendar?.url) {
      console.log(`⚠️  [Magic Mirror Calendar] ${timestamp} - Widget not configured or disabled`);
      return res.status(400).json({ error: 'Calendar widget not configured' });
    }

    const axios = require('axios');
    const ical = require('node-ical');
    
    // Convert webcal:// protocol to https:// for compatibility
    let calendarUrl = config.calendar.url;
    if (calendarUrl.startsWith('webcal://')) {
      calendarUrl = calendarUrl.replace('webcal://', 'https://');
      console.log(`🔄 [Magic Mirror Calendar] ${timestamp} - Converted webcal:// to https://`);
    } else if (calendarUrl.startsWith('webcals://')) {
      calendarUrl = calendarUrl.replace('webcals://', 'https://');
      console.log(`🔄 [Magic Mirror Calendar] ${timestamp} - Converted webcals:// to https://`);
    }
    
    // Fetch and parse iCal data
    const response = await axios.get(calendarUrl);
    const events = await ical.async.parseICS(response.data);
    
    const upcomingEvents = [];
    const now = new Date();
    const futureLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    for (const event of Object.values(events)) {
      if (event.type === 'VEVENT') {
        const start = new Date(event.start);
        if (start >= now && start <= futureLimit) {
          // Format date and time for frontend display
          const dateStr = start.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric' 
          });
          const timeStr = start.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true
          });
          
          upcomingEvents.push({
            title: event.summary || 'Untitled Event',
            date: dateStr,
            time: timeStr,
            start: start.toISOString(),
            end: event.end ? new Date(event.end).toISOString() : null,
            description: event.description || ''
          });
        }
      }
    }
    
    // Sort by start time
    upcomingEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
    
    console.log(`✅ [Magic Mirror Calendar] ${timestamp} - Successfully fetched ${upcomingEvents.length} events`);
    
    res.json({
      events: upcomingEvents.slice(0, 10) // Limit to 10 events
    });
  } catch (err) {
    console.error(`❌ [Magic Mirror Calendar] ${timestamp} - Error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch calendar data: ' + err.message });
  }
});

// Magic Mirror calendar API test endpoint
app.get('/api/magicmirror/calendar/test', async (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`🧪 [Magic Mirror Calendar Test] ${timestamp} - Request from ${clientIp}`);
  
  try {
    const config = magicMirror.getFullConfig();
    
    // Check if calendar widget is configured
    if (!config.enabled || !config.widgets?.calendar) {
      console.log(`⚠️  [Magic Mirror Calendar Test] ${timestamp} - Widget not enabled`);
      return res.status(400).json({ 
        success: false, 
        error: 'Calendar widget not enabled',
        details: 'Enable the calendar widget in Magic Mirror configuration first'
      });
    }

    // Check if calendar URL is configured
    if (!config.calendar?.url || config.calendar.url.trim() === '') {
      console.log(`⚠️  [Magic Mirror Calendar Test] ${timestamp} - Calendar URL not configured`);
      return res.status(400).json({ 
        success: false, 
        error: 'Calendar URL not configured',
        details: 'Please configure a calendar URL (iCal/webcal format) in the calendar settings'
      });
    }

    // Test the actual calendar connection
    const axios = require('axios');
    const ical = require('node-ical');
    
    let calendarUrl = config.calendar.url;
    
    // Convert webcal:// protocol to https:// for compatibility
    if (calendarUrl.startsWith('webcal://')) {
      calendarUrl = calendarUrl.replace('webcal://', 'https://');
      console.log(`🔄 [Magic Mirror Calendar Test] ${timestamp} - Converted webcal:// to https://`);
    } else if (calendarUrl.startsWith('webcals://')) {
      calendarUrl = calendarUrl.replace('webcals://', 'https://');
      console.log(`🔄 [Magic Mirror Calendar Test] ${timestamp} - Converted webcals:// to https://`);
    }
    
    console.log(`🔍 [Magic Mirror Calendar Test] ${timestamp} - Testing connection to: ${calendarUrl}`);
    
    try {
      const response = await axios.get(calendarUrl, { timeout: 10000 });
      
      // Try to parse the iCal data
      const events = await ical.async.parseICS(response.data);
      
      // Count events
      let totalEvents = 0;
      let upcomingEvents = 0;
      const now = new Date();
      const futureLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      for (const event of Object.values(events)) {
        if (event.type === 'VEVENT') {
          totalEvents++;
          const start = new Date(event.start);
          if (start >= now && start <= futureLimit) {
            upcomingEvents++;
          }
        }
      }
      
      console.log(`✅ [Magic Mirror Calendar Test] ${timestamp} - Connection successful, found ${totalEvents} total events, ${upcomingEvents} upcoming`);
      
      res.json({
        success: true,
        message: 'Calendar connection successful',
        details: {
          url: config.calendar.url,
          protocol: config.calendar.url.startsWith('webcal') ? 'webcal' : 'https',
          totalEvents: totalEvents,
          upcomingEvents: upcomingEvents,
          dataFormat: 'iCal/ICS'
        }
      });
    } catch (apiError) {
      console.error(`❌ [Magic Mirror Calendar Test] ${timestamp} - Connection Error:`, apiError.message);
      
      // Provide detailed error messages
      if (apiError.response) {
        const status = apiError.response.status;
        
        if (status === 401 || status === 403) {
          return res.status(400).json({
            success: false,
            error: 'Access denied',
            details: `The calendar URL requires authentication or is not publicly accessible. Status: ${status}`
          });
        } else if (status === 404) {
          return res.status(400).json({
            success: false,
            error: 'Calendar not found',
            details: `The calendar URL could not be found (404). Please verify the URL is correct: ${config.calendar.url}`
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'HTTP request failed',
            details: `Server returned status ${status}: ${apiError.message}`
          });
        }
      } else if (apiError.code === 'ENOTFOUND' || apiError.code === 'ECONNREFUSED') {
        return res.status(500).json({
          success: false,
          error: 'Network connection error',
          details: `Cannot reach the calendar server. Please check the URL and your internet connection. URL: ${config.calendar.url}`
        });
      } else if (apiError.code === 'ETIMEDOUT') {
        return res.status(500).json({
          success: false,
          error: 'Connection timeout',
          details: 'The calendar server took too long to respond. Please try again or check if the server is slow.'
        });
      } else if (apiError.message && apiError.message.includes('Invalid')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid calendar format',
          details: `The URL does not appear to contain valid iCal/ICS data. Error: ${apiError.message}`
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Connection failed',
          details: apiError.message
        });
      }
    }
  } catch (err) {
    console.error(`❌ [Magic Mirror Calendar Test] ${timestamp} - Error:`, err.message);
    res.status(500).json({ 
      success: false,
      error: 'Test failed', 
      details: err.message 
    });
  }
});

// Magic Mirror news API endpoint
app.get('/api/magicmirror/news', async (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`📰 [Magic Mirror News] ${timestamp} - Request from ${clientIp}`);
  
  try {
    const config = magicMirror.getFullConfig();
    
    if (!config.enabled || !config.widgets?.news || !config.news?.source) {
      console.log(`⚠️  [Magic Mirror News] ${timestamp} - Widget not configured or disabled`);
      return res.status(400).json({ error: 'News widget not configured' });
    }

    const axios = require('axios');
    const cheerio = require('cheerio');
    
    // Fetch RSS feed
    const response = await axios.get(config.news.source);
    const $ = cheerio.load(response.data, { xmlMode: true });
    
    const newsItems = [];
    $('item').each((i, item) => {
      if (i < 10) { // Limit to 10 items
        const title = $(item).find('title').text();
        const link = $(item).find('link').text();
        const pubDate = $(item).find('pubDate').text();
        const description = $(item).find('description').text();
        
        // Format date for display
        let displayDate = pubDate;
        try {
          if (pubDate) {
            const dateObj = new Date(pubDate);
            if (!isNaN(dateObj.getTime())) {
              displayDate = dateObj.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
            }
          }
        } catch (e) {
          // If date parsing fails, use original
          displayDate = pubDate;
        }
        
        newsItems.push({
          title: title || 'Untitled',
          link: link,
          date: displayDate,
          description: description
        });
      }
    });
    
    console.log(`✅ [Magic Mirror News] ${timestamp} - Successfully fetched ${newsItems.length} news items from ${config.news.source}`);
    
    res.json({
      items: newsItems
    });
  } catch (err) {
    console.error(`❌ [Magic Mirror News] ${timestamp} - Error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch news data: ' + err.message });
  }
});

// Magic Mirror news API test endpoint
app.get('/api/magicmirror/news/test', async (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`🧪 [Magic Mirror News Test] ${timestamp} - Request from ${clientIp}`);
  
  try {
    const config = magicMirror.getFullConfig();
    
    // Check if news widget is configured
    if (!config.enabled || !config.widgets?.news) {
      console.log(`⚠️  [Magic Mirror News Test] ${timestamp} - Widget not enabled`);
      return res.status(400).json({ 
        success: false, 
        error: 'News widget not enabled',
        details: 'Enable the news widget in Magic Mirror configuration first'
      });
    }

    // Check if news source is configured
    if (!config.news?.source || config.news.source.trim() === '') {
      console.log(`⚠️  [Magic Mirror News Test] ${timestamp} - News source not configured`);
      return res.status(400).json({ 
        success: false, 
        error: 'News source not configured',
        details: 'Please configure a news RSS feed URL in the news settings'
      });
    }

    // Test the actual news feed connection
    const axios = require('axios');
    const cheerio = require('cheerio');
    
    const newsSource = config.news.source;
    
    console.log(`🔍 [Magic Mirror News Test] ${timestamp} - Testing connection to: ${newsSource}`);
    
    try {
      const response = await axios.get(newsSource, { timeout: 10000 });
      
      // Try to parse the RSS feed
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      // Count items
      const totalItems = $('item').length;
      
      // Get feed info
      const feedTitle = $('channel > title').first().text() || 'Unknown';
      const feedDescription = $('channel > description').first().text() || '';
      
      // Get first item as sample
      let sampleItem = null;
      if (totalItems > 0) {
        const firstItem = $('item').first();
        sampleItem = {
          title: firstItem.find('title').text() || 'Untitled',
          pubDate: firstItem.find('pubDate').text() || 'Unknown date'
        };
      }
      
      console.log(`✅ [Magic Mirror News Test] ${timestamp} - Connection successful, found ${totalItems} items from ${feedTitle}`);
      
      res.json({
        success: true,
        message: 'News feed connection successful',
        details: {
          url: newsSource,
          feedTitle: feedTitle,
          feedDescription: feedDescription.substring(0, 100) + (feedDescription.length > 100 ? '...' : ''),
          totalItems: totalItems,
          sampleItem: sampleItem,
          dataFormat: 'RSS/XML'
        }
      });
    } catch (apiError) {
      console.error(`❌ [Magic Mirror News Test] ${timestamp} - Connection Error:`, apiError.message);
      
      // Provide detailed error messages
      if (apiError.response) {
        const status = apiError.response.status;
        
        if (status === 401 || status === 403) {
          return res.status(400).json({
            success: false,
            error: 'Access denied',
            details: `The news feed requires authentication or is not publicly accessible. Status: ${status}`
          });
        } else if (status === 404) {
          return res.status(400).json({
            success: false,
            error: 'News feed not found',
            details: `The news feed URL could not be found (404). Please verify the URL is correct: ${newsSource}`
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'HTTP request failed',
            details: `Server returned status ${status}: ${apiError.message}`
          });
        }
      } else if (apiError.code === 'ENOTFOUND' || apiError.code === 'ECONNREFUSED') {
        return res.status(500).json({
          success: false,
          error: 'Network connection error',
          details: `Cannot reach the news feed server. Please check the URL and your internet connection. URL: ${newsSource}`
        });
      } else if (apiError.code === 'ETIMEDOUT') {
        return res.status(500).json({
          success: false,
          error: 'Connection timeout',
          details: 'The news feed server took too long to respond. Please try again or check if the server is slow.'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Connection failed',
          details: apiError.message
        });
      }
    }
  } catch (err) {
    console.error(`❌ [Magic Mirror News Test] ${timestamp} - Error:`, err.message);
    res.status(500).json({ 
      success: false,
      error: 'Test failed', 
      details: err.message 
    });
  }
});

// Magic Mirror display page - New SPA Implementation
// Redirect to trailing slash so static middleware serves index.html properly
app.get('/magic-mirror', (req, res) => {
  res.redirect(301, '/magic-mirror/');
});

// Magic Mirror display page
// Smart Mirror display page - new clean implementation
app.get('/smart-mirror', (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`✨ [Smart Mirror] ${timestamp} - Request from ${clientIp} for /smart-mirror`);
  
  // Prevent browser caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  
  const htmlPath = path.join(__dirname, 'public', 'smart-mirror.html');
  
  // Check if file exists before serving
  if (!fs.existsSync(htmlPath)) {
    console.error(`❌ [Smart Mirror] ${timestamp} - ERROR: smart-mirror.html not found at ${htmlPath}`);
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Smart Mirror Not Found</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 1rem;
          }
          .container {
            text-align: center;
            max-width: 600px;
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 2rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          h1 {
            font-size: 2rem;
            margin-bottom: 1rem;
            color: #ff3b30;
          }
          p {
            font-size: 1rem;
            line-height: 1.6;
            color: #ddd;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✨ Smart Mirror Not Found</h1>
          <p>The smart-mirror.html file is missing from the server.</p>
          <p style="margin-top: 1rem;"><a href="/magic-mirror" style="color: #4a90e2;">Try the legacy Magic Mirror →</a></p>
        </div>
      </body>
      </html>
    `);
  }
  
  console.log(`✅ [Smart Mirror] ${timestamp} - Successfully serving smart-mirror.html to ${clientIp}`);
  
  res.sendFile(htmlPath, (err) => {
    if (err) {
      console.error(`❌ [Smart Mirror] ${timestamp} - Error serving file to ${clientIp}:`, err.message);
      if (!res.headersSent) {
        res.status(500).send('Error loading Smart Mirror page');
      }
    } else {
      console.log(`✅ [Smart Mirror] ${timestamp} - File delivered successfully to ${clientIp}`);
    }
  });
});

// Default route - serve public content
app.get('/', (req, res) => {
  const defaultFile = path.join(__dirname, 'public', config.webContent.defaultFile || 'index.html');
  
  if (fs.existsSync(defaultFile)) {
    res.sendFile(defaultFile);
  } else {
    res.send(`
      <h1>Local Server Site Pusher</h1>
      <p>Welcome to your local server. Upload content to the public directory to serve web files.</p>
      <p><a href="/admin">Admin Dashboard</a></p>
      <p><a href="/api/status">Server Status</a></p>
    `);
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const startTime = new Date().toLocaleString();
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${startTime}] Local Server Site Pusher v${require('./package.json').version} running on port ${PORT}`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Log server start
  logger.success(logger.categories.SYSTEM, `Server started successfully v${require('./package.json').version} on port ${PORT}`);
  
  // Network configuration info
  console.log('🌐 Network Configuration:');
  console.log(`   ✅ Server listening on: 0.0.0.0:${PORT} (all network interfaces)`);
  console.log(`   ✅ This allows access from local network devices\n`);
  
  logger.info(logger.categories.SERVER, `Listening on 0.0.0.0:${PORT} (all network interfaces)`);
  
  // Local access URLs
  console.log('🔗 Local Access URLs:');
  console.log(`   Admin interface: http://localhost:${PORT}/admin`);
  console.log(`   Status endpoint: http://localhost:${PORT}/api/status`);
  console.log(`   Magic Mirror:    http://localhost:${PORT}/magic-mirror\n`);
  
  // Network access info
  console.log('🌍 Network Access:');
  try {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let hasNetworkIP = false;
    
    Object.keys(networkInterfaces).forEach(interfaceName => {
      networkInterfaces[interfaceName].forEach(iface => {
        // Skip internal and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`   📱 From other devices: http://${iface.address}:${PORT}/magic-mirror`);
          hasNetworkIP = true;
        }
      });
    });
    
    if (!hasNetworkIP) {
      console.log('   ⚠️  No external network interfaces detected');
      console.log('   💡 If running in a container, ensure ports are properly mapped');
    }
  } catch (err) {
    console.log('   ⚠️  Could not determine network addresses');
  }
  
  console.log(`\n${'='.repeat(80)}\n`);
  
  // Magic Mirror status check
  const magicMirrorIndexPath = path.join(__dirname, 'public', 'magic-mirror', 'index.html');
  if (fs.existsSync(magicMirrorIndexPath)) {
    console.log('✅ Magic Mirror SPA ready and available at /magic-mirror');
    logger.success(logger.categories.MAGIC_MIRROR, 'Magic Mirror SPA ready and available');
  } else {
    console.error('❌ WARNING: Magic Mirror SPA files not found!');
    logger.error(logger.categories.MAGIC_MIRROR, 'Magic Mirror SPA files not found at expected path');
  }
  
  console.log('📝 Magic Mirror request logging is enabled');
  console.log('💡 All requests to /magic-mirror and API endpoints will be logged\n');
  logger.info(logger.categories.MAGIC_MIRROR, 'Request logging is enabled for all Magic Mirror endpoints');
});