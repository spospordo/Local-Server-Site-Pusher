# SFTP Backup Integration Guide

## Overview

The SFTP Backup Integration feature allows you to automatically upload and download backup files to/from remote SFTP storage (e.g., Synology NAS, remote server) without additional host or container-level configuration.

## Features

- ✅ **Secure Configuration**: All credentials encrypted using AES-256-GCM
- ✅ **Dual Authentication**: Support for both password and SSH key-based authentication
- ✅ **Connection Testing**: Built-in diagnostics with actionable error messages
- ✅ **Streaming Transfers**: Handles large files efficiently without memory issues
- ✅ **Automatic Backup**: One-click backup generation and upload
- ✅ **Remote Browse**: List and download backups from SFTP server
- ✅ **Secure Logging**: All operations logged securely (no credentials exposed)

## Quick Start

### 1. Access Admin Dashboard

Navigate to `http://localhost:3000/admin` and login with your admin credentials.

### 2. Configure SFTP

1. Go to **Settings** → **General** tab
2. Scroll to **🌐 SFTP Backup Management** section
3. Expand **⚙️ SFTP Configuration**

### 3. Enter Connection Details

**Required Fields:**
- **Host / IP Address**: Your SFTP server hostname or IP (e.g., `nas.example.com` or `192.168.1.100`)
- **Port**: SFTP port (default: 22)
- **Username**: SFTP username
- **Remote Path**: Directory on server to store backups (default: `/`)
- **Authentication Method**: Choose `Password` or `SSH Private Key`

**For Password Authentication:**
- Enter your SFTP password

**For Key-Based Authentication:**
- Paste your SSH private key (OpenSSH format)
- Optionally enter passphrase if key is encrypted

### 4. Test Connection

Click **🔍 Test Connection** to verify your settings. The system will:
- Attempt to connect to the SFTP server
- Verify authentication
- Check access to the remote path
- Display detailed diagnostics if connection fails

### 5. Upload Backup

Once configured and tested:
1. Expand **📤 Upload Backup to SFTP** section
2. Click **☁️ Upload New Backup to SFTP**
3. The system will:
   - Generate a complete backup
   - Upload it to your SFTP server
   - Display upload progress and results

### 6. Download Backup

To restore from a remote backup:
1. Expand **📥 Download Backup from SFTP** section
2. Click **🔄 Refresh Backup List**
3. Browse available backups
4. Click **📥 Download & Import** to restore

## Common SFTP Server Configurations

### Synology NAS

**Setup on Synology:**
1. Open **Control Panel** → **File Services**
2. Enable **SFTP** service
3. Note the SFTP port (usually 22)
4. Create a dedicated user for backups:
   - Go to **Control Panel** → **User & Group**
   - Create new user (e.g., `backup-user`)
   - Grant permissions to backup folder

**In Admin Dashboard:**
```
Host: 192.168.1.100 (or nas.local)
Port: 22
Username: backup-user
Remote Path: /volume1/backups
Authentication: Password
```

**Recommended Permissions:**
- Read/Write access to backup directory
- No admin privileges required

### OpenSSH Server (Linux)

**Setup on Linux Server:**
```bash
# Install OpenSSH server
sudo apt-get install openssh-server

# Create backup user
sudo useradd -m -s /bin/bash backup-user

# Set password
sudo passwd backup-user

# Create backup directory
sudo mkdir -p /home/backup-user/backups
sudo chown backup-user:backup-user /home/backup-user/backups

# Verify SFTP subsystem is enabled
grep "Subsystem sftp" /etc/ssh/sshd_config

# Restart SSH service
sudo systemctl restart ssh
```

**In Admin Dashboard:**
```
Host: server.example.com
Port: 22
Username: backup-user
Remote Path: /home/backup-user/backups
Authentication: Password or SSH Key
```

### AWS EC2 / Cloud Instances

**In Admin Dashboard:**
```
Host: ec2-xx-xx-xx-xx.compute.amazonaws.com
Port: 22
Username: ubuntu (or ec2-user for Amazon Linux)
Remote Path: /home/ubuntu/backups
Authentication: SSH Private Key
```

**Key Setup:**
1. Use the same private key you use to SSH into the instance
2. Paste the full key including headers:
   ```
   -----BEGIN OPENSSH PRIVATE KEY-----
   ...
   -----END OPENSSH PRIVATE KEY-----
   ```

### FTP/SFTP Hosting Providers

Most hosting providers support SFTP. Check your hosting control panel for:
- SFTP hostname
- Port number (usually 22)
- Username and password
- Home directory path

**Example for shared hosting:**
```
Host: ftp.yourdomain.com
Port: 22
Username: username@yourdomain.com
Remote Path: /backups
Authentication: Password
```

## SSH Key Authentication

### Generating SSH Keys

On your local machine or server:

