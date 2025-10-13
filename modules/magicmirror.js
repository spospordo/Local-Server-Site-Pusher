const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'magicmirror-config.json.enc');
const KEY_FILE = path.join(CONFIG_DIR, '.magicmirror-key');

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Default configuration
const DEFAULT_CONFIG = {
    enabled: false,
    widgets: {
        clock: true,
        weather: false,
        calendar: false,
        news: false
    },
    weather: {
        location: '',
        apiKey: ''
    },
    calendar: {
        url: ''
    },
    news: {
        source: ''
    }
};

// Encryption key management
function getOrCreateKey() {
    try {
        if (fs.existsSync(KEY_FILE)) {
            return fs.readFileSync(KEY_FILE, 'utf8').trim();
        } else {
            const key = crypto.randomBytes(32).toString('hex');
            fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
            console.log('🔐 [Magic Mirror] Created new encryption key');
            return key;
        }
    } catch (error) {
        console.error('❌ [Magic Mirror] Error managing encryption key:', error);
        throw error;
    }
}

// Encrypt data
function encrypt(data) {
    try {
        const key = getOrCreateKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
        
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            iv: iv.toString('hex'),
            data: encrypted,
            tag: authTag.toString('hex')
        };
    } catch (error) {
        console.error('❌ [Magic Mirror] Encryption error:', error);
        throw error;
    }
}

// Decrypt data
function decrypt(encryptedData) {
    try {
        const key = getOrCreateKey();
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            Buffer.from(key, 'hex'),
            Buffer.from(encryptedData.iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('❌ [Magic Mirror] Decryption error:', error);
        throw error;
    }
}

// Load configuration
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const encryptedData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            const config = decrypt(encryptedData);
            console.log('✅ [Magic Mirror] Configuration loaded');
            return config;
        } else {
            console.log('📝 [Magic Mirror] No configuration found, using defaults');
            return { ...DEFAULT_CONFIG };
        }
    } catch (error) {
        console.error('❌ [Magic Mirror] Error loading configuration:', error);
        return { ...DEFAULT_CONFIG };
    }
}

// Save configuration
function saveConfig(config) {
    try {
        const encryptedData = encrypt(config);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(encryptedData, null, 2));
        console.log('✅ [Magic Mirror] Configuration saved');
        return { success: true };
    } catch (error) {
        console.error('❌ [Magic Mirror] Error saving configuration:', error);
        return { success: false, error: error.message };
    }
}

// Get configuration (sanitized for client)
function getConfig() {
    const config = loadConfig();
    
    // Don't send API keys to client (just indicate if they exist)
    return {
        ...config,
        weather: {
            ...config.weather,
            hasApiKey: !!config.weather?.apiKey,
            apiKey: '' // Never send actual API key to client
        }
    };
}

// Update configuration
function updateConfig(newConfig) {
    try {
        const currentConfig = loadConfig();
        
        // Merge configurations, preserving API key if not provided
        const updatedConfig = {
            ...currentConfig,
            ...newConfig,
            weather: {
                ...currentConfig.weather,
                ...newConfig.weather
            },
            calendar: {
                ...currentConfig.calendar,
                ...newConfig.calendar
            },
            news: {
                ...currentConfig.news,
                ...newConfig.news
            },
            widgets: {
                ...currentConfig.widgets,
                ...newConfig.widgets
            }
        };
        
        // Only update API key if a new one is provided
        if (newConfig.weather?.apiKey && newConfig.weather.apiKey.trim()) {
            updatedConfig.weather.apiKey = newConfig.weather.apiKey;
        }
        
        return saveConfig(updatedConfig);
    } catch (error) {
        console.error('❌ [Magic Mirror] Error updating configuration:', error);
        return { success: false, error: error.message };
    }
}

// Get full config (for display page, includes API keys)
function getFullConfig() {
    return loadConfig();
}

module.exports = {
    loadConfig,
    saveConfig,
    getConfig,
    updateConfig,
    getFullConfig
};
