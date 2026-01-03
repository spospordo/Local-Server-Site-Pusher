# Smart Mirror Grid Positioning Guide

## Overview

The Smart Mirror dashboard uses a CSS Grid layout system that enforces strict widget placement based on `gridPosition` values configured for each widget.

## Grid Layout

The dashboard is organized as a **4 columns × 3 rows** grid:

```
     Column 0   Column 1   Column 2   Column 3
Row 0    [ ]        [ ]        [ ]        [ ]
Row 1    [ ]        [ ]        [ ]        [ ]
Row 2    [ ]        [ ]        [ ]        [ ]
```

## Widget Configuration

Each widget has a `gridPosition` property with four values:

```javascript
gridPosition: {
  x: 0,       // Column position (0-3)
  y: 0,       // Row position (0-2)
  width: 2,   // Number of columns to span (1-4)
  height: 1   // Number of rows to span (1-3)
}
```

### Properties

- **`x`**: Horizontal position (column), starting from 0 (left) to 3 (right)
- **`y`**: Vertical position (row), starting from 0 (top) to 2 (bottom)
- **`width`**: Number of columns the widget spans (1-4)
- **`height`**: Number of rows the widget spans (1-3)

### Example Configuration

```javascript
widgets: {
  clock: {
    enabled: true,
    gridPosition: { x: 0, y: 0, width: 2, height: 1 }
    // Positioned at top-left, spans 2 columns and 1 row
  },
  calendar: {
    enabled: true,
    gridPosition: { x: 2, y: 0, width: 2, height: 2 }
    // Positioned at top-right, spans 2 columns and 2 rows
  },
  weather: {
    enabled: true,
    gridPosition: { x: 0, y: 1, width: 2, height: 1 }
    // Positioned at middle-left, spans 2 columns and 1 row
  },
  forecast: {
    enabled: true,
    gridPosition: { x: 0, y: 2, width: 4, height: 1 }
    // Positioned at bottom, spans all 4 columns and 1 row
  },
  news: {
    enabled: true,
    gridPosition: { x: 2, y: 1, width: 2, height: 1 }
    // Positioned at middle-right, spans 2 columns and 1 row
  }
}
```

## How It Works

### 1. CSS Grid Rules

The dashboard uses combined CSS Grid position and span rules to enforce exact placement:

```css
/* Example: Widget at column 0, spanning 2 columns */
.widget[data-grid-x="0"][data-grid-width="2"] {
  grid-column: 1 / span 2;
}

/* Example: Widget at row 0, spanning 1 row */
.widget[data-grid-y="0"][data-grid-height="1"] {
  grid-row: 1 / span 1;
}
```

This ensures that:
- Position is set by the starting grid line number (`1` = column 0)
- Span defines how many cells to occupy (`span 2` = 2 columns)
- Both position and span are applied together, preventing override issues

### 2. Widget Rendering Order

Widgets are sorted before rendering to ensure proper stacking and predictable order:

```javascript
// Sort by Y coordinate (row) first, then X coordinate (column)
widgetEntries.sort((a, b) => {
  const posA = a.config.gridPosition || { x: 0, y: 0 };
  const posB = b.config.gridPosition || { x: 0, y: 0 };
  
  // Sort by row (top to bottom)
  if (posA.y !== posB.y) return posA.y - posB.y;
  
  // Then by column (left to right)
  if (posA.x !== posB.x) return posA.x - posB.x;
  
  // Tiebreaker: alphabetical by widget name
  return a.key.localeCompare(b.key);
});
```

This ensures widgets are rendered:
1. Top to bottom (by `y` value)
2. Left to right within each row (by `x` value)
3. Alphabetically when at the same position (stable ordering)

### 3. Tiebreaker for Overlapping Widgets

If two enabled widgets are assigned the same grid coordinates, they will be rendered in alphabetical order by widget type name (e.g., "calendar" before "clock").

## Configuring Widget Positions

### Via Admin Panel

1. Navigate to `http://localhost:3000/admin`
2. Go to **Server** → **Smart Mirror**
3. Expand the widget you want to configure
4. Adjust the grid position fields:
   - **Grid Position X** (0-3): Column
   - **Grid Position Y** (0-2): Row
   - **Width** (1-4): Columns to span
   - **Height** (1-3): Rows to span
5. Click **Save Smart Mirror Configuration**
6. Reload the `/smart-mirror` dashboard to see changes

### Via Configuration File

The configuration is stored in `config/smartmirror-config.json.enc` (encrypted).

To modify directly:
1. Load the configuration via the API or module
2. Update the `gridPosition` values for the desired widget
3. Save the configuration
4. The dashboard will load the new positions on next page load

### Via API

Update configuration programmatically:

```javascript
POST /admin/api/smartmirror/config
Content-Type: application/json

{
  "enabled": true,
  "widgets": {
    "clock": {
      "enabled": true,
      "gridPosition": { "x": 1, "y": 1, "width": 2, "height": 1 }
    }
  }
}
```

