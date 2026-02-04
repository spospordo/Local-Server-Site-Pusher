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
const { formatFileSystemError, logError, createErrorResponse } = require('./modules/error-helper');
const vidiots = require('./modules/vidiots');
const espresso = require('./modules/espresso');
const githubUpload = require('./modules/github-upload');
const finance = require('./modules/finance');
const OllamaIntegration = require('./modules/ollama');
const backup = require('./modules/backup');
const smartMirror = require('./modules/smartmirror');
const publicFilesRegenerator = require('./modules/public-files-regenerator');
const webhooks = require('./modules/webhooks');
const house = require('./modules/house');

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
  },
  "publicFilesRegeneration": {
    "enabled": true,
    "delaySeconds": 5,
    "runOnStartup": true,
    "forceOverwrite": false
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

// Initialize Smart Mirror module
smartMirror.init(config);

// Initialize public files regenerator module
publicFilesRegenerator.init(config);

// Initialize house module
house.init(config);

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

// Webhook management page
app.get('/admin/webhooks', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'webhooks.html'));
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
    logError(logger.categories.SYSTEM, err, {
      operation: 'Update configuration',
      configWritable
    });
    
    res.status(500).json({ 
      error: 'Failed to update configuration',
      details: err.message,
      solution: 'Verify the configuration structure is valid JSON. Check that the config directory is writable if persistence is required.'
    });
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
    logError(logger.categories.SYSTEM, err, {
      operation: 'Add useful link',
      linkName: req.body.name,
      linkUrl: req.body.url
    });
    
    res.status(500).json({ 
      error: 'Failed to add link',
      details: err.message,
      solution: 'Verify the URL is valid. Check application logs if the issue persists.'
    });
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
    logError(logger.categories.SYSTEM, err, {
      operation: 'Remove useful link',
      linkId: req.params.id
    });
    
    res.status(500).json({ 
      error: 'Failed to remove link',
      details: err.message,
      solution: 'Verify the link ID is valid. Check application logs if the issue persists.'
    });
  }
});

// API endpoints for party scheduling
app.get('/admin/api/party/scheduling', requireAuth, (req, res) => {
  try {
    // Return scheduling data from config, or empty structure if not exists
    const schedulingData = config.partyScheduling || {
      dateTime: {
        date: '',
        startTime: '',
        endTime: ''
      },
      invitees: [],
      menu: [],
      tasks: [],
      events: []
    };
    res.json(schedulingData);
  } catch (err) {
    logError(logger.categories.SYSTEM, err, {
      operation: 'Get party scheduling data'
    });
    res.status(500).json({ 
      error: 'Failed to load scheduling data',
      details: err.message
    });
  }
});

app.post('/admin/api/party/scheduling', requireAuth, (req, res) => {
  try {
    const { dateTime, invitees, menu, tasks, events } = req.body;
    
    // Validate required structure
    if (!dateTime || typeof dateTime !== 'object') {
      return res.status(400).json({ error: 'Invalid dateTime structure' });
    }
    
    // Initialize scheduling data
    config.partyScheduling = {
      dateTime,
      invitees: invitees || [],
      menu: menu || [],
      tasks: tasks || [],
      events: events || []
    };
    
    // Try to persist to file
    if (configWritable) {
      if (createConfigFile(configPath, config)) {
        res.json({ 
          success: true, 
          message: 'Scheduling data saved successfully',
          persistent: true,
          data: config.partyScheduling
        });
      } else {
        res.json({ 
          success: true, 
          message: 'Scheduling data saved (in memory only - file save failed)',
          persistent: false,
          data: config.partyScheduling
        });
      }
    } else {
      res.json({ 
        success: true, 
        message: 'Scheduling data saved (in memory only)',
        persistent: false,
        data: config.partyScheduling
      });
    }
  } catch (err) {
    logError(logger.categories.SYSTEM, err, {
      operation: 'Save party scheduling data'
    });
    res.status(500).json({ 
      error: 'Failed to save scheduling data',
      details: err.message
    });
  }
});

// API endpoint for party scheduling validation
app.get('/admin/api/party/scheduling/validate', requireAuth, (req, res) => {
  try {
    const schedulingData = config.partyScheduling || {
      dateTime: {
        date: '',
        startTime: '',
        endTime: ''
      },
      invitees: [],
      menu: [],
      tasks: [],
      events: []
    };
    
    const issues = [];
    const warnings = [];
    let isValid = true;
    
    // Check for required party date
    if (!schedulingData.dateTime || !schedulingData.dateTime.date) {
      issues.push({
        field: 'dateTime.date',
        severity: 'error',
        message: 'Missing party date',
        suggestion: 'Set a date for your party in the "Date & Time" section. The widget will not display without a valid party date.'
      });
      isValid = false;
    } else {
      // Validate date format
      const dateStr = schedulingData.dateTime.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        issues.push({
          field: 'dateTime.date',
          severity: 'error',
          message: 'Invalid date format',
          suggestion: 'Date must be in YYYY-MM-DD format. Please re-enter the party date.'
        });
        isValid = false;
      } else {
        // Check if date is valid and not in the past
        const partyDate = new Date(dateStr);
        partyDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (isNaN(partyDate.getTime())) {
          issues.push({
            field: 'dateTime.date',
            severity: 'error',
            message: 'Invalid date value',
            suggestion: 'The date entered is not a valid calendar date. Please correct it.'
          });
          isValid = false;
        } else if (partyDate < today) {
          warnings.push({
            field: 'dateTime.date',
            severity: 'warning',
            message: 'Party date is in the past',
            suggestion: 'The party date has already passed. The widget will not display past events. Update the date if this is incorrect.'
          });
        }
      }
    }
    
    // Check for time information (optional but good to know)
    if (schedulingData.dateTime && !schedulingData.dateTime.startTime) {
      warnings.push({
        field: 'dateTime.startTime',
        severity: 'info',
        message: 'No start time specified',
        suggestion: 'Consider adding a start time so guests know when to arrive.'
      });
    }
    
    // Check invitees (optional but commonly expected)
    if (!schedulingData.invitees || schedulingData.invitees.length === 0) {
      warnings.push({
        field: 'invitees',
        severity: 'info',
        message: 'No invitees added',
        suggestion: 'Add guests to track RSVPs and show invitation counts in the widget.'
      });
    }
    
    // Check tasks (optional but commonly expected)
    if (!schedulingData.tasks || schedulingData.tasks.length === 0) {
      warnings.push({
        field: 'tasks',
        severity: 'info',
        message: 'No tasks added',
        suggestion: 'Add pre-party tasks to track preparation progress in the widget.'
      });
    }
    
    // Check menu (optional but commonly expected)
    if (!schedulingData.menu || schedulingData.menu.length === 0) {
      warnings.push({
        field: 'menu',
        severity: 'info',
        message: 'No menu items added',
        suggestion: 'Add menu items to display what will be served at the party.'
      });
    }
    
    // Check events (optional)
    if (!schedulingData.events || schedulingData.events.length === 0) {
      warnings.push({
        field: 'events',
        severity: 'info',
        message: 'No events scheduled',
        suggestion: 'Add party events to show a timeline of activities.'
      });
    }
    
    res.json({
      valid: isValid,
      issues: issues,
      warnings: warnings,
      summary: isValid 
        ? 'Party widget is ready to display' 
        : 'Party widget cannot display - please fix the errors above',
      data: schedulingData
    });
  } catch (err) {
    logError(logger.categories.SYSTEM, err, {
      operation: 'Validate party scheduling data'
    });
    res.status(500).json({ 
      error: 'Failed to validate scheduling data',
      details: err.message
    });
  }
});

