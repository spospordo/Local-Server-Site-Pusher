# AviationStack API Integration for Flight Tracking

## Overview

This document describes the integration of AviationStack API as the official flight data provider for the vacation and flight tracking functionality. The implementation includes secure API key management, intelligent rate limiting, automated scheduling, and comprehensive admin controls.

## Features

### ✈️ Real-Time Flight Tracking
- **Live flight status updates** - Get real-time information about flight delays, cancellations, and gate changes
- **Automatic data refresh** - Intelligent scheduling ensures flight data is always up-to-date
- **Smart caching** - Minimizes API calls while providing fresh data when needed
- **Multiple flights per vacation** - Track all flights associated with a vacation

### 🔐 Secure API Key Management
- **Encrypted storage** - API keys are stored securely in encrypted configuration
- **Test connection functionality** - Validate API keys before saving
- **Admin-only access** - Only authenticated administrators can configure API settings
- **Graceful fallback** - System works with basic validation if API key not configured

### 📊 Rate Limiting & Usage Tracking
- **Monthly call tracking** - Monitor API usage against free tier limit (100 calls/month)
- **Visual usage indicators** - Progress bar and percentage display
- **Warning system** - Alerts when approaching monthly limit
- **Automatic limit enforcement** - Prevents exceeding configured monthly limit

### ⏰ Intelligent Update Scheduling
The system automatically adjusts update frequency based on flight proximity:

- **Default Schedule**: Daily at 7am for all tracked flights
- **3 Days Before**: 3x daily (7am, noon, 5pm) for flights within 3 days
- **Final 6 Hours**: Hourly updates for real-time tracking

This schedule maximizes data freshness while staying well within the 100 calls/month free tier limit.

## Getting Started

### Prerequisites

