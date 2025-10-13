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
        clock: {
            enabled: true,
            area: 'upper-left',
            size: 'box'
        },
        weather: {
            enabled: false,
            area: 'upper-center',
            size: 'box'
        },
        calendar: {
            enabled: false,
            area: 'middle-left',
            size: 'box'
        },
        news: {
            enabled: false,
            area: 'bottom-left',
            size: 'bar'
        },
        media: {
            enabled: false,
            area: 'middle-right',
            size: 'box'
        }
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
    
    // Handle backward compatibility - convert old boolean format to new object format
    const widgets = {};
    for (const [key, value] of Object.entries(config.widgets || {})) {
        if (typeof value === 'boolean') {
            // Old format: { clock: true, weather: false }
            widgets[key] = {
                enabled: value,
                area: DEFAULT_CONFIG.widgets[key]?.area || 'upper-left',
                size: DEFAULT_CONFIG.widgets[key]?.size || 'box'
            };
        } else if (typeof value === 'object') {
            // New format: { clock: { enabled: true, area: 'upper-left', size: 'box' } }
            widgets[key] = {
                enabled: value.enabled !== undefined ? value.enabled : true,
                area: value.area || DEFAULT_CONFIG.widgets[key]?.area || 'upper-left',
                size: value.size || DEFAULT_CONFIG.widgets[key]?.size || 'box'
            };
        }
    }
    
    // Don't send API keys to client (just indicate if they exist)
    return {
        ...config,
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
                const response = await fetch('/api/magicmirror/data');
                
                if (!response.ok) {
                    console.error('Failed to fetch Magic Mirror data');
                    return;
                }
                
                const config = await response.json();
                
                if (!config.enabled) {
                    return;
                }
                
                // Build widget grid with area-based layout
                const widgets = config.widgets || {};
                
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
                    weather: { icon: '🌤️', title: 'Weather', content: '<div id="weather-content"><div style="text-align: center; padding: 2rem; color: #aaa;">Loading...</div></div>' },
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
                        continue;
                    }
                    
                    if (!enabled) continue;
                    
                    const template = widgetTemplates[widgetName];
                    if (!template) continue;
                    
                    const areaElement = document.getElementById('area-' + area);
                    if (!areaElement) continue;
                    
                    const widgetHtml = \`
                        <div class="widget size-\${size} \${widgetName}-widget">
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
                    content.innerHTML = \`
                        <div class="weather-temp">\${data.temperature}°\${data.unit}</div>
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
                    content.innerHTML = '<div class="error-message">Weather data not available</div>';
                }
            } catch (error) {
                console.error('Error updating weather:', error);
                content.innerHTML = '<div class="error-message">' + error.message + '</div>';
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
            if (!content) return;
            
            try {
                const response = await fetch('/api/media-streaming');
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to fetch media data');
                }
                
                const result = await response.json();
                const data = result.data;
                
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
                const mediaWidget = document.querySelector('.media-widget');
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
                console.error('Error updating media:', error);
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

module.exports = {
    loadConfig,
    saveConfig,
    getConfig,
    updateConfig,
    getFullConfig,
    generateDefaultHTML
};
