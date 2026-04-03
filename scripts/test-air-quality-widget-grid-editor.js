#!/usr/bin/env node

/**
 * Test script to verify air quality widget appears in Grid Layout Editor
 * 
 * This test verifies:
 * 1. WIDGET_ICONS includes air quality widget icon
 * 2. Admin dashboard has all required form fields for air quality widget
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
  log('\n=== Testing Air Quality Widget Grid Editor Integration ===\n', 'cyan');
  
  const adminDashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
  const adminDashboard = fs.readFileSync(adminDashboardPath, 'utf8');
  
  let passCount = 0;
  let totalTests = 0;
  
  // Test 1: Check WIDGET_ICONS includes airQuality
  totalTests++;
  if (test('WIDGET_ICONS object includes air quality widget', () => {
    const widgetIconsMatch = adminDashboard.match(/const WIDGET_ICONS\s*=\s*{([^}]+)}/s);
    if (!widgetIconsMatch) return false;
    const iconsContent = widgetIconsMatch[1];
    return iconsContent.includes('airQuality:') && iconsContent.includes('🌬️');
  })) passCount++;

  // Test 2: Check WIDGET_NAMES includes airQuality
  totalTests++;
  if (test('WIDGET_NAMES object includes air quality widget display name', () => {
    const widgetNamesMatch = adminDashboard.match(/const WIDGET_NAMES\s*=\s*{([^}]+)}/s);
    if (!widgetNamesMatch) return false;
    const namesContent = widgetNamesMatch[1];
    return namesContent.includes('airQuality:') && namesContent.includes('Air Quality');
  })) passCount++;
  
  // Test 3: Check for air quality widget form fields
  totalTests++;
  if (test('airQualityEnabled form field exists', () => {
    return adminDashboard.includes('id="airQualityEnabled"');
  })) passCount++;
  
  totalTests++;
  if (test('airQualityGridX form field exists', () => {
    return adminDashboard.includes('id="airQualityGridX"');
  })) passCount++;
  
  totalTests++;
  if (test('airQualityGridY form field exists', () => {
    return adminDashboard.includes('id="airQualityGridY"');
  })) passCount++;
  
  totalTests++;
  if (test('airQualityGridWidth form field exists', () => {
    return adminDashboard.includes('id="airQualityGridWidth"');
  })) passCount++;
  
  totalTests++;
  if (test('airQualityGridHeight form field exists', () => {
    return adminDashboard.includes('id="airQualityGridHeight"');
  })) passCount++;
  
  // Test 4: Check grid editor uses dynamic widget discovery
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
  
  // Test 5: Check loadGridWidgets function structure
  totalTests++;
  if (test('loadGridWidgets function processes all WIDGET_ICONS', () => {
    const iteratesOverIcons = adminDashboard.includes('Object.keys(WIDGET_ICONS)') &&
                              adminDashboard.includes('function loadGridWidgets()');
    const checksEnabledField = adminDashboard.includes('Enabled`)?.value');
    return iteratesOverIcons && checksEnabledField;
  })) passCount++;
  
  // Test 6: Verify air quality widget is in Smart Mirror module
  totalTests++;
  if (test('Smart Mirror module includes air quality widget definition', () => {
    const smartMirrorPath = path.join(__dirname, '..', 'modules', 'smartmirror.js');
    const smartMirror = fs.readFileSync(smartMirrorPath, 'utf8');
    return smartMirror.includes('airQuality: {');
  })) passCount++;
  
  // Test 7: Check Smart Mirror default layouts include air quality
  totalTests++;
  if (test('Smart Mirror default layouts include air quality widget positioning', () => {
    const smartMirrorPath = path.join(__dirname, '..', 'modules', 'smartmirror.js');
    const smartMirror = fs.readFileSync(smartMirrorPath, 'utf8');
    return smartMirror.includes('airQuality: { x:');
  })) passCount++;
  
  // Summary
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`Tests Passed: ${passCount}/${totalTests}`, passCount === totalTests ? 'green' : 'red');
  log('='.repeat(60), 'cyan');
  
  if (passCount === totalTests) {
    log('\n✅ All tests passed! Air quality widget is properly integrated into grid editor.', 'green');
    log('The grid editor will now automatically discover and display the air quality widget.', 'green');
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
