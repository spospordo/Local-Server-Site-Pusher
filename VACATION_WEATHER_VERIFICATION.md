# Manual Verification Checklist for Vacation Sub-Widget Weather Display

## Pre-requisites
- [ ] Server is running (`npm start`)
- [ ] Admin can log in to dashboard
- [ ] At least one upcoming vacation is configured in House > Vacation

## Configuration Verification

### 1. Enable Smart Widget
- [ ] Navigate to Admin Dashboard > Smart Mirror > Smart Widget
- [ ] Set `enabled` to `true`
- [ ] Save configuration

### 2. Enable Vacation Sub-Widget
- [ ] In Smart Widget settings, find `subWidgets` array
- [ ] Locate vacation sub-widget entry: `{ type: 'upcomingVacation', enabled: true }`
- [ ] Ensure `enabled` is `true`
- [ ] Save configuration

### 3. Configure Weather API Key
Choose one of these options:
- [ ] **Option A:** Set API key in Smart Widget settings (`apiKey` field)
- [ ] **Option B:** Use existing weather widget API key (no action needed)
- [ ] **Option C:** Use existing forecast widget API key (no action needed)

### 4. Add and Validate Vacation
- [ ] Navigate to Admin Dashboard > House > Vacation
- [ ] Click "➕ Add Vacation Date"
- [ ] Enter destination (e.g., "Paris, FR", "New York", "Tokyo, JP")
- [ ] Click "🔍 Test Location for Weather" button
- [ ] Verify location returns weather data (green success box)
- [ ] Enter start and end dates (upcoming dates)
- [ ] Save vacation

## Visual Verification

### 5. View Smart Mirror Display
- [ ] Navigate to `/smart-mirror.html` or kiosk page
- [ ] Smart Widget should be visible
- [ ] Vacation sub-widget should cycle into view

### 6. Verify Weather Display
For each vacation displayed, check:
- [ ] Destination name is shown
- [ ] "In X days" countdown is shown
- [ ] Start date is displayed
- [ ] **Weather section is present** below the date
- [ ] Weather icon is displayed (emoji like ☀️, ☁️, 🌧️, etc.)
- [ ] Temperature is shown with high/low (e.g., "75°/65°F" or "24°C")
- [ ] Weather condition text is shown (e.g., "Partly Cloudy")
- [ ] If fallback, "Current weather" note is shown

### Expected Visual Layout
```
✈️
Paris, FR
In 26 days
Mar 15, 2026
┌─────────────────────┐
│   ☁️  58°/45°F     │
│   Partly Cloudy     │
└─────────────────────┘
[Optional flight info]
```

## Server Log Verification

### 7. Check Weather Fetch Logging
- [ ] Open server console/logs
- [ ] Trigger Smart Widget refresh (wait for cycle or reload page)
- [ ] Look for log entries:

**Success Case:**
```
[SMART_MIRROR] Fetching weather for vacation destination: Paris, FR
[SMART_MIRROR] Weather forecast fetched successfully for Paris, FR
```

**Fallback Case:**
```
[SMART_MIRROR] Fetching weather for vacation destination: Paris, FR
[SMART_MIRROR] Forecast unavailable for Paris, FR, trying current weather
[SMART_MIRROR] Current weather fetched as fallback for Paris, FR
```

**Error Case:**
```
[SMART_MIRROR] Failed to fetch weather for vacation destination: InvalidCity
```

**No API Key:**
```
[SMART_MIRROR] Vacation weather skipped: API key not configured or destination missing
```

## Automated Testing

### 8. Run Diagnostic Test Script
```bash
node scripts/test-vacation-weather-display.js
```

Expected output:
- [ ] Shows vacation sub-widget data with weather fields
- [ ] Confirms API key is configured
- [ ] Shows upcoming vacation destinations
- [ ] Provides troubleshooting guidance if issues found

## Edge Cases to Test

### 9. Test Error Handling
- [ ] **Invalid location:** Add vacation with invalid destination (e.g., "ZZZZ Invalid")
  - Expected: Vacation displays without weather section, server logs warning
- [ ] **No API key:** Remove all API keys temporarily
  - Expected: Vacation displays without weather section, logs "API key not configured"
- [ ] **No vacations:** Remove all upcoming vacations
  - Expected: Vacation sub-widget doesn't appear or shows empty state
- [ ] **Past vacation:** Add vacation with past dates
  - Expected: Vacation not shown in sub-widget (filtered out)

### 10. Test Multiple Vacations
- [ ] Add 3+ upcoming vacations with different destinations
- [ ] Verify weather displays for each vacation shown (up to 3)
- [ ] Verify each has its own weather data (not shared)

## Troubleshooting

If weather is NOT displaying:
1. Check API key configuration (Smart Widget > Weather > Forecast)
2. Validate destination using "Test Location" button
3. Review server logs for errors
4. Run diagnostic script: `node scripts/test-vacation-weather-display.js`
5. Refer to documentation: `VACATION_WIDGET.md` troubleshooting section

## Documentation Verification

### 11. Verify Documentation
- [ ] VACATION_WIDGET.md includes troubleshooting section
- [ ] VACATION_WEATHER_FIX.md documents the complete implementation
- [ ] Test script exists and is executable
- [ ] Server logs are clear and actionable

## Sign-Off

- [ ] All checks passed
- [ ] Weather displays correctly for validated locations
- [ ] Error handling works for edge cases
- [ ] Documentation is complete and accurate
- [ ] Implementation meets all acceptance criteria

**Tested by:** _________________  
**Date:** _________________  
**Notes:** _________________
