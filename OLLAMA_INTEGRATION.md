# Ollama/Open WebUI Integration

The Ollama Integration Module provides AI-powered assistance through Ollama LLM instances via Open WebUI in the Finance > Spending tab. This feature is **admin-only** and allows direct communication with self-hosted AI models.

## Features

### 🔐 Security
- **AES-256-GCM Encryption**: API keys and configuration encrypted at rest
- **Secure Key Storage**: Encryption keys stored with 0600 file permissions
- **Admin-Only Access**: Only authenticated administrators can access Ollama features
- **No Credential Exposure**: API keys never sent to frontend (only existence flag)
- **Local Storage**: All data stored locally and encrypted

### 🤖 AI Capabilities
- **Direct Integration**: Connect to Open WebUI instances running on your network
- **Multi-Model Support**: Support for any Ollama model (llama2, mistral, codellama, etc.)
- **Conversation History**: Maintains context across multiple prompts
- **Real-Time Responses**: Streaming or standard API responses
- **Performance Metrics**: Response time tracking and connection status monitoring

### 🔌 Connection Options
- **Local Network**: Connect to Open WebUI on same network (e.g., TrueNAS)
- **API Authentication**: Optional API key support for secured instances
- **Connection Testing**: Built-in connection diagnostics with error suggestions
- **Multiple Endpoints**: Automatic fallback for different Open WebUI versions

## Quick Start

### 1. Set Up Open WebUI

First, ensure you have Open WebUI running with Ollama. Typical setup:

```bash
# On your TrueNAS or server
docker run -d -p 3000:8080 \
  -v open-webui:/app/backend/data \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

### 2. Configure in Admin Dashboard

1. Navigate to **Finance > Spending** tab
2. Enter your **Open WebUI URL** (e.g., `http://truenas.local:3000`)
3. (Optional) Enter **API Key** if your instance requires authentication
4. Enter **Model Name** (e.g., `llama2`, `mistral`, `codellama`)
5. Click **Save Configuration**
6. Click **Test Connection** to verify connectivity

### 3. Start Using AI Assistant

1. Enter your prompt in the text area
2. Click **Send Prompt** (🚀)
3. View AI response in conversation history
4. Continue conversation - history is maintained

## Configuration

### Configuration Storage

Configuration is stored in encrypted format:
- **File**: `config/ollama-config.json.enc` (AES-256-GCM encrypted)
- **Key**: `config/.ollama-key` (file permissions: 0600)
- **Format**: JSON with encryption metadata (IV, tag, encrypted data)

### Configuration Fields

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| `webUIUrl` | Yes | Open WebUI base URL | `http://truenas.local:3000` |
| `apiKey` | No | API authentication key | `sk-abc123...` |
| `model` | Yes | Ollama model name | `llama2`, `mistral`, `codellama` |
| `enabled` | No | Enable/disable integration | `true` or `false` |

## API Endpoints

All endpoints require admin authentication.

### Get Configuration
```
GET /admin/api/ollama/config
```

**Response:**
```json
{
  "webUIUrl": "http://truenas.local:3000",
  "model": "llama2",
  "hasApiKey": true,
  "enabled": true
}
```

Note: API key is never returned, only `hasApiKey` flag indicating if one is configured.

### Save Configuration
```
POST /admin/api/ollama/config
Content-Type: application/json

{
  "webUIUrl": "http://truenas.local:3000",
  "apiKey": "sk-your-api-key",
  "model": "llama2",
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration saved successfully"
}
```

### Test Connection
```
POST /admin/api/ollama/test-connection
```

**Success Response:**
```json
{
  "success": true,
  "connected": true,
  "responseTime": 234,
  "message": "Successfully connected to Open WebUI",
  "details": {
    "url": "http://truenas.local:3000",
    "model": "llama2",
    "hasApiKey": true
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "connected": false,
  "responseTime": 125,
  "error": "getaddrinfo ENOTFOUND truenas.local",
  "details": {
    "url": "http://truenas.local:3000",
    "errorType": "ENOTFOUND",
    "suggestion": "Cannot connect to Open WebUI. Check if the URL is correct and the service is running."
  }
}
```

### Get Available Models
```
GET /admin/api/ollama/models
```

