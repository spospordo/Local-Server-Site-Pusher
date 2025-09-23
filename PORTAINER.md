# Portainer Deployment Guide

This guide provides step-by-step instructions for deploying Local-Server-Site-Pusher in Portainer environments, including TrueNAS Scale.

## Quick Deployment (Recommended)

### Step 1: Create Host Directories

On your host system, create directories for persistent data:

```bash
# Choose a location for your data (adjust path as needed)
sudo mkdir -p /var/lib/local-server-site-pusher/{config,public}

# Set proper ownership (optional - container will auto-fix if needed)
sudo chown -R 1000:1000 /var/lib/local-server-site-pusher/
```

### Step 2: Deploy via Portainer Stack

1. In Portainer, go to **Stacks** → **Add Stack**
2. Name your stack: `local-server-site-pusher`
3. Use this docker-compose configuration:

```yaml
services:
  local-server:
    image: spospordo/local-server-site-pusher:latest
    ports:
      - "3000:3000"
    volumes:
      # Use absolute paths for Portainer
      - /var/lib/local-server-site-pusher/config:/app/config
      - /var/lib/local-server-site-pusher/public:/app/public
      - /var/lib/local-server-site-pusher/uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=change-this-to-a-secure-random-string
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

4. Click **Deploy the stack**

### Step 3: Verify Deployment

**Option 1: Use the deployment test script (Recommended)**
```bash
# Download and run the test script
curl -sSL https://raw.githubusercontent.com/spospordo/Local-Server-Site-Pusher/main/test-deployment.sh | bash
```

**Option 2: Manual verification**
1. Check the container logs in Portainer
2. Look for successful startup messages:
   ```
   🚀 Local-Server-Site-Pusher Container Starting...
   ✅ Ownership correct for /app/config
   Local Server Site Pusher running on port 3000
   ```
3. Access the application at `http://your-server-ip:3000`

## Alternative Deployment Methods

### Method 1: Git Repository Build

If you want to build from source:

```yaml
services:
  local-server:
    build:
      context: https://github.com/spospordo/Local-Server-Site-Pusher.git
    ports:
      - "3000:3000"
    volumes:
      - /var/lib/local-server-site-pusher/config:/app/config
      - /var/lib/local-server-site-pusher/public:/app/public
      - /var/lib/local-server-site-pusher/uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your-secure-secret-here
    restart: unless-stopped
```

### Method 2: Portainer App Template

Create a custom app template in Portainer with these settings:

**General Settings:**
- Name: `Local Server Site Pusher`
- Description: `Web server with admin interface for serving content and integrations`
- Categories: `Web Server, Development`

**Container Settings:**
- Image: `spospordo/local-server-site-pusher:latest`
- Ports: `3000:3000`

**Volumes:**
- `/var/lib/local-server-site-pusher/config:/app/config`
- `/var/lib/local-server-site-pusher/public:/app/public`
- `/var/lib/local-server-site-pusher/uploads:/app/uploads`

**Environment Variables:**
- `NODE_ENV=production`
- `SESSION_SECRET=` (user should set this)

## TrueNAS Scale Specific Instructions

### Using TrueNAS Scale UI

1. **Apps** → **Available Applications** → **Custom App**
2. **Application Name**: `local-server-site-pusher`
3. **Container Images**:
   - **Image Repository**: `spospordo/local-server-site-pusher`
   - **Image Tag**: `latest`
4. **Container Configuration**:
   - **Port Forwarding**: Host Port `3000` → Container Port `3000`
5. **Storage and Persistence**:
   - **Host Path Volume**: 
     - Host Path: `/mnt/pool1/apps/local-server/config`
     - Mount Path: `/app/config`
   - **Host Path Volume**: 
     - Host Path: `/mnt/pool1/apps/local-server/public`
     - Mount Path: `/app/public`
   - **Host Path Volume**: 
     - Host Path: `/mnt/pool1/apps/local-server/uploads`
     - Mount Path: `/app/uploads`
6. **Environment Variables**:
   - `NODE_ENV=production`
   - `SESSION_SECRET=your-secure-secret-here`

### Using TrueNAS Scale with docker-compose

