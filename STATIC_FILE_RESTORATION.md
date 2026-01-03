# Static File Restoration Feature

## Quick Start

When deploying with Docker/Portainer and using a volume mount over `/public`, static files are now **automatically restored** if missing.

### Example Docker Compose

```yaml
version: '3.8'
services:
  local-server:
    image: spospordo/local-server-site-pusher:latest
    volumes:
      - ./public:/app/public    # Can be empty - files auto-restored!
      - ./config:/app/config
      - ./uploads:/app/uploads
    ports:
      - "3000:3000"
```

### What Happens

1. Container starts with empty or partial `/public` volume
2. After 5 seconds, auto-regeneration runs
3. Missing static files automatically restored from backup
4. User customizations preserved (unless force=true)
5. All actions logged for troubleshooting

### Files Automatically Restored

- `smart-mirror.html` - Smart Mirror dashboard
- `index.html` - Main landing page
- `espresso-editor.html` - Espresso data editor
- `espresso-template.html` - Espresso display template

## Manual Restoration

### Via Admin API

Trigger restoration manually:

```bash
curl -X POST http://localhost:3000/admin/api/regenerate-public \
  -H "Cookie: session=YOUR_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

### Force Restore (Overwrite Customizations)

```bash
curl -X POST http://localhost:3000/admin/api/regenerate-public \
  -H "Cookie: session=YOUR_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### Check Status

```bash
curl http://localhost:3000/admin/api/regenerate-public/status \
  -H "Cookie: session=YOUR_SESSION"
```

### View Logs

```bash
curl http://localhost:3000/admin/api/regenerate-public/logs \
  -H "Cookie: session=YOUR_SESSION"
```

## How It Works

### Customization Detection

Files are compared using SHA-256 checksums:
- **Unchanged files**: Restored if missing
- **Customized files**: Preserved by default
- **Force mode**: Overwrites all files with originals

### Backup System

During Docker image build:
1. Static files copied to `.static-files-backup/` directory
2. Backup directory never volume-mounted
3. Always available for restoration

### Logging

All restoration actions are logged:

```
✅ [Public Regenerator] File Restored: index.html successfully restored to /public
⚠️ [Public Regenerator] File Customized: smart-mirror.html has been customized
📋 [Public Regenerator] Files Restored: 2 static file(s) restored: index.html, espresso-editor.html
```

## Configuration

### Disable Auto-Regeneration

In `config/config.json`:

```json
{
  "publicFilesRegeneration": {
    "enabled": false
  }
}
```

### Change Delay

```json
{
  "publicFilesRegeneration": {
    "enabled": true,
    "delaySeconds": 10
  }
}
```

Or via environment variable:

```bash
AUTO_REGENERATE_PUBLIC_DELAY=10
```

### Force Overwrite on Startup

```json
{
  "publicFilesRegeneration": {
    "enabled": true,
    "forceOverwrite": true
  }
}
```

**⚠️ Warning**: This will overwrite all customized files on every startup.

## Troubleshooting

### Files Still Missing

1. Check regeneration logs:
   ```bash
   curl http://localhost:3000/admin/api/regenerate-public/logs
   ```

2. Manually trigger restoration:
   ```bash
   POST /admin/api/regenerate-public
   ```

3. Verify backup directory exists in container:
   ```bash
   docker exec <container> ls -la /app/.static-files-backup/
   ```

### Customizations Lost

- Check if `forceOverwrite: true` is set
- Review logs for force restore warnings
- Use `force: false` (default) to preserve customizations

### Restoration Fails

Common causes:
- Permissions issue on volume mount
- Backup directory missing (rebuild image)
- Source files corrupted

Check logs for detailed error messages.

## For Developers

### Run Tests

```bash
# Basic file operations
node scripts/test-static-file-restoration.js

# Integration tests
node scripts/test-regenerator-restoration.js

# E2E with server
node server.js &
sleep 10
node scripts/test-restoration-e2e.js

# Complete API suite
node scripts/test-auto-regeneration.js
```

All 25 tests should pass ✅

### Documentation

See `AUTO_REGENERATION_FEATURE.md` for complete technical documentation.

## Support

For issues or questions, open an issue on GitHub:
https://github.com/spospordo/Local-Server-Site-Pusher/issues
