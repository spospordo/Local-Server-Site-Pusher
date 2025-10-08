# Portainer Deployment Guide - ARM64 Fix (v1.1.5)

## ✅ DEFINITIVE WORKING SOLUTION - Deploy from Git in Portainer

**Version 1.1.5** provides the definitive fix for ARM64 sharp module issues on Raspberry Pi!

This guide provides the **correct** way to deploy Local-Server-Site-Pusher on Raspberry Pi (ARM64) using Portainer's Git repository feature.

## Prerequisites

1. **Raspberry Pi** with Docker and Portainer installed
2. **Portainer** web interface access
3. **Internet connection** for pulling from GitHub

## Step-by-Step Deployment Instructions

### Method 1: Portainer Stack from Git Repository (Recommended)

This method builds the Docker image directly on your Raspberry Pi with the correct ARM64 binaries.

#### Step 1: Prepare Host Directories

SSH into your Raspberry Pi and create the required directories:

```bash
# Create directories for persistent data
sudo mkdir -p /var/lib/local-server-site-pusher/{config,public,uploads}

# Set proper ownership (1000:1000 is the default node user in the container)
sudo chown -R 1000:1000 /var/lib/local-server-site-pusher/

# Verify directories were created
ls -la /var/lib/local-server-site-pusher/
```

#### Step 2: Create Stack in Portainer

1. **Login to Portainer** web interface
2. Navigate to **Stacks** → **Add stack**
3. **Name your stack**: `local-server-site-pusher`
4. **Build method**: Choose **"Repository"**
5. **Repository URL**: `https://github.com/spospordo/Local-Server-Site-Pusher`
6. **Repository reference**: `refs/heads/main` (or leave blank for default branch)
7. **Compose path**: `docker-compose.portainer.yml`
8. **Environment variables** (optional): Add any custom environment variables
9. Click **Deploy the stack**

#### What Happens During Deployment

Portainer will:
1. Clone the Git repository on your Raspberry Pi
2. Read the `docker-compose.portainer.yml` file
3. Build the Docker image **on your ARM64 Raspberry Pi**
4. Install libvips-dev and all ARM64-specific dependencies
5. Build and install sharp with correct linux-arm64 binaries
6. Start the container

#### Step 3: Verify Deployment

1. In Portainer, go to **Containers**
2. Find the `local-server-site-pusher` container
3. Click on **Logs**
4. You should see:

```
🚀 Local-Server-Site-Pusher Container Starting... [2025-10-08 12:34:56]
📧 Git is available for GitHub operations
📧 No persistent git config found - will use defaults
🔍 Target user: node (UID: 1000, GID: 1000)
🔑 Running as root, attempting to fix permissions...
📁 Checking permissions for /app/config...
✅ Ownership correct for /app/config
📁 Checking permissions for /app/public...
✅ Ownership correct for /app/public
📁 Checking permissions for /app/uploads...
✅ Ownership correct for /app/uploads
🔄 Switching to user node...

> local-server-site-pusher@1.1.5 start
> node server.js

[10/8/2025, 12:34:57 PM] Local Server Site Pusher v1.1.5 running on port 3000
Admin interface: http://localhost:3000/admin
Status endpoint: http://localhost:3000/api/status
```

**✅ NO sharp module errors should appear!**

**New in v1.1.5:** Notice the timestamps in the logs - this makes it easier to track when the container started.

#### Step 4: Access the Application

Open your browser and navigate to:
```
http://<your-raspberry-pi-ip>:3000
```

Default admin credentials:
- **Username**: `admin`
- **Password**: `admin123`

**⚠️ IMPORTANT**: Change the default password immediately after first login!

---

### Method 2: Manual Stack with Build from Git (Alternative)

If Method 1 doesn't work in your Portainer version, use this manual approach:

1. In Portainer, go to **Stacks** → **Add stack**
2. **Name your stack**: `local-server-site-pusher`
3. **Build method**: Choose **"Web editor"**
4. **Paste this docker-compose content**:

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
      - SESSION_SECRET=your-secure-random-string-change-this
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/status"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

5. Click **Deploy the stack**

---

## Troubleshooting

### Issue: Sharp Module Error Still Appears

**Error:**
```
Error: Could not load the "sharp" module using the linux-arm64 runtime
```

**Solution 1: Clear Docker Build Cache**
```bash
# SSH into your Raspberry Pi
ssh pi@raspberrypi.local

# Clear Docker build cache
docker builder prune -af

# Remove the old stack in Portainer and redeploy
```

