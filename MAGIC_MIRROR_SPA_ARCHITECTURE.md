# Magic Mirror Dashboard - New Architecture

## Overview

The Magic Mirror dashboard has been completely rebuilt as a modern single-page application (SPA) using vanilla JavaScript ES6 modules. This replaces all legacy HTML generation code with a maintainable, reliable frontend architecture.

## Architecture

### Frontend (SPA)
- **Technology**: Vanilla JavaScript ES6 modules (no framework dependencies)
- **Location**: `public/magic-mirror/`
- **Entry Point**: `index.html` served at `/magic-mirror/`
- **Build Process**: None required - pure client-side JavaScript

### Backend (API)
- **Config API**: `GET /api/magic-mirror/config` - Returns dashboard configuration
- **Widget APIs**: Individual endpoints for weather, forecast, calendar, news data
- **Admin API**: `POST /admin/api/magicmirror/config` - Save configuration

### File Structure

```
public/magic-mirror/
├── index.html              # Main HTML entry point
├── styles.css              # Complete dashboard styling
├── app.js                  # Main application controller
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

## Features

### Real-Time Updates
- **Polling**: Dashboard polls `/api/magic-mirror/config` every 30 seconds
- **Configurable**: Set `window.MAGIC_MIRROR_POLL_INTERVAL_MS` to customize
- **Auto-refresh**: Widgets reload when config changes detected
- **Pause on hide**: Polling pauses when browser tab hidden

### Error Handling
- **Per-widget boundaries**: Individual widgets can fail without breaking dashboard
- **Graceful degradation**: Errors display in widget area with retry capability
- **State screens**: Dedicated screens for loading, disabled, and error states
- **Health monitoring**: Visual indicator shows connection status

### Security
- **XSS Protection**: All user content sanitized via `textContent`
- **URL Validation**: External links validated before opening
- **Safe event handling**: No inline event handlers
- **CSP Ready**: No eval() or inline scripts

### Responsive Design
- **Grid Layout**: 12-column CSS Grid for flexible positioning
- **Mobile Support**: Stacks widgets vertically on small screens
- **Touch Friendly**: Large touch targets for mobile devices

## Widget System

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

### Adding New Widgets
1. Create new widget class extending `BaseWidget`
2. Implement `render()` method
3. Register in `WidgetFactory.js`
4. Add corresponding API endpoint if needed

## Configuration

### Enable Dashboard
```javascript
{
  "enabled": true,
  "widgets": {
    "clock": { "enabled": true, "gridPosition": {...} },
    "weather": { "enabled": true, "gridPosition": {...} }
  }
}
```

### Customize Polling
Add to `index.html` before loading `app.js`:
```html
<script>
  window.MAGIC_MIRROR_POLL_INTERVAL_MS = 60000; // 60 seconds
</script>
<script type="module" src="app.js"></script>
```

## Migration from Legacy

### What Changed
- ❌ **Removed**: `public/magic-mirror.html` (1,266 lines)
- ❌ **Removed**: `public/smart-mirror.html` (863 lines)
- ❌ **Removed**: HTML generation functions in `modules/magicmirror.js`
- ❌ **Removed**: Deprecated routes (`/api/magicmirror/generate`, regenerate, etc.)
- ✅ **Added**: New SPA in `public/magic-mirror/` (1,348 lines)
- ✅ **Simplified**: `modules/magicmirror.js` from 1,503 to 494 lines

### Admin Changes
- ❌ **Removed**: "Regenerate Dashboard" button (no longer needed)
- ❌ **Removed**: "Clear & Refresh" button (no longer needed)
- ✅ **Kept**: Config save/load functionality
- ✅ **Kept**: Widget enable/disable controls

### API Changes
- ✅ **Kept**: `GET /api/magic-mirror/config` (primary config endpoint)
- ✅ **Kept**: `POST /admin/api/magicmirror/config` (admin save)
- ✅ **Kept**: Widget data endpoints (weather, forecast, calendar, news)
- ❌ **Removed**: `/api/magicmirror/data` (duplicate of config endpoint)
- ❌ **Removed**: `/api/magicmirror/generate` (deprecated)
- ❌ **Removed**: `/admin/api/magicmirror/regenerate` (deprecated)
- ❌ **Removed**: `/admin/api/magicmirror/clear-and-refresh` (deprecated)

## Troubleshooting

### Dashboard Shows "Disabled"
- Check admin panel: ensure "Magic Mirror Dashboard" is set to "Enabled"
- Verify config file: `config/magicmirror-config.json.enc` exists
- Check API: `curl http://localhost:3000/api/magic-mirror/config`

### Dashboard Shows "Loading..." Forever
- Check browser console for errors
- Verify API is accessible
- Check network tab for failed requests
- Ensure polling isn't paused

### Widgets Not Loading
- Individual widget failures don't break dashboard
- Check widget-specific API endpoints
- Verify widget configuration (e.g., API keys for weather)
- Look for error message in widget area

### Static Files Not Loading
- Ensure `/magic-mirror/` route serves static files
- Check server logs for 404 errors
- Verify files exist in `public/magic-mirror/`

## Development

### Local Development
```bash
# Start server
npm start

# Access dashboard
open http://localhost:3000/magic-mirror/

# Edit files
# Changes take effect on page reload (no build needed)
```

### Adding a Widget
1. Create `public/magic-mirror/widgets/MyWidget.js`:
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

## Performance

- **Initial Load**: < 1 second (no dependencies to download)
- **Memory**: ~5-10 MB (varies with number of widgets)
- **Network**: Config API called every 30 seconds (~1 KB payload)
- **CPU**: Minimal (clock updates only active widget)

## Browser Support

- **Modern Browsers**: Chrome 61+, Firefox 60+, Safari 11+, Edge 79+
- **ES6 Modules**: Required (no IE11 support)
- **CSS Grid**: Required for layout

## Future Enhancements

Possible improvements:
- WebSocket support for instant config updates (vs polling)
- Service Worker for offline capability
- Widget marketplace/plugins
- Theme customization
- PWA support for mobile installation
