# Party Sub-Widget Menu Format Enhancement

## Overview
This document describes the enhancements made to the party sub-widget to improve the display of menu items based on the party phase (before vs during).

## Changes Implemented

### 1. Two-Column Responsive Layout
- **What**: Converted the content section from a single-column to a responsive two-column grid layout
- **How**: Applied CSS Grid with `repeat(auto-fit, minmax(250px, 1fr))`
- **Why**: Better space utilization on desktop screens while maintaining mobile compatibility
- **File**: `public/smart-mirror.html` line ~3092

```javascript
contentDiv.style.display = 'grid';
contentDiv.style.gridTemplateColumns = 'repeat(auto-fit, minmax(250px, 1fr))';
contentDiv.style.gap = '15px';
```

### 2. Menu Assignments Display (Before Party Phase)
- **What**: Show who is responsible for each menu item during the planning phase
- **When**: Displayed in "pre-party" phase (before party start time)
- **Display**:
  - Menu header: "🍽️ Menu & Assignments"
  - Menu item name (bold)
  - Assignee with icon: "👤 Person Name" (italic, smaller text)
  - Descriptions are **hidden**
- **File**: `public/smart-mirror.html` line ~3201

### 3. Menu Descriptions Display (During Party Phase)
- **What**: Show detailed descriptions of each menu item during the party
- **When**: Displayed in "during" phase (after party start time)
- **Display**:
  - Menu header: "🍽️ Menu"
  - Menu item name (bold)
  - Item description (smaller text)
  - Assignees are **hidden**
- **File**: `public/smart-mirror.html` line ~3201

### 4. Backward Compatibility
- **What**: Support both legacy and new menu item property names
- **Code**: `item.item || item.name` handles both formats
- **Why**: Ensures existing configurations continue to work

## Data Structure

Menu items are stored with the following properties:
```javascript
{
  id: 1,
  item: "Caesar Salad",              // Item name
  description: "Fresh romaine...",    // Detailed description
  assignee: "Alice"                   // Person responsible
}
```

## Phase Logic

The party widget has two distinct phases:

1. **Pre-Party Phase** (`phase: 'pre-party'`)
   - Starts 2 weeks before party date
   - Ends when party start time is reached
   - Focus: Planning and preparation
   - Shows: Tasks, menu assignments, events, invitees

2. **During Party Phase** (`phase: 'during'`)
   - Starts when party start time is reached
   - Lasts through the end of party day
   - Focus: Current party activities
   - Shows: Menu descriptions, events, invitees (no tasks)

## Visual Examples

### Before Party Format
```
🎉 Party in 2 days
📋 Party Planning

┌─────────────────────┬─────────────────────┐
│ ✓ To-Do Items       │ 🍽️ Menu & Assignments│
│ ☐ Clean room        │ Caesar Salad         │
│ ☑ Buy groceries     │ 👤 Alice             │
│                     │ Grilled Salmon       │
│ 📋 Events Schedule  │ 👤 Bob               │
│ 18:00 - Arrival     │ Chocolate Cake       │
│ 19:00 - Dinner      │ 👤 Charlie           │
└─────────────────────┴─────────────────────┘
```

### During Party Format
```
🎉 Party in Progress!
🎊 Enjoy the party!

┌─────────────────────┬─────────────────────┐
│ 📋 Events Schedule  │ 🍽️ Menu             │
│ 18:00 - Arrival     │ Caesar Salad         │
│ 19:00 - Dinner      │ Fresh romaine with   │
│                     │ homemade dressing    │
│ 👥 Guest List       │ Grilled Salmon       │
│ Coming:             │ Wild-caught salmon   │
│ ✓ John              │ with lemon butter    │
│ ✓ Jane              │                      │
└─────────────────────┴─────────────────────┘
```

## Responsive Behavior

The two-column layout automatically adapts:
- **Desktop/Tablet (≥500px)**: Two columns side-by-side
- **Mobile (<500px)**: Single column (stacked)

This is achieved through CSS Grid's `auto-fit` with minimum width of 250px.

## Testing

### Automated Tests
1. **test-party-widget-menu-format.js**: Validates code structure
   - Checks grid layout implementation
   - Verifies phase-based conditional rendering
   - Confirms backward compatibility

2. **test-party-menu-visual.js**: Tests rendering output
   - Simulates both phases
   - Validates HTML structure
   - Verifies correct display of assignees/descriptions

### Manual Testing Steps
1. Start server: `npm start`
2. Access admin: `http://localhost:3000/admin`
3. Go to Party > Scheduling tab
4. Add party with:
   - Date in the future (2-3 days)
   - Start time (e.g., 18:00)
   - Multiple menu items with descriptions and assignees
5. Enable party sub-widget in Smart Mirror settings
6. View smart mirror: `http://localhost:3000/smart-mirror`
7. **Before start time**: Verify assignments are shown
8. Change system time to after start time
9. **During party**: Verify descriptions are shown

## Files Modified

- `public/smart-mirror.html`: Updated `renderParty()` function

## Files Added

- `scripts/test-party-widget-menu-format.js`: Automated structure tests
- `scripts/test-party-menu-visual.js`: Automated rendering tests
- `public/test-party-menu-format.html`: Visual demo page

## Requirements Met

✅ **Clear separation between formats**: Different headers and content for each phase  
✅ **Menu assignments in "before" state**: Assignee displayed with 👤 icon  
✅ **Descriptions in "during" state**: Full descriptions shown for each item  
✅ **Two-column layout**: Responsive grid adapts to screen size  
✅ **Consistency with existing UI**: Uses same styling and patterns as other widgets  
✅ **Backward compatibility**: Handles both `item` and `name` properties  

## Security Notes

- No user input is rendered without sanitization
- All text content uses `textContent` (not `innerHTML`) where possible
- CodeQL security scan passed with 0 alerts

## Future Enhancements

Potential improvements for future releases:
- Allow customization of what displays in each phase
- Add dietary restriction icons/tags to menu items
- Support menu categories (appetizers, mains, desserts)
- Add quantity/serving size information
- Include preparation time estimates in before phase

## Support

For issues or questions about this enhancement:
1. Check if menu items have all required fields (item, description, assignee)
2. Verify party phase is calculated correctly based on start time
3. Test with browser console open to see any JavaScript errors
4. Review the smart mirror logs for party widget rendering issues
