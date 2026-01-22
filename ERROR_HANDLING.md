# Error Handling Documentation

This document describes the enhanced error handling system implemented in Local-Server-Site-Pusher to provide detailed, actionable error messages and solutions.

## Overview

The application now features a comprehensive error handling system that provides:

- **Detailed error messages** with clear descriptions of what went wrong
- **Context information** about where and when the error occurred
- **Common causes** and likely reasons for problems
- **Recommended solutions** with step-by-step instructions
- **Documentation links** to relevant troubleshooting guides

## Architecture

### Error Helper Module

The `modules/error-helper.js` module provides:

1. **Custom Error Classes**
   - `NFSError` - For NFS/network file system errors
   - `GitHubError` - For GitHub API and git operation errors
   - `FileSystemError` - For file system operation errors

2. **Error Formatters**
   - `formatNFSMountError()` - Enhances NFS mount errors with diagnostics
   - `formatGitHubError()` - Enhances GitHub operation errors
   - `formatFileSystemError()` - Enhances file system errors

3. **Utilities**
   - `logError()` - Centralized error logging with context
   - `createErrorResponse()` - Generates structured error responses for APIs

### Integration with Logger

All enhanced errors are logged through the centralized `logger` module, ensuring:
- Consistent log formatting across the application
- Categorized logs (SYSTEM, GITHUB, FINANCE, NFS, etc.)
- Structured log storage for debugging and monitoring

## Error Handling by Module

### NFS Module (`modules/nfs.js`)

The NFS module now detects and provides detailed solutions for:

#### Permission Denied (EACCES)
```json
{
  "error": "NFS mount failed due to permission issues",
  "code": "NFS_PERMISSION_DENIED",
  "host": "192.168.1.100",
  "path": "/mnt/share",
  "solution": "1. Verify the export is configured in /etc/exports on the NFS server\n2. Ensure your client IP/network is allowed...",
  "documentationUrl": "https://github.com/spospordo/Local-Server-Site-Pusher/blob/main/NFS_NETWORK_DRIVE.md#troubleshooting"
}
```

#### Timeout (ETIMEDOUT)
Provides network connectivity troubleshooting steps:
- Verify IP address/hostname
- Test connectivity with ping
- Check NFS service status
- Verify firewall rules

#### Network Unreachable (ENETUNREACH)
Provides routing and network configuration guidance:
- Check network path and routing
- Verify Docker network configuration
- Suggest using IP instead of hostname

#### Path Not Found (ENOENT)
Provides export path validation steps:
- Verify path spelling
- List available exports with `showmount -e`
- Check server-side exports configuration

#### RPC Errors
Provides RPC service troubleshooting:
- Check rpcbind service status
- Verify port accessibility
- Firewall configuration checks

#### Client Not Installed
Provides installation instructions for multiple OS types:
- **Debian/Ubuntu**: `sudo apt-get install nfs-common`
- **RHEL/CentOS/Fedora**: `sudo yum install nfs-utils`
- **Alpine Linux**: `apk add nfs-utils` (as root or in Docker)
- **Arch Linux**: `sudo pacman -S nfs-utils`

**Note**: Root privileges (sudo) are required for package installation on most systems.

### GitHub Module (`modules/github-upload.js`)

Enhanced error handling for GitHub operations:

#### Authentication Failed (401)
```json
{
  "error": "GitHub authentication failed",
  "code": "GITHUB_AUTH_FAILED",
  "repository": "owner/repo",
  "solution": "1. Verify your GitHub Personal Access Token is correct\n2. Check if the token has expired...",
  "documentationUrl": "https://docs.github.com/en/authentication/..."
}
```

Covers:
- Token validation and format issues
- Expired tokens
- Missing scopes/permissions
- Token regeneration guidance

#### Access Forbidden (403)
Provides guidance on:
- Repository access permissions
- Branch protection rules
- Organization roles and permissions

#### Repository Not Found (404)
Helps with:
- Repository name verification
- Access token permissions for private repos
- Renamed repository detection

#### Rate Limit Exceeded (429)
Provides information about:
- Rate limit reset timing
- Authenticated vs unauthenticated limits
- Usage reduction strategies

#### File Too Large (413)
Guidance on:
- GitHub file size limits (100MB)
- Git LFS usage
- File compression options
- .gitignore best practices

### Finance Module (`modules/finance.js`)

Enhanced error handling for financial data operations:

#### Encryption/Decryption Errors
- Clear messages about encryption key issues
- Guidance on key configuration
- Data corruption detection and recovery

#### File System Errors
- Detailed file operation failures
- Disk space checks
- Permission validation
- Path verification

### Server Module (`server.js`)

Enhanced error responses for API endpoints:

#### Password Operations
Detailed errors for:
- Password change failures
- Permission issues
- Disk space problems
- Configuration file access

#### Configuration Updates
Enhanced feedback for:
- Invalid configuration structure
- File write failures
- In-memory vs persistent updates

#### Useful Links Management
Clear error messages for:
- Invalid URLs
- Storage failures
- Link not found scenarios

## Error Response Format

### API Responses

