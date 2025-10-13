# Weather Widget Enhancement Documentation

## Overview

The weather widget system has been enhanced to fix data rendering issues and split functionality into two separate widgets:
1. **Current Weather Widget** - Shows current weather conditions
2. **Forecast Widget** - Shows multi-day weather forecast

## Changes Summary

### Fixed Issues
- ✅ Resolved 'undefined' values in weather display
- ✅ Fixed API response field mapping mismatch
- ✅ Added missing `condition` and `unit` fields to API response
- ✅ Added weather icon display for better visual feedback
- ✅ Improved error handling for missing data

### New Features
- ✅ Separate Forecast widget for multi-day weather predictions
- ✅ Configurable forecast duration (1, 3, 5, or 10 days)
- ✅ Daily temperature ranges (min/max)
- ✅ Weather condition icons for forecast days
- ✅ Humidity and wind speed for each forecast day

## API Endpoints

### Current Weather: `/api/magicmirror/weather`

**Response Structure:**
```json
{
  "temperature": 18,
  "description": "partly cloudy",
  "condition": "Clouds",
  "icon": "02d",
  "location": "London",
  "humidity": 65,
  "windSpeed": 3.5,
  "unit": "C"
}
```

**Fields:**
- `temperature` (number): Current temperature (rounded)
- `description` (string): Detailed weather description
- `condition` (string): Main weather category (Clear, Clouds, Rain, Snow, etc.)
- `icon` (string): OpenWeather icon code
- `location` (string): Location name
- `humidity` (number): Humidity percentage
- `windSpeed` (number): Wind speed in m/s
- `unit` (string): Temperature unit ('C' for Celsius)

### Forecast: `/api/magicmirror/forecast`

**Response Structure:**
```json
{
  "location": "London",
  "unit": "C",
  "forecast": [
    {
      "date": "Oct 14, 2025",
      "temperature": 17,
      "maxTemp": 19,
      "minTemp": 15,
      "condition": "Clouds",
      "humidity": 68,
      "windSpeed": "3.2",
      "icon": "04d"
    }
  ]
}
```

**Fields:**
- `location` (string): Location name
- `unit` (string): Temperature unit
- `forecast` (array): Array of forecast days
  - `date` (string): Date in readable format
  - `temperature` (number): Average temperature
  - `maxTemp` (number): Maximum temperature
  - `minTemp` (number): Minimum temperature
  - `condition` (string): Main weather category
  - `humidity` (number): Average humidity percentage
  - `windSpeed` (string): Average wind speed in m/s
  - `icon` (string): OpenWeather icon code

## Configuration

### Widget Configuration

Both widgets share the same weather configuration for API key and location:

```json
{
  "weather": {
    "location": "London, UK",
    "apiKey": "your_openweather_api_key"
  },
  "forecast": {
    "days": 5
  }
}
```

### Widget Placement

Each widget can be independently enabled and positioned:

```json
{
  "widgets": {
    "weather": {
      "enabled": true,
      "area": "upper-center",
      "size": "box"
    },
    "forecast": {
      "enabled": true,
      "area": "upper-right",
      "size": "box"
    }
  }
}
```

### Forecast Days Configuration

The forecast widget supports the following day counts:
- `1` - Tomorrow only
- `3` - Next 3 days
- `5` - Next 5 days (default)
- `10` - Next 10 days

Set via the `forecast.days` configuration value.

## Usage Examples

### Enable Both Widgets

1. Navigate to Admin Panel → Server → Magic Mirror
2. Configure Weather Settings:
   - Location: "London, UK"
   - API Key: Your OpenWeather API key
3. Enable Current Weather Widget:
   - Check "Weather" checkbox
   - Choose placement area
4. Enable Forecast Widget:
   - Check "Forecast" checkbox
   - Choose placement area
   - Set number of forecast days (default: 5)
5. Save Configuration

### Current Weather Only

To show only current weather without forecast:
- Enable "Weather" widget
- Keep "Forecast" widget disabled

