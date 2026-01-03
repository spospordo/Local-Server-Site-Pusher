# Smart Mirror Interactive Grid Editor - User Guide

## Overview

The Interactive Grid Editor is a visual tool for managing widget layout on the Smart Mirror dashboard. It allows you to drag, drop, and resize widgets directly on a live grid preview, making it easy to design your perfect dashboard layout.

## Accessing the Grid Editor

1. Log in to the admin panel at `http://your-server:3000/admin`
2. Click on the **Server** tab in the navigation menu
3. Click on the **Smart Mirror** sub-tab
4. Scroll to the **Interactive Grid Layout Editor** section

## Features

### Visual Grid Canvas

The grid editor displays a 4×3 grid representing your Smart Mirror dashboard:
- **Grid Cells**: Each cell is labeled with its coordinates (column, row)
- **Widget Cards**: Enabled widgets appear as colored cards on the grid
- **Widget Information**: Each card shows the widget icon, name, and current position/size

### Widget Palette

The sidebar shows all available widgets with their current status:
- **Enabled Widgets**: Show current position and size
- **Disabled Widgets**: Grayed out and not shown on the grid
- **Real-time Updates**: Position and size update as you make changes

### Color Coding

- **Purple Gradient**: Enabled widgets
- **Gray**: Disabled widgets
- **Gold Border**: Selected widget
- **Red Border**: Overlapping widgets (warning)

## Using the Grid Editor

### Selecting Widgets

Click on any widget card on the grid to select it. The selected widget will show a gold border.

### Moving Widgets (Drag and Drop)

1. Click and hold on a widget card
2. Drag it to the desired position on the grid
3. Release to place the widget
4. Widgets automatically snap to grid cells
5. Cannot be moved outside grid boundaries (0-3 columns, 0-2 rows)

**Keyboard Alternative:**
- Select a widget by clicking it
- Use **Arrow Keys** to move the selected widget one cell at a time
  - `←` Move left
  - `→` Move right  
  - `↑` Move up
  - `↓` Move down

### Resizing Widgets

1. Click on a widget to select it
2. Drag one of the four corner handles:
   - **Top-left** (NW): Move top-left corner
   - **Top-right** (NE): Move top-right corner
   - **Bottom-left** (SW): Move bottom-left corner
   - **Bottom-right** (SE): Move bottom-right corner
3. Widget automatically snaps to grid cell boundaries
4. Minimum size: 1×1 cell
5. Maximum size: 4 columns × 3 rows (full grid)

**Keyboard Alternative:**
- Select a widget by clicking it
- Hold **Shift** and use **Arrow Keys** to resize:
  - `Shift + →` Increase width
  - `Shift + ←` Decrease width
  - `Shift + ↓` Increase height
  - `Shift + ↑` Decrease height

### Applying Changes

After arranging widgets in the grid editor:

1. Click the **✓ Apply Changes** button
2. This updates the form inputs below with the new positions
3. A success message confirms changes were applied
4. If widgets overlap, you'll see a warning message

**Important:** Changes are NOT saved to the server until you click **Save Smart Mirror Configuration**.

### Resetting the Layout

To undo all changes and return to the saved configuration:

1. Click the **↺ Reset Layout** button
2. Confirm the reset action
3. All widgets return to their previously saved positions

### Saving the Configuration

After applying changes to the form:

1. Review the widget configuration forms below the grid editor
2. Click **Save Smart Mirror Configuration** at the bottom
3. Wait for the success confirmation
4. Your new layout is now saved and will appear on the dashboard

### Previewing the Dashboard

To see how your layout looks on the actual dashboard:

1. Click **Preview Dashboard** button
2. A new tab opens with `/smart-mirror` dashboard
3. View your configured widgets in their positions

## Widget Requirements

### Enabling/Disabling Widgets

- Only enabled widgets appear in the grid editor
- To enable a widget:
  1. Expand the widget section below the grid editor
  2. Set the widget's dropdown to "Enabled"
  3. The grid editor will automatically refresh
  4. The widget appears on the grid in its configured position

### Grid Constraints

- **Columns**: 0-3 (4 total columns)
- **Rows**: 0-2 (3 total rows)
- **Widget Width**: 1-4 cells
- **Widget Height**: 1-3 cells
- **Boundaries**: Widgets cannot extend beyond the grid edges
  - `x + width ≤ 4`
  - `y + height ≤ 3`

## Overlapping Widgets

