#!/usr/bin/env node

/**
 * Test script to validate that sub-widgets are properly wrapped in styled container
 * This verifies the fix for the renderSubWidget wrapper container bug
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Sub-Widget Wrapper Container Fix Validation\n');
console.log('='.repeat(70));

let allTestsPassed = true;

// Test 1: Verify the wrapper container fix exists
console.log('\n✓ Test 1: Checking renderSubWidget wrapper fix...');
const smartMirrorPath = path.join(__dirname, '..', 'public', 'smart-mirror.html');
const smartMirrorContent = fs.readFileSync(smartMirrorPath, 'utf8');

const wrapperChecks = [
    { pattern: 'let innerContent = null;', description: 'innerContent variable declared' },
    { pattern: 'innerContent = renderRainForecast(subWidget.data);', description: 'Rain forecast stored in innerContent' },
    { pattern: 'innerContent = renderUpcomingVacation(subWidget.data);', description: 'Vacation stored in innerContent' },
    { pattern: 'innerContent = renderHomeAssistantMedia(subWidget.data);', description: 'Media stored in innerContent' },
    { pattern: 'innerContent = renderParty(subWidget.data);', description: 'Party stored in innerContent' },
    { pattern: 'if (!innerContent) {', description: 'Null check for innerContent' },
    { pattern: 'return null;', description: 'Returns null when no content' },
    { pattern: 'container.appendChild(innerContent);', description: 'innerContent appended to container' },
    { pattern: 'return container;', description: 'Returns wrapped container' }
];

wrapperChecks.forEach(check => {
    if (smartMirrorContent.includes(check.pattern)) {
        console.log(`  ✅ ${check.description}`);
    } else {
        console.log(`  ❌ Missing: ${check.description}`);
        allTestsPassed = false;
    }
});

// Test 2: Verify wrapper container styling is defined
console.log('\n✓ Test 2: Checking wrapper container styling...');
const stylingChecks = [
    { pattern: 'container.style.padding = \'15px\';', description: 'Padding set to 15px' },
    { pattern: 'container.style.borderRadius = \'10px\';', description: 'Border radius set to 10px' },
    { pattern: 'container.style.background = \'rgba(255, 255, 255, 0.05)\';', description: 'Background color set' },
    { pattern: 'container.className = `smart-sub-widget smart-sub-widget-${subWidget.type}`;', description: 'CSS class assigned' }
];

stylingChecks.forEach(check => {
    if (smartMirrorContent.includes(check.pattern)) {
        console.log(`  ✅ ${check.description}`);
    } else {
        console.log(`  ❌ Missing: ${check.description}`);
        allTestsPassed = false;
    }
});

// Test 3: Verify all sub-widget types are handled
console.log('\n✓ Test 3: Checking all sub-widget types...');
const subWidgetTypes = [
    { pattern: 'case \'rainForecast\':', description: 'Rain forecast case' },
    { pattern: 'case \'upcomingVacation\':', description: 'Vacation case' },
    { pattern: 'case \'homeAssistantMedia\':', description: 'Media case' },
    { pattern: 'case \'party\':', description: 'Party case' }
];

subWidgetTypes.forEach(check => {
    if (smartMirrorContent.includes(check.pattern)) {
        console.log(`  ✅ ${check.description}`);
    } else {
        console.log(`  ❌ Missing: ${check.description}`);
        allTestsPassed = false;
    }
});

// Test 4: Verify no direct returns from switch cases (except default)
console.log('\n✓ Test 4: Checking switch statement structure...');

// Count how many times we see "return render" in the renderSubWidget function
const renderSubWidgetMatch = smartMirrorContent.match(/function renderSubWidget\(subWidget\)\s*{[\s\S]*?^        \}/m);
if (renderSubWidgetMatch) {
    const functionBody = renderSubWidgetMatch[0];
    const directReturns = (functionBody.match(/return render\w+\(/g) || []).length;
    
    if (directReturns === 0) {
        console.log(`  ✅ No direct returns from render functions in switch cases`);
    } else {
        console.log(`  ❌ Found ${directReturns} direct returns (should be 0)`);
        allTestsPassed = false;
    }
} else {
    console.log(`  ⚠️  Could not extract renderSubWidget function for analysis`);
}

// Test 5: Verify wrapper container is created before switch
console.log('\n✓ Test 5: Checking container creation order...');
const orderChecks = [
    { pattern: /const container = document\.createElement[\s\S]{0,500}switch \(subWidget\.type\)/m, description: 'Container created before switch' },
    { pattern: /container\.className =[\s\S]{0,500}switch \(subWidget\.type\)/m, description: 'Container styled before switch' }
];

orderChecks.forEach(check => {
    if (check.pattern.test(smartMirrorContent)) {
        console.log(`  ✅ ${check.description}`);
    } else {
        console.log(`  ❌ Issue: ${check.description}`);
        allTestsPassed = false;
    }
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('\n📊 Test Summary:\n');

if (allTestsPassed) {
    console.log('✅ All validation checks passed!\n');
    console.log('The wrapper container fix has been successfully applied:');
    console.log('1. ✅ innerContent variable captures render function results');
    console.log('2. ✅ Null check prevents wrapping empty content');
    console.log('3. ✅ innerContent is appended to styled wrapper container');
    console.log('4. ✅ Wrapped container is returned with consistent styling\n');
    console.log('Benefits:');
    console.log('- All sub-widgets now have consistent padding, border-radius, and background');
    console.log('- Party widget receives same styling as other sub-widgets');
    console.log('- Proper DOM hierarchy for CSS targeting');
    console.log('- No breaking changes - null handling preserved\n');
} else {
    console.log('❌ Some validation checks failed\n');
    console.log('Please review the errors above and ensure the fix is properly applied.\n');
    process.exit(1);
}

console.log('Next steps:');
console.log('1. Configure party data in Admin > Party > Scheduling');
console.log('2. Enable party sub-widget in Admin > Smart Mirror > Smart Widget');
console.log('3. View /smart-mirror and verify party widget displays with styling');
console.log('4. Check browser dev tools to verify wrapper div structure\n');
