/**
 * UI Controller - Manages UI state transitions
 */
export class UIController {
    constructor() {
        this.loadingScreen = document.getElementById('loadingScreen');
        this.errorScreen = document.getElementById('error');
        this.disabledScreen = document.getElementById('disabled');
        this.dashboardScreen = document.getElementById('dashboard');
        this.errorMessage = document.getElementById('errorMessage');
        this.lastUpdateElement = document.getElementById('lastUpdate');
        this.healthStatusElement = document.getElementById('healthStatus');
    }

    showLoading() {
        this.hideAll();
        this.loadingScreen.style.display = 'flex';
    }

    showError(message) {
        this.hideAll();
        this.errorMessage.textContent = message;
        this.errorScreen.style.display = 'flex';
    }

    showDisabled() {
        this.hideAll();
        this.disabledScreen.style.display = 'flex';
    }

    showDashboard() {
        this.hideAll();
        this.dashboardScreen.style.display = 'block';
    }

    hideAll() {
        this.loadingScreen.style.display = 'none';
        this.errorScreen.style.display = 'none';
        this.disabledScreen.style.display = 'none';
        this.dashboardScreen.style.display = 'none';
    }

    updateLastUpdateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        this.lastUpdateElement.textContent = `Last updated: ${timeString}`;
    }

    setHealthStatus(isHealthy) {
        this.healthStatusElement.className = 'health-status ' + (isHealthy ? 'healthy' : 'unhealthy');
        this.healthStatusElement.title = isHealthy ? 'Connected' : 'Connection issue';
    }
}
