// Ollama/Open WebUI Integration Module
// Handles communication with Ollama LLM instances via Open WebUI

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

// Encryption configuration (same pattern as Finance module for security)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

class OllamaIntegration {
  constructor(configDir) {
    this.configDir = configDir;
    this.configPath = path.join(configDir, 'ollama-config.json.enc');
    this.keyPath = path.join(configDir, '.ollama-key');
    this.encryptionKey = this.loadOrCreateEncryptionKey();
  }

  // Load or create encryption key
  loadOrCreateEncryptionKey() {
    try {
      if (fs.existsSync(this.keyPath)) {
        const key = fs.readFileSync(this.keyPath, 'utf8');
        return Buffer.from(key, 'hex');
      } else {
        // Generate new key
        const key = crypto.randomBytes(KEY_LENGTH);
        fs.writeFileSync(this.keyPath, key.toString('hex'), { mode: 0o600 });
        return key;
      }
    } catch (err) {
      console.error('Error loading encryption key:', err.message);
      return crypto.randomBytes(KEY_LENGTH); // Fallback to in-memory key
    }
  }

  // Encrypt data
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        tag: tag.toString('hex')
      };
    } catch (err) {
      throw new Error('Encryption failed: ' + err.message);
    }
  }

  // Decrypt data
  decrypt(encrypted) {
    try {
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        this.encryptionKey,
        Buffer.from(encrypted.iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
      
      let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (err) {
      throw new Error('Decryption failed: ' + err.message);
    }
  }

  // Load configuration
  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        return {
          webUIUrl: '',
          apiKey: '',
          model: '',
          enabled: false
        };
      }

      const encryptedData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      const decrypted = this.decrypt(encryptedData);
      return JSON.parse(decrypted);
    } catch (err) {
      console.error('Error loading Ollama config:', err.message);
      return {
        webUIUrl: '',
        apiKey: '',
        model: '',
        enabled: false
      };
    }
  }

  // Save configuration
  saveConfig(config) {
    try {
      const configData = {
        webUIUrl: config.webUIUrl || '',
        apiKey: config.apiKey || '',
        model: config.model || '',
        enabled: config.enabled || false
      };

      const encrypted = this.encrypt(JSON.stringify(configData));
      fs.writeFileSync(this.configPath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });

      return { success: true, message: 'Configuration saved successfully' };
    } catch (err) {
      console.error('Error saving Ollama config:', err.message);
      return { success: false, error: err.message };
    }
  }

  // Test connection to Open WebUI
  async testConnection(config) {
    const startTime = Date.now();
    
    try {
      if (!config.webUIUrl) {
        throw new Error('Open WebUI URL is required');
      }

      // Normalize URL
      const baseUrl = config.webUIUrl.endsWith('/') 
        ? config.webUIUrl.slice(0, -1) 
        : config.webUIUrl;

      // Try to get API info/health endpoint
      // Open WebUI typically has /api/version or /health endpoints
      const headers = {};
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      let response;
      try {
        // Try version endpoint first
        response = await axios.get(`${baseUrl}/api/version`, {
          headers,
          timeout: 10000
        });
      } catch (err) {
        // If version fails, try a simple models endpoint
        try {
          response = await axios.get(`${baseUrl}/api/tags`, {
            headers,
            timeout: 10000
          });
        } catch (err2) {
          // If both fail, try root API endpoint
          response = await axios.get(`${baseUrl}/api`, {
            headers,
            timeout: 10000
          });
        }
      }

      const responseTime = Date.now() - startTime;

      return {
        success: true,
        connected: true,
        responseTime: responseTime,
        message: 'Successfully connected to Open WebUI',
        details: {
          url: baseUrl,
          model: config.model || 'Not specified',
          hasApiKey: !!config.apiKey
        }
      };
    } catch (err) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        connected: false,
        responseTime: responseTime,
        error: err.message,
        details: {
          url: config.webUIUrl,
          errorType: err.code || 'UNKNOWN',
          suggestion: this.getErrorSuggestion(err)
        }
      };
    }
  }

  // Get available models
  async getModels(config) {
    try {
      if (!config.webUIUrl) {
        throw new Error('Open WebUI URL is required');
      }

      const baseUrl = config.webUIUrl.endsWith('/') 
        ? config.webUIUrl.slice(0, -1) 
        : config.webUIUrl;

      const headers = {};
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      // Open WebUI uses /api/tags to list models (Ollama compatible)
      const response = await axios.get(`${baseUrl}/api/tags`, {
        headers,
        timeout: 10000
      });

      const models = response.data?.models || [];
      
      return {
        success: true,
        models: models.map(m => ({
          name: m.name || m.model,
          size: m.size,
          modified: m.modified_at || m.modified
        }))
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        models: []
      };
    }
  }

  // Send chat prompt to Ollama via Open WebUI
  async sendPrompt(config, prompt, conversationHistory = []) {
    const startTime = Date.now();

    try {
      if (!config.webUIUrl) {
        throw new Error('Open WebUI URL is required');
      }

      if (!config.model) {
        throw new Error('Model name is required');
      }

      if (!prompt || !prompt.trim()) {
        throw new Error('Prompt cannot be empty');
      }

      const baseUrl = config.webUIUrl.endsWith('/') 
        ? config.webUIUrl.slice(0, -1) 
        : config.webUIUrl;

      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      // Format messages for Open WebUI/Ollama API
      const messages = [
        ...conversationHistory.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
        {
          role: 'user',
          content: prompt
        }
      ];

      // Open WebUI chat completions endpoint
      const response = await axios.post(
        `${baseUrl}/api/chat`,
        {
          model: config.model,
          messages: messages,
          stream: false
        },
        {
          headers,
          timeout: 120000 // 2 minutes for LLM response
        }
      );

      const responseTime = Date.now() - startTime;

      // Extract response based on Open WebUI/Ollama response format
      let assistantMessage = '';
      if (response.data?.message?.content) {
        assistantMessage = response.data.message.content;
      } else if (response.data?.response) {
        assistantMessage = response.data.response;
      } else if (typeof response.data === 'string') {
        assistantMessage = response.data;
      } else {
        assistantMessage = JSON.stringify(response.data);
      }

      return {
        success: true,
        response: assistantMessage,
        responseTime: responseTime,
        model: config.model,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        error: err.message,
        responseTime: responseTime,
        details: {
          errorType: err.code || 'UNKNOWN',
          suggestion: this.getErrorSuggestion(err)
        }
      };
    }
  }

  // Get error suggestion based on error type
  getErrorSuggestion(err) {
    if (err.code === 'ECONNREFUSED') {
      return 'Cannot connect to Open WebUI. Check if the URL is correct and the service is running.';
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      return 'Connection timed out. The server may be slow or unreachable.';
    } else if (err.response?.status === 401) {
      return 'Authentication failed. Check your API key.';
    } else if (err.response?.status === 404) {
      return 'Endpoint not found. Verify the Open WebUI URL and API version.';
    } else if (err.response?.status === 500) {
      return 'Server error. The Open WebUI instance may be experiencing issues.';
    } else {
      return 'Check your configuration and network connection.';
    }
  }

  // Get conversation history (placeholder for future database integration)
  async getConversationHistory() {
    // For now, return empty array
    // Future: Store in database or encrypted file
    return [];
  }

  // Save conversation history (placeholder for future database integration)
  async saveConversationHistory(history) {
    // For now, do nothing
    // Future: Store in database or encrypted file
    return { success: true };
  }
}

module.exports = OllamaIntegration;
