# Calendar Event Filters - Keyword-Based Event Modification

## Overview

The Calendar Event Filters feature allows administrators to define keyword-based rules that automatically filter, hide, or modify calendar events displayed in the Smart Mirror calendar widget. This is useful for:

- **Privacy**: Hide sensitive personal appointments when the mirror is in a shared space
- **Focus**: Remove work-related events during personal time or vice versa
- **Simplification**: Replace detailed event descriptions with generic placeholders
- **Customization**: Tailor calendar display based on context or audience

## Features

### Event Actions

1. **Hide Events**: Completely remove events from the calendar display when keywords match
2. **Replace Content**: Replace event titles and/or descriptions with custom text while keeping the event visible

### Rule Configuration

- **Multiple Rules**: Create as many filter rules as needed
- **Keyword Matching**: Case-insensitive matching in event title and description
- **Priority**: Rules are applied in order; hide actions take precedence
- **Universal Application**: Filters apply to all connected calendar feeds

## Admin Configuration

### Accessing the Feature

1. Navigate to **Admin Dashboard** → **Server** → **Smart Mirror**
2. Locate the **🔍 Calendar Event Filters (Keyword-Based)** section
3. Click to expand the section

### Enabling Filters

1. Check the **Enable Event Filtering** checkbox
2. The filter configuration panel will appear

### Creating Filter Rules

Click **➕ Add Filter Rule** to create a new rule. Each rule has:

#### Keywords
- Enter one or more keywords separated by commas
- Example: `work, meeting, office, presentation`
- Matching is case-insensitive
- Events matching ANY keyword will trigger the rule

#### Action
Choose one of two actions:

**Hide Event**
- Events matching the keywords will not appear in the calendar
- Use for completely removing unwanted events

**Replace Title/Description**
- Modify the event's display text
- Optional fields:
  - **Replacement Title**: New title to display (leave blank to keep original)
  - **Replacement Description**: New description to display (leave blank to keep original)

### Example Configurations

#### Example 1: Hide Work Events
```
Keywords: work, meeting, conference, office
Action: Hide Event
```
Result: Any event with these keywords in the title or description will be hidden.

#### Example 2: Make Private Events Generic
```
Keywords: personal, private, doctor, therapy, counseling
Action: Replace Title/Description
Replacement Title: Personal Appointment
Replacement Description: (blank)
```
Result: Events with these keywords will display as "Personal Appointment" with no description.

#### Example 3: Multiple Rules
```
Rule 1:
  Keywords: work, business
  Action: Hide Event

Rule 2:
  Keywords: birthday, party
  Action: Replace Title/Description
  Replacement Title: Celebration
  Replacement Description: Special event
```
Result: Work events are hidden, while birthday/party events are renamed to "Celebration".

## Technical Details

### Configuration Structure

The filter configuration is stored in the Smart Mirror config as:

```json
{
  "calendarEventFilters": {
    "enabled": true,
    "rules": [
      {
        "id": "rule-123456789",
        "keywords": ["work", "meeting"],
        "action": "hide"
      },
      {
        "id": "rule-987654321",
        "keywords": ["private"],
        "action": "replace",
        "replacementTitle": "Personal Event",
        "replacementDescription": ""
      }
    ]
  }
}
```

### Filter Application

Filters are applied:
1. **Server-side** during event fetching from calendar feeds
2. **After parsing** iCal data but before caching
3. **Before limiting** to the 10 most recent events

This ensures:
- Filtered events don't consume API quota
- Performance is optimized (filtering happens once, then cached)
- Hidden events don't count toward the 10-event display limit

### Matching Logic

For each event:
1. Convert event title and description to lowercase
2. Check each filter rule in order
3. For each rule, check if ANY keyword matches (OR logic)
4. If match found:
   - For "hide" action: skip the event entirely
   - For "replace" action: modify title/description as specified
5. Continue checking remaining rules unless event was hidden

### Performance Considerations

- Filtering adds minimal overhead (regex-free string matching)
- Results are cached with calendar data (default: 10 minutes)
- No additional API calls or network requests

## Use Cases

### Home Display
Hide work events when mirror is in home mode:
```
Keywords: work, office, client, deadline, project
Action: Hide Event
```

### Public/Shared Space
Make all events generic when mirror is in a lobby or shared area:
```
Keywords: (leave blank or use catch-all like: meeting, appointment, event)
Action: Replace Title/Description
Replacement Title: Busy
Replacement Description: (blank)
```

### Kids' Calendar
Filter out adult-only events:
```
Keywords: bills, taxes, finance, adult, private
Action: Hide Event
```

### Work Display
Hide personal appointments during work hours:
```
Keywords: personal, family, doctor, dentist, gym
Action: Hide Event
```

## Testing the Feature

After configuring filters:

1. **Save Configuration**: Click "Save Smart Mirror Configuration"
2. **Refresh Calendar Cache**: Click "🔄 Refresh Cache Now" in the Calendar Widget section
3. **View Calendar**: Navigate to `/smart-mirror` or `/smart-mirror-l`
4. **Verify**: Check that events are filtered as expected

## Troubleshooting

### Filters Not Working
- Verify "Enable Event Filtering" is checked
- Check that keywords match your event titles/descriptions
- Remember matching is case-insensitive
- Try refreshing the calendar cache manually

### Too Many Events Hidden
- Review your keywords - they might be too broad
- Consider using "replace" instead of "hide" for some rules
- Check the order of rules (hide rules take precedence)

### Events Still Showing
- Ensure keywords exactly match words in event title/description
- Keywords must be substrings (partial matching works)
- Check for typos in keywords
- Wait for cache to expire or manually refresh

## Security and Privacy

- Filters are applied server-side, so calendar providers don't know about filtering
- Original event data is not modified in the source calendar
- Filters only affect display in the Smart Mirror, not the actual calendar
- Configuration is stored encrypted in the Smart Mirror config file

## Future Enhancements

Potential improvements for future versions:
- Regular expression support for advanced matching
- Time-based rules (filter differently based on time of day)
- Location-based filtering
- Import/export filter rule sets
- Filter analytics (show how many events were filtered)

## Related Documentation

- [Smart Mirror Configuration Guide](SMART_MIRROR_GRID_POSITIONING.md)
- [Calendar Widget Setup](CALENDAR_CACHING.md)
- [Calendar Object Fix](CALENDAR_OBJECT_FIX.md)
