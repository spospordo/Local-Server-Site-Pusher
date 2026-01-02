/**
 * Weather Widget - Displays current weather
 */
import { BaseWidget } from './BaseWidget.js';
import { ConfigService } from '../services/ConfigService.js';

export class WeatherWidget extends BaseWidget {
    constructor(name, config, globalConfig) {
        super(name, config, globalConfig);
        this.configService = new ConfigService();
    }

    render() {
        const widget = this.createElement();
        const header = this.createHeader('🌤️', 'Weather');
        const content = this.createContent();
        
        widget.appendChild(header);
        widget.appendChild(content);
        
        // Load weather data
        this.loadWeather(content);
        
        // Refresh every 10 minutes
        this.startRefresh(() => this.loadWeather(content), 600000);
        
        return widget;
    }

    async loadWeather(contentElement) {
        this.showLoading(contentElement);
        
        try {
            const data = await this.configService.fetchWidgetData('weather');
            
            if (!data || !data.current) {
                throw new Error('No weather data available');
            }
            
            const weather = data.current;
            contentElement.innerHTML = `
                <div class="weather-main">
                    <div class="weather-temp">${Math.round(weather.temp)}°</div>
                    <div class="weather-icon">${this.getWeatherIcon(weather.weather?.[0]?.main)}</div>
                </div>
                <div class="weather-description">${this.escapeHtml(weather.weather?.[0]?.description || '')}</div>
                <div class="weather-details">
                    <div>Feels like: ${Math.round(weather.feels_like)}°</div>
                    <div>Humidity: ${weather.humidity}%</div>
                    <div>Wind: ${Math.round(weather.wind_speed || 0)} m/s</div>
                    <div>Pressure: ${weather.pressure} hPa</div>
                </div>
            `;
        } catch (error) {
            console.error('Weather widget error:', error);
            this.showError(contentElement, error.message || 'Failed to load weather');
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
