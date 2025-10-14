#!/usr/bin/env node

/**
 * Test Dashboard Configuration Flow
 * 
 * This test simulates the complete flow:
 * 1. Admin enables forecast and media widgets via admin panel
 * 2. Configuration is saved via API
 * 3. Dashboard fetches configuration
 * 4. Verify widgets would be displayed
 */

const fs = require('fs');
const path = require('path');

// Clean up any existing test config files
const configDir = path.join(__dirname, '..', 'config');
const testConfigFile = path.join(configDir, 'magicmirror-config.json.enc');
const testKeyFile = path.join(configDir, '.magicmirror-key');

// Backup existing files if they exist
let backupConfig = null;
let backupKey = null;

if (fs.existsSync(testConfigFile)) {
    backupConfig = fs.readFileSync(testConfigFile);
}
if (fs.existsSync(testKeyFile)) {
    backupKey = fs.readFileSync(testKeyFile);
}

// Load the magicmirror module
const magicMirror = require(path.join(__dirname, '..', 'modules', 'magicmirror'));

console.log('🧪 Dashboard Configuration Flow Test\n');
console.log('Simulating admin enabling forecast and media player widgets...\n');

let passedTests = 0;
let totalTests = 0;

function test(description, fn) {
    totalTests++;
    try {
        fn();
        console.log(`✅ ${description}`);
        passedTests++;
    } catch (error) {
        console.log(`❌ ${description}`);
        console.log(`   ${error.message}`);
    }
}

// Step 1: Initial setup - Magic Mirror disabled with default widgets
console.log('Step 1: Initial setup');
test('Initialize Magic Mirror with default configuration', () => {
    const defaultConfig = {
        enabled: false,
        widgets: {
            clock: { enabled: true, area: 'upper-left', size: 'box' },
            weather: { enabled: false, area: 'upper-center', size: 'box' },
            forecast: { enabled: false, area: 'upper-right', size: 'box' },
            calendar: { enabled: false, area: 'middle-left', size: 'box' },
            news: { enabled: false, area: 'bottom-left', size: 'bar' },
            media: { enabled: false, area: 'middle-right', size: 'box' }
        },
        weather: {
            location: '',
            apiKey: ''
        },
        forecast: {
            days: 5
        }
    };
    
    const result = magicMirror.updateConfig(defaultConfig);
    if (!result.success) {
        throw new Error('Failed to save initial config: ' + result.error);
    }
});

// Step 2: Admin enables Magic Mirror
console.log('\nStep 2: Admin enables Magic Mirror');
test('Enable Magic Mirror', () => {
    const result = magicMirror.updateConfig({ enabled: true });
    if (!result.success) {
        throw new Error('Failed to enable Magic Mirror: ' + result.error);
    }
    
    const config = magicMirror.getConfig();
    if (!config.enabled) {
        throw new Error('Magic Mirror should be enabled');
    }
});

// Step 3: Admin configures weather settings
console.log('\nStep 3: Admin configures weather settings');
test('Configure weather location and API key', () => {
    const result = magicMirror.updateConfig({
        weather: {
            location: 'San Francisco, US',
            apiKey: 'test-api-key-12345'
        }
    });
    
    if (!result.success) {
        throw new Error('Failed to save weather config: ' + result.error);
    }
    
    const fullConfig = magicMirror.getFullConfig();
    if (fullConfig.weather.location !== 'San Francisco, US') {
        throw new Error('Weather location not saved');
    }
    if (fullConfig.weather.apiKey !== 'test-api-key-12345') {
        throw new Error('Weather API key not saved');
    }
});

// Step 4: Admin enables forecast widget
console.log('\nStep 4: Admin enables forecast widget');
test('Enable forecast widget with custom days', () => {
    const result = magicMirror.updateConfig({
        widgets: {
            forecast: { enabled: true, area: 'upper-right', size: 'box' }
        },
        forecast: {
            days: 7
        }
    });
    
    if (!result.success) {
        throw new Error('Failed to enable forecast widget: ' + result.error);
    }
    
    const config = magicMirror.getConfig();
    if (!config.widgets.forecast.enabled) {
        throw new Error('Forecast widget should be enabled');
    }
    if (config.forecast.days !== 7) {
        throw new Error('Forecast days should be 7, got: ' + config.forecast.days);
    }
});

test('Verify weather config preserved after forecast update', () => {
    const fullConfig = magicMirror.getFullConfig();
    if (fullConfig.weather.location !== 'San Francisco, US') {
        throw new Error('Weather location was lost during forecast update');
    }
    if (fullConfig.weather.apiKey !== 'test-api-key-12345') {
        throw new Error('Weather API key was lost during forecast update');
    }
});

