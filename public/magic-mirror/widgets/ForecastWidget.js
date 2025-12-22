/**
 * Forecast Widget - Displays weather forecast
 */
import { BaseWidget } from './BaseWidget.js';
import { ConfigService } from '../services/ConfigService.js';

export class ForecastWidget extends BaseWidget {
    constructor(name, config, globalConfig) {
        super(name, config, globalConfig);
        this.configService = new ConfigService();
    }

    render() {
        const widget = this.createElement();
        const header = this.createHeader('📅', 'Forecast');
        const content = this.createContent();
        
        widget.appendChild(header);
        widget.appendChild(content);
        
        // Load forecast data
        this.loadForecast(content);
        
        // Refresh every 30 minutes
        this.startRefresh(() => this.loadForecast(content), 1800000);
        
        return widget;
    }

    async loadForecast(contentElement) {
        this.showLoading(contentElement);
        
        try {
            const data = await this.configService.fetchWidgetData('forecast');
            
            if (!data || !data.daily || data.daily.length === 0) {
                throw new Error('No forecast data available');
            }
            
            const forecastHTML = data.daily.slice(0, 5).map(day => {
                const date = new Date(day.dt * 1000);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                
                return `
                    <div class="forecast-item">
                        <div class="forecast-day">${dayName}</div>
                        <div class="weather-icon">${this.getWeatherIcon(day.weather?.[0]?.main)}</div>
                        <div class="forecast-temp">${Math.round(day.temp.max)}° / ${Math.round(day.temp.min)}°</div>
                    </div>
                `;
            }).join('');
            
            contentElement.innerHTML = `<div class="forecast-list">${forecastHTML}</div>`;
        } catch (error) {
            console.error('Forecast widget error:', error);
            this.showError(contentElement, error.message || 'Failed to load forecast');
        }
    }

    getWeatherIcon(condition) {
        const icons = {
            'Clear': '☀️',
            'Clouds': '☁️',
            'Rain': '🌧️',
            'Drizzle': '🌦️',
            'Thunderstorm': '⛈️',
            'Snow': '❄️',
            'Mist': '🌫️',
            'Fog': '🌫️'
        };
        return icons[condition] || '🌤️';
    }
}
