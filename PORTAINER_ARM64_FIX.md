# Portainer ARM64 Deployment Fix - Version 1.1.3

## ✅ RESOLVED - Working Solution Available

**This issue is now fully resolved in version 1.1.3!**

👉 **For the complete working solution, see: [PORTAINER_DEPLOYMENT_GUIDE.md](PORTAINER_DEPLOYMENT_GUIDE.md)**

## Issue Summary
When deploying Local-Server-Site-Pusher as a Portainer stack from the Git repository on Raspberry Pi (ARM64), the container was failing to start with:

```
Error: Could not load the "sharp" module using the linux-arm64 runtime
Possible solutions:
- Ensure optional dependencies can be installed:
    npm install --include=optional sharp
```

## Root Cause (RESOLVED in v1.1.3)

The issue occurred because:
1. **Missing native libraries**: The sharp npm module requires libvips native libraries to build ARM64 binaries
2. **npm rebuild alone was insufficient**: Without libvips-dev installed, npm rebuild couldn't compile the correct binaries
3. **Platform-specific dependencies**: Sharp needs platform-specific native bindings (linux-arm64 for Raspberry Pi)

## The Fix (Version 1.1.3)

### ✅ What Was Changed

**Added to Dockerfile:**
```dockerfile
# Install build dependencies for sharp (especially needed for ARM64)
# libvips-dev provides the native libraries that sharp requires
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*
```

This simple addition ensures:
- ✅ libvips native libraries are available during Docker build
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

> local-server-site-pusher@1.1.3 start
> node server.js

Local Server Site Pusher running on port 3000
```

**✅ No sharp module errors should appear!**

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