// API endpoint to fetch weather for party date
app.get('/admin/api/party/weather', requireAuth, async (req, res) => {
  try {
    const schedulingData = config.partyScheduling;
    
    if (!schedulingData || !schedulingData.dateTime || !schedulingData.dateTime.date) {
      return res.json({ 
        success: false, 
        error: 'No party date configured' 
      });
    }
    
    // Check for weather configuration in either weather or forecast widget
    const weatherConfig = config.widgets?.weather || {};
    const forecastConfig = config.widgets?.forecast || {};
    
    // Get API key and location from either widget
    const apiKey = weatherConfig.apiKey || forecastConfig.apiKey;
    const location = weatherConfig.location || forecastConfig.location;
    const units = weatherConfig.units || forecastConfig.units || 'imperial';
    
    if (!apiKey || !location) {
      return res.json({ 
        success: false, 
        error: 'Weather API not configured',
        hint: 'Configure API key and location in Smart Mirror weather settings to see weather forecasts'
      });
    }
    
    const partyDate = schedulingData.dateTime.date;
    
    // Calculate days until party
    const partyDateObj = new Date(partyDate);
    partyDateObj.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = Math.ceil((partyDateObj - today) / (1000 * 60 * 60 * 24));
    
    try {
      const weatherResult = await smartMirror.fetchWeatherForDate(
        apiKey,
        location,
        partyDate,
        units
      );
      
      if (weatherResult.success) {
        res.json({
          success: true,
          data: {
            summary: weatherResult.summary,
            hourly: weatherResult.hourly,
            location: weatherResult.location,
            units: weatherResult.units,
            daysUntil: daysUntil,
            showHourly: daysUntil <= 3 && daysUntil >= 0
          }
        });
      } else {
        res.json({
          success: false,
          error: weatherResult.error
        });
      }
    } catch (err) {
      logger.error(logger.categories.SMART_MIRROR, `Error fetching party weather: ${err.message}`);
      res.json({
        success: false,
        error: 'Failed to fetch weather data'
      });
    }
  } catch (err) {
    logError(logger.categories.SYSTEM, err, {
      operation: 'Fetch party weather'
    });
    res.status(500).json({ 
      error: 'Failed to fetch weather data',
      details: err.message
    });
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

// Public files regeneration endpoints
app.post('/admin/api/regenerate-public', requireAuth, async (req, res) => {
  try {
    const force = req.body.force || false;
    logger.info(logger.categories.SYSTEM, `Manual public files regeneration triggered (force: ${force})`);
    
    const result = await publicFilesRegenerator.runRegeneration(force);
    
    res.json({
      success: result.success,
      message: result.success ? 'Public files regenerated successfully' : 'Regeneration completed with some failures',
      result
    });
  } catch (error) {
    logger.error(logger.categories.SYSTEM, `Public files regeneration failed: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/admin/api/regenerate-public/status', requireAuth, (req, res) => {
  try {
    const status = publicFilesRegenerator.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/admin/api/regenerate-public/logs', requireAuth, (req, res) => {
  try {
    const logs = publicFilesRegenerator.getLogs();
    res.json({
      success: true,
      logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/admin/api/regenerate-public/logs/clear', requireAuth, (req, res) => {
  try {
    publicFilesRegenerator.clearLogs();
    res.json({
      success: true,
      message: 'Regeneration logs cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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

// Smart Mirror dashboard route (no authentication required)
app.get('/smart-mirror', (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `Dashboard access requested from ${requestContext.ip}`);
  logger.logSmartMirrorDiagnostics('Dashboard route accessed', {
    request: requestContext,
    method: req.method,
    url: req.url,
    headers: {
      userAgent: req.get('user-agent'),
      host: req.get('host'),
      referer: req.get('referer')
    }
  });
  
  // Check if Smart Mirror is enabled
  const smartMirrorConfig = smartMirror.loadConfig();
  
  if (!smartMirrorConfig.enabled) {
    console.log('⚠️  [Smart Mirror] Access denied - feature is disabled');
    logger.warning(logger.categories.SMART_MIRROR, `Access attempt while disabled from ${requestContext.ip}`);
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Smart Mirror Not Available</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #1a1a1a;
            color: #fff;
          }
          .message {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          h1 { margin: 0 0 20px 0; font-size: 24px; }
          p { margin: 10px 0; color: #aaa; }
          a { color: #4a9eff; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="message">
          <h1>📱 Smart Mirror Dashboard</h1>
          <p>The Smart Mirror dashboard is currently disabled.</p>
          <p>Please enable it in the <a href="/admin">admin settings</a>.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  // Check if dashboard HTML file exists
  const dashboardPath = path.join(__dirname, 'public', 'smart-mirror.html');
  const fileExists = fs.existsSync(dashboardPath);
  
  logger.debug(logger.categories.SMART_MIRROR, `Checking dashboard file: ${dashboardPath}`);
  logger.logSmartMirrorDiagnostics('Dashboard file check', {
    filePath: dashboardPath,
    fileExists: fileExists,
    absolutePath: path.resolve(dashboardPath),
    workingDirectory: process.cwd()
  });
  
  if (!fileExists) {
    const errorMsg = `Smart Mirror dashboard file not found at ${dashboardPath}`;
    console.error('❌ [Smart Mirror]', errorMsg);
    logger.error(logger.categories.SMART_MIRROR, errorMsg);
    logger.error(logger.categories.SMART_MIRROR, 
      `TROUBLESHOOTING: Expected file at: ${path.resolve(dashboardPath)}. ` +
      `Check if file exists in deployment. Working directory: ${process.cwd()}`
    );
    
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Smart Mirror Dashboard Error</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #1a1a1a;
            color: #fff;
          }
          .message {
            text-align: center;
            padding: 40px;
            background: rgba(255, 50, 50, 0.1);
            border-radius: 10px;
            border: 1px solid rgba(255, 50, 50, 0.3);
            max-width: 600px;
          }
          h1 { margin: 0 0 20px 0; font-size: 24px; color: #ff5555; }
          p { margin: 10px 0; color: #aaa; }
          code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <div class="message">
          <h1>❌ Dashboard File Not Found</h1>
          <p>The Smart Mirror dashboard file could not be found.</p>
          <p><strong>Expected location:</strong> <code>${dashboardPath}</code></p>
          <p>Please check your deployment and ensure all files are properly copied.</p>
          <p>Check the logs in <a href="/admin" style="color: #4a9eff;">admin dashboard</a> for more details.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  // Set cache-control headers to prevent browser caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  console.log('📱 [Smart Mirror] Dashboard accessed - feature is enabled');
  logger.success(logger.categories.SMART_MIRROR, `Dashboard file served successfully to ${requestContext.ip}`);
  logger.info(logger.categories.SMART_MIRROR, `Serving: ${dashboardPath}`);
  
  res.sendFile(dashboardPath);
});

// Smart Mirror Dashboard - Landscape Mode Route
app.get('/smart-mirror-l', (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `Dashboard access requested (landscape mode) from ${requestContext.ip}`);
  logger.logSmartMirrorDiagnostics('Dashboard landscape route accessed', {
    request: requestContext,
    method: req.method,
    url: req.url,
    headers: {
      userAgent: req.get('user-agent'),
      host: req.get('host'),
      referer: req.get('referer')
    }
  });
  
  // Check if Smart Mirror is enabled
  const smartMirrorConfig = smartMirror.loadConfig();
  
  if (!smartMirrorConfig.enabled) {
    console.log('⚠️  [Smart Mirror] Access denied - feature is disabled');
    logger.warning(logger.categories.SMART_MIRROR, `Access attempt while disabled from ${requestContext.ip}`);
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Smart Mirror Not Available</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #1a1a1a;
            color: #fff;
          }
          .message {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          h1 { margin: 0 0 20px 0; font-size: 24px; }
          p { margin: 10px 0; color: #aaa; }
          a { color: #4a9eff; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="message">
          <h1>📱 Smart Mirror Dashboard</h1>
          <p>The Smart Mirror dashboard is currently disabled.</p>
          <p>Please enable it in the <a href="/admin">admin settings</a>.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  // Check if dashboard HTML file exists
  const dashboardPath = path.join(__dirname, 'public', 'smart-mirror.html');
  const fileExists = fs.existsSync(dashboardPath);
  
  logger.debug(logger.categories.SMART_MIRROR, `Checking dashboard file: ${dashboardPath}`);
  logger.logSmartMirrorDiagnostics('Dashboard file check (landscape)', {
    filePath: dashboardPath,
    fileExists: fileExists,
    absolutePath: path.resolve(dashboardPath),
    workingDirectory: process.cwd()
  });
  
  if (!fileExists) {
    const errorMsg = `Smart Mirror dashboard file not found at ${dashboardPath}`;
    console.error('❌ [Smart Mirror]', errorMsg);
    logger.error(logger.categories.SMART_MIRROR, errorMsg);
    logger.error(logger.categories.SMART_MIRROR, 
      `TROUBLESHOOTING: Expected file at: ${path.resolve(dashboardPath)}. ` +
      `Check if file exists in deployment. Working directory: ${process.cwd()}`
    );
    
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Smart Mirror Dashboard Error</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #1a1a1a;
            color: #fff;
          }
          .message {
            text-align: center;
            padding: 40px;
            background: rgba(255, 50, 50, 0.1);
            border-radius: 10px;
            border: 1px solid rgba(255, 50, 50, 0.3);
            max-width: 600px;
          }
          h1 { margin: 0 0 20px 0; font-size: 24px; color: #ff5555; }
          p { margin: 10px 0; color: #aaa; }
          code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <div class="message">
          <h1>❌ Dashboard File Not Found</h1>
          <p>The Smart Mirror dashboard file could not be found.</p>
          <p><strong>Expected location:</strong> <code>${dashboardPath}</code></p>
          <p>Please check your deployment and ensure all files are properly copied.</p>
          <p>Check the logs in <a href="/admin" style="color: #4a9eff;">admin dashboard</a> for more details.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  // Set cache-control headers to prevent browser caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  console.log('📱 [Smart Mirror] Dashboard accessed (landscape mode) - feature is enabled');
  logger.success(logger.categories.SMART_MIRROR, `Dashboard file served successfully (landscape) to ${requestContext.ip}`);
  logger.info(logger.categories.SMART_MIRROR, `Serving: ${dashboardPath}`);
  
  res.sendFile(dashboardPath);
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
    logError(logger.categories.CLIENT, err, {
      operation: 'Set client password',
      hasExistingPassword: !!loadClientPasswordHash()
    });
    
    res.status(500).json({ 
      error: 'Failed to set password',
      details: err.message,
      solution: 'Check that the config directory exists and is writable. Verify sufficient disk space is available.'
    });
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
    logError(logger.categories.CLIENT, err, {
      operation: 'Change client password'
    });
    
    res.status(500).json({ 
      error: 'Failed to change password',
      details: err.message,
      solution: 'Verify your current password is correct. Check that the config directory is writable and has sufficient space.'
    });
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
    logError(logger.categories.CLIENT, err, {
      operation: 'Remove client password'
    });
    
    res.status(500).json({ 
      error: 'Failed to remove password',
      details: err.message,
      solution: 'Verify your current password is correct. Check that the config directory is writable.'
    });
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

// Update account display name
app.post('/admin/api/finance/accounts/:id/display-name', requireAuth, (req, res) => {
  try {
    const { displayName } = req.body;
    const result = finance.updateAccountDisplayName(req.params.id, displayName);
    if (result.success) {
      logger.success(logger.categories.FINANCE, `Account display name updated: ${displayName || '(cleared)'}`);
      res.json({ success: true, message: 'Display name updated successfully' });
    } else {
      logger.error(logger.categories.FINANCE, `Failed to update display name: ${result.error}`);
      res.status(404).json({ success: false, error: result.error });
    }
  } catch (err) {
    logger.error(logger.categories.FINANCE, `Display name update error: ${err.message}`);
    res.status(500).json({ error: 'Failed to update display name: ' + err.message });
  }
});

// Merge accounts
app.post('/admin/api/finance/accounts/merge', requireAuth, (req, res) => {
  try {
    const { accountIds } = req.body;
    
    if (!accountIds || !Array.isArray(accountIds)) {
      return res.status(400).json({ 
        success: false, 
        error: 'accountIds array is required' 
      });
    }
    
    const result = finance.mergeAccounts(accountIds);
    
    if (result.success) {
      logger.success(logger.categories.FINANCE, 
        `Merged ${result.mergedCount} accounts into ${result.survivingAccount.name}`);
      res.json(result);
    } else {
      logger.error(logger.categories.FINANCE, `Failed to merge accounts: ${result.error}`);
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error(logger.categories.FINANCE, `Account merge error: ${err.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to merge accounts: ' + err.message 
    });
  }
});

// Unmerge a previously merged account
app.post('/admin/api/finance/accounts/:id/unmerge', requireAuth, (req, res) => {
  try {
    const accountId = req.params.id;
    const { manualBalances } = req.body || {};
    
    const result = finance.unmergeAccount(accountId, manualBalances || {});
    
    if (result.success) {
      logger.success(logger.categories.FINANCE, 
        `Unmerged account ${accountId}, recreated ${result.recreatedCount} account(s)`);
      res.json(result);
    } else {
      logger.error(logger.categories.FINANCE, `Failed to unmerge account: ${result.error}`);
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error(logger.categories.FINANCE, `Account unmerge error: ${err.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to unmerge account: ' + err.message 
    });
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

// Get history grouped by account type
app.get('/admin/api/finance/history/by-type', requireAuth, (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const history = finance.getHistoryByAccountType(startDate, endDate);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get history by type: ' + err.message });
  }
});

// Get net worth history
app.get('/admin/api/finance/history/net-worth', requireAuth, (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const history = finance.getNetWorthHistory(startDate, endDate);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get net worth history: ' + err.message });
  }
});

// Get account balance history
app.get('/admin/api/finance/history/account/:accountId', requireAuth, (req, res) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate } = req.query;
    const history = finance.getAccountBalanceHistory(accountId, startDate, endDate);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get account balance history: ' + err.message });
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

// Upload and process account screenshot
app.post('/admin/api/finance/upload-screenshot', requireAuth, upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    console.log('📤 [Finance] Screenshot uploaded, processing...');
    
    // Process the uploaded screenshot
    const result = await finance.processAccountScreenshot(req.file.path);
    
    res.json(result);
  } catch (err) {
    console.error('❌ [Finance] Screenshot upload error:', err.message);
    
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        const fs = require('fs');
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      } catch (cleanupErr) {
        console.error('⚠️ [Finance] Failed to cleanup file:', cleanupErr.message);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process screenshot: ' + err.message 
    });
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

// Webhook Management API Endpoints
// Get all webhooks
app.get('/admin/api/webhooks', requireAuth, (req, res) => {
  try {
    const allWebhooks = webhooks.getAllWebhooks();
    logger.log(`📡 Retrieved ${allWebhooks.length} webhooks`, 'WEBHOOKS');
    res.json({ success: true, webhooks: allWebhooks });
  } catch (err) {
    logger.error(`Failed to get webhooks: ${err.message}`, 'WEBHOOKS');
    res.status(500).json({ success: false, error: 'Failed to get webhooks: ' + err.message });
  }
});

// Create or update a webhook
app.post('/admin/api/webhooks', requireAuth, (req, res) => {
  try {
    const { id, name, url, highImpact } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ 
        success: false, 
        error: 'Webhook name and URL are required' 
      });
    }
    
    const result = webhooks.saveWebhook({ id, name, url, highImpact });
    
    if (result.success) {
      logger.log(`📡 ${id ? 'Updated' : 'Created'} webhook: ${name}`, 'WEBHOOKS');
      res.json({ success: true, message: `Webhook ${id ? 'updated' : 'created'} successfully` });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    logger.error(`Failed to save webhook: ${err.message}`, 'WEBHOOKS');
    res.status(500).json({ success: false, error: 'Failed to save webhook: ' + err.message });
  }
});

// Delete a webhook
app.delete('/admin/api/webhooks/:id', requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const result = webhooks.deleteWebhook(id);
    
    if (result.success) {
      logger.log(`📡 Deleted webhook: ${id}`, 'WEBHOOKS');
      res.json({ success: true, message: 'Webhook deleted successfully' });
    } else {
      res.status(404).json(result);
    }
  } catch (err) {
    logger.error(`Failed to delete webhook: ${err.message}`, 'WEBHOOKS');
    res.status(500).json({ success: false, error: 'Failed to delete webhook: ' + err.message });
  }
});

// Trigger a webhook
app.post('/admin/api/webhooks/:id/trigger', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body.payload || {};
    
    logger.log(`📡 Triggering webhook: ${id}`, 'WEBHOOKS');
    const result = await webhooks.triggerWebhook(id, payload);
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Webhook triggered successfully',
        status: result.status,
        data: result.data
      });
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    logger.error(`Failed to trigger webhook: ${err.message}`, 'WEBHOOKS');
    res.status(500).json({ success: false, error: 'Failed to trigger webhook: ' + err.message });
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

// Smart Mirror Dashboard API Endpoints
// Get Smart Mirror configuration (public endpoint - no auth)
app.get('/api/smart-mirror/config', (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString()
  };
  
  // Get optional orientation parameter
  const orientation = req.query.orientation; // 'portrait', 'landscape', or undefined
  
  logger.info(logger.categories.SMART_MIRROR, `Public config API requested from ${requestContext.ip} (orientation: ${orientation || 'all'})`);
  
  try {
    // Set cache-control headers to prevent browser caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    logger.debug(logger.categories.SMART_MIRROR, 'Cache-control headers set for config API');
    
    const config = smartMirror.getPublicConfig(orientation);
    console.log('📱 [Smart Mirror] Public config requested');
    logger.success(logger.categories.SMART_MIRROR, `Public config returned successfully (enabled: ${config.enabled}, orientation: ${orientation || 'all'})`);
    logger.logSmartMirrorDiagnostics('Public config API response', {
      request: requestContext,
      orientation: orientation || 'all',
      configEnabled: config.enabled,
      widgetCount: Object.keys(config.widgets || {}).length,
      enabledWidgets: Object.keys(config.widgets || {}).filter(k => config.widgets[k]?.enabled)
    });
    
    res.json({ success: true, config });
  } catch (err) {
    console.error('❌ [Smart Mirror] Error getting public config:', err.message);
    logger.error(logger.categories.SMART_MIRROR, `Public config API error: ${err.message} (stack: ${err.stack})`);
    res.status(500).json({ success: false, error: 'Failed to get Smart Mirror configuration' });
  }
});

// Save Smart Mirror configuration (admin endpoint - auth required)
app.post('/admin/api/smart-mirror/config', requireAuth, (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    user: req.session?.user || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `Admin config save requested by ${requestContext.user} from ${requestContext.ip}`);
  
  try {
    const newConfig = req.body;
    
    console.log('📱 [Smart Mirror] Saving configuration...');
    logger.info(logger.categories.SMART_MIRROR, 'Admin configuration update requested');
    logger.logSmartMirrorDiagnostics('Admin config save', {
      request: requestContext,
      configEnabled: newConfig.enabled,
      theme: newConfig.theme,
      widgetCount: Object.keys(newConfig.widgets || {}).length,
      enabledWidgets: Object.keys(newConfig.widgets || {}).filter(k => newConfig.widgets[k]?.enabled),
      configSnapshot: {
        enabled: newConfig.enabled,
        theme: newConfig.theme,
        gridSize: newConfig.gridSize
      }
    });
    
    const result = smartMirror.saveConfig(newConfig);
    
    if (result.success) {
      console.log('✅ [Smart Mirror] Configuration saved successfully');
      logger.success(logger.categories.SMART_MIRROR, `Configuration saved successfully by ${requestContext.user}`);
      res.json({ success: true, message: 'Configuration saved successfully', config: result.config });
    } else {
      console.error('❌ [Smart Mirror] Failed to save configuration:', result.error);
      logger.error(logger.categories.SMART_MIRROR, `Config save failed: ${result.error}`);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error('❌ [Smart Mirror] Error saving config:', err.message);
    logger.error(logger.categories.SMART_MIRROR, `Config save error: ${err.message} (stack: ${err.stack})`);
    res.status(500).json({ success: false, error: 'Failed to save Smart Mirror configuration' });
  }
});

// Get full Smart Mirror configuration (admin endpoint - auth required)
app.get('/admin/api/smart-mirror/config', requireAuth, (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    user: req.session?.user || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `Admin config requested by ${requestContext.user} from ${requestContext.ip}`);
  
  try {
    const config = smartMirror.loadConfig();
    console.log('📱 [Smart Mirror] Admin config requested');
    logger.success(logger.categories.SMART_MIRROR, `Admin config returned (enabled: ${config.enabled})`);
    logger.logSmartMirrorDiagnostics('Admin config API response', {
      request: requestContext,
      configEnabled: config.enabled,
      widgetCount: Object.keys(config.widgets || {}).length
    });
    
    res.json({ success: true, config });
  } catch (err) {
    console.error('❌ [Smart Mirror] Error getting admin config:', err.message);
    logger.error(logger.categories.SMART_MIRROR, `Admin config error: ${err.message} (stack: ${err.stack})`);
    res.status(500).json({ success: false, error: 'Failed to get Smart Mirror configuration' });
  }
});

// Get Smart Mirror diagnostics (admin endpoint - auth required)
app.get('/admin/api/smart-mirror/diagnostics', requireAuth, (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    user: req.session?.user || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `Diagnostics requested by ${requestContext.user} from ${requestContext.ip}`);
  
  try {
    const os = require('os');
    const dashboardPath = path.join(__dirname, 'public', 'smart-mirror.html');
    const configFile = path.join(__dirname, 'config', 'smartmirror-config.json.enc');
    const config = smartMirror.loadConfig();
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        isDocker: fs.existsSync('/.dockerenv'),
        isPortainer: !!process.env.PORTAINER_ENDPOINT,
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        nodeVersion: process.version,
        uptime: Math.floor(process.uptime()),
        memory: {
          total: Math.floor(os.totalmem() / 1024 / 1024),
          free: Math.floor(os.freemem() / 1024 / 1024),
          used: Math.floor((os.totalmem() - os.freemem()) / 1024 / 1024)
        }
      },
      paths: {
        workingDirectory: process.cwd(),
        moduleDirectory: __dirname,
        dashboardFile: dashboardPath,
        configFile: configFile,
        publicDirectory: path.join(__dirname, 'public')
      },
      fileChecks: {
        dashboardExists: fs.existsSync(dashboardPath),
        dashboardSize: fs.existsSync(dashboardPath) ? fs.statSync(dashboardPath).size : 0,
        configExists: fs.existsSync(configFile),
        configSize: fs.existsSync(configFile) ? fs.statSync(configFile).size : 0,
        publicDirExists: fs.existsSync(path.join(__dirname, 'public'))
      },
      configuration: {
        enabled: config.enabled,
        theme: config.theme,
        widgetCount: Object.keys(config.widgets || {}).length,
        enabledWidgets: Object.keys(config.widgets || {}).filter(k => config.widgets[k]?.enabled),
        hasCustomEncryptionKey: !!process.env.SMARTMIRROR_KEY
      },
      logs: {
        recent: logger.getLogs(logger.categories.SMART_MIRROR, 10)
      }
    };
    
    // Add warnings if issues detected
    diagnostics.warnings = [];
    if (!diagnostics.fileChecks.dashboardExists) {
      diagnostics.warnings.push({
        level: 'ERROR',
        message: `Dashboard file not found at ${dashboardPath}`,
        solution: 'Ensure smart-mirror.html exists in the public directory'
      });
    }
    if (!diagnostics.configuration.enabled) {
      diagnostics.warnings.push({
        level: 'INFO',
        message: 'Smart Mirror dashboard is currently disabled',
        solution: 'Enable it in the admin settings'
      });
    }
    if (!diagnostics.configuration.hasCustomEncryptionKey) {
      diagnostics.warnings.push({
        level: 'WARNING',
        message: 'Using default encryption key',
        solution: 'Set SMARTMIRROR_KEY environment variable for production'
      });
    }
    
    logger.success(logger.categories.SMART_MIRROR, 'Diagnostics data collected successfully');
    res.json({ success: true, diagnostics });
  } catch (err) {
    console.error('❌ [Smart Mirror] Error getting diagnostics:', err.message);
    logger.error(logger.categories.SMART_MIRROR, `Diagnostics error: ${err.message} (stack: ${err.stack})`);
    res.status(500).json({ success: false, error: 'Failed to get Smart Mirror diagnostics' });
  }
});

// Export Smart Mirror logs (admin endpoint - auth required)
app.get('/admin/api/smart-mirror/logs/export', requireAuth, (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    user: req.session?.user || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `Log export requested by ${requestContext.user} from ${requestContext.ip}`);
  
  try {
    const logs = logger.getLogs(logger.categories.SMART_MIRROR);
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: requestContext.user,
      category: logger.categories.SMART_MIRROR,
      totalLogs: logs.length,
      logs: logs
    };
    
    const fileName = `smart-mirror-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.json(exportData);
    
    logger.success(logger.categories.SMART_MIRROR, `Logs exported by ${requestContext.user} (${logs.length} entries)`);
  } catch (err) {
    console.error('❌ [Smart Mirror] Error exporting logs:', err.message);
    logger.error(logger.categories.SMART_MIRROR, `Log export error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to export Smart Mirror logs' });
  }
});

// Smart Mirror Widget Connection Test Endpoints (Admin - auth required)

// Test weather widget connection
app.post('/admin/api/smart-mirror/test/weather', requireAuth, async (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    user: req.session?.user || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `Weather connection test requested by ${requestContext.user} from ${requestContext.ip}`);
  
  try {
    const { apiKey, location, units } = req.body;
    
    if (!apiKey || !location) {
      return res.status(400).json({
        success: false,
        error: 'Missing Parameters',
        message: 'API key and location are required.'
      });
    }
    
    const result = await smartMirror.testWeatherConnection(apiKey, location, units || 'imperial');
    
    if (result.success) {
      logger.success(logger.categories.SMART_MIRROR, `Weather test successful for ${location}`);
    } else {
      logger.warning(logger.categories.SMART_MIRROR, `Weather test failed: ${result.error}`);
    }
    
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Weather test error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Test Failed',
      message: 'An unexpected error occurred while testing the weather connection.'
    });
  }
});

// Test calendar widget connection
app.post('/admin/api/smart-mirror/test/calendar', requireAuth, async (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    user: req.session?.user || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `Calendar connection test requested by ${requestContext.user} from ${requestContext.ip}`);
  
  try {
    const { feedUrls } = req.body;
    
    if (!feedUrls || !Array.isArray(feedUrls)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Parameters',
        message: 'feedUrls must be an array of calendar feed URLs.'
      });
    }
    
    const result = await smartMirror.testCalendarFeed(feedUrls);
    
    if (result.success) {
      logger.success(logger.categories.SMART_MIRROR, `Calendar test successful: ${result.summary.successful}/${result.summary.total} feeds`);
    } else {
      logger.warning(logger.categories.SMART_MIRROR, `Calendar test completed with errors: ${result.summary.failed}/${result.summary.total} feeds failed`);
    }
    
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Calendar test error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Test Failed',
      message: 'An unexpected error occurred while testing the calendar connection.'
    });
  }
});

// Test news widget connection
app.post('/admin/api/smart-mirror/test/news', requireAuth, async (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    user: req.session?.user || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `News connection test requested by ${requestContext.user} from ${requestContext.ip}`);
  
  try {
    const { feedUrls } = req.body;
    
    if (!feedUrls || !Array.isArray(feedUrls)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Parameters',
        message: 'feedUrls must be an array of news feed URLs.'
      });
    }
    
    const result = await smartMirror.testNewsFeed(feedUrls);
    
    if (result.success) {
      logger.success(logger.categories.SMART_MIRROR, `News test successful: ${result.summary.successful}/${result.summary.total} feeds`);
    } else {
      logger.warning(logger.categories.SMART_MIRROR, `News test completed with errors: ${result.summary.failed}/${result.summary.total} feeds failed`);
    }
    
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `News test error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Test Failed',
      message: 'An unexpected error occurred while testing the news connection.'
    });
  }
});

// Test media widget (Home Assistant) connection
app.post('/admin/api/smart-mirror/test/media', requireAuth, async (req, res) => {
  const requestContext = {
    ip: req.ip || req.connection.remoteAddress,
    user: req.session?.user || 'unknown',
    timestamp: new Date().toISOString()
  };
  
  logger.info(logger.categories.SMART_MIRROR, `Media (Home Assistant) connection test requested by ${requestContext.user} from ${requestContext.ip}`);
  
  try {
    const { url, token, entityIds } = req.body;
    
    if (!url || !token) {
      return res.status(400).json({
        success: false,
        error: 'Missing Parameters',
        message: 'Home Assistant URL and access token are required.'
      });
    }
    
    const result = await smartMirror.testHomeAssistantMedia(url, token, entityIds || []);
    
    if (result.success) {
      logger.success(logger.categories.SMART_MIRROR, `Home Assistant test successful for ${url}`);
    } else {
      logger.warning(logger.categories.SMART_MIRROR, `Home Assistant test failed: ${result.error}`);
    }
    
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Home Assistant test error: ${err.message}`);
    res.status(500).json({
      success: false,
      error: 'Test Failed',
      message: 'An unexpected error occurred while testing the Home Assistant connection.'
    });
  }
});

// Admin API endpoints for calendar cache management

// Get calendar cache status
app.get('/admin/api/smart-mirror/calendar/cache-status', requireAuth, (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Calendar cache status requested');
  
  try {
    const status = smartMirror.getCalendarCacheStatus();
    res.json({ success: true, cache: status });
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Calendar cache status error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to get cache status' });
  }
});

// Manually refresh calendar cache
app.post('/admin/api/smart-mirror/calendar/refresh', requireAuth, async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Manual calendar cache refresh requested');
  
  try {
    const result = await smartMirror.refreshCalendarCache();
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Calendar cache refresh error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to refresh calendar cache' });
  }
});

// Smart Mirror Widget Data API Endpoints (Public - no auth required)

// Fetch calendar events
app.get('/api/smart-mirror/calendar', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Calendar data requested');
  
  try {
    const config = smartMirror.loadConfig();
    const calendarConfig = config.widgets?.calendar;
    
    if (!calendarConfig || !calendarConfig.enabled) {
      return res.json({ success: false, error: 'Calendar widget not enabled', events: [] });
    }
    
    // Get cache TTL from config for HTTP headers (fetchCalendarEvents will also load config internally)
    const cacheTTL = config.calendarCacheTTL || smartMirror.DEFAULT_CALENDAR_CACHE_TTL;
    
    // Set cache-control headers to allow client-side caching
    res.setHeader('Cache-Control', `public, max-age=${cacheTTL}`);
    res.setHeader('Expires', new Date(Date.now() + cacheTTL * 1000).toUTCString());
    
    const result = await smartMirror.fetchCalendarEvents(calendarConfig.calendarUrls || []);
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Calendar API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch calendar events', events: [] });
  }
});

// Fetch news items
app.get('/api/smart-mirror/news', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'News data requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const config = smartMirror.loadConfig();
    const newsConfig = config.widgets?.news;
    
    if (!newsConfig || !newsConfig.enabled) {
      return res.json({ success: false, error: 'News widget not enabled', items: [] });
    }
    
    const result = await smartMirror.fetchNews(newsConfig.feedUrls || []);
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `News API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch news', items: [] });
  }
});

// Fetch current weather
app.get('/api/smart-mirror/weather', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Weather data requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const config = smartMirror.loadConfig();
    const weatherConfig = config.widgets?.weather;
    
    if (!weatherConfig || !weatherConfig.enabled) {
      return res.json({ success: false, error: 'Weather widget not enabled' });
    }
    
    if (!weatherConfig.apiKey || !weatherConfig.location) {
      return res.json({ success: false, error: 'Weather API key and location must be configured' });
    }
    
    const result = await smartMirror.fetchWeather(
      weatherConfig.apiKey,
      weatherConfig.location,
      weatherConfig.units || 'imperial'
    );
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Weather API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch weather data' });
  }
});

// Fetch weather forecast
app.get('/api/smart-mirror/forecast', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Forecast data requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const config = smartMirror.loadConfig();
    const forecastConfig = config.widgets?.forecast;
    
    if (!forecastConfig || !forecastConfig.enabled) {
      return res.json({ success: false, error: 'Forecast widget not enabled' });
    }
    
    if (!forecastConfig.apiKey || !forecastConfig.location) {
      return res.json({ success: false, error: 'Forecast API key and location must be configured' });
    }
    
    const result = await smartMirror.fetchForecast(
      forecastConfig.apiKey,
      forecastConfig.location,
      forecastConfig.days || 5,
      forecastConfig.units || 'imperial'
    );
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Forecast API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch forecast data' });
  }
});

