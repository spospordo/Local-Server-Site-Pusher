#!/usr/bin/env node

/**
 * Test script for auto theme switching functionality
 * Tests sunrise/sunset calculations and theme determination
 */

const smartMirror = require('../modules/smartmirror');

console.log('🧪 Testing Auto Theme Switching\n');
console.log('='.repeat(60));

// Test 1: Calculate sun times for NYC
console.log('\n📍 Test 1: Calculate sun times for New York City');
console.log('-'.repeat(60));
const nycLat = 40.7128;
const nycLon = -74.0060;
const testDate = new Date('2024-01-15T12:00:00Z'); // Mid-day in winter

try {
    const sunTimes = smartMirror.calculateSunTimes(nycLat, nycLon, 'America/New_York', testDate);
    if (sunTimes) {
        console.log('✅ Sun times calculated successfully:');
        console.log(`   Sunrise: ${sunTimes.sunriseISO} (${new Date(sunTimes.sunriseISO).toLocaleString()})`);
        console.log(`   Sunset:  ${sunTimes.sunsetISO} (${new Date(sunTimes.sunsetISO).toLocaleString()})`);
    } else {
        console.log('❌ Failed to calculate sun times');
    }
} catch (error) {
    console.log('❌ Error:', error.message);
}

// Test 2: Theme calculation during daylight hours
console.log('\n☀️  Test 2: Theme calculation during daylight (2 PM)');
console.log('-'.repeat(60));
const daylightConfig = {
    enabled: true,
    latitude: nycLat,
    longitude: nycLon,
    timezone: 'America/New_York'
};

// Mock current time to 2 PM
const daylightTime = new Date('2024-01-15T19:00:00Z'); // 2 PM EST
const originalNow = Date.now;
Date.now = () => daylightTime.getTime();

try {
    const themeInfo = smartMirror.calculateCurrentTheme(daylightConfig, 'dark');
    console.log('✅ Theme info calculated:');
    console.log(`   Auto Mode: ${themeInfo.autoMode}`);
    console.log(`   Current Theme: ${themeInfo.theme}`);
    console.log(`   Expected: light (should be between 30min before sunrise and 30min after sunset)`);
    if (themeInfo.nextSwitch) {
        console.log(`   Next Switch: ${themeInfo.nextSwitch} (${new Date(themeInfo.nextSwitch).toLocaleString()})`);
    }
    if (themeInfo.sunTimes) {
        console.log(`   Light Period: ${new Date(themeInfo.sunTimes.lightStart).toLocaleTimeString()} - ${new Date(themeInfo.sunTimes.lightEnd).toLocaleTimeString()}`);
    }
} catch (error) {
    console.log('❌ Error:', error.message);
}

// Restore Date.now
Date.now = originalNow;

// Test 3: Theme calculation at night
console.log('\n🌙 Test 3: Theme calculation at night (11 PM)');
console.log('-'.repeat(60));
const nightTime = new Date('2024-01-15T04:00:00Z'); // 11 PM EST previous day
Date.now = () => nightTime.getTime();

try {
    const themeInfo = smartMirror.calculateCurrentTheme(daylightConfig, 'dark');
    console.log('✅ Theme info calculated:');
    console.log(`   Auto Mode: ${themeInfo.autoMode}`);
    console.log(`   Current Theme: ${themeInfo.theme}`);
    console.log(`   Expected: dark (should be outside light period)`);
    if (themeInfo.nextSwitch) {
        console.log(`   Next Switch: ${themeInfo.nextSwitch} (${new Date(themeInfo.nextSwitch).toLocaleString()})`);
    }
    if (themeInfo.sunTimes) {
        console.log(`   Light Period: ${new Date(themeInfo.sunTimes.lightStart).toLocaleTimeString()} - ${new Date(themeInfo.sunTimes.lightEnd).toLocaleTimeString()}`);
    }
} catch (error) {
    console.log('❌ Error:', error.message);
}

Date.now = originalNow;

// Test 4: Theme with auto mode disabled
console.log('\n🔧 Test 4: Manual theme (auto mode disabled)');
console.log('-'.repeat(60));
const disabledConfig = {
    enabled: false,
    latitude: nycLat,
    longitude: nycLon,
    timezone: 'America/New_York'
};

try {
    const themeInfo = smartMirror.calculateCurrentTheme(disabledConfig, 'light');
    console.log('✅ Theme info calculated:');
    console.log(`   Auto Mode: ${themeInfo.autoMode}`);
    console.log(`   Current Theme: ${themeInfo.theme}`);
    console.log(`   Expected: light (manual theme should be used)`);
} catch (error) {
    console.log('❌ Error:', error.message);
}

// Test 5: Theme with missing coordinates
console.log('\n⚠️  Test 5: Auto mode with missing coordinates');
console.log('-'.repeat(60));
const noLocationConfig = {
    enabled: true,
    latitude: null,
    longitude: null,
    timezone: 'America/New_York'
};

try {
    const themeInfo = smartMirror.calculateCurrentTheme(noLocationConfig, 'dark');
    console.log('✅ Theme info calculated:');
    console.log(`   Auto Mode: ${themeInfo.autoMode}`);
    console.log(`   Current Theme: ${themeInfo.theme}`);
    console.log(`   Error: ${themeInfo.error || 'None'}`);
    console.log(`   Expected: dark (manual theme due to missing location)`);
} catch (error) {
    console.log('❌ Error:', error.message);
}

// Test 6: Different locations - Test summer vs winter
console.log('\n🌍 Test 6: Different locations and seasons');
console.log('-'.repeat(60));

const locations = [
    { name: 'New York (Winter)', lat: 40.7128, lon: -74.0060, date: new Date('2024-01-15T12:00:00Z') },
    { name: 'New York (Summer)', lat: 40.7128, lon: -74.0060, date: new Date('2024-07-15T12:00:00Z') },
    { name: 'London', lat: 51.5074, lon: -0.1278, date: new Date('2024-01-15T12:00:00Z') },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093, date: new Date('2024-01-15T12:00:00Z') },
    { name: 'Reykjavik (Winter)', lat: 64.1466, lon: -21.9426, date: new Date('2024-01-15T12:00:00Z') }
];

locations.forEach(loc => {
    try {
        const sunTimes = smartMirror.calculateSunTimes(loc.lat, loc.lon, 'UTC', loc.date);
        if (sunTimes) {
            const sunrise = new Date(sunTimes.sunrise);
            const sunset = new Date(sunTimes.sunset);
            const daylightHours = (sunset - sunrise) / 1000 / 60 / 60;
            console.log(`\n${loc.name}:`);
            console.log(`   Sunrise: ${sunrise.toLocaleTimeString()}`);
            console.log(`   Sunset:  ${sunset.toLocaleTimeString()}`);
            console.log(`   Daylight: ${daylightHours.toFixed(2)} hours`);
        }
    } catch (error) {
        console.log(`\n${loc.name}: ❌ Error - ${error.message}`);
    }
});

console.log('\n' + '='.repeat(60));
console.log('✅ All tests completed\n');
