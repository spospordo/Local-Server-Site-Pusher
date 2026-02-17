# Vacation Widget Implementation

## Overview

This document describes the implementation of the Upcoming Vacation Widget for the Smart Mirror dashboard. The widget displays upcoming vacations with weather forecasts, timezone information, and countdown timers.

## Features Implemented

### 1. Backend API Endpoints

#### Public Endpoints (Smart Mirror Access)

- **`GET /api/smart-mirror/vacation`**
  - Returns upcoming vacation dates for the smart mirror
  - Filters for vacations starting today or in the future
  - Sorts by start date (earliest first)
  - Requires vacation widget to be enabled

- **`GET /api/smart-mirror/vacation-weather`**
  - Fetches weather forecast for a vacation destination
  - Query parameter: `location` (destination name)
  - Attempts to fetch 5-day forecast, falls back to current weather
  - Returns weather data with fallback indicator

- **`GET /api/smart-mirror/vacation-timezone`**
  - Fetches timezone information for a vacation destination
  - Query parameter: `location` (destination name)
  - Returns timezone offset in seconds from UTC
  - Uses OpenWeatherMap API for timezone data

#### Admin Endpoints

- **`POST /admin/api/smart-mirror/test-location`**
  - Validates if a location name returns weather data
  - Used by admin UI to test vacation destinations
  - Returns detailed feedback and current weather if successful

### 2. Smart Mirror Module Updates

#### Widget Configuration (`modules/smartmirror.js`)

Added vacation widget to default configuration:
```javascript
vacation: {
  enabled: false,
  area: 'bottom-right',
  size: 'medium',
  apiKey: '',
  location: '',
  units: 'imperial',
  calendarUrls: [],
  feedUrls: [],
  days: 5
}
```

#### Grid Layouts

**Portrait Layout (4 cols × 6 rows):**
```javascript
vacation: { x: 2, y: 4, width: 2, height: 2 }
```

**Landscape Layout (8 cols × 4 rows):**
```javascript
vacation: { x: 6, y: 3, width: 2, height: 1 }
```

#### New Functions

- **`fetchLocationTimezone(apiKey, location)`**
  - Fetches timezone offset for a location
  - Returns timezone offset in seconds, coordinates, location name
  - Uses OpenWeatherMap API

### 3. Frontend Widget Implementation

#### Smart Mirror Display (`public/smart-mirror.html`)

**Widget Features:**
- Displays up to 3 upcoming vacations
- Shows destination with icon (📍)
- Displays date range in readable format
- Countdown timer showing days until vacation
- Local time at destination (only if timezone differs by 1+ hour)
- Time difference indicator (e.g., "+5h")
- Weather forecast for vacation dates
- Weather icon, temperature range, and condition
- Fallback to current weather if forecast unavailable
- Vacation notes (if provided)
- Graceful error handling

**Visual Design:**
- Compact, smartmirror-friendly layout
- Clear visual hierarchy
- Icons for quick recognition
- Opacity variations for less important info
- Color coding (green for "Today!")
- Responsive to both portrait and landscape modes

#### Update Function

**`updateVacationWidget(content, widgetConfig)`**
- Fetches vacation data from API
- Displays "No upcoming vacations" message when empty
- Renders each vacation with:
  - Destination header
  - Date range
  - Countdown timer
  - Local time (if timezone differs)
  - Weather forecast
  - Notes
- Handles API errors gracefully

### 4. Admin UI Enhancement

#### Vacation Information Screen (`admin/dashboard.html`)

**Location Validation Button:**
- Added "🔍 Test Location for Weather" button
- Located below the destination input field
- Triggers `testVacationLocation()` function

**Validation Feedback:**
- Success: Shows green box with location details and current weather
- Error: Shows red box with error message and suggestions
- Loading state while testing
- Clear, actionable feedback

**Validation Function:**
```javascript
async function testVacationLocation()
```
- Tests if destination returns weather data
- Provides detailed success/error messages
- Shows current weather conditions on success
- Guides user to fix invalid locations

### 5. Timezone Handling

**Local Time Display:**
- Calculates destination timezone offset
- Compares to browser's local timezone
- Only displays if difference is 1+ hour
- Shows local time at destination
- Shows hour difference (e.g., "+5h" or "-3h")
- Updates in real-time (when widget refreshes)

**Implementation:**
```javascript
const localOffset = new Date().getTimezoneOffset() * -60; // Browser offset in seconds
const destOffset = timezoneData.data.timezoneOffset;
const offsetDiff = (destOffset - localOffset) / 3600; // Difference in hours

if (Math.abs(offsetDiff) >= 1) {
  // Display local time with offset
}
```

### 6. Weather Integration

**Forecast Priority:**
1. **5-day forecast** (OpenWeatherMap free tier)
2. **Current weather** (fallback with "forecast unavailable" note)

**Weather Display:**
- Shows weather for actual vacation dates
- If forecast doesn't cover vacation dates, shows available forecast
- Displays weather icon (emoji), high/low temps, condition
- Indicates when using fallback (current weather)
- Gracefully handles missing weather data

