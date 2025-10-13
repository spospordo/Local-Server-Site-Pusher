# Persistence Fix Summary - Version 2.2.1

## Problem Statement

Several critical settings were not persisting across container redeploys:
- Finance module profile data (demographics, accounts, etc.)
- Vidiots scraper enable/disable state
- GitHub upload enable/disable state

## Root Cause Analysis

The issue was caused by persistent configuration files being copied into the Docker image during the build process. This created a conflict between:
1. **Image config files** - Baked into the Docker image at build time
2. **Volume config files** - User's actual persistent data in volume-mounted directories

When the container was rebuilt and redeployed, there was ambiguity about which config files to use, potentially causing settings to revert to build-time defaults.

## The Fix

### 1. Updated `.dockerignore` File

Added all persistent configuration files to `.dockerignore` to prevent them from being copied into the Docker image:

```
# Exclude persistent config files - these should only exist in volumes
config/config.json
config/.client_auth
config/.finance_key
config/.finance_data
config/.gitconfig
config/ollama-config.json.enc
config/.ollama-key

# Exclude backup files
config/config.json.backup
backups/
```

### 2. How It Works Now

**Before the fix:**
1. Docker build copies config files from source → Docker image
2. Container starts with both image config AND volume config
3. Confusion about which config to use
4. Settings could be lost on redeploy

**After the fix:**
1. Docker build excludes ALL config files (.dockerignore)
2. Docker image contains NO config files
3. Container starts with ONLY volume-mounted config
4. Volume-mounted config/ is the single source of truth
5. ✅ Settings reliably persist across redeploys

## Files That Now Persist Correctly

### Main Configuration
- **`config/config.json`** - All application settings including:
  - Vidiots scraper enabled/disabled state
  - Vidiots cron schedule
  - GitHub Pages upload enabled/disabled state
  - GitHub repository settings and access token
  - All other application settings

### Finance Module
- **`config/.finance_data`** - Encrypted financial data:
  - Account information and balances
  - Demographics and profile data
  - Historical transaction data
- **`config/.finance_key`** - Encryption key (0600 permissions)

### Authentication & Security
- **`config/.client_auth`** - Encrypted client passwords

### GitHub Integration
- **`config/.gitconfig`** - Git user identity for commits

### Ollama AI Integration
- **`config/ollama-config.json.enc`** - Encrypted Ollama configuration
- **`config/.ollama-key`** - Ollama encryption key

### Other Data
- **`config/espresso-data.json`** - Espresso shot tracking data

## Documentation Updates

### Updated `PERSISTENCE.md`
Added comprehensive documentation for all persistent data points:
- ✅ Vidiots Scraper Configuration section
- ✅ Finance Module Data section (with encryption details)
- ✅ Ollama AI Integration section
- ✅ GitHub Integration Settings section
- ✅ Espresso Data section

Each section includes:
- File location
- What data it contains
- Auto-persist status
- Security/encryption details where applicable

### Updated `CHANGELOG.md`
- Version bumped to 2.2.1
- Documented the critical persistence bug fix
- Listed all changes to .dockerignore
- Documented all documentation updates

## Verification

### Automated Tests
Created verification scripts to validate the fix:

1. **`scripts/verify-persistence.sh`** - Validates configuration:
   - Checks .dockerignore excludes all persistent files
   - Verifies docker-compose.yml volume mounts
   - Confirms PERSISTENCE.md documentation
   - Validates config directory structure

2. **`scripts/test-persistence-fix.sh`** - Integration test:
   - Tests .dockerignore functionality
   - Verifies volume mount behavior
   - Documents expected behavior
   - Provides manual verification steps

### Manual Verification Steps

To verify the fix works correctly:

```bash
# 1. Start the container
docker-compose up -d

# 2. Access admin interface
# Navigate to http://localhost:3000/admin

# 3. Configure settings:
#    - Enable Vidiots scraper
#    - Enable GitHub upload
#    - Add Finance profile data

# 4. Rebuild and redeploy container
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# 5. Verify settings persist
# Log in to admin interface again
# ✅ All settings should be preserved!
```

## Technical Details

### Docker Volume Mounts (docker-compose.yml)
```yaml
volumes:
  - ./config:/app/config    # Persistent configuration
  - ./uploads:/app/uploads  # Client file uploads
  - ./public:/app/public    # Web content (optional)
```

### Config File Creation Flow
1. Container starts with volume-mounted (potentially empty) config/ directory
2. Server checks if `config/config.json` exists
3. If not exists: Creates from defaults and saves to volume
4. If exists: Loads from volume
5. All changes are saved to volume-mounted files
6. Volume persists across container rebuilds

### Encryption & Security
- Finance data: AES-256-GCM encryption at rest
- Ollama config: AES-256-GCM encryption at rest
- Client passwords: PBKDF2 hashing
- File permissions: Sensitive files created with 0600 permissions

## Impact

### Issues Resolved
✅ Finance module profile data now persists correctly  
✅ Vidiots scraper enable/disable state now persists  
✅ GitHub upload enable/disable state now persists  
✅ All other configuration settings persist reliably  

### Breaking Changes
None - This is a bug fix that only improves persistence behavior

### Upgrade Instructions
Simply rebuild your container with the new version:

```bash
# Pull the latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

Your existing settings will be preserved because they're already in the volume-mounted config/ directory.

## Version Information

- **Version**: 2.2.1
- **Release Date**: 2025-10-13
- **Previous Version**: 2.2.0
- **Type**: Bug fix release

## Related Documentation

- [PERSISTENCE.md](PERSISTENCE.md) - Complete persistence guide
- [CHANGELOG.md](CHANGELOG.md) - Full change history
- [docker-compose.yml](docker-compose.yml) - Volume mount configuration
- [.dockerignore](.dockerignore) - Files excluded from Docker build

## Scripts Added

- `scripts/verify-persistence.sh` - Automated persistence verification
- `scripts/test-persistence-fix.sh` - Integration test for the fix
