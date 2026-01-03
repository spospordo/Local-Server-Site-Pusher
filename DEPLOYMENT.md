# Container Deployment Guide

This guide helps you deploy the Local-Server-Site-Pusher container and resolve common permission issues.

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone and start
git clone https://github.com/spospordo/Local-Server-Site-Pusher.git
cd Local-Server-Site-Pusher
docker-compose up -d
```

### Using Docker

```bash
# Build and run
docker build -t local-server-site-pusher .
docker run -d -p 3000:3000 \
  -v ./public:/app/public \
  -v ./config:/app/config \
  -v ./uploads:/app/uploads \
  --name local-server \
  local-server-site-pusher
```

### Building for Raspberry Pi / ARM64

The container supports ARM64 architecture (Raspberry Pi 4, 5, etc.). **For best results on ARM64, always build the image on the ARM64 device itself.**

```bash
# On ARM64 device (Raspberry Pi) - RECOMMENDED
docker build -t local-server-site-pusher .

# On x64 machine for ARM64 target (requires Docker Buildx)
docker buildx build --platform linux/arm64 -t local-server-site-pusher:arm64 .

# Multi-platform build for both architectures
docker buildx build --platform linux/amd64,linux/arm64 -t spospordo/local-server-site-pusher:latest --push .
```

**Important Notes:**
- Version 1.1.2+ includes explicit `npm rebuild sharp` to ensure platform-specific binaries for ARM64
- Version 1.1.0+ ensures npm properly installs platform-specific binaries for sharp image processing library
- **Do NOT use x64 images on ARM64 devices** - the sharp module will fail with "Could not load the sharp module using the linux-arm64 runtime"
- **Always build from source on Raspberry Pi** or use an ARM64-specific image tag
- The Dockerfile uses `npm ci || npm install` fallback plus `npm rebuild sharp` for platform-specific package installation

## Fixing Permission Issues

If you see permission denied errors when the container tries to create config files:

### Option 1: Set correct ownership (Linux/macOS)
```bash
# Create directories with correct ownership
mkdir -p config public uploads
sudo chown $(id -u):$(id -g) config public uploads

# Or fix existing directories
sudo chown -R $(id -u):$(id -g) config public uploads
```

### Option 2: Use user mapping in docker-compose.yml
```yaml
services:
  local-server:
    build: .
    user: "1000:1000"  # Replace with your user:group ID
    # ... rest of config
```

### Option 3: Check your user/group ID
```bash
# Find your user/group ID
id

# Use in docker run
docker run -d --user "$(id -u):$(id -g)" \
  -p 3000:3000 \
  -v ./public:/app/public \
  -v ./config:/app/config \
  -v ./uploads:/app/uploads \
  local-server-site-pusher
```

## Expected Behavior

### Successful Deployment
```
> local-server-site-pusher@1.0.0 start
> node server.js

Created default configuration file
Local Server Site Pusher running on port 3000
Admin interface: http://localhost:3000/admin
Status endpoint: http://localhost:3000/api/status
```

### Read-only Configuration (Graceful Fallback)
```
> local-server-site-pusher@1.0.0 start
> node server.js

Config directory not writable, using in-memory configuration only
Local Server Site Pusher running on port 3000
Admin interface: http://localhost:3000/admin
Status endpoint: http://localhost:3000/api/status
```

## Production Considerations

### Security
- Change default admin credentials immediately
- Set a custom session secret:
  ```bash
  export SESSION_SECRET="your-secure-random-string"
  ```
- Use HTTPS with a reverse proxy

### Persistence
- Mount the `config` directory to persist configuration changes
- Mount the `public` directory for your web content
- For production with multiple instances, consider using an external session store

### Environment Variables
- `NODE_ENV=production` - Enables production mode
- `SESSION_SECRET` - Custom session secret for security
- `SUPPRESS_SESSION_WARNINGS=true` - Suppresses session store warnings in logs

## Troubleshooting

### Permission Denied Errors
If you see `EACCES: permission denied, open '/app/config/config.json'`:

1. The container runs as the `node` user (UID 1000)
2. Mounted volumes inherit host directory permissions
3. Use one of the solutions above to fix ownership

### Configuration Not Persisting
- Ensure the `config` directory is mounted and writable
- Check docker-compose.yml has correct volume mapping
- Configuration changes via admin interface require write access

### Session Store Warnings
Session store warnings are now controlled based on environment:
- **Development mode**: Warnings are suppressed for cleaner logs
- **Production mode**: Informational warnings are shown to remind about scaling considerations
- **Suppressed mode**: Set `SUPPRESS_SESSION_WARNINGS=true` to disable all session warnings

For production with multiple instances, consider:
- Redis session store
- External load balancer with session affinity
- Database-backed session storage

## Docker Compose Examples

### Development
```yaml
services:
  local-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./public:/app/public
      - ./config:/app/config
      - ./uploads:/app/uploads
    user: "1000:1000"  # Your user:group ID
```

### Production
```yaml
services:
  local-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - /path/to/persistent/public:/app/public
      - /path/to/persistent/config:/app/config
      - /path/to/persistent/uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your-secure-random-string
      # - SUPPRESS_SESSION_WARNINGS=true  # Uncomment to suppress session warnings
    restart: unless-stopped

## Auto-Regeneration of Public Files