```bash
# Generate a new SSH key pair
ssh-keygen -t ed25519 -C "backup-key" -f ~/.ssh/backup_key

# Or use RSA if ed25519 not supported
ssh-keygen -t rsa -b 4096 -C "backup-key" -f ~/.ssh/backup_key

# View the private key
cat ~/.ssh/backup_key

# View the public key (to add to server)
cat ~/.ssh/backup_key.pub
```

### Adding Public Key to Server

**On the SFTP server:**

```bash
# Switch to backup user
sudo su - backup-user

# Create .ssh directory if it doesn't exist
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add your public key
cat >> ~/.ssh/authorized_keys
# Paste the public key content, then press Ctrl+D

# Set correct permissions
chmod 600 ~/.ssh/authorized_keys
```

**In Admin Dashboard:**
1. Select **SSH Private Key** authentication method
2. Paste the **private key** content (from `~/.ssh/backup_key`)
3. Enter passphrase if the key is encrypted
4. Test connection

### Converting Keys to OpenSSH Format

If you have a key in PuTTY (`.ppk`) or other format:

```bash
# Convert PuTTY key to OpenSSH
sudo apt-get install putty-tools
puttygen key.ppk -O private-openssh -o key_openssh

# Convert PEM to OpenSSH
ssh-keygen -p -m RFC4716 -f key.pem
```

## Security Best Practices

### Credential Security

1. **Strong Passwords**: Use complex passwords (12+ characters, mixed case, numbers, symbols)
2. **Key-Based Auth**: Prefer SSH keys over passwords when possible
3. **Encrypted Keys**: Use passphrase-protected SSH keys
4. **Limited Permissions**: Grant only necessary permissions to backup user
5. **Dedicated User**: Create a separate user account just for backups

### Network Security

1. **Firewall Rules**: Restrict SFTP access to specific IP addresses
2. **SSH Hardening**: 
   - Disable root login
   - Change default SSH port (optional)
   - Use fail2ban to prevent brute force attacks
3. **VPN**: Consider using VPN for remote connections
4. **Certificate Pinning**: Verify server fingerprint on first connection

### Application Security

1. **Environment Variables**: Set `ENCRYPTION_SECRET` env var for additional security:
   ```bash
   docker run -e ENCRYPTION_SECRET="your-random-secret-here" ...
   ```
2. **Regular Updates**: Keep the application and SFTP server software updated
3. **Backup Rotation**: Regularly delete old backups to limit exposure
4. **Audit Logs**: Monitor system logs for suspicious activity

## Troubleshooting

### Connection Refused

**Error:** `ECONNREFUSED`

**Possible Causes:**
- SFTP server not running
- Wrong host or port
- Firewall blocking connection

**Solutions:**
1. Verify SFTP service is running:
   ```bash
   sudo systemctl status ssh
   ```
2. Check port is correct (usually 22)
3. Test connection from command line:
   ```bash
   sftp -P 22 user@host
   ```
4. Check firewall rules:
   ```bash
   sudo ufw status
   sudo ufw allow 22/tcp
   ```

### Authentication Failed

**Error:** `Authentication failed` or `All configured authentication methods failed`

**Possible Causes:**
- Incorrect username or password
- Wrong SSH key
- Key not in OpenSSH format
- Public key not added to server

**Solutions:**
1. Verify credentials
2. For keys: ensure private key matches public key on server
3. Check key format:
   ```bash
   head -1 private_key
   # Should show: -----BEGIN OPENSSH PRIVATE KEY-----
   ```
4. Verify public key on server:
   ```bash
   cat ~/.ssh/authorized_keys
   ```

### Permission Denied

**Error:** `Permission denied` or `Cannot list directory`

**Possible Causes:**
- User lacks read/write permissions
- Remote directory doesn't exist
- SELinux or AppArmor blocking access

**Solutions:**
1. Check directory permissions:
   ```bash
   ls -la /path/to/backup/directory
   ```
2. Grant permissions:
   ```bash
   sudo chown backup-user:backup-user /path/to/backup/directory
   sudo chmod 755 /path/to/backup/directory
   ```
3. Create directory if missing:
   ```bash
   mkdir -p /path/to/backup/directory
   ```
4. Check SELinux context (if applicable):
   ```bash
   ls -Z /path/to/backup/directory
   semanage fcontext -a -t ssh_home_t "/path/to/backup/directory(/.*)?"
   restorecon -R /path/to/backup/directory
   ```

### Connection Timeout

**Error:** `ETIMEDOUT`

**Possible Causes:**
- Network connectivity issues
- Server unreachable
- Firewall blocking connection
- Wrong hostname/IP

**Solutions:**
1. Verify network connectivity:
   ```bash
   ping server-hostname
   ```
2. Check if port is reachable:
   ```bash
   nc -zv server-hostname 22
   ```
