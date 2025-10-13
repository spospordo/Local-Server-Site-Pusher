# Magic Mirror Access Guide

This guide explains how to access the Magic Mirror dashboard from different environments and contexts.

## Quick Access URLs

Once your server is running, the Magic Mirror is accessible at:

### Local Access (same machine as server)
```
http://localhost:3000/magic-mirror
```

### Container/Remote Access
Replace `localhost` with your server's IP address:
```
http://YOUR_SERVER_IP:3000/magic-mirror
```

## Finding Your Server IP Address

### On the Host Machine

#### Linux/Mac:
```bash
# Get primary network interface IP
hostname -I | awk '{print $1}'

# Or for more details:
ip addr show | grep "inet " | grep -v 127.0.0.1
```

#### Windows:
```powershell
# PowerShell
(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Ethernet*" | Select-Object -First 1).IPAddress

# Or Command Prompt
ipconfig | findstr IPv4
```

### From Another Device on the Same Network

1. On your server machine, find the local IP (usually starts with 192.168.x.x or 10.x.x.x)
2. On your other device (tablet, phone, etc.), open a browser
3. Navigate to: `http://SERVER_IP:3000/magic-mirror`

## Docker Container Access

### Using Docker Compose

The `docker-compose.yml` already exposes port 3000:

```yaml
ports:
  - "3000:3000"
```

This maps container port 3000 to host port 3000.

#### Access from Host Machine:
```
http://localhost:3000/magic-mirror
```

#### Access from Another Device:
```
http://HOST_IP:3000/magic-mirror
```

### Using Docker Run Command

If running with `docker run`, ensure port mapping:

```bash
docker run -d \
  -p 3000:3000 \
  -v ./config:/app/config \
  -v ./public:/app/public \
  --name local-server \
  local-server-site-pusher
```

The `-p 3000:3000` flag maps the port to the host.

### Network Verification

Check if the container port is properly mapped:

```bash
# List running containers with ports
docker ps

# Expected output includes:
# PORTS: 0.0.0.0:3000->3000/tcp
```

This shows the container's port 3000 is accessible from all interfaces (0.0.0.0) on the host.

## Firewall Configuration

### Linux (UFW)

If you have a firewall, allow port 3000:

```bash
sudo ufw allow 3000/tcp
sudo ufw reload
```

### Linux (firewalld)

```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### Windows Firewall

1. Open Windows Defender Firewall
2. Click "Advanced settings"
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → Next
5. Select "TCP" and enter "3000" → Next
6. Select "Allow the connection" → Next
7. Apply to all profiles → Next
8. Name it "Local Server" → Finish

### Docker Network Isolation

If the container is on a custom Docker network, ensure the network allows external access:

```bash
# List networks
docker network ls

# Inspect network
docker network inspect NETWORK_NAME
```

## Common Access Scenarios

### Scenario 1: Display on Tablet/Dedicated Display

1. Ensure tablet is on same network as server
2. Find server IP address (e.g., 192.168.1.100)
3. Open browser on tablet
4. Navigate to: `http://192.168.1.100:3000/magic-mirror`
5. (Optional) Add to home screen for fullscreen mode

### Scenario 2: Raspberry Pi with HDMI Display

1. Deploy using Docker on Raspberry Pi
2. Configure Chromium to auto-start in kiosk mode:

```bash
# Install chromium
sudo apt-get install chromium-browser

# Add to autostart
nano ~/.config/lxsession/LXDE-pi/autostart

# Add this line:
@chromium-browser --kiosk --app=http://localhost:3000/magic-mirror
```

### Scenario 3: Remote Access via Internet

**⚠️ Security Warning**: Only do this if you understand the security implications.

1. Set up port forwarding on your router (forward external port to internal IP:3000)
2. Use dynamic DNS service if you don't have a static IP
3. Access via: `http://YOUR_PUBLIC_IP:3000/magic-mirror`

**Recommendation**: Use a reverse proxy (nginx/Caddy) with HTTPS and authentication for external access.

### Scenario 4: Multiple Displays on Local Network

1. Enable Magic Mirror in admin panel
2. Configure widgets as desired
3. Access from each display using the same URL:
   - Display 1: `http://SERVER_IP:3000/magic-mirror`
   - Display 2: `http://SERVER_IP:3000/magic-mirror`
   - Display 3: `http://SERVER_IP:3000/magic-mirror`

All displays will show the same dashboard and update in real-time.

## Troubleshooting

### "Connection Refused" or "Unable to Connect"

**Possible causes:**