The grid editor detects when widgets overlap:

- **Visual Indicator**: Overlapping widgets show a red border
- **Warning Message**: Lists which widgets are overlapping
- **Dashboard Impact**: Overlapping widgets may not display correctly on the dashboard

**Best Practice:** Avoid overlapping widgets for a clean, predictable layout.

## Tips and Best Practices

### Layout Design

1. **Plan your layout** before making changes
2. **Start with larger widgets** (like Calendar or Forecast) first
3. **Fill empty space** with smaller widgets (Clock, Weather, News)
4. **Leave breathing room** - not every cell needs to be filled
5. **Test on the actual dashboard** after saving changes

### Common Layouts

**Full-Width Clock at Top:**
```
Clock: x=0, y=0, width=4, height=1
Calendar: x=0, y=1, width=2, height=2
News: x=2, y=1, width=2, height=2
```

**Split Screen:**
```
Clock: x=0, y=0, width=2, height=3
Calendar: x=2, y=0, width=2, height=3
```

**Dashboard Style:**
```
Clock: x=0, y=0, width=2, height=1
Weather: x=2, y=0, width=2, height=1
Calendar: x=0, y=1, width=2, height=2
News: x=2, y=1, width=2, height=1
Forecast: x=2, y=2, width=2, height=1
```

### Workflow

1. **Design** - Arrange widgets in the grid editor
2. **Apply** - Click "Apply Changes" to update form
3. **Review** - Check the form inputs below
4. **Save** - Click "Save Smart Mirror Configuration"
5. **Test** - Preview the dashboard in a new tab
6. **Iterate** - Make adjustments as needed

## Accessibility

The grid editor supports multiple input methods:

- **Mouse**: Click and drag for visual interaction
- **Touch**: Full touch support for tablets and mobile devices
- **Keyboard**: Arrow keys for precise positioning
- **Screen Readers**: Widget information is accessible via ARIA labels

## Troubleshooting

### Widgets Not Appearing in Grid Editor

- **Check if widget is enabled**: Only enabled widgets show in the grid
- **Refresh the page**: Try reloading the admin panel
- **Check browser console**: Look for JavaScript errors

### Changes Not Saving

- **Apply changes first**: Click "Apply Changes" before saving
- **Save configuration**: Must click "Save Smart Mirror Configuration"
- **Check for errors**: Look for error messages in the alert box
- **Verify authentication**: Ensure you're still logged in

### Layout Not Showing on Dashboard

- **Clear browser cache**: Force refresh the dashboard (Ctrl+Shift+R)
- **Check widget enabled status**: Disabled widgets won't display
- **Verify configuration saved**: Re-check the grid editor shows saved positions
- **Review server logs**: Check for backend errors

### Drag and Drop Not Working

- **Check browser compatibility**: Use a modern browser (Chrome, Firefox, Edge, Safari)
- **Disable browser extensions**: Ad blockers may interfere with drag events
- **Try keyboard controls**: Use arrow keys as an alternative

## Technical Details

### Grid System

- **Layout**: CSS Grid with 4 columns × 3 rows
- **Cell Size**: Responsive, adjusts to screen size
- **Gap**: 10px between widgets
- **Aspect Ratio**: Maintains 4:3 ratio

### Widget Positioning

Widgets use absolute positioning within the grid:
- **Left**: `column × cellWidth`
- **Top**: `row × cellHeight`
- **Width**: `columns × cellWidth - gap`
- **Height**: `rows × cellHeight - gap`

### Data Structure

Widget configuration format:
```javascript
{
  "enabled": true,
  "gridPosition": {
    "x": 0,        // Column (0-3)
    "y": 0,        // Row (0-2)
    "width": 2,    // Columns to span (1-4)
    "height": 1    // Rows to span (1-3)
  }
}
```

## Support

For issues or questions:

1. Check the **Diagnostics & Troubleshooting** section below the grid editor
2. Click **Run Diagnostics** to check system status
3. Click **Export Logs** to save log files for debugging
4. Review the server logs for backend errors
5. Consult the main README.md for general setup help

## Related Documentation

- [SMART_MIRROR_GRID_POSITIONING.md](../SMART_MIRROR_GRID_POSITIONING.md) - Technical grid positioning details
- [SMART_MIRROR_FIX_SUMMARY.md](../SMART_MIRROR_FIX_SUMMARY.md) - Smart Mirror implementation overview
- Admin Panel → Server → Smart Mirror - Configuration interface
