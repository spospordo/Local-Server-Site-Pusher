# NFS Testing Guide

This guide provides step-by-step instructions for testing the NFS network drive functionality once you have access to an NFS server.

## Prerequisites

1. **NFS Server**: You need access to an NFS server with an export configured
2. **Docker with Capabilities**: The container needs privileges to mount NFS shares

## Docker Deployment with NFS Support

### Option 1: Using --privileged (Easiest)

```bash
docker run -d \
  --privileged \
  -p 3000:3000 \
  -v $(pwd)/config:/app/config \
  --name local-server \
  local-server-site-pusher
```

### Option 2: Using Specific Capabilities (More Secure)

```bash
docker run -d \
  --cap-add SYS_ADMIN \
  --cap-add DAC_READ_SEARCH \
  -p 3000:3000 \
  -v $(pwd)/config:/app/config \
  --name local-server \
  local-server-site-pusher
```

### Option 3: Docker Compose

Update your `docker-compose.yml`:

```yaml
version: '3'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
      - ./public:/app/public
      - ./uploads:/app/uploads
    privileged: true  # Or use cap_add below
    # cap_add:
    #   - SYS_ADMIN
    #   - DAC_READ_SEARCH
```

## Test Scenarios

### 1. Test NFS Client Installation

**Expected**: NFS tools should be installed

```bash
docker exec local-server which mount.nfs
```

Should output: `/sbin/mount.nfs`

### 2. Test NFS Connection Setup

1. Access admin dashboard: `http://localhost:3000/admin`
2. Go to **Settings** > **General** > **NFS Network Drive**
3. Click **Add NFS Connection**
4. Fill in test data:
   - **Name**: Test Backup Server
   - **Host**: Your NFS server IP (e.g., 192.168.1.100)
   - **Export Path**: Your NFS export (e.g., /volume1/backups)
   - **Mount Options**: vers=4,soft,timeo=30
   - **Read-Only**: Unchecked
   - **Use for Backups**: Checked

5. Click **Test Connection**

**Expected Results**:
- ✅ Success: "Connection successful"
- ❌ Failure: Clear error message explaining the issue

### 3. Test Connection Validation

Try invalid configurations:

**Test A: Invalid Export Path**
- Export Path: `volume1/backups` (missing leading /)
- Expected: Validation error "Export path must start with /"

**Test B: Missing Required Fields**
- Leave Name empty
- Expected: Validation error "Connection name is required"

**Test C: Unreachable Server**
- Host: 192.168.1.254 (non-existent)
- Expected: Timeout error after 10 seconds

### 4. Test Mount Operation

1. Save a valid connection
2. Click **Mount** button
3. Wait for confirmation

**Expected Results**:
- Status badge changes from "Unmounted" to "✓ Mounted"
- Success message displayed
- Mount button changes to "Unmount"

**Verify Mount**:
```bash
docker exec local-server mount | grep nfs
```

Should show your NFS mount point.

### 5. Test Backup Upload

1. Click **Manage Backups** on mounted connection
2. Click **Upload Current Configuration**
3. Confirm upload

**Expected Results**:
- Success message: "Backup uploaded successfully"
- Backup appears in "Available Backups" list after refresh
- Filename format: `site-backup-YYYY-MM-DDTHH-MM-SS.json`

**Verify Upload**:
```bash
docker exec local-server ls -la /app/nfs-mounts/[connection-id]/backups/
```

### 6. Test Backup List

1. In Backup Manager modal, click **Refresh List**

**Expected Results**:
- All .json files in backups/ directory are listed
- Each backup has a "Restore" button
- Empty state message if no backups exist

### 7. Test Backup Restore

**⚠️ Warning**: This will overwrite your current config

1. Create a test backup first
2. Make a small config change (e.g., add a useful link)
3. Upload new backup to NFS
4. Click **Restore** on the older backup
5. Confirm restoration

**Expected Results**:
- Success message: "Backup restored successfully! The page will reload..."
- Page reloads automatically
- Configuration reverts to older state
- Existing credentials (passwords, API keys) are preserved

### 8. Test Unmount Operation

1. Click **Unmount** button on mounted connection
2. Wait for confirmation

**Expected Results**:
- Status badge changes to "Unmounted"
- Success message displayed
- Mount button reappears

**Verify Unmount**:
```bash
docker exec local-server mount | grep nfs
```

Should return nothing (mount removed).

### 9. Test Edit Connection

1. Click **Edit** button on a connection
2. Modify the name or mount options
3. Click **Save**

**Expected Results**:
- Success message displayed
- Updated values reflected in connection list

**Edge Case**: Try editing a mounted connection
- Expected: Error "Cannot update mounted connection. Unmount first."

### 10. Test Delete Connection

1. Ensure connection is unmounted
2. Click **Delete** button
3. Confirm deletion

