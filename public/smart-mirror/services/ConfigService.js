/**
 * Config Service - Handles fetching configuration from the API
 */
export class ConfigService {
    constructor() {
        this.apiEndpoint = '/api/magic-mirror/config';
    }

    async fetchConfig() {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });

            if (!response.ok) {
                if (response.status === 403) {
                    const data = await response.json();
                    throw new Error(data.message || 'Magic Mirror is disabled');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Config fetch error:', error);
            throw error;
        }
    }

    async fetchWidgetData(widgetType) {
        const endpoints = {
            weather: '/api/magicmirror/weather',
            forecast: '/api/magicmirror/forecast',
            calendar: '/api/magicmirror/calendar',
            news: '/api/magicmirror/news'
        };

        const endpoint = endpoints[widgetType];
        if (!endpoint) {
            throw new Error(`Unknown widget type: ${widgetType}`);
        }

        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Widget data fetch error (${widgetType}):`, error);
            throw error;
        }
    }
}