1. **AviationStack API Key** (Free Tier Available)
   - Sign up at [aviationstack.com](https://aviationstack.com/)
   - Free tier includes 100 API calls per month
   - No credit card required for free tier

2. **System Requirements**
   - Node.js (included in Docker container)
   - Access to admin dashboard

### Setup Instructions

#### Step 1: Obtain API Key

1. Visit [aviationstack.com](https://aviationstack.com/)
2. Click "Sign Up" and create a free account
3. Verify your email address
4. Navigate to Dashboard → API Access Key
5. Copy your API access key

#### Step 2: Configure in Admin Dashboard

1. Log into the admin dashboard
2. Navigate to **Smart Mirror** section
3. Open **APIs and Connections** (first section)
4. Scroll to **✈️ AviationStack Flight API**
5. Enter your API key in the **AviationStack API Key** field
6. Set **Enable Flight API** to **Enabled**
7. (Optional) Adjust **Monthly API Call Limit** if you have a paid plan
8. Click **🔍 Test AviationStack Connection** to verify
9. Scroll to bottom and click **💾 Save Smart Mirror Configuration**

#### Step 3: Enable Flight Tracking for Vacations

1. Navigate to **House** → **Vacation** → **Vacation Information**
2. Add or edit a vacation
3. Add flight information in the **✈️ Flight Information** section
4. Click **🔍 Validate** for each flight to verify with AviationStack
5. Wait for validation confirmation (green checkmark)
6. Save the vacation
7. In the vacation list, check **Enable Flight Tracking** for the vacation

## Usage

### Admin Interface

#### API Connection Management

**Test Connection**
- Validates API key with AviationStack
- Shows success/error message
- Displays quota information if successful

**API Usage Tracking**
- Real-time display of monthly API calls used
- Visual progress bar with color coding:
  - 🔵 Blue: Normal usage (< 75%)
  - 🟠 Orange: High usage (75-89%)
  - 🔴 Red: Critical usage (≥ 90%)
- Warning message when approaching limit

**View Tracked Flights**
- Lists all flights currently being tracked
- Shows update frequency for each flight
- Color-coded by priority:
  - 🔴 Red: Hourly updates (within 6 hours)
  - 🟠 Orange: 3x daily (within 3 days)
  - 🔵 Blue: Daily (more than 3 days away)

**Manual Update**
- Trigger immediate update of all tracked flights
- Useful for testing or urgent status checks
- Respects monthly API limit

#### Flight Validation

When adding flights to vacations:

1. Enter airline code (e.g., "AA", "UA", "DL")
2. Enter flight number (e.g., "AA123")
3. Select flight date
4. Click **🔍 Validate**
5. System checks with AviationStack API
6. Shows validation result:
   - ✅ **Validated**: Flight found, tracking enabled
   - ⏳ **Pending**: Validation in progress
   - ❌ **Error**: Flight not found or API error

### Smart Mirror Display

Flight information automatically appears on the smart mirror when:
- Flight tracking is enabled for a vacation
- Vacation has validated flights
- Vacation widget is enabled

**Displayed Information:**
- Flight number with ✈️ icon
- Airline name
- Current status (On Time, Delayed, Scheduled, Completed)
- Gate and terminal information (when available)
- Departure and arrival times
- Last updated timestamp

## Technical Details

### Architecture

#### Modules

**`modules/aviationstack.js`**
- AviationStack API client
- Connection testing
- Flight validation
- Flight status retrieval
- Usage tracking and rate limiting

**`modules/flight-scheduler.js`**
- Cron-based scheduling system
- Intelligent update frequency calculation
- Flight data caching
- Tracked flights management

#### API Endpoints

**Admin Endpoints** (require authentication)

- `POST /admin/api/flight-api/test-connection`
  - Tests API key validity
  - Returns connection status and quota info

- `GET /admin/api/flight-api/usage`
  - Returns current month's API usage statistics
  - Includes calls used, remaining, and percentage

- `GET /admin/api/flight-api/tracked-flights`
  - Lists all flights being tracked
  - Shows update frequency for each

- `POST /admin/api/flight-api/manual-update`
  - Triggers immediate update of all tracked flights
  - Respects rate limits

- `POST /admin/api/vacation/validate-flight`
  - Validates flight with AviationStack API
  - Returns flight details if found

**Public Endpoints** (smart mirror access)

- `GET /api/smart-mirror/flight-status`
  - Returns cached or live flight status
  - Used by smart mirror display
  - Query params: `flightNumber`, `airline`, `date`

### Data Storage

#### Configuration (encrypted)
```json
{
  "flightApi": {
    "provider": "aviationstack",
    "apiKey": "encrypted_key_here",
    "enabled": true,
    "monthlyLimit": 100
  }
}
```

#### Flight Cache (`config/flight-cache.json`)
```json
{
  "AA123_2026-02-15": {
    "flightIata": "AA123",
    "status": "On Time",
    "departure": {
      "airport": "Los Angeles International",
      "gate": "B12",
      "terminal": "4"
    },
    "cachedAt": "2026-02-15T10:30:00.000Z"
  }
}
```

### Scheduling Logic

```javascript
// Daily at 7am - all tracked flights
cron.schedule('0 7 * * *', updateDaily);

// Noon - flights within 3 days
cron.schedule('0 12 * * *', updateThriceDaily);

// 5pm - flights within 3 days
cron.schedule('0 17 * * *', updateThriceDaily);

// Every hour - flights within 6 hours
cron.schedule('0 * * * *', updateHourly);
```

### Rate Limiting

The system implements several strategies to stay within the 100 calls/month limit:

1. **Intelligent Scheduling**: Updates increase in frequency only as flights approach
2. **Caching**: Stores flight data between updates
3. **Usage Tracking**: Monitors API calls and prevents overuse
4. **Graceful Degradation**: Falls back to cached data when limit reached

**Estimated Monthly Usage** (for 4 flights):
- Flight 1 month away: ~30 calls (1/day for 30 days)
- Flight 2 weeks away: ~14 calls daily + 9 calls 3x daily = ~41 calls
- Flight 1 week away: ~7 calls daily + 6 calls 3x daily + 6 hourly = ~31 calls
- **Total**: ~72 calls/month (well within 100 limit)

## Security Considerations

### API Key Storage
- Keys stored in encrypted configuration file
- Encryption key from environment variable (`SMARTMIRROR_KEY`)
- Never exposed in public API responses
- Placeholder shown in admin UI when key exists

### Access Control
- All admin endpoints require authentication
- Public endpoints validate widget enablement
- No flight data exposed without tracking enabled

### Data Privacy
- Flight data cached locally
- No external data sharing
- Cache cleared for past flights

## Troubleshooting

### Connection Test Fails

**Problem**: "Invalid API key or unauthorized access"
**Solution**: 
- Verify API key is correct (no extra spaces)
- Check API key is active in AviationStack dashboard
- Ensure free tier hasn't expired

**Problem**: "API rate limit exceeded"
**Solution**:
- Wait for new month to begin
- Upgrade to paid AviationStack plan
- Reduce number of tracked flights

### Flight Validation Fails

**Problem**: "Flight not found"
**Solution**:
- Verify flight number format (e.g., "AA123", not "American 123")
- Check date is correct (YYYY-MM-DD)
- Confirm flight actually exists on that date
- Try with IATA code instead of full name

### Flight Data Not Updating

**Problem**: Flight status not refreshing
**Solution**:
1. Check API usage hasn't exceeded limit
2. Verify flight tracking is enabled for vacation
3. Confirm API key is still valid
4. Try manual update from admin panel
5. Check server logs for scheduler errors

### Usage Tracking Issues

**Problem**: Usage counter seems incorrect
**Solution**:
- Counter resets automatically at start of new month
- Check server timezone is configured correctly
- Manual updates increment counter
- Each validation attempt counts as one API call

## API Reference

### AviationStack API

**Documentation**: [aviationstack.com/documentation](https://aviationstack.com/documentation)

**Free Tier Limits**:
- 100 API calls per month
- Historical and real-time flight data
- Airport information
- No credit card required

**Key Endpoints Used**:
- `GET /v1/flights` - Flight status and information
- Parameters: `access_key`, `flight_iata`, `flight_date`

### Response Format

```json
{
  "data": [{
    "flight": {
      "iata": "AA123",
      "number": "123"
    },
    "airline": {
      "name": "American Airlines",
      "iata": "AA"
    },
    "flight_status": "active",
    "departure": {
      "airport": "Los Angeles International",
      "iata": "LAX",
      "terminal": "4",
      "gate": "B12",
      "scheduled": "2026-02-15T10:30:00+00:00"
    },
    "arrival": {
      "airport": "John F. Kennedy International",
      "iata": "JFK",
      "terminal": "8",
      "gate": "C5",
      "scheduled": "2026-02-15T19:00:00+00:00"
    }
  }]
}
```

## Best Practices

### Optimizing API Usage

1. **Validate flights before enabling tracking**
   - Only validated flights count toward scheduling
   - Invalid flights won't waste API calls

2. **Disable tracking for completed vacations**
   - Past flights don't need updates
   - Manually disable after trip ends

3. **Use manual updates sparingly**
   - Automatic schedule is optimized
   - Manual updates count toward limit

4. **Monitor usage regularly**
   - Check usage indicator before month end
   - Plan flight additions accordingly

### Adding Multiple Flights

For vacations with many flights:

1. Add all flights at once before enabling tracking
2. Validate each flight individually
3. Remove any invalid flights
4. Enable tracking only when all flights validated
5. System treats round-trip as 2 flights

## Maintenance

### Monthly Reset

- Usage counter automatically resets at month start
- Counter uses server timezone (default: America/New_York)
- No action required from administrators

### Cache Cleanup

- Cache automatically removes flights older than 7 days
- Cache file location: `config/flight-cache.json`
- Safe to delete cache file if needed (will regenerate)

### Scheduler Management

Scheduler starts automatically with server:
- No manual intervention needed
- Survives server restarts
- Logs all operations to server logs

## Upgrade Path

### From Mock Data to Real API

If upgrading from previous mock implementation:

1. Flight data structure remains compatible
2. Add API key in admin settings
3. Test connection
4. Enable Flight API
5. Existing flights will validate on next update
6. No data migration needed

### To Paid AviationStack Plan

To upgrade to higher API limits:

1. Upgrade on AviationStack website
2. Update **Monthly API Call Limit** in admin settings
3. No other changes required
4. System automatically allows more API calls

## Support Resources

### AviationStack
- Website: [aviationstack.com](https://aviationstack.com/)
- Documentation: [aviationstack.com/documentation](https://aviationstack.com/documentation)
- Support: Available through dashboard

### System Logs

Server logs include:
- API connection attempts
- Flight validation results
- Scheduler execution
- Usage tracking
- Error details

View logs: `docker logs <container_name>`

## Future Enhancements

Potential improvements for future versions:

1. **Enhanced Flight Features**
   - Flight route maps
   - Airport weather integration
   - Baggage tracking
   - Alternative flight suggestions

2. **Additional Providers**
   - FlightAware integration
   - Aviation Edge support
   - Provider fallback system

3. **Advanced Scheduling**
   - Custom update frequencies
   - Priority flight designation
   - Timezone-aware scheduling

4. **Notifications**
   - Email/SMS alerts for delays
   - Gate change notifications
   - Boarding reminders

## Conclusion

The AviationStack integration provides reliable, real-time flight tracking within the constraints of the free API tier. The intelligent scheduling system and comprehensive admin interface make it easy to manage flight data while respecting rate limits.

For questions or issues, please refer to:
- This documentation
- Server logs for error details
- AviationStack API documentation
- Admin dashboard test tools
