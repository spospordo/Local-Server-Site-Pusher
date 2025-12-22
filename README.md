# Local-Server-Site-Pusher
A containerized web application with admin interface for serving web content and handling integrations with Home Assistant and dashboard tools.

## Features

🔧 **Admin Interface**: Secure web-based administration panel  
📁 **File Serving**: Serve static web content from the public directory  
🔗 **API Endpoints**: Handle POST/GET requests for external integrations  
📊 **Status Monitoring**: Integration with Home Assistant and Cockpit  
🐳 **Containerized**: Easy deployment with Docker  
🤖 **AI Assistant**: Ollama/Open WebUI integration for AI-powered finance assistance (admin-only)  
🪞 **Magic Mirror**: Customizable information dashboard for displaying time, weather, calendar, and news (rebuilt as modern SPA)  

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/spospordo/Local-Server-Site-Pusher.git
cd Local-Server-Site-Pusher

# Start the container
docker-compose up -d

# Test deployment (optional)
./test-deployment.sh

# Access the application
# Main site: http://localhost:3000
# Admin panel: http://localhost:3000/admin
```

**✨ New**: The container now automatically fixes permission issues with volume mounts - perfect for Portainer deployments!

**🔥 Version 2.2.1 Critical Fix**: Persistence bug resolved! All settings (Vidiots, GitHub upload, Finance data) now properly persist across container rebuilds. See [PERSISTENCE_FIX_SUMMARY.md](PERSISTENCE_FIX_SUMMARY.md) for details.

**🎉 ARM64 Support**: Now fully compatible with Raspberry Pi (4, 5, and other ARM64 devices)!

### Using Docker

```bash
# Build the image
docker build -t local-server-site-pusher .

# Run the container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/public:/app/public \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/uploads:/app/uploads \
  --name local-server \
  local-server-site-pusher
```

### TrueNAS Scale / Portainer Deployment

🎯 **For Raspberry Pi / ARM64 users deploying via Portainer**: See the **[PORTAINER_DEPLOYMENT_GUIDE.md](PORTAINER_DEPLOYMENT_GUIDE.md)** for the complete, working solution.

📖 **For general Portainer and TrueNAS Scale users**: See the [**PORTAINER.md**](PORTAINER.md) deployment guide which includes:
- Quick deployment steps
- Permission troubleshooting  
- TrueNAS Scale specific instructions
- Security best practices

**✅ Version 1.1.3 Fix**: Now includes libvips-dev for proper ARM64 sharp module support on Raspberry Pi!

**Quick Example for Portainer Stack (Git Repository Method):**
1. In Portainer, go to **Stacks** → **Add stack**
2. Choose **Repository** build method
3. **Repository URL**: `https://github.com/spospordo/Local-Server-Site-Pusher`
4. **Compose path**: `docker-compose.portainer.yml`
5. Deploy the stack

The container automatically handles permission fixes for volume mounts and builds with correct ARM64 binaries!

## Troubleshooting

### Container Startup Issues

**Problem**: Container restarts in a loop with "npm: exec: line 0: start: not found"
**Solution**: 
1. Pull the latest image: `docker pull spospordo/local-server-site-pusher:latest`
2. Or rebuild from source: `docker-compose up --build`

**Problem**: Permission errors with volume mounts
**Solution**: 
1. Fix host directory ownership: `sudo chown -R 1000:1000 ./config ./public ./uploads`
2. Or let the container auto-fix permissions (default behavior)

For detailed troubleshooting, see [PORTAINER.md](PORTAINER.md).

## Magic Mirror Dashboard

The Magic Mirror is a customizable information dashboard accessible at `/magic-mirror`. It displays real-time information including:

- 🕐 **Clock**: Current time and date
- 🌤️ **Weather**: Current conditions (requires API key)
- 📅 **Forecast**: 5-day weather forecast
- 📆 **Calendar**: Upcoming events from iCal feeds
- 📰 **News**: RSS news headlines
- 🎬 **Media**: Embedded media player

