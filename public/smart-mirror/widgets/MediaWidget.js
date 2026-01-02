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
            content.textContent = 'No media source configured';
            content.style.padding = '1rem';
            content.style.textAlign = 'center';
            content.style.color = '#888';
            return widget;
        }
        
        // Validate URL to prevent XSS via javascript: or data: URLs
        let isValidUrl = false;
        try {
            const url = new URL(mediaUrl);
            // Only allow http and https protocols
            isValidUrl = url.protocol === 'http:' || url.protocol === 'https:';
        } catch (e) {
            isValidUrl = false;
        }
        
        if (!isValidUrl) {
            content.textContent = 'Invalid media URL - only HTTP/HTTPS URLs are allowed';
            content.style.padding = '1rem';
            content.style.textAlign = 'center';
            content.style.color = '#ff6b6b';
            return widget;
        }
        
        // Create iframe element safely
        const mediaContainer = document.createElement('div');
        mediaContainer.className = 'media-content';
        
        const iframe = document.createElement('iframe');
        iframe.className = 'media-iframe';
        iframe.src = mediaUrl; // Safe now after validation
        iframe.setAttribute('allow', 'autoplay; encrypted-media');
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
        
        mediaContainer.appendChild(iframe);
        content.appendChild(mediaContainer);
        
        return widget;
    }
}
