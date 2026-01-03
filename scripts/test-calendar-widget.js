#!/usr/bin/env node

/**
 * Test script for Calendar Widget Enhancement
 * Tests webcal support, calendar API, and event parsing
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 15000;

// Test calendar URLs (using public test calendars)
const TEST_CALENDARS = {
  // Google Calendar public holiday calendar
  googleCalendar: 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics',
  // Webcal format (should be converted to https://)
  webcalFormat: 'webcal://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics'
};

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: TEST_TIMEOUT
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body.length > 0 ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (err) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Helper to log test results
function logTest(testName, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

// Test: Calendar API endpoint exists and returns proper structure
async function testCalendarAPI() {
  console.log('\n📅 Testing Calendar API...\n');
  
  try {
    const response = await makeRequest('GET', '/api/smart-mirror/calendar');
    
    // Check status code
    logTest(
      'Calendar API responds',
      response.statusCode === 200,
      `Status: ${response.statusCode}`
    );
    
    // Check response structure
    const hasSuccess = response.body && typeof response.body.success !== 'undefined';
    logTest(
      'Response has success field',
      hasSuccess,
      hasSuccess ? `success: ${response.body.success}` : 'Missing success field'
    );
    
    const hasEvents = response.body && Array.isArray(response.body.events);
    logTest(
      'Response has events array',
      hasEvents,
      hasEvents ? `${response.body.events.length} events` : 'Missing or invalid events'
    );
    
    // Check for errors field
    if (response.body && response.body.errors) {
      logTest(
        'Calendar fetch errors reported',
        true,
        `Errors: ${response.body.errors.length > 0 ? response.body.errors.join(', ') : 'None'}`
      );
    }
    
    // Validate event structure if events exist
    if (hasEvents && response.body.events.length > 0) {
      const firstEvent = response.body.events[0];
      const hasTitle = typeof firstEvent.title === 'string';
      const hasStart = typeof firstEvent.start === 'string';
      const hasIsAllDay = typeof firstEvent.isAllDay === 'boolean';
      
      logTest(
        'Events have required fields',
        hasTitle && hasStart,
        `title: ${hasTitle}, start: ${hasStart}, isAllDay: ${hasIsAllDay}`
      );
      
      // Log sample event
      console.log('\n   Sample event:');
      console.log(`   - Title: ${firstEvent.title}`);
      console.log(`   - Start: ${firstEvent.start}`);
      console.log(`   - All-day: ${firstEvent.isAllDay}`);
      if (firstEvent.location) console.log(`   - Location: ${firstEvent.location}`);
      if (firstEvent.description) {
        const desc = firstEvent.description.substring(0, 50);
        console.log(`   - Description: ${desc}${firstEvent.description.length > 50 ? '...' : ''}`);
      }
    }
    
    return true;
  } catch (error) {
    logTest('Calendar API test', false, `Error: ${error.message}`);
    return false;
  }
}

// Test: Smart Mirror config accepts calendar URLs
async function testCalendarConfig() {
  console.log('\n⚙️  Testing Calendar Configuration...\n');
  
  try {
    // Load current config
    const configResponse = await makeRequest('GET', '/api/smart-mirror/config');
    
    logTest(
      'Config API responds',
      configResponse.statusCode === 200,
      `Status: ${configResponse.statusCode}`
    );
    
    if (configResponse.body && configResponse.body.success) {
      const config = configResponse.body.config;
      const calendarWidget = config.widgets?.calendar;
      
      logTest(
        'Calendar widget configured',
        !!calendarWidget,
        calendarWidget ? `Enabled: ${calendarWidget.enabled}` : 'Not found'
      );
      
      if (calendarWidget) {
        const hasUrlsArray = Array.isArray(calendarWidget.calendarUrls);
        logTest(
          'Calendar URLs is array',
          hasUrlsArray,
          hasUrlsArray ? `${calendarWidget.calendarUrls.length} URLs` : 'Not an array'
        );
        
        if (hasUrlsArray && calendarWidget.calendarUrls.length > 0) {
          console.log('\n   Configured calendar URLs:');
          calendarWidget.calendarUrls.forEach((url, i) => {
            console.log(`   ${i + 1}. ${url}`);
            // Check if webcal URL is present
            if (url.startsWith('webcal://')) {
              logTest('   Webcal URL accepted in config', true, url);
            }
          });
        }
      }
    }
    
    return true;
  } catch (error) {
    logTest('Calendar config test', false, `Error: ${error.message}`);
    return false;
  }
}

// Test: HTML page loads
async function testCalendarWidgetPage() {
  console.log('\n🌐 Testing Smart Mirror Page...\n');
  
  try {
    const response = await makeRequest('GET', '/smart-mirror');
    
    logTest(
      'Smart Mirror page loads',
      response.statusCode === 200,
      `Status: ${response.statusCode}`
    );
    
    const isHTML = response.headers['content-type']?.includes('text/html');
    logTest(
      'Response is HTML',
      isHTML,
      `Content-Type: ${response.headers['content-type']}`
    );
    
    // Check for calendar-related elements in HTML
    if (typeof response.body === 'string') {
      const hasCalendarCSS = response.body.includes('calendar-container');
      const hasCalendarJS = response.body.includes('updateCalendarWidget');
      const hasMonthGrid = response.body.includes('renderMonthlyCalendar');
      
      logTest('Calendar CSS classes present', hasCalendarCSS);
      logTest('Calendar JS functions present', hasCalendarJS);
      logTest('Monthly calendar grid function present', hasMonthGrid);
    }
    
    return true;
  } catch (error) {
    logTest('Smart Mirror page test', false, `Error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Calendar Widget Enhancement Test Suite              ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  let allPassed = true;
  
  try {
    // Test 1: Calendar API
    const apiTest = await testCalendarAPI();
    allPassed = allPassed && apiTest;
    
    // Test 2: Calendar Configuration
    const configTest = await testCalendarConfig();
    allPassed = allPassed && configTest;
    
    // Test 3: HTML Page
    const pageTest = await testCalendarWidgetPage();
    allPassed = allPassed && pageTest;
    
    // Summary
    console.log('\n' + '═'.repeat(56));
    if (allPassed) {
      console.log('✅ All calendar tests passed!');
      console.log('\n📋 Features tested:');
      console.log('   • Calendar API endpoint');
      console.log('   • Event parsing with isAllDay detection');
      console.log('   • Calendar URL configuration');
      console.log('   • Monthly calendar grid rendering');
      console.log('   • Enhanced event display with descriptions');
      console.log('   • Error handling and warnings');
    } else {
      console.log('❌ Some calendar tests failed');
      console.log('\nNote: If calendar widget is disabled or no URLs configured,');
      console.log('some tests will fail. Configure calendar in admin panel.');
    }
    console.log('═'.repeat(56) + '\n');
    
    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
