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
  -v ./config:/app/config \
  -v ./uploads:/app/uploads \
  --name local-server \
  local-server-site-pusher
```

**Note:** Static files are served from the Docker image. Only mount `config` and `uploads` for persistent data.

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
- Mount the `uploads` directory to persist uploaded files
- Static files (smart-mirror.html, index.html, etc.) are served from the Docker image
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
      # Only mount config and uploads for persistence
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
      # Only mount config and uploads - static files come from the image
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

**Note**: Static files are baked into the Docker image at `/app/public`. With the recommended volume mount strategy (no `/app/public` mount), static files are always served from the image and automatically update on redeploy.

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

#### Recommended Strategy: No /public Mount
```yaml
# Public files stay in the container (recommended)
services:
  local-server:
    volumes:
      - ./config:/app/config     # Only persist config and uploads
      - ./uploads:/app/uploads
```

**Pros**: 
- Static files automatically update on redeploy
- Simple and reliable
- No sync issues

**Cons**: 
- Dynamic generated files (espresso/vidiots) are regenerated on each container start (but this is automatic)

#### Legacy Strategy: With /public Mount (Not Recommended)
```yaml
# Mount public but static files won't auto-update
services:
  local-server:
    volumes:
      - ./public:/app/public     # Not recommended - prevents static file updates
      - ./config:/app/config
      - ./uploads:/app/uploads
```

**Pros**: 
- Generated files persist between restarts

**Cons**: 
- Static files DON'T update after code changes
- Requires manual copying of updated static files
- More complex deployment

**If upgrading from this strategy**: Back up any custom files from `./public` before switching to the recommended strategy.

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

**Solution**: Static files come from the Docker image. Ensure you're not mounting `/app/public` volume. If you need custom static files, rebuild the Docker image with your changes.

**Issue**: Files not updating after code changes

**Solution**: Redeploy the container with the new image. Static files will automatically update. For dynamic content (espresso/vidiots), it regenerates automatically from config/uploads.

**Issue**: Permission errors during regeneration

**Solution**: Ensure proper permissions on `/app/config` and `/app/uploads`:
```bash
# On host
sudo chown -R $(id -u):$(id -g) ./config ./uploads

# Or set in docker-compose.yml
services:
  local-server:
    user: "1000:1000"  # Replace with your UID:GID
```

### Best Practices

1. **Use the Recommended Volume Mount Strategy**: Only mount `/app/config` and `/app/uploads` for simplicity and reliability
2. **Static Files from Image**: Let static files come from the Docker image for automatic updates
3. **Monitor Logs**: Check regeneration logs via admin panel to catch issues early
4. **Always Persist Config and Uploads**: These directories contain critical data
5. **Backup Before Upgrading**: If migrating from the old `/app/public` mount strategy, backup any custom files first

## NFS Storage for Network-Attached Storage

Local-Server-Site-Pusher supports using NFS-mounted storage from NAS devices (Synology, QNAP, TrueNAS) for backups and data storage.

### Quick Setup

1. **Mount NFS on Docker host:**
   ```bash
   sudo mkdir -p /mnt/nas/backups
   sudo mount -t nfs 192.168.1.100:/volume1/backups /mnt/nas/backups
   
   # Make permanent
   echo "192.168.1.100:/volume1/backups /mnt/nas/backups nfs defaults,_netdev 0 0" | sudo tee -a /etc/fstab
   ```

2. **Update docker-compose.yml:**
   ```yaml
   services:
     local-server:
       volumes:
         - ./config:/app/config
         - ./uploads:/app/uploads
         - /mnt/nas/backups:/app/nfs-storage/backups:rw
   ```

3. **Configure in Admin Panel:**
   - Go to **Settings** → **NFS Storage**
   - Enable NFS Storage
   - Add storage path: `/app/nfs-storage/backups`

### Using the NFS Compose File

```bash
# Use the dedicated NFS compose file
docker-compose -f docker-compose.nfs.yml up -d
```

See [NFS_STORAGE_GUIDE.md](NFS_STORAGE_GUIDE.md) for:
- Complete setup instructions for Synology, QNAP, TrueNAS
- Troubleshooting NFS mount issues
- Permission configuration
- Multiple storage path examples
- Health monitoring and failover

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