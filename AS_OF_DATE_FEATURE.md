# As Of Date Feature for Account Screenshot Uploads

## Overview
This feature allows admins to specify an 'As Of' date when uploading account screenshots on the Finance account page. This enables accurate historical record-keeping and prevents accidental overwriting of current balances when uploading historical data.

## Implementation Summary

### User Interface Changes (admin/dashboard.html)

#### New Date Input Field
Added a new required date input field labeled "As Of Date *" in the screenshot upload form:
- **Location**: Between the file input and upload button
- **Element ID**: `screenshotAsOfDate`
- **Attributes**:
  - `type="date"` - HTML5 date picker
  - `required` - Field is mandatory
  - Default value: Today's date (set on page load)
  - Max value: Today's date (prevents future dates)
- **Help text**: "The date these account balances represent. Defaults to today. Cannot select future dates."

#### JavaScript Initialization
Added initialization code in DOMContentLoaded event handler to:
- Set the default value to today's date in YYYY-MM-DD format
- Set the max attribute to today's date to prevent future date selection

#### Upload Function Updates
Enhanced `uploadAccountScreenshot()` function with:
1. **Date Validation**:
   - Checks that asOfDate field is not empty
   - Validates that selected date is not in the future
   - Shows error message if validation fails

2. **Form Data Submission**:
   - Includes `asOfDate` parameter in FormData sent to server
   - Format: YYYY-MM-DD string

3. **Success Message Enhancement**:
   - Displays the "As Of" date in the success message
   - Shows: "Balances recorded as of: [Date]"

### Backend Changes (server.js)

#### Endpoint Updates
Modified `/admin/api/finance/upload-screenshot` endpoint to:
1. **Extract asOfDate** from request body
2. **Validate asOfDate**:
   - Required field check
   - Valid date format check
   - Future date prevention (server-side validation)
3. **Pass asOfDate** to `finance.processAccountScreenshot()`
4. **Enhanced logging** with As Of date information

### Finance Module Changes (modules/finance.js)

#### processAccountScreenshot() Function
- Added optional `asOfDate` parameter (defaults to null)
- Uses current date if asOfDate not provided
- Logs the effective date being used
- Passes asOfDate to `updateAccountsFromParsedData()`

#### updateAccountsFromParsedData() Function
Key logic changes to handle historical dates:

1. **Date Processing**:
   - Converts asOfDate string to ISO format
   - Uses current date if asOfDate not provided
   - Logs the effective date for transparency

2. **Smart Balance Updates**:
   - **For existing accounts**:
     - Compares asOfDate with account's last `updatedAt` timestamp
     - Only updates `currentValue` if asOfDate is on or after last update
     - Preserves newer balances when uploading historical data
     - Logs whether balance was updated or preserved
   - **For new accounts**:
     - Sets `createdAt` and `updatedAt` to asOfDate
     - Records the As Of date in account notes

3. **History Tracking**:
   - Always adds history entry with the specified `balanceDate`
   - Uses asOfDate for `balanceDate` field
   - Uses current timestamp for `timestamp` field (when uploaded)
   - Marks entries with `source: 'screenshot_upload'`
   - Maintains accurate historical record regardless of upload timing

## Behavior Examples

### Example 1: Upload with Today's Date
- **Scenario**: Admin uploads screenshot on Feb 6, 2026 with asOfDate = "2026-02-06"
- **Result**:
  - Account balances are updated to values from screenshot
  - History entry created with balanceDate = "2026-02-06T00:00:00.000Z"
  - Account updatedAt = "2026-02-06T00:00:00.000Z"

### Example 2: Upload with Past Date
- **Scenario**: Admin uploads screenshot on Feb 6, 2026 with asOfDate = "2026-01-05"
- **Current State**: Account has currentValue = $5000, updatedAt = "2026-02-01"
- **Result**:
  - Account `currentValue` remains $5000 (not overwritten)
  - Account `updatedAt` remains "2026-02-01"
  - History entry added with balanceDate = "2026-01-05T00:00:00.000Z"
  - Historical record preserved: balance on Jan 5 was captured
  - Most recent balance (Feb 1) remains intact

### Example 3: Upload with Past Date (No Newer Balance)
- **Scenario**: Admin uploads screenshot on Feb 6, 2026 with asOfDate = "2026-01-15"
- **Current State**: Account has currentValue = $3000, updatedAt = "2026-01-01"
- **Result**:
  - Account `currentValue` updated to screenshot value (e.g., $3500)
  - Account `updatedAt` = "2026-01-15T00:00:00.000Z"
  - History entry added with balanceDate = "2026-01-15T00:00:00.000Z"
  - Balance updated because Jan 15 is newer than last update (Jan 1)

## Validation

### Client-Side Validation
- ✅ Required field validation
- ✅ Future date prevention (HTML5 max attribute)
- ✅ User-friendly error messages
- ✅ Visual feedback on validation errors

### Server-Side Validation
- ✅ Required field check
- ✅ Valid date format verification
- ✅ Future date rejection
- ✅ HTTP 400 error responses for invalid inputs

## Acceptance Criteria Met

- [x] The account screenshot upload form has a required 'As Of' date field (defaults to today)
- [x] Selecting a future date is disabled/invalid (both client and server side)
- [x] When admin uploads a screenshot with a past date, balances are stored with that historical date without overwriting more recent balances
- [x] Account history is updated and remains accurate, with no loss or corruption of prior data
- [x] UI and backend validation for the new 'As Of' date logic

## Technical Notes

### Date Handling
- All dates stored in ISO 8601 format
- Time component set to 00:00:00.000Z for consistency
- Server-side comparison uses Date objects for accuracy
- Client sends dates in YYYY-MM-DD format

### History Tracking
- `balanceDate`: When the balance actually existed (the As Of date)
- `timestamp`: When the upload/entry was made
- This distinction allows proper historical reconstruction

### Balance Update Logic
The key innovation is the conditional update:
```javascript
const shouldUpdateCurrentBalance = effectiveDateObj >= lastUpdated;
```
This ensures that:
- Recent balances are never accidentally overwritten by old data
- Historical data can be filled in without disrupting current state
- The system maintains data integrity across all scenarios

## Future Enhancements
Potential improvements for future versions:
1. Date range validation (e.g., not before account creation date)
2. Visual timeline showing when balances were captured vs uploaded
3. Bulk historical uploads with different dates
4. Export historical balance data by date range
5. Chart visualization of balance history with upload dates