1. Enable the Docker service in TrueNAS Scale
2. SSH into your TrueNAS system
3. Create the deployment directory:
   ```bash
   mkdir -p /mnt/pool1/docker/local-server-site-pusher
   cd /mnt/pool1/docker/local-server-site-pusher
   ```
4. Create docker-compose.yml with the stack configuration above
5. Run: `docker-compose up -d`

## Troubleshooting

### Container Startup Loop

If you see the container restarting repeatedly with errors like:
```
npm: exec: line 0: start: not found
🚀 Local-Server-Site-Pusher Container Starting...
🔄 Switching to user node...
npm: exec: line 0: start: not found
```

**Solution**: This indicates an issue with the entrypoint script. Ensure you're using the latest image version:
```bash
docker pull spospordo/local-server-site-pusher:latest
```

If the issue persists, try rebuilding from source:
```yaml
services:
  local-server:
    build:
      context: https://github.com/spospordo/Local-Server-Site-Pusher.git
    # ... rest of configuration
```

### Permission Issues

If you see permission errors:

```
⚠️ Could not fix /app/config permissions
Config directory not writable, using in-memory configuration only
```

**Solution 1: Fix host directory ownership**
```bash
sudo chown -R 1000:1000 /var/lib/local-server-site-pusher/
```

**Solution 2: Use user mapping in stack**
```yaml
services:
  local-server:
    user: "1000:1000"  # Add this line
    # ... rest of configuration
```

**Solution 3: For SELinux systems**
```bash
# If using SELinux, you may need to set the context
sudo setsebool -P container_manage_cgroup on
sudo semanage fcontext -a -t container_file_t "/var/lib/local-server-site-pusher(/.*)?"
sudo restorecon -R /var/lib/local-server-site-pusher/
```

### Configuration Not Persisting

**Check volume mounts:**
1. In Portainer, inspect the container
2. Verify volumes are mounted correctly
3. Check host directory exists and is writable

**Check container logs:**
Look for these success messages:
- `✅ Ownership correct for /app/config`
- `Created default configuration file`

### Container Won't Start

**Check port conflicts:**
```bash
# On host system, check if port 3000 is in use
netstat -tulpn | grep :3000
```

**Check resource limits:**
Ensure your system has enough resources (512MB RAM minimum)

**Check image availability:**
```bash
docker pull spospordo/local-server-site-pusher:latest
```

## Security Considerations

### Change Default Credentials

After deployment:
1. Access `http://your-server-ip:3000/admin`
2. Login with default credentials: `admin` / `admin123`
3. **Immediately change the password** in the admin interface

### Secure Session Secret

Set a secure session secret in your environment variables:
```yaml
environment:
  - SESSION_SECRET=your-very-secure-random-string-at-least-32-characters
```

### Network Security

Consider using a reverse proxy (nginx, traefik) for HTTPS and additional security.

### File Permissions

The container automatically handles file permissions, but ensure your host directories are not world-writable:
```bash
chmod 755 /var/lib/local-server-site-pusher/
chmod 755 /var/lib/local-server-site-pusher/config
chmod 755 /var/lib/local-server-site-pusher/public
```

## Data Backup

### Backup Configuration

```bash
# Create backup of configuration
tar -czf local-server-backup-$(date +%Y%m%d).tar.gz \
  /var/lib/local-server-site-pusher/config/

# Or use the built-in backup script (if available)
docker exec local-server-site-pusher-local-server-1 /app/scripts/backup-config.sh
```

### Restore Configuration

```bash
# Extract backup to host directory
tar -xzf local-server-backup-20240101.tar.gz -C /

# Or use the built-in restore script (if available)
docker exec local-server-site-pusher-local-server-1 /app/scripts/restore-config.sh /backup/file.tar.gz
```

## Support

If you encounter issues:

1. Check container logs in Portainer
2. Verify volume mounts and permissions
3. Test with a fresh deployment
4. Check the [GitHub Issues](https://github.com/spospordo/Local-Server-Site-Pusher/issues) page

For additional support, create an issue on GitHub with:
- Your docker-compose.yml configuration
- Container logs
- Host system details (TrueNAS Scale version, etc.)