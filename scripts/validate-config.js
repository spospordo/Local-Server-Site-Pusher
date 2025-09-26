#!/usr/bin/env node

// Configuration Validation Utility for Local-Server-Site-Pusher
// This script validates and repairs configuration files

const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '..', 'config');
const configPath = path.join(configDir, 'config.json');

// Default configuration template
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

console.log('🔍 Local-Server-Site-Pusher Configuration Validator');
console.log('=================================================');

// Check if config directory exists
if (!fs.existsSync(configDir)) {
  console.log('📁 Creating config directory...');
  try {
    fs.mkdirSync(configDir, { recursive: true });
    console.log('✅ Config directory created');
  } catch (err) {
    console.error('❌ Error creating config directory:', err.message);
    process.exit(1);
  }
}

let config = null;
let needsRepair = false;

// Try to load existing config
if (fs.existsSync(configPath)) {
  console.log('📄 Found existing config.json, validating...');
  
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(configData);
    console.log('✅ Configuration file has valid JSON syntax');
  } catch (err) {
    console.log('❌ Configuration file has invalid JSON syntax:', err.message);
    needsRepair = true;
  }
} else {
  console.log('📄 No config.json found, will create default configuration');
  needsRepair = true;
}

// Validate configuration structure
if (config && !needsRepair) {
  console.log('🔍 Validating configuration structure...');
  
  const issues = [];
  
  // Check required sections
  const requiredSections = ['server', 'server.admin'];
  for (const section of requiredSections) {
    const parts = section.split('.');
    let current = config;
    
    for (const part of parts) {
      if (!current || typeof current !== 'object' || !current.hasOwnProperty(part)) {
        issues.push(`Missing required section: ${section}`);
        break;
      }
      current = current[part];
    }
  }
  
  // Check server admin credentials
  if (config.server && config.server.admin) {
    if (!config.server.admin.username || !config.server.admin.password) {
      issues.push('Missing admin username or password');
    }
  }
  
  // Check port number
  if (config.server && config.server.port) {
    const port = parseInt(config.server.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      issues.push('Invalid port number');
    }
  }
  
  if (issues.length > 0) {
    console.log('⚠️  Configuration issues found:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    needsRepair = true;
  } else {
    console.log('✅ Configuration structure is valid');
  }
}

// Repair configuration if needed
if (needsRepair) {
  console.log('🔧 Repairing configuration...');
  
  // Merge with defaults, preserving existing valid settings
  const repairedConfig = mergeWithDefaults(config || {}, defaultConfig);
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(repairedConfig, null, 2));
    console.log('✅ Configuration repaired and saved');
    
    // Show what was repaired
    if (config) {
      console.log('🔄 Preserved existing settings where possible');
    } else {
      console.log('📝 Created new configuration with defaults');
    }
    
  } catch (err) {
    console.error('❌ Error saving repaired configuration:', err.message);
    process.exit(1);
  }
}

// Validate other critical files
console.log('🔍 Checking other configuration files...');

const clientAuthPath = path.join(configDir, '.client_auth');
if (fs.existsSync(clientAuthPath)) {
  try {
    const stats = fs.statSync(clientAuthPath);
    if (stats.mode & parseInt('077', 8)) {
      console.log('⚠️  Client auth file has insecure permissions, fixing...');
      fs.chmodSync(clientAuthPath, 0o600);
      console.log('✅ Client auth file permissions fixed');
    } else {
      console.log('✅ Client auth file permissions are secure');
    }
  } catch (err) {
    console.log('⚠️  Could not check client auth file permissions:', err.message);
  }
} else {
  console.log('ℹ️  No client auth file found (this is normal if no client password is set)');
}

console.log('');
console.log('✅ Configuration validation completed!');
console.log('💡 Configuration is ready for use');

// Helper function to merge objects recursively
function mergeWithDefaults(existing, defaults) {
  const result = { ...defaults };
  
  for (const key in existing) {
    if (existing.hasOwnProperty(key)) {
      if (typeof existing[key] === 'object' && existing[key] !== null && !Array.isArray(existing[key])) {
        if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
          result[key] = mergeWithDefaults(existing[key], defaults[key]);
        } else {
          result[key] = existing[key];
        }
      } else {
        result[key] = existing[key];
      }
    }
  }
  
  return result;
}