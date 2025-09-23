const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

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
    "url": "http://localhost:8123"
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
  "connectedDevices": []
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
    'client': defaultConfig.client
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
    
    // Validate and repair configuration
    const validation = validateAndRepairConfig(config);
    if (validation.needsRepair) {
      console.log('Configuration validation found issues, applying repairs...');
      config = validation.config;
      
      if (configWritable) {
        if (createConfigFile(configPath, config)) {
          console.log('Repaired configuration saved to file');
        } else {
          console.warn('Could not save repaired configuration, using in-memory repairs');
        }
      } else {
        console.warn('Config directory not writable, repairs applied in-memory only');
      }
    } else {
      console.log('Configuration validation passed');
    }
  } else {
    config = defaultConfig;
    if (configWritable) {
      if (createConfigFile(configPath, defaultConfig)) {
        console.log('Created default configuration file');
      }
    } else {
      console.log('Config directory not writable, using in-memory configuration only');
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
    res.redirect('/admin/login');
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
    res.redirect('/admin');
  } else {
    res.redirect('/admin/login?error=1');
  }
});

// Admin logout
app.post('/admin/logout', (req, res) => {
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
  // Simple mock logs for demonstration
  const logs = [
    {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Server started successfully on port ' + PORT
    },
    {
      timestamp: new Date(Date.now() - 60000).toISOString(),
      level: 'INFO',
      message: 'Configuration loaded from config file'
    },
    {
      timestamp: new Date(Date.now() - 120000).toISOString(),
      level: 'INFO',
      message: 'Admin session authenticated'
    }
  ];
  
  res.json(logs);
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

// Client access routes and APIs
app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.html'));
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
    res.json({ success: true, message: 'Authentication successful' });
  } else {
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
app.listen(PORT, () => {
  console.log(`Local Server Site Pusher running on port ${PORT}`);
  console.log(`Admin interface: http://localhost:${PORT}/admin`);
  console.log(`Status endpoint: http://localhost:${PORT}/api/status`);
});