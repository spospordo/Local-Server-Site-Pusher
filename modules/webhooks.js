/**
 * Webhooks Module
 * 
 * Handles webhook configuration storage and management
 * for triggering external integrations from the dashboard.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const logger = require('./logger');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const WEBHOOKS_FILE = path.join(CONFIG_DIR, 'webhooks-config.json.enc');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-webhook-key-change-in-production';

/**
 * Encrypt data using AES-256-CBC
 */
function encrypt(text) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt data using AES-256-CBC
 */
function decrypt(text) {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Load webhooks from encrypted file
 */
function loadWebhooks() {
  try {
    if (!fs.existsSync(WEBHOOKS_FILE)) {
      return [];
    }
    
    const encryptedData = fs.readFileSync(WEBHOOKS_FILE, 'utf8');
    const decryptedData = decrypt(encryptedData);
    const webhooks = JSON.parse(decryptedData);
    
    logger.log('Loaded webhooks from encrypted storage', 'WEBHOOKS');
    return webhooks;
  } catch (error) {
    logger.error(`Failed to load webhooks: ${error.message}`, 'WEBHOOKS');
    return [];
  }
}

/**
 * Save webhooks to encrypted file
 */
function saveWebhooks(webhooks) {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    const jsonData = JSON.stringify(webhooks, null, 2);
    const encryptedData = encrypt(jsonData);
    fs.writeFileSync(WEBHOOKS_FILE, encryptedData, 'utf8');
    
    logger.log(`Saved ${webhooks.length} webhooks to encrypted storage`, 'WEBHOOKS');
    return true;
  } catch (error) {
    logger.error(`Failed to save webhooks: ${error.message}`, 'WEBHOOKS');
    return false;
  }
}

/**
 * Get all webhooks
 */
function getAllWebhooks() {
  return loadWebhooks();
}

/**
 * Get webhook by ID
 */
function getWebhookById(id) {
  const webhooks = loadWebhooks();
  return webhooks.find(webhook => webhook.id === id);
}

/**
 * Add or update a webhook
 */
function saveWebhook(webhookData) {
  try {
    const webhooks = loadWebhooks();
    
    // Validate webhook data
    if (!webhookData.name || !webhookData.url) {
      throw new Error('Webhook name and URL are required');
    }
    
    // Validate URL format
    try {
      new URL(webhookData.url);
    } catch (e) {
      throw new Error('Invalid webhook URL format');
    }
    
    if (webhookData.id) {
      // Update existing webhook
      const index = webhooks.findIndex(w => w.id === webhookData.id);
      if (index !== -1) {
        webhooks[index] = {
          ...webhooks[index],
          name: webhookData.name,
          url: webhookData.url,
          highImpact: webhookData.highImpact || false,
          updatedAt: new Date().toISOString()
        };
        logger.log(`Updated webhook: ${webhookData.name} (${webhookData.id})`, 'WEBHOOKS');
      } else {
        throw new Error('Webhook not found');
      }
    } else {
      // Create new webhook
      const newWebhook = {
        id: crypto.randomBytes(8).toString('hex'),
        name: webhookData.name,
        url: webhookData.url,
        highImpact: webhookData.highImpact || false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      webhooks.push(newWebhook);
      logger.log(`Created new webhook: ${newWebhook.name} (${newWebhook.id})`, 'WEBHOOKS');
    }
    
    saveWebhooks(webhooks);
    return { success: true };
  } catch (error) {
    logger.error(`Failed to save webhook: ${error.message}`, 'WEBHOOKS');
    return { success: false, error: error.message };
  }
}

/**
 * Delete a webhook
 */
function deleteWebhook(id) {
  try {
    const webhooks = loadWebhooks();
    const index = webhooks.findIndex(w => w.id === id);
    
    if (index === -1) {
      throw new Error('Webhook not found');
    }
    
    const deletedWebhook = webhooks[index];
    webhooks.splice(index, 1);
    saveWebhooks(webhooks);
    
    logger.log(`Deleted webhook: ${deletedWebhook.name} (${id})`, 'WEBHOOKS');
    return { success: true };
  } catch (error) {
    logger.error(`Failed to delete webhook: ${error.message}`, 'WEBHOOKS');
    return { success: false, error: error.message };
  }
}

/**
 * Trigger a webhook by sending a POST request
 */
async function triggerWebhook(id, payload = {}) {
  try {
    const webhook = getWebhookById(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }
    
    logger.log(`Triggering webhook: ${webhook.name} (${id})`, 'WEBHOOKS');
    
    const triggerPayload = {
      triggeredAt: new Date().toISOString(),
      webhookId: id,
      webhookName: webhook.name,
      ...payload
    };
    
    const response = await axios.post(webhook.url, triggerPayload, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Local-Server-Site-Pusher/Webhook'
      }
    });
    
    logger.log(`Webhook triggered successfully: ${webhook.name} - Status: ${response.status}`, 'WEBHOOKS');
    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    const errorMessage = error.response 
      ? `HTTP ${error.response.status}: ${error.response.statusText}`
      : error.message;
    
    logger.error(`Failed to trigger webhook (${id}): ${errorMessage}`, 'WEBHOOKS');
    return {
      success: false,
      error: errorMessage
    };
  }
}

module.exports = {
  getAllWebhooks,
  getWebhookById,
  saveWebhook,
  deleteWebhook,
  triggerWebhook
};
