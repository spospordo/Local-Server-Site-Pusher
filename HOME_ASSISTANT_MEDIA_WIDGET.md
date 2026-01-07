# Home Assistant Media Player Widget for Smart Mirror

This document explains how to set up and use the Home Assistant Media Player widget on your Smart Mirror dashboard.

## Overview

The Home Assistant Media Player widget displays real-time information about media currently playing through your Home Assistant setup. It supports various media platforms including:

- **Spotify**
- **Chromecast**
- **Sonos**
- **Plex**
- **YouTube Music**
- **Netflix**
- And any other Home Assistant-compatible media player

## Features

- 📀 **Artwork Display**: Shows album/media artwork when available
- 🎵 **Media Information**: Displays title, artist, and album
- ▶️ **Playback Status**: Shows current state (playing, paused, stopped, idle)
- 🎭 **Platform Badge**: Identifies the source platform (Spotify, Chromecast, etc.)
- 📱 **Responsive Layout**: Adapts to different grid sizes and orientations
- 🔄 **Real-time Updates**: Refreshes automatically based on your configured interval
- 🚨 **Error Handling**: Clear error messages for connection issues

## Prerequisites

1. **Home Assistant Server**: You need a running Home Assistant instance accessible from your network
2. **Media Player Entities**: At least one configured media player in Home Assistant
3. **Long-Lived Access Token**: Created in your Home Assistant account

## Setup Instructions

### Step 1: Create a Home Assistant Access Token

