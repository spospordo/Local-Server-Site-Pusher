# Portainer ARM64 Deployment Fix - Version 1.1.2

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
4. **npm install alone doesn't rebuild** platform-specific native modules like sharp for the target architecture

The sharp image processing library requires platform-specific native bindings (linux-arm64 for Raspberry Pi). Even when these optional dependencies are installed, they may not be rebuilt for the specific platform where Docker is building the image.

## The Fix (Version 1.1.2)

### 1. Explicit Sharp Rebuild Step
**Before (v1.1.1):**
```dockerfile
RUN npm ci --include=optional || npm install --include=optional
```

**After (v1.1.2):**
```dockerfile
RUN npm ci --include=optional || npm install --include=optional

# Explicitly rebuild sharp for the current platform architecture
# This ensures ARM64 binaries are correctly installed when building on Raspberry Pi
RUN npm rebuild sharp --verbose
```

**Why this works:**
- `npm ci` or `npm install` installs the dependencies
- `npm rebuild sharp --verbose` forces sharp to be rebuilt specifically for the current platform (ARM64)
- This ensures the correct linux-arm64 binaries are compiled/downloaded during the Docker build
- The `--verbose` flag helps with debugging if issues occur

### 2. Maintained .dockerignore Protection
**Keeps:**
```
node_modules
```

**Why this is important:**
- Prevents any local `node_modules` from the build context from interfering
- Ensures the Docker build's npm install and rebuild results are not corrupted

### 3. Enhanced Documentation
- Updated troubleshooting guide with v1.1.2 fix information
- Clarified the importance of explicit platform rebuild for sharp

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

> local-server-site-pusher@1.1.2 start
> node server.js

Local Server Site Pusher running on port 3000
```

**No sharp module errors should appear!**

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

### What Changed in 1.1.2
1. **Dockerfile**: Added explicit `npm rebuild sharp --verbose` step after npm install
2. **Why it works**: Forces sharp to rebuild its native bindings for the exact platform where Docker is building
3. **Documentation**: Updated with v1.1.2 fix and troubleshooting information

### npm ci vs npm install vs npm rebuild
- **npm ci**: Fast, deterministic, but strict about lockfile matching
- **npm install**: Slower, but more flexible with platform detection and optional dependencies
- **npm rebuild**: Forces recompilation of native modules for the current platform

The key insight is that even when npm installs the sharp package with `--include=optional`, it may not rebuild the native bindings for the specific platform. By explicitly running `npm rebuild sharp`, we ensure the ARM64 binaries are properly compiled/downloaded during the Docker build on Raspberry Pi.

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
