# Smart Widget Implementation

## Overview

The **Smart Widget** is an intelligent container widget for the Smart Mirror dashboard that manages and displays multiple sub-widgets based on their content relevance and available space. It provides a flexible way to show dynamic information like weather alerts, upcoming events, and media status without cluttering the dashboard.

## Features

### Core Capabilities

- **Intelligent Content Display**: Only shows sub-widgets when they have active/relevant content
- **Multiple Display Modes**:
  - **Cycle**: Rotates through sub-widgets at a configurable speed
  - **Simultaneous**: Shows multiple sub-widgets at once (configurable maximum)
  - **Priority**: Displays only the highest-priority sub-widget with content
- **Priority-Based Ordering**: Sub-widgets with lower priority numbers appear first
- **Automatic Updates**: Integrates with the Smart Mirror refresh system

### Initial Sub-Widgets

1. **🌧️ Rain Forecast**: Shows if rain is expected in the next 1-5 days
   - Displays earliest rain day
   - Shows precipitation probability
   - Only appears when rain is in the forecast

2. **✈️ Upcoming Vacation**: Displays upcoming vacations from House → Vacation page
   - Shows up to 3 upcoming vacations
   - Displays destination and countdown for each
   - Shows start date for each vacation
   - Only appears when vacations are scheduled
   - Multiple vacations displayed with visual separators

3. **🎵 Home Assistant Media**: Indicates when media is playing
   - Shows artwork, title, and artist
   - Displays playback status and player name
   - Only appears when media is actively playing or paused

4. **🎉 Party**: Displays upcoming party information from Party → Scheduling
   - Shows party countdown (days until party)
   - Displays date and time
   - Shows task completion status
   - Lists guest RSVP summary (coming, pending, not coming)
   - Displays menu item count
   - Shows scheduled events count
   - Only appears when a party date is set and is today or in the future

## Configuration

### Admin Interface

Navigate to **Admin → Server → Smart Mirror → Smart Widget** to configure:

#### Widget Settings

- **Enabled**: Turn the Smart Widget on or off
- **Size**: Small, Medium, or Large
- **Grid Position**: X, Y coordinates and width/height on the grid
  - **Tip**: Use the **Interactive Grid Layout Editor** to visually position the Smart Widget
  - The grid editor allows you to drag and resize the Smart Widget on the dashboard layout
  - Changes made in the grid editor automatically update the position fields

#### Display Settings

- **Display Mode**: Choose how sub-widgets are shown
  - Cycle: Rotate through sub-widgets
  - Simultaneous: Show multiple at once
  - Priority: Show only highest priority
- **Cycle Speed**: Time between rotations (5-60 seconds)
- **Max Simultaneous**: Maximum sub-widgets to show at once (1-4)

#### Sub-Widget Configuration

Each sub-widget can be:
- **Enabled/Disabled**: Toggle visibility
- **Priority**: Set display order (1 = highest priority)

#### Shared Configuration

- **OpenWeatherMap API Key**: Required for Rain Forecast
- **Location**: City name for weather lookups
- **Temperature Units**: Imperial (°F) or Metric (°C)
- **Home Assistant URL**: For media player integration
- **Home Assistant Token**: Long-lived access token
- **Entity IDs**: Media player entities to monitor

## API Endpoints

### Public Endpoint (Smart Mirror Access)

#### Get Smart Widget Data
```
GET /api/smart-mirror/smart-widget
```

Returns aggregated sub-widget data with active content only.

**Response:**
```json
{
  "success": true,
  "displayMode": "cycle",
  "cycleSpeed": 10,
  "simultaneousMax": 2,
  "subWidgets": [
    {
      "type": "rainForecast",
      "priority": 1,
      "hasContent": true,
      "data": {
        "hasRain": true,
        "rainDays": [
          {
            "daysFromNow": 2,
            "date": "2026-02-03",
            "description": "Light rain",
            "precipitation": 0.65
          }
        ],
        "location": "Seattle"
      }
    },
    {
      "type": "upcomingVacation",
      "priority": 2,
      "hasContent": true,
      "data": {
        "vacations": [
          {
            "destination": "Hawaii",
            "startDate": "2026-03-15",
            "endDate": "2026-03-22",
            "daysUntil": 39
          },
          {
            "destination": "New York City",
            "startDate": "2026-04-10",
            "endDate": "2026-04-15",
            "daysUntil": 65
          },
          {
            "destination": "Paris",
            "startDate": "2026-05-20",
            "endDate": "2026-05-27",
            "daysUntil": 105
          }
        ]
      }
    }
  ]
}
```

#### Get Rain Forecast
```
GET /api/smart-mirror/rain-forecast
```

Returns detailed rain forecast for the configured location.

**Response:**
```json
{
  "success": true,
  "hasRain": true,
  "rainDays": [
    {
      "daysFromNow": 2,
      "date": "2026-02-03",
      "description": "Light rain",
      "precipitation": 0.65
    }
  ],
  "location": "Seattle"
}
```

## Frontend Integration

### Display Logic

