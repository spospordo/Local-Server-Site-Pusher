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
