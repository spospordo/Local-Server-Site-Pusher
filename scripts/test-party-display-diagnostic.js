#!/usr/bin/env node

/**
 * Diagnostic Test Script for Party Sub-Widget Display Issue
 * Tests the full data flow from config to API to rendering
 */

const fs = require('fs');
const path = require('path');

console.log('🎉 Party Sub-Widget Display Diagnostic\n');
console.log('='.repeat(70));

// Test 1: Check if config file exists and has party scheduling data
console.log('\n✓ Test 1: Checking configuration file...');
const configPath = path.join(__dirname, '..', 'config', 'config.json');
let config = {};

try {
    if (fs.existsSync(configPath)) {
        console.log('  ✅ Config file exists');
        const configContent = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configContent);
        
        // Check for party scheduling data
        if (config.partyScheduling) {
            console.log('  ✅ partyScheduling exists in config');
            console.log(`     Party data:`, JSON.stringify(config.partyScheduling, null, 2));
            
            if (config.partyScheduling.dateTime && config.partyScheduling.dateTime.date) {
                console.log(`  ✅ Party date is set: ${config.partyScheduling.dateTime.date}`);
                
                // Check if date is in the future
                const partyDate = new Date(config.partyScheduling.dateTime.date);
                partyDate.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                if (partyDate >= today) {
                    const daysUntil = Math.ceil((partyDate - today) / (1000 * 60 * 60 * 24));
                    console.log(`  ✅ Party date is today or in the future (${daysUntil} days from now)`);
                } else {
                    console.log(`  ⚠️  Party date is in the past - widget will NOT display`);
                }
            } else {
                console.log('  ⚠️  Party date is not set');
            }
            
            // Check optional data
            console.log(`     Tasks: ${config.partyScheduling.tasks ? config.partyScheduling.tasks.length : 0}`);
            console.log(`     Invitees: ${config.partyScheduling.invitees ? config.partyScheduling.invitees.length : 0}`);
            console.log(`     Menu items: ${config.partyScheduling.menu ? config.partyScheduling.menu.length : 0}`);
            console.log(`     Events: ${config.partyScheduling.events ? config.partyScheduling.events.length : 0}`);
        } else {
            console.log('  ⚠️  partyScheduling does not exist in config');
        }
    } else {
        console.log('  ⚠️  Config file does not exist yet');
    }
} catch (err) {
    console.log(`  ❌ Error reading config: ${err.message}`);
}

// Test 2: Check smart widget configuration
console.log('\n✓ Test 2: Checking Smart Widget configuration...');
try {
    if (config.widgets && config.widgets.smartWidget) {
        const smartWidget = config.widgets.smartWidget;
        console.log(`  Smart Widget enabled: ${smartWidget.enabled}`);
        console.log(`  Display mode: ${smartWidget.displayMode || 'cycle'}`);
        
        if (smartWidget.subWidgets) {
            console.log(`  ✅ subWidgets array exists with ${smartWidget.subWidgets.length} sub-widgets`);
            
            const partySubWidget = smartWidget.subWidgets.find(sw => sw.type === 'party');
            if (partySubWidget) {
                console.log(`  ✅ Party sub-widget found in configuration`);
                console.log(`     Enabled: ${partySubWidget.enabled}`);
                console.log(`     Priority: ${partySubWidget.priority}`);
                
                if (!partySubWidget.enabled) {
                    console.log(`  ⚠️  Party sub-widget is DISABLED - will NOT display`);
                }
            } else {
                console.log('  ❌ Party sub-widget NOT found in subWidgets array');
                console.log('     Available sub-widgets:', smartWidget.subWidgets.map(sw => sw.type).join(', '));
            }
        } else {
            console.log('  ⚠️  subWidgets array does not exist in smartWidget config');
        }
    } else {
        console.log('  ⚠️  Smart Widget configuration does not exist');
    }
} catch (err) {
    console.log(`  ❌ Error checking smart widget config: ${err.message}`);
}

