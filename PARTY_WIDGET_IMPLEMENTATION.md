# Party Sub-Widget Implementation

## Overview
The Party Sub-Widget is a feature within the Smart Mirror's Smart Widget system that displays upcoming party information. It integrates with the existing Party > Scheduling tab to provide a compact, glanceable display of party details on the smart mirror.

## Features

### Display Information
The party sub-widget shows:
- **Party Countdown**: Days until the party (or "Party Today!" / "Party Tomorrow")
- **Date & Time**: Party date and start time
- **Task Status**: Completed tasks vs. total tasks (e.g., "Tasks: 3/5 complete")
- **Guest List**: RSVP summary showing:
  - Number of guests coming
  - Number of guests with pending RSVP
  - Number of guests not coming
- **Menu**: Count of menu items
- **Events**: Count of scheduled party events

### Visual Design
- 🎉 Party emoji icon for instant recognition
- Color-coded countdown (green for "today")
- Compact layout optimized for smart mirror display
- Status icons (✓, 👥, 🍽️, 📋) for quick scanning
- Task completion indicated by color (green = 100%, yellow = partial)

## Architecture

### Server-Side Implementation
**File**: `server.js`
**Location**: `/api/smart-mirror/smart-widget` endpoint

The party sub-widget is implemented as a case in the smart widget API:

```javascript
case 'party':
  // Reads from config.partyScheduling
  // Only shows upcoming parties (today or future)
  // Aggregates task, invitee, menu, and event data
```

**Data Flow**:
1. Checks if party date is set in `config.partyScheduling`
2. Compares party date with current date
3. Calculates days until party
4. Counts task completion status
5. Aggregates RSVP status
6. Returns structured data for display

### Client-Side Implementation
**File**: `public/smart-mirror.html`
**Function**: `renderParty(data)`

The rendering function creates a DOM structure with:
- Header section (icon, title, countdown)
- Date/time display
- Content section with status indicators

**Integration Point**: Added to `renderSubWidget()` switch statement to handle 'party' type sub-widgets.

### Admin Configuration
**File**: `admin/dashboard.html`
**Location**: Smart Mirror Settings > Smart Widget

Configuration options:
- **Enabled**: Toggle party sub-widget on/off
- **Priority**: Numeric priority (default: 4)
  - Lower numbers = higher priority
  - Determines display order in cycle/priority modes

## Usage

### For Administrators

#### Step 1: Configure Party Data
1. Navigate to Admin Dashboard
2. Click on **Party** tab
3. Select **Scheduling** sub-tab
4. Enter party details:
   - Date and time
   - Invitees with RSVP status
   - Menu items
   - Pre-party tasks
   - Event schedule

#### Step 2: Enable Party Sub-Widget
1. Navigate to **Smart Mirror** tab
2. Scroll to **Smart Widget** section
3. Find **🎉 Party Sub-Widget**
4. Set **Enabled** to "Yes"
5. Optionally adjust **Priority** (default: 4)
6. Click **Save Configuration**

#### Step 3: View on Smart Mirror
1. Access smart mirror at `/smart-mirror`
2. Party sub-widget will appear in Smart Widget
3. Display follows Smart Widget's display mode:
   - **Cycle**: Rotates through sub-widgets
   - **Simultaneous**: Shows multiple at once
   - **Priority**: Shows highest priority with content

### For End Users
The party sub-widget is read-only on the smart mirror display. All party information must be managed through the admin dashboard.

## Smart Widget Display Modes

### Cycle Mode
Party sub-widget appears in rotation with other enabled sub-widgets (rain forecast, vacation, media). Cycle speed configurable in admin settings.

### Simultaneous Mode
Party sub-widget can display alongside other sub-widgets (up to simultaneousMax setting).

### Priority Mode
If party has the highest priority and content available, it will be the only sub-widget shown.

## Data Requirements

### Minimum Requirements
For the party sub-widget to display:
- Party date must be set in Party > Scheduling tab
- Party date must be today or in the future
- Party sub-widget must be enabled in Smart Mirror settings

### Optional Data
All other data (tasks, invitees, menu, events) is optional. The widget will display whatever data is available.

## Layout Integration

The party sub-widget integrates seamlessly with the existing Smart Widget system:
- Inherits positioning from Smart Widget grid settings
- Respects widget sizing constraints
- Works with both portrait and landscape orientations
- Compatible with grid layout editor

## Testing

### Validation Script
**File**: `scripts/test-party-widget.js`

Run comprehensive integration tests:
```bash
node scripts/test-party-widget.js
```

Tests verify:
- Server-side party case implementation
- Client-side renderParty function
- Admin configuration UI presence
- All data elements are properly referenced

### Manual Testing
1. Create test party data with date, tasks, invitees, menu, events
2. Enable party sub-widget in settings
3. View smart mirror display
4. Verify all information displays correctly
5. Test countdown changes (use dates: today, tomorrow, future)
6. Test with partial data (e.g., no tasks, no menu)
7. Test with past date (should not display)

## Technical Details

### Date Handling
- **Server**: Normalizes dates to midnight local time for accurate comparison
- **Client**: Parses dates component-wise to avoid timezone issues
- **Format**: Expects YYYY-MM-DD format from admin input

### Priority System
Default priorities:
1. Rain Forecast: 1
2. Upcoming Vacation: 2
3. Home Assistant Media: 3
4. **Party**: 4 (can be adjusted)

Lower priority number = higher display priority.

### Performance
- Party data cached in config file
- No external API calls required
- Lightweight rendering (< 1ms typically)
- Updates on normal smart widget refresh interval

## Security

### Access Control
- Party data editing: **Admin only** (requires authentication)
- Party data viewing: **Public** (on smart mirror display)
- API endpoint: Requires authentication for modifications

### Data Validation
- Date format validation on admin input
- Numeric validation for priority settings
- Type checking for all data structures

### CodeQL Analysis
- ✅ No security vulnerabilities detected
- ✅ Passes all JavaScript security checks

## Future Enhancements

Possible future improvements:
- Weather integration for party date
- Countdown with hours/minutes for same-day parties
- Guest photo thumbnails
- Menu item details in expanded view
- Event timeline visualization
- Party theme/mood settings
- Integration with calendar systems

## Troubleshooting

### Party Widget Not Showing
1. Verify party date is set in Party > Scheduling
2. Check party date is not in the past
3. Confirm party sub-widget is enabled in settings
4. Check Smart Widget itself is enabled
5. Review browser console for JavaScript errors

### Incorrect Countdown
1. Verify server timezone is correct
2. Check party date format (YYYY-MM-DD)
3. Ensure date is entered correctly in admin UI

### Missing Information
1. All party data except date is optional
2. Check data was saved in Party > Scheduling tab
3. Refresh smart mirror display
4. Review server logs for data fetch errors

## Support

For issues or questions:
1. Check server logs for errors
2. Run test script: `node scripts/test-party-widget.js`
3. Verify configuration in admin dashboard
4. Check browser console for client-side errors

## Credits

Implemented as part of the Smart Mirror Smart Widget system. Follows established patterns from existing sub-widgets (rain forecast, vacation, media).
