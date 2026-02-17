# Smart Widget Adaptive Mode Implementation

## Overview
This document describes the implementation of the adaptive display mode for the Smart Widget, which was added to address the need for better information presentation by stacking moderate content while maintaining cycling for large content.

## Problem Statement
The Smart Widget previously cycled between all sub-widget views, making it difficult to view multiple pieces of information at a glance. Most sub-widget content is limited and could be presented more effectively by displaying multiple items simultaneously.

## Solution
Implemented an "adaptive" display mode that:
1. Displays small/medium sub-widgets as horizontally long tabs stacked vertically
2. Cycles large sub-widgets (with extensive content) separately
3. Automatically classifies widget content size based on data complexity
4. Maintains existing party day priority behavior

## Implementation Details

### Backend Changes

#### Content Size Detection (`server.js`)
Added `estimateContentSize()` function that classifies sub-widgets:

```javascript
function estimateContentSize(subWidgetData) {
  // Returns 'small', 'medium', or 'large' based on:
  // - Rain forecast: always 'small' (icon + text)
  // - Vacation: depends on number of vacations and flight info
  // - Media: always 'small' (artwork + metadata)
  // - Party: 'medium' or 'large' based on number of content sections
}
```

Classification logic:
- **Small**: Compact widgets (rain forecast, single media player)
- **Medium**: Moderate content (1-2 vacations, party with 1-2 sections)
- **Large**: Extensive content (party with 3+ sections: weather, tasks, invitees, menu, events)

#### API Response Enhancement
Added two new fields to `/api/smart-mirror/smart-widget`:
- `contentSize`: Added to each sub-widget in the response
- `adaptiveStackThreshold`: Configuration value from settings

#### Configuration (`modules/smartmirror.js`)
Updated default Smart Widget configuration:
```javascript
displayMode: 'cycle', // Now supports 'adaptive'
adaptiveStackThreshold: 'medium' // 'small', 'medium', or 'large'
```

### Frontend Changes (`public/smart-mirror.html`)

#### Adaptive Layout Rendering
Added new display mode logic in `updateSmartWidget()`:

1. **Separate widgets by size**:
   - Compare each widget's `contentSize` against `adaptiveStackThreshold`
   - Widgets at or below threshold → stackable
   - Widgets above threshold → cyclable

2. **Render stacked widgets**:
   - Create vertical flex container
   - Render each stackable widget as full-width tab
   - Enable vertical scrolling if needed

3. **Handle cyclable widgets**:
   - If present with stackable widgets: create cycle container below stack
   - If only cyclable widgets: behave like normal cycle mode
   - Maintain party day priority (party takes over entire display)

#### Styling
Stacked widgets use:
- `width: 100%` (horizontally long tabs)
- `flexDirection: column` with `gap: 15px` (vertical stacking)
- `overflowY: auto` and `maxHeight: 100%` (scrollable if needed)

### Admin UI Changes (`admin/dashboard.html`)

#### Display Mode Dropdown
Added fourth option:
```html
<option value="adaptive">Adaptive (stack small/medium, cycle large)</option>
```

#### Adaptive Stack Threshold Selector
New configuration field:
```html
<select id="smartWidgetAdaptiveThreshold">
  <option value="small">Small (stack only small widgets)</option>
  <option value="medium">Medium (stack small & medium widgets)</option>
  <option value="large">Large (stack all except very large)</option>
</select>
```

#### Help Text
Added explanation:
> "Adaptive Mode: Small/medium widgets (rain, vacation, media) display as horizontally long tabs stacked vertically. Large widgets (party with extensive content) cycle separately."

### Documentation Updates (`SMART_WIDGET.md`)

Added comprehensive sections:
1. **Core Capabilities**: Listed adaptive mode as a display option
2. **Adaptive Mode Details**: Full explanation of behavior
3. **Content Size Detection**: Classification criteria
4. **Stack Threshold Configuration**: How to adjust the threshold
5. **Layout Behavior**: Stacking and cycling logic
6. **Responsive Design**: Scrolling and overflow handling