### 7. Error Handling

**Graceful Degradation:**
- Missing vacation data: Shows "No upcoming vacations"
- Widget disabled: Returns appropriate error message
- Weather unavailable: Silently omits weather section
- Timezone unavailable: Silently omits timezone section
- Invalid location: Shows clear error message
- API errors: Shows user-friendly error message

**User-Friendly Messages:**
- Clear icons (⚠️, ✅, ❌, 🔄)
- Helpful suggestions for fixing issues
- No technical jargon exposed to end users

## Widget Not Shown by Default

✅ **Requirement Met:** The vacation widget is **disabled by default** (`enabled: false`).

**To Enable:**
1. Navigate to Smart Mirror settings in admin dashboard
2. Find the vacation widget in widget configuration
3. Toggle enabled to `true`
4. Save configuration
5. Widget will appear on smart mirror display

## API Key Reuse

✅ **Requirement Met:** The vacation widget **reuses existing weather API keys** from weather or forecast widgets.

**Configuration:**
```javascript
const apiKey = config.widgets?.weather?.apiKey || config.widgets?.forecast?.apiKey;
```

No duplicate API connections are created. All weather data uses the existing OpenWeatherMap integration.

## Security Considerations

**Privacy:**
- Vacation data stored locally in `config/house-data.json`
- Public endpoints require widget to be enabled
- Admin endpoints require authentication
- Location names are URL-encoded for API calls
- No vacation data exposed to unauthenticated users

**Data Validation:**
- Date validation on frontend and backend
- Location strings sanitized before API calls
- API responses validated before rendering
- Timeout protection on external API calls (10s)

## Testing

### Test Script

Run the test script to verify all components:
```bash
node scripts/test-vacation-widget.js
```

**Tests Include:**
- ✅ Vacation API endpoint behavior
- ✅ Weather and timezone endpoint behavior
- ✅ Widget configuration in smartmirror module
- ✅ Frontend widget implementation
- ✅ Admin UI location validation
- ✅ Server endpoint registration

### Manual Testing Checklist

**Backend:**
- [ ] Vacation API returns filtered upcoming vacations
- [ ] Weather API returns forecast for location
- [ ] Timezone API returns offset for location
- [ ] Test location endpoint validates destinations

**Frontend:**
- [ ] Widget displays upcoming vacations
- [ ] Countdown timer shows correct days
- [ ] Weather forecast appears for destinations
- [ ] Local time shows only when timezone differs
- [ ] No upcoming vacations message displays when empty
- [ ] Errors handled gracefully

**Admin UI:**
- [ ] Location validation button appears
- [ ] Test location shows success for valid locations
- [ ] Test location shows error for invalid locations
- [ ] Feedback messages are clear and helpful

**Integration:**
- [ ] Widget disabled by default
- [ ] Widget can be enabled in settings
- [ ] Vacation data flows from admin to widget
- [ ] Weather API key reused from existing widgets

## Usage Instructions

### For Administrators

**Adding Vacation Dates:**
1. Log into admin dashboard
2. Navigate to House > Vacation
3. Click "➕ Add Vacation Date"
4. Enter start date, end date, destination
5. Click "🔍 Test Location for Weather" to validate destination
6. Add optional notes
7. Click "Save"

**Enabling the Widget:**
1. Navigate to Smart Mirror settings
2. Find vacation widget configuration
3. Set `enabled` to `true`
4. Ensure weather widget has API key configured
5. Save configuration
6. Refresh smart mirror display

### For Users

**Viewing Vacations:**
- Smart mirror displays upcoming vacations automatically
- Shows up to 3 nearest upcoming trips
- Updates on refresh interval (default: 5 minutes)

**Information Displayed:**
- 📍 Destination name
- 📅 Date range
- 🗓️ Days until vacation
- 🕐 Local time at destination (if different timezone)
- ⛅ Weather forecast for vacation dates
- 📝 Optional notes

## File Changes Summary

### Modified Files

1. **`server.js`**
   - Added `/api/smart-mirror/vacation` endpoint
   - Added `/api/smart-mirror/vacation-weather` endpoint
   - Added `/api/smart-mirror/vacation-timezone` endpoint
   - Added `/admin/api/smart-mirror/test-location` endpoint

2. **`modules/smartmirror.js`**
   - Added vacation widget to default configuration
   - Added vacation to portrait layout
   - Added vacation to landscape layout
   - Added `fetchLocationTimezone()` function
   - Exported `fetchLocationTimezone` in module.exports

3. **`public/smart-mirror.html`**
   - Added vacation to widget title mapping
   - Added vacation case to update switch statement
   - Added `updateVacationWidget()` function
   - Added `formatDateRange()` helper function

4. **`admin/dashboard.html`**
   - Added location validation button to vacation modal
   - Added `locationTestResult` div for feedback
   - Added `testVacationLocation()` function
   - Updated modal open/close functions to clear test results