The server automatically regenerates and syncs public files on startup and after redeploy to ensure correct static files and feature-generated dynamic content are always present.

### How It Works

On server startup, the auto-regeneration system:

1. **Checks Static Files**: Verifies that critical files like `smart-mirror.html`, `index.html`, and `espresso-editor.html` exist in `/public` (these are baked into the Docker image)
2. **Regenerates Dynamic Content**:
   - **Espresso**: Regenerates `public/espresso/index.html` from persisted config/data
   - **Vidiots**: Regenerates `public/vidiots/index.html` and poster images
3. **Logs All Actions**: All checks and generation actions are logged for troubleshooting

**Note**: Static files are baked into the Docker image at `/app/public`. If you mount a volume over `/app/public`, ensure the static files are present in that volume, or don't mount `/public` and let the container use the built-in files.

### Configuration

Auto-regeneration is configured via environment variables or config file:

```yaml
# docker-compose.yml
services:
  local-server:
    environment:
      # Auto-regeneration delay in seconds (default: 5)
      - AUTO_REGENERATE_PUBLIC_DELAY=5
```

Or in `config/config.json`:

```json
{
  "publicFilesRegeneration": {
    "enabled": true,
    "delaySeconds": 5,
    "runOnStartup": true,
    "forceOverwrite": false
  }
}
```

### Volume Mount Strategies

#### Strategy 1: No Volume Mount (Recommended for Simple Deployments)
```yaml
# Public files stay in the container
services:
  local-server:
    volumes:
      - ./config:/app/config     # Only persist config and uploads
      - ./uploads:/app/uploads
```

**Pros**: Auto-regeneration always works correctly  
**Cons**: Generated files lost on container recreation (but automatically regenerated)

#### Strategy 2: Volume Mount with Auto-Regeneration (Recommended for Portainer)
```yaml
# Mount public but let auto-regeneration handle updates
services:
  local-server:
    volumes:
      - ./public:/app/public
      - ./config:/app/config
      - ./uploads:/app/uploads
    environment:
      - AUTO_REGENERATE_PUBLIC_DELAY=5
```

**Pros**: Files persist AND auto-update on deploy  
**Cons**: Requires auto-regeneration enabled

#### Strategy 3: Manual Management
```yaml
# Mount public and disable auto-regeneration
services:
  local-server:
    volumes:
      - ./public:/app/public
      - ./config:/app/config
      - ./uploads:/app/uploads
```

Then in `config/config.json`:
```json
{
  "publicFilesRegeneration": {
    "enabled": false
  }
}
```

**Pros**: Full manual control  
**Cons**: Must manually trigger regeneration via admin panel

### Manual Regeneration

You can manually trigger regeneration via the Admin API:

```bash
# Trigger regeneration (preserves up-to-date files)
curl -X POST http://localhost:3000/admin/api/regenerate-public \
  -H "Content-Type: application/json" \
  -d '{"force": false}' \
  --cookie "connect.sid=YOUR_SESSION_COOKIE"

# Force regeneration (overwrites all files)
curl -X POST http://localhost:3000/admin/api/regenerate-public \
  -H "Content-Type: application/json" \
  -d '{"force": true}' \
  --cookie "connect.sid=YOUR_SESSION_COOKIE"

# Check regeneration status
curl http://localhost:3000/admin/api/regenerate-public/status \
  --cookie "connect.sid=YOUR_SESSION_COOKIE"

# View regeneration logs
curl http://localhost:3000/admin/api/regenerate-public/logs \
  --cookie "connect.sid=YOUR_SESSION_COOKIE"
```

### Troubleshooting

**Issue**: Static files missing after deployment

**Solution**: Check auto-regeneration logs:
```bash
curl http://localhost:3000/admin/api/regenerate-public/logs \
  --cookie "connect.sid=YOUR_SESSION_COOKIE"
```

**Issue**: Files not updating after code changes

**Solution**: Trigger force regeneration:
```bash
curl -X POST http://localhost:3000/admin/api/regenerate-public \
  -H "Content-Type: application/json" \
  -d '{"force": true}' \
  --cookie "connect.sid=YOUR_SESSION_COOKIE"
```

**Issue**: Permission errors during regeneration

**Solution**: Ensure proper permissions on `/app/public`:
```bash
# On host
sudo chown -R $(id -u):$(id -g) ./public

# Or set in docker-compose.yml
services:
  local-server:
    user: "1000:1000"  # Replace with your UID:GID
```

### Best Practices

1. **Keep Auto-Regeneration Enabled**: It ensures files are always up-to-date after deploys
2. **Use 5-10 Second Delay**: Gives the server time to fully initialize before regeneration
3. **Monitor Logs**: Check regeneration logs via admin panel to catch issues early
4. **Volume Mount `/config` and `/uploads`**: Always persist these directories
5. **Consider NOT Mounting `/public`**: Let auto-regeneration handle it unless you need persistence

### CI/CD Integration

For automated deployments, ensure:

1. Auto-regeneration is enabled in production config
2. Delay is appropriate for your deployment time (typically 5-10 seconds)
3. Health checks wait for regeneration to complete before marking as healthy

Example GitLab CI/CD:
```yaml
deploy:
  script:
    - docker-compose up -d
    - sleep 15  # Wait for auto-regeneration
    - curl http://localhost:3000/api/status  # Health check
```
```