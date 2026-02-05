# Party Weather Integration

## Overview
Integration of weather forecast information into the party scheduling page and party sub-widget (smart mirror) to help with party planning.

## Features

### Party Scheduling Page (Admin Dashboard)
The party scheduling page now includes a weather forecast section that displays:

- **Daily Summary**: High/low temperatures, condition (sunny, cloudy, rainy, etc.), and precipitation chance
- **Hourly Forecast**: When the party is within 3 days, an hour-by-hour breakdown is shown (up to 8 hours)
- **Weather Icons**: Visual weather icons from OpenWeatherMap for quick reference
- **Smart Notifications**: Informative messages about when hourly forecasts become available

#### Accessing Weather Forecast
1. Navigate to **Admin Dashboard** → **Party** tab → **Scheduling** sub-tab
2. Set a party date in the "Date & Time" section
3. Click **"🔄 Load Weather Forecast"** button in the "Weather Forecast for Party Date" section
4. View the forecast summary and hourly breakdown (if within 3 days)

### Party Sub-Widget (Smart Mirror)
The party sub-widget automatically includes weather information when displayed on the smart mirror:

- **Always Visible**: Compact daily summary with weather icon, high/low temps, and precipitation chance
- **Hourly Breakdown** (within 3 days): Mini hourly forecast showing icons, temperatures, and precipitation for the next 8 hours
- **Minimal Design**: Weather information is presented with icons and brief text to fit the smart mirror aesthetic
- **Weather Source**: Attribution to OpenWeatherMap displayed at the bottom

## Configuration

### Prerequisites
Weather forecasts require the weather widget to be configured in the Smart Mirror settings:

1. Navigate to **Admin Dashboard** → **Smart Mirror** tab
2. Find the **Weather Widget** section
3. Configure:
   - **Enabled**: Set to "Yes"
   - **API Key**: Enter your OpenWeatherMap API key
   - **Location**: Enter your location (e.g., "Seattle" or "Seattle,US")
   - **Units**: Choose "imperial" (°F) or "metric" (°C)

