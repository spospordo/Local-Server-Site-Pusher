# Air Quality Widget

## Overview

The Air Quality Widget displays real-time Air Quality Index (AQI) data along with forecasts for today and tomorrow. It provides a compact, single-tile display perfect for monitoring air quality conditions at a glance.

## Features

### Data Display
- **Current AQI**: Shows the current Air Quality Index with color-coded indicators
- **Today's Forecast**: Displays forecasted AQI for today
- **Tomorrow's Forecast**: Displays forecasted AQI for tomorrow
- **AQI Classification**: Labels indicating air quality level (Good, Fair, Moderate, Poor, Very Poor)

### Special Highlight Feature
When conditions are ideal for outdoor activities, the widget provides visual feedback:
- **Activation Criteria**: 
  - AQI must be "Good" (level 1)
  - Temperature must be ≤ 75°F (or ≤ 24°C in metric)
- **Visual Effect**: 
  - Bright green gradient background
  - Glowing pulsing border
  - Display of current temperature
  - "Perfect conditions!" message
- **Configuration**: The highlight effect can be enabled/disabled in the admin panel

### AQI Color Scale
- **Good (1)**: Green - Air quality is satisfactory
- **Fair (2)**: Yellow - Air quality is acceptable
- **Moderate (3)**: Orange - Sensitive groups may experience effects
- **Poor (4)**: Red - Everyone may begin to experience health effects
- **Very Poor (5)**: Purple - Health warnings of emergency conditions

## Configuration

### Requirements
1. **OpenWeatherMap API Key**: The widget uses the OpenWeatherMap Air Pollution API
   - Configure in Admin → APIs and Connections section
   - Same API key is shared with weather-related widgets

2. **Location**: City name, state, or zip code
   - Can be configured per-widget or use the global location setting
   - Format: "Seattle, WA" or "98101"

### Admin Panel Setup

1. Navigate to Admin Dashboard → Smart Mirror Configuration
2. Scroll to "🌬️ Air Quality Widget (AQI Monitor)" section
3. Configure the following settings:

#### Basic Settings
- **Enable/Disable**: Toggle the widget on or off
- **Size**: Small (recommended), Medium, or Large
- **Grid Position**: X and Y coordinates in the grid layout
- **Grid Size**: Width and height in grid cells (1x1 recommended for compact display)

#### Location Settings
- **Location**: Specific location for air quality data (optional)
  - Leave blank to use default location from APIs & Connections
- **Temperature Units**: Fahrenheit or Celsius
  - Leave as default to use units from APIs & Connections

#### Highlight Settings
- **Enable Highlight Effect**: Toggle the special highlight feature
  - When enabled, widget highlights when AQI is Good and temp ≤ 75°F/24°C
  - When disabled, widget displays normally regardless of conditions

### Grid Layout Editor

The Air Quality Widget can be positioned using the visual grid layout editor:
1. Open the Grid Layout Editor in the admin panel
2. Look for the 🌬️ icon representing the Air Quality Widget
3. Drag and drop to position it on your dashboard
4. Resize by adjusting grid cell dimensions
5. Switch between Portrait and Landscape layouts as needed

## Data Source

The widget uses the OpenWeatherMap Air Pollution API which provides:
- Current air quality measurements
- Air quality forecasts
- Component pollutant data (PM2.5, PM10, NO2, O3, etc.)
- Data updated regularly from monitoring stations worldwide

**API Endpoint**: `https://api.openweathermap.org/data/2.5/air_pollution`

## API Endpoints

### Server API
- **GET** `/api/smart-mirror/air-quality`
  - Returns current and forecasted air quality data
  - Requires air quality widget to be enabled in configuration
  - Response includes highlight status based on current conditions

## Technical Details

### Widget Structure
```javascript
{
  current: {
    aqi: 1-5,           // Air Quality Index level
    label: "Good",      // Human-readable classification
    components: {...}   // Detailed pollutant data
  },
  today: {
    aqi: 1-5,
    label: "Good"
  },
  tomorrow: {
    aqi: 1-5,
    label: "Fair"
  },
  temperature: 72,      // Current temperature
  location: "Seattle",  // Location name
  units: "imperial",    // Temperature units
  shouldHighlight: true // Whether to apply highlight effect
}
```

### Styling
The widget uses responsive CSS with:
- Color-coded AQI levels for at-a-glance assessment
- Smooth animations for highlight effect
- Theme-aware styling (dark/light mode support)
- Compact design optimized for single grid cell

### Performance
- Data cached at API level to prevent excessive requests
- Automatic refresh at configured intervals
- Minimal bandwidth usage with compact data format

## Troubleshooting

### Widget not displaying
1. Verify the widget is enabled in admin panel
2. Check that OpenWeatherMap API key is configured
3. Ensure location is properly set
4. Verify internet connectivity for API access

### No highlight effect
1. Check that highlight is enabled in widget settings
2. Verify AQI is actually "Good" (level 1)
3. Confirm temperature is ≤ 75°F (or ≤ 24°C)
4. Check browser console for any JavaScript errors

### Incorrect data
1. Verify API key is valid and active
2. Check location spelling and format
3. Confirm OpenWeatherMap API has data for your location
4. Review server logs for API error messages

## Examples

### Typical Display (Good Air Quality, Warm)
```
🌬️ Air Quality
      1
     Good
   Today    Tomorrow
   Good      Fair
```

### Highlighted Display (Good Air Quality, Cool)
```
[Glowing green background with pulse animation]
🌬️ Air Quality
      1
     Good
   Today    Tomorrow
   Good      Fair
Perfect conditions! 68°F
```

### Poor Air Quality
```
🌬️ Air Quality
      4
     Poor
   Today    Tomorrow
   Poor      Moderate
```

## Best Practices

1. **Position**: Place in a visible but non-intrusive location
2. **Size**: Keep at 1x1 grid cell for optimal readability
3. **Highlight**: Enable if you want visual alerts for good outdoor conditions
4. **Updates**: Monitor during high pollution seasons or wildfire events
5. **Combine**: Use alongside weather widgets for comprehensive outdoor condition monitoring

## Version Information

- **Added**: Version 2.6.12
- **API Version**: OpenWeatherMap Air Pollution API v2.5
- **Dependencies**: axios, OpenWeatherMap API key

## Related Widgets

- **Weather Widget**: Current weather conditions
- **Forecast Widget**: Multi-day weather forecast
- **Vacation Widget**: Vacation planning with weather
- **Smart Widget**: Intelligent multi-widget container

## Support

For issues or questions:
1. Check server logs for error messages
2. Verify OpenWeatherMap API status
3. Review configuration settings
4. Check GitHub issues for known problems