// Rain forecast endpoint for Smart Widget
app.get('/api/smart-mirror/rain-forecast', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Rain forecast data requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const config = smartMirror.loadConfig();
    const smartWidgetConfig = config.widgets?.smartWidget;
    
    if (!smartWidgetConfig || !smartWidgetConfig.enabled) {
      return res.json({ success: false, error: 'Smart Widget not enabled' });
    }
    
    if (!smartWidgetConfig.apiKey || !smartWidgetConfig.location) {
      return res.json({ success: false, error: 'Weather API key and location must be configured' });
    }
    
    // Get 5-day forecast
    const result = await smartMirror.fetchForecast(
      smartWidgetConfig.apiKey,
      smartWidgetConfig.location,
      5,
      smartWidgetConfig.units || 'imperial'
    );
    
    if (!result.success) {
      return res.json(result);
    }
    
    // Analyze forecast for rain
    const rainDays = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    result.forecast.days.forEach((day, index) => {
      const dayDate = new Date(day.date);
      const daysFromNow = Math.round((dayDate - today) / (1000 * 60 * 60 * 24));
      
      // Check if there's rain in the forecast
      // Rain conditions include: Rain, Drizzle, Thunderstorm, or high precipitation probability
      const hasRain = day.description.toLowerCase().includes('rain') ||
                      day.description.toLowerCase().includes('drizzle') ||
                      day.description.toLowerCase().includes('thunderstorm') ||
                      (day.pop && day.pop.length > 0 && Math.max(...day.pop) > 0.3); // 30% or higher
      
      if (hasRain && daysFromNow >= 0) {
        rainDays.push({
          daysFromNow: daysFromNow,
          date: day.date,
          description: day.description,
          precipitation: day.pop && day.pop.length > 0 ? Math.max(...day.pop) : 0
        });
      }
    });
    
    res.json({
      success: true,
      hasRain: rainDays.length > 0,
      rainDays: rainDays,
      location: smartWidgetConfig.location
    });
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Rain forecast API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch rain forecast data' });
  }
});

