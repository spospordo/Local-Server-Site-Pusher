# NFS Network Drive Connection for Backups & Restore

## Overview

The NFS (Network File System) network drive connection feature allows administrators to configure remote storage for automatic backup and restore operations. This provides a reliable off-site backup solution for your site configurations and data.

## Features

- **Secure Credential Storage**: All NFS connection credentials are encrypted using AES-256-GCM encryption
- **Connection Management**: Add, edit, delete, and test NFS connections through the admin interface
- **Mount/Unmount Control**: Manually mount and unmount NFS shares as needed
- **Automatic Backup Upload**: Upload current configuration backups to NFS storage
- **Easy Restore**: Browse available backups on NFS and restore with one click
- **Validation & Error Handling**: Comprehensive connection validation and error messages

## Prerequisites

### Server Requirements

The server must have NFS client tools installed. For Docker deployments, this is handled automatically in the Dockerfile. For manual installations:

**Debian/Ubuntu:**
```bash
sudo apt-get install nfs-common
```

**RHEL/CentOS/Fedora:**
```bash
sudo yum install nfs-utils
```

### NFS Server Requirements

You need access to an NFS server with:
- An NFS export configured and accessible
- Network connectivity from your server to the NFS server
- Appropriate permissions on the NFS share

## Setup Guide

### 1. Access the Admin Dashboard

Navigate to `http://your-server:3000/admin` and log in with admin credentials.

### 2. Open NFS Settings

1. Click on the **Settings** tab
2. Select the **General** sub-tab
3. Scroll down to the **NFS Network Drive** section

### 3. Add an NFS Connection

Click **Add NFS Connection** and fill in the required fields:

#### Required Fields

- **Connection Name**: A friendly name for this connection (e.g., "Backup Server")
- **NFS Server Host/IP**: The IP address or hostname of your NFS server
  - Example: `192.168.1.100` or `nas.local`
- **Export Path**: The NFS export path on the server (must start with `/`)
  - Example: `/volume1/backups`

#### Optional Fields

- **Mount Options**: Additional NFS mount options
  - Examples: `vers=4`, `soft`, `timeo=30`, `rsize=8192`
  - Multiple options can be comma-separated: `vers=4,soft,timeo=30`
- **Mount as Read-Only**: Check this box for read-only access
- **Use for Backups**: Enable automatic backup management for this connection

### 4. Test the Connection

Before saving, click **Test Connection** to verify:
- The NFS server is reachable
- The export path is valid
- Permissions are correctly configured
- The system can mount and access the share

### 5. Save the Connection

If the test is successful, click **Save** to store the connection.

## Usage

### Mounting an NFS Share

1. Locate your NFS connection in the list
2. Click the **Mount** button
3. Wait for confirmation that the mount was successful

### Uploading Backups

1. Click **Manage Backups** on your NFS connection
2. In the Upload section, click **Upload Current Configuration**
3. Confirm the upload
4. Your current configuration will be exported and uploaded to `backups/` directory on the NFS share

Backup files are named with timestamp: `site-backup-YYYY-MM-DDTHH-MM-SS.json`

### Restoring from Backups

1. Click **Manage Backups** on your NFS connection
2. The **Available Backups** section lists all backups found on the NFS share
3. Click **Restore** next to the backup you want to restore
4. Confirm the restore operation
5. The page will reload automatically after successful restore

**⚠️ Warning**: Restoring a backup will overwrite your current configuration. Existing credentials (API keys, passwords) will be preserved if they are not included in the backup file.

### Unmounting an NFS Share

1. Locate your mounted NFS connection in the list
2. Click the **Unmount** button
3. Wait for confirmation that the unmount was successful

### Editing a Connection

1. Click the **Edit** button on the connection
2. Modify the connection details as needed
3. **Note**: You cannot edit a connection while it's mounted. Unmount it first.
4. Click **Save**

### Deleting a Connection

1. Click the **Delete** button on the connection
2. Confirm the deletion
3. **Note**: The connection will be automatically unmounted before deletion

## Security

### Credential Encryption

All NFS connection credentials are encrypted at rest using:
- **Algorithm**: AES-256-GCM
- **Key Storage**: Encryption keys are stored in `config/.nfs-key` with 0600 permissions
- **Encrypted Data**: Connection details are stored in `config/nfs-config.json.enc`

### Network Security

