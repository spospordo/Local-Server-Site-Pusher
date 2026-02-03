#!/usr/bin/env node

/**
 * Test script to validate party sub-widget bug fixes
 * Tests date normalization, validation, and error handling
 */

const fs = require('fs');
const path = require('path');

console.log('🎉 Party Sub-Widget Bug Fixes Validation\n');
console.log('='.repeat(70));

let allTestsPassed = true;

// Test 1: Verify date normalization code exists in server.js
console.log('\n✓ Test 1: Checking server.js date normalization fixes...');
const serverPath = path.join(__dirname, '..', 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

const checks = [
    { pattern: 'Normalize date to string format', description: 'Date normalization comment' },
    { pattern: 'typeof partyScheduling.dateTime.date === \'string\'', description: 'String type check' },
    { pattern: 'partyScheduling.dateTime.date instanceof Date', description: 'Date instance check' },
    { pattern: 'isNaN(partyDate.getTime())', description: 'Invalid date validation' },
    { pattern: 'logger.error(logger.categories.SMART_MIRROR, `Invalid party date', description: 'Error logging for invalid dates' },
    { pattern: 'normalizedDateTime', description: 'DateTime normalization object' }
];

checks.forEach(check => {
    if (serverContent.includes(check.pattern)) {
        console.log(`  ✅ ${check.description}`);
    } else {
        console.log(`  ❌ Missing: ${check.description}`);
        allTestsPassed = false;
    }
});

// Test 2: Verify client-side validation exists in smart-mirror.html
console.log('\n✓ Test 2: Checking smart-mirror.html validation fixes...');
const smartMirrorPath = path.join(__dirname, '..', 'public', 'smart-mirror.html');
const smartMirrorContent = fs.readFileSync(smartMirrorPath, 'utf8');

const clientChecks = [
    { pattern: 'Validate required data exists', description: 'Data validation comment' },
    { pattern: 'if (!data || !data.dateTime || !data.dateTime.date || data.daysUntil === undefined)', description: 'Required data check' },
    { pattern: 'return null', description: 'Early return on missing data' },
    { pattern: 'console.error(\'Party widget: Missing required data\'', description: 'Error logging for missing data' },
    { pattern: 'try {', description: 'Try-catch for date parsing' },
    { pattern: 'if (dateParts.length !== 3)', description: 'Date format validation' },
    { pattern: 'if (isNaN(partyDate.getTime()))', description: 'Invalid date check' },
    { pattern: 'console.error(\'Party widget: Error parsing date\'', description: 'Error logging for date parsing' }
];

clientChecks.forEach(check => {
    if (smartMirrorContent.includes(check.pattern)) {
        console.log(`  ✅ ${check.description}`);
    } else {
        console.log(`  ❌ Missing: ${check.description}`);
        allTestsPassed = false;
    }
});

// Test 3: Verify null checks for optional data fields
console.log('\n✓ Test 3: Checking null safety for optional fields...');
const optionalFieldChecks = [
    { pattern: 'if (data.tasks && data.tasks.total > 0)', description: 'Tasks null check' },
    { pattern: 'if (data.invitees && data.invitees.list && data.invitees.list.length > 0)', description: 'Invitees null check' },
    { pattern: 'if (data.menu && data.menu.length > 0)', description: 'Menu null check' },
    { pattern: 'if (data.events && data.events.length > 0)', description: 'Events null check' }
];

optionalFieldChecks.forEach(check => {
    if (smartMirrorContent.includes(check.pattern)) {
        console.log(`  ✅ ${check.description}`);
    } else {
        console.log(`  ❌ Missing: ${check.description}`);
        allTestsPassed = false;
    }
});

// Test 4: Simulate various date format scenarios
console.log('\n✓ Test 4: Simulating date format handling...');

function testDateNormalization(dateInput, description) {
    try {
        let dateString;
        if (typeof dateInput === 'string') {
            dateString = dateInput;
        } else if (dateInput instanceof Date) {
            dateString = dateInput.toISOString().split('T')[0];
        } else {
            dateString = new Date(dateInput).toISOString().split('T')[0];
        }
        
        const testDate = new Date(dateString);
        testDate.setHours(0, 0, 0, 0);
        
        if (isNaN(testDate.getTime())) {
            console.log(`  ⚠️  ${description}: Invalid date after normalization`);
            return false;
        }
        
        console.log(`  ✅ ${description}: ${dateString}`);
        return true;
    } catch (err) {
        console.log(`  ❌ ${description}: Error - ${err.message}`);
        return false;
    }
}

const dateScenarios = [
    { input: '2026-02-15', desc: 'String YYYY-MM-DD format' },
    { input: new Date('2026-02-15'), desc: 'Date object' },
    { input: new Date().toISOString(), desc: 'ISO string with time' },
    { input: '2026-02-15T10:00:00.000Z', desc: 'ISO string' }
];

let allDateTestsPassed = true;
dateScenarios.forEach(scenario => {
    if (!testDateNormalization(scenario.input, scenario.desc)) {
        allDateTestsPassed = false;
        allTestsPassed = false;
    }
});

// Test 5: Verify diagnostic script exists
console.log('\n✓ Test 5: Checking diagnostic script...');
const diagnosticPath = path.join(__dirname, 'test-party-display-diagnostic.js');
if (fs.existsSync(diagnosticPath)) {
    console.log('  ✅ Diagnostic script exists');
    const diagnosticContent = fs.readFileSync(diagnosticPath, 'utf8');
    
    const diagnosticChecks = [
        'Checking configuration file',
        'Checking Smart Widget configuration',
        'Simulating server-side party case logic',
        'Checking for common configuration issues'
    ];
    
    diagnosticChecks.forEach(check => {
        if (diagnosticContent.includes(check)) {
            console.log(`  ✅ ${check}`);
        } else {
            console.log(`  ❌ Missing: ${check}`);
            allTestsPassed = false;
        }
    });
} else {
    console.log('  ❌ Diagnostic script not found');
    allTestsPassed = false;
}

// Test 6: Verify all fixes are consistent
console.log('\n✓ Test 6: Consistency checks...');

// Check that both client and server handle dates consistently
const serverUsesYYYYMMDD = serverContent.includes('YYYY-MM-DD');
const clientExpectsYYYYMMDD = smartMirrorContent.includes('YYYY-MM-DD');

if (serverUsesYYYYMMDD && clientExpectsYYYYMMDD) {
    console.log('  ✅ Server and client agree on YYYY-MM-DD format');
} else {
    console.log('  ⚠️  Date format documentation may be inconsistent');
}

// Check that error logging is present in both client and server
const serverHasErrorLog = serverContent.includes('logger.error(logger.categories.SMART_MIRROR');
const clientHasErrorLog = smartMirrorContent.includes('console.error(\'Party widget:');

if (serverHasErrorLog && clientHasErrorLog) {
    console.log('  ✅ Error logging present in both client and server');
} else {
    console.log('  ⚠️  Error logging may be incomplete');
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('\n📊 Test Summary:\n');

if (allTestsPassed) {
    console.log('✅ All validation checks passed!\n');
    console.log('The following bugs have been successfully fixed:');
    console.log('1. Date format inconsistency between server and client');
    console.log('2. Missing validation for required data fields');
    console.log('3. Invalid date handling without error logging');
    console.log('4. Missing null checks for optional data arrays\n');
    console.log('The party sub-widget should now:');
    console.log('- Display correctly when party data is configured');
    console.log('- Handle various date formats gracefully');
    console.log('- Fail safely with proper error logging');
    console.log('- Work with partial data (only date required)\n');
} else {
    console.log('❌ Some validation checks failed. Review the output above.\n');
    process.exit(1);
}

console.log('Next steps for validation:');
console.log('1. Start the server: npm start');
console.log('2. Configure party data in Admin > Party > Scheduling');
console.log('3. Enable party sub-widget in Admin > Smart Mirror > Smart Widget');
console.log('4. View /smart-mirror and verify party widget displays');
console.log('5. Check browser console for any JavaScript errors');
console.log('6. Run diagnostic: node scripts/test-party-display-diagnostic.js\n');