### Getting an OpenWeatherMap API Key
1. Visit [OpenWeatherMap](https://openweathermap.org/)
2. Sign up for a free account
3. Navigate to API Keys section in your account
4. Copy your API key
5. Paste into the Smart Mirror Weather Widget settings

## Technical Details

### Weather Data Source
- **Provider**: OpenWeatherMap
- **API Endpoint**: 5-day forecast (free tier)
- **Update Frequency**: On-demand (admin page) or per smart widget refresh cycle
- **Forecast Range**: Up to 5 days ahead

### Hourly Forecast Logic
- **Availability**: Only when party date is within 5 days (OpenWeatherMap limitation)
- **Display Threshold**: Hourly breakdown shown when party is within 3 days
- **Resolution**: 3-hour intervals from OpenWeatherMap API
- **Display Limit**: Up to 8 hourly forecasts shown for compact display

### Error Handling
The integration includes comprehensive error handling:

- **No Weather Config**: Displays helpful hint to configure weather widget
- **API Key Missing**: Shows message to add API key in settings
- **Date Out of Range**: Informs user when party date is beyond forecast range (>5 days)
- **API Failures**: Graceful degradation with error messages
- **Widget Fallback**: Party widget displays normally without weather if API unavailable

## API Endpoints

### Party Weather Endpoint
```
GET /admin/api/party/weather
```

**Authentication**: Required

**Response Success**:
```json
{
  "success": true,
  "data": {
    "summary": {
      "date": "2026-02-10",
      "tempHigh": 65,
      "tempLow": 45,
      "condition": "Clear",
      "icon": "01d",
      "precipChance": 10
    },
    "hourly": [...],
    "location": "Seattle",
    "units": "imperial",
    "daysUntil": 2,
    "showHourly": true
  }
}
```

**Response Error**:
```json
{
  "success": false,
  "error": "Weather widget not enabled",
  "hint": "Enable weather in Smart Mirror settings to see weather forecasts"
}
```

### Smart Widget Integration
Weather data is automatically included in the party sub-widget response:

```
GET /api/smart-mirror/smart-widget
```

**Weather Data Structure**:
```json
{
  "type": "party",
  "data": {
    "dateTime": {...},
    "daysUntil": 2,
    "weather": {
      "summary": {...},
      "hourly": [...],
      "units": "imperial",
      "location": "Seattle"
    },
    ...
  }
}
```

## User Experience

### Timeline
- **More than 3 days before party**: Daily summary only
- **3 days before party**: Daily summary + hourly forecast
- **Party day**: Full weather breakdown with hourly details

### Visual Design
- **Admin Page**: Full-featured display with clear sections and styling
- **Smart Mirror**: Minimalist design with icons and essential text only
- **Icons**: OpenWeatherMap icon set for consistent weather visualization
- **Colors**: Neutral colors that work with both light and dark themes

## Testing

### Test Script
Run the comprehensive integration test:

```bash
node scripts/test-party-weather-integration.js
```

**Tests Include**:
- ✅ Weather fetching function exists in smartmirror.js
- ✅ Party weather API endpoint in server.js
- ✅ Weather integration in party sub-widget case
- ✅ Weather rendering in smart mirror widget
- ✅ Weather display in admin dashboard
- ✅ Error handling implementation
- ✅ OpenWeatherMap attribution
- ✅ Conditional hourly forecast display

### Manual Testing

#### Test Scenario 1: Party More Than 3 Days Away
1. Set party date to 5 days from now
2. Configure weather API in Smart Mirror settings
3. Load weather forecast on party scheduling page
4. **Expected**: Daily summary only, message about hourly forecast availability

#### Test Scenario 2: Party Within 3 Days
1. Set party date to tomorrow
2. Load weather forecast
3. **Expected**: Daily summary + hourly forecast for 8 hours

#### Test Scenario 3: No Weather Configuration
1. Disable weather widget or remove API key
2. Try to load weather forecast
3. **Expected**: Helpful error message with configuration hints

#### Test Scenario 4: Smart Mirror Display
1. Set party date with weather configured
2. Enable party sub-widget
3. View smart mirror at `/smart-mirror`
4. **Expected**: Weather displayed in party widget with icons and minimal text

## Performance

### Caching
- Weather data is fetched on-demand (admin page button click)
- Smart widget weather is refreshed on normal widget update cycle
- No persistent caching (uses OpenWeatherMap's cache recommendations)

### API Rate Limits
OpenWeatherMap free tier allows:
- 1,000 API calls per day
- 60 calls per minute

The integration is designed to minimize API calls:
- Admin page: Only on explicit button click
- Smart widget: Only when party widget is active and weather is configured

## Troubleshooting

### Weather Not Loading
1. **Check Weather Widget**: Ensure enabled in Smart Mirror settings
2. **Verify API Key**: Confirm valid OpenWeatherMap API key
3. **Check Location**: Verify location string is correct (e.g., "Seattle,US")
4. **Date Range**: Party must be within 5 days for forecast data

### Hourly Forecast Not Showing
1. **Check Days Until Party**: Must be 3 days or less
2. **Verify API Response**: Check browser console for errors
3. **Date Format**: Ensure party date is set correctly (YYYY-MM-DD)

### Widget Display Issues
1. **Enable Party Widget**: Confirm party sub-widget is enabled
2. **Party Date Required**: Widget needs valid party date
3. **Weather Optional**: Widget displays without weather if unavailable

## Security

### CodeQL Analysis
- ✅ No security vulnerabilities detected
- ✅ All JavaScript code passes security checks
- ✅ Proper input validation and error handling

### Data Privacy
- Weather data fetched from public OpenWeatherMap API
- No personal information sent to weather service
- API key stored in server configuration (encrypted via Smart Mirror module)

## Future Enhancements

Possible improvements for future versions:
- Weather alerts and warnings for party date
- Extended 7-day forecast (requires paid OpenWeatherMap tier)
- Weather-based party suggestions (best outdoor times)
- Historical weather comparison for date selection
- Integration with other weather services (Weather.gov, DarkSky alternative)
- Weather-based task reminders (e.g., "Rain expected - set up indoor decorations")

## Credits

- **Weather Data**: OpenWeatherMap API
- **Integration**: Built on existing Smart Mirror weather widget infrastructure
- **Icons**: OpenWeatherMap icon set
- **Implementation**: Follows established patterns from party widget and weather widget

## References

- [OpenWeatherMap API Documentation](https://openweathermap.org/api)
- [Party Widget Implementation](PARTY_WIDGET_IMPLEMENTATION.md)
- [Smart Mirror API](SMART_MIRROR_API.md)

## Version History

- **v1.0** (2026-02-03): Initial implementation
  - Daily weather summary for party date
  - Hourly forecast within 3 days
  - Admin page weather display
  - Smart mirror widget integration
  - Comprehensive error handling
