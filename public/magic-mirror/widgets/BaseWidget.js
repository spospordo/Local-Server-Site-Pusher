/**
 * Base Widget Class
 */
export class BaseWidget {
    constructor(name, config, globalConfig) {
        this.name = name;
        this.config = config;
        this.globalConfig = globalConfig;
        this.element = null;
        this.refreshInterval = null;
    }

    createElement() {
        const widget = document.createElement('div');
        widget.className = 'widget';
        widget.id = `widget-${this.name}`;
        
        // Apply grid positioning
        if (this.config.gridPosition) {
            const pos = this.config.gridPosition;
            widget.style.gridColumn = `${pos.col} / span ${pos.colSpan}`;
            widget.style.gridRow = `${pos.row} / span ${pos.rowSpan}`;
        }
        
        this.element = widget;
        return widget;
    }

    createHeader(icon, title) {
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.innerHTML = `
            <span class="widget-title">${title}</span>
            <span class="widget-icon">${icon}</span>
        `;
        return header;
    }

    createContent() {
        const content = document.createElement('div');
        content.className = 'widget-content';
        return content;
    }

    showLoading(contentElement) {
        contentElement.innerHTML = '<div class="widget-loading">Loading...</div>';
    }

    showError(contentElement, message) {
        contentElement.innerHTML = `<div class="widget-error">⚠️ ${this.escapeHtml(message)}</div>`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    startRefresh(callback, intervalMs = 60000) {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        this.refreshInterval = setInterval(callback, intervalMs);
    }

    stopRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    render() {
        // Override in child classes
        throw new Error('render() must be implemented in child class');
    }

    destroy() {
        this.stopRefresh();
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}
