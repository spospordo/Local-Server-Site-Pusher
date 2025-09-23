# Persistent Settings Guide

This guide ensures your Local-Server-Site-Pusher settings survive container updates and re-deployments.

## Overview of Persistent Data

The following data is automatically persisted when properly configured:

### 🔗 Useful Links
- **Location**: `config/config.json` → `usefulLinks` array
- **Contains**: Custom links added through admin interface
- **Auto-persist**: ✅ Yes, saved immediately when modified

### 👥 Client Accounts and Data
- **Location**: 
  - `config/config.json` → `connectedDevices` array (device list)
  - `config/.client_auth` (client passwords, encrypted)
- **Contains**: Registered devices, client authentication data
- **Auto-persist**: ✅ Yes, saved immediately when modified

### 💾 Storage Settings
- **Location**: `config/config.json` → `storage` section
- **Contains**: File size limits, total storage limits
- **Auto-persist**: ✅ Yes, saved immediately when modified

### ⚙️ Administrative Settings
- **Location**: `config/config.json` → `server.admin`, `client`, etc.
- **Contains**: Admin credentials, server configuration, client settings
- **Auto-persist**: ✅ Yes, saved immediately when modified

## Container Update Best Practices

### 1. Pre-Update Backup

**Always backup before updates:**

```bash
# Automatic backup with timestamp
./scripts/backup-config.sh

# Manual backup to specific location
tar -czf my_backup.tar.gz config/
```

### 2. Safe Container Update Process

**Option A: Using the Update Script (Recommended)**

```bash
# This script handles backup, update, and validation automatically
./scripts/update-container.sh
```

**Option B: Manual Update Process**

```bash
# 1. Backup configuration
./scripts/backup-config.sh

# 2. Stop container
docker-compose down

# 3. Pull updates (if using git)
git pull

# 4. Rebuild container
docker-compose build --no-cache

# 5. Start container
docker-compose up -d

# 6. Verify (wait 10 seconds for startup)
curl http://localhost:3000/api/status
```

### 3. Volume Mount Configuration

**Essential volume mounts for persistence:**

```yaml
# docker-compose.yml
services:
  local-server:
    build: .
    volumes:
      # CRITICAL: Mount config directory for persistence
      - ./config:/app/config
      
      # CRITICAL: Mount uploads directory for client file persistence
      - ./uploads:/app/uploads
      
      # OPTIONAL: Mount public directory for web content
      - ./public:/app/public
      
      # For production, use absolute paths:
      # - /var/lib/local-server/config:/app/config
      # - /var/lib/local-server/uploads:/app/uploads
      # - /var/lib/local-server/public:/app/public
```

### 4. Permission Management

**Ensure proper permissions:**

```bash
# Check current permissions
ls -la config/ uploads/

# Fix permissions if needed (Linux/macOS)
sudo chown -R $(id -u):$(id -g) config/ uploads/
chmod 755 config/ uploads/
chmod 600 config/.client_auth  # Secure client auth file
```

## Recovery Procedures

### Configuration Corruption Recovery

If configuration becomes corrupted:

```bash
# 1. Validate and attempt automatic repair
node scripts/validate-config.js

# 2. If repair fails, restore from backup
./scripts/restore-config.sh <backup_file>

# 3. Restart container
docker-compose restart
```

### Complete Data Loss Recovery

If the entire config directory is lost:

```bash
# 1. Stop container
docker-compose down

# 2. Restore from latest backup
./scripts/restore-config.sh

# 3. Start container
docker-compose up -d
```

## Verification Steps

After any update or recovery:

### 1. Check Container Health
```bash
# Container should be running
docker-compose ps

# API should respond
curl http://localhost:3000/api/status
```

### 2. Verify Persistent Data
```bash
# Check configuration file exists and is valid
node scripts/validate-config.js

# Check admin interface loads
curl -I http://localhost:3000/admin
```

### 3. Test Settings Persistence
1. Open admin interface: http://localhost:3000/admin
2. Log in with your credentials
3. Verify all settings are preserved:
   - Useful links
   - Client settings
   - Storage settings
   - Admin configuration

## Troubleshooting

### Settings Not Persisting

**Symptom**: Changes made in admin interface are lost after container restart

**Solutions**:
1. Check volume mount: `docker-compose config | grep volumes`
2. Check directory permissions: `ls -la config/`
3. Check disk space: `df -h`
4. Review container logs: `docker-compose logs`

### Permission Denied Errors

**Symptom**: `EACCES: permission denied, open '/app/config/config.json'`

**Solutions**:
1. Fix host directory ownership:
   ```bash
   sudo chown -R $(id -u):$(id -g) config/ uploads/
   ```

2. Or run container with user mapping:
   ```yaml
   services:
     local-server:
       user: "1000:1000"  # Your user:group ID
   ```

### Configuration Validation Errors

**Symptom**: Startup warnings about configuration issues

**Solutions**:
1. Run validation tool: `node scripts/validate-config.js`
2. Restore from backup: `./scripts/restore-config.sh <backup_file>`
3. Reset to defaults: `rm config/config.json && docker-compose restart`

## Backup Strategy

### Automated Backups

For production environments, set up automated backups:

```bash
# Add to crontab for daily backups
# 0 2 * * * /path/to/Local-Server-Site-Pusher/scripts/backup-config.sh

# Or use a systemd timer
sudo systemctl edit --force --full local-server-backup.timer
```

### Backup Retention

The backup script automatically keeps the last 10 backups. For longer retention:

```bash
# Manual backup with custom name
tar -czf "monthly_backup_$(date +%Y_%m).tar.gz" config/

# Move to long-term storage
mv monthly_backup_*.tar.gz /backup/long-term/
```

## Migration Between Hosts

When moving to a new server:

```bash
# On old server
./scripts/backup-config.sh
scp backups/config_backup_*.tar.gz newserver:/tmp/

# On new server
cd /path/to/Local-Server-Site-Pusher
./scripts/restore-config.sh /tmp/config_backup_*.tar.gz
docker-compose up -d
```

## Production Considerations

### Security
- Store backups in secure location with encryption
- Use strong admin passwords
- Set custom SESSION_SECRET environment variable
- Regular security updates

### Monitoring
- Monitor disk space for config directory
- Set up alerts for configuration validation failures
- Monitor backup script execution

### High Availability
- Consider external session store (Redis) for multiple instances
- Use shared storage for config directory in clustered deployments
- Implement configuration synchronization between instances