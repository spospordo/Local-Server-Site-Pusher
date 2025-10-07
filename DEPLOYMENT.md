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

The container supports ARM64 architecture (Raspberry Pi 4, 5, etc.). To build for ARM64:

```bash
# On ARM64 device (Raspberry Pi)
docker build -t local-server-site-pusher .

# On x64 machine for ARM64 target (requires Docker Buildx)
docker buildx build --platform linux/arm64 -t local-server-site-pusher:arm64 .

# Multi-platform build for both architectures
docker buildx build --platform linux/amd64,linux/arm64 -t spospordo/local-server-site-pusher:latest --push .
```

**Note**: Version 1.1.0+ removes the `--omit=dev` flag from npm install to ensure all optional dependencies (including platform-specific binaries for sharp) are properly installed. This fixes ARM64/Raspberry Pi compatibility issues.

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
```