The Smart Widget automatically:
1. Fetches aggregated sub-widget data from the API
2. Filters out sub-widgets without active content
3. Sorts by priority (lowest number first)
4. Renders based on display mode:
   - **Cycle**: Shows one sub-widget, rotating through them
   - **Simultaneous**: Shows multiple sub-widgets in a grid
   - **Priority**: Shows only the first (highest priority) sub-widget

### Styling

Sub-widgets are rendered with:
- Icon or artwork (if available)
- Title/heading text
- Supporting information
- Consistent spacing and backgrounds

The widget container uses CSS Grid for layout in simultaneous mode, adapting to the number of active sub-widgets.

## Backend Architecture

### Module Structure (`modules/smartmirror.js`)

- `getDefaultWidgets()`: Includes Smart Widget default configuration
- `getDefaultPortraitLayout()`: Defines portrait grid position
- `getDefaultLandscapeLayout()`: Defines landscape grid position

### API Endpoints (`server.js`)

- **Smart Widget Aggregator**: Fetches data from all enabled sub-widgets
- **Rain Forecast**: Analyzes weather forecast for rain
- Sub-widgets leverage existing endpoints (vacation, media, forecast)

### Sub-Widget Integration

Each sub-widget:
1. Checks if it has relevant content to display
2. Returns structured data if content exists
3. Returns null if no content (hidden from display)

## Usage Examples

### Example 1: Cycle Mode
Shows rain alert, then vacation countdown, then media player info, rotating every 10 seconds.

### Example 2: Simultaneous Mode
Shows both rain forecast and vacation countdown side-by-side if both have content.

### Example 3: Priority Mode
Shows only the rain forecast if present, otherwise shows vacation, otherwise shows media.

## Testing

Run the test suite:
```bash
node scripts/test-smart-widget.js
```

Tests validate:
- Configuration loading and persistence
- Sub-widget types and priorities
- Layout definitions
- Display mode validation
- Integration with vacation data module

## Security Considerations

- **API Keys**: Weather API keys are encrypted at rest using AES-256-GCM
- **Home Assistant Tokens**: Access tokens are encrypted and never exposed to frontend
- **Admin Only**: Configuration changes require authentication
- **Input Validation**: All user inputs are validated and sanitized

## Best Practices

1. **Priority Management**: Assign priorities based on importance
   - Critical alerts: 1-2
   - Informational: 3-5
   - Nice-to-have: 6-10

2. **Cycle Speed**: Balance update frequency with readability
   - Fast (5-8s): For time-sensitive info
   - Medium (10-15s): Default, good balance
   - Slow (20-30s): For detailed content

3. **Display Mode Selection**:
   - **Cycle**: Best for 3+ sub-widgets or limited space
   - **Simultaneous**: Best for 2-3 important items
   - **Priority**: Best for single most important alert

4. **API Keys**: Use the same OpenWeatherMap key as other widgets to save costs

## Future Enhancements

Potential additions:
- Custom sub-widgets via UI
- Animation transitions between cycles
- Tap-to-pause cycling
- Sub-widget templates
- More built-in sub-widgets (traffic, sports scores, etc.)

## Troubleshooting

### Smart Widget Not Appearing
- Check that Smart Widget is enabled in admin
- Verify at least one sub-widget is enabled
- Ensure sub-widgets have active content (rain in forecast, vacation scheduled, media playing)

### Rain Forecast Not Showing
- Verify OpenWeatherMap API key is configured
- Check location is correct
- Ensure there's actually rain in the 5-day forecast

### Vacation Not Showing
- Add vacation dates in House → Vacation section
- Ensure vacation date is in the future
- Check vacation sub-widget is enabled

### Media Not Showing
- Verify Home Assistant URL and token are correct
- Check entity IDs are valid media players
- Ensure media is actually playing or paused

### Party Not Showing
- Navigate to Admin → Party → Scheduling tab
- Set a party date (must be today or in the future)
- Enable party sub-widget in Admin → Smart Mirror → Smart Widget settings
- Check that Smart Widget itself is enabled
- Verify party date is not in the past
- Review browser console for any JavaScript errors

## Admin Setup Guide

### Using the Interactive Grid Layout Editor

The Smart Widget can be positioned and sized using the Interactive Grid Layout Editor:

1. **Access the Grid Editor**:
   - Navigate to **Admin → Server → Smart Mirror**
   - Scroll to the **Interactive Grid Layout Editor** section at the top of the page

2. **Position the Smart Widget**:
   - Enable the Smart Widget if it's not already enabled
   - The Smart Widget (🧠 icon) will appear on the grid canvas
   - Click and drag the Smart Widget to move it to your desired position
   - The widget will snap to grid cells automatically

3. **Resize the Smart Widget**:
   - Click the Smart Widget to select it (gold border appears)
   - Drag the corner handles to resize the widget
   - The widget can span multiple grid cells (1-4 width, 1-6 height)

4. **Apply and Save Changes**:
   - Click the **"Apply Changes"** button to sync the grid positions to form fields
   - Scroll down and click **"Save Smart Mirror Configuration"** to persist changes
   - Visit the Smart Mirror dashboard to see your new layout

