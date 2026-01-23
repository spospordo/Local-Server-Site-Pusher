# NFS Storage Guide

This guide explains how to configure and use NFS-mounted storage with Local-Server-Site-Pusher for backups, uploads, and other data storage needs.

## Overview

The NFS Storage feature allows you to:
- ✅ Use network-attached storage (NAS) like Synology, QNAP, TrueNAS for data storage
- ✅ Configure multiple storage locations with different purposes
- ✅ Automatic health monitoring and failover
- ✅ Graceful degradation when storage becomes unavailable
- ✅ Support for bind-mounted host NFS paths in Docker containers

## Table of Contents

1. [Quick Start](#quick-start)
2. [Host NFS Mount Setup](#host-nfs-mount-setup)
3. [Docker Configuration](#docker-configuration)
4. [Storage Path Configuration](#storage-path-configuration)
5. [API Reference](#api-reference)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

## Quick Start

### Step 1: Mount NFS on Host

First, mount your NFS share on the host machine:

```bash
# Create mount point
sudo mkdir -p /mnt/nas/backups

# Mount NFS share
sudo mount -t nfs 192.168.1.100:/volume1/backups /mnt/nas/backups

# Make mount persistent across reboots
echo "192.168.1.100:/volume1/backups /mnt/nas/backups nfs defaults 0 0" | sudo tee -a /etc/fstab
```

### Step 2: Configure Docker Volume

Update your `docker-compose.yml` to bind-mount the NFS path:

```yaml
services:
  local-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
      - ./uploads:/app/uploads
      - /mnt/nas/backups:/app/nfs-storage/backups:rw
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

### Step 3: Enable and Configure in Admin Panel

1. Navigate to **Admin Panel** → **Settings** → **NFS Storage**
2. Enable NFS Storage
3. Add a storage path:
   - **Name**: "NAS Backups"
   - **Path**: `/app/nfs-storage/backups`
   - **Type**: `nfs`
   - **Purpose**: `backup`
   - **Enabled**: ✓

The system will automatically validate the path and start health monitoring.

## Host NFS Mount Setup

### Linux (Ubuntu/Debian)

```bash
# Install NFS client
sudo apt-get update
sudo apt-get install nfs-common

# Create mount point
sudo mkdir -p /mnt/nas/backups

# Test mount (temporary)
sudo mount -t nfs 192.168.1.100:/volume1/backups /mnt/nas/backups

# Verify mount
df -h | grep nfs
ls -la /mnt/nas/backups

# Make permanent (add to /etc/fstab)
echo "192.168.1.100:/volume1/backups /mnt/nas/backups nfs defaults,_netdev 0 0" | sudo tee -a /etc/fstab

# Test fstab entry
sudo mount -a
```

**Recommended mount options for /etc/fstab:**
```
192.168.1.100:/volume1/backups /mnt/nas/backups nfs rw,hard,intr,rsize=8192,wsize=8192,timeo=14,_netdev 0 0
```

### Synology NAS Configuration

1. **Enable NFS on Synology**:
   - Control Panel → File Services → NFS → Enable NFS
   - Set minimum/maximum NFS protocol to NFSv3 or NFSv4

2. **Create NFS Share**:
   - Control Panel → Shared Folder → Select folder
   - Edit → NFS Permissions → Create
   - Hostname or IP: `192.168.1.50` (your Docker host IP)
   - Privilege: Read/Write
   - Squash: Map all users to admin (or specific user)
   - Security: sys (Authentication)
   - Enable asynchronous (optional, for better performance)

3. **Test from Docker Host**:
   ```bash
   showmount -e 192.168.1.100
   # Should show: /volume1/backups 192.168.1.50
   ```

### TrueNAS Configuration

1. **Create NFS Share**:
   - Sharing → Unix Shares (NFS) → Add
   - Path: `/mnt/tank/backups`
   - Comment: "Docker container backups"
   - Save

2. **Configure NFS Service**:
   - Services → NFS → Configure
   - Enable NFSv3, NFSv4
   - Start automatically: ✓
   - Save and start service

3. **Add Authorized Network**:
   - Edit NFS share
   - Authorized Networks: `192.168.1.0/24` (or specific host IP)
   - Mapall User/Group: (optional, for permission mapping)

## Docker Configuration

### Docker Compose (Recommended)

Create a dedicated NFS storage compose file:

```yaml
# docker-compose.nfs.yml
services:
  local-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      # Required: Config and uploads
      - ./config:/app/config
      - ./uploads:/app/uploads
      
      # NFS Storage: Bind-mount from host
      - /mnt/nas/backups:/app/nfs-storage/backups:rw
      - /mnt/nas/media:/app/nfs-storage/media:rw
      - /mnt/nas/archives:/app/nfs-storage/archives:ro
    
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your-secure-secret
    
    restart: unless-stopped
    
    # Important: Ensure container can access mounted volumes
    user: "1000:1000"  # Match host user that owns NFS mount
```

**Deploy:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.nfs.yml up -d
```

### Docker Run

```bash
docker run -d \
  -p 3000:3000 \
  -v ./config:/app/config \
  -v ./uploads:/app/uploads \
  -v /mnt/nas/backups:/app/nfs-storage/backups:rw \
  --name local-server \
  --user 1000:1000 \
  local-server-site-pusher
```

### Portainer Stack

```yaml
version: '3.8'
services:
  local-server:
    image: spospordo/local-server-site-pusher:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/lib/local-server/config:/app/config
      - /var/lib/local-server/uploads:/app/uploads
      - /mnt/nas/backups:/app/nfs-storage/backups:rw
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your-secure-secret
    restart: unless-stopped
```

## Storage Path Configuration

### Configuration Structure

Storage paths are configured in `config/config.json`:

```json
{
  "nfsStorage": {
    "enabled": true,
    "storagePaths": [
      {
        "id": "nas-backups",
        "name": "NAS Backups",
        "path": "/app/nfs-storage/backups",
        "type": "nfs",
        "enabled": true,
        "purpose": "backup"
      },
      {
        "id": "nas-media",
        "name": "NAS Media Storage",
        "path": "/app/nfs-storage/media",
        "type": "nfs",
        "enabled": true,
        "purpose": "media"
      },
      {
        "id": "local-temp",
        "name": "Local Temporary Storage",
        "path": "/app/temp-storage",
        "type": "local",
        "enabled": true,
        "purpose": "general"
      }
    ],
    "healthCheckInterval": 300000,
    "autoFailover": true,
    "fallbackToLocal": true
  }
}
```

### Storage Path Properties

| Property | Type | Description | Required |
|----------|------|-------------|----------|
| `id` | string | Unique identifier for the storage path | ✓ |
| `name` | string | Human-readable name | ✓ |
| `path` | string | Absolute path to storage location | ✓ |
| `type` | string | Storage type: `nfs`, `local`, `smb`, `other` | Optional (default: `nfs`) |
| `enabled` | boolean | Whether this path is active | Optional (default: `true`) |
| `purpose` | string | Storage purpose: `backup`, `uploads`, `media`, `general` | Optional (default: `general`) |

### Global Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `enabled` | boolean | Enable NFS storage feature | `false` |
| `healthCheckInterval` | number | Health check interval in milliseconds | `300000` (5 min) |
| `autoFailover` | boolean | Automatically failover to degraded paths | `true` |
| `fallbackToLocal` | boolean | Fallback to local storage if all paths fail | `true` |

## API Reference

### Get All Storage Paths

```
GET /admin/api/nfs-storage/paths
Authorization: Required (admin session)
```

**Response:**
```json
{
  "enabled": true,
  "paths": [
    {
      "id": "nas-backups",
      "name": "NAS Backups",
      "path": "/app/nfs-storage/backups",
      "type": "nfs",
      "enabled": true,
      "purpose": "backup",
      "status": {
        "accessible": true,
        "writable": true,
        "readable": true,
        "status": "healthy",
        "error": null,
        "lastChecked": 1234567890
      }
    }
  ],
  "healthCheckInterval": 300000,
  "autoFailover": true,
  "fallbackToLocal": true
}
```

### Add Storage Path

```
POST /admin/api/nfs-storage/paths
Authorization: Required (admin session)
Content-Type: application/json
```

**Request Body:**
```json
{
  "id": "nas-media",
  "name": "Media Storage",
  "path": "/app/nfs-storage/media",
  "type": "nfs",
  "enabled": true,
  "purpose": "media"
}
```

### Update Storage Path

```
PUT /admin/api/nfs-storage/paths/:pathId
Authorization: Required (admin session)
Content-Type: application/json
```

**Request Body:**
```json
{
  "enabled": false
}
```

### Delete Storage Path

```
DELETE /admin/api/nfs-storage/paths/:pathId
Authorization: Required (admin session)
```

### Trigger Health Check

```
POST /admin/api/nfs-storage/health-check
Authorization: Required (admin session)
```

### Enable/Disable NFS Storage

```
POST /admin/api/nfs-storage/toggle
Authorization: Required (admin session)
Content-Type: application/json
```

**Request Body:**
```json
{
  "enabled": true
}
```

## Troubleshooting

### Common Issues

#### 1. Path Not Accessible in Container

**Symptoms:**
- Status: "unavailable"
- Error: "Path does not exist"

**Solutions:**

a) **Verify host mount:**
```bash
# On Docker host
ls -la /mnt/nas/backups
df -h | grep nfs
```

b) **Verify Docker volume binding:**
```bash
docker inspect local-server | grep -A 5 Mounts
```

c) **Check permissions:**
```bash
# On host
ls -ld /mnt/nas/backups
# Should be readable/writable by UID 1000 or container user
```

#### 2. Permission Denied Errors

**Symptoms:**
- Status: "degraded"
- Error: "Path is not writable"

**Solutions:**

a) **Fix host mount permissions:**
```bash
sudo chown -R 1000:1000 /mnt/nas/backups
sudo chmod 755 /mnt/nas/backups
```

b) **Configure NFS export with proper permissions:**