1. Log in to your Home Assistant web interface
2. Click on your **profile** (bottom left)
3. Scroll down to **Long-Lived Access Tokens**
4. Click **Create Token**
5. Give it a name (e.g., "Smart Mirror Widget")
6. Copy the token immediately (it won't be shown again!)

### Step 2: Find Your Media Player Entity IDs

1. In Home Assistant, go to **Developer Tools** → **States**
2. Search for `media_player.`
3. Note down the entity IDs you want to monitor (e.g., `media_player.spotify`, `media_player.living_room_chromecast`)

### Step 3: Configure the Widget in Admin Panel

1. Access your admin panel at `http://your-server:3000/admin`
2. Navigate to **Server** → **Smart Mirror**
3. Scroll down to the **🎵 Media Widget (Home Assistant)** section
4. Configure the following:

   - **Enable**: Set to "Enabled"
   - **Home Assistant Server URL**: Enter your Home Assistant URL (e.g., `http://192.168.1.100:8123` or `http://homeassistant.local:8123`)
   - **Long-Lived Access Token**: Paste the token you created in Step 1
   - **Media Player Entity IDs**: Enter one entity ID per line:
     ```
     media_player.spotify
     media_player.chromecast
     media_player.sonos_bedroom
     ```
   - **Grid Position**: Adjust the position and size as needed
     - Portrait mode uses a 4×6 grid
     - Landscape mode uses an 8×4 grid

5. Click **Save Smart Mirror Configuration**

### Step 4: View Your Smart Mirror

Navigate to `http://your-server:3000/smart-mirror` to see your dashboard with the media widget!

## Widget Behavior

### Multiple Media Players

If you configure multiple entity IDs, the widget will:
1. Display the first **active** (playing or paused) media player
2. If no players are active, it will show the first **available** player
3. If no players are found or accessible, it will show an idle state

### Refresh Interval

The widget updates based on your Smart Mirror's refresh interval (default: 60 seconds). To change this:
1. Modify the `refreshInterval` setting in the admin panel
2. Minimum recommended: 10 seconds
3. For real-time updates, set to 10000 (10 seconds)

### Status Indicators

- ▶️ **Playing**: Media is currently playing
- ⏸️ **Paused**: Media is paused
- 🎵 **Idle**: No active media or all players are off/idle

## Troubleshooting

### Widget Shows Error: "Media widget not enabled"

**Solution**: Enable the media widget in the admin panel and save the configuration.

### Widget Shows Error: "Home Assistant URL and token must be configured"

**Solution**: 
1. Verify you've entered both the Home Assistant URL and access token
2. Make sure there are no extra spaces
3. URL should include `http://` or `https://`

### Widget Shows Error: "At least one media player entity ID must be configured"

**Solution**: Add at least one valid media player entity ID in the admin panel.

### Widget Shows: "No active media players found"

This is normal when:
- No media is currently playing on any configured player
- All configured players are turned off or unavailable

**To verify your setup**:
1. Start playing media on one of your configured players
2. Wait for the next refresh cycle (default: 60 seconds)
3. The widget should update to show the playing media

### Home Assistant Logs Show "Failed Login Attempt"

If you see "failed login attempt" warnings in your Home Assistant logs:

**This is a known issue that has been resolved in version 2.2.7+**

The Smart Mirror widget now includes:
- Proper User-Agent headers identifying requests as coming from the Smart Mirror
- Request rate limiting (minimum 5 seconds between requests) to prevent spam
- Enhanced error handling to avoid unnecessary retry attempts
- Strict validation to prevent accidental redirects to login pages

**To verify the fix is working**:
1. Update to version 2.2.7 or later
2. Restart your Local-Server-Site-Pusher container
3. Monitor your Home Assistant logs for 5-10 minutes
4. You should no longer see "failed login attempt" logs from the Smart Mirror

**If you still see the logs after updating**:
1. Verify your access token is valid and hasn't expired
   - Go to Home Assistant → Profile → Long-Lived Access Tokens
   - Create a new token if needed and update the Smart Mirror configuration
2. Check that your Home Assistant URL is correct and doesn't redirect
3. Ensure you're using `http://` or `https://` (not `homeassistant.local` which can cause DNS issues)

**Technical details**:
The integration now sends all requests with:
- `User-Agent: Local-Server-Site-Pusher/2.2.6 (Smart Mirror Widget)` header
- `maxRedirects: 0` to prevent following redirects to login pages
- Proper status code validation (only 2xx responses accepted)
- Request caching to minimize calls to Home Assistant

### Connection Errors

If you see connection errors:

1. **Check Network Connectivity**: Ensure your server can reach Home Assistant
   ```bash
   curl http://your-homeassistant-url:8123/api/
   ```

2. **Verify Token**: Test your token with:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://your-homeassistant-url:8123/api/states/media_player.spotify
   ```

3. **Check Firewall**: Ensure port 8123 (or your HA port) is accessible

4. **Verify Entity IDs**: Make sure your entity IDs are correct (no typos)

### Artwork Not Showing

Some media players don't provide artwork URLs. This is normal for:
- Radio streams
- Certain podcast players
- Local media without embedded artwork

The widget will still display media information even without artwork.

## Grid Layout Recommendations

### Small Widget (1×1 or 2×1)
- Shows media title and status
- Artwork is compressed or hidden
- Best for minimal information display

### Medium Widget (2×2)
- Shows artwork, title, artist
- Status and platform badge visible
- Recommended for most use cases

### Large Widget (4×2 or larger)
- Full artwork display
- All metadata visible (title, artist, album)
- Platform badge and status clearly shown
- Best for media-focused dashboards

## Example Configurations

### Single Spotify Player
```
Home Assistant URL: http://192.168.1.100:8123
Entity IDs:
media_player.spotify
```

### Multiple Room Audio
```
Home Assistant URL: http://homeassistant.local:8123
Entity IDs:
media_player.living_room_sonos
media_player.bedroom_chromecast
media_player.kitchen_speaker
```

### Mixed Platforms
```
Home Assistant URL: http://192.168.1.50:8123
Entity IDs:
media_player.spotify
media_player.plex_tv
media_player.youtube_music
media_player.netflix
```

## Security Notes

- Your Home Assistant access token is stored **encrypted** in the server configuration
- The token is never sent to the browser/client
- All Home Assistant API calls are made server-side
- Keep your access token secure and don't share it
- Revoke tokens you no longer use in Home Assistant settings

## Advanced Configuration

### Custom Refresh Rate

For near real-time updates, you can set a faster refresh interval:

1. In admin panel, set `refreshInterval` to 15000 (15 seconds)
2. Note: Faster refresh rates increase API calls to Home Assistant
3. Recommended minimum: 10000 (10 seconds)

### Network Optimization

If your Home Assistant server is on the same network:
- Use local IP addresses instead of external URLs
- This reduces latency and improves reliability

### Multiple Smart Mirrors

Each Smart Mirror instance can have different media player configurations:
- Different entity IDs per mirror
- Different layouts and positions
- Independent refresh rates

## API Reference

### Endpoint: GET /api/smart-mirror/media

Returns current media player state.

**Response Format**:
```json
{
  "success": true,
  "entityId": "media_player.spotify",
  "entityName": "Spotify",
  "state": "playing",
  "title": "Song Title",
  "artist": "Artist Name",
  "album": "Album Name",
  "artworkUrl": "http://homeassistant:8123/api/media_player_proxy/media_player.spotify...",
  "platform": "Spotify",
  "duration": 240,
  "position": 120,
  "volume": 50
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Media widget not enabled"
}
```

## Support

If you encounter issues:

1. Check the server logs in the admin panel (**Diagnostics** section)
2. Test your Home Assistant connection using the examples above
3. Verify your entity IDs in Home Assistant Developer Tools
4. Review this documentation for configuration tips

## Related Documentation

- [Home Assistant API Documentation](https://developers.home-assistant.io/docs/api/rest/)
- [Smart Mirror Dashboard Guide](SMART_MIRROR_GRID_POSITIONING.md)
- [General Home Assistant Integration](HOME_ASSISTANT_API.md)
