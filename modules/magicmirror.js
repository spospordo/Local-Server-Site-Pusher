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
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 2rem;
        }

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
                
                // Build widget grid based on enabled widgets
                const widgets = config.widgets || {};
                let widgetsHtml = '<div class="widget-grid">';
                
                // Clock widget (always show if enabled)
                if (widgets.clock) {
                    widgetsHtml += \`
                        <div class="widget clock-widget">
                            <div class="widget-header">
                                <span class="widget-icon">🕐</span>
                                <span class="widget-title">Clock</span>
                            </div>
                            <div class="widget-content">
                                <div class="time" id="clock-time">--:--:--</div>
                                <div class="date" id="clock-date">Loading...</div>
                            </div>
                        </div>
                    \`;
                }
                
                // Weather widget
                if (widgets.weather) {
                    widgetsHtml += \`
                        <div class="widget weather-widget">
                            <div class="widget-header">
                                <span class="widget-icon">🌤️</span>
                                <span class="widget-title">Weather</span>
                            </div>
                            <div class="widget-content" id="weather-content">
                                <div style="text-align: center; padding: 2rem; color: #aaa;">Loading...</div>
                            </div>
                        </div>
                    \`;
                }
                
                // Calendar widget
                if (widgets.calendar) {
                    widgetsHtml += \`
                        <div class="widget calendar-widget">
                            <div class="widget-header">
                                <span class="widget-icon">📅</span>
                                <span class="widget-title">Calendar</span>
                            </div>
                            <div class="widget-content" id="calendar-content">
                                <div style="text-align: center; padding: 2rem; color: #aaa;">Loading...</div>
                            </div>
                        </div>
                    \`;
                }
                
                // News widget
                if (widgets.news) {
                    widgetsHtml += \`
                        <div class="widget news-widget">
                            <div class="widget-header">
                                <span class="widget-icon">📰</span>
                                <span class="widget-title">News</span>
                            </div>
                            <div class="widget-content" id="news-content">
                                <div style="text-align: center; padding: 2rem; color: #aaa;">Loading...</div>
                            </div>
                        </div>
                    \`;
                }
                
                widgetsHtml += '</div>';
                
                document.getElementById('dashboard-content').innerHTML = widgetsHtml;
                
                // Start updates for enabled widgets
                if (widgets.clock) {
                    updateClock();
                    setInterval(updateClock, 1000);
                }
                
                if (widgets.weather) {
                    updateWeather();
                    setInterval(updateWeather, 600000); // 10 minutes
                }
                
                if (widgets.calendar) {
                    updateCalendar();
                    setInterval(updateCalendar, 600000); // 10 minutes
                }
                
                if (widgets.news) {
                    updateNews();
                    setInterval(updateNews, 600000); // 10 minutes
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