Synology:
- Map all users to admin, or
- Map to specific UID/GID (1000:1000)

TrueNAS:
- Set Mapall User/Group to match container user

c) **Run container as correct user:**
```yaml
services:
  local-server:
    user: "1000:1000"  # Match NFS mount owner
```

#### 3. Stale NFS Handle

**Symptoms:**
- Container can't access files
- `ls` command hangs or fails

**Solutions:**

```bash
# Unmount and remount on host
sudo umount -l /mnt/nas/backups
sudo mount /mnt/nas/backups

# Restart container
docker-compose restart local-server
```

#### 4. NFS Server Unavailable

**Symptoms:**
- Mount fails on host
- Timeout errors

**Solutions:**

a) **Check network connectivity:**
```bash
ping 192.168.1.100
telnet 192.168.1.100 2049
```

b) **Verify NFS service running:**
```bash
showmount -e 192.168.1.100
```

c) **Check firewall rules:**
- Ensure NFS ports (2049, 111) are open
- Allow Docker host IP in NAS firewall

### Diagnostic Commands

**Inside Container:**
```bash
docker exec -it local-server bash
ls -la /app/nfs-storage/backups
touch /app/nfs-storage/backups/test.txt
df -h
```

**On Docker Host:**
```bash
# Show NFS mounts
mount | grep nfs
df -h | grep nfs

# Test NFS server
showmount -e 192.168.1.100

# Check mount options
cat /proc/mounts | grep nfs
```

