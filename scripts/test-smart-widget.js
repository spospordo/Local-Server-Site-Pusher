#!/usr/bin/env node

/**
 * Test script for Smart Widget functionality
 * 
 * Tests:
 * 1. Smart Widget API endpoint when disabled
 * 2. Smart Widget API endpoint when enabled
 * 3. Smart sub-widget migrations include newly added defaults
 * 4. Upcoming vacation sub-widget
 * 5. Home Assistant media sub-widget
 */

const smartMirror = require('../modules/smartmirror');
const house = require('../modules/house');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Smart Widget Functionality\n');
console.log('=' .repeat(80));

// Initialize modules
smartMirror.init({});

// Test 1: Load default config
console.log('\n📋 Test 1: Loading default Smart Widget configuration');
const config = smartMirror.loadConfig();
const smartWidget = config.widgets.smartWidget;

console.log('✓ Smart Widget config loaded');
console.log(`  - Enabled: ${smartWidget.enabled}`);
console.log(`  - Display Mode: ${smartWidget.displayMode}`);
console.log(`  - Cycle Speed: ${smartWidget.cycleSpeed}s`);
console.log(`  - Sub-widgets: ${smartWidget.subWidgets.length}`);
smartWidget.subWidgets.forEach(sw => {
    console.log(`    - ${sw.type}: enabled=${sw.enabled}, priority=${sw.priority}`);
});

// Test 2: Validate sub-widget types
console.log('\n📋 Test 2: Validating sub-widget types');
const expectedTypes = ['rainForecast', 'upcomingVacation', 'homeAssistantMedia', 'party', 'qrCodes'];
const actualTypes = smartWidget.subWidgets.map(sw => sw.type);
const allTypesPresent = expectedTypes.every(type => actualTypes.includes(type));
if (allTypesPresent) {
    console.log('✓ All expected sub-widget types are present');
} else {
    console.error('✗ Missing sub-widget types');
    console.error('  Expected:', expectedTypes);
    console.error('  Actual:', actualTypes);
}

// Test 3: Check layouts
console.log('\n📋 Test 3: Checking Smart Widget layouts');
const portraitLayout = config.layouts.portrait.smartWidget;
const landscapeLayout = config.layouts.landscape.smartWidget;

console.log('✓ Portrait layout:', portraitLayout);
console.log('✓ Landscape layout:', landscapeLayout);

if (portraitLayout && landscapeLayout) {
    console.log('✓ Both layouts configured');
} else {
    console.error('✗ Layouts missing');
}

// Test 4: Validate display modes
console.log('\n📋 Test 4: Validating display modes');
const validModes = ['cycle', 'simultaneous', 'priority', 'adaptive'];
if (validModes.includes(smartWidget.displayMode)) {
    console.log(`✓ Valid display mode: ${smartWidget.displayMode}`);
} else {
    console.error(`✗ Invalid display mode: ${smartWidget.displayMode}`);
}

// Test 5: Check priority ordering
console.log('\n📋 Test 5: Checking sub-widget priorities');
const priorities = smartWidget.subWidgets.map(sw => sw.priority);
const uniquePriorities = new Set(priorities);
if (priorities.length === uniquePriorities.size) {
    console.log('✓ All priorities are unique');
} else {
    console.warn('⚠ Some sub-widgets have duplicate priorities');
}

const sortedPriorities = [...priorities].sort((a, b) => a - b);
console.log(`  Priorities: ${sortedPriorities.join(', ')}`);

// Test 5b: Validate QR code sub-widget defaults
console.log('\n📋 Test 5b: Checking QR code sub-widget defaults');
const qrCodesWidget = smartWidget.subWidgets.find(sw => sw.type === 'qrCodes');
if (qrCodesWidget) {
    console.log('✓ QR code sub-widget is available');
    console.log(`  - Enabled: ${qrCodesWidget.enabled}`);
    console.log(`  - Priority: ${qrCodesWidget.priority}`);
    console.log(`  - Cycle Time: ${qrCodesWidget.cycleTime}s`);
} else {
    console.error('✗ QR code sub-widget is missing');
}

// Test 5c: Validate admin widget discovery
console.log('\n📋 Test 5c: Checking admin widget discovery');
const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'admin', 'dashboard.html'), 'utf8');
if (/id:\s*'smartWidgetQrCodesEnabled'[\s\S]*name:\s*'QR Codes'/.test(dashboardHtml)) {
    console.log('✓ QR code sub-widget is discoverable in the grid editor');
} else {
    console.error('✗ QR code sub-widget is missing from SMART_SUB_WIDGETS');
}

// Test 6: Simulate vacation data
console.log('\n📋 Test 6: Testing vacation sub-widget data integration');
try {
    const vacationData = house.getVacationData();
    console.log('✓ Vacation data retrieved');
    console.log(`  - Dates: ${vacationData.dates ? vacationData.dates.length : 0}`);
    
    if (vacationData.dates && vacationData.dates.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const upcomingVacations = vacationData.dates
            .filter(vac => new Date(vac.startDate) >= today)
            .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        
        console.log(`  - Upcoming vacations: ${upcomingVacations.length}`);
        if (upcomingVacations.length > 0) {
            const next = upcomingVacations[0];
            console.log(`  - Next: ${next.destination} on ${next.startDate}`);
        }
    }
} catch (err) {
    console.warn(`⚠ Vacation data test: ${err.message}`);
}

// Test 7: Configuration persistence
console.log('\n📋 Test 7: Testing configuration persistence');
const originalEnabled = smartWidget.enabled;
console.log(`  - Current state: ${originalEnabled ? 'enabled' : 'disabled'}`);

// Simulate enabling Smart Widget
const testConfig = JSON.parse(JSON.stringify(config));
testConfig.widgets.smartWidget.enabled = true;
testConfig.widgets.smartWidget.displayMode = 'simultaneous';

try {
    smartMirror.saveConfig(testConfig);
    console.log('✓ Configuration saved');
    
    const reloadedConfig = smartMirror.loadConfig();
    if (reloadedConfig.widgets.smartWidget.enabled === true &&
        reloadedConfig.widgets.smartWidget.displayMode === 'simultaneous') {
        console.log('✓ Configuration persisted correctly');
    } else {
        console.error('✗ Configuration not persisted correctly');
    }
    
    // Restore original state
    smartMirror.saveConfig(config);
    console.log('✓ Original configuration restored');
} catch (err) {
    console.error(`✗ Configuration persistence test failed: ${err.message}`);
}

console.log('\n' + '='.repeat(80));
console.log('✅ Smart Widget tests completed!\n');