## Validation Rules

The system validates grid positions:

- `x` must be between 0-3
- `y` must be between 0-2
- `width` must be between 1-4
- `height` must be between 1-3
- `x + width` must not exceed 4 (grid columns)
- `y + height` must not exceed 3 (grid rows)

Invalid positions will cause widgets to not display correctly or may be ignored.

## Testing

### Automated Tests

Run the grid positioning test suite:

```bash
node scripts/test-smart-mirror-grid.js
```

This tests:
- Grid position structure validation
- Position value bounds checking
- CSS grid rules presence
- Overlapping widget detection
- Widget render order verification
- Default configuration validity

### Visual Demo

Run the visual grid demo:

```bash
node scripts/demo-smart-mirror-grid.js
```

This displays:
- Current widget positions
- Visual grid layout representation
- Configuration instructions

## Troubleshooting

### Widgets Not in Expected Position

1. **Check configuration**: Verify `gridPosition` values are correct
   ```bash
   curl http://localhost:3000/api/smart-mirror/config
   ```

2. **Check browser cache**: Clear cache or hard reload (Ctrl+Shift+R)
   - The dashboard includes cache-busting headers, but some browsers may cache aggressively

3. **Check widget is enabled**: Only `enabled: true` widgets are rendered
   ```javascript
   widget.enabled === true
   ```

4. **Check CSS rules**: Ensure browser supports CSS Grid
   - All modern browsers support CSS Grid
   - Check browser console for CSS errors

### Widgets Overlapping

- Overlapping is allowed but may not be intended
- Check that `x + width` and `y + height` don't exceed grid boundaries
- Adjust positions to avoid conflicts

### Widget Not Visible

1. Check if widget is enabled: `widgets.clock.enabled === true`
2. Check if position is within bounds: `0 <= x <= 3`, `0 <= y <= 2`
3. Check console logs for rendering messages:
   ```
   [Smart Mirror] Widget render order: clock(0,0), calendar(2,0)
   ```

## Implementation Details

### Files Modified

- **public/smart-mirror.html**
  - CSS grid rules (lines 541-565)
  - Widget sorting logic (lines 698-727)
  - Grid position data attributes (lines 720-725)

### Key Changes

1. **Combined CSS Rules**: Replaced separate position/span rules with combined rules to prevent overrides
   - Before: `.widget[data-grid-x="0"] { grid-column: 1; }` + `.widget[data-grid-width="2"] { grid-column: span 2; }`
   - After: `.widget[data-grid-x="0"][data-grid-width="2"] { grid-column: 1 / span 2; }`

2. **Widget Sorting**: Added sorting by gridPosition before rendering
   - Ensures predictable render order
   - Provides stable tiebreaker for same positions

3. **Enhanced Logging**: Added detailed console logging for debugging
   - Shows widget render order with positions
   - Helps diagnose placement issues

## Best Practices

1. **Avoid Overlaps**: Design layouts without overlapping widgets for clarity
2. **Test Changes**: Always test configuration changes in the dashboard
3. **Use Defaults**: Start with default positions and adjust as needed
4. **Document Custom Layouts**: Keep notes on custom grid configurations
5. **Backup Configuration**: Save configuration before making major changes

## Example Layouts

### Layout 1: Top Clock, Large Calendar Below

```javascript
clock: { x: 0, y: 0, width: 4, height: 1 }    // Full width at top
calendar: { x: 0, y: 1, width: 4, height: 2 } // Full width below
```

### Layout 2: Split Screen (Clock Left, Calendar Right)

```javascript
clock: { x: 0, y: 0, width: 2, height: 3 }    // Left half, full height
calendar: { x: 2, y: 0, width: 2, height: 3 } // Right half, full height
```

### Layout 3: Dashboard Style (Multiple Widgets)

```javascript
clock: { x: 0, y: 0, width: 2, height: 1 }     // Top-left
weather: { x: 2, y: 0, width: 2, height: 1 }   // Top-right
calendar: { x: 0, y: 1, width: 2, height: 2 }  // Bottom-left (tall)
news: { x: 2, y: 1, width: 2, height: 1 }      // Middle-right
forecast: { x: 2, y: 2, width: 2, height: 1 }  // Bottom-right
```

## Related Documentation

- [SMART_MIRROR_FIX_SUMMARY.md](../SMART_MIRROR_FIX_SUMMARY.md) - Smart Mirror implementation summary
- [SMART_MIRROR_LOGGING.md](../SMART_MIRROR_LOGGING.md) - Logging system documentation
- Admin Panel → Server → Smart Mirror - Configuration interface

## Support

For issues or questions:
1. Check browser console for error messages
2. Run test suite: `node scripts/test-smart-mirror-grid.js`
3. Review configuration: `GET /api/smart-mirror/config`
4. Check server logs for backend errors
