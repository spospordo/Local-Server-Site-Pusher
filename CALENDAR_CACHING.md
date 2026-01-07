# Calendar Caching Feature Documentation

## Overview

The Calendar Caching feature implements server-side caching for external ICS calendar feeds to reduce the frequency of requests to external calendar providers (Google Calendar, iCloud, Outlook, etc.). This helps prevent rate limiting and improves reliability and performance.

## Problem Addressed

Before this feature:
- Every client request to `/api/smart-mirror/calendar` triggered a fresh fetch from external calendar providers
- Multiple clients or rapid UI refreshes caused excessive requests to calendar services
- External providers (especially iCloud) would rate limit requests, causing errors
- Intermittent network issues would result in no calendar data being displayed

## Solution

The server now:
- Caches calendar data with a configurable TTL (Time To Live)
- Uses HTTP conditional requests (ETag and Last-Modified headers) to minimize bandwidth
- Serves cached data when external providers are unreachable or rate limiting
- Provides cache management through admin UI

## Features

### 1. Server-Side Cache with TTL

- **Default TTL**: 10 minutes (600 seconds)
- **Configurable Range**: 60 seconds to 1 hour (3600 seconds)
- **Cache Behavior**: All calendar feeds are fetched once per TTL period, regardless of the number of client requests

### 2. HTTP Conditional Requests

The system stores and uses:
- **ETag**: Unique identifier for calendar content version
- **Last-Modified**: Timestamp of last calendar update

When fetching from external providers, the server sends:
- `If-None-Match` header with stored ETag
- `If-Modified-Since` header with stored Last-Modified timestamp

If the calendar hasn't changed (HTTP 304 Not Modified), the server uses cached data without downloading.

### 3. Error Handling and Resilience

When external providers return errors:
- **429 (Too Many Requests)**: Uses stale cache, implements 30-second backoff
- **5xx (Server Errors)**: Uses stale cache, logs warning
- **Network Errors**: Uses stale cache if available

This ensures calendar data remains available even when providers are temporarily unavailable.

### 4. Cache Management

#### Admin UI Controls

**Location**: Admin Dashboard → Smart Mirror Configuration → Calendar Widget

**Configuration Fields**:
- **Cache Duration**: Set TTL in seconds (60-3600)
  - Default: 600 seconds (10 minutes)
  - Lower values: More frequent updates, higher provider load
  - Higher values: Fewer updates, lower provider load, longer stale data

**Cache Status Display**:
Shows real-time cache information:
- Cache validity status (Valid/Expired)
- Last fetch timestamp
- Cache age vs. TTL
- Number of cached events
- Number of stored ETags
- Any errors from calendar providers

**Manual Refresh Button**:
- Forces immediate cache refresh
- Bypasses TTL check
- Useful for testing or getting immediate updates

#### API Endpoints

**Get Cache Status** (Admin only)
```
GET /admin/api/smart-mirror/calendar/cache-status
```

Response:
```json
{
  "success": true,
  "cache": {
    "enabled": true,
    "lastFetch": "2026-01-07T22:30:00.000Z",
    "cacheAge": 150,
    "cacheTTL": 600,
    "isValid": true,
    "hasData": true,
    "eventCount": 5,
    "etags": 2,
    "lastModified": 2,
    "errors": {}
  }
}
```

**Manual Refresh** (Admin only)
```
POST /admin/api/smart-mirror/calendar/refresh
```

Response:
```json
{
  "success": true,
  "events": [...],
  "cached": false,
  "lastFetch": "2026-01-07T22:35:00.000Z",
  "fetchStatus": {
    "https://calendar.google.com/...": {
      "status": "success",
      "eventCount": 3
    },
    "https://p01-caldav.icloud.com/...": {
      "status": "not_modified",
      "cached": true
    }
  }
}
```

### 5. Client Response Format

The `/api/smart-mirror/calendar` endpoint now includes cache metadata:

```json
{
  "success": true,
  "events": [...],
  "cached": true,
  "cacheAge": 120,
  "lastFetch": "2026-01-07T22:30:00.000Z",
  "fetchStatus": {
    "url1": { "status": "success", "eventCount": 5 },
    "url2": { "status": "not_modified", "cached": true }
  }
}
```

**Fields**:
- `cached`: Boolean indicating if data was served from cache
- `cacheAge`: Age of cache in seconds (only when cached=true)
- `lastFetch`: ISO timestamp of last successful fetch
- `fetchStatus`: Per-URL status for diagnostics

### 6. HTTP Cache Headers

The endpoint now sets proper HTTP caching headers:

```
Cache-Control: public, max-age=600
Expires: <timestamp>
```

This allows browser-level caching in addition to server-side caching.

## Configuration

### Via Admin UI

1. Go to Admin Dashboard
2. Navigate to Smart Mirror Configuration
3. Open Calendar Widget section
4. Set "Cache Duration (seconds)" field (default: 600)
5. Save configuration

### Via API

Update the config via POST to `/admin/api/smart-mirror/config`:

