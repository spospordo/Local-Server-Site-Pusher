# Smart Widget Display Modes - Visual Guide

## Overview
The Smart Widget supports four display modes, each optimized for different use cases. This guide provides a visual reference for understanding how each mode works.

## Display Modes Comparison

### 1. Cycle Mode (Original)
**Best for**: Sequential viewing of all content

```
┌─────────────────────────────────┐
│  Smart Widget                   │
├─────────────────────────────────┤
│                                 │
│   🌧️ Rain Forecast              │
│   Rain expected tomorrow        │
│   70% chance                    │
│                                 │
│   (Shows for 15 seconds)        │
└─────────────────────────────────┘
        ↓ (cycles to next)
┌─────────────────────────────────┐
│  Smart Widget                   │
├─────────────────────────────────┤
│                                 │
│   ✈️ Upcoming Vacation          │
│   Hawaii                        │
│   In 5 days                     │
│                                 │
│   (Shows for 10 seconds)        │
└─────────────────────────────────┘
        ↓ (cycles to next)
┌─────────────────────────────────┐
│  Smart Widget                   │
├─────────────────────────────────┤
│                                 │
│   🎉 Party in 3 days            │
│   [extensive content]           │
│                                 │
│   (Shows for 20 seconds)        │
└─────────────────────────────────┘
```

**Characteristics**:
- Shows one sub-widget at a time
- Cycles through all active sub-widgets
- Each widget displays for its configured `cycleTime`
- Good for focusing attention on one thing at a time

---

### 2. Simultaneous Mode
**Best for**: Viewing multiple items side-by-side

```
┌─────────────────────────────────────────────────────┐
│  Smart Widget                                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────┐    ┌──────────────────┐     │
│  │ 🌧️ Rain Forecast │    │ ✈️ Vacation      │     │
│  │ Tomorrow         │    │ Hawaii           │     │
│  │ 70% chance       │    │ In 5 days        │     │
│  └──────────────────┘    └──────────────────┘     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Characteristics**:
- Shows multiple sub-widgets at once in a grid
- Maximum number controlled by `simultaneousMax` setting
- All visible widgets remain static (no cycling)
- Good for comparing related information

---

### 3. Priority Mode
**Best for**: Showing only the most important item

```
┌─────────────────────────────────┐
│  Smart Widget                   │
├─────────────────────────────────┤
│                                 │
│   🌧️ Rain Forecast              │
│   (Priority 1 - Highest)        │
│                                 │
│   Rain expected tomorrow        │
│   70% chance                    │
│   Bring umbrella!               │
│                                 │
│   (Only this widget shows)      │
└─────────────────────────────────┘
```

**Characteristics**:
- Shows only the highest priority sub-widget with content
- Other sub-widgets are completely hidden
- Static display (no cycling)
- Good for critical alerts or single-focus displays

---

### 4. Adaptive Mode (NEW)
**Best for**: At-a-glance viewing with detailed content available

```
┌─────────────────────────────────────────────────────┐
│  Smart Widget                                       │
├─────────────────────────────────────────────────────┤
│  STACKED AREA (Small/Medium widgets)                │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🌧️ Rain Forecast                             │  │
│  │ Rain expected tomorrow - 70% chance          │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ ✈️ Upcoming Vacation                         │  │
│  │ Hawaii - In 5 days                           │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🎵 Now Playing                               │  │
│  │ Song Title - Artist Name                     │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  CYCLING AREA (Large widgets)                       │
│  ┌───────────────────────────────────────────────┐  │
│  │ 🎉 Party in 3 days                           │  │
│  │ ┌─────────────────┐ ┌─────────────────┐     │  │
│  │ │ Tasks: 8/10     │ │ Guests: 15      │     │  │
│  │ │ Menu: 12 items  │ │ Events: 5       │     │  │
│  │ └─────────────────┘ └─────────────────┘     │  │
│  │ Weather: Sunny, 75°F                         │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Characteristics**:
- **Top section**: Small/medium widgets stacked as horizontal tabs
  - All visible simultaneously
  - Full width for easy reading
  - Scrollable if content exceeds available space
- **Bottom section**: Large widgets cycle
  - Shows one at a time
  - Uses individual cycle times
  - Takes up remaining space
