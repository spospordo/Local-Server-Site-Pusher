/**
 * Clock Widget - Displays current time and date
 */
import { BaseWidget } from './BaseWidget.js';

export class ClockWidget extends BaseWidget {
    constructor(name, config, globalConfig) {
        super(name, config, globalConfig);
    }

    render() {
        const widget = this.createElement();
        const header = this.createHeader('🕐', 'Clock');
        const content = this.createContent();
        
        content.innerHTML = `
            <div class="clock-time" id="clock-time-${this.name}">--:--:--</div>
            <div class="clock-date" id="clock-date-${this.name}">Loading...</div>
        `;
        
        widget.appendChild(header);
        widget.appendChild(content);
        
        // Update time immediately and then every second
        this.updateTime();
        this.startRefresh(() => this.updateTime(), 1000);
        
        return widget;
    }

    updateTime() {
        const now = new Date();
        const timeElement = document.getElementById(`clock-time-${this.name}`);
        const dateElement = document.getElementById(`clock-date-${this.name}`);
        
        if (timeElement && dateElement) {
            timeElement.textContent = now.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false
            });
            
            dateElement.textContent = now.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        }
    }
}