```json
{
  "calendarCacheTTL": 900,
  "widgets": {
    "calendar": {
      "enabled": true,
      "calendarUrls": ["https://..."]
    }
  }
}
```

### Configuration Values

| TTL (seconds) | Duration | Use Case |
|---------------|----------|----------|
| 60-300        | 1-5 min  | Development, frequent updates needed |
| 300-600       | 5-10 min | Default, good balance |
| 600-1800      | 10-30 min| Production, low-change calendars |
| 1800-3600     | 30-60 min| Very stable calendars, minimize provider load |

## Monitoring and Troubleshooting

### Check Cache Status

1. Open Admin Dashboard
2. Go to Calendar Widget section
3. View Cache Status display

Look for:
- ✅ Green dot: Cache is valid and fresh
- ❌ Red dot: Cache is expired or invalid
- Error messages: Issues fetching from providers

### Common Issues

#### "Calendar widget not enabled"
**Cause**: Calendar widget is disabled in configuration  
**Solution**: Enable calendar widget in admin dashboard

#### "No calendar URLs configured"
**Cause**: No calendar feed URLs have been added  
**Solution**: Add at least one calendar feed URL in admin dashboard

#### "Rate limited" errors
**Cause**: External provider is limiting requests  
**Solution**: 
- Increase cache TTL to reduce request frequency
- Check if stale cache is being served (should be automatic)
- Wait for backoff period (30 seconds) to expire

#### Cache not updating
**Cause**: TTL may be too long, or provider hasn't changed data  
**Solution**:
- Check cache age in admin dashboard
- Use "Refresh Cache Now" button to force update
- Verify provider's calendar has actually changed

#### ETag/Last-Modified not working
**Cause**: Provider doesn't support these headers  
**Solution**: This is normal; the system falls back to full downloads

## Testing

### Automated Tests

Run the test suite:
```bash
npm start &
sleep 5
node scripts/test-calendar-cache.js
```

Tests verify:
- Cache metadata in API responses
- HTTP Cache-Control headers
- Configuration support for cache TTL

### Manual Testing

#### Test Cache Behavior

1. Configure calendar widget with a test calendar URL
2. Make first request to `/api/smart-mirror/calendar`
   - Should return `cached: false`
3. Make second request immediately
   - Should return `cached: true` with same `lastFetch`
4. Check cache status in admin dashboard
   - Should show valid cache with event count

#### Test Cache Expiration

1. Set cache TTL to 60 seconds
2. Make request to calendar API
3. Wait 70 seconds
4. Make another request
   - Should fetch fresh data (`cached: false`)

#### Test Manual Refresh

1. Click "Refresh Cache Now" button in admin
2. Observe test result showing success
3. Check cache status - should show new fetch time

#### Test Error Handling

1. Configure with an invalid calendar URL
2. Check cache status for error message
3. Fix URL and refresh cache
4. Verify error clears on successful fetch

## Performance Impact

### Benefits

- **Reduced External Requests**: By default, 60x fewer requests (1 per 10 min vs. continuous)
- **Lower Latency**: Cached responses are ~10-100x faster than external fetches
- **Improved Reliability**: Service continues during provider outages
- **Bandwidth Savings**: ETag/304 responses save ~99% bandwidth when data unchanged

### Resource Usage

- **Memory**: ~10-50KB per cached calendar feed
- **CPU**: Minimal impact, caching logic is efficient
- **Storage**: None (cache is in-memory only)

## Migration from Previous Version

No migration needed. The feature:
- Is backward compatible
- Uses default TTL of 10 minutes automatically
- Existing calendar URLs continue to work
- Previous behavior (no caching) is not available as option (by design for reliability)

## Best Practices

1. **Set appropriate TTL based on update frequency**:
   - Personal calendars with frequent changes: 5-10 minutes
   - Shared/public calendars: 15-30 minutes
   - Holiday calendars: 30-60 minutes

2. **Monitor cache status regularly**:
   - Check for provider errors
   - Verify cache is being used (not expired constantly)

3. **Use manual refresh when needed**:
   - After adding new calendar events
   - When testing calendar configuration
   - After changing calendar URLs

4. **Configure multiple calendar sources**:
   - Each source is cached independently
   - 304 responses work per-source
   - Partial failures don't affect other sources

## Security Considerations

- Cache is server-side only (not stored to disk)
- Sensitive calendar data is only in memory
- Admin API endpoints require authentication
- Public calendar API respects widget enabled/disabled setting
- No calendar URLs are exposed to unauthenticated users

## Future Enhancements

Potential improvements (not currently implemented):
- Persistent cache to disk (survive restarts)
- Per-feed TTL configuration
- Cache warming on server startup
- Metrics and analytics on cache hit rates
- WebSocket notifications for cache updates

## Support

For issues or questions:
1. Check cache status in admin dashboard
2. Review server logs for calendar-related errors
3. Test with the provided test script
4. Verify calendar URLs are accessible from server
5. Open issue on GitHub with cache status details
