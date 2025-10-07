# Portainer ARM64 Deployment Fix - Version 1.1.1

## Issue Summary
When deploying Local-Server-Site-Pusher as a Portainer stack from the Git repository on Raspberry Pi (ARM64), the container fails to start with:

```
Error: Could not load the "sharp" module using the linux-arm64 runtime
Possible solutions:
- Ensure optional dependencies can be installed:
    npm install --include=optional sharp
```

## Root Cause
The issue occurs when:
1. **Using a pre-built Docker image** from Docker Hub that was built on x64 architecture
2. **Docker build cache** contains packages from a previous x64 build
3. **npm ci strict mode** fails to install platform-specific optional dependencies when the package-lock.json doesn't perfectly match the build platform

The sharp image processing library requires platform-specific native bindings (linux-arm64 for Raspberry Pi). If these binaries aren't installed during the Docker build on the ARM64 device, the module fails to load at runtime.

## The Fix (Version 1.1.1)

### 1. Improved Dockerfile Installation Strategy
**Before (v1.1.0):**
```dockerfile
RUN npm ci --include=optional
```

**After (v1.1.1):**
```dockerfile
RUN npm ci --include=optional || npm install --include=optional
```

**Why this works:**
- `npm ci` is tried first (faster, uses lockfile)
- If `npm ci` fails (e.g., lockfile mismatch on ARM64), it falls back to `npm install`
- `npm install` is more flexible and correctly detects the platform to install ARM64 binaries
- `--include=optional` ensures sharp's platform-specific optional dependencies are installed

### 2. Added node_modules to .dockerignore
**Change:**
```
node_modules
```

**Why this works:**
- Prevents any local `node_modules` from the build context from overwriting the freshly installed packages
- Ensures the Docker build's npm install results are not corrupted by copied files

### 3. Enhanced Documentation
- Added ARM64-specific troubleshooting guide to PORTAINER.md
- Clarified that ARM64 users must build from source on ARM64 devices
- Added instructions for clearing Docker build cache

## How to Deploy (Portainer on Raspberry Pi)

### Option 1: Build from Git Repository (Recommended)

In Portainer, create a new stack with this configuration:

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
      - SESSION_SECRET=your-secure-random-string
    restart: unless-stopped
```

**Important**: This builds the image fresh on your Raspberry Pi with the correct ARM64 binaries.

### Option 2: Clear Cache and Rebuild

If you previously deployed and got the sharp error:

1. **Remove the stack** in Portainer
2. **Clear Docker build cache:**
   ```bash
   docker builder prune -af
   ```
3. **Redeploy** the stack using the Git repository build method above

### Option 3: Manual Build on Raspberry Pi

```bash
# SSH into your Raspberry Pi
ssh pi@raspberrypi.local

# Clone the repository
git clone https://github.com/spospordo/Local-Server-Site-Pusher.git
cd Local-Server-Site-Pusher

# Pull latest changes (if already cloned)
git pull

# Build the image locally
docker build -t local-server-site-pusher .

# Use docker-compose or update your Portainer stack to use the local image
docker-compose up -d
```

## Verification

After deployment, check the container logs in Portainer. You should see:

```
🚀 Local-Server-Site-Pusher Container Starting...
📧 Git is available for GitHub operations
📧 Loading persistent git configuration...
🔍 Target user: node (UID: 1000, GID: 1000)
🔑 Running as root, attempting to fix permissions...
📁 Checking permissions for /app/config...
✅ Ownership correct for /app/config
📁 Checking permissions for /app/public...
✅ Ownership correct for /app/public
📁 Checking permissions for /app/uploads...
✅ Ownership correct for /app/uploads
🔄 Switching to user node...

> local-server-site-pusher@1.1.1 start
> node server.js

Local Server Site Pusher running on port 3000
```

**No sharp module errors should appear!**

## Why Pre-Built Images Don't Work

Docker images built on x64 contain x64-specific binaries for sharp:
- `@img/sharp-linux-x64`
- `@img/sharp-libvips-linux-x64`

When you try to run this image on ARM64 (Raspberry Pi), it looks for:
- `@img/sharp-linux-arm64`
- `@img/sharp-libvips-linux-arm64`

These binaries aren't in the image, causing the runtime error.

**Solution**: Always build on the target architecture (ARM64 for Raspberry Pi).

## Technical Details

### What Changed in 1.1.1
1. **Dockerfile**: Added fallback from `npm ci` to `npm install` for platform compatibility
2. **.dockerignore**: Added `node_modules` to prevent build context conflicts
3. **Documentation**: Enhanced ARM64 deployment guidance in PORTAINER.md, DEPLOYMENT.md, and SHARP_ARM64_FIX.md

### npm ci vs npm install
- **npm ci**: Fast, deterministic, but strict about lockfile matching
- **npm install**: Slower, but more flexible with platform detection and optional dependencies

On ARM64, if the package-lock.json was generated on x64, `npm ci` might not correctly install ARM64 optional dependencies. The fallback to `npm install` ensures the correct platform packages are installed.

## Support

If you still encounter issues after applying this fix:

1. **Check Docker build cache**: Run `docker builder prune -af`
2. **Ensure you're building from source**: Don't use `image:` in docker-compose, use `build:`
3. **Verify architecture**: Run `uname -m` on your Raspberry Pi (should show `aarch64` or `armv8l`)
4. **Check container logs**: Look for the exact error message in Portainer logs
5. **Create an issue**: If the problem persists, open an issue on GitHub with:
   - Your docker-compose.yml or Portainer stack configuration
   - Complete container logs
   - Output of `uname -m` from your Raspberry Pi
   - Docker version: `docker --version`

## Related Documentation
- [PORTAINER.md](PORTAINER.md) - Full Portainer deployment guide
- [SHARP_ARM64_FIX.md](SHARP_ARM64_FIX.md) - Original sharp ARM64 fix documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - General deployment guide
- [CHANGELOG.md](CHANGELOG.md) - Version history