3. Test from container:
   ```bash
   docker exec -it container-name /bin/sh
   ping server-hostname
   ```
4. Check firewall on both sides

### Host Not Found

**Error:** `ENOTFOUND`

**Possible Causes:**
- Incorrect hostname
- DNS resolution failure
- Typo in hostname

**Solutions:**
1. Verify hostname:
   ```bash
   nslookup server-hostname
   ```
2. Try using IP address instead
3. Check `/etc/hosts` file if using local hostname

### Large File Transfer Issues

**Symptoms:**
- Upload/download hangs
- Memory errors
- Connection drops

**Solutions:**
1. **Increase timeout**: Connection stays open longer for large files
2. **Check disk space**:
   ```bash
   df -h
   ```
3. **Monitor memory**:
   ```bash
   docker stats container-name
   ```
4. **Network stability**: Ensure stable connection for large transfers
5. **Restart transfer**: The system will resume from where it left off (when possible)

## API Reference

### Configuration Endpoints

#### Get SFTP Configuration (Safe)
```
GET /admin/api/sftp/config
```

Returns configuration without credentials.

#### Save SFTP Configuration
```
POST /admin/api/sftp/config
Content-Type: application/json

{
  "host": "example.com",
  "port": 22,
  "username": "user",
  "remotePath": "/backups",
  "authMethod": "password",
  "password": "secret",
  "enabled": true
}
```

#### Delete SFTP Configuration
```
DELETE /admin/api/sftp/config
```

### Connection Testing

#### Test SFTP Connection
```
POST /admin/api/sftp/test
Content-Type: application/json

{
  "config": { ... }  // Optional: test specific config
}
```

Returns detailed diagnostics and suggestions.

### Backup Operations

#### List Remote Backups
```
GET /admin/api/sftp/backups
```

Returns list of backup files on SFTP server.

#### Upload Backup
```
POST /admin/api/sftp/upload
```

Generates and uploads new backup.

#### Download Backup
```
POST /admin/api/sftp/download
Content-Type: application/json

{
  "filename": "site-backup-2024-02-18.json"
}
```

Downloads backup from SFTP server.

## Advanced Configuration

### Custom Encryption Secret

For enhanced security, set a custom encryption secret:

**Docker Compose:**
```yaml
services:
  local-server:
    environment:
      - ENCRYPTION_SECRET=your-very-secure-random-secret-here
```

**Docker Run:**
```bash
docker run -e ENCRYPTION_SECRET="your-very-secure-random-secret-here" ...
```

**Generate secure secret:**
```bash
openssl rand -base64 32
```

⚠️ **Important**: Store this secret securely. If you lose it, you won't be able to decrypt stored credentials.

### Automated Backup Schedule

You can automate backups using cron jobs or scheduled tasks:

**Example cron job:**
```bash
# Backup to SFTP daily at 2 AM
0 2 * * * curl -X POST http://localhost:3000/admin/api/sftp/upload \
  --cookie "session=your-session-cookie"
```

### Multiple SFTP Locations

Currently, the system supports one SFTP configuration at a time. For multiple destinations:

1. **Option 1**: Manually switch configurations as needed
2. **Option 2**: Use multiple instances of the application
3. **Option 3**: Script backup downloads and upload to multiple locations

## Best Practices

### Regular Backups

1. **Schedule**: Set up automated backups (daily or weekly)
2. **Retention**: Keep at least 7-30 days of backups
3. **Rotation**: Delete old backups to save space
4. **Test Restores**: Periodically test backup restoration

### Monitoring

1. **Check Logs**: Review SFTP operation logs in Settings → Logs
2. **Connection Health**: Test connection monthly
3. **Disk Space**: Monitor SFTP server disk usage
4. **Alerts**: Set up alerts for failed backups

### Disaster Recovery

1. **Off-Site**: Store backups on remote server
2. **Multiple Copies**: Consider additional backup methods
3. **Documentation**: Keep SFTP credentials in secure password manager
4. **Recovery Plan**: Document restoration procedure

## Support

### Getting Help

1. **Connection Test**: Use built-in diagnostic messages
2. **System Logs**: Check Settings → Logs → System Logs
3. **Server Logs**: Check SFTP server logs
4. **GitHub Issues**: Report bugs or request features

### Reporting Issues

When reporting issues, include:
- Connection test diagnostic results
- Error messages from system logs
- SFTP server type and version
- Network configuration (without sensitive data)

## Changelog

### Version 2.6.30
- ✅ Initial SFTP integration release
- ✅ Password and key-based authentication
- ✅ Secure credential storage (AES-256-GCM)
- ✅ Connection diagnostics
- ✅ Streaming file transfers
- ✅ Remote backup browsing
- ✅ One-click upload/download

## License

This feature is part of Local-Server-Site-Pusher, licensed under MIT License.
