# Centralized Logging System

## Overview

The Local Server Site Pusher now includes a comprehensive centralized logging system accessible through the admin dashboard. This system captures and displays error, status, and activity logs from all system modules, making troubleshooting and monitoring significantly easier.

## Features

### 1. Centralized Log Storage
- In-memory log storage with configurable capacity (default: 500 entries)
- Automatic log rotation (oldest logs removed when limit reached)
- Real-time log capture from all modules

### 2. Module Categorization
Logs are organized into the following categories:
- **System** - Server startup, configuration, core operations
- **Magic Mirror** - Magic Mirror page and API operations
- **Deployment** - Deployment-related activities
- **Build** - Build processes (Vidiots, Espresso)
- **Finance** - Financial module operations
- **GitHub** - Git operations and GitHub Pages uploads
- **Server** - Network and server configuration
- **Client** - Client authentication and operations
- **Ollama** - Ollama/LLM integration logs
- **Media Streaming** - Media streaming status
- **Home Assistant** - Home Assistant integration

### 3. Log Levels
- **INFO** (ℹ️) - General informational messages
- **SUCCESS** (✅) - Successful operations
- **WARNING** (⚠️) - Warning conditions that need attention
- **ERROR** (❌) - Error conditions
- **DEBUG** (🔍) - Debug information

## Accessing the Logs

### Via Admin Dashboard
1. Log into the admin dashboard at `http://your-server:3000/admin`
2. Navigate to the **Settings** tab
3. Click on the **📝 Logs** sub-tab
4. View, filter, and manage logs

### Via API (Requires Authentication)
```bash
# Get all logs
curl http://localhost:3000/admin/api/logs

# Filter by category
curl http://localhost:3000/admin/api/logs?category=Magic%20Mirror

# Limit results
curl http://localhost:3000/admin/api/logs?limit=50

# Clear logs
curl -X POST http://localhost:3000/admin/api/logs/clear
```

## Using the Logging Interface

### Filtering
- **Filter by Module**: Select a specific module to view only its logs
- **Filter by Level**: Filter by log severity (All, Errors, Warnings, Success, Info)

### Controls
- **🔄 Refresh**: Manually refresh the log display
- **🗑️ Clear Logs**: Clear all logs (requires confirmation)
- **Auto-refresh**: Enable automatic refresh every 5 seconds

### Reading Logs
Each log entry displays:
- **Timestamp**: When the event occurred
- **Category**: Which module generated the log
- **Level**: Severity/type with visual indicator
- **Message**: Detailed log message

## Using the Logger in Code

### Basic Usage
```javascript
const logger = require('./modules/logger');

// Log at different levels
logger.info(logger.categories.SYSTEM, 'Application started');
logger.success(logger.categories.GITHUB, 'Upload completed successfully');
logger.warning(logger.categories.SYSTEM, 'Using default password');
logger.error(logger.categories.BUILD, 'Build failed: ' + error.message);
logger.debug(logger.categories.DEPLOYMENT, 'Debug info: ' + JSON.stringify(data));
```

### Available Categories
```javascript
logger.categories.SYSTEM
logger.categories.MAGIC_MIRROR
logger.categories.DEPLOYMENT
logger.categories.BUILD
logger.categories.FINANCE
logger.categories.GITHUB
logger.categories.SERVER
logger.categories.CLIENT
logger.categories.OLLAMA
logger.categories.MEDIA
logger.categories.HOME_ASSISTANT
```

### Retrieving Logs Programmatically
```javascript
// Get all logs
const allLogs = logger.getLogs();

// Get logs for specific category
const magicMirrorLogs = logger.getLogs(logger.categories.MAGIC_MIRROR);

// Get limited number of logs
const last10Logs = logger.getLogs(null, 10);

// Get available categories
const categories = logger.getCategories();

// Clear all logs
logger.clear();
```

## Log Entry Structure

Each log entry contains:
```javascript
{
  timestamp: "2025-10-13T16:42:34.123Z",  // ISO 8601 timestamp
  level: "SUCCESS",                        // Log level
  category: "System",                      // Module category
  message: "Server started successfully"   // Log message
}
```

## Container Logs

Logs are also written to the container's stdout/stderr for compatibility with Docker logging drivers:

```bash
# View container logs
docker logs local-server

# Follow logs in real-time
docker logs -f local-server

# View last 50 lines
docker logs --tail 50 local-server

# Filter for specific module
docker logs local-server | grep "Magic Mirror"
```

## Best Practices

### When to Log
- **INFO**: Normal operations, status updates
- **SUCCESS**: Successful completion of operations
- **WARNING**: Potential issues, using defaults, deprecated features
- **ERROR**: Failures, exceptions, invalid states
- **DEBUG**: Detailed debugging information (use sparingly in production)

### Log Message Guidelines
- Be concise but descriptive
- Include relevant context (e.g., user, file path, operation)
- Avoid logging sensitive information (passwords, tokens, PII)
- Use consistent formatting within a module

### Example Patterns
```javascript
// Good - Provides context
logger.success(logger.categories.GITHUB, `GitHub upload completed: ${filename}`);
logger.error(logger.categories.BUILD, `Build failed for ${projectName}: ${error.message}`);

// Less helpful
logger.success(logger.categories.GITHUB, 'Upload done');
logger.error(logger.categories.BUILD, 'Error occurred');
```

## Troubleshooting with Logs

### Common Scenarios

#### Debugging Magic Mirror Issues
1. Go to Settings > Logs
2. Filter by Module: "Magic Mirror"
3. Look for ERROR or WARNING entries
4. Check timestamps to correlate with reported issues

#### Monitoring Deployments
1. Filter by Module: "GitHub" or "Build"
2. Watch for SUCCESS confirmations
3. ERROR entries indicate what failed

#### Security Monitoring
1. Filter by Module: "System" or "Client"
2. Look for authentication-related messages
3. WARNING about default passwords indicates security risk

#### Performance Analysis
1. Check Server and System logs
2. Look at timestamp patterns
3. Identify frequent errors or warnings

## Extending the Logging System

### Adding New Categories
Edit `modules/logger.js`:
```javascript
this.categories = {
  // ... existing categories ...
  NEW_MODULE: 'New Module Name'
};
```

### Adjusting Log Capacity
Edit `modules/logger.js` constructor:
```javascript
constructor(maxLogs = 1000) {  // Increase from 500 to 1000
  this.logs = [];
  this.maxLogs = maxLogs;
  // ...
}
```

## Testing

Run the logging system test suite:
```bash
node scripts/test-logging.js
```

Tests cover:
- Logger module loading
- Required methods existence
- Category completeness
- Log entry creation
- Log format validation
- Category filtering
- API endpoint availability

## Future Enhancements

Potential improvements to the logging system:
1. **Persistent Storage** - Save logs to file or database
2. **Export Functionality** - Download logs as JSON/CSV
3. **Advanced Search** - Full-text search across log messages
4. **Log Levels** - Per-module log level configuration
5. **Alerts** - Email/webhook notifications for critical errors
6. **Retention Policies** - Configurable log aging and archival
7. **Performance Metrics** - Request timing and performance logs
8. **Structured Logging** - Add metadata fields (request ID, session, etc.)

## Version Information

- **Introduced**: v2.2.5
- **Status**: Stable
- **Breaking Changes**: None
- **Dependencies**: None (uses only Node.js built-ins)

---

**Last Updated**: October 13, 2025
**Author**: GitHub Copilot
**Related Issue**: Display Logs in a Dedicated Settings Sub-tab for Troubleshooting