### Features
- **Modern SPA**: Built with vanilla JavaScript ES6 modules
- **Real-time Updates**: Auto-refreshes every 30 seconds
- **Responsive**: Works on desktop, tablet, and mobile
- **Configurable**: Easy widget management via admin panel
- **Grid Layout**: Flexible 12-column positioning system

### Quick Setup
1. Go to Admin Panel → Magic Mirror section
2. Enable "Magic Mirror Dashboard"
3. Enable desired widgets (Clock, Weather, etc.)
4. Configure API keys if needed (weather requires OpenWeatherMap key)
5. Save configuration
6. Access dashboard at `http://localhost:3000/magic-mirror/`

For detailed information, see [MAGIC_MIRROR_SPA_ARCHITECTURE.md](MAGIC_MIRROR_SPA_ARCHITECTURE.md).

## Troubleshooting

```bash
# Install dependencies
npm install

# Start the server
npm start

# Access at http://localhost:3000
```

## Configuration

The server is configured via `config.json` located in the `config/` directory. If no configuration file exists, the server will automatically create a default configuration file on startup.

```json
{
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
  }
}
```

**⚠️ Important**: Change the default admin credentials in production!

### Configuration Persistence

When using Docker, mount the `config` directory to persist configuration changes:
- The server creates a default `config/config.json` if none exists
- Configuration changes via the admin interface are saved to this file
- Mounting the `config` directory ensures settings persist across container restarts

**🔥 Version 2.2.1 Persistence Fix:**
- ✅ **Fixed critical bug** where config files were copied into Docker image
- ✅ **All settings now persist** correctly across container rebuilds (Vidiots, GitHub upload, Finance data)
- ✅ **Config files excluded** from Docker image via `.dockerignore`
- ✅ **Volume-mounted config** is now the single source of truth

**Enhanced Persistence Features:**
- ✅ **Automatic configuration validation and repair** on startup
- ✅ **Backup utilities** for safe container updates 
- ✅ **Data recovery tools** for configuration corruption
- ✅ **Container update scripts** that preserve all settings

See [PERSISTENCE.md](PERSISTENCE.md) for complete persistence documentation, or [PERSISTENCE_FIX_SUMMARY.md](PERSISTENCE_FIX_SUMMARY.md) for details on the v2.2.1 fix.

### Container Updates

To safely update the container while preserving all settings:

```bash
# Automatic update with backup and validation
./scripts/update-container.sh

# Or manual backup before updates
./scripts/backup-config.sh
```

## Admin Interface

1. Navigate to `http://localhost:3000/admin`
2. Login with default credentials: `admin` / `admin123`
3. Use the dashboard to:
   - View server status and metrics
   - Edit configuration in real-time
   - Monitor integrations

## API Endpoints

### Status Endpoint (for integrations)
```
GET /api/status
```
Returns server status, uptime, memory usage, and configuration for Home Assistant and other monitoring tools.

### Webhook Receiver
```
POST /api/webhook
```
Accepts webhook data from external services. Logs received data and returns confirmation.

### Data Endpoint
```
GET /api/data
```
Generic data endpoint for integrations. Accepts query parameters.

### Espresso Editor Endpoints
```
GET /espresso-editor
```
Public espresso data editor interface. Allows editing espresso brewing parameters.

```
GET /espresso
```
Public espresso display page. Shows formatted espresso brewing data.

```
GET /api/espresso/data
```
Returns current espresso brewing data in JSON format.

```
POST /api/espresso/data
```
Updates espresso brewing data (public endpoint, no authentication required).

## Ollama/Open WebUI Integration

The Finance > Spending tab includes AI-powered assistance through Ollama LLM integration via Open WebUI. This admin-only feature allows you to:

- Connect to Ollama instances running on your local network (e.g., TrueNAS)
- Configure API authentication and model selection
- Send prompts and receive AI responses in real-time
- View connection status and performance metrics
- Maintain conversation history for contextual discussions

### Quick Setup

1. Install Open WebUI with Ollama on your network:
   ```bash
   docker run -d -p 3000:8080 \
     -v open-webui:/app/backend/data \
     --name open-webui \
     ghcr.io/open-webui/open-webui:main
   ```

