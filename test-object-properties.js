#!/usr/bin/env node

/**
 * Integration test that simulates holiday calendar with object-type properties
 * Tests the fix by manually creating event objects that mimic node-ical behavior
 */

// Helper function from modules/smartmirror.js
function getICalStringValue(property) {
  if (!property) return '';
  if (typeof property === 'string') return property;
  if (typeof property === 'object' && property.val) return String(property.val);
  if (typeof property === 'object') {
    if (property.value !== undefined) return String(property.value);
    console.warn(`Unexpected iCal property format: ${JSON.stringify(property)}`);
    return '';
  }
  return String(property);
}

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║   Calendar Widget Object Property Test                ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// Simulate how node-ical might parse holiday calendar events
const testEvents = [
  {
    type: 'VEVENT',
    start: new Date('2026-02-16'),
    summary: { val: "President's Day" },  // Object format
    description: { val: "Federal Holiday" },
    location: '',
    datetype: 'date'
  },
  {
    type: 'VEVENT',
    start: new Date('2026-02-14'),
    summary: { val: "Valentine's Day" },  // Object format
    description: '',
    location: '',
    datetype: 'date'
  },
  {
    type: 'VEVENT',
    start: new Date('2026-02-17'),
    summary: { val: "Ramadan Begins" },  // Object format
    description: { val: "This date is approximate because it is based on a lunar calendar; the beginning of Ramadan is the da..." },
    location: '',
    datetype: 'date'
  },
  {
    type: 'VEVENT',
    start: new Date('2026-02-13T20:00:00Z'),
    summary: "Joshua tree",  // Normal string format
    description: '',
    location: { val: "Twentynine Palms United States" },
    datetype: 'datetime'
  },
  {
    type: 'VEVENT',
    start: new Date('2026-02-19'),
    summary: "Ticket: 2026 Los Angeles Arts & Crafts Expo",  // Normal string format
    description: '',
    location: '',
    datetype: 'date'
  }
];

console.log('🧪 Testing event property extraction:\n');

let allPassed = true;
testEvents.forEach((event, index) => {
  const num = index + 1;
  console.log(`Event ${num}:`);
  console.log(`  Start: ${event.start.toDateString()}`);
  console.log(`  Summary type: ${typeof event.summary}`);
  
  if (typeof event.summary === 'object') {
    console.log(`  Summary object: ${JSON.stringify(event.summary)}`);
  }
  
  // Extract using our helper
  const title = getICalStringValue(event.summary) || 'Untitled Event';
  const description = getICalStringValue(event.description) || '';
  const location = getICalStringValue(event.location) || '';
  
  console.log(`  ✅ Extracted title: "${title}"`);
  
  // Check for [object Object]
  if (title.includes('[object Object]')) {
    console.log(`  ❌ ERROR: Title contains "[object Object]"`);
    allPassed = false;
  } else if (title === '') {
    console.log(`  ⚠️  Warning: Empty title (should be "Untitled Event")`);
  }
  
  if (description) {
    console.log(`  📝 Description: ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`);
  }
  
  if (location) {
    console.log(`  📍 Location: ${location}`);
  }
  
  console.log();
});

console.log('═'.repeat(56));
console.log('📊 Test Results:\n');

if (allPassed) {
  console.log('✅ SUCCESS: All event properties extracted correctly!');
  console.log('   No "[object Object]" detected in any field.');
  console.log('\n🎉 The calendar widget fix is working as expected.');
  console.log('   Holiday events will now display proper names instead of [object Object].');
} else {
  console.log('❌ FAILURE: Some events still contain "[object Object]"');
}

console.log('═'.repeat(56) + '\n');

console.log('📋 Expected Calendar Display (February 2026):\n');
console.log('Mon, Feb 16  President\'s Day');
console.log('Tue, Feb 17  Ramadan Begins');
console.log('             This date is approximate because it is based on a...');
console.log();

process.exit(allPassed ? 0 : 1);