**Expected Results**:
- Confirmation dialog appears
- Connection removed from list
- Success message displayed

**Edge Case**: Delete a mounted connection
- Expected: Automatic unmount before deletion

### 11. Test Error Handling

**Test A: Permission Denied**
- Use an NFS export with no write permissions
- Try to upload backup
- Expected: Clear error message about permissions

**Test B: Network Disconnection**
- Mount a connection
- Disconnect network or stop NFS server
- Try to upload backup
- Expected: Timeout or network error message

**Test C: Stale File Handle**
- Mount a connection
- Restart NFS server
- Try to list backups
- Expected: Error message, or automatic remount attempt

**Test D: Disk Space**
- Use NFS share with full disk
- Try to upload backup
- Expected: Error message about disk space

### 12. Test Security

**Credential Encryption**:
```bash
docker exec local-server cat /app/config/nfs-config.json.enc
```
- Expected: Base64-encoded encrypted data (not readable JSON)

**Key Permissions**:
```bash
docker exec local-server ls -la /app/config/.nfs-key
```
- Expected: `-rw-------` (0600 permissions)

**No Plaintext in Logs**:
```bash
docker logs local-server | grep -i "password\|credential"
```
- Expected: No sensitive data in plain text

## Troubleshooting

### Mount Permission Denied

**Problem**: Cannot mount NFS share

**Solutions**:
1. Check NFS server exports:
   ```bash
   # On NFS server
   sudo exportfs -v
   ```

2. Verify client IP is allowed in `/etc/exports`

3. Restart NFS server:
   ```bash
   # On NFS server (Debian/Ubuntu)
   sudo systemctl restart nfs-kernel-server
   ```

### Container Can't Mount

**Problem**: "mount: only root can use "--types" option"

**Solution**: Run container with `--privileged` or add capabilities:
```bash
docker run --cap-add SYS_ADMIN ...
```

### Stale File Handle

**Problem**: NFS share becomes unresponsive

**Solution**:
1. Unmount from admin UI
2. Or force unmount:
   ```bash
   docker exec local-server umount -f /app/nfs-mounts/[connection-id]
   ```

## Test Checklist

Use this checklist to verify all functionality:

- [ ] NFS client tools installed
- [ ] Connection test succeeds
- [ ] Validation prevents invalid configs
- [ ] Mount operation works
- [ ] Backup upload succeeds
- [ ] Backup list displays correctly
- [ ] Backup restore works and preserves credentials
- [ ] Unmount operation works
- [ ] Edit connection (unmounted) works
- [ ] Edit mounted connection is blocked
- [ ] Delete connection works
- [ ] Delete mounted connection auto-unmounts
- [ ] Permission errors handled gracefully
- [ ] Network errors handled gracefully
- [ ] Credentials are encrypted
- [ ] No plaintext credentials in logs
- [ ] System logs show NFS operations

## Example NFS Server Setup (For Testing)

If you need to set up a quick test NFS server:

### On Ubuntu/Debian:

```bash
# Install NFS server
sudo apt-get install nfs-kernel-server

# Create export directory
sudo mkdir -p /srv/nfs/backups
sudo chmod 777 /srv/nfs/backups

# Add to /etc/exports
echo "/srv/nfs/backups 192.168.1.0/24(rw,sync,no_subtree_check,no_root_squash)" | sudo tee -a /etc/exports

# Apply changes
sudo exportfs -ra
sudo systemctl restart nfs-kernel-server

# Verify
sudo exportfs -v
```

### Test from Client:

```bash
# Check exports
showmount -e [nfs-server-ip]

# Manual mount test
sudo mount -t nfs [nfs-server-ip]:/srv/nfs/backups /mnt
ls -la /mnt
sudo umount /mnt
```

## Performance Testing

### Large Backup Upload

1. Create a large configuration with lots of data
2. Upload to NFS
3. Measure time taken

**Expected**: Upload completes within reasonable time (dependent on network speed)

### Multiple Connections

1. Add 3-5 different NFS connections
2. Mount all of them
3. Upload backups to each

**Expected**: All operations succeed independently

## Reporting Issues

When reporting issues, include:

1. Docker logs:
   ```bash
   docker logs local-server --tail 100
   ```

2. System logs from admin UI (Settings > Logs)

3. NFS server configuration (`/etc/exports`)

4. Network topology (container and NFS server on same network?)

5. Error messages from admin UI

6. Steps to reproduce the issue

## Success Criteria

The NFS implementation is working correctly if:

- ✅ All CRUD operations work (Create, Read, Update, Delete connections)
- ✅ Mount/unmount operations succeed
- ✅ Backup upload creates files on NFS share
- ✅ Backup list shows all available backups
- ✅ Restore successfully imports configuration
- ✅ Credentials remain encrypted
- ✅ Error messages are clear and helpful
- ✅ System logs show NFS operations
- ✅ No crashes or memory leaks during operations
