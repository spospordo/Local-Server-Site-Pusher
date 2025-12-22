/**
 * Magic Mirror Dashboard - Main Application
 * Modern vanilla JavaScript SPA with real-time config updates
 */

import { WidgetFactory } from './widgets/WidgetFactory.js';
import { ConfigService } from './services/ConfigService.js';
import { UIController } from './controllers/UIController.js';

class MagicMirrorApp {
    constructor() {
        this.configService = new ConfigService();
        this.uiController = new UIController();
        this.widgetFactory = new WidgetFactory();
        this.config = null;
        this.configVersion = null;
        this.pollInterval = null;
        this.pollIntervalMs = 10000; // Poll every 10 seconds for config changes
    }

    async init() {
        console.log('🪞 Magic Mirror Dashboard initializing...');
        
        try {
            // Load initial configuration
            await this.loadConfig();
            
            // Start polling for config updates
            this.startConfigPolling();
            
            // Add visibility change listener to pause/resume polling
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.stopConfigPolling();
                } else {
                    this.startConfigPolling();
                }
            });
            
            console.log('✅ Magic Mirror Dashboard initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Magic Mirror Dashboard:', error);
            this.uiController.showError(error.message || 'Failed to initialize dashboard');
        }
    }

    async loadConfig() {
        try {
            const data = await this.configService.fetchConfig();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to load configuration');
            }
            
            const newConfig = data.config;
            
            // Check if Magic Mirror is enabled
            if (!newConfig.enabled) {
                this.uiController.showDisabled();
                return;
            }
            
            // Check if config has changed
            const newVersion = newConfig.configVersion || Date.now();
            
            if (this.configVersion && this.configVersion === newVersion) {
                console.log('⏭️ Config unchanged (version: ' + newVersion + ')');
                this.uiController.updateLastUpdateTime();
                return;
            }
            
            console.log('📊 New config loaded (version: ' + newVersion + ')');
            this.config = newConfig;
            this.configVersion = newVersion;
            
            // Render dashboard with new config
            this.renderDashboard();
            
        } catch (error) {
            console.error('❌ Error loading config:', error);
            throw error;
        }
    }

    renderDashboard() {
        console.log('🎨 Rendering dashboard...');
        
        // Hide loading screen, show dashboard
        this.uiController.showDashboard();
        
        // Clear existing widgets
        const container = document.getElementById('widgetContainer');
        container.innerHTML = '';
        
        // Get enabled widgets
        const widgets = this.config.widgets || {};
        const enabledWidgets = Object.entries(widgets).filter(([name, config]) => config.enabled === true);
        
        console.log(`📦 Rendering ${enabledWidgets.length} enabled widgets`);
        
        if (enabledWidgets.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <h2 style="color: #aaa;">No widgets enabled</h2>
                    <p style="color: #666; margin-top: 1rem;">Please enable widgets in the admin dashboard.</p>
                </div>
            `;
            return;
        }
        
        // Render each enabled widget
        enabledWidgets.forEach(([widgetName, widgetConfig]) => {
            try {
                const widgetElement = this.widgetFactory.createWidget(widgetName, widgetConfig, this.config);
                if (widgetElement) {
                    container.appendChild(widgetElement);
                }
            } catch (error) {
                console.error(`❌ Error rendering widget ${widgetName}:`, error);
            }
        });
        
        // Update last update time
        this.uiController.updateLastUpdateTime();
        this.uiController.setHealthStatus(true);
    }

    startConfigPolling() {
        if (this.pollInterval) {
            return; // Already polling
        }
        
        console.log(`🔄 Starting config polling (every ${this.pollIntervalMs / 1000}s)`);
        
        this.pollInterval = setInterval(async () => {
            try {
                await this.loadConfig();
            } catch (error) {
                console.error('❌ Error polling config:', error);
                this.uiController.setHealthStatus(false);
            }
        }, this.pollIntervalMs);
    }

    stopConfigPolling() {
        if (this.pollInterval) {
            console.log('⏸️ Stopping config polling');
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new MagicMirrorApp();
    app.init();
});