5. **Switch Between Orientations**:
   - Use the **Portrait/Landscape** tabs to configure layouts for different screen orientations
   - Each orientation has independent positioning
   - Changes in one orientation don't affect the other

### Setting Up the Party Sub-Widget

1. **Configure Party Information** (Admin → Party → Scheduling):
   - Set the party date and time (required)
   - Add invitees with RSVP status (optional)
   - Create menu items (optional)
   - Add pre-party tasks (optional)
   - Schedule party events (optional)
   - Click "Save"

2. **Enable Smart Widget** (Admin → Smart Mirror):
   - Scroll to "Smart Widget" section
   - Set "Enabled" to "Yes"
   - Choose display mode (cycle, simultaneous, or priority)
   - Adjust cycle speed if using cycle mode

3. **Enable Party Sub-Widget**:
   - Find "🎉 Party Sub-Widget" section
   - Set "Enabled" to "Yes"
   - Set priority (default: 4, lower = higher priority)
   - Click "Save Smart Mirror Configuration"

4. **Verify Display**:
   - Navigate to `/smart-mirror` in your browser
   - Smart Widget should appear in the configured grid position
   - Party information should display when party date is set

### Error Handling

The party sub-widget includes robust error handling:

- **Missing Party Data**: If no party is configured, the widget simply won't display (no error shown to users)
- **Past Party Date**: Parties that have already occurred are automatically hidden
- **Incomplete Data**: All party fields except date are optional; the widget displays available data gracefully
- **No Active Notifications**: When no sub-widgets have content, shows "No active notifications" message
- **Invalid Configuration**: Server validates all data before sending to client

### QA Steps for Verification

1. **Test with Complete Party Data**:
   - Configure all party fields (date, tasks, invitees, menu, events)
   - Verify all information displays correctly
   - Check countdown shows correct days until party

2. **Test with Minimal Party Data**:
   - Configure only party date
   - Verify widget displays with just date/countdown
   - Confirm no errors for missing optional fields

3. **Test Edge Cases**:
   - Set party date to today → should show "Party Today!" in green
   - Set party date to tomorrow → should show "Party Tomorrow"
   - Set party date to past → widget should not display
   - Remove party date → widget should not display

4. **Test Display Modes**:
   - **Cycle**: Party rotates with other enabled sub-widgets
   - **Simultaneous**: Party displays alongside other sub-widgets
   - **Priority**: Party displays based on priority setting (default: 4)

5. **Test Grid Layout**:
   - Open Admin → Smart Mirror → Grid Editor
   - Verify Smart Widget appears on the grid
   - Drag to reposition, resize as needed
   - Save changes and verify on smart mirror display

### Constraints and Limitations

- **Admin-Only Configuration**: Only admins can configure party data; end users see read-only display
- **Date Requirement**: Party date must be set for widget to display
- **Future Dates Only**: Past parties are automatically hidden
- **Single Party**: Currently shows only one upcoming party (the next scheduled)
- **No Real-time RSVP**: RSVP changes require page refresh to display
- **Grid Position**: Inherits position from Smart Widget container settings

## Version History

- **v2.6.6** (2026-02-03): Grid Editor Integration Fix
  - Added Smart Widget to WIDGET_ICONS registry in admin dashboard
  - Smart Widget now appears in Interactive Grid Layout Editor
  - Created comprehensive test suite for grid editor integration (test-smart-widget-grid-editor.js)
  - All 11 tests pass: WIDGET_ICONS registration, form fields validation, dynamic discovery
  - Smart Widget can now be dragged, resized, and positioned using grid editor
  - Resolves issue: "Ensure Smart Widget Displays in Interactive Grid Layout Editor"

- **v2.5.1** (2026-02-03): Party sub-widget integration fix
  - Fixed missing party sub-widget in default configuration
  - Added party sub-widget to default subWidgets array (priority: 4)
  - Updated documentation with party setup guide and QA steps
  - Added troubleshooting section for party widget
  - Documented constraints and error handling

- **v2.5.0** (2026-02-01): Initial Smart Widget implementation
  - Added Smart Widget container with three sub-widgets
  - Implemented cycle, simultaneous, and priority display modes
  - Added rain forecast sub-widget with weather API integration
  - Integrated upcoming vacation sub-widget
  - Added Home Assistant media sub-widget
  - Created admin interface for configuration
  - Added comprehensive testing suite

## Related Documentation

- [PARTY_WIDGET_IMPLEMENTATION.md](PARTY_WIDGET_IMPLEMENTATION.md) - Party widget details
- [HOME_ASSISTANT_MEDIA_WIDGET.md](HOME_ASSISTANT_MEDIA_WIDGET.md) - Media widget setup
- [VACATION_WIDGET.md](VACATION_WIDGET.md) - Vacation widget details
- [SMART_MIRROR_GRID_POSITIONING.md](SMART_MIRROR_GRID_POSITIONING.md) - Grid layout system
- [README.md](README.md) - General Smart Mirror documentation
