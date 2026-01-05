# Auto Theme Switching for Smart Mirror Dashboards

## Overview

The Smart Mirror dashboard now supports automatic theme switching based on daily sunrise and sunset times. This feature allows the dashboard to display a light theme during daytime hours and a dark theme at night, providing optimal visibility and aesthetics throughout the day.

## Features

- **Automatic Light/Dark Theme Switching**: Based on actual sunrise and sunset times for your location
- **30-Minute Buffers**: Light theme is active from 30 minutes before sunrise to 30 minutes after sunset
- **Per-Orientation Configuration**: Independent settings for portrait and landscape modes
- **Daily Updates**: Sunrise/sunset times are calculated fresh each day, accounting for:
  - Seasonal variations
  - Daylight Saving Time transitions
  - Leap years
  - Geographic location changes
- **Real-Time Status Display**: Shows current theme, next switch time, and today's sunrise/sunset times
- **Manual Override**: Can be disabled to use a fixed theme instead

## Configuration

### Admin Interface

Navigate to **Admin Dashboard → Server → Smart Mirror** to configure auto theme switching.

![Admin UI Screenshot](https://github.com/user-attachments/assets/7837bdd6-ac36-476f-98a7-519c7b3978f1)

### Per-Orientation Settings

Configure auto theme switching separately for portrait and landscape orientations:

#### Portrait Mode Auto Theme
- **Enable/Disable Toggle**: Turn auto theme switching on or off
- **Latitude**: Your location's latitude in decimal degrees (e.g., 40.7128 for NYC)
- **Longitude**: Your location's longitude in decimal degrees (e.g., -74.0060 for NYC)
- **Timezone**: Select your IANA timezone identifier (e.g., America/New_York)

#### Landscape Mode Auto Theme
- Same configuration options as portrait mode
- Allows different locations or settings for different device orientations

### Finding Your Coordinates

To find your latitude and longitude:
1. Go to [Google Maps](https://www.google.com/maps)
2. Right-click on your location
3. Select the coordinates to copy them
4. Format: First number is latitude, second is longitude

Examples:
- **New York City**: 40.7128, -74.0060
- **Los Angeles**: 34.0522, -118.2437
- **London**: 51.5074, -0.1278
- **Sydney**: -33.8688, 151.2093

### Timezone Selection

Select from common timezone options:
- **US Timezones**: America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Phoenix, America/Anchorage, Pacific/Honolulu
- **European Timezones**: Europe/London, Europe/Paris, Europe/Berlin
- **Asian Timezones**: Asia/Tokyo, Asia/Shanghai
- **Other**: Australia/Sydney, UTC

## How It Works

### Light Period Calculation

1. **Sunrise/Sunset Times**: Calculated using the SunCalc library based on your coordinates and date
2. **30-Minute Buffers**: 
   - Light theme starts: 30 minutes **before** sunrise
   - Light theme ends: 30 minutes **after** sunset
3. **Dark Theme**: All other times use the dark theme

### Example Timeline (New York, January 15)

```
Sunrise: 7:19 AM
Sunset: 4:53 PM

Light Theme Period: 6:49 AM - 5:23 PM
Dark Theme Period: 5:23 PM - 6:49 AM (next day)
```

### Theme Updates

- **On Page Load**: Dashboard immediately applies the correct theme for current time
- **Periodic Checks**: Dashboard checks every 60 seconds for theme changes
- **Automatic Switching**: When switch time is reached, theme updates seamlessly without reload

## Status Display

When auto theme switching is enabled and configured, the admin UI displays:

- ✅ **Current Theme**: Shows whether light or dark theme is active
- 🌅 **Today's Light Period**: Start and end times with sunrise/sunset
- ⏰ **Next Switch**: Countdown and exact time of next theme change

Example status message:
```
🌅 Auto Theme Active
Current Theme: ☀️ Light
Today's Light Period: 6:49 AM - 5:23 PM
(Sunrise: 7:19 AM, Sunset: 4:53 PM)
Next Switch: 🌙 Dark in 127 minutes (at 5:23 PM)
```

## Manual Theme Selection

If auto theme switching is disabled:
1. The dashboard uses the manual theme selected in the "Theme" dropdown
2. Theme remains constant regardless of time of day
3. No automatic updates occur

## API Endpoints

### Public Config API

**Endpoint**: `GET /api/smart-mirror/config?orientation=portrait` or `landscape`

**Response** includes:
```json
{
  "success": true,
  "config": {
    "theme": "dark",
    "calculatedTheme": "light",
    "themeInfo": {
      "theme": "light",
      "autoMode": true,
      "nextSwitch": "2026-01-05T22:13:37.000Z",
      "sunTimes": {
        "sunrise": "2026-01-05T12:21:25.000Z",
        "sunset": "2026-01-05T21:43:37.000Z",
        "lightStart": "2026-01-05T11:51:25.000Z",
        "lightEnd": "2026-01-05T22:13:37.000Z"
      }
    },
    "autoThemeSwitch": {
      "portrait": {
        "enabled": true,
        "latitude": 40.7128,
        "longitude": -74.0060,
        "timezone": "America/New_York"
      }
    }
  }
}
```

## Technical Details

### Backend Implementation

- **Library**: Uses `suncalc` npm package for precise sunrise/sunset calculations
- **Storage**: Configuration stored in encrypted `smartmirror-config.json.enc`
- **Migration**: Automatically adds default auto theme settings to existing configurations

### Frontend Implementation

- **Theme Application**: Applied via CSS class `theme-light` on `<body>` element
- **Periodic Checking**: JavaScript interval checks theme every 60 seconds
- **No Flicker**: Theme is applied before initial render to prevent flash

### Files Modified

- `modules/smartmirror.js`: Added theme calculation functions
- `public/smart-mirror.html`: Added auto theme detection and updating
- `admin/dashboard.html`: Added UI controls and status display
- `package.json`: Added `suncalc` dependency

## Troubleshooting

### Auto Theme Not Working

1. **Check Location**: Ensure latitude and longitude are entered correctly
2. **Verify Timezone**: Select the correct timezone for your location
3. **Enable Feature**: Make sure auto theme switching is set to "Enabled"
4. **Check Logs**: Look at browser console for theme calculation messages

### Theme Not Switching at Expected Time

1. **30-Minute Buffer**: Remember light theme starts 30 min before sunrise
2. **Browser Time**: Ensure device's system time is correct
3. **Refresh Page**: Try refreshing the dashboard to recalculate
4. **Check Status**: View admin UI status to see calculated switch times

### Different Themes on Different Devices

This is expected if:
- Devices use different orientations (portrait vs landscape)
- Auto theme is configured differently per orientation
- Or one orientation has auto theme disabled

## Best Practices

1. **Test Configuration**: After setting up, check the status display to verify times
2. **Location Accuracy**: Use precise coordinates for accurate sunrise/sunset times
3. **Timezone Matching**: Ensure timezone matches your actual location
4. **Monitor Performance**: Theme checking is lightweight but runs every minute
5. **Consider Seasons**: Remember sunrise/sunset times change throughout the year

## Examples

### Example 1: Single Location, Both Orientations

**Use Case**: Same device rotates between portrait and landscape

**Configuration**:
- Portrait: Enabled, New York coordinates, America/New_York
- Landscape: Enabled, New York coordinates, America/New_York

### Example 2: Different Locations per Orientation

**Use Case**: Different physical displays in different rooms/locations

**Configuration**:
- Portrait: Enabled, Seattle coordinates, America/Los_Angeles
- Landscape: Enabled, Boston coordinates, America/New_York

### Example 3: Mixed Auto/Manual

**Use Case**: Auto theme for portrait, fixed dark for landscape

**Configuration**:
- Portrait: Enabled, coordinates configured
- Landscape: Disabled, manual theme = dark

## Version History

- **v2.2.4+**: Auto theme switching feature added
- Initial implementation with per-orientation support

## See Also

- [Smart Mirror Documentation](SMART_MIRROR_FIX_SUMMARY.md)
- [Grid Layout Editor](GRID_EDITOR_IMPLEMENTATION.md)
- [Widget Configuration Guide](DUAL_ORIENTATION_GUIDE.md)