// Fetch air quality data
app.get('/api/smart-mirror/air-quality', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Air quality data requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const config = smartMirror.loadConfig();
    const airQualityConfig = config.widgets?.airQuality;
    
    if (!airQualityConfig || !airQualityConfig.enabled) {
      return res.json({ success: false, error: 'Air Quality widget not enabled' });
    }
    
    if (!airQualityConfig.apiKey || !airQualityConfig.location) {
      return res.json({ success: false, error: 'Air Quality API key and location must be configured' });
    }
    
    const result = await smartMirror.fetchAirQuality(
      airQualityConfig.apiKey,
      airQualityConfig.location,
      airQualityConfig.units || 'imperial'
    );
    
    // Add highlight configuration to the response
    if (result.success && result.data) {
      result.data.highlightEnabled = airQualityConfig.highlightFavorableConditions !== false;
    }
    
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Air quality API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch air quality data' });
  }
});

// Fetch Home Assistant media player state
// Using closure to encapsulate cache state for this endpoint only
app.get('/api/smart-mirror/media', (() => {
  // Private cache state for this endpoint
  const cache = {
    lastRequest: 0,
    lastResult: null,
    minInterval: smartMirror.CACHE_MIN_INTERVAL_MS // Use constant from smartMirror module
  };
  
  return async (req, res) => {
    logger.info(logger.categories.SMART_MIRROR, 'Media player data requested');
    
    try {
      // Set cache-control headers
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const config = smartMirror.loadConfig();
      const mediaConfig = config.widgets?.media;
      
      if (!mediaConfig || !mediaConfig.enabled) {
        return res.json({ success: false, error: 'Media widget not enabled' });
      }
      
      if (!mediaConfig.homeAssistantUrl || !mediaConfig.homeAssistantToken) {
        return res.json({ success: false, error: 'Home Assistant URL and token must be configured' });
      }
      
      if (!mediaConfig.entityIds || mediaConfig.entityIds.length === 0) {
        return res.json({ success: false, error: 'At least one media player entity ID must be configured' });
      }
      
      // Check if we have a recent cached result to prevent spamming HA
      const now = Date.now();
      const timeSinceLastRequest = now - cache.lastRequest;
      
      // Cache both success and error responses to prevent repeated failed requests
      if (timeSinceLastRequest < cache.minInterval && cache.lastResult !== null) {
        logger.debug(logger.categories.SMART_MIRROR, `Returning cached media data (${timeSinceLastRequest}ms since last request)`);
        return res.json(cache.lastResult);
      }
      
      // Update cache timestamp before making request to prevent race conditions
      cache.lastRequest = now;
      
      const result = await smartMirror.fetchHomeAssistantMedia(
        mediaConfig.homeAssistantUrl,
        mediaConfig.homeAssistantToken,
        mediaConfig.entityIds
      );
      
      // Cache the result (both success and error responses)
      cache.lastResult = result;
      
      res.json(result);
    } catch (err) {
      logger.error(logger.categories.SMART_MIRROR, `Media API error: ${err.message}`);
      const errorResult = { success: false, error: 'Failed to fetch media player data' };
      
      // Cache error responses too to prevent repeated failed requests
      cache.lastResult = errorResult;
      
      res.status(500).json(errorResult);
    }
  };
})());

