/**
 * Widget Factory - Creates widget instances based on type
 */
import { ClockWidget } from './ClockWidget.js';
import { WeatherWidget } from './WeatherWidget.js';
import { ForecastWidget } from './ForecastWidget.js';
import { CalendarWidget } from './CalendarWidget.js';
import { NewsWidget } from './NewsWidget.js';
import { MediaWidget } from './MediaWidget.js';

export class WidgetFactory {
    constructor() {
        this.widgetClasses = {
            clock: ClockWidget,
            weather: WeatherWidget,
            forecast: ForecastWidget,
            calendar: CalendarWidget,
            news: NewsWidget,
            media: MediaWidget
        };
    }

    createWidget(widgetType, widgetConfig, globalConfig) {
        const WidgetClass = this.widgetClasses[widgetType];
        
        if (!WidgetClass) {
            console.warn(`Unknown widget type: ${widgetType}`);
            return null;
        }
        
        try {
            const widget = new WidgetClass(widgetType, widgetConfig, globalConfig);
            return widget.render();
        } catch (error) {
            console.error(`Error creating widget ${widgetType}:`, error);
            return this.createErrorWidget(widgetType, error.message);
        }
    }

    createErrorWidget(widgetType, errorMessage) {
        const widget = document.createElement('div');
        widget.className = 'widget';
        widget.innerHTML = `
            <div class="widget-header">
                <span class="widget-title">${widgetType}</span>
                <span class="widget-icon">⚠️</span>
            </div>
            <div class="widget-content">
                <div class="widget-error">Failed to load widget: ${this.escapeHtml(errorMessage)}</div>
            </div>
        `;
        return widget;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
