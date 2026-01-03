# Smart Mirror Dashboard Verbose Logging

## Overview

This implementation provides comprehensive verbose logging for the Smart Mirror Dashboard functionality to assist with troubleshooting across different environments (development, production, Docker, Portainer, Raspberry Pi, etc).

## Features Implemented

### 1. Logger Module Enhancements

- **New SMART_MIRROR Category**: Added dedicated logging category for Smart Mirror operations
- **Diagnostics Function**: `logSmartMirrorDiagnostics()` captures environment details:
  - Node environment (NODE_ENV)
  - Docker container detection
  - Platform and architecture
  - Hostname and Node version
  - Process uptime and memory usage
  - Working directories and paths

### 2. Server-Side Logging

#### Dashboard Route (`/smart-mirror`)
- Logs all access requests with IP and user agent
- Checks and logs dashboard file existence at full path
- Logs enabled/disabled state
- Provides diagnostic error messages if file is missing
- Logs cache-control headers being set
- Logs successful file serving

#### Public Config API (`/api/smart-mirror/config`)
- Logs all config requests with request context
- Logs cache-control headers
- Logs config sanitization process
- Logs response data summary

#### Admin Config APIs (`/admin/api/smart-mirror/config`)
- Logs all admin config operations with user context
- Logs save operations with config snapshot
- Logs load operations with config status

#### New Diagnostics API (`/admin/api/smart-mirror/diagnostics`)
- Returns comprehensive diagnostics data:
  - Environment information (Docker, platform, memory)
  - File existence checks (dashboard HTML, config file)
  - Configuration status (enabled state, widgets)
  - Recent logs (last 10 entries)
  - Warnings and troubleshooting suggestions

#### New Log Export API (`/admin/api/smart-mirror/logs/export`)
- Exports all Smart Mirror logs as JSON
- Includes timestamp and user context
- Downloads as `smart-mirror-logs-{timestamp}.json`

### 3. Smart Mirror Module Logging

Enhanced `modules/smartmirror.js` with:
- Module initialization logging with environment detection
- Encryption/decryption operation logging with data sizes
- Config file read/write logging with full paths
- Success/failure logging for all operations
- Environment variable status logging (SMARTMIRROR_KEY)

### 4. Client-Side Logging

Enhanced `public/smart-mirror.html` with:
- Page load timestamp and environment logging
- API fetch operation logging with performance timing
- Response status and header logging
- Config parsing and validation logging
- Theme application logging
- Widget rendering logging
- Detailed error logging with stack traces

### 5. Admin Dashboard UI

Added new **Diagnostics & Troubleshooting** section with:

#### Run Diagnostics Button
Displays comprehensive diagnostic information:
- **Environment Information**: Platform, Docker status, memory, uptime
- **File Checks**: Dashboard file existence and paths
- **Configuration Status**: Enabled state, theme, widgets
- **Warnings & Issues**: Detected problems with solutions
- **Recent Logs**: Last 10 Smart Mirror log entries with color coding

#### Export Logs Button
- Downloads all Smart Mirror logs as JSON file
- Includes timestamps and categories
- Useful for sharing with support or developers

## Log Categories

All logs are tagged with appropriate categories:
- **Smart Mirror**: All Smart Mirror specific operations
- Level indicators: INFO, SUCCESS, WARNING, ERROR, DEBUG

## Log Viewing

### Console Logs
All operations are logged to console with emoji prefixes:
- 📱 Smart Mirror operations
- ✅ Success messages
- ❌ Error messages
- ⚠️  Warning messages
- 🔍 Debug/diagnostic messages
- ℹ️  Information messages

### Admin Dashboard
1. Navigate to **Admin Dashboard** → **Settings** → **Server** → **Smart Mirror**
2. Scroll to **Diagnostics & Troubleshooting** section
3. Click **Run Diagnostics** to see current status
4. Click **Export Logs** to download log file

### System Logs View
All Smart Mirror logs are also available in:
- **Admin Dashboard** → **Settings** → **Logs**
- Filter by "Smart Mirror" category

## Troubleshooting Guide

### Dashboard Not Loading

**Run Diagnostics** will check:
1. ✅ Dashboard file exists at correct path
2. ✅ Smart Mirror is enabled in configuration
3. ✅ No file permission issues
4. ✅ Correct working directory

### Missing Configuration

Logs will show:
- Config file path being checked
- Whether file exists
- Fallback to default configuration
- Encryption key status

### Deployment Issues

Diagnostics reveal:
- Docker container detection
- Platform and architecture
- Working directories
- File path resolution
- Memory and uptime status

## Example Log Output

### Successful Dashboard Access
```
ℹ️ [Smart Mirror] Dashboard access requested from 192.168.1.100
🔍 [Smart Mirror] [DIAGNOSTIC] Dashboard route accessed: {
  "environment": { "isDocker": true, "platform": "linux" },
  "request": { "ip": "192.168.1.100", "userAgent": "..." }
}
🔍 [Smart Mirror] Loading configuration from: /app/config/smartmirror-config.json.enc
ℹ️ [Smart Mirror] Configuration file found, reading encrypted data
✅ [Smart Mirror] Configuration loaded successfully (enabled: true)
🔍 [Smart Mirror] Checking dashboard file: /app/public/smart-mirror.html
✅ [Smart Mirror] Dashboard file served successfully to 192.168.1.100
```

### File Not Found Error
```
❌ [Smart Mirror] Dashboard file not found at /app/public/smart-mirror.html
❌ [Smart Mirror] TROUBLESHOOTING: Expected file at: /app/public/smart-mirror.html
    Check if file exists in deployment. Working directory: /app
```

## Testing

Run the test suite to verify logging functionality:

```bash
npm start  # Start server in one terminal
node scripts/test-smart-mirror-logging.js  # Run tests in another
```

Tests verify:
- Public API endpoint logging
- Admin API endpoint logging
- Diagnostics endpoint functionality
- Log export functionality
- Dashboard route logging
- File existence checks

## Best Practices

1. **Monitor Logs**: Regularly check logs in admin dashboard for issues
2. **Export Logs**: Export logs when troubleshooting or reporting issues
3. **Check Diagnostics**: Run diagnostics before making configuration changes
4. **Review Warnings**: Address any warnings shown in diagnostics
5. **Environment Variables**: Set SMARTMIRROR_KEY for production

## Security Considerations

- Logs do not expose API keys or sensitive data
- Public config API automatically sanitizes sensitive fields
- Admin APIs require authentication
- Log export requires admin authentication
- Client-side logs visible in browser console (no secrets)

## Future Enhancements

Potential future additions:
- Log filtering by date range
- Log search functionality
- Real-time log streaming in admin UI
- Automatic issue detection and alerts
- Performance metrics tracking
