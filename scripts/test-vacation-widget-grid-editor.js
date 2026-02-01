#!/usr/bin/env node

/**
 * Test script to verify vacation widget appears in Grid Layout Editor
 * 
 * This test verifies:
 * 1. WIDGET_ICONS includes vacation widget icon
 * 2. Admin dashboard has all required form fields for vacation widget
 * 3. Grid editor code dynamically discovers widgets (not hardcoded)
 */

const fs = require('fs');
const path = require('path');

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

function test(description, testFn) {
  try {
    const result = testFn();
    if (result) {
      log(`✅ PASS: ${description}`, 'green');
      return true;
    } else {
      log(`❌ FAIL: ${description}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ ERROR: ${description} - ${error.message}`, 'red');
    return false;
  }
}

async function runTests() {
  log('\n=== Testing Vacation Widget Grid Editor Integration ===\n', 'cyan');
  
  const adminDashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
  const adminDashboard = fs.readFileSync(adminDashboardPath, 'utf8');
  
  let passCount = 0;
  let totalTests = 0;
  
  // Test 1: Check WIDGET_ICONS includes vacation
  totalTests++;
  if (test('WIDGET_ICONS object includes vacation widget', () => {
    const widgetIconsMatch = adminDashboard.match(/const WIDGET_ICONS\s*=\s*{([^}]+)}/s);
    if (!widgetIconsMatch) return false;
    const iconsContent = widgetIconsMatch[1];
    return iconsContent.includes('vacation:') && (iconsContent.includes('🏖️') || iconsContent.includes('📍'));
  })) passCount++;
  
  // Test 2: Check for vacation widget form fields
  totalTests++;
  if (test('vacationEnabled form field exists', () => {
    return adminDashboard.includes('id="vacationEnabled"');
  })) passCount++;
  
  totalTests++;
  if (test('vacationGridX form field exists', () => {
    return adminDashboard.includes('id="vacationGridX"');
  })) passCount++;
  
  totalTests++;
  if (test('vacationGridY form field exists', () => {
    return adminDashboard.includes('id="vacationGridY"');
  })) passCount++;
  
  totalTests++;
  if (test('vacationGridWidth form field exists', () => {
    return adminDashboard.includes('id="vacationGridWidth"');
  })) passCount++;
  
  totalTests++;
  if (test('vacationGridHeight form field exists', () => {
    return adminDashboard.includes('id="vacationGridHeight"');
  })) passCount++;
  
  // Test 3: Check grid editor uses dynamic widget discovery
  totalTests++;
  if (test('Grid editor uses dynamic widget discovery (not hardcoded array)', () => {
    // Should NOT have the old hardcoded array
    const hasOldHardcodedArray = adminDashboard.includes("const widgetTypes = ['clock', 'calendar', 'weather', 'forecast', 'news'];");
    if (hasOldHardcodedArray) {
      log('  Found old hardcoded widgetTypes array!', 'yellow');
      return false;
    }
    
    // Should have dynamic discovery code
    const hasDynamicDiscovery = adminDashboard.includes('Object.keys(WIDGET_ICONS)') ||
                                adminDashboard.includes('for (const widgetType of Object.keys(WIDGET_ICONS))');
    if (!hasDynamicDiscovery) {
      log('  Missing dynamic widget discovery code!', 'yellow');
      return false;
    }
    
    return true;
  })) passCount++;
  
  // Test 4: Check loadGridWidgets function structure
  totalTests++;
  if (test('loadGridWidgets function processes all WIDGET_ICONS', () => {
    // Should iterate over WIDGET_ICONS
    const iteratesOverIcons = adminDashboard.includes('Object.keys(WIDGET_ICONS)') &&
                              adminDashboard.includes('function loadGridWidgets()');
    
    // Should check for enabled field in the context of loadGridWidgets
    const hasLoadGridWidgets = adminDashboard.includes('function loadGridWidgets()');
    const checksEnabledField = adminDashboard.includes('Enabled`)?.value');
    
    return iteratesOverIcons && hasLoadGridWidgets && checksEnabledField;
  })) passCount++;
  
  // Test 5: Check documentation exists
  totalTests++;
  if (test('Grid editor has documentation comment about adding new widgets', () => {
    const hasDocumentation = adminDashboard.includes('To add a new widget to the grid editor') ||
                            adminDashboard.includes('automatically discover');
    return hasDocumentation;
  })) passCount++;
  
  // Test 6: Verify vacation widget is in Smart Mirror module
  totalTests++;
  if (test('Smart Mirror module includes vacation widget definition', () => {
    const smartMirrorPath = path.join(__dirname, '..', 'modules', 'smartmirror.js');
    const smartMirror = fs.readFileSync(smartMirrorPath, 'utf8');
    return smartMirror.includes('vacation: {');
  })) passCount++;
  
  // Test 7: Check Smart Mirror default layouts include vacation
  totalTests++;
  if (test('Smart Mirror default layouts include vacation widget positioning', () => {
    const smartMirrorPath = path.join(__dirname, '..', 'modules', 'smartmirror.js');
    const smartMirror = fs.readFileSync(smartMirrorPath, 'utf8');
    
    // Check portrait layout includes vacation
    const hasPortraitVacation = smartMirror.includes('getDefaultPortraitLayout') && 
                                smartMirror.includes('vacation: { x:');
    
    // Check landscape layout includes vacation
    const hasLandscapeVacation = smartMirror.includes('getDefaultLandscapeLayout') &&
                                 smartMirror.includes('vacation: { x:');
    
    return hasPortraitVacation && hasLandscapeVacation;
  })) passCount++;
  
  // Summary
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`Tests Passed: ${passCount}/${totalTests}`, passCount === totalTests ? 'green' : 'red');
  log('='.repeat(60), 'cyan');
  
  if (passCount === totalTests) {
    log('\n✅ All tests passed! Vacation widget is properly integrated into grid editor.', 'green');
    log('The grid editor will now automatically discover and display the vacation widget.', 'green');
    process.exit(0);
  } else {
    log(`\n❌ ${totalTests - passCount} test(s) failed.`, 'red');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Test execution failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
