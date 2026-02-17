#!/usr/bin/env node

/**
 * Test script for vacation sub-widget weather display
 * Tests that weather data is fetched and displayed correctly
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const CONFIG_DIR = path.join(__dirname, '..', 'config');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n[${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

async function testVacationWeatherDisplay() {
    log('\n=== Testing Vacation Sub-Widget Weather Display ===\n', 'blue');
    
    try {
        // Step 1: Check if Smart Widget API returns weather data
        logStep('1', 'Testing Smart Widget API for vacation weather data');
        
        try {
            const response = await axios.get(`${BASE_URL}/api/smart-mirror/smart-widget`);
            
            if (response.data.success && response.data.subWidgets) {
                const vacationWidget = response.data.subWidgets.find(w => w.type === 'upcomingVacation');
                
                if (vacationWidget && vacationWidget.hasContent) {
                    logSuccess('Found vacation sub-widget with content');
                    
                    const vacations = vacationWidget.data?.vacations || [];
                    log(`  Found ${vacations.length} vacation(s)`, 'cyan');
                    
                    // Check each vacation for weather data
                    let hasWeather = false;
                    vacations.forEach((vacation, index) => {
                        log(`\n  Vacation ${index + 1}: ${vacation.destination}`, 'yellow');
                        log(`    Days until: ${vacation.daysUntil}`, 'reset');
                        log(`    Start date: ${vacation.startDate}`, 'reset');
                        
                        if (vacation.weather) {
                            hasWeather = true;
                            logSuccess(`    Weather data: YES`);
                            log(`      Location: ${vacation.weather.location || 'N/A'}`, 'reset');
                            log(`      Units: ${vacation.weather.units || 'N/A'}`, 'reset');
                            log(`      Fallback mode: ${vacation.weather.isFallback ? 'YES (current weather)' : 'NO (forecast)'}`, 'reset');
                            
                            if (vacation.weather.days && vacation.weather.days.length > 0) {
                                const firstDay = vacation.weather.days[0];
                                log(`      First day forecast:`, 'reset');
                                log(`        Date: ${firstDay.date || 'N/A'}`, 'reset');
                                log(`        Condition: ${firstDay.condition || 'N/A'}`, 'reset');
                                log(`        Temp High: ${firstDay.tempHigh}°`, 'reset');
                                log(`        Temp Low: ${firstDay.tempLow}°`, 'reset');
                                log(`        Icon: ${firstDay.icon || 'N/A'}`, 'reset');
                            } else {
                                logWarning(`      No forecast days available`);
                            }
                        } else {
                            logWarning(`    Weather data: NO`);
                        }
                    });
                    
                    if (hasWeather) {
                        logSuccess('\n✓ At least one vacation has weather data');
                    } else {
                        logWarning('\n⚠️  No vacations have weather data - check API key configuration');
                    }
                } else if (vacationWidget) {
                    logWarning('Vacation sub-widget exists but has no content');
                } else {
                    logWarning('Vacation sub-widget not found in response');
                }
            } else {
                logError('Smart Widget API response invalid or unsuccessful');
            }
        } catch (err) {
            if (err.response) {
                logError(`API returned error: ${err.response.status} ${err.response.statusText}`);
                if (err.response.data) {
                    log(`  Error details: ${JSON.stringify(err.response.data, null, 2)}`, 'red');
                }
            } else {
                logError(`Request failed: ${err.message}`);
            }
        }
        
        // Step 2: Check configuration
        logStep('2', 'Checking Smart Widget configuration');
        
        try {
            const smartMirrorConfigFile = path.join(CONFIG_DIR, 'smartmirror-config.json');
            
            if (fs.existsSync(smartMirrorConfigFile)) {
                const config = JSON.parse(fs.readFileSync(smartMirrorConfigFile, 'utf-8'));
                const smartWidget = config.widgets?.smartWidget;
                
                if (smartWidget) {
                    log(`  Smart Widget enabled: ${smartWidget.enabled}`, 'reset');
                    log(`  API key configured: ${smartWidget.apiKey ? 'YES' : 'NO'}`, smartWidget.apiKey ? 'green' : 'yellow');
                    log(`  Location configured: ${smartWidget.location || 'N/A'}`, 'reset');
                    log(`  Units: ${smartWidget.units || 'imperial'}`, 'reset');
                    
                    // Check if vacation sub-widget is enabled
                    const vacationSubWidget = smartWidget.subWidgets?.find(w => w.type === 'upcomingVacation');
                    if (vacationSubWidget) {
                        log(`  Vacation sub-widget enabled: ${vacationSubWidget.enabled}`, vacationSubWidget.enabled ? 'green' : 'yellow');
                    } else {
                        logWarning('  Vacation sub-widget not found in configuration');
                    }
                    
                    if (!smartWidget.apiKey) {
                        logWarning('\n⚠️  Weather API key not configured in Smart Widget');
                        log('  Weather data requires an OpenWeatherMap API key.', 'yellow');
                        log('  Configure it in Smart Mirror settings > Smart Widget > apiKey', 'yellow');
                        log('  Or it will fall back to weather/forecast widget API keys', 'yellow');
                    }
                } else {
                    logWarning('Smart Widget configuration not found');
                }
            } else {
                logWarning('Smart Mirror config file not found (not encrypted?)');
            }
        } catch (err) {
            logError(`Failed to read configuration: ${err.message}`);
        }
        
        // Step 3: Check vacation data
        logStep('3', 'Checking vacation data configuration');
        
        try {
            const houseDataFile = path.join(CONFIG_DIR, 'house-data.json');
            
            if (fs.existsSync(houseDataFile)) {
                const houseData = JSON.parse(fs.readFileSync(houseDataFile, 'utf-8'));
                const vacationData = houseData.vacation;
                
                if (vacationData && vacationData.dates) {
                    log(`  Total vacations configured: ${vacationData.dates.length}`, 'reset');
                    
                    // Find upcoming vacations
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const upcomingVacations = vacationData.dates
                        .filter(v => new Date(v.startDate) >= today)
                        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
                    
                    log(`  Upcoming vacations: ${upcomingVacations.length}`, 'reset');
                    
                    if (upcomingVacations.length > 0) {
                        upcomingVacations.slice(0, 3).forEach((v, i) => {
                            log(`    ${i + 1}. ${v.destination} (${v.startDate} to ${v.endDate})`, 'cyan');
                        });
                    } else {
                        logWarning('  No upcoming vacations found');
                        log('    Add vacation dates in Admin > House > Vacation', 'yellow');
                    }
                } else {
                    logWarning('No vacation data found in house configuration');
                }
            } else {
                logWarning('House data file not found');
            }
        } catch (err) {
            logError(`Failed to read vacation data: ${err.message}`);
        }
        
        // Summary
        log('\n' + '='.repeat(60), 'blue');
        log('SUMMARY', 'blue');
        log('='.repeat(60), 'blue');
        log('\nFor weather to display in the vacation sub-widget:', 'cyan');
        log('1. Smart Widget must be enabled', 'reset');
        log('2. Vacation sub-widget must be enabled', 'reset');
        log('3. Weather API key must be configured (Smart Widget, weather, or forecast widget)', 'reset');
        log('4. Vacation dates must exist with valid destinations', 'reset');
        log('5. Destinations must return valid weather data from OpenWeatherMap', 'reset');
        log('\nTest location validation in Admin > House > Vacation using "Test Location" button', 'yellow');
        log('\n');
        
    } catch (err) {
        logError(`\nTest failed with error: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    }
}

// Run the test
testVacationWeatherDisplay().catch(err => {
    logError(`\nUnexpected error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
});
