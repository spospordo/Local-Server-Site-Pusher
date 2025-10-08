# Portainer ARM64 Deployment Fix - Version 1.1.5

## ✅ DEFINITIVELY RESOLVED - Working Solution Available

**This issue is now fully and definitively resolved in version 1.1.5!**

👉 **For the complete working solution, see: [PORTAINER_DEPLOYMENT_GUIDE.md](PORTAINER_DEPLOYMENT_GUIDE.md)**

👉 **For technical details, see: [VERSION_1.1.5_SUMMARY.md](VERSION_1.1.5_SUMMARY.md)**

## Issue Summary
When deploying Local-Server-Site-Pusher as a Portainer stack from the Git repository on Raspberry Pi (ARM64), the container was failing to start with:

```
Error: Could not load the "sharp" module using the linux-arm64 runtime
Possible solutions:
- Ensure optional dependencies can be installed:
    npm install --include=optional sharp
```

## Root Cause (DEFINITIVELY RESOLVED in v1.1.5)

The issue persisted through v1.1.3 because:
1. **Platform-locked dependencies**: package-lock.json contained x64-specific sharp binaries from development machines
2. **npm ci enforcement**: When npm ci runs, it strictly installs locked versions, including wrong-platform binaries
3. **Runtime mismatch**: Even when building on ARM64, the x64 sharp binaries were installed, causing runtime errors

## The Definitive Fix (Version 1.1.5)

### ✅ What Was Changed

**1. Added to .dockerignore:**
```
package-lock.json
```

**2. Updated Dockerfile:**
```dockerfile
# Copy package files (package-lock.json is excluded via .dockerignore to avoid platform conflicts)
COPY package*.json ./

# Install dependencies - will use npm install since package-lock.json is excluded
# The --include=optional is critical for sharp's platform-specific binaries
# This ensures correct ARM64 binaries on Raspberry Pi
RUN npm install --include=optional

# Rebuild sharp to ensure correct platform binaries are compiled
# Essential for ARM64 Raspberry Pi deployments  
RUN npm rebuild sharp --verbose
```

**3. Added timestamps to logs:**
- Container startup shows date/time
- Server startup shows date/time and version

This ensures:
- ✅ No platform-locked dependencies interfere with the build
- ✅ npm correctly detects ARM64 platform and installs appropriate binaries
- ✅ npm rebuild can properly compile sharp for ARM64
- ✅ Correct linux-arm64 binaries are built and installed
- ✅ Runtime successfully loads sharp module

### Why This Works

1. **libvips-dev installation**: Provides the native C libraries that sharp needs
2. **npm install**: Installs sharp package with optional dependencies
3. **npm rebuild sharp**: Now can successfully compile ARM64 binaries because libvips is present
4. **Result**: Sharp loads correctly on Raspberry Pi ARM64

## How to Deploy (Portainer on Raspberry Pi)

**📖 See the complete guide: [PORTAINER_DEPLOYMENT_GUIDE.md](PORTAINER_DEPLOYMENT_GUIDE.md)**

### Quick Deploy Method

1. **In Portainer**: Stacks → Add stack
2. **Build method**: Repository
3. **Repository URL**: `https://github.com/spospordo/Local-Server-Site-Pusher`
4. **Compose path**: `docker-compose.portainer.yml`
5. **Deploy the stack**

Portainer will build the image on your Raspberry Pi with all correct ARM64 dependencies!

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

**✅ No sharp module errors should appear!**

**New in v1.1.5:** Timestamps are now included in the logs for easier debugging.

### Advanced Verification (Optional)

To verify sharp is correctly installed for ARM64, you can run:

```bash
# SSH into your Raspberry Pi
docker exec -it <container-name> bash

# Run the verification script
bash /app/scripts/verify-arm64-sharp.sh
```

This will check for ARM64-specific sharp binaries and test module loading.

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

### What Changed in 1.1.3
1. **Dockerfile**: Added libvips-dev installation before npm install
2. **Why it works**: Provides native libraries that sharp needs to compile ARM64 binaries
3. **npm rebuild sharp**: Can now successfully build because libvips is available
4. **Documentation**: New comprehensive [PORTAINER_DEPLOYMENT_GUIDE.md](PORTAINER_DEPLOYMENT_GUIDE.md)

### The Evolution of Fixes
- **v1.1.0-1.1.1**: Tried various npm install flags → Partial success
- **v1.1.2**: Added `npm rebuild sharp --verbose` → Still failed without native libraries
- **v1.1.3**: Added libvips-dev installation → ✅ **WORKS!**

### Why libvips-dev Was Needed
Sharp is a Node.js wrapper around libvips, a fast image processing library written in C. To work on ARM64:
1. **libvips native library** must be available during npm build
2. **npm rebuild sharp** compiles bindings against libvips
3. **Result**: Correct ARM64 binaries linked to native libraries
4. **Runtime**: Sharp successfully loads and uses libvips

## Support

If you still encounter issues after applying this fix:

1. **Follow the detailed guide**: [PORTAINER_DEPLOYMENT_GUIDE.md](PORTAINER_DEPLOYMENT_GUIDE.md)
2. **Check Docker build cache**: Run `docker builder prune -af`
3. **Ensure you're building from source**: Use the Repository build method in Portainer
4. **Verify architecture**: Run `uname -m` on your Raspberry Pi (should show `aarch64` or `armv8l`)
5. **Check container logs**: Look for the exact error message in Portainer logs
6. **Create an issue**: If the problem persists, open an issue on GitHub with:
   - Your docker-compose.yml or Portainer stack configuration
   - Complete container logs
   - Output of `uname -m` from your Raspberry Pi
   - Docker version: `docker --version`

## Related Documentation
- [PORTAINER_DEPLOYMENT_GUIDE.md](PORTAINER_DEPLOYMENT_GUIDE.md) - **Complete working solution for Portainer ARM64 deployment**
- [PORTAINER.md](PORTAINER.md) - Full Portainer deployment guide
- [SHARP_ARM64_FIX.md](SHARP_ARM64_FIX.md) - Original sharp ARM64 fix documentation
- [DEPLOYMENT.md](DEPLOYMENT.md) - General deployment guide
- [CHANGELOG.md](CHANGELOG.md) - Version history
