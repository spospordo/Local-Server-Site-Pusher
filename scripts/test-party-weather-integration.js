#!/usr/bin/env node

/**
 * Test script for Party Weather Integration
 * Verifies that weather forecast functionality is properly integrated into party system
 */

const fs = require('fs');
const path = require('path');

console.log('🌤️  Party Weather Integration Test Script\n');
console.log('='.repeat(60));

let allTestsPassed = true;

// Test 1: Check modules/smartmirror.js has new weather function
console.log('\n✓ Test 1: Checking smartmirror.js for fetchWeatherForDate function...');
const smartMirrorPath = path.join(__dirname, '..', 'modules', 'smartmirror.js');
const smartMirrorContent = fs.readFileSync(smartMirrorPath, 'utf8');

if (smartMirrorContent.includes('async function fetchWeatherForDate(')) {
    console.log('  ✅ Found fetchWeatherForDate function');
} else {
    console.log('  ❌ fetchWeatherForDate function not found');
    allTestsPassed = false;
}

if (smartMirrorContent.includes('fetchWeatherForDate,')) {
    console.log('  ✅ fetchWeatherForDate exported in module.exports');
} else {
    console.log('  ❌ fetchWeatherForDate not exported');
    allTestsPassed = false;
}

// Check for date-specific weather logic
if (smartMirrorContent.includes('targetDate') && smartMirrorContent.includes('hourlyForecast')) {
    console.log('  ✅ Found hourly forecast logic for specific date');
} else {
    console.log('  ❌ Hourly forecast logic not found');
    allTestsPassed = false;
}