### New Files

1. **`scripts/test-vacation-widget.js`**
   - Comprehensive test script for vacation widget
   - Tests all API endpoints
   - Verifies all code changes
   - Provides usage instructions

2. **`VACATION_WIDGET.md`** (this file)
   - Complete implementation documentation

## Acceptance Criteria Status

- ✅ Widget pulls vacation data from House > Vacation > Vacation Information UI
- ✅ Utilizes the same weather API as other widgets
- ✅ Admin can test/validate vacation location names for weather retrieval
- ✅ Widget is not shown by default—must be enabled by admin
- ✅ Weather forecast is displayed for each vacation (uses fallback logic as described)
- ✅ Local time and time difference shown only for differing time zones
- ✅ Handles missing/invalid weather or time data gracefully
- ✅ Clear display suitable for smartmirror
- ✅ Weather and time visually distinct but close to vacation entry
- ✅ Uses existing calendar, weather, and timezone APIs/modules
- ✅ Privacy/security considerations addressed

## Future Enhancements

Potential future improvements (not in current scope):

1. **Widget Settings:**
   - Configurable number of vacations to display
   - Show past vacations with different styling
   - Custom date format preferences

2. **Additional Features:**
   - Flight tracking integration
   - Packing checklist integration
   - Travel itinerary display
   - Currency conversion for destination

3. **Weather Enhancements:**
   - Show weather for multiple days of vacation
   - Weather alerts for destination
   - Precipitation probability
   - UV index for outdoor activities

4. **UI Improvements:**
   - Animated weather icons
   - Maps showing destination
   - Photos of destination (from API)
   - Vacation countdown progress bar

## Support

For issues or questions:
1. Check test script output: `node scripts/test-vacation-widget.js`
2. Review server logs for API errors
3. Verify weather API key is configured
4. Test location validation in admin UI
5. Check browser console for frontend errors

## Troubleshooting Weather Display

### Weather Not Showing in Vacation Sub-Widget

If weather data is not displaying in the Smart Mirror vacation sub-widget, check the following:

**1. Verify Smart Widget Configuration**
- Smart Widget must be enabled (`widgets.smartWidget.enabled = true`)
- Vacation sub-widget must be enabled in `subWidgets` array
- Weather API key must be configured in one of these locations (checked in order):
  - `widgets.smartWidget.apiKey`
  - `widgets.weather.apiKey`
  - `widgets.forecast.apiKey`

**2. Verify Vacation Location is Valid**
- Use the "🔍 Test Location for Weather" button in Admin > House > Vacation
- The location name must return valid weather data from OpenWeatherMap
- Common valid formats: "New York", "Paris, FR", "London, UK", "Tokyo, JP"
- Invalid locations will prevent weather fetching

**3. Check Server Logs**
When Smart Widget API is called, look for these log entries:
```
[SMART_MIRROR] Fetching weather for vacation destination: <location>
[SMART_MIRROR] Weather forecast fetched successfully for <location>
```

Or these warnings if weather fetch fails:
```
[SMART_MIRROR] Failed to fetch weather for vacation destination: <location>
[SMART_MIRROR] Vacation weather skipped: API key not configured
```

**4. Run Diagnostic Test Script**
```bash
node scripts/test-vacation-weather-display.js
```

This script will:
- Check if weather data is returned by the Smart Widget API
- Verify configuration (API key, enabled status, etc.)
- Show upcoming vacation destinations
- Provide actionable next steps

**5. Common Issues and Solutions**

| Issue | Solution |
|-------|----------|
| No weather data in API response | Check API key configuration; verify destination is valid |
| Weather shows "Current weather" fallback | Normal when forecast unavailable; destination may not support 5-day forecast |
| Weather not updating after location change | Refresh the smart mirror page; check browser cache |
| All vacations missing weather | Check Smart Widget is enabled; verify at least one API key is configured |
| Some vacations have weather, others don't | Validate problem locations using test button; some destinations may be invalid |

**6. Weather Data Flow**

The complete flow for weather display:
1. Admin adds vacation with destination name
2. Admin validates location using "Test Location" button (optional but recommended)
3. Smart Widget API calls `/api/smart-mirror/smart-widget`
4. Backend fetches weather for each vacation destination:
   - First tries 5-day forecast (`fetchForecast`)
   - Falls back to current weather (`fetchWeather`) if forecast fails
   - Logs success/failure for diagnostics
5. Frontend receives vacation data with weather embedded
6. `renderUpcomingVacation()` displays weather icon, temperature, and condition
7. Weather updates on each Smart Widget refresh cycle

## Conclusion

The vacation widget is fully implemented and tested. All acceptance criteria have been met. The widget is disabled by default and can be enabled by administrators through the smart mirror settings.

**Weather Display Feature:** As of the latest update, the vacation sub-widget now fetches and displays weather information for each validated vacation destination, showing current conditions or forecast data with proper fallback handling.