1. **Server not running**
   ```bash
   # Check if container is running
   docker ps
   
   # Check server logs
   docker logs local-server
   ```

2. **Port not properly mapped**
   ```bash
   # Verify port mapping
   docker port local-server
   
   # Should show: 3000/tcp -> 0.0.0.0:3000
   ```

3. **Firewall blocking**
   ```bash
   # Test from host
   curl http://localhost:3000/api/status
   
   # Test from another machine
   telnet SERVER_IP 3000
   ```

4. **Wrong IP address**
   - Don't use 127.0.0.1 from another device
   - Use the actual network IP (192.168.x.x or 10.x.x.x)

### "Not Found" Error (404)

1. **Check Magic Mirror is enabled**
   - Go to: `http://SERVER_IP:3000/admin`
   - Navigate to: Server → Magic Mirror
   - Ensure "Magic Mirror Dashboard" is enabled
   - Click "Save Configuration"

2. **Verify endpoint availability**
   ```bash
   # Test the endpoint
   curl http://localhost:3000/magic-mirror
   
   # Should return HTTP 200 with HTML content
   curl -I http://localhost:3000/magic-mirror
   ```

3. **Check server logs**
   ```bash
   docker logs local-server | grep -i "magic\|error"
   ```

### "Magic Mirror is not enabled" Message

1. Access admin panel: `http://SERVER_IP:3000/admin`
2. Login with admin credentials
3. Go to: Server → Magic Mirror
4. Enable Magic Mirror Dashboard
5. Configure desired widgets
6. Click "Save Configuration"
7. Refresh the magic-mirror page

### Cross-Origin Resource Sharing (CORS) Issues

The server handles all API requests server-side, so CORS shouldn't be an issue. If you see CORS errors:

1. Check browser console for specific error
2. Ensure you're accessing via proper URL (not file://)
3. Check if a proxy/firewall is interfering

### Network Binding Issues

If the server is only accessible on localhost but not from other devices:

1. **Verify server is binding to 0.0.0.0** (not just 127.0.0.1)
   ```bash
   # Check listening ports
   docker exec local-server netstat -tuln | grep 3000
   
   # Should show: 0.0.0.0:3000 (not 127.0.0.1:3000)
   ```

2. **The server now explicitly binds to 0.0.0.0** (as of this update)
   - Check server startup logs for confirmation
   - Look for: "running on port 3000"

## Testing Accessibility

### Quick Test Checklist

1. ✅ **Local access**
   ```bash
   curl -I http://localhost:3000/magic-mirror
   # Should return: HTTP/1.1 200 OK
   ```

2. ✅ **Host IP access**
   ```bash
   curl -I http://$(hostname -I | awk '{print $1}'):3000/magic-mirror
   # Should return: HTTP/1.1 200 OK
   ```

3. ✅ **From another device**
   - Open browser on tablet/phone
   - Navigate to: `http://SERVER_IP:3000/magic-mirror`
   - Should display the dashboard

4. ✅ **Check server logs**
   ```bash
   docker logs local-server | tail -20
   # Should show:
   # - Server running on port 3000
   # - Magic Mirror: http://localhost:3000/magic-mirror
   # - For container/remote access, replace 'localhost' with your server's IP
   ```

## Port Customization

If port 3000 is already in use, you can change it:

### Via Docker Compose

Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"  # Maps host port 8080 to container port 3000
```

Access via: `http://SERVER_IP:8080/magic-mirror`

### Via Docker Run

```bash
docker run -d -p 8080:3000 ... local-server-site-pusher
```

Access via: `http://SERVER_IP:8080/magic-mirror`

### Via Environment Variable

The server respects the PORT environment variable:
```yaml
environment:
  - PORT=8080
ports:
  - "8080:8080"
```

## Best Practices

1. **Use Static IP**: Assign a static IP to your server for consistent access
2. **Bookmark URLs**: Save the magic-mirror URL on display devices
3. **Test Connectivity**: Verify access before deploying to remote displays
4. **Monitor Logs**: Check server logs regularly for errors
5. **Keep Updated**: Run `docker pull` to get latest updates
6. **Secure Admin Panel**: Use strong password for admin access
7. **Use HTTPS**: For production/internet-facing deployments

## Additional Resources

- [Main Documentation](README.md)
- [Magic Mirror Features](MAGIC_MIRROR_DOCS.md)
- [Docker Deployment](DEPLOYMENT.md)
- [Troubleshooting Guide](MAGIC_MIRROR_DOCS.md#troubleshooting)
