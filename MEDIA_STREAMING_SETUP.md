# Home Assistant Media Streaming Setup

This guide explains how to configure the Local Server Site Pusher to display media currently streaming on your Home Assistant devices (Apple TV, Apple devices, wireless speakers, etc.).

## Prerequisites

- A running Home Assistant instance
- Access to your Home Assistant web interface
- Local Server Site Pusher running and accessible

## Step 1: Create Home Assistant Long-Lived Access Token

1. Open your Home Assistant web interface
2. Click on your profile (bottom left corner)
3. Scroll down to "Long-Lived Access Tokens"
4. Click "Create Token"
5. Give it a name like "Local Server Site Pusher"
6. Copy the generated token (you won't be able to see it again!)

## Step 2: Configure Media Streaming in Admin Dashboard

1. Navigate to your Local Server Site Pusher admin interface: `http://your-server:3000/admin`
2. Login with your admin credentials (default: admin/admin123)
3. Scroll down to the "Home Assistant Media Streaming" section
4. Configure the following settings:
   - **Home Assistant Integration**: Set to "Enabled"
   - **Media Players**: Set to "Enabled"
   - **Home Assistant URL**: Enter your Home Assistant URL using its IP address (e.g., `http://192.168.1.100:8123`)
     - ⚠️ **Important**: Do not use `.local` hostnames (like `homeassistant.local`) as they may not resolve properly
     - Use your Home Assistant's network IP address instead
   - **Home Assistant Long-Lived Access Token**: Paste the token you created in Step 1
   - **Refresh Interval**: Set how often to check for media updates (default: 5000ms)

5. Click "Test Connection" to verify the connection works
6. Click "Save Media Streaming Settings"

## Step 3: Verify It's Working

### Admin Dashboard
- In the admin dashboard, scroll to the "Home Assistant Media Streaming" section
- Under "Current Media Status", you should see your media players and their current state
- If media is playing, it will show with a blue highlight and display the track/artist information

### Client Page
- Navigate to the client page: `http://your-server:3000/client`
- You should see a "🎵 Now Playing" section
- When media is active, it will display the currently playing content with device information
- When no media is playing, it shows available devices or hides the section

## Supported Media Players

The integration automatically detects and categorizes your Home Assistant media players:

- **Apple TV**: Devices with "apple_tv" or "appletv" in the entity ID
- **Apple Devices**: iPhones, iPads, and other Apple devices
- **Wireless Speakers**: Sonos, Echo, and other smart speakers
- **Spotify**: Spotify Connect devices
- **Chromecast**: Google Cast devices
- **Generic Media Players**: Any other media_player entities

## Advanced Configuration

### Device Filtering

You can include or exclude specific devices:

1. In the admin dashboard, go to the Advanced Configuration Editor
2. Modify the `homeAssistant.mediaPlayers` section:
   ```json
   "mediaPlayers": {
     "enabled": true,
     "refreshInterval": 5000,
     "includeDevices": ["media_player.living_room_apple_tv"],
     "excludeDevices": ["media_player.bedroom_speaker"]
   }
   ```

- **includeDevices**: Only show these specific entity IDs (leave empty to show all)
- **excludeDevices**: Hide these specific entity IDs

### Refresh Rate

Adjust how often the system checks for media updates:
- **5000ms (5 seconds)**: Good balance of responsiveness and performance
- **10000ms (10 seconds)**: Less frequent updates, better for slower networks
- **2000ms (2 seconds)**: More responsive, higher network usage

## Troubleshooting

### "Connection failed: getaddrinfo ENOTFOUND homeassistant.local" or "Cannot resolve .local domains"
This error occurs when using `.local` hostnames (like `homeassistant.local`) which rely on mDNS (Multicast DNS) resolution:

**Solution**: Use your Home Assistant's IP address instead:
1. Find your Home Assistant IP address:
   - Check your router's admin panel for connected devices
   - In Home Assistant, go to Settings → System → Network
   - Use a network scanner app on your phone
2. Replace `http://homeassistant.local:8123` with `http://192.168.1.XXX:8123` (using your actual IP)
3. Example: `http://192.168.1.100:8123`

**Why this happens**: `.local` domains use mDNS which may not work properly in containerized environments or server applications.

### "Cannot connect to Home Assistant"
- Verify your Home Assistant URL is correct and accessible from the server
- Check that your Home Assistant instance is running
- Ensure the access token is valid and has the correct permissions
- If using `localhost` or `127.0.0.1`, try using your network IP address instead

### "Connection timeout" or "Connection refused"
- Verify the IP address and port number are correct (default is 8123)
- Ensure Home Assistant is accessible from the server running Local Server Site Pusher
- Check firewall settings on both devices
- Test connectivity: `ping [your-home-assistant-ip]` from the server

### "Authentication failed" or "Access forbidden"
- Verify your Home Assistant access token is correct and has not expired
- Ensure the token has the required permissions to read device states
- Try creating a new long-lived access token

### "Media player integration is disabled"
- Check that both "Home Assistant Integration" and "Media Players" are set to "Enabled"
- Save the configuration after making changes

### No media players found
- Verify you have media_player entities in your Home Assistant
- Check that the devices are not excluded in the configuration
- Use the "Test Connection" button to see detailed error messages

### Media information not updating
- Check the refresh interval setting
- Verify the media player entities are reporting their state correctly in Home Assistant
- Look at the browser console for any JavaScript errors

## API Endpoints

For advanced integrations, the following API endpoints are available:

- `GET /api/media-streaming`: Returns current media streaming status
- `GET /admin/api/media-streaming/config`: Get current configuration (admin only)
- `POST /admin/api/media-streaming/config`: Update configuration (admin only)
- `GET /admin/api/media-streaming/test`: Test Home Assistant connection (admin only)

## Example Response

```json
{
  "success": true,
  "timestamp": "2025-01-24T01:15:30.000Z",
  "data": {
    "hasActiveMedia": true,
    "totalDevices": 3,
    "activeDevices": 1,
    "players": [
      {
        "entity_id": "media_player.living_room_apple_tv",
        "state": "playing",
        "friendly_name": "Living Room Apple TV",
        "media_title": "Bohemian Rhapsody",
        "media_artist": "Queen",
        "deviceType": "Apple TV",
        "isActive": true
      }
    ]
  }
}
```

Enjoy your integrated media streaming experience!