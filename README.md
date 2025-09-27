# Local-Server-Site-Pusher
A containerized web application with admin interface for serving web content and handling integrations with Home Assistant and dashboard tools.

## Features

🔧 **Admin Interface**: Secure web-based administration panel  
📁 **File Serving**: Serve static web content from the public directory  
🔗 **API Endpoints**: Handle POST/GET requests for external integrations  
📊 **Status Monitoring**: Integration with Home Assistant and Cockpit  
🐳 **Containerized**: Easy deployment with Docker  

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/spospordo/Local-Server-Site-Pusher.git
cd Local-Server-Site-Pusher

# Start the container
docker-compose up -d

# Test deployment (optional)
./test-deployment.sh

# Access the application
# Main site: http://localhost:3000
# Admin panel: http://localhost:3000/admin
```

**✨ New**: The container now automatically fixes permission issues with volume mounts - perfect for Portainer deployments!

### Using Docker

```bash
# Build the image
docker build -t local-server-site-pusher .

# Run the container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/public:/app/public \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/uploads:/app/uploads \
  --name local-server \
  local-server-site-pusher
```

### TrueNAS Scale / Portainer Deployment

🎯 **For Portainer and TrueNAS Scale users**: See the comprehensive [**PORTAINER.md**](PORTAINER.md) deployment guide which includes:
- Quick deployment steps
- Permission troubleshooting  
- TrueNAS Scale specific instructions
- Security best practices

**Quick Example for Portainer Stack:**
```yaml
services:
  local-server:
    image: local-server-site-pusher:latest
    ports:
      - "3000:3000"
    volumes:
      - /var/lib/local-server/config:/app/config
      - /var/lib/local-server/public:/app/public
      - /var/lib/local-server/uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - SESSION_SECRET=your-secure-secret-here
    restart: unless-stopped
```

The container automatically handles permission fixes for volume mounts - no manual setup required!

## Troubleshooting

### Container Startup Issues

**Problem**: Container restarts in a loop with "npm: exec: line 0: start: not found"
**Solution**: 
1. Pull the latest image: `docker pull spospordo/local-server-site-pusher:latest`
2. Or rebuild from source: `docker-compose up --build`

**Problem**: Permission errors with volume mounts
**Solution**: 
1. Fix host directory ownership: `sudo chown -R 1000:1000 ./config ./public ./uploads`
2. Or let the container auto-fix permissions (default behavior)

For detailed troubleshooting, see [PORTAINER.md](PORTAINER.md).

### Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start

# Access at http://localhost:3000
```

## Configuration

The server is configured via `config.json` located in the `config/` directory. If no configuration file exists, the server will automatically create a default configuration file on startup.

```json
{
  "server": {
    "port": 3000,
    "admin": {
      "username": "admin",
      "password": "admin123"
    }
  },
  "homeAssistant": {
    "enabled": true,
    "url": "http://localhost:8123"
  },
  "cockpit": {
    "enabled": true,
    "url": "http://localhost:9090"
  },
  "webContent": {
    "directory": "./public",
    "defaultFile": "index.html"
  }
}
```

**⚠️ Important**: Change the default admin credentials in production!

### Configuration Persistence

When using Docker, mount the `config` directory to persist configuration changes:
- The server creates a default `config/config.json` if none exists
- Configuration changes via the admin interface are saved to this file
- Mounting the `config` directory ensures settings persist across container restarts

**Enhanced Persistence Features:**
- ✅ **Automatic configuration validation and repair** on startup
- ✅ **Backup utilities** for safe container updates 
- ✅ **Data recovery tools** for configuration corruption
- ✅ **Container update scripts** that preserve all settings

See [PERSISTENCE.md](PERSISTENCE.md) for complete persistence documentation.

### Container Updates

To safely update the container while preserving all settings:

```bash
# Automatic update with backup and validation
./scripts/update-container.sh

# Or manual backup before updates
./scripts/backup-config.sh
```

## Admin Interface

1. Navigate to `http://localhost:3000/admin`
2. Login with default credentials: `admin` / `admin123`
3. Use the dashboard to:
   - View server status and metrics
   - Edit configuration in real-time
   - Monitor integrations

## API Endpoints

### Status Endpoint (for integrations)
```
GET /api/status
```
Returns server status, uptime, memory usage, and configuration for Home Assistant and other monitoring tools.

### Webhook Receiver
```
POST /api/webhook
```
Accepts webhook data from external services. Logs received data and returns confirmation.

### Data Endpoint
```
GET /api/data
```
Generic data endpoint for integrations. Accepts query parameters.

### Espresso Editor Endpoints
```
GET /espresso-editor
```
Public espresso data editor interface. Allows editing espresso brewing parameters.

```
GET /espresso
```
Public espresso display page. Shows formatted espresso brewing data.

```
GET /api/espresso/data
```
Returns current espresso brewing data in JSON format.

```
POST /api/espresso/data
```
Updates espresso brewing data (public endpoint, no authentication required).

## Home Assistant Integration

Add a RESTful sensor to your Home Assistant configuration:

```yaml
sensor:
  - platform: rest
    resource: http://your-server-ip:3000/api/status
    name: "Local Server Status"
    value_template: "{{ value_json.server.status }}"
    json_attributes:
      - server
      - memory
      - timestamp
```

## Cockpit Integration

Monitor the server via Cockpit by adding the status endpoint:
```
http://your-server-ip:3000/api/status
```

## Web Content

- Place your web files in the `public` directory
- The server will serve files from this directory
- Default file is `index.html`
- Access public content at `http://localhost:3000/public/`

## Security Notes

- Change default admin credentials in production
- Use HTTPS in production with a reverse proxy
- Consider firewall rules for API endpoints
- The container runs as non-root user for security

## Development

The application uses:
- **Node.js** with Express for the web server
- **Session-based authentication** for admin access
- **JSON configuration** for easy management
- **Docker** for containerization

## License

MIT License - see LICENSE file for details.