**Solution 2: Verify Architecture**
```bash
# Check your Raspberry Pi architecture
uname -m
# Should output: aarch64 or arm64
```

**Solution 3: Force Rebuild**
```bash
# SSH into your Raspberry Pi
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Issue: Permission Errors

**Error:**
```
⚠️ Could not fix /app/config permissions
```

**Solution:**
```bash
# Fix ownership of host directories
sudo chown -R 1000:1000 /var/lib/local-server-site-pusher/

# Verify permissions
ls -la /var/lib/local-server-site-pusher/
```

### Issue: Container Keeps Restarting

**Check container logs in Portainer:**
1. Go to **Containers**
2. Click on the container
3. View **Logs**

**Common causes:**
- Port 3000 already in use
- Volume mount path doesn't exist
- Insufficient memory (need at least 512MB RAM)

**Solution:**
```bash
# Check if port 3000 is in use
netstat -tulpn | grep :3000

# If in use, change the port in docker-compose.yml:
ports:
  - "8080:3000"  # Use port 8080 instead
```

---

## Why This Fix Works

### Previous Issues (v1.1.0 - v1.1.2)
The previous versions attempted to fix the sharp ARM64 issue with:
- `npm rebuild sharp --verbose`
- Various npm install flags

However, these approaches failed because **the native libvips libraries were missing**.

### The Solution (v1.1.3)
Version 1.1.3 fixes the root cause by:

1. **Installing libvips-dev** in the Dockerfile:
   ```dockerfile
   RUN apt-get update && apt-get install -y \
       libvips-dev \
       && rm -rf /var/lib/apt/lists/*
   ```

2. **libvips-dev provides** the native C libraries that sharp needs to compile ARM64 binaries

3. **npm rebuild sharp** can now properly build the ARM64 binaries because the required libraries are present

4. **Building on Raspberry Pi** ensures the binaries match the target architecture

### Technical Details

The sharp npm module has these dependencies:
- **libvips**: Native image processing library (C/C++)
- **Platform-specific binaries**: Pre-compiled for each architecture

When building on ARM64 without libvips-dev:
- ❌ npm cannot compile sharp's native components
- ❌ Pre-built binaries from package-lock.json may be for wrong architecture
- ❌ Runtime fails with "Could not load sharp module" error

When building on ARM64 **with** libvips-dev:
- ✅ libvips native libraries are available
- ✅ npm rebuild compiles sharp for linux-arm64
- ✅ Correct ARM64 binaries are built and installed
- ✅ Runtime successfully loads sharp module

---

## Updating to Latest Version

To update to the latest version from Portainer:

1. **Remove the existing stack** in Portainer
2. **Clear build cache** (SSH to Raspberry Pi):
   ```bash
   docker builder prune -af
   ```
3. **Redeploy the stack** following the deployment instructions above

Portainer will pull the latest code from GitHub and rebuild with the fixes.

---

## Alternative: Manual Build on Raspberry Pi

If Portainer Git build doesn't work, you can manually build:

```bash
# SSH into your Raspberry Pi
ssh pi@raspberrypi.local

# Clone the repository
git clone https://github.com/spospordo/Local-Server-Site-Pusher.git
cd Local-Server-Site-Pusher

# Build the image locally
docker build -t local-server-site-pusher:latest .

# Create docker-compose.yml with this content:
cat > docker-compose.yml << 'EOF'
services:
  local-server:
    image: local-server-site-pusher:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/lib/local-server-site-pusher/config:/app/config
      - /var/lib/local-server-site-pusher/public:/app/public
      - /var/lib/local-server-site-pusher/uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your-secure-random-string
    restart: unless-stopped
EOF

# Start the container
docker-compose up -d

# Check logs
docker-compose logs -f
```

---

## Support

If you still encounter issues after following this guide:

1. **Check the logs** in Portainer for specific error messages
2. **Verify your Raspberry Pi specs**:
   - Architecture: `uname -m` (should be aarch64 or arm64)
   - Docker version: `docker --version`
   - Available memory: `free -h`
3. **Clear all Docker cache**: `docker system prune -af`
4. **Create a GitHub issue** with:
   - Complete container logs
   - Your docker-compose configuration
   - Raspberry Pi specs
   - Portainer version

## Related Documentation

- [README.md](README.md) - Project overview
- [DEPLOYMENT.md](DEPLOYMENT.md) - General deployment guide
- [CHANGELOG.md](CHANGELOG.md) - Version history
