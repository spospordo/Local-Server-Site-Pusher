#!/usr/bin/env node

/**
 * Test script for Party Sub-Widget
 * Verifies that the party sub-widget is properly integrated into the smart mirror system
 */

const fs = require('fs');
const path = require('path');

console.log('🎉 Party Sub-Widget Test Script\n');
console.log('=' .repeat(60));

// Test 1: Check server.js has party case
console.log('\n✓ Test 1: Checking server.js for party sub-widget code...');
const serverPath = path.join(__dirname, '..', 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

if (serverContent.includes("case 'party':")) {
    console.log('  ✅ Found party case in smart widget endpoint');
} else {
    console.log('  ❌ Party case not found in server.js');
    process.exit(1);
}

if (serverContent.includes('partyScheduling')) {
    console.log('  ✅ Found partyScheduling data access');
} else {
    console.log('  ❌ partyScheduling data access not found');
    process.exit(1);
}

// Test 2: Check smart-mirror.html has renderParty function
console.log('\n✓ Test 2: Checking smart-mirror.html for renderParty function...');
const smartMirrorPath = path.join(__dirname, '..', 'public', 'smart-mirror.html');
const smartMirrorContent = fs.readFileSync(smartMirrorPath, 'utf8');

if (smartMirrorContent.includes('function renderParty(data)')) {
    console.log('  ✅ Found renderParty function');
} else {
    console.log('  ❌ renderParty function not found');
    process.exit(1);
}

if (smartMirrorContent.includes("case 'party':")) {
    console.log('  ✅ Found party case in renderSubWidget switch');
} else {
    console.log('  ❌ Party case not found in renderSubWidget');
    process.exit(1);
}

// Test 3: Check admin dashboard has party widget configuration
console.log('\n✓ Test 3: Checking admin dashboard for party widget config...');
const dashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

if (dashboardContent.includes('smartWidgetPartyEnabled')) {
    console.log('  ✅ Found party widget enabled setting');
} else {
    console.log('  ❌ Party widget enabled setting not found');
    process.exit(1);
}

if (dashboardContent.includes('smartWidgetPartyPriority')) {
    console.log('  ✅ Found party widget priority setting');
} else {
    console.log('  ❌ Party widget priority setting not found');
    process.exit(1);
}

if (dashboardContent.includes("type: 'party'")) {
    console.log('  ✅ Found party type in subWidgets configuration');
} else {
    console.log('  ❌ Party type not found in subWidgets');
    process.exit(1);
}

// Test 4: Verify renderParty renders expected elements
console.log('\n✓ Test 4: Checking renderParty implementation...');
const expectedElements = [
    'party-widget',
    'daysUntil',
    'tasks',
    'invitees',
    'menu',
    'events'
];

let allFound = true;
expectedElements.forEach(element => {
    if (smartMirrorContent.includes(element)) {
        console.log(`  ✅ Found ${element} reference`);
    } else {
        console.log(`  ❌ Missing ${element} reference`);
        allFound = false;
    }
});

if (!allFound) {
    process.exit(1);
}

// Test 5: Check party scheduling API endpoints exist
console.log('\n✓ Test 5: Checking party scheduling API endpoints...');
if (serverContent.includes('/admin/api/party/scheduling')) {
    console.log('  ✅ Found party scheduling endpoints');
} else {
    console.log('  ❌ Party scheduling endpoints not found');
    process.exit(1);
}

console.log('\n' + '=' .repeat(60));
console.log('\n🎉 All tests passed! Party sub-widget is properly integrated.\n');
console.log('Next steps:');
console.log('1. Start the server: npm start');
console.log('2. Access admin dashboard: http://localhost:3000/admin');
console.log('3. Configure party data in Party > Scheduling tab');
console.log('4. Enable party sub-widget in Smart Mirror > Smart Widget settings');
console.log('5. View smart mirror: http://localhost:3000/smart-mirror');
console.log('');