// Fetch vacation data for smart mirror (public endpoint)
app.get('/api/smart-mirror/vacation', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Vacation data requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const config = smartMirror.loadConfig();
    const vacationConfig = config.widgets?.vacation;
    
    if (!vacationConfig || !vacationConfig.enabled) {
      return res.json({ success: false, error: 'Vacation widget not enabled' });
    }
    
    // Get vacation data from house module
    const vacationData = house.getVacationData();
    
    // Filter for upcoming vacations only (start date is today or in the future)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcomingVacations = (vacationData.dates || [])
      .filter(vacation => {
        const startDate = new Date(vacation.startDate);
        return startDate >= today;
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    res.json({ 
      success: true, 
      vacations: upcomingVacations 
    });
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Vacation API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch vacation data' });
  }
});

// Test location for weather availability (for admin validation)
app.post('/admin/api/smart-mirror/test-location', requireAuth, async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Testing location for weather availability');
  
  try {
    const { location } = req.body;
    
    if (!location) {
      return res.status(400).json({ success: false, error: 'Location is required' });
    }
    
    const config = smartMirror.loadConfig();
    const apiKey = config.widgets?.weather?.apiKey || config.widgets?.forecast?.apiKey;
    
    if (!apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Weather API key not configured. Please configure a weather widget first.' 
      });
    }
    
    const units = config.widgets?.weather?.units || 'imperial';
    const result = await smartMirror.testWeatherConnection(apiKey, location, units);
    
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Location test error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to test location' });
  }
});