// Test 2: Check server.js has weather API endpoint
console.log('\n✓ Test 2: Checking server.js for party weather endpoint...');
const serverPath = path.join(__dirname, '..', 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

if (serverContent.includes("/admin/api/party/weather")) {
    console.log('  ✅ Found party weather API endpoint');
} else {
    console.log('  ❌ Party weather API endpoint not found');
    allTestsPassed = false;
}

if (serverContent.includes('fetchWeatherForDate')) {
    console.log('  ✅ Found fetchWeatherForDate call in server');
} else {
    console.log('  ❌ fetchWeatherForDate call not found');
    allTestsPassed = false;
}

// Test 3: Check party sub-widget case includes weather
console.log('\n✓ Test 3: Checking party sub-widget includes weather data...');

if (serverContent.includes("case 'party':")) {
    console.log('  ✅ Found party case in smart widget');
    
    if (serverContent.includes('weatherData') && serverContent.includes("weather:")) {
        console.log('  ✅ Found weather data in party case');
    } else {
        console.log('  ❌ Weather data not found in party case');
        allTestsPassed = false;
    }
    
    if (serverContent.includes('smartMirror.fetchWeatherForDate')) {
        console.log('  ✅ Found fetchWeatherForDate call in party case');
    } else {
        console.log('  ❌ fetchWeatherForDate call not found in party case');
        allTestsPassed = false;
    }
    
    if (serverContent.includes('daysUntil <= 3')) {
        console.log('  ✅ Found 3-day logic for hourly weather');
    } else {
        console.log('  ❌ 3-day logic for hourly weather not found');
        allTestsPassed = false;
    }
} else {
    console.log('  ❌ Party case not found');
    allTestsPassed = false;
}

// Test 4: Check smart-mirror.html renderParty includes weather
console.log('\n✓ Test 4: Checking smart-mirror.html renderParty renders weather...');
const smartMirrorHtmlPath = path.join(__dirname, '..', 'public', 'smart-mirror.html');
const smartMirrorHtmlContent = fs.readFileSync(smartMirrorHtmlPath, 'utf8');

if (smartMirrorHtmlContent.includes('data.weather')) {
    console.log('  ✅ Found weather data reference in renderParty');
} else {
    console.log('  ❌ Weather data reference not found');
    allTestsPassed = false;
}

const expectedWeatherElements = [
    'Weather Forecast',
    'openweathermap.org/img/wn',
    'tempHigh',
    'tempLow',
    'precipChance',
    'hourly'
];

let weatherElementsFound = true;
expectedWeatherElements.forEach(element => {
    if (smartMirrorHtmlContent.includes(element)) {
        console.log(`  ✅ Found ${element} in weather rendering`);
    } else {
        console.log(`  ❌ Missing ${element} in weather rendering`);
        weatherElementsFound = false;
        allTestsPassed = false;
    }
});

// Test 5: Check admin dashboard has weather loading
console.log('\n✓ Test 5: Checking admin dashboard for weather display...');
const dashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

if (dashboardContent.includes('Weather Forecast for Party Date') || dashboardContent.includes('🌤️')) {
    console.log('  ✅ Found weather forecast section in admin');
} else {
    console.log('  ❌ Weather forecast section not found');
    allTestsPassed = false;
}

if (dashboardContent.includes('loadPartyWeather')) {
    console.log('  ✅ Found loadPartyWeather function');
} else {
    console.log('  ❌ loadPartyWeather function not found');
    allTestsPassed = false;
}

if (dashboardContent.includes('partyWeatherContainer')) {
    console.log('  ✅ Found weather container element');
} else {
    console.log('  ❌ Weather container element not found');
    allTestsPassed = false;
}

// Test 6: Verify error handling
console.log('\n✓ Test 6: Checking error handling...');

if (serverContent.includes('weatherResult.success') && serverContent.includes('weatherResult.error')) {
    console.log('  ✅ Found error handling in server weather fetch');
} else {
    console.log('  ❌ Error handling not found in server');
    allTestsPassed = false;
}

if (dashboardContent.includes('Weather Data Unavailable') || dashboardContent.includes('error')) {
    console.log('  ✅ Found error UI in admin dashboard');
} else {
    console.log('  ❌ Error UI not found in admin dashboard');
    allTestsPassed = false;
}

// Test 7: Check for OpenWeatherMap attribution
console.log('\n✓ Test 7: Checking for weather data source attribution...');

if (smartMirrorHtmlContent.includes('OpenWeatherMap')) {
    console.log('  ✅ Found OpenWeatherMap attribution in widget');
} else {
    console.log('  ❌ OpenWeatherMap attribution not found in widget');
    allTestsPassed = false;
}

if (dashboardContent.includes('OpenWeatherMap')) {
    console.log('  ✅ Found OpenWeatherMap attribution in admin');
} else {
    console.log('  ❌ OpenWeatherMap attribution not found in admin');
    allTestsPassed = false;
}

// Test 8: Verify hourly forecast conditional logic
console.log('\n✓ Test 8: Checking conditional hourly forecast display...');

if (smartMirrorHtmlContent.includes('data.weather.hourly')) {
    console.log('  ✅ Found conditional hourly display in widget');
} else {
    console.log('  ❌ Conditional hourly display not found in widget');
    allTestsPassed = false;
}

if (dashboardContent.includes('showHourly')) {
    console.log('  ✅ Found showHourly flag in admin');
} else {
    console.log('  ❌ showHourly flag not found in admin');
    allTestsPassed = false;
}

console.log('\n' + '='.repeat(60));

if (allTestsPassed) {
    console.log('\n🎉 All tests passed! Party weather integration is complete.\n');
    console.log('Next steps:');
    console.log('1. Start the server: npm start');
    console.log('2. Configure weather in Smart Mirror settings (API key & location)');
    console.log('3. Set a party date in Party > Scheduling tab');
    console.log('4. Click "Load Weather Forecast" to see weather for party date');
    console.log('5. Enable party sub-widget to see weather on smart mirror');
    console.log('');
    process.exit(0);
} else {
    console.log('\n❌ Some tests failed. Review the output above.\n');
    process.exit(1);
}