- Connections should be made over trusted networks (VPN, internal network)
- Consider using NFSv4 with Kerberos authentication for enhanced security
- Use read-only mounts when write access is not required

### Access Control

- NFS connection management requires admin authentication
- All API endpoints are protected with session-based authentication
- Mount operations run with the container's user privileges

## Troubleshooting

### "NFS client tools not installed"

**Problem**: The test connection fails with a message about missing NFS tools.

**Solution**: 
- For Docker deployments: Rebuild the container with the updated Dockerfile
- For manual installations: Install `nfs-common` (Debian/Ubuntu) or `nfs-utils` (RHEL/CentOS)

```bash
# Debian/Ubuntu
sudo apt-get update && sudo apt-get install nfs-common

# RHEL/CentOS
sudo yum install nfs-utils
```

### "Mount failed: permission denied"

**Problem**: Unable to mount the NFS share due to permission issues.

**Possible causes and solutions**:

1. **NFS Export not configured properly**
   - Check your NFS server's `/etc/exports` file
   - Ensure the export includes your server's IP address
   - Example export: `/volume1/backups 192.168.1.0/24(rw,sync,no_subtree_check)`

2. **Client IP not allowed**
   - Add your server's IP to the NFS server's allowed hosts
   - Restart NFS server after updating exports

3. **Firewall blocking**
   - Ensure NFS ports are open (typically 2049, 111, and ephemeral ports)
   - Check both server and client firewalls

### "Connection timeout"

**Problem**: Test connection times out.

**Solutions**:
- Verify network connectivity: `ping nfs-server-ip`
- Check if NFS server is running
- Verify firewall rules allow NFS traffic
- Ensure the export path exists on the NFS server

### "Stale file handle"

**Problem**: Mounted share becomes inaccessible with stale file handle errors.

**Solutions**:
- Unmount and remount the share
- Check if the NFS server restarted or the export was modified
- Consider using the `soft` mount option for better error handling

### "Upload/Download failed"

**Problem**: Backup operations fail even though the share is mounted.

**Possible causes**:
- Share mounted as read-only (check mount options)
- Insufficient disk space on NFS server
- Permission issues on the NFS export
- Network connectivity interrupted

**Solutions**:
1. Verify mount is not read-only
2. Check available space on NFS server
3. Ensure write permissions on the export
4. Test network connectivity

## Best Practices

### Regular Backups