// Fetch weather forecast for a specific location (used by vacation widget)
app.get('/api/smart-mirror/vacation-weather', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Vacation weather requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const { location } = req.query;
    
    if (!location) {
      return res.status(400).json({ success: false, error: 'Location parameter is required' });
    }
    
    const config = smartMirror.loadConfig();
    const vacationConfig = config.widgets?.vacation;
    
    if (!vacationConfig || !vacationConfig.enabled) {
      return res.json({ success: false, error: 'Vacation widget not enabled' });
    }
    
    // Use weather API key from weather or forecast widget
    const apiKey = config.widgets?.weather?.apiKey || config.widgets?.forecast?.apiKey;
    const units = config.widgets?.weather?.units || config.widgets?.forecast?.units || 'imperial';
    
    if (!apiKey) {
      return res.json({ success: false, error: 'Weather API key not configured' });
    }
    
    // Try to fetch 5-day forecast, fallback to current weather
    let result = await smartMirror.fetchForecast(apiKey, location, 5, units);
    
    if (!result.success) {
      // Fallback to current weather
      const weatherResult = await smartMirror.fetchWeather(apiKey, location, units);
      if (weatherResult.success) {
        // Convert current weather to forecast format
        const weatherData = weatherResult.data;
        result = {
          success: true,
          days: [{
            date: new Date().toISOString().split('T')[0],
            tempHigh: weatherData.temp,
            tempLow: weatherData.tempMin,
            condition: weatherData.condition,
            icon: weatherData.icon,
            description: weatherData.description
          }],
          location: location,
          isFallback: true
        };
      }
      // If weather also failed, result still contains the original forecast error
      // which is appropriate since that was the primary attempt
    }
    
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Vacation weather API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch vacation weather data' });
  }
});

// Fetch timezone information for a location (used by vacation widget)
app.get('/api/smart-mirror/vacation-timezone', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Vacation timezone requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const { location } = req.query;
    
    if (!location) {
      return res.status(400).json({ success: false, error: 'Location parameter is required' });
    }
    
    const config = smartMirror.loadConfig();
    const vacationConfig = config.widgets?.vacation;
    
    if (!vacationConfig || !vacationConfig.enabled) {
      return res.json({ success: false, error: 'Vacation widget not enabled' });
    }
    
    // Use weather API key from weather or forecast widget
    const apiKey = config.widgets?.weather?.apiKey || config.widgets?.forecast?.apiKey;
    
    if (!apiKey) {
      return res.json({ success: false, error: 'Weather API key not configured' });
    }
    
    const result = await smartMirror.fetchLocationTimezone(apiKey, location);
    
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Vacation timezone API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch vacation timezone data' });
  }
});

// Admin endpoint to validate flight information
app.post('/admin/api/vacation/validate-flight', requireAuth, async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Validating flight information');
  
  try {
    const { flightNumber, airline, date } = req.body;
    
    if (!flightNumber || !airline || !date) {
      return res.status(400).json({ 
        success: false, 
        error: 'Flight number, airline, and date are required' 
      });
    }
    
    // Mock validation - in a real implementation, this would call a flight API
    // For now, we'll accept any flight with proper format
    const flightRegex = /^[A-Z]{2,3}\d{1,4}$/i;
    if (!flightRegex.test(flightNumber)) {
      return res.json({
        success: false,
        error: 'Invalid flight number format. Expected format: AB123 or ABC1234'
      });
    }
    
    // Simulate successful validation
    res.json({
      success: true,
      message: 'Flight validated successfully',
      flightInfo: {
        flightNumber: flightNumber.toUpperCase(),
        airline: airline,
        date: date,
        validated: true
      }
    });
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Flight validation error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to validate flight' });
  }
});

// Admin endpoint to toggle flight tracking for a vacation
app.post('/admin/api/vacation/toggle-flight-tracking', requireAuth, async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Toggling flight tracking');
  
  try {
    const { vacationId, enabled } = req.body;
    
    if (!vacationId) {
      return res.status(400).json({ success: false, error: 'Vacation ID is required' });
    }
    
    const vacationData = house.getVacationData();
    const vacation = vacationData.dates.find(d => d.id === vacationId);
    
    if (!vacation) {
      return res.status(404).json({ success: false, error: 'Vacation not found' });
    }
    
    // Update flight tracking status
    const result = house.updateVacationDate(vacationId, {
      ...vacation,
      flightTrackingEnabled: enabled === true
    });
    
    res.json(result);
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Toggle flight tracking error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to toggle flight tracking' });
  }
});

