#!/usr/bin/env node

/**
 * Test script for Party Sub-Widget Menu Format Enhancement
 * Verifies menu assignments, descriptions, and two-column layout implementation
 */

const fs = require('fs');
const path = require('path');

console.log('🎉 Party Sub-Widget Menu Format Test\n');
console.log('='.repeat(60));

// Test 1: Check smart-mirror.html has two-column layout
console.log('\n✓ Test 1: Checking two-column layout implementation...');
const smartMirrorPath = path.join(__dirname, '..', 'public', 'smart-mirror.html');
const smartMirrorContent = fs.readFileSync(smartMirrorPath, 'utf8');

if (smartMirrorContent.includes('gridTemplateColumns')) {
    console.log('  ✅ Found CSS grid layout');
} else {
    console.log('  ❌ CSS grid layout not found');
    process.exit(1);
}

if (smartMirrorContent.includes('repeat(auto-fit, minmax(250px, 1fr))')) {
    console.log('  ✅ Found responsive two-column grid configuration');
} else {
    console.log('  ❌ Responsive grid configuration not found');
    process.exit(1);
}

// Test 2: Check menu assignee display in before party phase
console.log('\n✓ Test 2: Checking menu assignee display for before party phase...');

if (smartMirrorContent.includes('!isDuringParty && item.assignee')) {
    console.log('  ✅ Found conditional assignee display for before party');
} else {
    console.log('  ❌ Conditional assignee display not found');
    process.exit(1);
}

if (smartMirrorContent.includes('👤')) {
    console.log('  ✅ Found assignee icon');
} else {
    console.log('  ❌ Assignee icon not found');
    process.exit(1);
}

// Test 3: Check menu description display in during party phase
console.log('\n✓ Test 3: Checking menu description display for during party phase...');

if (smartMirrorContent.includes('isDuringParty && item.description')) {
    console.log('  ✅ Found conditional description display for during party');
} else {
    console.log('  ❌ Conditional description display not found');
    process.exit(1);
}

// Test 4: Check menu header changes based on phase
console.log('\n✓ Test 4: Checking dynamic menu header based on phase...');

if (smartMirrorContent.includes("isDuringParty ? '🍽️ Menu' : '🍽️ Menu & Assignments'")) {
    console.log('  ✅ Found phase-based menu header');
} else {
    console.log('  ❌ Phase-based menu header not found');
    process.exit(1);
}

// Test 5: Check backward compatibility with both 'item' and 'name' properties
console.log('\n✓ Test 5: Checking backward compatibility for menu item names...');

if (smartMirrorContent.includes('item.item || item.name')) {
    console.log('  ✅ Found backward compatibility for item naming');
} else {
    console.log('  ❌ Backward compatibility check not found');
    process.exit(1);
}

// Test 6: Verify admin dashboard menu structure
console.log('\n✓ Test 6: Checking admin dashboard menu data structure...');
const dashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

if (dashboardContent.includes('menuItem') && dashboardContent.includes('menuDescription') && dashboardContent.includes('menuAssignee')) {
    console.log('  ✅ Found all menu input fields (item, description, assignee)');
} else {
    console.log('  ❌ Not all menu input fields found');
    process.exit(1);
}

if (dashboardContent.includes('addMenuItem()')) {
    console.log('  ✅ Found menu item addition function');
} else {
    console.log('  ❌ Menu item addition function not found');
    process.exit(1);
}

// Test 7: Verify server.js sends menu data
console.log('\n✓ Test 7: Checking server.js menu data handling...');
const serverPath = path.join(__dirname, '..', 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

if (serverContent.includes('menu: nextParty.menu')) {
    console.log('  ✅ Found menu data in party sub-widget response');
} else {
    console.log('  ❌ Menu data not found in party sub-widget response');
    process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('\n✅ All menu format enhancement tests passed!\n');
console.log('Features verified:');
console.log('✓ Two-column responsive layout');
console.log('✓ Menu assignments shown in "before party" phase');
console.log('✓ Menu descriptions shown in "during party" phase');
console.log('✓ Phase-based menu header');
console.log('✓ Backward compatibility');
console.log('\nTo test visually:');
console.log('1. Start server: npm start');
console.log('2. Go to admin: http://localhost:3000/admin');
console.log('3. Add party with menu items (with descriptions and assignees)');
console.log('4. View smart mirror before party start time (see assignments)');
console.log('5. View smart mirror during party (see descriptions)');
console.log('');