2. In Admin Dashboard, navigate to **Finance > Spending**
3. Configure your Open WebUI URL and model (e.g., `llama2`, `mistral`)
4. Test connection and start chatting with AI

### Security Features

- 🔐 AES-256-GCM encryption for API keys at rest
- 🔒 Admin-only access with session authentication
- 🛡️ API keys never exposed to frontend
- 📁 Local storage - no external API calls

See [OLLAMA_INTEGRATION.md](OLLAMA_INTEGRATION.md) for detailed documentation.

## Magic Mirror Dashboard

The Magic Mirror feature provides a fully functional information dashboard that displays real-time data from multiple sources. Perfect for tablets, dedicated displays, or digital signage.

### Features

- **Real-time Widgets**: Clock/Date, Weather, Calendar, News Feed
- **Live Data Integration**: 
  - Weather data from OpenWeather API (optional API key)
  - Calendar events from iCal/ICS feeds
  - News items from RSS feeds
- **Auto-refresh**: Widgets automatically update (weather: 10 min, calendar: 1 hour, news: 15 min)
- **Customizable**: Enable/disable widgets as needed
- **Easy Configuration**: Simple admin interface for setup
- **Secure**: AES-256-GCM encrypted configuration storage
- **Public Display**: Accessible via unique URL for display on any device
- **Graceful Fallbacks**: Works with or without API keys/feeds configured

### Quick Setup

1. In Admin Dashboard, navigate to **Server > Magic Mirror**
2. Enable Magic Mirror Dashboard
3. Configure widgets:
   - **Clock**: Automatically shows current time and date (always available)
   - **Weather**: Set location and optional OpenWeather API key for live weather
     - Without API key: Shows location only
     - With API key: Live temperature, conditions, humidity, wind speed
   - **Calendar**: Add iCal/ICS calendar URL for upcoming events
     - Displays next 10 upcoming events
     - Shows event time and title
   - **News**: Configure RSS feed URL for latest news
     - Displays latest 10 news items
     - Shows title and publication time
4. Click "Save Configuration"
5. Open the dashboard at `http://your-server:3000/magic-mirror`

### Display URL

Once enabled, the Magic Mirror dashboard is accessible at:
```
http://your-server-ip:3000/magic-mirror
```

This URL can be opened in a browser on any device (tablet, dedicated display, etc.) to show your customized information dashboard.

**📖 For detailed access instructions from containers, remote devices, and troubleshooting network issues, see [MAGIC_MIRROR_ACCESS.md](MAGIC_MIRROR_ACCESS.md)**

### Widget Configuration Details

