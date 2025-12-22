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

// Grid layout configuration
const GRID_CONFIG = {
    columns: 12, // 12-column grid for flexible layouts
    rows: 6,     // 6 rows
    gap: 16      // Gap between grid cells in pixels
};

// Default configuration
const DEFAULT_CONFIG = {
    enabled: false,
    configVersion: Date.now(), // Track when config was last updated
    gridLayout: {
        enabled: true,         // Use new grid layout system
        columns: GRID_CONFIG.columns,
        rows: GRID_CONFIG.rows,
        gap: GRID_CONFIG.gap
    },
    widgets: {
        clock: {
            enabled: true,
            // Legacy area-based placement (backward compatibility)
            area: 'upper-left',
            size: 'box',
            // New grid-based placement
            gridPosition: {
                col: 1,      // Grid column start (1-based)
                row: 1,      // Grid row start (1-based)
                colSpan: 4,  // Number of columns to span
                rowSpan: 2   // Number of rows to span
            }
        },
        weather: {
            enabled: false,
            area: 'upper-center',
            size: 'box',
            gridPosition: {
                col: 5,
                row: 1,
                colSpan: 4,
                rowSpan: 2
            }
        },
        forecast: {
            enabled: false,
            area: 'upper-right',
            size: 'box',
            gridPosition: {
                col: 9,
                row: 1,
                colSpan: 4,
                rowSpan: 2
            }
        },
        calendar: {
            enabled: false,
            area: 'middle-left',
            size: 'box',
            gridPosition: {
                col: 1,
                row: 3,
                colSpan: 4,
                rowSpan: 2
            }
        },
        news: {
            enabled: false,
            area: 'bottom-left',
            size: 'bar',
            gridPosition: {
                col: 1,
                row: 5,
                colSpan: 12,
                rowSpan: 2
            }
        },
        media: {
            enabled: false,
            area: 'middle-right',
            size: 'box',
            gridPosition: {
                col: 9,
                row: 3,
                colSpan: 4,
                rowSpan: 2
            }
        }
    },
    weather: {
        location: '',
        apiKey: ''
    },
    forecast: {
        days: 5  // Number of days to forecast (1, 3, 5, or 10)
    },
    calendar: {
        url: ''
    },
    news: {
        source: ''
    }
};

// Map legacy area names to grid positions
const AREA_TO_GRID = {
    'upper-left':     { col: 1, row: 1, colSpan: 4, rowSpan: 2 },
    'upper-center':   { col: 5, row: 1, colSpan: 4, rowSpan: 2 },
    'upper-right':    { col: 9, row: 1, colSpan: 4, rowSpan: 2 },
    'middle-left':    { col: 1, row: 3, colSpan: 4, rowSpan: 2 },
    'middle-center':  { col: 5, row: 3, colSpan: 4, rowSpan: 2 },
    'middle-right':   { col: 9, row: 3, colSpan: 4, rowSpan: 2 },
    'bottom-left':    { col: 1, row: 5, colSpan: 4, rowSpan: 2 },
    'bottom-center':  { col: 5, row: 5, colSpan: 4, rowSpan: 2 },
    'bottom-right':   { col: 9, row: 5, colSpan: 4, rowSpan: 2 }
};