- Combines benefits of simultaneous viewing and cycling
- Adapts based on content complexity

---

## Adaptive Mode - Content Size Examples

### Small Content (Always Stacked)
```
┌───────────────────────────────────────┐
│ 🌧️ Rain Forecast                     │
│ Tomorrow - 70% chance                │
└───────────────────────────────────────┘
  Icon + 1-2 lines of text
  Classification: SMALL

┌───────────────────────────────────────┐
│ 🎵 Now Playing                       │
│ Song Title - Artist Name             │
└───────────────────────────────────────┘
  Media player status
  Classification: SMALL
```

### Medium Content (Stackable with Medium Threshold)
```
┌───────────────────────────────────────┐
│ ✈️ Upcoming Vacation                 │
│ Hawaii                               │
│ In 5 days (Jan 25-30, 2026)         │
│ ✈️ Flight AA123                     │
└───────────────────────────────────────┘
  Multiple lines, some detail
  Classification: MEDIUM

┌───────────────────────────────────────┐
│ 🎉 Party in 10 days                  │
│ Jan 25, 2026 at 18:00               │
│ Guests: 15 coming                   │
└───────────────────────────────────────┘
  Party with minimal data
  Classification: MEDIUM
```

### Large Content (Always Cycles)
```
┌───────────────────────────────────────────┐
│ 🎉 Party Today!                          │
│ Dec 25, 2024 at 18:00                   │
│ ┌─────────────────────────────────────┐ │
│ │ 🌤️ Weather: Sunny, 75°F            │ │
│ │ 68°F / 75°F · 0% precip             │ │
│ └─────────────────────────────────────┘ │
│ ┌──────────────┐ ┌──────────────────┐  │
│ │ ✓ Tasks      │ │ 👥 Invitees      │  │
│ │ • Decorate   │ │ • John (coming)  │  │
│ │ • Prepare    │ │ • Mary (coming)  │  │
│ │ • Setup      │ │ • Bob (pending)  │  │
│ └──────────────┘ └──────────────────┘  │
│ ┌─────────────────────────────────────┐ │
│ │ 🍕 Menu (12 items)                  │ │
│ │ 📅 Events (5 scheduled)             │ │
│ └─────────────────────────────────────┘ │
└───────────────────────────────────────────┘
  Extensive content with multiple sections
  Classification: LARGE
```

---

## Adaptive Stack Threshold Settings

### Small Threshold
**Stacks**: Only small widgets (rain, media)
**Cycles**: Medium and large widgets (vacation, party)

```
STACKED:
  🌧️ Rain Forecast
  🎵 Now Playing

CYCLING:
  ✈️ Vacation ⟳ 🎉 Party
```

### Medium Threshold (Default)
**Stacks**: Small and medium widgets (rain, media, vacation, minimal party)
**Cycles**: Large widgets (party with extensive data)

```
STACKED:
  🌧️ Rain Forecast
  🎵 Now Playing
  ✈️ Vacation

CYCLING:
  🎉 Party (if extensive)
```

### Large Threshold
**Stacks**: Most widgets (rain, media, vacation, party with moderate data)
**Cycles**: Only very large widgets (party with all sections populated)

```
STACKED:
  🌧️ Rain Forecast
  🎵 Now Playing
  ✈️ Vacation
  🎉 Party (moderate)

CYCLING:
  🎉 Party (only if very extensive)
```

---

## Special Behaviors

### Party Day Priority (All Modes)
When it's the day of the party (`daysUntil === 0`), the party widget takes over:

```
┌─────────────────────────────────┐
│  Smart Widget                   │
├─────────────────────────────────┤
│                                 │
│   🎉 PARTY TODAY!               │
│   [Full party content]          │
│   [All sections visible]        │
│                                 │
│   (No other widgets shown)      │
│   (No cycling occurs)           │
└─────────────────────────────────┘
```

This applies to **all display modes** including adaptive mode.

### Empty State (All Modes)
When no sub-widgets have active content:

```
┌─────────────────────────────────┐
│  Smart Widget                   │
├─────────────────────────────────┤
│                                 │
│          📱                     │
│   No active notifications       │
│                                 │
└─────────────────────────────────┘
```

---

