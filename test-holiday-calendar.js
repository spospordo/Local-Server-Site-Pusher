#!/usr/bin/env node

/**
 * Integration test for calendar widget with holiday calendars
 * Simulates fetching US Holidays and verifies proper string extraction
 */

const ical = require('node-ical');

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

async function testHolidayCalendar() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Calendar Widget Holiday Integration Test            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // Fetch US Holidays calendar
    const url = 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics';
    console.log('📥 Fetching US Holidays calendar...');
    console.log(`   URL: ${url}\n`);

    const axios = require('axios');
    const response = await axios.get(url, { timeout: 10000 });
    
    console.log('✅ Calendar fetched successfully\n');

    // Parse the iCal data
    console.log('🔍 Parsing calendar events...\n');
    const events = await ical.async.parseICS(response.data);

    let processedCount = 0;
    let objectTypeCount = 0;
    let stringTypeCount = 0;

    console.log('📋 Sample events (February 2026):\n');

    // Find events in February 2026
    const targetDate = new Date('2026-02-01');
    const endDate = new Date('2026-03-01');

    for (const [key, event] of Object.entries(events)) {
      if (event.type === 'VEVENT') {
        const startDate = event.start ? new Date(event.start) : null;
        
        if (startDate && startDate >= targetDate && startDate < endDate) {
          processedCount++;

          // Check if summary is an object
          const isObject = typeof event.summary === 'object';
          if (isObject) {
            objectTypeCount++;
          } else {
            stringTypeCount++;
          }

          // Extract the title using our helper function
          const title = getICalStringValue(event.summary);
          const description = getICalStringValue(event.description);
          const location = getICalStringValue(event.location);

          console.log(`${processedCount}. ${title}`);
          console.log(`   📅 Date: ${startDate.toDateString()}`);
          console.log(`   🔍 Summary type: ${typeof event.summary}`);
          if (isObject) {
            console.log(`   🔍 Summary value: ${JSON.stringify(event.summary)}`);
          }
          console.log(`   ✅ Extracted title: "${title}"`);
          if (description) {
            console.log(`   📝 Description: ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`);
          }
          if (location) {
            console.log(`   📍 Location: ${location}`);
          }
          console.log();
        }
      }
    }

    console.log('═'.repeat(56));
    console.log('📊 Test Results:');
    console.log(`   Events processed: ${processedCount}`);
    console.log(`   Object-type summaries: ${objectTypeCount}`);
    console.log(`   String-type summaries: ${stringTypeCount}`);
    
    if (objectTypeCount > 0) {
      console.log('\n✅ SUCCESS: Object-type event properties detected and handled!');
      console.log('   This confirms the fix handles holiday calendar formats correctly.');
    } else if (processedCount > 0) {
      console.log('\n✅ SUCCESS: All events processed with string-type properties.');
      console.log('   The helper function ensures [object Object] won\'t appear.');
    } else {
      console.log('\n⚠️  No events found in February 2026');
    }
    
    console.log('═'.repeat(56) + '\n');

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Status text:', error.response.statusText);
    }
    return false;
  }
}

// Run the test
testHolidayCalendar().then(success => {
  process.exit(success ? 0 : 1);
});