### Forecast Only

To show only forecast without current weather:
- Enable "Forecast" widget
- Keep "Weather" widget disabled

## Weather Icons

Both widgets use emoji icons to represent weather conditions:

| Condition | Icon |
|-----------|------|
| Clear | ☀️ |
| Clouds | ☁️ |
| Rain | 🌧️ |
| Snow | ❄️ |
| Thunderstorm | ⛈️ |
| Drizzle | 🌦️ |
| Mist | 🌫️ |
| Fog | 🌫️ |

## Error Handling

### Widget Not Configured
```json
{
  "error": "Weather widget not configured"
}
```
**Solution**: Enable the widget in Magic Mirror configuration

### No API Key
```json
{
  "temperature": "--",
  "description": "API key required",
  "condition": "N/A",
  "location": "YourCity",
  "placeholder": true
}
```
**Solution**: Add OpenWeather API key in configuration

### Invalid API Key
```json
{
  "error": "Failed to fetch weather data: ..."
}
```
**Solution**: Verify API key is correct and active

## Technical Implementation

### Data Flow

1. Client requests weather data via AJAX
2. Server validates widget configuration
3. Server fetches data from OpenWeather API
4. Server processes and formats response
5. Client renders data with icons

### Update Intervals

- **Current Weather**: Updates every 10 minutes
- **Forecast**: Updates every 10 minutes

### API Limits

OpenWeather free tier limits:
- 1,000 calls per day
- 60 calls per minute

With 10-minute update intervals, both widgets combined use approximately:
- 288 calls per day (well within free tier limits)

## Troubleshooting

### Undefined Values in Display

**Fixed in this update**. If you still see undefined values:
1. Clear browser cache
2. Check browser console for errors
3. Verify API key is configured correctly
4. Test API connection using `/api/magicmirror/weather/test`

### Forecast Not Showing

1. Verify forecast widget is enabled
2. Check that weather API key is configured
3. Ensure `forecast.days` is set (default: 5)
4. Check browser console for errors

### Icons Not Displaying

Weather icons are emoji-based and should display on all modern browsers. If icons don't show:
1. Update your browser
2. Check system font support for emoji
3. Try a different browser

## OpenWeather API Setup

1. Visit [openweathermap.org](https://openweathermap.org/api)
2. Sign up for a free account
3. Navigate to "API keys" section
4. Copy your API key
5. Paste into Magic Mirror configuration

**Note**: New API keys may take up to 2 hours to activate.

## Migration from Old Weather Widget

If you're upgrading from the old weather widget:

1. Your existing weather configuration will continue to work
2. The weather widget now has the title "Current Weather" instead of "Weather"
3. Forecast is now a separate widget - enable it to see multi-day forecasts
4. No data migration needed - just enable the forecast widget if desired

## API Response Changes

### Before (Old Response)
```json
{
  "temperature": 18,
  "description": "partly cloudy",
  "icon": "02d",
  "location": "London",
  "humidity": 65,
  "windSpeed": 3.5
}
```

### After (New Response)
```json
{
  "temperature": 18,
  "description": "partly cloudy",
  "condition": "Clouds",        // NEW: Main condition category
  "icon": "02d",
  "location": "London",
  "humidity": 65,
  "windSpeed": 3.5,
  "unit": "C"                   // NEW: Temperature unit
}
```

The additions are backward compatible - old clients will ignore the new fields.

## Future Enhancements

Potential future improvements:
- Multiple location support
- Temperature unit conversion (Celsius/Fahrenheit)
- Hourly forecast view
- Weather alerts/warnings
- Historical weather data
- Custom icon themes

## Support

For issues or questions:
1. Check the [MAGIC_MIRROR_DOCS.md](./MAGIC_MIRROR_DOCS.md) for general Magic Mirror documentation
2. Review [WEATHER_API_KEY_FIX.md](./WEATHER_API_KEY_FIX.md) for API key troubleshooting
3. Open an issue on GitHub with reproduction steps
