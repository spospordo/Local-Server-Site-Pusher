# Magic Mirror Dashboard - Complete Documentation

## Overview

The Magic Mirror Dashboard is a fully functional information display system that provides real-time data from multiple sources. It's perfect for use with tablets, dedicated displays, or digital signage setups.

**Version:** 2.2.4  
**Status:** ✅ Fully Implemented

## Features

### Core Functionality

- **Real-time Clock & Date Widget** - Always displays current time and date
- **Weather Widget** - Live weather data from OpenWeather API
- **Calendar Widget** - Upcoming events from iCal/ICS feeds
- **News Widget** - Latest news from RSS feeds
- **Media Player Widget** - Now Playing information from Home Assistant media players

### Technical Features

- **Auto-refresh**: Widgets update automatically
  - Weather: Every 10 minutes
  - Calendar: Every hour  
  - News: Every 15 minutes
  - Media: Every 5 seconds (real-time updates)
- **Secure Storage**: AES-256-GCM encryption for sensitive data
- **Graceful Fallbacks**: Works with or without API keys
- **Error Handling**: User-friendly error messages
- **Responsive Design**: Adapts to different screen sizes

## Quick Start Guide

### Step 1: Access Admin Panel

1. Navigate to `http://your-server:3000/admin`
2. Login with your admin credentials
3. Go to **Server > Magic Mirror** tab

### Step 2: Enable Magic Mirror

1. Set "Magic Mirror Dashboard" to **Enabled**
2. Click "Save Configuration"

### Step 3: Configure Widgets

Enable and configure the widgets you want:

#### Clock Widget
- **Status**: Enabled by default when any widget is active
- **No configuration needed** - automatically displays current time and date