Standard error response format:
```json
{
  "error": "Brief error description",
  "details": "Detailed error message or technical details",
  "solution": "Step-by-step guidance to resolve the issue",
  "code": "ERROR_CODE",
  "documentationUrl": "https://link-to-relevant-docs"
}
```

### Log Format

Errors are logged with structured information:
```
❌ [Category] Error message
Details: Additional context
Solution:
1. First step
2. Second step
...
Documentation: URL
```

## Best Practices for Error Handling

### For Developers

1. **Use Custom Error Classes**
   ```javascript
   const { NFSError } = require('./error-helper');
   throw new NFSError('Mount failed', {
     code: 'NFS_MOUNT_FAILED',
     host: '192.168.1.100',
     path: '/mnt/share',
     solution: 'Check network connectivity...'
   });
   ```

2. **Log with Context**
   ```javascript
   const { logError } = require('./error-helper');
   logError(logger.categories.SYSTEM, error, {
     operation: 'Mount NFS share',
     host: connection.host,
     path: connection.exportPath
   });
   ```

3. **Return Structured Errors**
   ```javascript
   const { createErrorResponse } = require('./error-helper');
   return {
     success: false,
     ...createErrorResponse(enhancedError)
   };
   ```

### For Users

When you encounter an error:

1. **Read the error message carefully** - It contains specific information about what went wrong

2. **Follow the solution steps** - The errors include step-by-step guidance to resolve common issues

3. **Check the documentation** - Many errors include links to relevant documentation

4. **Review the logs** - Use Settings > Logs in the admin interface for additional context

5. **Verify your environment**:
   - Network connectivity
   - File permissions
   - Disk space
   - Service availability

## Common Error Scenarios

### NFS Mount Failures

**Problem**: Cannot mount NFS share
**Common Causes**:
- Incorrect server IP or hostname
- NFS server not running or unreachable
- Export not configured on server
- Firewall blocking NFS ports
- Client tools not installed

**Solution Path**:
1. Check the detailed error message for specific issue
2. Verify server connectivity: `ping <server-ip>`
3. Check available exports: `showmount -e <server-ip>`
4. Verify NFS service: `systemctl status nfs-server`
5. Check firewall rules for ports 2049 and 111

### GitHub Push Failures

**Problem**: Cannot push to GitHub repository
**Common Causes**:
- Invalid or expired access token
- Insufficient permissions
- Repository doesn't exist or renamed
- Network connectivity issues
- Branch protection rules

**Solution Path**:
1. Verify access token in Settings > GitHub Configuration
2. Check token permissions (needs 'repo' scope)
3. Verify repository name and accessibility
4. Check GitHub status page
5. Review branch protection rules

### File System Errors

**Problem**: Cannot read/write files
**Common Causes**:
- Permission denied
- Disk space full
- Path doesn't exist
- Directory instead of file

**Solution Path**:
1. Check file/directory permissions
2. Verify disk space: `df -h`
3. Ensure parent directories exist
4. Verify path construction
5. Check Docker volume mounts

## Testing Error Scenarios

To verify error handling is working correctly:

### NFS Errors
```bash
# Test with invalid host
# Settings > NFS > Add connection with host "invalid.local"

# Test with invalid path
# Settings > NFS > Add connection with path "/nonexistent"

# Test without NFS tools (in container)
# docker exec container which mount.nfs
```

### GitHub Errors
```bash
# Test with invalid token
# Settings > GitHub > Use token "invalid"

# Test with non-existent repository
# Settings > GitHub > Use repo "owner/nonexistent"
```

### File System Errors
```bash
# Test with read-only volume
# docker run with -v /path:/app/config:ro

# Test with full disk
# Fill disk to capacity before operation
```

## Monitoring and Debugging

### View Logs

Access logs through:
1. **Admin Interface**: Settings > Logs
2. **Container Logs**: `docker logs <container-name>`
3. **Log Files**: Check application log files if configured

### Log Categories

Logs are organized by category:
- **SYSTEM** - General system operations
- **DEPLOYMENT** - Deployment and build operations
- **GITHUB** - GitHub integration
- **FINANCE** - Finance module operations
- **NFS** - NFS operations
- **CLIENT** - Client interface operations
- **SMART_MIRROR** - Smart mirror features

### Debug Mode

Enable debug logging for more detailed output:
```javascript
logger.debug(category, message);
```

## Contributing

When adding new features or fixing bugs:

1. **Use the error-helper module** for consistent error handling
2. **Provide actionable solutions** in error messages
3. **Add context** to logged errors
4. **Test error scenarios** to verify helpful messages
5. **Update this documentation** when adding new error types

## Resources

- [NFS Troubleshooting Guide](./NFS_NETWORK_DRIVE.md#troubleshooting)
- [GitHub Documentation](https://docs.github.com/)
- [Docker Volume Documentation](https://docs.docker.com/storage/volumes/)

## Feedback

If you encounter an error that needs better explanation or solution guidance, please:
1. Note the error code and message
2. Document what you tried
3. Open an issue with the error details and suggestions for improvement

We continuously improve error messages based on user feedback.
