const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const configDir = path.join(__dirname, 'config');
const configPath = path.join(configDir, 'config.json');
const clientPasswordPath = path.join(configDir, '.client_auth');

// Client password encryption utilities
const SALT_ROUNDS = 12;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, SALT_ROUNDS * 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
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
    return true;
  } catch (err) {
    console.warn('Cannot write client password file:', err.message);
    return false;
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
  
  // Try to create config file only if directory is writable
  if (configWritable) {
    if (!createConfigFile(configPath, defaultConfig)) {
      console.log('Could not create config file, using in-memory defaults');
    }
  } else {
    console.log('Config directory not writable, using in-memory defaults');
  }
}

const PORT = config.server.port || 3000;

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

// Add session store warning for production
if (process.env.NODE_ENV === 'production') {
  console.warn('INFO: Using in-memory session store. For production with multiple instances, consider using a persistent session store like Redis.');
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session(sessionConfig));

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

// Client authentication middleware
const requireClientAuth = (req, res, next) => {
  const clientConfig = config.client || { requirePassword: false };
  
  if (!clientConfig.requirePassword) {
    return next();
  }
  
  if (req.session.clientAuthenticated) {
    return next();
  }
  
  res.status(401).json({ error: 'Client authentication required' });
};

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
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  try {
    // Hash and save the new password
    const hashedPassword = hashPassword(newPassword);
    
    if (saveClientPasswordHash(hashedPassword)) {
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
      res.status(500).json({ error: 'Failed to save password' });
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
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
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
    
    if (saveClientPasswordHash(hashedPassword)) {
      res.json({ 
        success: true, 
        message: 'Password changed successfully' 
      });
    } else {
      res.status(500).json({ error: 'Failed to save new password' });
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

app.post('/api/client/register', requireClientAuth, (req, res) => {
  try {
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

app.get('/api/client/links', requireClientAuth, (req, res) => {
  res.json(config.usefulLinks || []);
});

app.get('/api/client/ip', (req, res) => {
  res.json({ 
    ip: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown'
  });
});

// Visitor registration endpoint (no authentication required)
app.post('/api/visitor/register', (req, res) => {
  try {
    const { name, deviceId, deviceType, userAgent } = req.body;
    
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
    } else {
      // Create new device entry
      device = {
        deviceId: deviceId,
        name: name,
        deviceType: deviceType || 'Visitor',
        browserInfo: 'Unknown',
        userAgent: userAgent || '',
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
      message: 'Visitor registered successfully as client',
      deviceId: deviceId,
      name: name
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