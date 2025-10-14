#!/usr/bin/env node

/**
 * Test Magic Mirror Configuration Merge
 * 
 * This test verifies that the updateConfig function properly merges all
 * configuration sections, including the forecast section which was previously
 * missing from the merge logic.
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

console.log('🧪 Magic Mirror Configuration Merge Tests\n');

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

// Test 1: Verify initial config can be saved
test('Can save initial Magic Mirror configuration', () => {
    const config = {
        enabled: true,
        widgets: {
            clock: { enabled: true, area: 'upper-left', size: 'box' },
            forecast: { enabled: false, area: 'upper-right', size: 'box' }
        },
        weather: {
            location: 'London, UK',
            apiKey: 'test-api-key'
        },
        forecast: {
            days: 5
        }
    };
    
    const result = magicMirror.updateConfig(config);
    if (!result.success) {
        throw new Error('Failed to save config: ' + result.error);
    }
});

// Test 2: Verify config can be loaded
test('Can load saved Magic Mirror configuration', () => {
    const config = magicMirror.getFullConfig();
    if (!config) {
        throw new Error('Failed to load config');
    }
    if (!config.forecast) {
        throw new Error('Forecast section missing from loaded config');
    }
    if (config.forecast.days !== 5) {
        throw new Error('Forecast days not saved correctly. Expected 5, got ' + config.forecast.days);
    }
});

// Test 3: Update forecast days and verify merge
test('Updating forecast days preserves other config', () => {
    const updateData = {
        forecast: {
            days: 10
        }
    };
    
    const result = magicMirror.updateConfig(updateData);
    if (!result.success) {
        throw new Error('Failed to update config: ' + result.error);
    }
    
    const config = magicMirror.getFullConfig();
    if (config.forecast.days !== 10) {
        throw new Error('Forecast days not updated. Expected 10, got ' + config.forecast.days);
    }
    if (config.weather.location !== 'London, UK') {
        throw new Error('Weather location was lost during merge');
    }
    if (config.weather.apiKey !== 'test-api-key') {
        throw new Error('Weather API key was lost during merge');
    }
});

// Test 4: Enable forecast widget and verify merge
test('Enabling forecast widget preserves forecast days config', () => {
    const updateData = {
        widgets: {
            forecast: { enabled: true, area: 'upper-right', size: 'box' }
        }
    };
    
    const result = magicMirror.updateConfig(updateData);
    if (!result.success) {
        throw new Error('Failed to update config: ' + result.error);
    }
    
    const config = magicMirror.getFullConfig();
    if (!config.widgets.forecast.enabled) {
        throw new Error('Forecast widget not enabled');
    }
    if (config.forecast.days !== 10) {
        throw new Error('Forecast days was lost during merge. Expected 10, got ' + config.forecast.days);
    }
});

// Test 5: Enable media widget and verify it's saved
test('Enabling media widget is properly saved', () => {
    const updateData = {
        widgets: {
            media: { enabled: true, area: 'middle-right', size: 'box' }
        }
    };
    
    const result = magicMirror.updateConfig(updateData);
    if (!result.success) {
        throw new Error('Failed to update config: ' + result.error);
    }
    
    const config = magicMirror.getFullConfig();
    if (!config.widgets.media) {
        throw new Error('Media widget config missing');
    }
    if (!config.widgets.media.enabled) {
        throw new Error('Media widget not enabled');
    }
    if (config.widgets.media.area !== 'middle-right') {
        throw new Error('Media widget area not saved correctly');
    }
});

// Test 6: Verify getConfig returns sanitized config
test('getConfig sanitizes API key but preserves forecast config', () => {
    const config = magicMirror.getConfig();
    if (config.weather.apiKey !== '') {
        throw new Error('API key should be sanitized in getConfig');
    }
    if (!config.weather.hasApiKey) {
        throw new Error('hasApiKey flag should be true');
    }
    if (config.forecast.days !== 10) {
        throw new Error('Forecast days should still be present');
    }
});

// Test 7: Update complete config with all sections
test('Complete config update preserves all sections', () => {
    const completeConfig = {
        enabled: true,
        widgets: {
            clock: { enabled: true, area: 'upper-left', size: 'box' },
            weather: { enabled: true, area: 'upper-center', size: 'box' },
            forecast: { enabled: true, area: 'upper-right', size: 'box' },
            media: { enabled: true, area: 'middle-right', size: 'bar' }
        },
        weather: {
            location: 'New York, US',
            apiKey: 'new-test-key'
        },
        forecast: {
            days: 7
        }
    };
    
    const result = magicMirror.updateConfig(completeConfig);
    if (!result.success) {
        throw new Error('Failed to update config: ' + result.error);
    }
    
    const config = magicMirror.getFullConfig();
    if (config.forecast.days !== 7) {
        throw new Error('Forecast days not updated to 7');
    }
    if (config.widgets.forecast.enabled !== true) {
        throw new Error('Forecast widget should be enabled');
    }
    if (config.widgets.media.enabled !== true) {
        throw new Error('Media widget should be enabled');
    }
    if (config.widgets.media.size !== 'bar') {
        throw new Error('Media widget size should be bar');
    }
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
    console.log('\n✨ Configuration merge is working correctly:');
    console.log('   • Forecast section is properly merged');
    console.log('   • Widget configurations are preserved');
    console.log('   • API keys are properly handled');
    console.log('   • All config sections merge correctly');
    process.exit(0);
} else {
    console.log(`\n❌ ${totalTests - passedTests} test(s) failed`);
    process.exit(1);
}
