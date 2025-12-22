/**
 * Media Widget - Displays media content
 */
import { BaseWidget } from './BaseWidget.js';

export class MediaWidget extends BaseWidget {
    constructor(name, config, globalConfig) {
        super(name, config, globalConfig);
    }

    render() {
        const widget = this.createElement();
        const header = this.createHeader('🎬', 'Media');
        const content = this.createContent();
        
        widget.appendChild(header);
        widget.appendChild(content);
        
        // Check if media URL is configured
        const mediaUrl = this.globalConfig?.media?.url;
        
        if (!mediaUrl) {
            content.innerHTML = '<div style="padding: 1rem; text-align: center; color: #888;">No media source configured</div>';
            return widget;
        }
        
        content.innerHTML = `
            <div class="media-content">
                <iframe 
                    class="media-iframe" 
                    src="${this.escapeHtml(mediaUrl)}" 
                    allow="autoplay; encrypted-media"
                    allowfullscreen
                ></iframe>
            </div>
        `;
        
        return widget;
    }
}