## Use Case Recommendations

| Use Case | Recommended Mode | Reason |
|----------|-----------------|---------|
| **Daily dashboard** | Adaptive | Best balance of at-a-glance info and detail |
| **Critical alerts only** | Priority | Focus on most important item |
| **Information kiosk** | Cycle | Ensures all content is seen |
| **Status monitor** | Simultaneous | See multiple statuses at once |
| **Home entrance display** | Adaptive | Quick view of today's info |
| **Office dashboard** | Adaptive or Simultaneous | Team visibility |
| **Personal mirror** | Adaptive | Most flexible |

---

## Configuration Examples

### Example 1: Balanced Home Dashboard
```json
{
  "displayMode": "adaptive",
  "adaptiveStackThreshold": "medium",
  "subWidgets": [
    {"type": "rainForecast", "enabled": true, "priority": 1},
    {"type": "upcomingVacation", "enabled": true, "priority": 2},
    {"type": "homeAssistantMedia", "enabled": true, "priority": 3},
    {"type": "party", "enabled": true, "priority": 4}
  ]
}
```
**Result**: Rain, media, and small vacations stack; party cycles if extensive.

### Example 2: Quick Glance Only
```json
{
  "displayMode": "adaptive",
  "adaptiveStackThreshold": "large",
  "subWidgets": [
    {"type": "rainForecast", "enabled": true, "priority": 1},
    {"type": "upcomingVacation", "enabled": true, "priority": 2},
    {"type": "party", "enabled": true, "priority": 3}
  ]
}
```
**Result**: All widgets stack unless party has extensive data.

### Example 3: Focus Mode
```json
{
  "displayMode": "priority",
  "subWidgets": [
    {"type": "rainForecast", "enabled": true, "priority": 1},
    {"type": "party", "enabled": true, "priority": 2}
  ]
}
```
**Result**: Shows only rain forecast (or party if rain not in forecast).

---

## Migration Guide

### From Cycle Mode to Adaptive Mode
1. Go to **Admin → Server → Smart Mirror → Smart Widget**
2. Change **Display Mode** from "Cycle" to "Adaptive"
3. Set **Adaptive Stack Threshold** to "Medium" (recommended starting point)
4. Save configuration
5. Refresh Smart Mirror page

**What changes**:
- Small/medium widgets now visible simultaneously at top
- Large widgets still cycle at bottom
- Information is more accessible at a glance

### From Simultaneous Mode to Adaptive Mode
1. Change **Display Mode** to "Adaptive"
2. Set **Adaptive Stack Threshold** based on your `simultaneousMax`:
   - Was showing 1-2 items? Use "Small" threshold
   - Was showing 3-4 items? Use "Medium" threshold
3. Large content will now cycle instead of being cut off

**What changes**:
- Large widgets get full attention through cycling
- Small widgets remain visible at all times
- Better use of available space

---

## Troubleshooting

### Issue: All widgets are cycling (none stacked)
**Cause**: All widgets are classified as larger than threshold
**Solution**: Increase threshold to "Medium" or "Large"

### Issue: Too many widgets stacked (hard to see)
**Cause**: Threshold too high for available space
**Solution**: Decrease threshold to "Small" or "Medium"

### Issue: Party widget always cycles even with minimal data
**Cause**: Party widget defaults to "Medium" classification
**Solution**: This is expected behavior; party widget designed for detail

### Issue: Widgets not updating
**Cause**: Refresh interval or data source issue
**Solution**: Check individual sub-widget configurations (API keys, etc.)

---

## Future Enhancements

Planned improvements for adaptive mode:
1. **Smart resizing**: Automatically adjust based on screen size
2. **Drag-and-drop**: Let users manually arrange stacked widgets
3. **Collapse/expand**: Minimize stacked widgets to save space
4. **Animations**: Smooth transitions between layout changes
5. **Custom rules**: Per-widget size overrides in admin UI

---

## Related Documentation

- [SMART_WIDGET.md](SMART_WIDGET.md) - Complete Smart Widget documentation
- [ADAPTIVE_MODE_IMPLEMENTATION.md](ADAPTIVE_MODE_IMPLEMENTATION.md) - Technical implementation details
- [README.md](README.md) - Project overview and setup
