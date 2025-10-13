# Magic Mirror - Media Player Widget Feature

## Overview

The Media Player Widget displays currently playing media from Home Assistant media players in the Magic Mirror dashboard. It provides real-time updates of what's playing on your connected devices with a beautiful, responsive interface.

## Features

### ✨ Two Widget Sizes

#### **Box (Compact) Size**
- Perfect for corners or smaller dashboard areas
- 80×80px album artwork
- Track title and artist name
- Play state indicator
- Clean, centered layout

#### **Bar (Extended) Size**
- Ideal for wider dashboard sections
- 120×120px album artwork
- Track title, artist name, and album name
- Player/device name display
- Play state indicator
- Side-by-side layout with more details

### 🔄 Real-Time Updates
- Automatic refresh every 5 seconds
- Live playback state (Playing/Paused)
- Immediate display of track changes
- No manual refresh needed

### 🎨 Visual Design
- Dark theme with glassmorphic effects
- Album artwork with rounded corners and shadows
- Text overflow handling for long titles
- Responsive typography
- Smooth transitions and hover effects

### 🏠 Home Assistant Integration
- Uses the existing `/api/media-streaming` endpoint
- Supports all Home Assistant media players
- Respects include/exclude device filters
- Shows the first active player automatically

## Configuration

### Prerequisites

1. **Home Assistant Integration Must Be Configured:**
   - Go to Admin Panel → Server → Home Assistant
   - Enable Home Assistant integration
   - Configure URL and access token
   - Enable Media Players integration

2. **At Least One Media Player:**
   - Must have Home Assistant media players configured
   - Players can be Spotify, Apple Music, Sonos, Chromecast, etc.

### Enabling the Widget

1. Navigate to Admin Panel → Server → Magic Mirror
2. Enable Magic Mirror if not already enabled
3. Check "Media Player" widget
4. Choose widget position (area) and size (box or bar)
5. Save configuration

### Configuration Examples

#### Compact Widget (Upper Right Corner)
```json
{
  "widgets": {
    "media": {
      "enabled": true,
      "area": "upper-right",
      "size": "box"
    }
  }
}
```

#### Extended Widget (Bottom Center)
```json
{
  "widgets": {
    "media": {
      "enabled": true,
      "area": "bottom-center",
      "size": "bar"
    }
  }
}
```

## Widget Appearance

### Box Size Display
```
┌─────────────────┐
│   🎵 Now Playing │
├─────────────────┤
│   ┌───────┐     │
│   │ Album │     │
│   │  Art  │     │
│   └───────┘     │
│                 │
│  Track Title    │
│  Artist Name    │
│  ▶ Playing      │
└─────────────────┘
```

### Bar Size Display
```
┌────────────────────────────────────────────┐
│   🎵 Now Playing                           │
├────────────────────────────────────────────┤
│  ┌────────┐  Track Title                   │
│  │ Album  │  Artist Name                   │
│  │  Art   │  Album Name                    │
│  └────────┘  ─────────────────────────     │
│              Player Name    ▶ Playing      │
└────────────────────────────────────────────┘
```

## States

The widget handles various playback states:

- **Playing**: Shows "▶ Playing" with blue accent
- **Paused**: Shows "⏸ Paused" with blue accent  
- **No Active Media**: Displays "No active media players" message
- **Loading**: Shows "Loading media data..." during initialization
- **Error**: Shows error message if Home Assistant is unavailable

## Technical Details

### Update Frequency
- **5 seconds** - Fast enough for real-time feel without overwhelming the API

### Data Source
- Endpoint: `GET /api/media-streaming`
- Returns formatted media player data from Home Assistant
- Includes album artwork URLs, track metadata, and player state

### CSS Classes
- `.media-player-info` - Main container
- `.media-bar` / `.media-box` - Size-specific layouts
- `.media-album-art` / `.media-album-art-small` - Album artwork containers
- `.media-title`, `.media-artist`, `.media-album` - Text elements
- `.media-state` - Playback state indicator

### Responsive Behavior
- Works with Magic Mirror's responsive layout system
- Adapts to portrait mode and mobile screens
- Maintains aspect ratios for album artwork
- Text truncates with ellipsis for long titles

## Troubleshooting

### Widget Shows "No active media players"
- Check that Home Assistant integration is enabled
- Verify at least one media player is configured in Home Assistant
- Ensure media players are not excluded in device filters
- Check that a device is actually playing media

### Album Art Not Displaying
- Verify Home Assistant can access album artwork
- Check that `entity_picture` is provided by the media player
- Some media players don't provide album art (this is normal)

### Widget Not Updating
- Check browser console for JavaScript errors
- Verify `/api/media-streaming` endpoint is accessible
- Check Home Assistant connection in admin panel
- Try refreshing the Magic Mirror page

### "Failed to fetch media data" Error
- Home Assistant integration may be disabled
- Home Assistant URL or token may be incorrect
- Network connectivity issues between server and Home Assistant
- Check admin panel for Home Assistant connection status

## Development Notes

### Files Modified
- `modules/magicmirror.js` - Backend widget configuration and HTML generation
- `public/magic-mirror.html` - Frontend widget implementation

### Key Functions
- `updateMedia()` - Fetches and displays media player data
- `formatMediaStreamingData()` - (in server.js) Formats HA data for display

### API Response Structure
The widget expects data in this format:
```javascript
{
  success: true,
  data: {
    hasActiveMedia: boolean,
    players: [{
      entity_id: string,
      state: 'playing' | 'paused' | 'idle',
      friendly_name: string,
      media_title: string,
      media_artist: string,
      media_album_name: string,
      entity_picture: string,
      isActive: boolean
    }]
  }
}
```

## Future Enhancements

Potential improvements for future versions:
- Multiple player support (show multiple active players)
- Playback controls (play/pause buttons)
- Progress bar showing track position
- Volume control
- Player selection dropdown
- Playlist information
- Source/input display
- Gesture controls for tablet displays

## Version History

### v2.2.4 (Current)
- Initial implementation of Media Player Widget
- Support for box and bar widget sizes
- Real-time updates every 5 seconds
- Album artwork display
- Full Home Assistant integration

---

For more information, see:
- [MAGIC_MIRROR_DOCS.md](MAGIC_MIRROR_DOCS.md) - Complete Magic Mirror documentation
- [MAGIC_MIRROR_LAYOUT.md](MAGIC_MIRROR_LAYOUT.md) - Widget layout system
- [HOME_ASSISTANT_API.md](HOME_ASSISTANT_API.md) - Home Assistant setup guide
