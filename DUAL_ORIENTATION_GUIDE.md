# Dual Orientation Layouts for Smart Mirror

## Overview

The Smart Mirror dashboard now supports separate layouts for portrait and landscape orientations. This allows you to optimize widget placement for different screen orientations without stretching or crowding widgets.

## Features

### Automatic Orientation Detection
- The dashboard automatically detects the screen orientation using `window.matchMedia` API
- Seamlessly switches between portrait and landscape layouts when device orientation changes
- Gracefully falls back to dimension-based detection on browsers without orientation API support

### URL-Based Orientation Locking
For devices or displays where you want to force a specific orientation:

- **Portrait Mode**: Access via `/smart-mirror` (default)
- **Landscape Mode**: Access via `/smart-mirror-l`

When using URL-based orientation, the layout is locked to that orientation and won't change with device rotation.

## Admin Configuration

### Grid Editor with Dual Orientation Support

The admin dashboard includes an interactive grid editor with orientation tabs:

1. **Portrait Tab** (📱): Edit the portrait layout
2. **Landscape Tab** (🖥️): Edit the landscape layout

### Editing Layouts

1. Navigate to Admin → Server Settings → Smart Mirror
2. Scroll to the "Interactive Grid Layout Editor"
3. Click the orientation tab you want to edit (Portrait or Landscape)
4. Drag and drop widgets to reposition them
5. Use corner handles to resize widgets
6. Click "Apply Changes" to save your layout
7. Switch to the other orientation tab and repeat
8. Click "Save Smart Mirror Configuration" to persist both layouts

### Preview Options

Two preview buttons are available:
- **📱 Preview Portrait**: Opens `/smart-mirror` in a new tab
- **🖥️ Preview Landscape**: Opens `/smart-mirror-l` in a new tab

## Configuration Format

The configuration now stores layouts separately from widget properties:

```javascript
{
  "enabled": true,
  "theme": "dark",
  "widgets": {
    "clock": {
      "enabled": true,
      "size": "medium",
      // ... other widget properties
    }
    // ... other widgets
  },
  "layouts": {
    "portrait": {
      "clock": { "x": 0, "y": 0, "width": 2, "height": 1 },
      "calendar": { "x": 2, "y": 0, "width": 2, "height": 2 },
      // ... other widgets
    },
    "landscape": {
      "clock": { "x": 0, "y": 0, "width": 1, "height": 1 },
      "calendar": { "x": 1, "y": 0, "width": 2, "height": 2 },
      // ... other widgets
    }
  },
  "gridSize": {
    "columns": 4,
    "rows": 3
  }
}
```

## API Endpoints

### Get Configuration with Orientation

```
GET /api/smart-mirror/config?orientation=portrait
GET /api/smart-mirror/config?orientation=landscape
GET /api/smart-mirror/config  // Returns both layouts
```

Response includes only the requested orientation's layout when `orientation` parameter is specified.

### Save Configuration

```
POST /admin/api/smart-mirror/config
```

Saves both portrait and landscape layouts.

## Backward Compatibility

The system automatically migrates old configurations that use `gridPosition` within each widget:

- Old format with `gridPosition` in widgets is automatically converted
- The old `gridPosition` values are used as the default for both orientations
- No data loss occurs during migration
- Old configurations continue to work seamlessly

## Use Cases

### Tablet Rotation
Perfect for tablets that can be used in both portrait and landscape modes. Widgets automatically rearrange when you rotate the device.

### Multiple Displays
Configure different layouts for:
- Vertical wall-mounted displays (portrait)
- Horizontal desk displays (landscape)

### Smart Mirror Installations
Optimize layouts for:
- Full-length mirrors (portrait)
- Wide bathroom mirrors (landscape)

## Default Layouts

**Portrait Layout (4×3 grid):**
- Clock: Top-left, 2×1
- Calendar: Top-right, 2×2
- Weather: Middle-left, 2×1
- News: Middle-right, 2×1
- Forecast: Bottom, full width 4×1

**Landscape Layout (4×3 grid):**
- Clock: Top-left corner, 1×1
- Calendar: Top-center, 2×2
- Weather: Top-right corner, 1×1
- News: Middle-left, 1×1
- Forecast: Bottom, full width 4×1

## Technical Details

### Orientation Detection Logic

1. **URL Check**: If pathname is `/smart-mirror-l`, force landscape mode
2. **matchMedia API**: Use `window.matchMedia('(orientation: portrait)')` for reliable detection
3. **Dimension Fallback**: Compare `window.innerWidth` vs `window.innerHeight`
4. **Default**: Portrait mode if detection fails

### Orientation Change Handling

The dashboard listens for orientation changes using:
```javascript
window.matchMedia('(orientation: portrait)').addEventListener('change', handler)
window.matchMedia('(orientation: landscape)').addEventListener('change', handler)
```

When orientation changes, the dashboard:
1. Detects the new orientation
2. Fetches the config for the new orientation
3. Re-renders all widgets with the new layout

## Testing

A test script is provided to validate the dual orientation functionality:

```bash
node scripts/test-dual-orientation.js
```

This verifies:
- Config API returns correct layouts for each orientation
- Both `/smart-mirror` and `/smart-mirror-l` routes work
- Portrait and landscape layouts are distinct
- Backward compatibility with old configs

## Browser Support

- **Full Support**: Chrome, Firefox, Safari, Edge (modern versions)
- **Partial Support**: Older browsers (uses dimension-based fallback)
- **Orientation Change**: Supported on all modern browsers with `matchMedia`

## Troubleshooting

### Widgets Not Rearranging on Rotation
- Ensure you're not using a URL-locked orientation (`/smart-mirror-l`)
- Check browser console for JavaScript errors
- Verify both portrait and landscape layouts are configured differently

### Layout Looks Wrong
- Open admin panel and check both orientation tabs
- Verify widgets aren't overlapping in the grid editor
- Save configuration after making changes

### Changes Not Persisting
- Ensure you click "Apply Changes" in the grid editor
- Click "Save Smart Mirror Configuration" to persist to server
- Check admin panel alerts for any error messages

## Migration Notes

When upgrading from a previous version:
- Existing configurations are automatically migrated
- Old `gridPosition` values become the default for both orientations
- No manual migration steps required
- Both orientations initially use the same layout until you customize the landscape layout
