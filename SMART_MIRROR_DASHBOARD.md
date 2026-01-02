# Smart Mirror Dashboard - Implementation Guide

## Overview

The Smart Mirror dashboard is a modern single-page application (SPA) that provides a clean, maintainable interface for displaying Magic Mirror widgets. It uses the same underlying configuration system and APIs as the Magic Mirror, but with a separate, independent frontend implementation.

## Architecture

### Frontend (SPA)
- **Technology**: Vanilla JavaScript ES6 modules (no framework dependencies)
- **Location**: `public/smart-mirror/`
- **Entry Point**: `index.html` served at `/smart-mirror/`
- **Build Process**: None required - pure client-side JavaScript

### Backend (API)
- **Config API**: `GET /api/magic-mirror/config` - Returns dashboard configuration (shared with Magic Mirror)
- **Widget APIs**: Individual endpoints for weather, forecast, calendar, news data (shared with Magic Mirror)
- **Admin API**: `POST /admin/api/magicmirror/config` - Save configuration (shared with Magic Mirror)

### File Structure

```
public/smart-mirror/
├── index.html              # Main HTML entry point
├── styles.css              # Complete dashboard styling (shared with Magic Mirror)
├── app.js                  # Main application controller (Smart Mirror specific)
├── services/
│   └── ConfigService.js    # API communication layer
├── controllers/
│   └── UIController.js     # UI state management
└── widgets/
    ├── BaseWidget.js       # Base class for all widgets
    ├── WidgetFactory.js    # Factory pattern for widget creation
    ├── ClockWidget.js      # Clock implementation
    ├── WeatherWidget.js    # Current weather
    ├── ForecastWidget.js   # Weather forecast
    ├── CalendarWidget.js   # Calendar events
    ├── NewsWidget.js       # RSS news feed
    └── MediaWidget.js      # Media streaming
```

## Key Features

### ✅ Robust Implementation
- **No Template Strings**: Uses static HTML files served by Express, not runtime-generated strings
- **Persistent Storage**: Configuration stored in encrypted file `config/magicmirror-config.json.enc`
- **Survives Restarts**: Dashboard files persist across container/server restarts
- **Platform Independent**: Works on Docker, Portainer, Raspberry Pi, and bare metal

### ✅ Real-Time Updates
- **Polling**: Dashboard polls `/api/magic-mirror/config` every 30 seconds
- **Configurable**: Set `window.SMART_MIRROR_POLL_INTERVAL_MS` to customize
- **Auto-refresh**: Widgets reload when config changes detected
- **Pause on hide**: Polling pauses when browser tab hidden

### ✅ Error Handling
- **Per-widget boundaries**: Individual widgets can fail without breaking dashboard
- **Graceful degradation**: Errors display in widget area with retry capability
- **State screens**: Dedicated screens for loading, disabled, and error states
- **Health monitoring**: Visual indicator shows connection status

### ✅ Security
- **XSS Protection**: All user content sanitized via `textContent`
- **URL Validation**: External links validated before opening
- **Safe event handling**: No inline event handlers
- **CSP Ready**: No eval() or inline scripts
- **API Key Protection**: Config API uses `getConfig()` which strips sensitive data

## Configuration

### Enabling the Dashboard

The Smart Mirror uses the same configuration as Magic Mirror. To enable:

1. Access admin panel at `/admin`
2. Navigate to Magic Mirror settings
3. Toggle "Magic Mirror Dashboard" to "Enabled"
4. Configure widgets as desired
5. Save configuration

The dashboard will immediately become available at `/smart-mirror`.

### Widget Configuration

Each widget in config has:
```json
{
  "enabled": true,
  "gridPosition": {
    "col": 1,        // Grid column start (1-12)
    "row": 1,        // Grid row start (1-6)
    "colSpan": 4,    // Columns to span
    "rowSpan": 2     // Rows to span
  }
}
```

### Supported Widgets

1. **Clock**: Real-time clock with date (updates every second)
2. **Weather**: Current weather conditions (updates every 10 minutes)
3. **Forecast**: 5-day weather forecast (updates every 30 minutes)
4. **Calendar**: Upcoming events from iCal feed (updates every 15 minutes)
5. **News**: RSS news headlines (updates every 30 minutes)
6. **Media**: Embedded media player (static iframe)

## Server Routes

### Primary Routes

