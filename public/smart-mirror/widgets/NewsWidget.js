/**
 * News Widget - Displays news headlines
 */
import { BaseWidget } from './BaseWidget.js';
import { ConfigService } from '../services/ConfigService.js';

export class NewsWidget extends BaseWidget {
    constructor(name, config, globalConfig) {
        super(name, config, globalConfig);
        this.configService = new ConfigService();
    }

    render() {
        const widget = this.createElement();
        const header = this.createHeader('📰', 'News');
        const content = this.createContent();
        
        widget.appendChild(header);
        widget.appendChild(content);
        
        // Load news data
        this.loadNews(content);
        
        // Refresh every 30 minutes
        this.startRefresh(() => this.loadNews(content), 1800000);
        
        return widget;
    }

    async loadNews(contentElement) {
        this.showLoading(contentElement);
        
        try {
            const data = await this.configService.fetchWidgetData('news');
            
            if (!data || !data.articles || data.articles.length === 0) {
                contentElement.innerHTML = '<div style="padding: 1rem; text-align: center; color: #888;">No news available</div>';
                return;
            }
            
            const newsHTML = data.articles.slice(0, 10).map((article, index) => {
                const pubDate = article.pubDate ? new Date(article.pubDate) : null;
                const dateString = pubDate ? pubDate.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '';
                
                return `
                    <div class="news-item" data-news-url="${this.escapeHtml(article.link)}" data-news-index="${index}">
                        <div class="news-title">${this.escapeHtml(article.title || 'Untitled')}</div>
                        ${dateString ? `<div class="news-date">${dateString}</div>` : ''}
                    </div>
                `;
            }).join('');
            
            contentElement.innerHTML = `<div class="news-list">${newsHTML}</div>`;
            
            // Add click handlers safely with addEventListener
            contentElement.querySelectorAll('.news-item').forEach(item => {
                item.addEventListener('click', () => {
                    const url = item.getAttribute('data-news-url');
                    // Validate URL more robustly
                    if (url) {
                        try {
                            const parsedUrl = new URL(url);
                            // Only allow http and https protocols
                            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                                window.open(url, '_blank', 'noopener,noreferrer');
                            }
                        } catch (e) {
                            console.warn('Invalid news URL:', url);
                        }
                    }
                });
            });
        } catch (error) {
            console.error('News widget error:', error);
            this.showError(contentElement, error.message || 'Failed to load news');
        }
    }
}