**Response:**
```json
{
  "success": true,
  "models": [
    {
      "name": "llama2",
      "size": 3825819519,
      "modified": "2024-01-15T10:30:00Z"
    },
    {
      "name": "mistral",
      "size": 4109865159,
      "modified": "2024-01-16T14:20:00Z"
    }
  ]
}
```

### Send Chat Prompt
```
POST /admin/api/ollama/chat
Content-Type: application/json

{
  "prompt": "What are the best practices for retirement planning?",
  "conversationHistory": [
    {
      "type": "user",
      "content": "Hello",
      "timestamp": "2024-01-20T10:00:00Z"
    },
    {
      "type": "assistant",
      "content": "Hello! How can I help you today?",
      "timestamp": "2024-01-20T10:00:01Z"
    }
  ]
}
```

**Success Response:**
```json
{
  "success": true,
  "response": "Here are some key retirement planning best practices:\n\n1. Start early...",
  "responseTime": 2341,
  "model": "llama2",
  "timestamp": "2024-01-20T10:00:05Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Model name is required",
  "responseTime": 12,
  "details": {
    "errorType": "VALIDATION_ERROR",
    "suggestion": "Configure the model name in settings before sending prompts."
  }
}
```

## Open WebUI API Compatibility

The integration supports Open WebUI's Ollama-compatible API:

### Endpoint Mapping

| Purpose | Endpoint | Method | Notes |
|---------|----------|--------|-------|
| Health Check | `/api/version` | GET | Primary connection test |
| List Models | `/api/tags` | GET | Fallback for connection test |
| Chat Completion | `/api/chat` | POST | Main chat endpoint |
| Streaming Chat | `/api/chat` | POST | With `stream: true` |

### Request Format

Chat requests follow Open WebUI/Ollama format:

```json
{
  "model": "llama2",
  "messages": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi! How can I help?"},
    {"role": "user", "content": "Tell me about finance"}
  ],
  "stream": false
}
```

## Troubleshooting

### Connection Issues

**Error: `ECONNREFUSED`**
- **Cause**: Open WebUI is not running or wrong port
- **Solution**: Verify Open WebUI is running: `docker ps | grep open-webui`
- **Check**: Ensure port matches your Open WebUI configuration

**Error: `ENOTFOUND`**
- **Cause**: Invalid hostname or DNS resolution failed
- **Solution**: Use IP address instead of hostname, or check DNS configuration
- **Example**: Use `http://192.168.1.100:3000` instead of `http://truenas.local:3000`

**Error: `ETIMEDOUT`**
- **Cause**: Network connectivity issues or firewall blocking
- **Solution**: Check network connectivity and firewall rules
- **Test**: `curl http://truenas.local:3000/api/version`

### Authentication Issues

**Error: `401 Unauthorized`**
- **Cause**: Invalid or missing API key
- **Solution**: Verify API key in Open WebUI admin panel
- **Note**: Some Open WebUI instances don't require API keys

### Model Issues

**Error: `Model not found`**
- **Cause**: Model name doesn't exist in Ollama
- **Solution**: List available models in Open WebUI or run `ollama list`
- **Common Models**: `llama2`, `mistral`, `codellama`, `neural-chat`

**Error: `Model name is required`**
- **Cause**: Model not configured
- **Solution**: Set model name in configuration before sending prompts

### Response Issues

**Slow Responses**
- **Cause**: Large model or complex prompt
- **Solution**: Use smaller models or simpler prompts
- **Timeout**: Current timeout is 2 minutes for LLM responses

**Empty or Malformed Responses**
- **Cause**: API format mismatch between Open WebUI versions
- **Solution**: Check Open WebUI logs for errors
- **Debug**: Test endpoint directly with curl

## Advanced Configuration

### Custom Timeouts

Modify timeout in `modules/ollama.js`:

```javascript
// Default: 120000ms (2 minutes)
timeout: 120000

// For faster models:
timeout: 60000  // 1 minute

// For larger models:
timeout: 300000  // 5 minutes
```

### Streaming Responses

To enable streaming (future enhancement):

```javascript
// In modules/ollama.js sendPrompt method
const response = await axios.post(
  `${baseUrl}/api/chat`,
  {
    model: config.model,
    messages: messages,
    stream: true  // Enable streaming
  },
  {
    headers,
    responseType: 'stream'
  }
);
```

### Conversation Persistence

Currently, conversation history is stored in browser localStorage. For server-side persistence:

1. Create conversation table in database
2. Implement `getConversationHistory()` method
3. Implement `saveConversationHistory()` method
4. Update API endpoints to use database

## Security Considerations

### API Key Security
- API keys are encrypted at rest using AES-256-GCM
- Encryption keys stored with restricted file permissions (0600)
- Keys never transmitted to frontend
- Frontend only sees `hasApiKey: true/false` flag

### Network Security
- All communication between server and Open WebUI uses HTTP/HTTPS
- Consider using HTTPS for production Open WebUI instances
- Network traffic stays within local network (no external API calls)

### Access Control
- All Ollama features restricted to admin users via `requireAuth` middleware
- Session-based authentication required
- Unauthorized access returns 401 with JSON error

### Data Privacy
- All AI conversations happen within your local network
- No data sent to external services
- Conversation history stored locally (currently in browser)
- Full control over data retention and deletion

## Performance Optimization

### Response Time Optimization
- Use smaller models for faster responses (e.g., `llama2:7b` vs `llama2:70b`)
- Keep prompts concise and specific
- Limit conversation history length to reduce context size

### Resource Management
- Monitor Ollama/Open WebUI resource usage on host system
- Adjust model quantization for memory constraints
- Consider GPU acceleration for faster inference

### Caching
- Open WebUI may cache frequent prompts
- Model loading is cached between requests
- Consider warming up models with initial prompt

## Future Enhancements

Planned improvements:

- [ ] Streaming response support for real-time output
- [ ] Server-side conversation history storage (database)
- [ ] Multiple conversation threads
- [ ] Conversation export/import
- [ ] Custom system prompts
- [ ] Temperature and parameter controls
- [ ] Token usage tracking
- [ ] Response regeneration
- [ ] Model performance comparison
- [ ] Batch prompt processing
- [ ] WebSocket support for bi-directional streaming

## Examples

### Basic Financial Query

```javascript
// Send a financial question
POST /admin/api/ollama/chat
{
  "prompt": "What's a good savings rate for retirement?",
  "conversationHistory": []
}

// Response
{
  "success": true,
  "response": "A common recommendation is to save 15-20% of your income for retirement...",
  "responseTime": 1847,
  "model": "llama2"
}
```

### Follow-up Questions

```javascript
// Continue the conversation
POST /admin/api/ollama/chat
{
  "prompt": "How does that change if I'm 40 years old?",
  "conversationHistory": [
    {
      "type": "user",
      "content": "What's a good savings rate for retirement?",
      "timestamp": "2024-01-20T10:00:00Z"
    },
    {
      "type": "assistant",
      "content": "A common recommendation is to save 15-20% of your income...",
      "timestamp": "2024-01-20T10:00:02Z"
    }
  ]
}
```

### Testing Different Models

```javascript
// Get available models
GET /admin/api/ollama/models

// Save new model configuration
POST /admin/api/ollama/config
{
  "model": "mistral"
}

// Test with new model
POST /admin/api/ollama/chat
{
  "prompt": "Analyze this investment portfolio..."
}
```

## Integration with Finance Module

The Ollama integration is designed to complement the Finance module:

### Use Cases
- **Retirement Planning Advice**: Get personalized recommendations
- **Portfolio Analysis**: Discuss investment strategies
- **Budgeting Help**: Ask about spending patterns and optimization
- **Financial Education**: Learn about financial concepts
- **Tax Planning**: Get general tax strategy guidance
- **Debt Management**: Discuss debt payoff strategies

### Privacy Note
The AI assistant does **NOT** have direct access to your Finance module data. All context must be provided explicitly in your prompts. This ensures:
- Complete control over what data is shared
- Privacy of financial information
- Flexibility in what to discuss

### Example Workflow

1. Review your Finance > My Data tab
2. Switch to Finance > Spending tab
3. Ask AI: "I'm 35 with $100k in savings and $50k in 401k. What should my retirement strategy be?"
4. Get AI recommendations
5. Apply insights to your Finance data

## Support

For issues or questions:

1. Check this documentation
2. Review error messages and suggestions
3. Check Open WebUI logs: `docker logs open-webui`
4. Test connection with curl
5. Verify network connectivity
6. Check Ollama is running: `ollama list`

## License

This module is part of Local-Server-Site-Pusher and follows the same MIT License.
