# Portainer Deployment Guide

This guide provides step-by-step instructions for deploying Local-Server-Site-Pusher in Portainer environments, including TrueNAS Scale.

## Important: Volume Mount Strategy (Updated)

**Static files (smart-mirror.html, index.html, etc.) are now served directly from the Docker image** to ensure they update correctly after code changes and container redeployment.

### What Changed
- **Removed:** `/app/public` volume mount
- **Kept:** `/app/config` and `/app/uploads` volume mounts for persistent data

### Why This Approach?
- ✅ **Reliable updates:** Static files automatically update when you redeploy with a new image
- ✅ **Simpler deployment:** Fewer volume mounts to manage
- ✅ **No sync issues:** No risk of stale files in mounted volumes
- ✅ **Dynamic content preserved:** Generated content (Espresso, Vidiots) is automatically regenerated from config/uploads on startup

### Backwards Compatibility
If you're upgrading from a previous version that mounted `/app/public`:
1. **Backup any custom files** from your public directory before updating (e.g., custom HTML, images)
2. **Generated content** (vidiots/espresso outputs) will be automatically regenerated from config/uploads
3. **Update your docker-compose** to remove the `/app/public` mount
4. **Redeploy** - static files will come from the new image

## Quick Deployment (Recommended)

### Step 1: Create Host Directories

On your host system, create directories for persistent data:

```bash
# Choose a location for your data (adjust path as needed)
sudo mkdir -p /var/lib/local-server-site-pusher/{config,uploads}

# Set proper ownership (optional - container will auto-fix if needed)
sudo chown -R 1000:1000 /var/lib/local-server-site-pusher/
```

**Note:** We only mount `config` and `uploads` directories. Static files (smart-mirror.html, index.html, etc.) are served directly from the Docker image, ensuring they update correctly after code changes and redeploys.

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
      # Only mount config and uploads - static files come from the image
      - /var/lib/local-server-site-pusher/config:/app/config
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

If you want to build from source (recommended for ARM64/Raspberry Pi):

```yaml
services:
  local-server:
    build:
      context: https://github.com/spospordo/Local-Server-Site-Pusher.git
      # For Raspberry Pi/ARM64, ensure buildkit is used for better compatibility
    ports:
      - "3000:3000"
    volumes:
      # Only mount config and uploads - static files come from the image
      - /var/lib/local-server-site-pusher/config:/app/config
      - /var/lib/local-server-site-pusher/uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your-secure-secret-here
    restart: unless-stopped
```

**Note for ARM64/Raspberry Pi Users:**
The Dockerfile automatically detects your platform and installs the correct ARM64 binaries for the sharp image processing library. If you encounter issues with sharp not loading, ensure you're building fresh (not using a pre-built image for a different architecture).

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
- `/var/lib/local-server-site-pusher/uploads:/app/uploads`

**Note:** Static files are served from the Docker image, not from a volume mount.

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

### Sharp ARM64 Module Loading Error (Raspberry Pi)

If you see this error on Raspberry Pi/ARM64:
```
Error: Could not load the "sharp" module using the linux-arm64 runtime
Possible solutions:
- Ensure optional dependencies can be installed:
    npm install --include=optional sharp
```

**Root Cause**: This occurs when:
1. Using a pre-built image from a different architecture (x64 instead of ARM64)
2. Build cache contains packages from a previous x64 build
3. The container image wasn't built on the ARM64 platform

**Solution 1: Build from Source on Raspberry Pi (Recommended)**
```yaml
services:
  local-server:
    build:
      context: https://github.com/spospordo/Local-Server-Site-Pusher.git
    ports:
      - "3000:3000"
    volumes:
      # Only mount config and uploads - static files come from the image
      - /var/lib/local-server-site-pusher/config:/app/config
      - /var/lib/local-server-site-pusher/uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your-secure-secret-here
    restart: unless-stopped
```