### Health Status Meanings

| Status | Description | Action Required |
|--------|-------------|-----------------|
| `healthy` | Path accessible, readable, and writable | None |
| `degraded` | Path partially accessible (read-only or limited) | Investigate permissions |
| `unavailable` | Path not accessible | Check mount, network, permissions |
| `unknown` | Not yet checked | Wait for health check or trigger manually |

## Best Practices

### 1. Use Dedicated Mount Points

Create separate mount points for different purposes:

```bash
/mnt/nas/backups    → /app/nfs-storage/backups
/mnt/nas/media      → /app/nfs-storage/media
/mnt/nas/uploads    → /app/nfs-storage/uploads
```

### 2. Configure Automatic Mounts

Always add NFS mounts to `/etc/fstab` with `_netdev` option:

```
192.168.1.100:/volume1/backups /mnt/nas/backups nfs defaults,_netdev 0 0
```

The `_netdev` option ensures the system waits for network before mounting.

### 3. Set Appropriate Health Check Intervals

```json
{
  "healthCheckInterval": 300000  // 5 minutes for production
}
```

- Production: 5-15 minutes
- Development: 1-2 minutes
- Testing: 30 seconds

### 4. Enable Auto-Failover

```json
{
  "autoFailover": true,
  "fallbackToLocal": true
}
```