- **`GET /smart-mirror`** - Redirects (301) to `/smart-mirror/`
- **`GET /smart-mirror/`** - Serves `index.html` via static middleware
- **`GET /smart-mirror/*`** - Serves all static assets (CSS, JS, images)

### API Routes (Shared with Magic Mirror)

- **`GET /api/magic-mirror/config`** - Public config endpoint (sanitized, no API keys)
- **`POST /admin/api/magicmirror/config`** - Admin save endpoint (requires authentication)
- **`GET /api/magicmirror/weather`** - Current weather data
- **`GET /api/magicmirror/forecast`** - Weather forecast data
- **`GET /api/magicmirror/calendar`** - Calendar events
- **`GET /api/magicmirror/news`** - News headlines

## Deployment

### Docker/Portainer

The Smart Mirror dashboard is included in the Docker image and requires no special configuration:

```bash
docker-compose up -d
```

Access at: `http://your-server:3000/smart-mirror`

### Raspberry Pi

Works out of the box with the standard installation:

```bash
npm install
npm start
```

Configure your Pi to auto-start the server and open Chromium in kiosk mode to `/smart-mirror`.

### Configuration Persistence

Configuration is stored in `config/magicmirror-config.json.enc` which is:
- **Encrypted** for security
- **Persisted** in Docker volumes
- **Backed up** with standard config backup scripts
- **Versioned** with timestamp on each change

To backup configuration:
```bash
./scripts/backup-config.sh
```

To restore configuration:
```bash
./scripts/restore-config.sh
```

## Troubleshooting

### Dashboard Shows "Smart Mirror Disabled"

**Cause**: Magic Mirror is not enabled in configuration.

**Solution**:
1. Access admin panel at `/admin`
2. Enable Magic Mirror Dashboard
3. Save configuration
4. Refresh dashboard

**Verification**:
```bash
curl http://localhost:3000/api/magic-mirror/config
```
Should return `"enabled": true` in the response.

### Dashboard Shows "Loading..." Forever

**Causes**:
- Server not running
- Network connectivity issue
- API endpoint not accessible
- JavaScript error in console

**Solution**:
1. Check server is running: `curl http://localhost:3000/api/status`
2. Check browser console for errors (F12)
3. Verify API accessible: `curl http://localhost:3000/api/magic-mirror/config`
4. Check server logs for errors

### Widgets Not Loading

**Causes**:
- Widgets not enabled in configuration
- Missing API keys (weather, news, etc.)
- Widget-specific API endpoint errors
- Network errors fetching external data

**Solution**:
1. Check admin panel - ensure widgets are enabled
2. Verify API keys are configured (weather requires OpenWeatherMap API key)
3. Check browser console for widget-specific errors
4. Test widget API endpoints directly:
   ```bash
   curl http://localhost:3000/api/magicmirror/weather
   curl http://localhost:3000/api/magicmirror/forecast
   ```

### Static Files Not Loading (404 errors)

**Causes**:
- Server configuration issue
- Missing files in `public/smart-mirror/`
- Incorrect route configuration

**Solution**:
1. Verify files exist:
   ```bash
   ls -la public/smart-mirror/
   ```
2. Check server logs for 404 errors
3. Test direct file access:
   ```bash
   curl http://localhost:3000/smart-mirror/app.js
   curl http://localhost:3000/smart-mirror/styles.css
   ```

### Configuration Not Persisting

**Causes**:
- Docker volume not mounted
- File permission issues
- Disk space full

**Solution**:
1. Check Docker volume: `docker volume ls`
2. Verify mount in `docker-compose.yml`:
   ```yaml
   volumes:
     - ./config:/app/config
   ```
3. Check file permissions:
   ```bash
   ls -la config/magicmirror-config.json.enc
   ```
4. Check disk space: `df -h`

## Testing

### Automated Tests

Run the Smart Mirror test suite:
```bash
node scripts/test-smart-mirror.js
```

This tests:
- File system structure
- HTTP routes and redirects
- Static file serving
- HTML content validation
- JavaScript module structure
- API integration

### Manual Testing

1. **Basic Functionality**:
   - Access `/smart-mirror` → should redirect to `/smart-mirror/`
   - Dashboard should load (loading spinner visible initially)
   - If Magic Mirror disabled, should show "Disabled" message

