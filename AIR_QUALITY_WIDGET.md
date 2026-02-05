# Air Quality Widget

## Overview
The Air Quality Widget is a compact, single-tile widget that displays real-time air quality information including current AQI (Air Quality Index) and forecasts for today and tomorrow. The widget features special highlighting when outdoor conditions are favorable for spending time outside.

## Features

### Core Display
- **Current AQI**: Shows the current Air Quality Index value and classification
- **Today's Forecast**: Displays today's air quality forecast
- **Tomorrow's Forecast**: Shows tomorrow's expected air quality
- **Temperature Display**: Shows current temperature for context
- **Visual Indicators**: Uses emojis and color coding to quickly communicate air quality levels

### Smart Highlighting
The widget can automatically highlight when conditions are favorable for outdoor activities:
- **Trigger**: AQI is "Good" (level 1) AND temperature is ≤ 75°F (or ≤ 24°C for metric)
- **Visual Effect**: Green glowing border with pulsing animation
- **Purpose**: Immediately signals ideal conditions for outdoor time

### Compact Design
- **Size**: Designed to occupy a single grid tile (1x1)
- **Responsive**: Maintains clarity even at small sizes
- **Minimal**: Clean, easy-to-read layout that doesn't overwhelm the dashboard

## AQI Scale

The widget uses the standard OpenWeatherMap Air Quality Index scale:

| AQI Level | Label | Icon | Color | Description |
|-----------|-------|------|-------|-------------|
| 1 | Good | 😊 | Green | Air quality is satisfactory |
| 2 | Fair | 🙂 | Light Green | Air quality is acceptable |
| 3 | Moderate | 😐 | Yellow | Acceptable for most, sensitive groups may experience issues |
| 4 | Poor | 😷 | Orange | Everyone may begin to experience health effects |
| 5 | Very Poor | 🤢 | Red | Health alert: everyone may experience serious effects |

## Configuration

### Prerequisites
- OpenWeatherMap API key (same key used for weather widgets)
- Location configured in the Smart Mirror settings

### Admin Panel Setup

1. **Navigate to Smart Mirror Configuration**
   - Go to Admin Dashboard
   - Scroll to "Smart Mirror Dashboard" section
   - Find "🌬️ Air Quality Widget (Compact AQI Display)"

2. **Enable the Widget**
   - Set "Air Quality Widget" to "Enabled"

3. **Configure Settings**
   - **Size**: Choose Small (recommended), Medium, or Large
   - **Grid Position**: Set X and Y coordinates for widget placement
     - Default: X=0, Y=4 (bottom-left on portrait layout)
   - **Width/Height**: Set grid size (1x1 recommended for compact display)
   - **Highlight Favorable Conditions**: 
     - Enable to show green glow when AQI is good and temp ≤ 75°F
     - Disable for standard display without highlighting

4. **Save Configuration**
   - Click "Save Smart Mirror Configuration"
   - The widget will appear on the dashboard at the configured position

### Grid Layout Editor

The Air Quality Widget can also be positioned using the visual grid editor:
1. Open the Grid Layout Editor in the admin panel
2. Find "Air Quality" in the widget palette
3. Drag and drop to desired position
4. Resize if needed (though 1x1 is optimal)
5. Save layout changes

## API Integration

The widget uses the OpenWeatherMap Air Pollution API:
- **Endpoint**: `/api/smart-mirror/air-quality`
- **Data Source**: OpenWeatherMap Air Pollution API v2.5
- **Refresh Rate**: Updates according to Smart Mirror refresh interval (default: 60 seconds)
- **Components Tracked**: PM2.5, PM10, NO2, SO2, O3, CO, NH3

### Data Flow
1. Widget requests data from server endpoint
2. Server fetches location coordinates using geocoding API
3. Server retrieves current air quality and forecast data
4. Server fetches current weather for temperature check
5. Data is processed and sent to widget with highlight status
6. Widget displays information with appropriate styling

## Usage Examples

### Basic Setup
```javascript
// Minimal configuration in smartmirror-config.json
{
  "widgets": {
    "airQuality": {
      "enabled": true,
      "size": "small",
      "apiKey": "your-openweathermap-api-key",
      "location": "New York",
      "units": "imperial",
      "highlightFavorableConditions": true
    }
  },
  "layouts": {
    "portrait": {
      "airQuality": { "x": 0, "y": 4, "width": 1, "height": 1 }
    }
  }
}
```