// Public endpoint to fetch flight status for smart mirror display
app.get('/api/smart-mirror/flight-status', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Flight status requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const { flightNumber, airline, date } = req.query;
    
    if (!flightNumber || !airline || !date) {
      return res.status(400).json({ 
        success: false, 
        error: 'Flight number, airline, and date are required' 
      });
    }
    
    const config = smartMirror.loadConfig();
    const vacationConfig = config.widgets?.vacation;
    
    if (!vacationConfig || !vacationConfig.enabled) {
      return res.json({ success: false, error: 'Vacation widget not enabled' });
    }
    
    // Mock flight status - in a real implementation, this would call a flight tracking API
    // For demonstration, we'll return simulated data
    const flightDate = new Date(date);
    flightDate.setHours(0, 0, 0, 0); // Normalize to start of day
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Normalize to start of day
    const isPast = flightDate < now;
    const timeDiff = flightDate - now;
    const isSoon = timeDiff >= 0 && timeDiff < 2 * 24 * 60 * 60 * 1000; // Today or tomorrow
    
    // Simulate different statuses based on timing
    let status = 'Scheduled';
    let gate = null;
    let terminal = null;
    let departureTime = null;
    let arrivalTime = null;
    
    if (isPast) {
      status = 'Completed';
    } else if (isSoon) {
      status = Math.random() > 0.7 ? 'Delayed' : 'On Time';
      gate = `${String.fromCharCode(65 + Math.floor(Math.random() * 5))}${Math.floor(Math.random() * 30) + 1}`;
      terminal = Math.floor(Math.random() * 3) + 1;
      departureTime = new Date(flightDate.getTime() + (Math.random() - 0.5) * 60 * 60 * 1000).toISOString();
    }
    
    res.json({
      success: true,
      data: {
        flightNumber: flightNumber.toUpperCase(),
        airline: airline,
        date: date,
        status: status,
        gate: gate,
        terminal: terminal,
        departureTime: departureTime,
        arrivalTime: arrivalTime,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Flight status API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch flight status' });
  }
});

// Smart Widget data aggregation endpoint
app.get('/api/smart-mirror/smart-widget', async (req, res) => {
  logger.info(logger.categories.SMART_MIRROR, 'Smart Widget data requested');
  
  try {
    // Set cache-control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const smartMirrorConfig = smartMirror.loadConfig();
    const smartWidgetConfig = smartMirrorConfig.widgets?.smartWidget;
    
    if (!smartWidgetConfig || !smartWidgetConfig.enabled) {
      return res.json({ success: false, error: 'Smart Widget not enabled' });
    }
    
    const subWidgets = smartWidgetConfig.subWidgets || [];
    const activeSubWidgets = [];
    
    // Process each enabled sub-widget
    for (const subWidget of subWidgets) {
      if (!subWidget.enabled) continue;
      
      try {
        let subWidgetData = null;
        
        switch (subWidget.type) {
          case 'rainForecast':
            // Check for rain in forecast
            if (smartWidgetConfig.apiKey && smartWidgetConfig.location) {
              const forecastResult = await smartMirror.fetchForecast(
                smartWidgetConfig.apiKey,
                smartWidgetConfig.location,
                5,
                smartWidgetConfig.units || 'imperial'
              );
              
              if (forecastResult.success) {
                const rainDays = [];
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                forecastResult.forecast.days.forEach((day) => {
                  const dayDate = new Date(day.date);
                  const daysFromNow = Math.round((dayDate - today) / (1000 * 60 * 60 * 24));
                  
                  const hasRain = day.description.toLowerCase().includes('rain') ||
                                  day.description.toLowerCase().includes('drizzle') ||
                                  day.description.toLowerCase().includes('thunderstorm') ||
                                  (day.pop && day.pop.length > 0 && Math.max(...day.pop) > 0.3);
                  
                  if (hasRain && daysFromNow >= 0 && daysFromNow <= 5) {
                    rainDays.push({
                      daysFromNow: daysFromNow,
                      date: day.date,
                      description: day.description,
                      precipitation: day.pop && day.pop.length > 0 ? Math.max(...day.pop) : 0
                    });
                  }
                });
                
                if (rainDays.length > 0) {
                  subWidgetData = {
                    type: 'rainForecast',
                    priority: subWidget.priority,
                    hasContent: true,
                    data: {
                      hasRain: true,
                      rainDays: rainDays,
                      location: smartWidgetConfig.location
                    }
                  };
                }
              }
            }
            break;
            
          case 'upcomingVacation':
            // Get upcoming vacations from house module
            const vacationData = house.getVacationData();
            if (vacationData.dates && vacationData.dates.length > 0) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              // Find upcoming vacations
              const upcomingVacations = vacationData.dates
                .filter(vac => new Date(vac.startDate) >= today)
                .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
              
              if (upcomingVacations.length > 0) {
                // Return all upcoming vacations (up to 3) with their details
                const vacationsToShow = upcomingVacations.slice(0, 3).map(vacation => {
                  const startDate = new Date(vacation.startDate);
                  const daysUntil = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));
                  return {
                    destination: vacation.destination,
                    startDate: vacation.startDate,
                    endDate: vacation.endDate,
                    daysUntil: daysUntil
                  };
                });
                
                subWidgetData = {
                  type: 'upcomingVacation',
                  priority: subWidget.priority,
                  hasContent: true,
                  data: {
                    vacations: vacationsToShow
                  }
                };
              }
            }
            break;
            
          case 'homeAssistantMedia':
            // Get media player status
            if (smartWidgetConfig.homeAssistantUrl && smartWidgetConfig.homeAssistantToken) {
              const entityIds = smartWidgetConfig.entityIds || [];
              if (entityIds.length > 0) {
                const mediaResult = await smartMirror.fetchMediaPlayers(
                  smartWidgetConfig.homeAssistantUrl,
                  smartWidgetConfig.homeAssistantToken,
                  entityIds
                );
                
                if (mediaResult.success && mediaResult.players && mediaResult.players.length > 0) {
                  // Only include if media is actually playing
                  const activePlayers = mediaResult.players.filter(p => 
                    p.state === 'playing' || p.state === 'paused'
                  );
                  
                  if (activePlayers.length > 0) {
                    subWidgetData = {
                      type: 'homeAssistantMedia',
                      priority: subWidget.priority,
                      hasContent: true,
                      data: {
                        players: activePlayers
                      }
                    };
                  }
                }
              }
            }
            break;
            
          case 'party':
            // Get next party from party scheduling
            const partyScheduling = config.partyScheduling;
            if (partyScheduling && partyScheduling.dateTime && partyScheduling.dateTime.date) {
              // Normalize date to string format (YYYY-MM-DD) for consistent handling
              let normalizedDateString;
              if (typeof partyScheduling.dateTime.date === 'string') {
                normalizedDateString = partyScheduling.dateTime.date;
              } else if (partyScheduling.dateTime.date instanceof Date) {
                normalizedDateString = partyScheduling.dateTime.date.toISOString().split('T')[0];
              } else {
                // Try to parse whatever format it is
                try {
                  normalizedDateString = new Date(partyScheduling.dateTime.date).toISOString().split('T')[0];
                } catch (err) {
                  logger.error(logger.categories.SMART_MIRROR, `Invalid party date format: ${partyScheduling.dateTime.date}`);
                  break;
                }
              }
              
              const partyDate = new Date(normalizedDateString);
              partyDate.setHours(0, 0, 0, 0);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              // Validate date is valid
              if (isNaN(partyDate.getTime())) {
                logger.error(logger.categories.SMART_MIRROR, `Invalid party date after parsing: ${normalizedDateString}`);
                break;
              }
              
              // Determine if we should show the widget
              // Show starting 2 weeks (14 days) before party through end of party day
              const twoWeeksBefore = new Date(partyDate);
              twoWeeksBefore.setDate(twoWeeksBefore.getDate() - 14);
              twoWeeksBefore.setHours(0, 0, 0, 0);
              
              // Show widget if today is within the visibility window (2 weeks before through party day)
              if (today >= twoWeeksBefore && today <= partyDate) {
                const daysUntil = Math.ceil((partyDate - today) / (1000 * 60 * 60 * 24));
                
                // Determine party phase
                // Pre-party: 2 weeks before through start time
                // During party: start time through end of day
                const now = new Date();
                let isPartyStarted = false;
                
                if (daysUntil === 0 && partyScheduling.dateTime.startTime) {
                  // Parse start time to check if party has started today
                  const [startHour, startMinute] = partyScheduling.dateTime.startTime.split(':').map(n => parseInt(n, 10));
                  const partyStartDateTime = new Date(partyDate);
                  partyStartDateTime.setHours(startHour, startMinute, 0, 0);
                  
                  if (now >= partyStartDateTime) {
                    isPartyStarted = true;
                  }
                }
                
                // Get all party data
                const tasks = partyScheduling.tasks || [];
                const totalTasks = tasks.length;
                const completedTasks = tasks.filter(t => t.completed).length;
                
                const invitees = partyScheduling.invitees || [];
                const comingCount = invitees.filter(i => i.rsvp === 'coming').length;
                const notComingCount = invitees.filter(i => i.rsvp === 'not-coming').length;
                const pendingCount = invitees.filter(i => i.rsvp === 'pending').length;
                
                // Normalize dateTime to ensure date is always a string in YYYY-MM-DD format
                const normalizedDateTime = {
                  date: normalizedDateString,
                  startTime: partyScheduling.dateTime.startTime || null,
                  endTime: partyScheduling.dateTime.endTime || null
                };
                
                // Fetch weather for party date if weather API is configured
                let weatherData = null;
                const weatherConfig = config.widgets?.weather || {};
                const forecastConfig = config.widgets?.forecast || {};
                const weatherApiKey = weatherConfig.apiKey || forecastConfig.apiKey;
                const weatherLocation = weatherConfig.location || forecastConfig.location;
                const weatherUnits = weatherConfig.units || forecastConfig.units || 'imperial';
                
                if (weatherApiKey && weatherLocation) {
                  try {
                    const weatherResult = await smartMirror.fetchWeatherForDate(
                      weatherApiKey,
                      weatherLocation,
                      normalizedDateString,
                      weatherUnits
                    );
                    
                    if (weatherResult.success) {
                      weatherData = {
                        summary: weatherResult.summary,
                        // Include hourly data only if within 3 days of party
                        hourly: daysUntil <= 3 && daysUntil >= 0 ? weatherResult.hourly : null,
                        units: weatherResult.units,
                        location: weatherResult.location
                      };
                      logger.info(logger.categories.SMART_MIRROR, `Weather data fetched for party date ${normalizedDateString}`);
                    } else {
                      logger.warning(logger.categories.SMART_MIRROR, `Could not fetch weather for party: ${weatherResult.error}`);
                    }
                  } catch (err) {
                    logger.error(logger.categories.SMART_MIRROR, `Error fetching weather for party: ${err.message}`);
                  }
                }
                
                subWidgetData = {
                  type: 'party',
                  priority: subWidget.priority,
                  hasContent: true,
                  data: {
                    dateTime: normalizedDateTime,
                    daysUntil: daysUntil,
                    phase: isPartyStarted ? 'during' : 'pre-party',
                    tasks: {
                      total: totalTasks,
                      completed: completedTasks,
                      list: tasks
                    },
                    invitees: {
                      coming: comingCount,
                      notComing: notComingCount,
                      pending: pendingCount,
                      list: invitees
                    },
                    menu: partyScheduling.menu || [],
                    events: partyScheduling.events || [],
                    weather: weatherData
                  }
                };
              }
            }
            break;
        }
        
        if (subWidgetData) {
          activeSubWidgets.push(subWidgetData);
        }
      } catch (err) {
        logger.error(logger.categories.SMART_MIRROR, `Error fetching sub-widget ${subWidget.type}: ${err.message}`);
      }
    }
    
    // Sort by priority
    activeSubWidgets.sort((a, b) => a.priority - b.priority);
    
    res.json({
      success: true,
      displayMode: smartWidgetConfig.displayMode || 'cycle',
      cycleSpeed: smartWidgetConfig.cycleSpeed || 10,
      simultaneousMax: smartWidgetConfig.simultaneousMax || 2,
      subWidgets: activeSubWidgets
    });
  } catch (err) {
    logger.error(logger.categories.SMART_MIRROR, `Smart Widget API error: ${err.message}`);
    res.status(500).json({ success: false, error: 'Failed to fetch Smart Widget data' });
  }
});