- Schedule regular configuration exports (manually or via scripts)
- Test restore procedures periodically
- Keep multiple backup versions (don't overwrite)

### Mount Management

- Unmount shares when not actively in use to prevent stale handles
- Use the `soft` mount option to handle temporary network issues gracefully
- Consider `timeo=30` to reduce wait times for unresponsive servers

### Network Configuration

- Use static IP addresses for NFS servers
- Configure NFS over a dedicated backup network if possible
- Use NFSv4 for better security and performance

### Monitoring

- Monitor the System Logs (Settings > Logs) for NFS-related messages
- Look for mount/unmount operations and any errors
- Categories: SYSTEM

## NFS Mount Options Reference

Common mount options you can use in the "Mount Options" field:

| Option | Description |
|--------|-------------|
| `vers=4` | Use NFSv4 protocol (recommended) |
| `vers=3` | Use NFSv3 protocol |
| `soft` | Return error if server doesn't respond (recommended for backups) |
| `hard` | Keep retrying if server doesn't respond |
| `timeo=30` | Set timeout to 3 seconds (value in deciseconds) |
| `retrans=2` | Number of retransmissions for soft mounts |
| `rsize=8192` | Read buffer size |
| `wsize=8192` | Write buffer size |
| `tcp` | Use TCP protocol (default in NFSv4) |
| `udp` | Use UDP protocol |
| `noatime` | Don't update access times (better performance) |
| `actimeo=30` | Set all cache timeouts to 3 seconds |

Example combinations:
- **Reliable backup mount**: `vers=4,soft,timeo=30,rsize=8192,wsize=8192`
- **High-performance mount**: `vers=4,tcp,rsize=65536,wsize=65536,noatime`
- **Legacy compatibility**: `vers=3,tcp,soft,timeo=50`

## Synology NFS Configuration

### Overview

Synology NAS devices are a popular choice for NFS network storage, but they require specific configuration to work reliably. This section provides Synology-specific guidance.

### Enabling NFS on Synology

1. **Enable NFS Service**
   - Go to **Control Panel** > **File Services** > **NFS**
   - Check **Enable NFS** service
   - **Enable NFSv3** (required - most compatible)
   - Consider **Enable NFSv4** if your DSM version supports it (DSM 7.0+)
   - Click **Apply**

2. **Configure Shared Folder for NFS**
   - Go to **Control Panel** > **Shared Folder**
   - Select the folder you want to export via NFS
   - Click **Edit** > **NFS Permissions**
   - Click **Create** to add a new NFS rule:
     - **Server or IP address**: Enter your client IP or network (e.g., `192.168.1.0/24`)
     - **Privilege**: Read/Write or Read Only
     - **Squash**: Select **Map all users to admin** for simplicity, or **No mapping** for stricter security
     - **Security**: `sys` (default)
     - **Enable asynchronous**: Unchecked (more reliable)
     - **Allow connections from non-privileged ports**: Checked
     - **Allow users to access mounted subfolders**: Checked if needed
   - Click **OK** and **Save**

### Synology Export Path Format

Synology uses a specific format for NFS export paths:

**Format**: `/volume[number]/[SharedFolderName]/[optional/subfolder/path]`

**Examples**:
- Single volume: `/volume1/backups`
- Multiple volumes: `/volume2/HomeBackup`
- With subfolder: `/volume3/BackupShared/HomeServer`

**Finding Your Path**:
1. SSH into Synology or use File Station
2. Run: `showmount -e localhost`
3. Or check: **Control Panel** > **Shared Folder** > Note the volume location

### Recommended Mount Options for Synology

The system automatically validates mount options and provides recommendations for Synology servers.

#### Basic (Most Compatible)
```
rw,_netdev,vers=3
```
Use this first - works with most Synology DSM versions.

#### Reliable (Recommended for Production)
```
rw,_netdev,vers=3,soft,timeo=30
```
Handles network interruptions gracefully, good for backups.

#### High Performance
```
rw,_netdev,vers=3,rsize=8192,wsize=8192,noatime
```
Better throughput, suitable for frequent large file transfers.

#### Read-Only
```
ro,_netdev,vers=3
```
For backup browsing/restore only.

### Common Synology NFS Issues

#### Issue: "Protocol not supported" or Version Mismatch

**Cause**: Attempting to use NFSv4 when Synology only has NFSv3 enabled, or using SMB options.

**Solution**:
1. Use `vers=3` in mount options (Synology default)
2. Verify NFS service is enabled in Control Panel > File Services
3. Check that "Enable NFSv3" is checked
4. Avoid SMB/CIFS-specific options like `uid=`, `gid=`, `file_mode=`, `dir_mode=`

**The system will warn you** if you use incompatible options.

#### Issue: Permission Denied

**Cause**: Client IP not allowed in NFS permissions or wrong Squash setting.

**Solution**:
1. Verify your client IP is in the NFS permissions list
2. Check Squash setting - try "Map all users to admin" for troubleshooting
3. Ensure the shared folder has appropriate permissions
4. Verify no firewall rules blocking NFS ports (2049, 111)

#### Issue: Connection Timeout

**Cause**: Network issues, firewall, or NFS service not running.

**Solution**:
1. Test connectivity: `ping [synology-ip]`
2. Verify NFS service is running on Synology
3. Check firewall settings on both Synology and client
4. Ensure correct IP/hostname
5. Try IP address instead of hostname if DNS might be an issue

#### Issue: Export Path Not Found

**Cause**: Incorrect export path format or folder not shared via NFS.

**Solution**:
1. Verify export path format: `/volume1/ShareName`
2. Check that the shared folder has NFS permissions configured
3. List available exports: `showmount -e [synology-ip]`
4. Path is case-sensitive

### Invalid Options for NFS (SMB/CIFS Only)

The following options are for SMB/CIFS mounts and **will cause errors** with NFS:

**Do NOT use these with NFS**:
- `uid=` - User ID mapping (SMB only)
- `gid=` - Group ID mapping (SMB only)
- `file_mode=` - File permission mask (SMB only)
- `dir_mode=` - Directory permission mask (SMB only)
- `username=` - Authentication username (SMB only)
- `password=` - Authentication password (SMB only)
- `domain=` - Windows domain (SMB only)
- `credentials=` - Credentials file (SMB only)

**The system automatically detects and blocks these options.**

### Testing Your Synology NFS Connection

1. **Use the Test Connection feature** before saving
2. The system will validate your mount options
3. Watch for warnings about NFS version or incompatible options
4. Test with basic options first: `rw,_netdev,vers=3`
5. If connection fails, the error message will provide specific guidance

### Synology DSM Version Differences

- **DSM 6.x**: NFSv3 is most reliable, NFSv4 may have issues
- **DSM 7.0+**: NFSv4 support is improved but still test with NFSv3 first
- **All versions**: NFSv3 with basic options is the safest starting point

### Example fstab Line for Synology

When the system generates an fstab entry for Synology, it follows this format:

```
[synology-ip]:/volume[X]/[ShareName] /mnt/mountpoint nfs rw,_netdev,vers=3 0 0
```

**Real example**:
```
192.168.1.100:/volume3/BackupShared/HomeServer /mnt/backup nfs rw,_netdev,vers=3,soft,timeo=30 0 0
```

### Quick Start for Synology Users

1. **Enable NFS on Synology**: Control Panel > File Services > NFS > Enable NFS + Enable NFSv3
2. **Share Folder**: Control Panel > Shared Folder > Edit > NFS Permissions > Add your client IP
3. **Find Export Path**: Usually `/volume1/[YourSharedFolder]`
4. **Add Connection in Admin UI**:
   - Name: My Synology Backup
   - Host: Your Synology IP
   - Export Path: /volume1/backups
   - Mount Options: Click "Use Synology Template" or enter: `rw,_netdev,vers=3`
5. **Test Connection**: System will validate and provide feedback
6. **Save and Mount**: If test succeeds, save and mount the connection

## API Reference

For developers integrating with the NFS feature:

### Endpoints

All endpoints require admin authentication.

#### Check NFS Support
```
GET /admin/api/nfs/supported
```

#### Get All Connections
```
GET /admin/api/nfs/connections
```

#### Get Specific Connection
```
GET /admin/api/nfs/connections/:id
```

#### Test Connection
```
POST /admin/api/nfs/test
Content-Type: application/json

{
  "name": "Backup Server",
  "host": "192.168.1.100",
  "exportPath": "/volume1/backups",
  "mountOptions": "vers=4,soft",
  "readOnly": false
}
```

#### Add Connection
```
POST /admin/api/nfs/connections
Content-Type: application/json

{
  "name": "Backup Server",
  "host": "192.168.1.100",
  "exportPath": "/volume1/backups",
  "mountOptions": "vers=4,soft",
  "readOnly": false,
  "useForBackups": true
}
```

#### Update Connection
```
PUT /admin/api/nfs/connections/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "mountOptions": "vers=4,soft,timeo=30"
}
```

#### Delete Connection
```
DELETE /admin/api/nfs/connections/:id
```

#### Mount Connection
```
POST /admin/api/nfs/connections/:id/mount
```

#### Unmount Connection
```
POST /admin/api/nfs/connections/:id/unmount
```

#### Upload Backup to NFS
```
POST /admin/api/nfs/connections/:id/upload-backup
Content-Type: application/json

{
  "filename": "optional-custom-name.json"
}
```

#### List Backups on NFS
```
GET /admin/api/nfs/connections/:id/backups
```

#### Restore Backup from NFS
```
POST /admin/api/nfs/connections/:id/restore-backup
Content-Type: application/json

{
  "remotePath": "backups/site-backup-2024-01-22T15-30-00.json"
}
```

## File Locations

### Configuration Files
- **NFS Connections**: `config/nfs-config.json.enc` (encrypted)
- **Encryption Key**: `config/.nfs-key` (permissions: 0600)

### Mount Points
- **Base Directory**: `nfs-mounts/`
- **Individual Mounts**: `nfs-mounts/{connection-id}/`

### Temporary Files
- **Temp Directory**: `temp/`
- Used during upload/download operations
- Automatically cleaned up after operations

## Support

For issues or questions:
1. Check the System Logs in Settings > Logs
2. Review this documentation
3. Consult the main README.md for general server information
4. Check NFS server documentation for server-side configuration

## Version History

- **v2.2.17**: Initial NFS network drive support
  - Connection management (add, edit, delete, test)
  - Secure credential encryption (AES-256-GCM)
  - Mount/unmount operations
  - Backup upload to NFS
  - Backup restore from NFS
  - Admin UI integration
