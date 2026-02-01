# Smart Widget Implementation

## Overview

The **Smart Widget** is an intelligent container widget for the Smart Mirror dashboard that manages and displays multiple sub-widgets based on their content relevance and available space. It provides a flexible way to show dynamic information like weather alerts, upcoming events, and media status without cluttering the dashboard.

## Features

### Core Capabilities

- **Intelligent Content Display**: Only shows sub-widgets when they have active/relevant content
- **Multiple Display Modes**:
  - **Cycle**: Rotates through sub-widgets at a configurable speed
  - **Simultaneous**: Shows multiple sub-widgets at once (configurable maximum)
  - **Priority**: Displays only the highest-priority sub-widget with content
- **Priority-Based Ordering**: Sub-widgets with lower priority numbers appear first
- **Automatic Updates**: Integrates with the Smart Mirror refresh system

### Initial Sub-Widgets

1. **🌧️ Rain Forecast**: Shows if rain is expected in the next 1-5 days
   - Displays earliest rain day
   - Shows precipitation probability
   - Only appears when rain is in the forecast

2. **✈️ Upcoming Vacation**: Displays the next vacation from House → Vacation page
   - Shows destination and countdown
   - Displays start date
   - Only appears when a vacation is scheduled

3. **🎵 Home Assistant Media**: Indicates when media is playing
   - Shows artwork, title, and artist
   - Displays playback status and player name
   - Only appears when media is actively playing or paused

## Configuration

### Admin Interface

Navigate to **Admin → Server → Smart Mirror → Smart Widget** to configure:

#### Widget Settings

- **Enabled**: Turn the Smart Widget on or off
- **Size**: Small, Medium, or Large
- **Grid Position**: X, Y coordinates and width/height on the grid

#### Display Settings

- **Display Mode**: Choose how sub-widgets are shown
  - Cycle: Rotate through sub-widgets
  - Simultaneous: Show multiple at once
  - Priority: Show only highest priority
- **Cycle Speed**: Time between rotations (5-60 seconds)
- **Max Simultaneous**: Maximum sub-widgets to show at once (1-4)

#### Sub-Widget Configuration

Each sub-widget can be:
- **Enabled/Disabled**: Toggle visibility
- **Priority**: Set display order (1 = highest priority)

#### Shared Configuration

- **OpenWeatherMap API Key**: Required for Rain Forecast
- **Location**: City name for weather lookups
- **Temperature Units**: Imperial (°F) or Metric (°C)
- **Home Assistant URL**: For media player integration
- **Home Assistant Token**: Long-lived access token
- **Entity IDs**: Media player entities to monitor

## API Endpoints

### Public Endpoint (Smart Mirror Access)

#### Get Smart Widget Data
```
GET /api/smart-mirror/smart-widget
```

Returns aggregated sub-widget data with active content only.

**Response:**
```json
{
  "success": true,
  "displayMode": "cycle",
  "cycleSpeed": 10,
  "simultaneousMax": 2,
  "subWidgets": [
    {
      "type": "rainForecast",
      "priority": 1,
      "hasContent": true,
      "data": {
        "hasRain": true,
        "rainDays": [
          {
            "daysFromNow": 2,
            "date": "2026-02-03",
            "description": "Light rain",
            "precipitation": 0.65
          }
        ],
        "location": "Seattle"
      }
    },
    {
      "type": "upcomingVacation",
      "priority": 2,
      "hasContent": true,
      "data": {
        "destination": "Hawaii",
        "startDate": "2026-03-15",
        "endDate": "2026-03-22",
        "daysUntil": 42
      }
    }
  ]
}
```

#### Get Rain Forecast
```
GET /api/smart-mirror/rain-forecast
```

Returns detailed rain forecast for the configured location.

**Response:**
```json
{
  "success": true,
  "hasRain": true,
  "rainDays": [
    {
      "daysFromNow": 2,
      "date": "2026-02-03",
      "description": "Light rain",
      "precipitation": 0.65
    }
  ],
  "location": "Seattle"
}
```

## Frontend Integration

### Display Logic

The Smart Widget automatically:
1. Fetches aggregated sub-widget data from the API
2. Filters out sub-widgets without active content
3. Sorts by priority (lowest number first)
4. Renders based on display mode:
   - **Cycle**: Shows one sub-widget, rotating through them
   - **Simultaneous**: Shows multiple sub-widgets in a grid
   - **Priority**: Shows only the first (highest priority) sub-widget