// House API Endpoints
// Get vacation data
app.get('/admin/api/house/vacation', requireAuth, (req, res) => {
  try {
    const vacationData = house.getVacationData();
    res.json(vacationData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get vacation data: ' + err.message });
  }
});

// Save vacation data
app.post('/admin/api/house/vacation', requireAuth, (req, res) => {
  try {
    const result = house.saveVacationData(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Vacation data saved successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save vacation data: ' + err.message });
  }
});

// Add vacation date
app.post('/admin/api/house/vacation/dates', requireAuth, (req, res) => {
  try {
    const result = house.addVacationDate(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Vacation date added successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add vacation date: ' + err.message });
  }
});

// Update vacation date
app.put('/admin/api/house/vacation/dates/:id', requireAuth, (req, res) => {
  try {
    const result = house.updateVacationDate(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, message: 'Vacation date updated successfully' });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update vacation date: ' + err.message });
  }
});

// Delete vacation date
app.delete('/admin/api/house/vacation/dates/:id', requireAuth, (req, res) => {
  try {
    const result = house.deleteVacationDate(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'Vacation date deleted successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete vacation date: ' + err.message });
  }
});

// Add pet
app.post('/admin/api/house/vacation/pets', requireAuth, (req, res) => {
  try {
    const result = house.addPet(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Pet added successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add pet: ' + err.message });
  }
});

// Update pet
app.put('/admin/api/house/vacation/pets/:id', requireAuth, (req, res) => {
  try {
    const result = house.updatePet(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, message: 'Pet updated successfully' });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update pet: ' + err.message });
  }
});

// Delete pet
app.delete('/admin/api/house/vacation/pets/:id', requireAuth, (req, res) => {
  try {
    const result = house.deletePet(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'Pet deleted successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete pet: ' + err.message });
  }
});

// Get documentation data
app.get('/admin/api/house/documentation', requireAuth, (req, res) => {
  try {
    const documentationData = house.getDocumentationData();
    res.json(documentationData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get documentation data: ' + err.message });
  }
});

// Save documentation data
app.post('/admin/api/house/documentation', requireAuth, (req, res) => {
  try {
    const result = house.saveDocumentationData(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Documentation data saved successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save documentation data: ' + err.message });
  }
});

// Add document
app.post('/admin/api/house/documentation/documents', requireAuth, (req, res) => {
  try {
    const result = house.addDocument(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Document added successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add document: ' + err.message });
  }
});

// Update document
app.put('/admin/api/house/documentation/documents/:id', requireAuth, (req, res) => {
  try {
    const result = house.updateDocument(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, message: 'Document updated successfully' });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update document: ' + err.message });
  }
});

// Delete document
app.delete('/admin/api/house/documentation/documents/:id', requireAuth, (req, res) => {
  try {
    const result = house.deleteDocument(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'Document deleted successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete document: ' + err.message });
  }
});

// Add instruction
app.post('/admin/api/house/documentation/instructions', requireAuth, (req, res) => {
  try {
    const result = house.addInstruction(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Instruction added successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add instruction: ' + err.message });
  }
});

// Update instruction
app.put('/admin/api/house/documentation/instructions/:id', requireAuth, (req, res) => {
  try {
    const result = house.updateInstruction(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, message: 'Instruction updated successfully' });
    } else {
      res.status(404).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update instruction: ' + err.message });
  }
});

// Delete instruction
app.delete('/admin/api/house/documentation/instructions/:id', requireAuth, (req, res) => {
  try {
    const result = house.deleteInstruction(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'Instruction deleted successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete instruction: ' + err.message });
  }
});

// Get media center data
app.get('/admin/api/house/mediacenter', requireAuth, (req, res) => {
  try {
    const mediaCenterData = house.getMediaCenterData();
    res.json(mediaCenterData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get media center data: ' + err.message });
  }
});

// Save media center data
app.post('/admin/api/house/mediacenter', requireAuth, (req, res) => {
  try {
    const result = house.saveMediaCenterData(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Media center data saved successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save media center data: ' + err.message });
  }
});

// Add device
app.post('/admin/api/house/mediacenter/devices', requireAuth, (req, res) => {
  try {
    const result = house.addDevice(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Device added successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add device: ' + err.message });
  }
});

// Update device
app.put('/admin/api/house/mediacenter/devices/:id', requireAuth, (req, res) => {
  try {
    const result = house.updateDevice(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, message: 'Device updated successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update device: ' + err.message });
  }
});

// Delete device
app.delete('/admin/api/house/mediacenter/devices/:id', requireAuth, (req, res) => {
  try {
    const result = house.deleteDevice(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'Device deleted successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete device: ' + err.message });
  }
});

// Add connection
app.post('/admin/api/house/mediacenter/connections', requireAuth, (req, res) => {
  try {
    const result = house.addConnection(req.body);
    if (result.success) {
      res.json({ success: true, message: 'Connection added successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to add connection: ' + err.message });
  }
});

// Update connection
app.put('/admin/api/house/mediacenter/connections/:id', requireAuth, (req, res) => {
  try {
    const result = house.updateConnection(req.params.id, req.body);
    if (result.success) {
      res.json({ success: true, message: 'Connection updated successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update connection: ' + err.message });
  }
});

// Delete connection
app.delete('/admin/api/house/mediacenter/connections/:id', requireAuth, (req, res) => {
  try {
    const result = house.deleteConnection(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'Connection deleted successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete connection: ' + err.message });
  }
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
  console.log(`   Status endpoint: http://localhost:${PORT}/api/status\n`);
  
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
          console.log(`   📱 From other devices: http://${iface.address}:${PORT}`);
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
  
  // Start auto-regeneration of public files if enabled
  const regenConfig = config.publicFilesRegeneration || {};
  const autoRegenEnabled = regenConfig.enabled ?? true; // Default to true
  const runOnStartup = regenConfig.runOnStartup ?? true; // Default to true
  
  if (autoRegenEnabled && runOnStartup) {
    // Get delay from env var or config (default to 5 seconds)
    const delaySeconds = parseInt(process.env.AUTO_REGENERATE_PUBLIC_DELAY || regenConfig.delaySeconds || 5, 10);
    const forceOverwrite = regenConfig.forceOverwrite || false;
    
    console.log('🔄 Auto-regeneration scheduled:');
    console.log(`   ⏱️  Delay: ${delaySeconds} seconds`);
    console.log(`   🔧 Force overwrite: ${forceOverwrite ? 'yes' : 'no'}`);
    
    logger.info(logger.categories.SYSTEM, `Auto-regeneration scheduled with ${delaySeconds}s delay`);
    
    publicFilesRegenerator.startAutoRegeneration(delaySeconds, forceOverwrite);
  } else {
    console.log('⏸️  Auto-regeneration disabled');
    logger.info(logger.categories.SYSTEM, 'Auto-regeneration disabled');
  }
});