// Step 5: Admin enables media player widget
console.log('\nStep 5: Admin enables media player widget');
test('Enable media player widget', () => {
    const result = magicMirror.updateConfig({
        widgets: {
            media: { enabled: true, area: 'middle-right', size: 'bar' }
        }
    });
    
    if (!result.success) {
        throw new Error('Failed to enable media widget: ' + result.error);
    }
    
    const config = magicMirror.getConfig();
    if (!config.widgets.media.enabled) {
        throw new Error('Media widget should be enabled');
    }
    if (config.widgets.media.size !== 'bar') {
        throw new Error('Media widget size should be bar');
    }
});

test('Verify all previous configs preserved after media update', () => {
    const config = magicMirror.getConfig();
    if (!config.widgets.forecast.enabled) {
        throw new Error('Forecast widget should still be enabled');
    }
    if (config.forecast.days !== 7) {
        throw new Error('Forecast days should still be 7');
    }
    
    const fullConfig = magicMirror.getFullConfig();
    if (fullConfig.weather.location !== 'San Francisco, US') {
        throw new Error('Weather location was lost');
    }
});

// Step 6: Dashboard requests configuration
console.log('\nStep 6: Dashboard requests configuration (simulating /api/magicmirror/data)');
test('Dashboard receives correct configuration', () => {
    const config = magicMirror.getConfig();
    
    // Check Magic Mirror is enabled
    if (!config.enabled) {
        throw new Error('Dashboard should see Magic Mirror as enabled');
    }
    
    // Check forecast widget is enabled
    if (!config.widgets.forecast || !config.widgets.forecast.enabled) {
        throw new Error('Dashboard should see forecast widget as enabled');
    }
    
    // Check media widget is enabled
    if (!config.widgets.media || !config.widgets.media.enabled) {
        throw new Error('Dashboard should see media widget as enabled');
    }
    
    // Check forecast days
    if (config.forecast.days !== 7) {
        throw new Error('Dashboard should see forecast days as 7');
    }
    
    // Check API key is sanitized
    if (config.weather.apiKey !== '') {
        throw new Error('Dashboard should not see the actual API key');
    }
    if (!config.weather.hasApiKey) {
        throw new Error('Dashboard should see hasApiKey flag as true');
    }
});

// Step 7: Verify widget templates exist in config
console.log('\nStep 7: Verify widgets would be rendered');
test('Forecast widget has proper configuration for rendering', () => {
    const config = magicMirror.getConfig();
    const forecastWidget = config.widgets.forecast;
    
    if (!forecastWidget.enabled) {
        throw new Error('Forecast widget not enabled');
    }
    if (!forecastWidget.area || forecastWidget.area === '') {
        throw new Error('Forecast widget missing area');
    }
    if (!forecastWidget.size || forecastWidget.size === '') {
        throw new Error('Forecast widget missing size');
    }
    
    console.log('   Forecast widget: enabled=true, area=' + forecastWidget.area + ', size=' + forecastWidget.size);
});

test('Media widget has proper configuration for rendering', () => {
    const config = magicMirror.getConfig();
    const mediaWidget = config.widgets.media;
    
    if (!mediaWidget.enabled) {
        throw new Error('Media widget not enabled');
    }
    if (!mediaWidget.area || mediaWidget.area === '') {
        throw new Error('Media widget missing area');
    }
    if (!mediaWidget.size || mediaWidget.size === '') {
        throw new Error('Media widget missing size');
    }
    
    console.log('   Media widget: enabled=true, area=' + mediaWidget.area + ', size=' + mediaWidget.size);
});

// Clean up and restore backups
if (fs.existsSync(testConfigFile)) {
    fs.unlinkSync(testConfigFile);
}
if (fs.existsSync(testKeyFile)) {
    fs.unlinkSync(testKeyFile);
}

if (backupConfig) {
    fs.writeFileSync(testConfigFile, backupConfig);
}
if (backupKey) {
    fs.writeFileSync(testKeyFile, backupKey);
}

// Print summary
console.log('\n📊 Test Summary');
console.log(`✅ Passed: ${passedTests}`);
console.log(`Total: ${totalTests}`);

if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed!');
    console.log('\n✨ Dashboard configuration flow is working correctly:');
    console.log('   • Admin can enable forecast widget');
    console.log('   • Admin can enable media player widget');
    console.log('   • Widget configurations are properly saved');
    console.log('   • Dashboard receives correct configuration');
    console.log('   • Widgets would be rendered with correct settings');
    console.log('\n🪞 Expected dashboard behavior after admin saves:');
    console.log('   • Forecast widget displays in upper-right area as a box');
    console.log('   • Media player widget displays in middle-right area as a bar');
    console.log('   • Both widgets fetch their data from respective API endpoints');
    process.exit(0);
} else {
    console.log(`\n❌ ${totalTests - passedTests} test(s) failed`);
    process.exit(1);
}
