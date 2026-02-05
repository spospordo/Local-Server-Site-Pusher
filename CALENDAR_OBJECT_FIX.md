# Calendar Widget Fix: [object Object] Bug Resolution

## Problem Statement

The calendar widget was displaying holiday events as `[object Object]` instead of showing proper event names like "President's Day", "Valentine's Day", etc.

### Screenshot of the Bug
From the original issue, events were showing as:

```
Mon, Feb 16  [object Object]
Tue, Feb 17  [object Object]
Tue, Feb 17  [object Object]
```

Instead of:
```
Mon, Feb 16  President's Day
Tue, Feb 17  Ramadan Begins
```

## Root Cause Analysis

### The Problem
The `node-ical` library (version 0.21.0) sometimes returns iCal event properties as **objects with a `val` property** instead of plain strings. This is particularly common with holiday calendars like:
- US Holidays from Google Calendar
- Islamic holidays
- Other international holiday calendars

### Example of the Data Structure

**Normal Event (string format):**
```javascript
event.summary = "Joshua tree"
```

**Holiday Event (object format):**
```javascript
event.summary = { val: "President's Day" }
event.description = { val: "Federal Holiday" }
```

### The Buggy Code
In `modules/smartmirror.js`, line 963 (before fix):

```javascript
upcomingEvents.push({
  title: event.summary || 'Untitled Event',  // ❌ This causes [object Object]
  location: event.location || '',
  description: event.description || ''
});
```

When `event.summary` is an object like `{ val: "President's Day" }`, JavaScript converts it to the string `"[object Object]"` when trying to display it.

## The Solution

### 1. Created Helper Function

Added `getICalStringValue()` function in `modules/smartmirror.js` (line 839):

```javascript
/**
 * Helper function to extract string value from iCal properties
 * node-ical can return properties as either strings or objects with a 'val' property
 * This is particularly common with holiday calendars
 */
function getICalStringValue(property) {
  if (!property) return '';
  if (typeof property === 'string') return property;
  if (typeof property === 'object' && property.val) return String(property.val);
  if (typeof property === 'object') {
    // Some implementations use 'value' instead of 'val'
    if (property.value !== undefined) return String(property.value);
    // If it's an object but we can't extract a value, return empty string to avoid [object Object]
    logger.warning(logger.categories.SMART_MIRROR, `Unexpected iCal property format: ${JSON.stringify(property)}`);
    return '';
  }
  return String(property);
}
```

### 2. Applied Fix to Event Parsing

Updated `modules/smartmirror.js`, line 981:

```javascript
upcomingEvents.push({
  title: getICalStringValue(event.summary) || 'Untitled Event',  // ✅ Now extracts correctly
  location: getICalStringValue(event.location) || '',
  description: getICalStringValue(event.description) || ''
  // ... other properties
});
```

## Testing & Verification

### Unit Tests
Created comprehensive unit tests in `/tmp/test-ical-parsing.js`:

**Test Results:**
```
✅ Test 1: Plain string - "President's Day"
✅ Test 2: Object with val property - { val: "Valentine's Day" }
✅ Test 3: Object with value property - { value: "Ramadan Begins" }
✅ Test 4: Null value - returns ""
✅ Test 5: Undefined value - returns ""
✅ Test 6: Empty string - returns ""
✅ Test 7: Number value - converts to "2026"
✅ Test 8: Object with val as number - { val: 123 } → "123"
✅ Test 9: Complex object - returns "" (prevents [object Object])

Results: 9 passed, 0 failed
```

### Integration Tests
Created integration test in `test-object-properties.js`:

**Test Events:**
```javascript
Event 1: Summary type: object { val: "President's Day" }
         ✅ Extracted title: "President's Day"

Event 2: Summary type: object { val: "Valentine's Day" }
         ✅ Extracted title: "Valentine's Day"

Event 3: Summary type: object { val: "Ramadan Begins" }
         ✅ Extracted title: "Ramadan Begins"

Event 4: Summary type: string "Joshua tree"
         ✅ Extracted title: "Joshua tree"

Event 5: Summary type: string "Ticket: 2026 Los Angeles Arts & Crafts Expo"
         ✅ Extracted title: "Ticket: 2026 Los Angeles Arts & Crafts Expo"
```

**Result:** ✅ All event properties extracted correctly. No "[object Object]" detected.

## Expected Behavior After Fix

### Before (Buggy):
```
Mon, Feb 16  [object Object]
Tue, Feb 17  [object Object]
Tue, Feb 17  [object Object]
```

### After (Fixed):
```
Mon, Feb 16  President's Day
             Federal Holiday

Tue, Feb 17  Ramadan Begins
             This date is approximate because it is based on a lunar calendar...

Thu, Feb 19  Ticket: 2026 Los Angeles Arts & Crafts Expo
```

## Benefits of This Fix

1. **Handles Multiple Formats**: Works with both string and object-type properties
2. **Backwards Compatible**: Existing calendars with string properties continue to work
3. **Holiday Calendar Support**: Now properly displays US Holidays, Islamic holidays, etc.
4. **Defensive Programming**: Returns empty string instead of [object Object] for unexpected formats
5. **Comprehensive**: Applied to all relevant properties (title, description, location)

## Files Modified

- `modules/smartmirror.js`:
  - Added `getICalStringValue()` helper function (lines 839-856)
  - Updated event parsing to use helper (line 981-985)

## Test Coverage

- ✅ Unit tests for helper function (9 test cases)
- ✅ Integration tests with simulated holiday events (5 test events)
- ✅ Verified handling of both string and object-type properties
- ✅ Confirmed no "[object Object]" appears in any scenario

## Impact

This fix resolves the calendar widget usability issue for users who:
- Use US Holidays calendar
- Use international holiday calendars (Islamic, Jewish, etc.)
- Subscribe to any calendar that uses object-type properties in iCal format

The calendar widget now displays all events with their proper, human-readable names.