#### Weather Widget
1. Check "Weather" to enable
2. Enter your **Location** (e.g., "London, UK" or "New York, US")
3. (Optional) Add **OpenWeather API Key** for live data:
   - Get a free key from [openweathermap.org/api](https://openweathermap.org/api)
   - Without key: Shows location name only
   - With key: Shows temperature, conditions, humidity, wind speed

#### Calendar Widget
1. Check "Calendar" to enable
2. Enter **iCal/ICS URL**:
   - **Google Calendar**: Calendar settings → "Integrate calendar" → Secret address in iCal format
   - **Office 365**: Calendar → Settings → Shared calendars → Publish → Copy ICS link
   - **Apple iCloud**: Calendar settings → Public calendar → Copy webcal or https link
   - **Webcal Protocol**: Both `webcal://` and `webcals://` URLs are automatically supported and converted to `https://`

#### News Widget
1. Check "News Feed" to enable
2. Enter **RSS Feed URL**:
   - Examples: 
     - BBC News: `http://feeds.bbci.co.uk/news/rss.xml`
     - TechCrunch: `https://techcrunch.com/feed/`
     - Any valid RSS/Atom feed

#### Media Player Widget
1. **Prerequisites**: Home Assistant integration must be configured
   - See [HOME_ASSISTANT_API.md](HOME_ASSISTANT_API.md) for setup instructions
   - Go to **Server > Home Assistant** in admin panel
   - Enable Home Assistant integration and configure URL and access token
   - Enable Media Players integration
2. Check "Media Player" to enable
3. **Widget Sizes**:
   - **Box (Small)**: Compact view with album art, track title, artist, and play state
   - **Bar (Large/Wide)**: Extended view with additional details like album name and player name
4. **Features**:
   - Displays currently playing media from Home Assistant media players
   - Shows album artwork when available
   - Real-time playback state (Playing/Paused)
   - Track information (title, artist, album)
   - Auto-updates every 5 seconds for real-time status
   - Supports filtering by specific media players (configured in Home Assistant settings)

### Step 4: Open Dashboard

1. Click "Open Dashboard" button in admin panel
2. Or navigate directly to: `http://your-server:3000/magic-mirror`
3. Display this URL on your tablet, monitor, or digital signage device

**📖 Need help accessing from containers or remote devices? See [MAGIC_MIRROR_ACCESS.md](MAGIC_MIRROR_ACCESS.md) for detailed network configuration and troubleshooting.**

## API Endpoints

The Magic Mirror uses the following backend endpoints:

### Configuration Endpoints (Admin Only)

```
GET /admin/api/magicmirror/config
```
Returns sanitized configuration (API keys are masked)

```
POST /admin/api/magicmirror/config
```
Updates Magic Mirror configuration

### Data Endpoints (Public - when enabled)

```
GET /api/magicmirror/data
```
Returns complete configuration for the display page

```
GET /api/magicmirror/weather
```
Fetches current weather data from OpenWeather API

Response (with API key):
```json
{
  "temperature": 22,
  "description": "clear sky",
  "icon": "01d",
  "location": "London",
  "humidity": 65,
  "windSpeed": 3.5
}
```

Response (without API key):
```json
{
  "temperature": "--",
  "description": "API key required",
  "location": "London, UK",
  "placeholder": true
}
```

```
GET /api/magicmirror/calendar
```
Fetches and parses iCal/ICS calendar events. Supports standard `https://` URLs as well as `webcal://` and `webcals://` protocols (automatically converted to `https://`).

Response:
```json
{
  "events": [
    {
      "summary": "Team Meeting",
      "start": "2025-10-14T10:00:00.000Z",
      "end": "2025-10-14T11:00:00.000Z",
      "description": "Weekly sync"
    }
  ]
}
```

```
GET /api/magicmirror/weather/test
```
Tests the OpenWeather API connection and configuration. Provides detailed error messages for troubleshooting.

Response (success):
```json
{
  "success": true,
  "message": "Weather API connection successful",
  "details": {
    "location": "London",
    "country": "GB",
    "temperature": 22,
    "description": "clear sky",
    "coordinates": {
      "lat": 51.51,
      "lon": -0.13
    }
  }
}
```

Response (error - missing API key):
```json
{
  "success": false,
  "error": "API key not configured",
  "details": "Please configure your OpenWeather API key in the weather settings. Get one at https://openweathermap.org/api"
}
```

Response (error - invalid location):
```json
{
  "success": false,
  "error": "Location not found",
  "details": "The location \"Unknowncity\" could not be found. Please check the spelling or try a different city name. You can also try using \"City, Country Code\" format (e.g., \"London, UK\")"
}
```

```
GET /api/magicmirror/news
```
Fetches and parses RSS feed items

Response:
```json
{
  "items": [
    {
      "title": "Breaking News Title",
      "link": "https://example.com/news/article",
      "pubDate": "Mon, 13 Oct 2025 10:00:00 GMT",
      "description": "Article summary..."
    }
  ]
}
```

```
GET /api/media-streaming
```
Fetches currently playing media from Home Assistant media players

Response (with active media):
```json
{
  "success": true,
  "timestamp": "2025-10-13T19:00:00.000Z",
  "data": {
    "hasActiveMedia": true,
    "totalDevices": 2,
    "activeDevices": 1,
    "players": [
      {
        "entity_id": "media_player.living_room",
        "state": "playing",
        "friendly_name": "Living Room Speaker",
        "media_title": "Bohemian Rhapsody",
        "media_artist": "Queen",
        "media_album_name": "A Night at the Opera",
        "entity_picture": "/api/media_player_proxy/media_player.living_room?token=...",
        "isActive": true,
        "displayText": "Bohemian Rhapsody - Queen",
        "deviceType": "Wireless Speaker"
      }
    ]
  }
}
```

Response (no active media):
```json
{
  "success": true,
  "timestamp": "2025-10-13T19:00:00.000Z",
  "data": {
    "hasActiveMedia": false,
    "totalDevices": 0,
    "activeDevices": 0,
    "players": []
  }
}
```

## Configuration Storage

### Files

- **Config File**: `config/magicmirror-config.json.enc`
  - Encrypted with AES-256-GCM
  - Contains all widget settings and API keys
  
- **Encryption Key**: `config/.magicmirror-key`
  - Auto-generated on first use
  - 256-bit (32 bytes) random key
  - Stored in hex format

### Persistence

All configuration persists across container restarts when using volume mounts:

```yaml
volumes:
  - ./config:/app/config
```

The `.dockerignore` file excludes config files from the image:
```
config/magicmirror-config.json.enc
config/.magicmirror-key
```

## Testing

### Automated Test Suite

Run the comprehensive test suite:

```bash
node scripts/test-magic-mirror.js
```

**Tests included:**
1. Module and file existence
2. Server connectivity
3. API endpoint availability
4. Configuration directory setup
5. Encryption key generation
6. HTML structure validation
7. JavaScript function presence
8. API call verification

**Expected output:**
```
🧪 Magic Mirror Test Suite

✅ Magic mirror module exists
✅ Magic mirror HTML page exists
✅ Server is running
... (14 tests total)

📊 Test Summary
✅ Passed: 14
Total: 14
```

### Manual Testing

1. **Test Weather API Connection** (recommended first step):
   ```bash
   curl http://localhost:3000/api/magicmirror/weather/test
   ```
   This will verify your API key, location, and network connectivity with detailed error messages.

2. **Test Weather Widget**:
   ```bash
   curl http://localhost:3000/api/magicmirror/weather
   ```

3. **Test Calendar Widget**:
   ```bash
   curl http://localhost:3000/api/magicmirror/calendar
   ```

4. **Test News Widget**:
   ```bash
   curl http://localhost:3000/api/magicmirror/news
   ```

5. **View Dashboard**:
   - Open: `http://localhost:3000/magic-mirror`
   - Check browser console for errors
   - Verify widgets display correctly

## Troubleshooting

### Weather Widget Issues

**Problem**: Weather not displaying or showing errors

**First Step - Use the Test Endpoint**:
```bash
curl http://localhost:3000/api/magicmirror/weather/test
```

This dedicated test endpoint will check:
- ✅ Weather widget is enabled
- ✅ Location is configured
- ✅ API key is configured
- ✅ API connection is working
- ✅ Location can be found

The test provides detailed error messages for each issue, making troubleshooting much easier.

**Common Issues and Solutions**:

1. **Invalid API Key**:
   - Error: `"Invalid API key"`
   - Solution: 
     - Verify your key at openweathermap.org
     - Ensure key is active (may take 10-15 minutes after creation)
     - Copy the key carefully (no extra spaces)

2. **Location Not Found**:
   - Error: `"Location not found"`
   - Solution:
     - Use format: "City, CountryCode" (e.g., "London, UK")
     - Try just city name if country code doesn't work
     - Some cities require state: "Austin, TX, US"
     - Check spelling of city name

3. **Network Connection Error**:
   - Error: `"Network connection error"`
   - Solution:
     - Check internet connectivity
     - Verify firewall allows outbound HTTPS to api.openweathermap.org
     - Check if running in isolated Docker network

4. **Widget Not Enabled**:
   - Error: `"Weather widget not enabled"`
   - Solution: Enable the weather widget in Magic Mirror configuration

**Free API Limits**: OpenWeather free tier allows 1,000 calls/day (more than enough for 10-min updates)

**API Key Persistence**: Your API key is stored encrypted and persists across container restarts when using volume mounts.

### Calendar Widget Issues

**Problem**: Events not showing

**Solutions**:
1. Verify iCal URL is publicly accessible:
   ```bash
   curl https://your-calendar-url
   ```
   - Should return iCal formatted text starting with "BEGIN:VCALENDAR"

2. Check event timing:
   - Only shows events within next 30 days
   - Past events are ignored
   - Verify events exist in this timeframe

3. **Webcal Protocol Support**:
   - ✅ **Both `webcal://` and `webcals://` URLs are now supported**
   - The system automatically converts them to `https://`
   - No need to manually replace `webcal://` anymore!
   - Example: `webcal://example.com/cal.ics` → works automatically

4. Common URL issues:
   - Google Calendar: Must use "Secret Address" not sharing link
   - Office 365: Use ICS URL not web link
   - iCloud: Can use `webcal://` or `https://` link (both work)

### News Widget Issues

**Problem**: News feed not loading

**Solutions**:
1. Verify RSS feed is valid:
   ```bash
   curl https://your-rss-feed-url
   ```
   - Should return XML with `<rss>` or `<feed>` tags
   - Must contain `<item>` or `<entry>` elements

2. Common feed formats:
   - RSS 2.0 (most common)
   - Atom feeds (also supported)
   - RDF feeds (may work)

3. CORS restrictions:
   - Some feeds block cross-origin requests
   - Server fetches the feed to avoid this
   - Check server logs for errors

### General Issues

**Problem**: "Magic Mirror is not enabled" error

**Solution**: 
1. Go to Admin → Server → Magic Mirror
2. Enable Magic Mirror Dashboard
3. Save configuration
4. Refresh the magic mirror page

**Problem**: Configuration not saving

**Solution**:
1. Check config directory permissions:
   ```bash
   ls -la config/
   ```
2. Ensure volume mount is correct in docker-compose
3. Check server logs for encryption errors

**Problem**: Widgets not updating

**Solution**:
1. Check browser console for JavaScript errors
2. Verify API endpoints are responding:
   ```bash
   curl http://localhost:3000/api/magicmirror/data
   ```
3. Hard refresh browser (Ctrl+F5)
4. Check network tab for failed requests

## Dependencies

The Magic Mirror feature requires:

- **node-ical** (^0.16.1): iCal/ICS calendar parsing
- **axios** (^1.12.2): HTTP requests for external APIs
- **cheerio** (^1.0.0-rc.12): RSS/XML parsing
- **crypto** (built-in): AES-256-GCM encryption

All dependencies are automatically installed via npm.

## Security Considerations

### Data Protection

1. **API Keys**: Stored encrypted with AES-256-GCM
2. **Config Files**: Excluded from Docker image via .dockerignore
3. **Frontend Security**: API keys never sent to client
4. **HTTPS**: Use HTTPS in production for API calls

### Access Control

- **Admin Endpoints**: Require authentication
- **Display Page**: Public (when enabled)
- **API Endpoints**: Public but gated by enabled state

### Recommendations

1. Use HTTPS for production deployments
2. Secure your admin panel with strong password
3. Limit network access to admin panel
4. Keep API keys confidential
5. Regularly rotate API keys

## Example Configurations

### Home Dashboard Setup

```javascript
{
  "enabled": true,
  "widgets": {
    "clock": true,
    "weather": true,
    "calendar": true,
    "news": true
  },
  "weather": {
    "location": "San Francisco, CA",
    "apiKey": "your-openweather-api-key"
  },
  "calendar": {
    "url": "https://calendar.google.com/calendar/ical/...../basic.ics"
  },
  "news": {
    "source": "http://feeds.bbci.co.uk/news/rss.xml"
  }
}
```

### Office Information Display

```javascript
{
  "enabled": true,
  "widgets": {
    "clock": true,
    "weather": true,
    "calendar": true,
    "news": false
  },
  "weather": {
    "location": "New York, US",
    "apiKey": "your-api-key"
  },
  "calendar": {
    "url": "https://outlook.office365.com/owa/calendar/.../calendar.ics"
  }
}
```

### Simple Clock Display

```javascript
{
  "enabled": true,
  "widgets": {
    "clock": true,
    "weather": false,
    "calendar": false,
    "news": false
  }
}
```

## Future Enhancement Ideas

- Additional widget types (traffic, transit, stocks)
- Custom widget API for developers
- Theme customization options
- Multi-language support
- Voice control integration
- Mobile app for configuration
- Widget positioning and sizing
- Multiple dashboard profiles

## Support

For issues or questions:

1. Check this documentation
2. Review troubleshooting section
3. Check server logs for errors
4. Review browser console for client errors
5. Open an issue on GitHub

## Changelog

### Version 2.2.4 (2025-10-13)
- ✅ Fully implemented weather API integration
- ✅ Fully implemented calendar parsing
- ✅ Fully implemented RSS feed parsing
- ✅ Added comprehensive test suite
- ✅ Updated documentation
- ✅ Added error handling and fallbacks

### Version 2.2.3 (2025-10-13)
- Initial magic mirror framework
- Basic widget structure
- Admin configuration interface
- Encrypted storage implementation