2. **Configuration**:
   - Enable Magic Mirror in admin panel
   - Configure at least one widget (e.g., clock)
   - Save configuration
   - Refresh dashboard → should show enabled widget(s)

3. **Config Updates**:
   - Enable another widget in admin panel
   - Save configuration
   - Wait 30 seconds (default poll interval)
   - Dashboard should auto-update with new widget

4. **Error Handling**:
   - Disable Magic Mirror in admin panel
   - Dashboard should show "Disabled" screen
   - Re-enable and dashboard should recover

5. **Persistence**:
   - Configure dashboard with multiple widgets
   - Restart server/container
   - Dashboard should maintain configuration

## Performance

- **Initial Load**: < 1 second (no dependencies to download)
- **Memory**: ~5-10 MB (varies with number of widgets)
- **Network**: Config API called every 30 seconds (~1 KB payload)
- **CPU**: Minimal (clock updates only active widget)

## Browser Support

- **Modern Browsers**: Chrome 61+, Firefox 60+, Safari 11+, Edge 79+
- **ES6 Modules**: Required (no IE11 support)
- **CSS Grid**: Required for layout

## Differences from Magic Mirror

While Smart Mirror uses the same backend configuration and APIs as Magic Mirror, it is a separate frontend implementation:

| Feature | Magic Mirror | Smart Mirror |
|---------|-------------|-------------|
| Route | `/magic-mirror` | `/smart-mirror` |
| Directory | `public/magic-mirror/` | `public/smart-mirror/` |
| App Class | `MagicMirrorApp` | `SmartMirrorApp` |
| Title | "Magic Mirror Dashboard" | "Smart Mirror Dashboard" |
| Icon | 🪞 | ✨ |
| Config Storage | Shared (`config/magicmirror-config.json.enc`) | Shared |
| API Endpoints | Shared | Shared |

Both dashboards can run simultaneously and will show the same data based on the shared configuration.

## Security Considerations

### Data Sanitization

All external data displayed in widgets is sanitized:
```javascript
// Good - uses textContent
element.textContent = userProvidedData;

// Bad - vulnerable to XSS
element.innerHTML = userProvidedData; // Never do this
```

### API Key Protection

The public config API (`/api/magic-mirror/config`) uses `getConfig()` which strips sensitive data:
- Weather API keys are removed
- News feed URLs may contain authentication
- Calendar URLs may contain private tokens

Admin APIs require authentication and use `getFullConfig()` which includes all data.

### Content Security Policy

The dashboard is designed to work with strict CSP:
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self';
```

Note: `'unsafe-inline'` for styles is required for dynamic widget styling.

## Development

### Local Development

```bash
# Start server
npm start

# Access dashboard
open http://localhost:3000/smart-mirror/

# Edit files in public/smart-mirror/
# Changes take effect on page reload (no build needed)
```

### Adding Custom Widgets

1. Create new widget class in `public/smart-mirror/widgets/`:
```javascript
import { BaseWidget } from './BaseWidget.js';

export class MyWidget extends BaseWidget {
    render() {
        const widget = this.createElement();
        const header = this.createHeader('🎯', 'My Widget');
        const content = this.createContent();
        content.textContent = 'Hello World';
        widget.appendChild(header);
        widget.appendChild(content);
        return widget;
    }
}
```

2. Register in `WidgetFactory.js`:
```javascript
import { MyWidget } from './MyWidget.js';

this.widgetClasses = {
    // ... existing widgets
    mywidget: MyWidget
};
```

3. Add to default config in `modules/magicmirror.js`
4. Add admin controls in `admin/dashboard.html`

## Future Enhancements

Possible improvements:
- **WebSocket Support**: Instant config updates instead of polling
- **Service Worker**: Offline capability and faster loading
- **Theme Customization**: User-selectable color schemes
- **Widget Marketplace**: Community-contributed widgets
- **PWA Support**: Install as mobile/desktop app
- **Voice Control**: Integration with voice assistants
- **Multi-Display**: Support for multiple synchronized displays

## Support

For issues, questions, or contributions:
1. Check this documentation first
2. Review troubleshooting section
3. Check server logs for errors
4. Run test suite: `node scripts/test-smart-mirror.js`
5. Open an issue on GitHub with:
   - Description of the problem
   - Steps to reproduce
   - Server logs
   - Browser console output
   - Test results

## License

MIT License - Same as the parent project (Local-Server-Site-Pusher)