// Test 3: Simulate the server-side logic
console.log('\n✓ Test 3: Simulating server-side party case logic...');
try {
    const partyScheduling = config.partyScheduling;
    if (partyScheduling && partyScheduling.dateTime && partyScheduling.dateTime.date) {
        const partyDate = new Date(partyScheduling.dateTime.date);
        partyDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        console.log(`  Party date: ${partyDate.toISOString().split('T')[0]}`);
        console.log(`  Today: ${today.toISOString().split('T')[0]}`);
        console.log(`  Comparison (partyDate >= today): ${partyDate >= today}`);
        
        if (partyDate >= today) {
            const daysUntil = Math.ceil((partyDate - today) / (1000 * 60 * 60 * 24));
            
            const totalTasks = partyScheduling.tasks ? partyScheduling.tasks.length : 0;
            const completedTasks = partyScheduling.tasks ? partyScheduling.tasks.filter(t => t.completed).length : 0;
            
            const invitees = partyScheduling.invitees || [];
            const comingCount = invitees.filter(i => i.rsvp === 'coming').length;
            const notComingCount = invitees.filter(i => i.rsvp === 'not-coming').length;
            const pendingCount = invitees.filter(i => i.rsvp === 'pending').length;
            
            console.log('  ✅ Would generate sub-widget data:');
            console.log(`     type: 'party'`);
            console.log(`     hasContent: true`);
            console.log(`     daysUntil: ${daysUntil}`);
            console.log(`     tasks: ${completedTasks}/${totalTasks} complete`);
            console.log(`     invitees: ${comingCount} coming, ${pendingCount} pending, ${notComingCount} not coming`);
            console.log(`     menu items: ${partyScheduling.menu ? partyScheduling.menu.length : 0}`);
            console.log(`     events: ${partyScheduling.events ? partyScheduling.events.length : 0}`);
        } else {
            console.log('  ⚠️  Party date is in the past - no data would be generated');
        }
    } else {
        console.log('  ⚠️  Party scheduling or date not configured - no data would be generated');
    }
} catch (err) {
    console.log(`  ❌ Error simulating server logic: ${err.message}`);
}

// Test 4: Check for common configuration issues
console.log('\n✓ Test 4: Checking for common configuration issues...');
let issuesFound = false;

if (!config.widgets || !config.widgets.smartWidget) {
    console.log('  ❌ ISSUE: Smart Widget not configured');
    console.log('     → Go to Admin > Smart Mirror > Smart Widget and configure it');
    issuesFound = true;
}

if (config.widgets && config.widgets.smartWidget && !config.widgets.smartWidget.enabled) {
    console.log('  ❌ ISSUE: Smart Widget is disabled');
    console.log('     → Go to Admin > Smart Mirror > Smart Widget and set Enabled to "Yes"');
    issuesFound = true;
}

const smartWidget = config.widgets && config.widgets.smartWidget;
if (smartWidget && smartWidget.subWidgets) {
    const partySubWidget = smartWidget.subWidgets.find(sw => sw.type === 'party');
    if (!partySubWidget) {
        console.log('  ❌ ISSUE: Party sub-widget not in configuration');
        console.log('     → This is a configuration corruption issue');
        issuesFound = true;
    } else if (!partySubWidget.enabled) {
        console.log('  ❌ ISSUE: Party sub-widget is disabled');
        console.log('     → Go to Admin > Smart Mirror > Smart Widget > Party Sub-Widget and set Enabled to "Yes"');
        issuesFound = true;
    }
}

if (!config.partyScheduling || !config.partyScheduling.dateTime || !config.partyScheduling.dateTime.date) {
    console.log('  ❌ ISSUE: No party date configured');
    console.log('     → Go to Admin > Party > Scheduling and set a party date');
    issuesFound = true;
}

if (config.partyScheduling && config.partyScheduling.dateTime && config.partyScheduling.dateTime.date) {
    const partyDate = new Date(config.partyScheduling.dateTime.date);
    partyDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (partyDate < today) {
        console.log('  ❌ ISSUE: Party date is in the past');
        console.log('     → Go to Admin > Party > Scheduling and update the party date to today or future');
        issuesFound = true;
    }
}

if (!issuesFound) {
    console.log('  ✅ No obvious configuration issues found');
}

console.log('\n' + '='.repeat(70));
console.log('\n📊 Diagnostic Summary:\n');

if (issuesFound) {
    console.log('⚠️  Configuration issues found - see above for resolution steps\n');
} else if (!config.partyScheduling || !config.partyScheduling.dateTime) {
    console.log('ℹ️  Party widget appears to be configured correctly, but no party data exists yet.\n');
    console.log('Next steps:');
    console.log('1. Go to Admin Dashboard > Party > Scheduling tab');
    console.log('2. Set a party date (today or in the future)');
    console.log('3. Optionally add tasks, invitees, menu, and events');
    console.log('4. Save the configuration');
    console.log('5. View the smart mirror at /smart-mirror');
} else {
    console.log('✅ Everything appears to be configured correctly!\n');
    console.log('If the party widget still does not appear:');
    console.log('1. Check browser console for JavaScript errors');
    console.log('2. Verify the /api/smart-mirror/smart-widget endpoint returns party data');
    console.log('3. Try refreshing the smart mirror page');
    console.log('4. Check server logs for errors');
}

console.log('');
