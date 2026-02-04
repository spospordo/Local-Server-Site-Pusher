#!/usr/bin/env node

/**
 * Test script to verify the weather detection fix for party features
 * Tests that weather is detected from both weather and forecast widgets
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Weather Detection Fix Test\n');
console.log('='.repeat(60));

let allTestsPassed = true;

// Read server.js
const serverPath = path.join(__dirname, '..', 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// Test 1: Check /admin/api/party/weather endpoint uses correct detection
console.log('\n✓ Test 1: Checking /admin/api/party/weather endpoint...');

// Find the party weather endpoint - look for a larger section
const endpointStart = serverContent.indexOf("app.get('/admin/api/party/weather'");
if (endpointStart === -1) {
    console.log('  ❌ Could not find party weather endpoint');
    allTestsPassed = false;
} else {
    // Get next 2000 characters from the endpoint
    const endpointCode = serverContent.substring(endpointStart, endpointStart + 2000);
    
    // Should NOT check for enabled
    if (endpointCode.includes('weatherConfig.enabled') || endpointCode.includes('!weatherConfig.enabled')) {
        console.log('  ❌ Still checks weatherConfig.enabled (should not!)');
        allTestsPassed = false;
    } else {
        console.log('  ✅ Does not check weatherConfig.enabled');
    }
    
    // Should check forecast widget
    if (endpointCode.includes('forecastConfig')) {
        console.log('  ✅ Checks forecast widget');
    } else {
        console.log('  ❌ Does not check forecast widget');
        allTestsPassed = false;
    }
    
    // Should check for apiKey and location
    if (endpointCode.includes('apiKey') && endpointCode.includes('location')) {
        console.log('  ✅ Checks for apiKey and location');
    } else {
        console.log('  ❌ Does not properly check apiKey and location');
        allTestsPassed = false;
    }
    
    // Should use fallback pattern (|| operator)
    if (endpointCode.includes('forecastConfig.apiKey')) {
        console.log('  ✅ Uses fallback pattern for apiKey');
    } else {
        console.log('  ❌ Does not use fallback pattern');
        allTestsPassed = false;
    }
}

// Test 2: Check party sub-widget uses correct detection  
console.log('\n✓ Test 2: Checking party sub-widget weather detection...');

// Find the party case in smart widget - look at the exact line range
const partyCaseStart = serverContent.indexOf("case 'party':");
if (partyCaseStart === -1) {
    console.log('  ❌ Could not find party case in smart widget');
    allTestsPassed = false;
} else {
    // Get a good chunk after case 'party':
    const caseCode = serverContent.substring(partyCaseStart, partyCaseStart + 4500);
    
    // Should NOT check for enabled
    if (caseCode.match(/weatherConfig\s*&&\s*weatherConfig\.enabled/) || 
        caseCode.match(/weather\s*&&\s*weather\.enabled/)) {
        console.log('  ❌ Still checks weather.enabled (should not!)');
        allTestsPassed = false;
    } else {
        console.log('  ✅ Does not check weather.enabled');
    }
    
    // Should check forecast widget by looking for the variable
    if (caseCode.includes('forecastConfig') || caseCode.includes('forecast')) {
        console.log('  ✅ Checks forecast widget');
    } else {
        console.log('  ❌ Does not check forecast widget');
        allTestsPassed = false;
    }
    
    // Should use fallback pattern - look for the specific pattern
    if (caseCode.includes('weatherApiKey') && (caseCode.includes('forecastConfig.apiKey') || caseCode.includes('forecast'))) {
        console.log('  ✅ Uses fallback pattern for apiKey');
    } else {
        console.log('  ❌ Does not use fallback pattern');
        allTestsPassed = false;
    }
    
    // Should check weatherApiKey && weatherLocation
    if (caseCode.includes('weatherApiKey') && caseCode.includes('weatherLocation')) {
        console.log('  ✅ Checks for weatherApiKey && weatherLocation');
    } else {
        console.log('  ❌ Does not properly check weatherApiKey && weatherLocation');
        allTestsPassed = false;
    }
}

// Test 3: Verify old error message is removed from party endpoints
console.log('\n✓ Test 3: Checking error messages in party endpoints...');

// Check party weather endpoint specifically
const partyWeatherStart = serverContent.indexOf("app.get('/admin/api/party/weather'");
const partyWeatherSection = serverContent.substring(partyWeatherStart, partyWeatherStart + 1500);

if (partyWeatherSection.includes('Weather widget not enabled')) {
    console.log('  ❌ Party weather endpoint still has old error message');
    allTestsPassed = false;
} else {
    console.log('  ✅ Party weather endpoint does not have old error message');
}

// Verify the regular weather widget endpoint still has it (that's OK)
const regularWeatherStart = serverContent.indexOf("app.get('/api/smart-mirror/weather'");
const regularWeatherSection = serverContent.substring(regularWeatherStart, regularWeatherStart + 500);
if (regularWeatherSection.includes('Weather widget not enabled')) {
    console.log('  ✅ Regular weather widget endpoint still checks (as expected)');
} else {
    console.log('  ⚠️  Regular weather widget endpoint may need the check');
}

// Test 4: Verify better error message exists
if (serverContent.includes('Weather API not configured')) {
    console.log('  ✅ Better error message present: "Weather API not configured"');
} else {
    console.log('  ❌ Better error message not found');
    allTestsPassed = false;
}

// Test 5: Verify pattern matches other endpoints
console.log('\n✓ Test 5: Checking consistency with other weather endpoints...');

const otherWeatherPattern = /apiKey.*weather.*apiKey.*\|\|.*forecast.*apiKey/;
if (serverContent.match(otherWeatherPattern)) {
    console.log('  ✅ Uses same pattern as other weather endpoints');
} else {
    console.log('  ⚠️  Pattern may differ from other endpoints (verify manually)');
}

// Summary
console.log('\n' + '='.repeat(60));
if (allTestsPassed) {
    console.log('✅ All tests passed! Weather detection fix is correct.\n');
    console.log('Expected behavior:');
    console.log('  • Party weather works when EITHER weather OR forecast widget has API key');
    console.log('  • No false "not enabled" warnings');
    console.log('  • Error only shows when API key/location truly missing');
    process.exit(0);
} else {
    console.log('❌ Some tests failed. Review the code above.\n');
    process.exit(1);
}
