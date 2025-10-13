# Magic Mirror Layout System

## Overview

The Magic Mirror Dashboard now supports flexible widget placement using a 9-area grid layout system with customizable widget sizes.

## Features

- **9-Area Grid Layout**: Position widgets in any of 9 defined areas (3×3 grid)
- **Widget Sizing**: Choose between 'box' (standard) or 'bar' (full-width) sizes
- **Vertical Stacking**: Place multiple widgets in the same area - they stack automatically
- **Responsive Design**: Adapts to portrait orientation and mobile devices
- **Backward Compatible**: Existing boolean widget configurations are automatically converted

## Layout Areas

The dashboard is divided into 9 areas:

```
┌─────────────┬──────────────┬──────────────┐
│ upper-left  │ upper-center │ upper-right  │
├─────────────┼──────────────┼──────────────┤
│ middle-left │ middle-center│ middle-right │
├─────────────┼──────────────┼──────────────┤
│ bottom-left │ bottom-center│ bottom-right │
└─────────────┴──────────────┴──────────────┘
```

## Widget Sizes

### Box Size (default)
- Standard widget size
- Natural width within its area
- Best for most widgets

### Bar Size
- Spans full width of the area
- Ideal for news feeds, notifications, or other content that benefits from more horizontal space

## Configuration

### New Format

Configure widgets with `enabled`, `area`, and `size` properties:

```json
{
  "enabled": true,
  "widgets": {
    "clock": {
      "enabled": true,
      "area": "upper-left",
      "size": "box"
    },
    "weather": {
      "enabled": true,
      "area": "upper-center",
      "size": "box"
    },
    "calendar": {
      "enabled": true,
      "area": "middle-left",
      "size": "box"
    },
    "news": {
      "enabled": true,
      "area": "bottom-left",
      "size": "bar"
    }
  }
}
```

### Old Format (Still Supported)

The old boolean format is still supported and will be automatically converted:

```json
{
  "widgets": {
    "clock": true,
    "weather": true,
    "calendar": false,
    "news": true
  }
}
```

When using the old format, widgets are placed in default positions:
- `clock`: upper-left, box
- `weather`: upper-center, box
- `calendar`: middle-left, box
- `news`: bottom-left, bar
- `media`: middle-right, box

## Multiple Widgets in Same Area

You can place multiple widgets in the same area. They will stack vertically without overlapping:

```json
{
  "widgets": {
    "clock": {
      "enabled": true,
      "area": "upper-left",
      "size": "box"
    },
    "weather": {
      "enabled": true,
      "area": "upper-left",  // Same area as clock
      "size": "box"
    }
  }
}
```

Result: Both widgets appear in the upper-left area, with weather below clock.

## Examples

### Centered Layout

All widgets in the center column:

```json
{
  "widgets": {
    "clock": { "enabled": true, "area": "upper-center", "size": "box" },
    "weather": { "enabled": true, "area": "middle-center", "size": "box" },
    "media": { "enabled": true, "area": "middle-center", "size": "box" },
    "news": { "enabled": true, "area": "bottom-center", "size": "bar" }
  }
}
```

### Compact Left Sidebar

All widgets stacked on the left:

```json
{
  "widgets": {
    "clock": { "enabled": true, "area": "upper-left", "size": "box" },
    "weather": { "enabled": true, "area": "middle-left", "size": "box" },
    "calendar": { "enabled": true, "area": "middle-left", "size": "box" },
    "news": { "enabled": true, "area": "bottom-left", "size": "bar" }
  }
}
```

### Full-Width News Bar

News spanning the bottom:

```json
{
  "widgets": {
    "clock": { "enabled": true, "area": "upper-left", "size": "box" },
    "weather": { "enabled": true, "area": "upper-right", "size": "box" },
    "news": { "enabled": true, "area": "bottom-center", "size": "bar" }
  }
}
```

### Media Player Display

Media widget examples showing both box and bar sizes:

**Compact (Box) Size:**
```json
{
  "widgets": {
    "media": {
      "enabled": true,
      "area": "middle-right",
      "size": "box"
    }
  }
}
```

**Extended (Bar) Size:**
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

The **box** size displays:
- Album artwork (80×80px)
- Track title
- Artist name
- Play state

The **bar** size displays all of the above plus:
- Album name
- Player/device name
- Larger album artwork (120×120px)
- More detailed layout

## Responsive Behavior

### Portrait Mode
On portrait-oriented displays, the layout automatically switches to a single column with all areas stacked vertically in order:
1. upper-left
2. upper-center
3. upper-right
4. middle-left
5. middle-center
6. middle-right
7. bottom-left
8. bottom-center
9. bottom-right

### Mobile Devices
On screens narrower than 768px, the same single-column layout is applied.

## Technical Details

- **CSS Grid**: Uses CSS Grid with named template areas for precise positioning
- **Flexbox Stacking**: Each area uses flexbox column layout for vertical widget stacking
- **Gap Spacing**: 2rem gap between areas, 1rem gap between stacked widgets
- **Min Height**: Grid has minimum height of 70vh for better spacing
- **Widget Animation**: Widgets have hover effects (lift and shadow)

## Testing

Run the layout test suite to verify functionality:

```bash
node scripts/test-magic-mirror-layout.js
```

Tests verify:
- Grid layout structure
- Widget area containers
- Size classes
- Responsive layouts
- Widget creation logic
- API format conversion
- Vertical stacking
- Overlap prevention

## Migration Guide

### From Old Boolean Format

If you're using the old format, no action needed! The system automatically converts:

**Old:**
```json
{ "clock": true, "weather": false }
```

**Becomes:**
```json
{
  "clock": { "enabled": true, "area": "upper-left", "size": "box" },
  "weather": { "enabled": false, "area": "upper-center", "size": "box" }
}
```

### Customizing Existing Setups

To customize widget placement:

1. Go to Admin Panel → Server → Magic Mirror
2. Enable Magic Mirror if not already enabled
3. Configure widget positions via API or configuration file
4. Reload the Magic Mirror dashboard to see changes

## Future Enhancements

Potential future additions:
- Drag-and-drop widget placement in admin UI
- Custom grid layouts (2×2, 4×4, etc.)
- Widget resizing handles
- Save multiple layout presets
- Per-widget color themes