**Solution 2: Clear Docker Build Cache**
```bash
# In Portainer, remove the stack completely
# Then clear Docker build cache
docker builder prune -af

# Redeploy the stack to force a fresh build
```

**Solution 3: Use ARM64-specific Image (if available)**
```yaml
services:
  local-server:
    image: spospordo/local-server-site-pusher:latest-arm64  # ARM64-specific image
    # ... rest of configuration
```

**Verification**:
After redeployment, check the container logs. You should see:
```
🚀 Local-Server-Site-Pusher Container Starting...
📧 Git is available for GitHub operations
...
✅ Server started successfully on port 3000
```
No sharp module errors should appear.

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

## Running a Parallel Test Container

You can run a test/staging container alongside your production container to safely test new features, configurations, or bugfixes without impacting production users.

### Why Use a Parallel Test Container?

- **Safe Testing**: Test new features or updates without affecting production
- **QA Workflows**: Validate changes in a staging environment
- **Branch Testing**: Deploy and test specific branches or pull requests
- **Configuration Testing**: Test new configurations before applying to production

### Quick Setup for Parallel Containers

#### Step 1: Create Test Environment Directories

```bash
# Create separate directories for the test container
sudo mkdir -p /var/lib/local-server-site-pusher-test/{config,uploads}
sudo chown -R 1000:1000 /var/lib/local-server-site-pusher-test/
```

#### Step 2: Deploy Parallel Test Stack in Portainer

This configuration allows you to run **both production and test containers simultaneously** in a single stack.

1. In Portainer, go to **Stacks** → **Add Stack**
2. Name your stack: `local-server-parallel-test`
3. Use this docker-compose configuration:

```yaml
services:
  # Production Container (Port 3000)
  local-server:
    image: spospordo/local-server-site-pusher:latest
    container_name: local-server-main
    ports:
      - "3000:3000"
    volumes:
      # Only mount config and uploads - static files come from the image
      - /var/lib/local-server-site-pusher/config:/app/config
      - /var/lib/local-server-site-pusher/uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=main-production-secret-change-this
    restart: unless-stopped

  # Test Container (Port 3001)
  local-server-test:
    # Build from a specific branch for testing
    build:
      context: https://github.com/spospordo/Local-Server-Site-Pusher.git#feature/my-test-branch
      # Change 'feature/my-test-branch' to your branch name
    container_name: local-server-test
    ports:
      - "3001:3000"  # Accessible on port 3001
    volumes:
      # Only mount config and uploads - static files come from the image
      - /var/lib/local-server-site-pusher-test/config:/app/config
      - /var/lib/local-server-site-pusher-test/uploads:/app/uploads
    environment:
      - NODE_ENV=development
      - SESSION_SECRET=test-secret-change-this
    restart: unless-stopped
```

4. **Customize environment variables** (SESSION_SECRET, NODE_ENV) as needed
5. Click **Deploy the stack**

#### Step 3: Access Your Containers

- **Production**: `http://your-server-ip:3000`
- **Test**: `http://your-server-ip:3001`

### Using Different Branches for Testing

To deploy from a specific branch, simply update the build context in the test container configuration. This allows you to easily test different branches without affecting production:

**Examples:**
```yaml
# Test a feature branch
build:
  context: https://github.com/spospordo/Local-Server-Site-Pusher.git#feature/new-module

# Test a staging branch
build:
  context: https://github.com/spospordo/Local-Server-Site-Pusher.git#staging

# Test a specific pull request
build:
  context: https://github.com/spospordo/Local-Server-Site-Pusher.git#refs/pull/123/head

# Test main branch (same as production)
build:
  context: https://github.com/spospordo/Local-Server-Site-Pusher.git#main
```

**To use the same image as production** (for testing config changes only):
```yaml
local-server-test:
  image: spospordo/local-server-site-pusher:latest  # Same as production
  # ... rest of configuration
```

### Alternative: Using docker-compose.parallel-test.yml

The repository includes a ready-to-use example file:

1. In Portainer, go to **Stacks** → **Add Stack**
2. Choose **Repository** build method
3. **Repository URL**: `https://github.com/spospordo/Local-Server-Site-Pusher`
4. **Compose path**: `docker-compose.parallel-test.yml`
5. **Environment variables** (optional): Add custom branch name
6. Deploy the stack

### Troubleshooting Parallel Deployments

#### Port Conflicts

**Symptom**: Container fails to start with "port already in use" error

**Check for conflicts:**
```bash
# Check if ports are in use
netstat -tulpn | grep -E ':(3000|3001)'
# Or using ss
ss -tulpn | grep -E ':(3000|3001)'
```

**Solutions:**
1. **Stop conflicting service**: Identify and stop the service using the port
2. **Use different port**: Change the host port mapping in your stack:
   ```yaml
   ports:
     - "3002:3000"  # Use port 3002 instead of 3001
   ```
3. **Update firewall rules**: Ensure the new port is accessible

#### Branch Not Found / Build Fails

**Symptom**: "reference not found" or "unable to prepare context" errors

**Check branch exists:**
```bash
# List all branches in the repository
git ls-remote --heads https://github.com/spospordo/Local-Server-Site-Pusher.git
```

**Solutions:**
1. **Verify branch name**: Ensure the branch name is exactly correct (case-sensitive)
2. **Use full reference**: Try using the full ref path:
   ```yaml
   build:
     context: https://github.com/spospordo/Local-Server-Site-Pusher.git#refs/heads/my-branch
   ```
3. **Check repository access**: Ensure the repository is public or credentials are configured
4. **Try main branch first**: Test with `#main` to verify connectivity

#### Volume Path Conflicts

**Symptom**: Both containers accessing same data, configurations overwriting each other

**Verify separate paths:**
```bash
# Check that both directory sets exist
ls -la /var/lib/local-server-site-pusher/
ls -la /var/lib/local-server-site-pusher-test/
```

**Solutions:**
1. **Use distinct paths**: Ensure main and test use different directories:
   - Main: `/var/lib/local-server-site-pusher/`
   - Test: `/var/lib/local-server-site-pusher-test/`
2. **Create missing directories**:
   ```bash
   sudo mkdir -p /var/lib/local-server-site-pusher-test/{config,public,uploads}
   sudo chown -R 1000:1000 /var/lib/local-server-site-pusher-test/
   ```
3. **Check permissions**: Both directory sets need proper ownership

#### Test Container Build Takes Too Long

**Symptom**: Build process appears stuck or times out

**This is normal for:**
- ARM64/Raspberry Pi builds (10-15 minutes)
- First-time builds (downloading dependencies)
- Feature branches with new dependencies

**Solutions:**
1. **Be patient**: Especially on ARM64, builds can take 15+ minutes
2. **Check Portainer logs**: Monitor build progress in the stack logs
3. **Use pre-built image**: For faster deployment, use the same image as main:
   ```yaml
   local-server-test:
     image: spospordo/local-server-site-pusher:latest
   ```

#### Containers Interfere With Each Other

**Symptom**: Changes in one container affect the other

**Verification:**
```bash
# Check volume mounts for each container
docker inspect local-server-main | grep -A 10 Mounts
docker inspect local-server-test | grep -A 10 Mounts
```

**Solution**: Ensure volume paths are completely separate and containers have different names

### Best Practices for Parallel Testing

1. **Always use different ports**: Never map both containers to the same host port
2. **Separate data directories**: Use distinct paths for config, public, and uploads
3. **Different session secrets**: Use unique SESSION_SECRET for each container
4. **Clear naming**: Use descriptive container names (e.g., `local-server-main`, `local-server-test`)
5. **Test thoroughly**: Verify test container works before promoting changes to production
6. **Monitor resources**: Running multiple containers requires adequate RAM (1GB+ recommended)
7. **Document your branches**: Keep track of which branch is deployed in test environment

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