This ensures the application continues functioning even if NFS becomes unavailable.

### 5. Monitor Storage Status

Regularly check storage health via admin panel or API:

```bash
curl -H "Cookie: connect.sid=..." \
  http://localhost:3000/admin/api/nfs-storage/paths
```

### 6. Backup Configuration

Always backup your NFS storage configuration:

```bash
./scripts/backup-config.sh
```

This includes storage paths and health settings.

### 7. Test Before Production

Test NFS setup thoroughly:

1. Mount NFS on host and verify access
2. Start container and check volume bindings
3. Add storage path via admin panel
4. Verify health check shows "healthy"
5. Test read/write operations
6. Simulate NFS failure and verify failover

### 8. Use Read-Only Mounts for Archives

For archival storage, use read-only mounts:

```yaml
volumes:
  - /mnt/nas/archives:/app/nfs-storage/archives:ro
```

```json
{
  "id": "archives",
  "name": "Archives (Read-Only)",
  "path": "/app/nfs-storage/archives",
  "type": "nfs",
  "enabled": true,
  "purpose": "backup"
}
```

### 9. Security Considerations

- **Limit NFS exports** to specific IPs/subnets
- **Use NFSv4** with Kerberos when possible
- **Set appropriate permissions** on NFS shares
- **Enable firewall rules** to restrict NFS access
- **Regular security audits** of NFS configuration

### 10. Performance Optimization

- Use appropriate rsize/wsize (8192 or higher)
- Enable async mode for better performance (with risks)
- Consider NFSv4 for better performance and security
- Monitor network latency between host and NAS

## Examples

### Example 1: Synology NAS with Multiple Shares

```yaml
# docker-compose.yml
services:
  local-server:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
      - ./uploads:/app/uploads
      - /mnt/synology/backups:/app/nfs-storage/backups:rw
      - /mnt/synology/media:/app/nfs-storage/media:rw
    user: "1000:1000"
    restart: unless-stopped
```

```json
// config/config.json
{
  "nfsStorage": {
    "enabled": true,
    "storagePaths": [
      {
        "id": "synology-backups",
        "name": "Synology Backups",
        "path": "/app/nfs-storage/backups",
        "type": "nfs",
        "enabled": true,
        "purpose": "backup"
      },
      {
        "id": "synology-media",
        "name": "Synology Media",
        "path": "/app/nfs-storage/media",
        "type": "nfs",
        "enabled": true,
        "purpose": "media"
      }
    ],
    "healthCheckInterval": 300000,
    "autoFailover": true,
    "fallbackToLocal": true
  }
}
```

### Example 2: TrueNAS with Failover to Local

```yaml
services:
  local-server:
    volumes:
      - ./config:/app/config
      - ./uploads:/app/uploads
      - /mnt/truenas/primary:/app/nfs-storage/primary:rw
      - ./local-storage:/app/local-storage:rw
```

```json
{
  "nfsStorage": {
    "enabled": true,
    "storagePaths": [
      {
        "id": "truenas-primary",
        "name": "TrueNAS Primary",
        "path": "/app/nfs-storage/primary",
        "type": "nfs",
        "enabled": true,
        "purpose": "general"
      },
      {
        "id": "local-fallback",
        "name": "Local Fallback",
        "path": "/app/local-storage",
        "type": "local",
        "enabled": true,
        "purpose": "general"
      }
    ],
    "autoFailover": true,
    "fallbackToLocal": true
  }
}
```

## Support

For issues and questions:
- Check logs: `docker logs local-server`
- Admin panel: Health status for each storage path
- GitHub Issues: [Report issues](https://github.com/spospordo/Local-Server-Site-Pusher/issues)

## Related Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Container deployment guide
- [PERSISTENCE.md](PERSISTENCE.md) - Data persistence guide
- [PORTAINER.md](PORTAINER.md) - Portainer-specific instructions
- [README.md](README.md) - Main documentation