#### Weather Widget
- **Location**: City name (e.g., "London, UK" or "New York, US")
- **API Key** (optional): Get free API key from [OpenWeather](https://openweathermap.org/api)
  - Without key: Shows location name only
  - With key: Live weather data including temperature, conditions, humidity, wind speed
  - **Persistence**: API key is stored encrypted and persists across container restarts
- **Update Frequency**: Every 10 minutes (when API key is configured)
- **Testing**: Use `/api/magicmirror/weather/test` endpoint to verify connection and troubleshoot issues

#### Calendar Widget
- **iCal/ICS URL**: Any valid iCal/ICS calendar feed
  - Google Calendar: Share calendar → Secret address in iCal format
  - Office 365: Calendar settings → Shared calendars → Publish → ICS
  - Apple iCloud: Calendar settings → Public calendar → Copy link (webcal:// or https://)
  - **Webcal Support**: Both `webcal://` and `webcals://` URLs are automatically supported
- **Display**: Shows next 10 upcoming events within 30 days
- **Update Frequency**: Every hour

#### News Widget
- **RSS Feed URL**: Any valid RSS/Atom feed
  - Examples: BBC, CNN, TechCrunch, your favorite blog
- **Display**: Shows latest 10 news items with titles and timestamps
- **Update Frequency**: Every 15 minutes

### API Endpoints

The Magic Mirror uses the following API endpoints for data:
- `GET /api/magicmirror/data` - Get configuration
- `GET /api/magicmirror/weather` - Fetch weather data
- `GET /api/magicmirror/weather/test` - Test weather API connection (troubleshooting)
- `GET /api/magicmirror/calendar` - Fetch calendar events (supports webcal:// protocol)
- `GET /api/magicmirror/news` - Fetch news items

### Configuration Storage

- Configuration stored in encrypted format: `config/magicmirror-config.json.enc`
- Encryption key: `config/.magicmirror-key` (auto-generated)
- Settings persist across container restarts via volume mounts
- API keys stored securely and never exposed to frontend

### Health Monitoring & Dashboard Recovery

The Magic Mirror dashboard now includes built-in health monitoring and recovery features:

#### Health Check
- Access the **Configuration Health** section in Admin → Server → Magic Mirror
- Click "🔄 Refresh" to check:
  - Configuration file status
  - Encryption key availability
  - Config decryption capability
  - Current version timestamp
  - Enabled widgets count
- Health status updates automatically when you save configuration changes

#### Dashboard Recovery
If the Magic Mirror dashboard file (`public/magic-mirror.html`) is missing:

1. **Preferred Method**: Restore from source control
   ```bash
   git checkout public/magic-mirror.html
   ```

2. **Alternative**: Redeploy the application from your repository

3. **Fallback**: The system will show a recovery page with a button to generate a basic fallback version
   - ⚠️ **Note**: This is temporary and should only be used as a last resort
   - Any customizations will be lost
   - The canonical dashboard should always be maintained in source control

#### Static Dashboard Architecture
The Magic Mirror dashboard is now served as a static Single Page Application (SPA):
- **No runtime HTML generation** - the dashboard HTML file is a static asset
- **Configuration loaded via API** - widgets and settings fetched from `/api/magic-mirror/config`
- **Live updates** - changes in admin panel automatically reload the dashboard within 10 seconds
- **Version tracking** - config includes version timestamps for change detection

### Testing

Run the magic mirror test suite to validate the implementation:
```bash
node scripts/test-magic-mirror.js
```

Test webcal protocol and weather API features:
```bash
node scripts/test-webcal-weather.js
```

Test network accessibility (containers, remote devices):
```bash
node scripts/test-magic-mirror-network.js
```

### Troubleshooting

**Weather not displaying:**
- **First**: Test the connection using `curl http://localhost:3000/api/magicmirror/weather/test`
- This will provide detailed error messages for common issues (invalid API key, location not found, network issues)

**Weather not displaying (continued):**
- Verify your OpenWeather API key is valid
- Check location format (e.g., "London,UK" not just "London")
- View browser console for API errors

**Calendar events not showing:**
- Ensure iCal URL is publicly accessible
- Test the URL in a browser to verify it returns calendar data
- Check that events are in the future (next 30 days)

**News feed not loading:**
- Verify RSS feed URL is valid and accessible
- Some feeds may have CORS restrictions
- Check browser console for errors

## Home Assistant Integration

Add a RESTful sensor to your Home Assistant configuration:

```yaml
sensor:
  - platform: rest
    resource: http://your-server-ip:3000/api/status
    name: "Local Server Status"
    value_template: "{{ value_json.server.status }}"
    json_attributes:
      - server
      - memory
      - timestamp
```

## Cockpit Integration

Monitor the server via Cockpit by adding the status endpoint:
```
http://your-server-ip:3000/api/status
```

## Web Content

- Place your web files in the `public` directory
- The server will serve files from this directory
- Default file is `index.html`
- Access public content at `http://localhost:3000/public/`

## Security Notes

- Change default admin credentials in production
- Use HTTPS in production with a reverse proxy
- Consider firewall rules for API endpoints
- The container runs as non-root user for security

## Development

The application uses:
- **Node.js** with Express for the web server
- **Session-based authentication** for admin access
- **JSON configuration** for easy management
- **Docker** for containerization

## License

MIT License - see LICENSE file for details.