### Styling

Sub-widgets are rendered with:
- Icon or artwork (if available)
- Title/heading text
- Supporting information
- Consistent spacing and backgrounds

The widget container uses CSS Grid for layout in simultaneous mode, adapting to the number of active sub-widgets.

## Backend Architecture

### Module Structure (`modules/smartmirror.js`)

- `getDefaultWidgets()`: Includes Smart Widget default configuration
- `getDefaultPortraitLayout()`: Defines portrait grid position
- `getDefaultLandscapeLayout()`: Defines landscape grid position

### API Endpoints (`server.js`)

- **Smart Widget Aggregator**: Fetches data from all enabled sub-widgets
- **Rain Forecast**: Analyzes weather forecast for rain
- Sub-widgets leverage existing endpoints (vacation, media, forecast)

### Sub-Widget Integration

Each sub-widget:
1. Checks if it has relevant content to display
2. Returns structured data if content exists
3. Returns null if no content (hidden from display)

## Usage Examples

### Example 1: Cycle Mode
Shows rain alert, then vacation countdown, then media player info, rotating every 10 seconds.

### Example 2: Simultaneous Mode
Shows both rain forecast and vacation countdown side-by-side if both have content.

### Example 3: Priority Mode
Shows only the rain forecast if present, otherwise shows vacation, otherwise shows media.

## Testing

Run the test suite:
```bash
node scripts/test-smart-widget.js
```

Tests validate:
- Configuration loading and persistence
- Sub-widget types and priorities
- Layout definitions
- Display mode validation
- Integration with vacation data module

## Security Considerations

- **API Keys**: Weather API keys are encrypted at rest using AES-256-GCM
- **Home Assistant Tokens**: Access tokens are encrypted and never exposed to frontend
- **Admin Only**: Configuration changes require authentication
- **Input Validation**: All user inputs are validated and sanitized

## Best Practices

1. **Priority Management**: Assign priorities based on importance
   - Critical alerts: 1-2
   - Informational: 3-5
   - Nice-to-have: 6-10

2. **Cycle Speed**: Balance update frequency with readability
   - Fast (5-8s): For time-sensitive info
   - Medium (10-15s): Default, good balance
   - Slow (20-30s): For detailed content

3. **Display Mode Selection**:
   - **Cycle**: Best for 3+ sub-widgets or limited space
   - **Simultaneous**: Best for 2-3 important items
   - **Priority**: Best for single most important alert

4. **API Keys**: Use the same OpenWeatherMap key as other widgets to save costs

## Future Enhancements

Potential additions:
- Custom sub-widgets via UI
- Animation transitions between cycles
- Tap-to-pause cycling
- Sub-widget templates
- More built-in sub-widgets (traffic, sports scores, etc.)

## Troubleshooting

### Smart Widget Not Appearing
- Check that Smart Widget is enabled in admin
- Verify at least one sub-widget is enabled
- Ensure sub-widgets have active content (rain in forecast, vacation scheduled, media playing)

### Rain Forecast Not Showing
- Verify OpenWeatherMap API key is configured
- Check location is correct
- Ensure there's actually rain in the 5-day forecast

### Vacation Not Showing
- Add vacation dates in House → Vacation section
- Ensure vacation date is in the future
- Check vacation sub-widget is enabled

### Media Not Showing
- Verify Home Assistant URL and token are correct
- Check entity IDs are valid media players
- Ensure media is actually playing or paused

## Version History

- **v2.5.0** (2026-02-01): Initial Smart Widget implementation
  - Added Smart Widget container with three sub-widgets
  - Implemented cycle, simultaneous, and priority display modes
  - Added rain forecast sub-widget with weather API integration
  - Integrated upcoming vacation sub-widget
  - Added Home Assistant media sub-widget
  - Created admin interface for configuration
  - Added comprehensive testing suite

## Related Documentation

- [HOME_ASSISTANT_MEDIA_WIDGET.md](HOME_ASSISTANT_MEDIA_WIDGET.md) - Media widget setup
- [VACATION_WIDGET.md](VACATION_WIDGET.md) - Vacation widget details
- [SMART_MIRROR_GRID_POSITIONING.md](SMART_MIRROR_GRID_POSITIONING.md) - Grid layout system
- [README.md](README.md) - General Smart Mirror documentation
