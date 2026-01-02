/**
 * Calendar Widget - Displays upcoming events
 */
import { BaseWidget } from './BaseWidget.js';
import { ConfigService } from '../services/ConfigService.js';

export class CalendarWidget extends BaseWidget {
    constructor(name, config, globalConfig) {
        super(name, config, globalConfig);
        this.configService = new ConfigService();
    }

    render() {
        const widget = this.createElement();
        const header = this.createHeader('📆', 'Calendar');
        const content = this.createContent();
        
        widget.appendChild(header);
        widget.appendChild(content);
        
        // Load calendar data
        this.loadCalendar(content);
        
        // Refresh every 15 minutes
        this.startRefresh(() => this.loadCalendar(content), 900000);
        
        return widget;
    }

    async loadCalendar(contentElement) {
        this.showLoading(contentElement);
        
        try {
            const data = await this.configService.fetchWidgetData('calendar');
            
            if (!data || !data.events || data.events.length === 0) {
                contentElement.innerHTML = '<div style="padding: 1rem; text-align: center; color: #888;">No upcoming events</div>';
                return;
            }
            
            const eventsHTML = data.events.slice(0, 5).map(event => {
                const startDate = new Date(event.start);
                const timeString = startDate.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                const dateString = startDate.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric' 
                });
                
                return `
                    <div class="calendar-event">
                        <div class="event-time">${timeString} • ${dateString}</div>
                        <div class="event-title">${this.escapeHtml(event.summary || 'Untitled Event')}</div>
                        ${event.description ? `<div class="event-description">${this.escapeHtml(event.description)}</div>` : ''}
                    </div>
                `;
            }).join('');
            
            contentElement.innerHTML = eventsHTML;
        } catch (error) {
            console.error('Calendar widget error:', error);
            this.showError(contentElement, error.message || 'Failed to load calendar');
        }
    }
}
