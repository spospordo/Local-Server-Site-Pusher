#!/usr/bin/env node

/**
 * Test Widget Configuration GUI Integration
 * 
 * This test verifies that the admin GUI properly loads and saves widget
 * configuration including area and size properties.
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_PATH = path.join(__dirname, '..', 'admin', 'dashboard.html');

console.log('🧪 Widget Configuration GUI Integration Tests\n');

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
        console.log(`   Error: ${error.message}`);
    }
}

// Read the dashboard HTML
const dashboardHtml = fs.readFileSync(DASHBOARD_PATH, 'utf8');

// Test 1: Verify all widget checkboxes exist
test('Dashboard contains widget enable checkboxes', () => {
    const widgets = ['widgetClock', 'widgetWeather', 'widgetCalendar', 'widgetNews', 'widgetMedia'];
    for (const widget of widgets) {
        if (!dashboardHtml.includes(`id="${widget}"`)) {
            throw new Error(`Missing widget checkbox: ${widget}`);
        }
    }
});

// Test 2: Verify all position dropdowns exist
test('Dashboard contains position dropdowns for all widgets', () => {
    const widgets = ['Clock', 'Weather', 'Calendar', 'News', 'Media'];
    for (const widget of widgets) {
        if (!dashboardHtml.includes(`id="widget${widget}Area"`)) {
            throw new Error(`Missing position dropdown for: ${widget}`);
        }
    }
});

// Test 3: Verify all size dropdowns exist
test('Dashboard contains size dropdowns for all widgets', () => {
    const widgets = ['Clock', 'Weather', 'Calendar', 'News', 'Media'];
    for (const widget of widgets) {
        if (!dashboardHtml.includes(`id="widget${widget}Size"`)) {
            throw new Error(`Missing size dropdown for: ${widget}`);
        }
    }
});

// Test 4: Verify position dropdown has all 9 areas
test('Position dropdowns contain all 9 grid areas', () => {
    const areas = [
        'upper-left', 'upper-center', 'upper-right',
        'middle-left', 'middle-center', 'middle-right',
        'bottom-left', 'bottom-center', 'bottom-right'
    ];
    
    for (const area of areas) {
        const areaOption = `value="${area}"`;
        if (!dashboardHtml.includes(areaOption)) {
            throw new Error(`Missing area option: ${area}`);
        }
    }
});

// Test 5: Verify size dropdown has both options
test('Size dropdowns contain box and bar options', () => {
    if (!dashboardHtml.includes('value="box"')) {
        throw new Error('Missing box size option');
    }
    if (!dashboardHtml.includes('value="bar"')) {
        throw new Error('Missing bar size option');
    }
});

// Test 6: Verify loadMagicMirrorConfig loads area and size
test('loadMagicMirrorConfig function loads area and size properties', () => {
    if (!dashboardHtml.includes('widgetClockArea\').value =')) {
        throw new Error('loadMagicMirrorConfig does not set area values');
    }
    if (!dashboardHtml.includes('widgetClockSize\').value =')) {
        throw new Error('loadMagicMirrorConfig does not set size values');
    }
});

// Test 7: Verify saveMagicMirrorConfig saves area and size
test('saveMagicMirrorConfig function saves area and size properties', () => {
    if (!dashboardHtml.includes('area: document.getElementById(\'widgetClockArea\').value')) {
        throw new Error('saveMagicMirrorConfig does not save area values');
    }
    if (!dashboardHtml.includes('size: document.getElementById(\'widgetClockSize\').value')) {
        throw new Error('saveMagicMirrorConfig does not save size values');
    }
});

// Test 8: Verify tooltips exist
test('Widget configuration includes helpful tooltips', () => {
    if (!dashboardHtml.includes('ⓘ')) {
        throw new Error('Missing tooltip icons');
    }
    if (!dashboardHtml.includes('title="Choose where on the 3×3 grid to display this widget"')) {
        throw new Error('Missing position tooltip text');
    }
    if (!dashboardHtml.includes('title="Box: standard size, Bar: full-width"')) {
        throw new Error('Missing size tooltip text');
    }
});

// Test 9: Verify descriptive text exists
test('Configuration section includes descriptive text', () => {
    if (!dashboardHtml.includes('Configure which widgets to display and customize their position and size')) {
        throw new Error('Missing configuration description');
    }
});

// Test 10: Verify auto-save is configured
test('Dropdowns trigger auto-save on change', () => {
    const autoSavePattern = /onchange="saveMagicMirrorConfig\(\)"/g;
    const matches = dashboardHtml.match(autoSavePattern);
    
    if (!matches || matches.length < 10) {
        throw new Error('Not all dropdowns have auto-save configured');
    }
});

// Print summary
console.log('\n📊 Test Summary');
console.log(`✅ Passed: ${passedTests}`);
console.log(`Total: ${totalTests}`);

if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
} else {
    console.log(`\n❌ ${totalTests - passedTests} test(s) failed`);
    process.exit(1);
}