### Advanced Configuration
```javascript
{
  "widgets": {
    "airQuality": {
      "enabled": true,
      "size": "small",
      "apiKey": "your-api-key",
      "location": "San Francisco, CA",
      "units": "imperial",
      "highlightFavorableConditions": true,
      "area": "bottom-right"
    }
  },
  "layouts": {
    "portrait": {
      "airQuality": { "x": 3, "y": 5, "width": 1, "height": 1 }
    },
    "landscape": {
      "airQuality": { "x": 7, "y": 3, "width": 1, "height": 1 }
    }
  }
}
```

## Technical Details

### Frontend Components
- **File**: `public/smart-mirror.html`
- **Function**: `updateAirQualityWidget(content, widgetConfig)`
- **Update Interval**: 60 seconds (configurable)
- **Styling**: Responsive CSS with color-coded AQI levels

### Backend Components
- **Module**: `modules/smartmirror.js`
- **Function**: `fetchAirQuality(apiKey, location, units)`
- **Endpoint**: `GET /api/smart-mirror/air-quality`
- **Dependencies**: axios, OpenWeatherMap APIs

### Styling
```css
/* Main container */
.air-quality-container { /* Flexbox layout */ }

/* Highlight effect */
.widget.air-quality-favorable {
  background: rgba(76, 175, 80, 0.2);
  border: 2px solid rgba(76, 175, 80, 0.6);
  box-shadow: 0 0 20px rgba(76, 175, 80, 0.4);
  animation: pulse-glow 2s ease-in-out infinite;
}

/* Color coding */
.aqi-good { color: #4CAF50; }
.aqi-fair { color: #8BC34A; }
.aqi-moderate { color: #FFC107; }
.aqi-poor { color: #FF9800; }
.aqi-very-poor { color: #F44336; }
```

## Troubleshooting

### Widget Not Displaying
1. Verify widget is enabled in admin panel
2. Check OpenWeatherMap API key is configured
3. Ensure location is set in central weather settings
4. Check browser console for API errors
5. Verify grid position doesn't overlap with other widgets

### No Highlight Effect
1. Check "Highlight Favorable Conditions" is enabled
2. Verify current AQI is actually "Good" (level 1)
3. Confirm temperature is ≤ 75°F (imperial) or ≤ 24°C (metric)
4. Check browser supports CSS animations

### API Errors
1. Verify OpenWeatherMap API key is valid
2. Check API key has access to Air Pollution API
3. Ensure location name is valid
4. Check network connectivity
5. Review server logs for detailed error messages

### Data Not Updating
1. Check Smart Mirror refresh interval setting
2. Verify browser is not blocking API requests
3. Check server logs for fetch errors
4. Ensure OpenWeatherMap API rate limits not exceeded

## Best Practices

### Placement
- **Recommended**: Single tile (1x1) in corner or edge position
- **Avoid**: Center placement or large sizes (reduces information density)
- **Pair with**: Weather widget for comprehensive outdoor conditions view

### Configuration
- **Highlight**: Enable for at-a-glance outdoor favorability
- **Units**: Match other weather widgets for consistency
- **Update Frequency**: Keep at default 60s to avoid API rate limits

### Visual Design
- Widget automatically adapts to light/dark theme
- Color coding provides intuitive understanding without reading
- Compact size ensures dashboard remains uncluttered

## Version History

### v2.6.17 (Current)
- Initial release of Air Quality Widget
- Features:
  - Current, today, and tomorrow AQI display
  - Favorable conditions highlighting
  - Color-coded AQI levels
  - OpenWeatherMap Air Pollution API integration
  - Responsive design for single-tile display
  - Grid editor support

## Credits
- **API**: OpenWeatherMap Air Pollution API
- **Widget Type**: Compact informational display
- **Design Pattern**: Following existing Smart Mirror widget architecture

## See Also
- [Weather Widget](SMART_WIDGET.md) - Companion widget for complete outdoor conditions
- [Smart Mirror Documentation](README.md) - Main dashboard configuration
- [Grid Editor Guide](GRID_EDITOR_USER_GUIDE.md) - Visual widget positioning
