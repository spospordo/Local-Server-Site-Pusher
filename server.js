const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const configDir = path.join(__dirname, 'config');
const configPath = path.join(configDir, 'config.json');

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
  "usefulLinks": []
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

// Admin login POST
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === config.server.admin.username && password === config.server.admin.password) {
    req.session.authenticated = true;
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

// API to get logs
app.get('/admin/api/logs', requireAuth, (req, res) => {
  try {
    const logs = [
      { timestamp: new Date().toISOString(), level: 'INFO', message: 'Server started successfully' },
      { timestamp: new Date(Date.now() - 60000).toISOString(), level: 'INFO', message: 'Configuration loaded' },
      { timestamp: new Date(Date.now() - 120000).toISOString(), level: 'INFO', message: 'Admin authentication successful' }
    ];
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs: ' + err.message });
  }
});

// API to get useful links
app.get('/admin/api/links', requireAuth, (req, res) => {
  res.json(config.usefulLinks || []);
});

// API to save useful links
app.post('/admin/api/links', requireAuth, (req, res) => {
  try {
    const { links } = req.body;
    config.usefulLinks = links;
    
    // Try to save to file if possible
    if (configWritable && createConfigFile(configPath, config)) {
      res.json({ success: true, message: 'Links saved successfully' });
    } else {
      res.json({ success: true, message: 'Links saved (in memory only)' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to save links: ' + err.message });
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