// Map size to grid spans for legacy compatibility
const SIZE_TO_SPANS = {
    'box': { colSpan: 4, rowSpan: 2 },
    'bar': { colSpan: 12, rowSpan: 2 }
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

// Helper function to convert legacy area to grid position
function areaToGridPosition(area, size) {
    const basePosition = AREA_TO_GRID[area] || AREA_TO_GRID['upper-left'];
    const sizeSpans = SIZE_TO_SPANS[size] || SIZE_TO_SPANS['box'];
    
    return {
        col: basePosition.col,
        row: basePosition.row,
        colSpan: size === 'bar' ? sizeSpans.colSpan : basePosition.colSpan,
        rowSpan: sizeSpans.rowSpan
    };
}

// Helper function to convert grid position to legacy area (for backward compatibility)
function gridPositionToArea(gridPosition) {
    if (!gridPosition) return 'upper-left';
    
    const { col, row } = gridPosition;
    
    // Map grid position to closest legacy area
    // Grid is divided into 3 column regions:
    //   - Columns 1-4: left region
    //   - Columns 5-8: center region  
    //   - Columns 9-12: right region
    const LEFT_REGION_END = 4;
    const CENTER_REGION_END = 8;
    
    let colArea = 'left';
    if (col > LEFT_REGION_END && col <= CENTER_REGION_END) colArea = 'center';
    else if (col > CENTER_REGION_END) colArea = 'right';
    
    // Grid is divided into 3 row regions:
    //   - Rows 1-2: upper region
    //   - Rows 3-4: middle region
    //   - Rows 5-6: bottom region
    const UPPER_REGION_END = 2;
    const MIDDLE_REGION_END = 4;
    
    let rowArea = 'upper';
    if (row > UPPER_REGION_END && row <= MIDDLE_REGION_END) rowArea = 'middle';
    else if (row > MIDDLE_REGION_END) rowArea = 'bottom';
    
    return `${rowArea}-${colArea}`;
}

// Get configuration (sanitized for client)
function getConfig() {
    const config = loadConfig();
    
    // Handle backward compatibility - convert old boolean format to new object format
    const widgets = {};
    for (const [key, value] of Object.entries(config.widgets || {})) {
        if (typeof value === 'boolean') {
            // Old format: { clock: true, weather: false }
            const defaultWidget = DEFAULT_CONFIG.widgets[key] || {};
            widgets[key] = {
                enabled: value,
                area: defaultWidget.area || 'upper-left',
                size: defaultWidget.size || 'box',
                gridPosition: defaultWidget.gridPosition || areaToGridPosition(defaultWidget.area || 'upper-left', defaultWidget.size || 'box')
            };
        } else if (typeof value === 'object') {
            // New format: { clock: { enabled: true, area: 'upper-left', size: 'box', gridPosition: {...} } }
            const defaultWidget = DEFAULT_CONFIG.widgets[key] || {};
            const area = value.area || defaultWidget.area || 'upper-left';
            const size = value.size || defaultWidget.size || 'box';
            
            widgets[key] = {
                // CRITICAL FIX: Default to false to prevent unwanted widgets from appearing
                // BREAKING CHANGE: Previously defaulted to true, causing all widgets to appear
                // Now only widgets with explicit enabled=true will be displayed
                // This fixes the bug where admin-disabled widgets were still showing on dashboard
                enabled: value.enabled === true,
                area: area,
                size: size,
                // Use existing gridPosition or derive from area/size
                gridPosition: value.gridPosition || areaToGridPosition(area, size)
            };
        }
    }
    
    // Ensure gridLayout config exists
    const gridLayout = config.gridLayout || DEFAULT_CONFIG.gridLayout;
    
    // Add diagnostic logging to help troubleshoot configuration issues
    const enabledWidgets = Object.keys(widgets).filter(key => widgets[key]?.enabled);
    const disabledWidgets = Object.keys(widgets).filter(key => !widgets[key]?.enabled);
    
    console.log('📊 [Magic Mirror Config] getConfig() called:');
    console.log(`   Total widgets in config: ${Object.keys(widgets).length}`);
    console.log(`   Enabled widgets (${enabledWidgets.length}): ${enabledWidgets.join(', ') || 'NONE'}`);
    console.log(`   Disabled widgets (${disabledWidgets.length}): ${disabledWidgets.join(', ') || 'NONE'}`);
    console.log(`   Config Version: ${config.configVersion || 'not set'}`);
    console.log(`   Last Clear: ${config.lastClearTimestamp || 'never'}`);
    
    // IMPORTANT: Log warning if no widgets are enabled but dashboard is enabled
    if (config.enabled && enabledWidgets.length === 0) {
        console.warn('⚠️  [Magic Mirror Config] WARNING: Dashboard is enabled but NO widgets are enabled!');
        console.warn('   This will result in an empty dashboard.');
        console.warn('   Admin should enable at least one widget in settings.');
    }
    
    // Don't send API keys to client (just indicate if they exist)
    return {
        ...config,
        gridLayout,
        widgets,
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
        
        // Deep merge widgets with grid position support
        const mergedWidgets = {};
        const allWidgetKeys = new Set([
            ...Object.keys(currentConfig.widgets || {}),
            ...Object.keys(newConfig.widgets || {})
        ]);
        
        for (const key of allWidgetKeys) {
            const currentWidget = currentConfig.widgets?.[key] || {};
            const newWidget = newConfig.widgets?.[key] || {};
            
            // If new widget config is provided, merge it
            if (newConfig.widgets?.[key]) {
                mergedWidgets[key] = {
                    enabled: newWidget.enabled !== undefined ? newWidget.enabled : currentWidget.enabled,
                    area: newWidget.area || currentWidget.area || DEFAULT_CONFIG.widgets[key]?.area || 'upper-left',
                    size: newWidget.size || currentWidget.size || DEFAULT_CONFIG.widgets[key]?.size || 'box',
                    gridPosition: newWidget.gridPosition || currentWidget.gridPosition || 
                                 areaToGridPosition(newWidget.area || currentWidget.area || 'upper-left', 
                                                  newWidget.size || currentWidget.size || 'box')
                };
            } else {
                // Keep existing widget config
                mergedWidgets[key] = currentWidget;
            }
        }
        
        // Merge configurations, preserving API key if not provided
        const updatedConfig = {
            ...currentConfig,
            ...newConfig,
            configVersion: Date.now(), // Update version timestamp when config changes
            gridLayout: {
                ...DEFAULT_CONFIG.gridLayout,
                ...currentConfig.gridLayout,
                ...newConfig.gridLayout
            },
            weather: {
                ...currentConfig.weather,
                ...newConfig.weather
            },
            forecast: {
                ...currentConfig.forecast,
                ...newConfig.forecast
            },
            calendar: {
                ...currentConfig.calendar,
                ...newConfig.calendar
            },
            news: {
                ...currentConfig.news,
                ...newConfig.news
            },
            widgets: mergedWidgets
        };
        
        // Preserve API key if new one is not provided or is empty
        if (!newConfig.weather?.apiKey || !newConfig.weather.apiKey.trim()) {
            updatedConfig.weather.apiKey = currentConfig.weather?.apiKey || '';
        }
        
        // Log configuration update for debugging
        console.log('✅ [Magic Mirror] Configuration updated successfully');
        console.log('   Enabled:', updatedConfig.enabled);
        console.log('   Config Version:', updatedConfig.configVersion);
        console.log('   Grid Layout:', updatedConfig.gridLayout?.enabled ? 'enabled' : 'disabled');
        console.log('   Widgets:', Object.keys(updatedConfig.widgets || {})
            .filter(w => updatedConfig.widgets[w]?.enabled)
            .join(', ') || 'none');
        
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

// Check health of configuration persistence
function checkHealth() {
    try {
        const health = {
            configFile: {
                exists: fs.existsSync(CONFIG_FILE),
                path: CONFIG_FILE
            },
            keyFile: {
                exists: fs.existsSync(KEY_FILE),
                path: KEY_FILE
            },
            canDecrypt: false,
            configVersion: null,
            lastClear: null,
            enabledWidgets: []
        };
        
        // Try to load and decrypt config
        if (health.configFile.exists && health.keyFile.exists) {
            try {
                const config = loadConfig();
                health.canDecrypt = true;
                health.configVersion = config.configVersion || null;
                health.lastClear = config.lastClearTimestamp || null;
                health.enabledWidgets = Object.keys(config.widgets || {})
                    .filter(w => config.widgets[w]?.enabled);
            } catch (error) {
                health.canDecrypt = false;
                health.error = error.message;
            }
        }
        
        health.status = health.configFile.exists && health.keyFile.exists && health.canDecrypt 
            ? 'healthy' 
            : 'unhealthy';
        
        return health;
    } catch (error) {
        console.error('❌ [Magic Mirror] Health check error:', error);
        return {
            status: 'error',
            error: error.message
        };
    }
}


// Legacy HTML generation functions removed - new SPA architecture uses static build
// See public/magic-mirror/ for the new React-based dashboard

module.exports = {
    loadConfig,
    saveConfig,
    getConfig,
    updateConfig,
    getFullConfig,
    checkHealth,
    // Export grid configuration and helpers
    GRID_CONFIG,
    AREA_TO_GRID,
    SIZE_TO_SPANS,
    areaToGridPosition,
    gridPositionToArea
};