## Usage Examples

### Configuration via Admin UI
1. Navigate to **Admin → Server → Smart Mirror → Smart Widget**
2. Set **Display Mode** to "Adaptive"
3. Choose **Adaptive Stack Threshold**:
   - **Small**: Only rain and media stack; vacation and party cycle
   - **Medium** (default): Rain, media, and small vacations stack; party cycles
   - **Large**: Most widgets stack; only very large party widgets cycle

### API Response Example
```json
{
  "success": true,
  "displayMode": "adaptive",
  "adaptiveStackThreshold": "medium",
  "subWidgets": [
    {
      "type": "rainForecast",
      "contentSize": "small",
      "priority": 1,
      "hasContent": true,
      "data": { "hasRain": true, "rainDays": [...] }
    },
    {
      "type": "party",
      "contentSize": "large",
      "priority": 4,
      "hasContent": true,
      "data": { "weather": {...}, "tasks": {...}, "invitees": {...} }
    }
  ]
}
```

## Behavior Scenarios

### Scenario 1: All Small/Medium Widgets
**Input**: Rain forecast (small), vacation (medium), media (small)
**Threshold**: Medium
**Result**: All three widgets stacked vertically, no cycling

### Scenario 2: Mixed Sizes
**Input**: Rain (small), vacation (medium), party with full data (large)
**Threshold**: Medium
**Result**: Rain and vacation stacked at top; party cycles below

### Scenario 3: Party Day Priority
**Input**: Multiple widgets including party (on party day)
**Threshold**: Any
**Result**: Only party widget displayed (no stacking, no cycling)

### Scenario 4: Only Large Widgets
**Input**: Party with extensive content (large)
**Threshold**: Medium
**Result**: Behaves like normal cycle mode (single widget cycling)

## Testing

### Tested Scenarios
- ✅ Server starts successfully with adaptive mode configuration
- ✅ Admin UI displays new options correctly
- ✅ Configuration saves and loads properly
- ✅ API returns `contentSize` and `adaptiveStackThreshold` fields
- ✅ Smart Mirror page renders without errors
- ✅ No security vulnerabilities (CodeQL scan passed)

### Manual Testing Steps
1. Configure Smart Widget with adaptive mode
2. Enable multiple sub-widgets (rain, vacation, media, party)
3. Add test data for each sub-widget type
4. Verify stacking behavior for small/medium widgets
5. Verify cycling behavior for large widgets
6. Test party day priority override

## Backward Compatibility

The implementation is fully backward compatible:
- Default display mode remains `'cycle'`
- Existing configurations continue to work
- New `adaptiveStackThreshold` field has sensible default (`'medium'`)
- If `contentSize` is missing from API, defaults to `'medium'`

## Future Enhancements

Potential improvements for future versions:
1. **Dynamic threshold adjustment**: Auto-adjust based on available screen space
2. **Per-widget override**: Allow manual size classification in admin UI
3. **Animation**: Smooth transitions when switching between stacked and cycled views
4. **Collapsible sections**: Allow users to collapse stacked widgets to save space
5. **Custom layouts**: Let users define custom stacking/cycling rules

## Files Modified

### Backend
- `server.js`: Added `estimateContentSize()` function, updated API endpoint
- `modules/smartmirror.js`: Added `adaptiveStackThreshold` configuration

### Frontend
- `public/smart-mirror.html`: Added adaptive mode rendering logic
- `admin/dashboard.html`: Added UI controls for adaptive mode

### Documentation
- `SMART_WIDGET.md`: Added comprehensive adaptive mode documentation
- `ADAPTIVE_MODE_IMPLEMENTATION.md`: This document

## Conclusion

The adaptive display mode successfully addresses the original issue by:
1. Providing at-a-glance viewing of multiple moderate-sized widgets
2. Maintaining cycling for large content that needs full attention
3. Offering configurable thresholds to adjust behavior
4. Preserving existing functionality and party day priority
5. Following established coding patterns and conventions

The implementation is production-ready, tested, and documented.
