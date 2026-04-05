#!/usr/bin/env node

/**
 * Test script to verify Smart Mirror widget sizing constraints
 * This script validates that the CSS changes enforce strict grid dimensions
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Smart Mirror Widget Sizing Constraints\n');

const htmlPath = path.join(__dirname, '..', 'public', 'smart-mirror.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let passed = 0;
let failed = 0;

function test(description, condition) {
  if (condition) {
    console.log(`✅ PASS: ${description}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${description}`);
    failed++;
  }
}

// Test 1: Widget container has overflow: hidden
test(
  'Widget container has overflow: hidden',
  html.includes('.widget {') && 
  html.match(/\.widget\s*\{[^}]*overflow:\s*hidden/s)
);

// Test 2: Widget container has min-height: 0
test(
  'Widget container has min-height: 0 for flex behavior',
  html.match(/\.widget\s*\{[^}]*min-height:\s*0/s)
);

// Test 3: Widget container has min-width: 0
test(
  'Widget container has min-width: 0 for flex behavior',
  html.match(/\.widget\s*\{[^}]*min-width:\s*0/s)
);

// Test 4: Widget-content has overflow: hidden
test(
  'Widget-content has overflow: hidden',
  html.match(/\.widget-content\s*\{[^}]*overflow:\s*hidden/s)
);

// Test 5: Widget-content has min-height: 0
test(
  'Widget-content has min-height: 0',
  html.match(/\.widget-content\s*\{[^}]*min-height:\s*0/s)
);

// Test 6: News items use flex: 1 with min-height: 0
test(
  'News items use flex: 1 for proper scrolling',
  html.match(/\.news-items\s*\{[^}]*flex:\s*1/s)
);

test(
  'News items have min-height: 0',
  html.match(/\.news-items\s*\{[^}]*min-height:\s*0/s)
);

// Test 7: Calendar events have min-height: 0 (not min-height: 100px)
test(
  'Calendar events use min-height: 0 (not 100px)',
  html.match(/\.calendar-events\s*\{[^}]*min-height:\s*0/s) &&
  !html.match(/\.calendar-events\s*\{[^}]*min-height:\s*100px/s)
);

// Test 8: Calendar container has min-height: 0
test(
  'Calendar container has min-height: 0',
  html.match(/\.calendar-container\s*\{[^}]*min-height:\s*0/s)
);

// Test 9: News titles have text truncation
test(
  'News titles have text truncation with -webkit-line-clamp',
  html.match(/\.news-title\s*\{[^}]*-webkit-line-clamp:\s*2/s)
);

// Test 10: Clock time has text overflow handling
test(
  'Clock time has overflow: hidden',
  html.match(/\.clock-time\s*\{[^}]*overflow:\s*hidden/s)
);

test(
  'Clock time has text-overflow: ellipsis',
  html.match(/\.clock-time\s*\{[^}]*text-overflow:\s*ellipsis/s)
);

// Test 11: Weather text has overflow handling
test(
  'Weather condition has text truncation',
  html.match(/\.weather-condition\s*\{[^}]*overflow:\s*hidden/s)
);

// Test 12: Forecast container has overflow handling
test(
  'Forecast container has overflow-x: auto',
  html.match(/\.forecast-container\s*\{[^}]*overflow-x:\s*auto/s)
);

// Test 13: Grid positioning CSS exists
test(
  'Grid positioning CSS rules exist',
  html.includes('data-grid-x') && 
  html.includes('grid-column: span')
);

// Test 14: Responsive sizing for small widgets exists
test(
  'Responsive sizing for small clock widgets exists',
  html.match(/\.widget\[data-grid-width="1"\]\s*\.clock-time/s)
);

test(
  'Responsive sizing for small weather widgets exists',
  html.match(/\.widget\[data-grid-width="1"\]\s*\.weather-temp/s)
);

// Test 15: Smart sub-widget base CSS enforces containment
test(
  'smart-sub-widget CSS class has min-width: 0',
  html.match(/\.smart-sub-widget\s*\{[^}]*min-width:\s*0/s)
);

test(
  'smart-sub-widget CSS class has min-height: 0',
  html.match(/\.smart-sub-widget\s*\{[^}]*min-height:\s*0/s)
);

// Test 16: Simultaneous / adaptive container CSS fills available space
test(
  'smart-widget-simultaneous has width: 100% via CSS',
  html.match(/\.smart-widget-simultaneous[^{]*\{[^}]*width:\s*100%/s)
);

// Test 17: Simultaneous mode uses portrait-aware layout (flex column in portrait)
test(
  'Simultaneous mode detects portrait orientation for vertical stacking',
  html.includes("currentOrientation === 'portrait'") &&
  html.includes("flexDirection = 'column'")
);

test(
  'Simultaneous mode gives flex:1 to portrait sub-widgets',
  html.includes("subDiv.style.flex = '1'")
);

// Test 18: window.resize handler exists for Raspberry Pi support
test(
  'window.resize handler exists for Raspberry Pi initialization support',
  html.includes("window.addEventListener('resize'") &&
  html.includes('resizeDebounceTimer')
);

test(
  'Resize handler debounces events',
  html.match(/clearTimeout\(resizeDebounceTimer\)/)
);

// Test 19: Region-specific news highlight CSS exists
test(
  'news-item-region has a left border for visual highlight',
  html.match(/\.news-item-region\s*\{[^}]*border-left:/s)
);

test(
  'news-item-region has a background for visual highlight',
  html.match(/\.news-item-region\s*\{[^}]*background:/s)
);

test(
  'news-region-badge style is defined',
  html.match(/\.news-region-badge\s*\{/)
);

test(
  'news-no-region style is defined',
  html.match(/\.news-no-region\s*\{/)
);

// Test 20: renderRegionNewsSection helper exists in updateNewsWidget
test(
  'renderRegionNewsSection helper renders news-item-region class',
  html.includes('news-item-region') &&
  html.includes('renderRegionNewsSection')
);

// Test 21: Region badge is appended to region-specific news items
test(
  'Region badge (news-region-badge) is appended inside renderRegionNewsSection',
  html.includes('news-region-badge') &&
  html.match(/badge\.className\s*=\s*['"]news-region-badge['"]/)
);

// Test 22: Empty-region "no news" notice is rendered when regions return no items
test(
  'Empty region notice uses news-no-region class',
  html.includes('news-no-region') &&
  html.includes('no news from')
);

// Summary
console.log('\n' + '='.repeat(50));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n✅ All widget sizing constraints are properly implemented!');
  console.log('\n✨ Expected behavior:');
  console.log('  • Widgets strictly adhere to grid dimensions');
  console.log('  • Content overflow is clipped or scrolled');
  console.log('  • Side-by-side widgets maintain independent sizing');
  console.log('  • Text truncation prevents layout breaking');
  console.log('  • Responsive sizing for small grid cells');
  process.exit(0);
} else {
  console.log('\n❌ Some widget sizing constraints are missing or incorrect');
  console.log('Please review the CSS changes in smart-mirror.html');
  process.exit(1);
}
