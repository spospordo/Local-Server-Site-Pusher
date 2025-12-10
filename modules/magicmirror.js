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

// Generate default magic-mirror.html file
function generateDefaultHTML() {
    try {
        const htmlPath = path.join(__dirname, '..', 'public', 'magic-mirror.html');
        
        // Check if file already exists
        if (fs.existsSync(htmlPath)) {
            return { 
                success: false, 
                error: 'File already exists',
                path: htmlPath 
            };
        }
        
        // Default magic-mirror.html template
        const defaultHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Magic Mirror Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #ffffff;
            overflow-x: hidden;
        }

        .container {
            padding: 2rem;
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            text-align: center;
            margin-bottom: 2rem;
            padding: 1rem;
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 300;
            letter-spacing: 2px;
            text-shadow: 0 0 20px rgba(74, 144, 226, 0.5);
        }

        .disabled-message {
            text-align: center;
            padding: 3rem;
            background: rgba(255, 59, 48, 0.1);
            border: 2px solid rgba(255, 59, 48, 0.3);
            border-radius: 10px;
            margin: 2rem auto;
            max-width: 600px;
        }

        .disabled-message h2 {
            color: #ff3b30;
            margin-bottom: 1rem;
        }

        .disabled-message p {
            color: #ddd;
            line-height: 1.6;
        }

        .widget-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-template-rows: auto auto auto;
            grid-template-areas:
                "upper-left upper-center upper-right"
                "middle-left middle-center middle-right"
                "bottom-left bottom-center bottom-right";
            gap: 2rem;
            min-height: 70vh;
        }

        .widget-area {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            min-height: 100px;
        }

        .widget-area.upper-left { grid-area: upper-left; }
        .widget-area.upper-center { grid-area: upper-center; }
        .widget-area.upper-right { grid-area: upper-right; }
        .widget-area.middle-left { grid-area: middle-left; }
        .widget-area.middle-center { grid-area: middle-center; }
        .widget-area.middle-right { grid-area: middle-right; }
        .widget-area.bottom-left { grid-area: bottom-left; }
        .widget-area.bottom-center { grid-area: bottom-center; }
        .widget-area.bottom-right { grid-area: bottom-right; }

        .widget {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 1.5rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .widget:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 40px rgba(74, 144, 226, 0.2);
        }

        .widget.size-box {
            /* Standard box size - natural width within area */
        }

        .widget.size-bar {
            /* Bar size - can span full width of area */
            width: 100%;
        }

        .widget-header {
            display: flex;
            align-items: center;
            margin-bottom: 1rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .widget-icon {
            font-size: 2rem;
            margin-right: 1rem;
        }

        .widget-title {
            font-size: 1.5rem;
            font-weight: 400;
        }

        .widget-content {
            font-size: 1rem;
            line-height: 1.6;
        }

        .clock-widget .time {
            font-size: 3rem;
            font-weight: 300;
            text-align: center;
            margin: 1rem 0;
        }

        .clock-widget .date {
            font-size: 1.2rem;
            text-align: center;
            color: #aaa;
        }

        .weather-widget .weather-temp {
            font-size: 3rem;
            font-weight: 300;
            text-align: center;
            margin: 1rem 0;
        }

        /* Dual temperature display styles */
        .temperature-display {
            text-align: center;
            margin: 1rem 0;
        }

        .temp-primary {
            font-size: 3rem;
            font-weight: 500;
            color: #fff;
            text-shadow: 0 0 20px rgba(74, 144, 226, 0.3);
        }

        .temp-secondary {
            font-size: 1.5rem;
            color: #aaa;
            margin-top: 0.25rem;
        }

        .weather-details {
            display: flex;
            justify-content: space-around;
            margin-top: 1rem;
        }

        .weather-detail {
            text-align: center;
        }

        .calendar-event {
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            background: rgba(74, 144, 226, 0.1);
            border-left: 3px solid #4a90e2;
            border-radius: 5px;
        }

        .event-time {
            font-size: 0.85rem;
            color: #aaa;
            margin-bottom: 0.25rem;
        }

        .event-title {
            font-size: 1rem;
            font-weight: 500;
        }

        .news-item {
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .news-title {
            font-size: 1rem;
            margin-bottom: 0.25rem;
        }

        .news-time {
            font-size: 0.85rem;
            color: #aaa;
        }

        /* Media Widget Styles */
        .media-player-info {
            display: flex;
            gap: 1rem;
            align-items: center;
        }

        .media-bar {
            flex-direction: row;
        }

        .media-box {
            flex-direction: column;
            text-align: center;
        }

        .media-album-art {
            flex-shrink: 0;
            width: 120px;
            height: 120px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .media-album-art img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .media-album-art-small {
            width: 80px;
            height: 80px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            margin: 0 auto 0.75rem;
        }

        .media-album-art-small img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .media-details {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-width: 0;
        }

        .media-track-info {
            margin-bottom: 0.5rem;
        }

        .media-title {
            font-size: 1.4rem;
            font-weight: 500;
            color: #fff;
            margin-bottom: 0.4rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .media-artist {
            font-size: 1.1rem;
            color: #aaa;
            margin-bottom: 0.3rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .media-album {
            font-size: 0.95rem;
            color: #888;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .media-state-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 0.5rem;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .media-player-name {
            font-size: 0.9rem;
            color: #888;
        }

        .media-state {
            font-size: 0.9rem;
            color: #4a90e2;
            font-weight: 500;
        }

        .media-details-compact {
            width: 100%;
        }

        .media-title-small {
            font-size: 1.1rem;
            font-weight: 500;
            color: #fff;
            margin-bottom: 0.4rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .media-artist-small {
            font-size: 0.95rem;
            color: #aaa;
            margin-bottom: 0.4rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .media-state-small {
            font-size: 0.85rem;
            color: #4a90e2;
            font-weight: 500;
            margin-top: 0.5rem;
        }

        .error-message {
            color: #ff3b30;
            text-align: center;
            padding: 1rem;
        }

        .footer {
            text-align: center;
            margin-top: 2rem;
            padding: 1rem;
            font-size: 0.85rem;
            color: #aaa;
        }

        /* Portrait orientation - single column layout */
        @media (orientation: portrait) {
            .widget-grid {
                grid-template-columns: 1fr;
                grid-template-areas:
                    "upper-left"
                    "upper-center"
                    "upper-right"
                    "middle-left"
                    "middle-center"
                    "middle-right"
                    "bottom-left"
                    "bottom-center"
                    "bottom-right";
            }
        }

        @media (max-width: 768px) {
            .widget-grid {
                grid-template-columns: 1fr;
                grid-template-areas:
                    "upper-left"
                    "upper-center"
                    "upper-right"
                    "middle-left"
                    "middle-center"
                    "middle-right"
                    "bottom-left"
                    "bottom-center"
                    "bottom-right";
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🪞 Magic Mirror Dashboard</h1>
        </div>

        <div id="dashboard-content">
            <div class="disabled-message">
                <h2>Magic Mirror is Disabled</h2>
                <p>Please enable Magic Mirror in the admin settings to view your dashboard.</p>
                <p style="margin-top: 1rem;">
                    <a href="/admin" style="color: #4a90e2; text-decoration: none;">Go to Admin Settings →</a>
                </p>
            </div>
        </div>

        <div class="footer">
            <div id="last-update">Last updated: --:--</div>
        </div>
    </div>

    <script>
        async function initDashboard() {
            try {
                console.log('🪞 [Magic Mirror] Initializing dashboard...');
                const response = await fetch('/api/magic-mirror/config');
                
                if (!response.ok) {
                    console.error('❌ [Magic Mirror] Failed to fetch Magic Mirror config. Status:', response.status);
                    return;
                }
                
                const data = await response.json();
                
                if (!data.success) {
                    console.error('❌ [Magic Mirror] Config request failed:', data.error || data.message);
                    return;
                }
                
                const config = data.config;
                console.log('📊 [Magic Mirror] Config loaded:', {
                    enabled: config.enabled,
                    widgets: Object.keys(config.widgets || {})
                });
                
                if (!config.enabled) {
                    console.log('⚠️  [Magic Mirror] Dashboard is disabled');
                    return;
                }
                
                // Build widget grid with area-based layout
                const widgets = config.widgets || {};
                console.log('🎛️  [Magic Mirror] Building widgets:', 
                    Object.entries(widgets)
                        .filter(([_, w]) => (typeof w === 'boolean' ? w : (w && w.enabled)))
                        .map(([name, _]) => name)
                        .join(', ') || 'none'
                );
                
                // Initialize widget grid with all areas
                let widgetsHtml = '<div class="widget-grid">';
                widgetsHtml += '<div class="widget-area upper-left" id="area-upper-left"></div>';
                widgetsHtml += '<div class="widget-area upper-center" id="area-upper-center"></div>';
                widgetsHtml += '<div class="widget-area upper-right" id="area-upper-right"></div>';
                widgetsHtml += '<div class="widget-area middle-left" id="area-middle-left"></div>';
                widgetsHtml += '<div class="widget-area middle-center" id="area-middle-center"></div>';
                widgetsHtml += '<div class="widget-area middle-right" id="area-middle-right"></div>';
                widgetsHtml += '<div class="widget-area bottom-left" id="area-bottom-left"></div>';
                widgetsHtml += '<div class="widget-area bottom-center" id="area-bottom-center"></div>';
                widgetsHtml += '<div class="widget-area bottom-right" id="area-bottom-right"></div>';
                widgetsHtml += '</div>';
                
                document.getElementById('dashboard-content').innerHTML = widgetsHtml;
                
                // Widget templates
                const widgetTemplates = {
                    clock: { icon: '🕐', title: 'Clock', content: '<div class="time" id="clock-time">--:--:--</div><div class="date" id="clock-date">Loading...</div>' },
                    weather: { icon: '🌤️', title: 'Current Weather', content: '<div id="weather-content"><div style="text-align: center; padding: 2rem; color: #aaa;">Loading...</div></div>' },
                    forecast: { icon: '🌦️', title: 'Forecast', content: '<div id="forecast-content"><div style="text-align: center; padding: 2rem; color: #aaa;">Loading...</div></div>' },
                    calendar: { icon: '📅', title: 'Calendar', content: '<div id="calendar-content"><div style="text-align: center; padding: 2rem; color: #aaa;">Loading...</div></div>' },
                    news: { icon: '📰', title: 'News', content: '<div id="news-content"><div style="text-align: center; padding: 2rem; color: #aaa;">Loading...</div></div>' },
                    media: { icon: '🎵', title: 'Now Playing', content: '<div id="media-content"><div style="text-align: center; padding: 2rem; color: #aaa;">Loading...</div></div>' }
                };
                
                // Place widgets in their configured areas
                for (const [widgetName, widgetConfig] of Object.entries(widgets)) {
                    let enabled, area, size;
                    
                    // Handle both old boolean format and new object format
                    if (typeof widgetConfig === 'boolean') {
                        enabled = widgetConfig;
                        area = 'upper-left';
                        size = 'box';
                    } else if (typeof widgetConfig === 'object') {
                        enabled = widgetConfig.enabled;
                        area = widgetConfig.area || 'upper-left';
                        size = widgetConfig.size || 'box';
                    } else {
                        console.warn('⚠️  [Magic Mirror] Invalid widget config for', widgetName, ':', widgetConfig);
                        continue;
                    }
                    
                    if (!enabled) {
                        console.log('⏭️  [Magic Mirror] Skipping disabled widget:', widgetName);
                        continue;
                    }
                    
                    const template = widgetTemplates[widgetName];
                    if (!template) {
                        console.error('❌ [Magic Mirror] No template found for widget:', widgetName);
                        continue;
                    }
                    
                    const areaElement = document.getElementById('area-' + area);
                    if (!areaElement) {
                        console.error('❌ [Magic Mirror] Area element not found for widget', widgetName, '- area:', area);
                        continue;
                    }
                    
                    console.log('✅ [Magic Mirror] Placing widget:', widgetName, 'in area:', area, 'size:', size);
                    
                    const widgetHtml = \`
                        <div class="widget size-\${size}" id="\${widgetName}-widget">
                            <div class="widget-header">
                                <span class="widget-icon">\${template.icon}</span>
                                <span class="widget-title">\${template.title}</span>
                            </div>
                            <div class="widget-content">
                                \${template.content}
                            </div>
                        </div>
                    \`;
                    
                    areaElement.innerHTML += widgetHtml;
                }
                
                // Start updates for enabled widgets
                const isEnabled = (w) => typeof w === 'boolean' ? w : (w && w.enabled);
                
                if (isEnabled(widgets.clock)) {
                    updateClock();
                    setInterval(updateClock, 1000);
                }
                
                if (isEnabled(widgets.weather)) {
                    updateWeather();
                    setInterval(updateWeather, 600000); // 10 minutes
                }
                
                if (isEnabled(widgets.forecast)) {
                    updateForecast();
                    setInterval(updateForecast, 600000); // 10 minutes
                }
                
                if (isEnabled(widgets.calendar)) {
                    updateCalendar();
                    setInterval(updateCalendar, 600000); // 10 minutes
                }
                
                if (isEnabled(widgets.news)) {
                    updateNews();
                    setInterval(updateNews, 600000); // 10 minutes
                }
                
                if (isEnabled(widgets.media)) {
                    updateMedia();
                    setInterval(updateMedia, 5000); // 5 seconds for real-time updates
                }
                
                // Update last update time
                updateLastUpdateTime();
                setInterval(updateLastUpdateTime, 60000); // 1 minute
                
            } catch (error) {
                console.error('Error initializing dashboard:', error);
            }
        }

        function updateClock() {
            const now = new Date();
            
            const timeStr = now.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            
            const dateStr = now.toLocaleDateString('en-US', { 
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            const timeEl = document.getElementById('clock-time');
            const dateEl = document.getElementById('clock-date');
            
            if (timeEl) timeEl.textContent = timeStr;
            if (dateEl) dateEl.textContent = dateStr;
        }

        async function updateWeather() {
            const content = document.getElementById('weather-content');
            
            try {
                const response = await fetch('/api/magicmirror/weather');
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to fetch weather');
                }
                
                const data = await response.json();
                
                if (data.temperature !== undefined) {
                    const weatherIconMap = {
                        'Clear': '☀️',
                        'Clouds': '☁️',
                        'Rain': '🌧️',
                        'Snow': '❄️',
                        'Thunderstorm': '⛈️',
                        'Drizzle': '🌦️',
                        'Mist': '🌫️',
                        'Fog': '🌫️'
                    };
                    
                    const icon = weatherIconMap[data.condition] || '🌤️';
                    
                    // Display both Fahrenheit (large) and Celsius (small)
                    const tempF = data.temperatureF !== undefined ? data.temperatureF : data.temperature;
                    const tempC = data.temperatureC !== undefined ? data.temperatureC : '--';
                    
                    content.innerHTML = \`
                        <div style="text-align: center; margin-bottom: 1rem;">
                            <div style="font-size: 3rem;">\${icon}</div>
                        </div>
                        <div class="temperature-display">
                            <div class="temp-primary">\${tempF}°F</div>
                            <div class="temp-secondary">\${tempC}°C</div>
                        </div>
                        <div style="text-align: center; margin-bottom: 1rem;">
                            <div style="font-size: 1.2rem;">\${data.condition}</div>
                            <div style="color: #aaa; font-size: 0.9rem;">\${data.location}</div>
                        </div>
                        <div class="weather-details">
                            <div class="weather-detail">
                                <div style="color: #aaa; font-size: 0.9rem;">Humidity</div>
                                <div style="font-size: 1.2rem;">\${data.humidity}%</div>
                            </div>
                            <div class="weather-detail">
                                <div style="color: #aaa; font-size: 0.9rem;">Wind</div>
                                <div style="font-size: 1.2rem;">\${data.windSpeed} m/s</div>
                            </div>
                        </div>
                    \`;
                } else {
                    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: #aaa;">Weather data not available</div>';
                }
            } catch (error) {
                console.error('Error updating weather:', error);
                content.innerHTML = '<div style="text-align: center; padding: 2rem; color: #ff6b6b;">' + error.message + '</div>';
            }
        }

        async function updateForecast() {
            const content = document.getElementById('forecast-content');
            
            if (!content) {
                console.error('❌ [Magic Mirror] Forecast content element not found');
                return;
            }
            
            try {
                console.log('🌦️  [Magic Mirror] Updating forecast...');
                const response = await fetch('/api/magicmirror/forecast');
                
                if (!response.ok) {
                    const error = await response.json();
                    console.error('❌ [Magic Mirror] Forecast API error:', error);
                    throw new Error(error.error || 'Failed to fetch forecast');
                }
                
                const data = await response.json();
                console.log('✅ [Magic Mirror] Forecast data received:', data.forecast?.length || 0, 'days');
                
                if (data.forecast && data.forecast.length > 0) {
                    const weatherIconMap = {
                        'Clear': '☀️',
                        'Clouds': '☁️',
                        'Rain': '🌧️',
                        'Snow': '❄️',
                        'Thunderstorm': '⛈️',
                        'Drizzle': '🌦️',
                        'Mist': '🌫️',
                        'Fog': '🌫️'
                    };
                    
                    const forecastHtml = data.forecast.map(day => {
                        const icon = weatherIconMap[day.condition] || '🌤️';
                        // Get Fahrenheit and Celsius temperatures
                        const maxF = day.maxTempF !== undefined ? day.maxTempF : day.maxTemp;
                        const minF = day.minTempF !== undefined ? day.minTempF : day.minTemp;
                        const maxC = day.maxTempC !== undefined ? day.maxTempC : '--';
                        const minC = day.minTempC !== undefined ? day.minTempC : '--';
                        
                        return \`
                            <div style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding: 0.8rem 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div style="flex: 1;">
                                        <div style="font-size: 0.9rem; color: #aaa;">\${day.date}</div>
                                        <div style="font-size: 0.85rem; color: #888; margin-top: 0.2rem;">\${day.condition}</div>
                                    </div>
                                    <div style="font-size: 2rem; margin: 0 1rem;">\${icon}</div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 1.2rem; font-weight: 500;">\${maxF}°F / \${minF}°F</div>
                                        <div style="font-size: 0.9rem; color: #aaa; margin-top: 0.1rem;">\${maxC}°C / \${minC}°C</div>
                                        <div style="font-size: 0.8rem; color: #888; margin-top: 0.2rem;">\${day.humidity}% • \${day.windSpeed}m/s</div>
                                    </div>
                                </div>
                            </div>
                        \`;
                    }).join('');
                    
                    content.innerHTML = \`
                        <div style="margin-bottom: 0.5rem;">
                            <div style="color: #aaa; font-size: 0.9rem; text-align: center;">\${data.location}</div>
                        </div>
                        \${forecastHtml}
                    \`;
                } else {
                    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: #aaa;">No forecast data available</div>';
                }
            } catch (error) {
                console.error('Error updating forecast:', error);
                content.innerHTML = '<div style="text-align: center; padding: 2rem; color: #ff6b6b;">' + error.message + '</div>';
            }
        }

        async function updateCalendar() {
            const content = document.getElementById('calendar-content');
            
            try {
                const response = await fetch('/api/magicmirror/calendar');
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to fetch calendar');
                }
                
                const data = await response.json();
                
                if (data.events && data.events.length > 0) {
                    const eventsHtml = data.events.map(event => \`
                        <div class="calendar-event">
                            <div class="event-time">\${event.date} at \${event.time}</div>
                            <div class="event-title">\${event.title}</div>
                        </div>
                    \`).join('');
                    
                    content.innerHTML = eventsHtml;
                } else {
                    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: #aaa;">No upcoming events</div>';
                }
            } catch (error) {
                console.error('Error updating calendar:', error);
                content.innerHTML = '<div class="error-message">' + error.message + '</div>';
            }
        }

        async function updateNews() {
            const content = document.getElementById('news-content');
            
            try {
                const response = await fetch('/api/magicmirror/news');
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to fetch news');
                }
                
                const data = await response.json();
                
                if (data.items && data.items.length > 0) {
                    const newsHtml = data.items.map(item => \`
                        <div class="news-item">
                            <div class="news-title">\${item.title}</div>
                            <div class="news-time">\${item.date}</div>
                        </div>
                    \`).join('');
                    
                    content.innerHTML = newsHtml;
                } else {
                    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: #aaa;">No news items available</div>';
                }
            } catch (error) {
                console.error('Error updating news:', error);
                content.innerHTML = '<div class="error-message">' + error.message + '</div>';
            }
        }

        async function updateMedia() {
            const content = document.getElementById('media-content');
            if (!content) {
                console.error('❌ [Magic Mirror] Media content element not found');
                return;
            }
            
            try {
                const response = await fetch('/api/media-streaming');
                
                if (!response.ok) {
                    const error = await response.json();
                    console.error('❌ [Magic Mirror] Media API error:', error);
                    throw new Error(error.error || 'Failed to fetch media data');
                }
                
                const result = await response.json();
                const data = result.data;
                console.log('🎵 [Magic Mirror] Media data received:', data.hasActiveMedia ? 'active' : 'inactive');
                
                if (!result.success || !data.hasActiveMedia || data.players.length === 0) {
                    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: #aaa;">No active media players</div>';
                    return;
                }
                
                // Find the first active player
                const activePlayer = data.players.find(p => p.isActive);
                if (!activePlayer) {
                    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: #aaa;">No media playing</div>';
                    return;
                }
                
                // Build HTML based on widget size
                const mediaWidget = document.getElementById('media-widget');
                const isBarSize = mediaWidget && mediaWidget.classList.contains('size-bar');
                
                let mediaHtml = '';
                
                if (isBarSize) {
                    // Large/bar widget - show more details with album art
                    mediaHtml = \`
                        <div class="media-player-info media-bar">
                            \${activePlayer.entity_picture ? 
                                \`<div class="media-album-art">
                                    <img src="\${activePlayer.entity_picture}" alt="Album Art" />
                                </div>\` : ''}
                            <div class="media-details">
                                <div class="media-track-info">
                                    <div class="media-title">\${activePlayer.media_title || 'Unknown Track'}</div>
                                    \${activePlayer.media_artist ? \`<div class="media-artist">\${activePlayer.media_artist}</div>\` : ''}
                                    \${activePlayer.media_album_name ? \`<div class="media-album">\${activePlayer.media_album_name}</div>\` : ''}
                                </div>
                                <div class="media-state-info">
                                    <div class="media-player-name">\${activePlayer.friendly_name}</div>
                                    <div class="media-state">\${activePlayer.state === 'playing' ? '▶ Playing' : activePlayer.state === 'paused' ? '⏸ Paused' : activePlayer.state}</div>
                                </div>
                            </div>
                        </div>
                    \`;
                } else {
                    // Small/box widget - compact view
                    mediaHtml = \`
                        <div class="media-player-info media-box">
                            \${activePlayer.entity_picture ? 
                                \`<div class="media-album-art-small">
                                    <img src="\${activePlayer.entity_picture}" alt="Album Art" />
                                </div>\` : ''}
                            <div class="media-details-compact">
                                <div class="media-title-small">\${activePlayer.media_title || 'Unknown Track'}</div>
                                \${activePlayer.media_artist ? \`<div class="media-artist-small">\${activePlayer.media_artist}</div>\` : ''}
                                <div class="media-state-small">\${activePlayer.state === 'playing' ? '▶ Playing' : activePlayer.state === 'paused' ? '⏸ Paused' : activePlayer.state}</div>
                            </div>
                        </div>
                    \`;
                }
                
                content.innerHTML = mediaHtml;
            } catch (error) {
                console.error('❌ [Magic Mirror] Error updating media widget:', error);
                content.innerHTML = '<div style="text-align: center; padding: 1rem; color: #ff6b6b; font-size: 0.9rem;">' + error.message + '</div>';
            }
        }

        function updateLastUpdateTime() {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit'
            });
            document.getElementById('last-update').textContent = 'Last updated: ' + timeStr;
        }

        // Initialize on page load
        window.addEventListener('DOMContentLoaded', initDashboard);
    </script>
</body>
</html>`;
        
        // Write the file
        fs.writeFileSync(htmlPath, defaultHTML, 'utf8');
        
        console.log(`✅ [Magic Mirror] Successfully generated magic-mirror.html at ${htmlPath}`);
        
        return { 
            success: true, 
            message: 'Default magic-mirror.html generated successfully',
            path: htmlPath 
        };
        
    } catch (error) {
        console.error('❌ [Magic Mirror] Error generating HTML file:', error);
        return { 
            success: false, 
            error: error.message 
        };
    }
}

// Force dashboard regeneration by updating config version
function regenerateDashboard() {
    try {
        const currentConfig = loadConfig();
        currentConfig.configVersion = Date.now();
        const result = saveConfig(currentConfig);
        
        if (result.success) {
            console.log('🔄 [Magic Mirror] Dashboard regeneration triggered');
            console.log('   New Config Version:', currentConfig.configVersion);
            return { 
                success: true, 
                message: 'Dashboard regenerated successfully. Open dashboards will reload automatically.',
                configVersion: currentConfig.configVersion
            };
        } else {
            return result;
        }
    } catch (error) {
        console.error('❌ [Magic Mirror] Error regenerating dashboard:', error);
        return { success: false, error: error.message };
    }
}

// Clear and completely refresh dashboard - removes any cached/stale state
function clearAndRefreshDashboard() {
    try {
        console.log('🗑️ [Magic Mirror] Clearing dashboard state and forcing complete regeneration...');
        
        // Load current config
        const currentConfig = loadConfig();
        
        // Force a new config version with a much larger timestamp to ensure it's seen as newer
        // Add a marker to indicate this was a forced clear
        const newVersion = Date.now() + 1000; // Add 1 second to ensure it's newer
        currentConfig.configVersion = newVersion;
        currentConfig.lastClearTimestamp = newVersion;
        
        // Log what we're doing
        console.log('   Current enabled state:', currentConfig.enabled);
        console.log('   Enabled widgets:', Object.keys(currentConfig.widgets || {})
            .filter(w => currentConfig.widgets[w]?.enabled)
            .join(', ') || 'none');
        console.log('   New Config Version:', currentConfig.configVersion);
        
        // Save the config with new version
        const result = saveConfig(currentConfig);
        
        if (result.success) {
            console.log('✅ [Magic Mirror] Dashboard cleared and regenerated successfully');
            console.log('   All open dashboards will now reload with ONLY configured widgets');
            console.log('   No fallback widgets will be displayed');
            return { 
                success: true, 
                message: 'Dashboard cleared and regenerated. All open dashboards will reload immediately with only your configured widgets.',
                configVersion: currentConfig.configVersion,
                clearTimestamp: currentConfig.lastClearTimestamp
            };
        } else {
            console.error('❌ [Magic Mirror] Failed to save cleared config:', result.error);
            return result;
        }
    } catch (error) {
        console.error('❌ [Magic Mirror] Error clearing and refreshing dashboard:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    loadConfig,
    saveConfig,
    getConfig,
    updateConfig,
    getFullConfig,
    generateDefaultHTML,
    regenerateDashboard,
    clearAndRefreshDashboard,
    // Export grid configuration and helpers
    GRID_CONFIG,
    AREA_TO_GRID,
    SIZE_TO_SPANS,
    areaToGridPosition,
    gridPositionToArea
};
