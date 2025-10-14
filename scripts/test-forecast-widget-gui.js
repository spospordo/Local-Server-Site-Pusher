#!/usr/bin/env node

/**
 * Test Forecast Widget GUI Implementation
 * 
 * This test verifies that the admin GUI properly includes the forecast widget
 * configuration controls, including enable/disable, position, size, and days selection.
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_PATH = path.join(__dirname, '..', 'admin', 'dashboard.html');

console.log('🧪 Forecast Widget GUI Implementation Tests\n');

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

// Test 1: Verify forecast widget checkbox exists
test('Dashboard contains forecast widget enable checkbox', () => {
    if (!dashboardHtml.includes('id="widgetForecast"')) {
        throw new Error('Missing forecast widget checkbox (widgetForecast)');
    }
});

// Test 2: Verify forecast widget has label
test('Forecast widget checkbox has proper label', () => {
    const forecastPattern = /<input[^>]*id="widgetForecast"[^>]*>\s*<strong>Forecast<\/strong>/;
    if (!forecastPattern.test(dashboardHtml)) {
        throw new Error('Forecast widget checkbox missing proper label');
    }
});

// Test 3: Verify forecast position dropdown exists
test('Dashboard contains forecast widget position dropdown', () => {
    if (!dashboardHtml.includes('id="widgetForecastArea"')) {
        throw new Error('Missing forecast widget position dropdown (widgetForecastArea)');
    }
});

// Test 4: Verify forecast size dropdown exists
test('Dashboard contains forecast widget size dropdown', () => {
    if (!dashboardHtml.includes('id="widgetForecastSize"')) {
        throw new Error('Missing forecast widget size dropdown (widgetForecastSize)');
    }
});

// Test 5: Verify forecast days selector exists
test('Dashboard contains forecast days selector', () => {
    if (!dashboardHtml.includes('id="forecastDays"')) {
        throw new Error('Missing forecast days selector (forecastDays)');
    }
});

// Test 6: Verify forecast days selector has all options
test('Forecast days selector contains all options (1, 3, 5, 10)', () => {
    const daysOptions = [
        'value="1"',
        'value="3"',
        'value="5"',
        'value="10"'
    ];
    
    for (const option of daysOptions) {
        if (!dashboardHtml.includes(option)) {
            throw new Error(`Missing forecast days option: ${option}`);
        }
    }
});

// Test 7: Verify forecast days selector has descriptive text
test('Forecast days selector has descriptive options', () => {
    const descriptiveOptions = [
        'Tomorrow (1 day)',
        '3 days',
        '5 days',
        '10 days'
    ];
    
    for (const option of descriptiveOptions) {
        if (!dashboardHtml.includes(option)) {
            throw new Error(`Missing descriptive text for option: ${option}`);
        }
    }
});

// Test 8: Verify loadMagicMirrorConfig loads forecast widget settings
test('loadMagicMirrorConfig function loads forecast widget enabled state', () => {
    if (!dashboardHtml.includes('widgetForecast\').checked =')) {
        throw new Error('loadMagicMirrorConfig does not set forecast enabled state');
    }
});

// Test 9: Verify loadMagicMirrorConfig loads forecast area
test('loadMagicMirrorConfig function loads forecast widget area', () => {
    if (!dashboardHtml.includes('widgetForecastArea\').value =')) {
        throw new Error('loadMagicMirrorConfig does not set forecast area');
    }
});

// Test 10: Verify loadMagicMirrorConfig loads forecast size
test('loadMagicMirrorConfig function loads forecast widget size', () => {
    if (!dashboardHtml.includes('widgetForecastSize\').value =')) {
        throw new Error('loadMagicMirrorConfig does not set forecast size');
    }
});

// Test 11: Verify loadMagicMirrorConfig loads forecast days
test('loadMagicMirrorConfig function loads forecast days setting', () => {
    if (!dashboardHtml.includes('forecastDays\').value =')) {
        throw new Error('loadMagicMirrorConfig does not set forecast days');
    }
});

// Test 12: Verify saveMagicMirrorConfig saves forecast widget enabled
test('saveMagicMirrorConfig function saves forecast widget enabled state', () => {
    const pattern = /forecast:\s*\{[^}]*enabled:\s*document\.getElementById\('widgetForecast'\)\.checked/;
    if (!pattern.test(dashboardHtml)) {
        throw new Error('saveMagicMirrorConfig does not save forecast enabled state');
    }
});

// Test 13: Verify saveMagicMirrorConfig saves forecast area
test('saveMagicMirrorConfig function saves forecast widget area', () => {
    const pattern = /forecast:\s*\{[^}]*area:\s*document\.getElementById\('widgetForecastArea'\)\.value/;
    if (!pattern.test(dashboardHtml)) {
        throw new Error('saveMagicMirrorConfig does not save forecast area');
    }
});

// Test 14: Verify saveMagicMirrorConfig saves forecast size
test('saveMagicMirrorConfig function saves forecast widget size', () => {
    const pattern = /forecast:\s*\{[^}]*size:\s*document\.getElementById\('widgetForecastSize'\)\.value/;
    if (!pattern.test(dashboardHtml)) {
        throw new Error('saveMagicMirrorConfig does not save forecast size');
    }
});

// Test 15: Verify saveMagicMirrorConfig saves forecast days
test('saveMagicMirrorConfig function saves forecast days setting', () => {
    const pattern = /forecast:\s*\{[^}]*days:\s*parseInt\(document\.getElementById\('forecastDays'\)\.value\)/;
    if (!pattern.test(dashboardHtml)) {
        throw new Error('saveMagicMirrorConfig does not save forecast days');
    }
});

// Test 16: Verify forecast controls have auto-save
test('Forecast widget controls trigger auto-save on change', () => {
    const forecastSection = dashboardHtml.substring(
        dashboardHtml.indexOf('<!-- Forecast Widget -->'),
        dashboardHtml.indexOf('<!-- Calendar Widget -->')
    );
    
    const autoSavePattern = /onchange="saveMagicMirrorConfig\(\)"/g;
    const matches = forecastSection.match(autoSavePattern);
    
    if (!matches || matches.length < 3) {
        throw new Error('Not all forecast widget controls have auto-save configured (expected at least 3)');
    }
});

// Test 17: Verify forecast days control has auto-save
test('Forecast days selector triggers auto-save on change', () => {
    const forecastDaysPattern = /id="forecastDays"[^>]*onchange="saveMagicMirrorConfig\(\)"/;
    if (!forecastDaysPattern.test(dashboardHtml)) {
        throw new Error('Forecast days selector does not have auto-save configured');
    }
});

// Test 18: Verify forecast widget has tooltip
test('Forecast widget configuration includes helpful tooltip', () => {
    const forecastSection = dashboardHtml.substring(
        dashboardHtml.indexOf('id="forecastDays"') - 200,
        dashboardHtml.indexOf('id="forecastDays"') + 200
    );
    
    if (!forecastSection.includes('ⓘ')) {
        throw new Error('Missing tooltip icon for forecast days');
    }
});

// Test 19: Verify forecast widget is placed correctly in DOM
test('Forecast widget is placed after Weather widget', () => {
    const weatherIndex = dashboardHtml.indexOf('<!-- Weather Widget -->');
    const forecastIndex = dashboardHtml.indexOf('<!-- Forecast Widget -->');
    
    if (forecastIndex === -1) {
        throw new Error('Forecast widget section not found');
    }
    
    if (forecastIndex <= weatherIndex) {
        throw new Error('Forecast widget is not placed after Weather widget');
    }
});

// Test 20: Verify forecast widget follows same structure as other widgets
test('Forecast widget follows same HTML structure as other widgets', () => {
    const forecastSection = dashboardHtml.substring(
        dashboardHtml.indexOf('<!-- Forecast Widget -->'),
        dashboardHtml.indexOf('<!-- Calendar Widget -->')
    );
    
    // Check for standard widget structure elements
    if (!forecastSection.includes('form-row')) {
        throw new Error('Forecast widget missing form-row structure');
    }
    if (!forecastSection.includes('form-group')) {
        throw new Error('Forecast widget missing form-group structure');
    }
    if (!forecastSection.includes('background: #f8f9fa')) {
        throw new Error('Forecast widget missing standard background styling');
    }
});

// Print summary
console.log('\n📊 Test Summary');
console.log(`✅ Passed: ${passedTests}`);
console.log(`Total: ${totalTests}`);

if (passedTests === totalTests) {
    console.log('\n🎉 All tests passed!');
    console.log('\n✨ Forecast widget GUI is properly implemented:');
    console.log('   • Forecast widget checkbox for enable/disable');
    console.log('   • Position selector (9 grid areas)');
    console.log('   • Size selector (box/bar)');
    console.log('   • Forecast days selector (1, 3, 5, 10 days)');
    console.log('   • Auto-save on all controls');
    console.log('   • Load and save functions updated');
    process.exit(0);
} else {
    console.log(`\n❌ ${totalTests - passedTests} test(s) failed`);
    process.exit(1);
}
