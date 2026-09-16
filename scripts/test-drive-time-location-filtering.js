#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const repoRoot = path.join(__dirname, '..');
const smartMirrorModuleSource = fs.readFileSync(path.join(repoRoot, 'modules', 'smartmirror.js'), 'utf8');
const smartMirrorHtmlSource = fs.readFileSync(path.join(repoRoot, 'public', 'smart-mirror.html'), 'utf8');

function extractFunction(source, signature) {
  const startIndex = source.indexOf(signature);
  if (startIndex === -1) {
    throw new Error(`Unable to locate ${signature}`);
  }

  const bodyStartIndex = source.indexOf('{', startIndex);
  let depth = 0;
  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error(`Unable to parse ${signature}`);
}

function isoDate(daysFromNow) {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString();
}

function createEvent(title, location, daysFromNow = 1) {
  return {
    title,
    location,
    start: isoDate(daysFromNow),
    end: isoDate(daysFromNow),
    isAllDay: false
  };
}

async function runModuleTests() {
  const geocodedAddresses = [];
  const moduleContext = {
    DRIVE_TIME_URL_PATTERN: /\b(?:https?:\/\/|www\.)\S+/gi,
    DRIVE_TIME_VIRTUAL_LOCATION_PATTERN: /\b(?:zoom|google\s+meet|meet\.google|microsoft\s+teams|teams\.microsoft|webex|gotomeeting|go\s+to\s+meeting|whereby|bluejeans|jitsi|dial-?in|conference\s+call|phone\s+call|telehealth|virtual|online|webinar|livestream)\b/i,
    DRIVE_TIME_STREET_TYPE_PATTERN: /\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|cir|circle|trl|trail|ter|terrace|way|pkwy|parkway|pl|place|hwy|highway)\b/i,
    DRIVE_TIME_CITY_STATE_PATTERN: /,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\b/,
    DRIVE_TIME_ZIP_PATTERN: /\b\d{5}(?:-\d{4})?\b/,
    DRIVE_TIME_INTERSECTION_PATTERN: /\b(?:[A-Za-z0-9.'-]+\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|cir|circle|trl|trail|ter|terrace|way|pkwy|parkway|pl|place|hwy|highway))\s*(?:&|and|@)\s*(?:[A-Za-z0-9.'-]+\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|cir|circle|trl|trail|ter|terrace|way|pkwy|parkway|pl|place|hwy|highway))\b/i,
    LANDMARK_PATTERNS: [
      /\bhospital\b/i,
      /\bcenter\b/i,
      /\bpark\b/i,
      /\bbuilding\b/i
    ],
    NOTABLE_TRAFFIC_DELAY_SECONDS: 300,
    logger: {
      categories: { SMART_MIRROR: 'SMART_MIRROR' },
      debug: () => {},
      success: () => {},
      warning: () => {},
      error: () => {}
    },
    fetchCalendarEvents: async () => ({
      success: true,
      events: [
        createEvent('No Location', ''),
        createEvent('Meeting Link', 'https://zoom.us/j/123456789'),
        createEvent('Virtual Meeting', 'Join Microsoft Teams Meeting'),
        createEvent('City Only', 'Seattle, WA'),
        createEvent('Exact Address', '123 Main St, Springfield, IL 62701'),
        createEvent('Partial Address', 'Main St, Springfield, IL'),
        createEvent('Malformed But Geocodable', '500 Elm Road Springfield IL 62701')
      ]
    }),
    geocodeAddressTomTom: async (address) => {
      geocodedAddresses.push(address);
      return { lat: 41.1, lon: -87.1 };
    },
    getRouteTomTom: async () => ({
      travelTimeSeconds: 1500,
      trafficDelaySeconds: 240
    }),
    fetchDestinationWeatherByCoords: async () => null,
    Date,
    Math
  };

  vm.createContext(moduleContext);
  vm.runInContext([
    extractFunction(smartMirrorModuleSource, 'function _classifyDriveTimeLocation(location)'),
    extractFunction(smartMirrorModuleSource, 'async function fetchDriveTimes(calendarUrls, tomtomApiKey, homeAddress, weatherApiKey = null, units = \'imperial\')'),
    'this._classifyDriveTimeLocation = _classifyDriveTimeLocation;',
    'this.fetchDriveTimes = fetchDriveTimes;'
  ].join('\n'), moduleContext);

  const { _classifyDriveTimeLocation, fetchDriveTimes } = moduleContext;

  assert.strictEqual(_classifyDriveTimeLocation('').isPhysical, false, 'missing location should be rejected');
  assert.strictEqual(_classifyDriveTimeLocation('https://meet.google.com/abc-defg-hij').reason, 'url-only', 'URL-only location should be rejected');
  assert.strictEqual(_classifyDriveTimeLocation('Join Zoom Meeting').reason, 'virtual', 'virtual meeting text should be rejected');
  assert.strictEqual(_classifyDriveTimeLocation('Seattle, WA').isPhysical, false, 'city-only location should not render drive time');
  assert.strictEqual(_classifyDriveTimeLocation('123 Main St, Springfield, IL 62701').confidence, 'high', 'full address should be high confidence');
  assert.strictEqual(_classifyDriveTimeLocation('Main St, Springfield, IL').confidence, 'low', 'partial address should be low confidence');
  assert.strictEqual(_classifyDriveTimeLocation('500 Elm Road Springfield IL 62701').isPhysical, true, 'malformed but geocodable address should still be attempted');

  const result = await fetchDriveTimes(['calendar.ics'], 'tomtom-key', '1 Home St, Hometown, IL 62701');
  assert.strictEqual(result.success, true, 'fetchDriveTimes should succeed with stubbed dependencies');
  const eventTitles = Array.from(result.events, event => event.title);
  assert.deepStrictEqual(
    eventTitles,
    ['Exact Address', 'Partial Address', 'Malformed But Geocodable'],
    'only plausible physical locations should be included'
  );
  assert.strictEqual(result.events[0].isApproximateLocation, false, 'full address should not be marked approximate');
  assert.strictEqual(result.events[1].isApproximateLocation, true, 'partial address should be marked approximate');
  assert.ok(
    geocodedAddresses.includes('Main St, Springfield, IL'),
    'partial physical address should still be geocoded'
  );
  assert.ok(
    !geocodedAddresses.includes('https://zoom.us/j/123456789'),
    'URL-only locations should never be geocoded'
  );
  assert.ok(
    !geocodedAddresses.includes('Join Microsoft Teams Meeting'),
    'virtual meeting strings should never be geocoded'
  );
}

function runRenderTests() {
  const dom = new JSDOM('<!DOCTYPE html><body></body>');
  const renderContext = {
    document: dom.window.document,
    window: dom.window,
    console,
    getWeatherIcon: () => '☀️',
    Date
  };

  vm.createContext(renderContext);
  vm.runInContext([
    extractFunction(smartMirrorHtmlSource, 'function renderDriveTime(data)'),
    'this.renderDriveTime = renderDriveTime;'
  ].join('\n'), renderContext);

  const { renderDriveTime } = renderContext;
  const approximateNode = renderDriveTime({
    events: [
      {
        title: 'Partial Address',
        startTime: isoDate(1),
        daysFromNow: 1,
        travelTimeMinutes: 20,
        trafficDelayMinutes: 0,
        hasTrafficDelay: false,
        isApproximateLocation: true
      }
    ]
  });
  assert.ok(approximateNode, 'renderer should return content for drive-time events');
  assert.ok(
    approximateNode.textContent.includes('Approx. route — location may be incomplete'),
    'renderer should label approximate routes'
  );

  const exactNode = renderDriveTime({
    events: [
      {
        title: 'Exact Address',
        startTime: isoDate(1),
        daysFromNow: 1,
        travelTimeMinutes: 18,
        trafficDelayMinutes: 0,
        hasTrafficDelay: false,
        isApproximateLocation: false
      }
    ]
  });
  assert.ok(exactNode, 'renderer should return content for exact routes');
  assert.ok(
    !exactNode.textContent.includes('Approx. route — location may be incomplete'),
    'renderer should not label high-confidence routes as approximate'
  );
}

async function run() {
  console.log('\n🚗 Drive-time location filtering regression tests\n');
  await runModuleTests();
  runRenderTests();
  console.log('✅ Drive-time location filtering regression tests passed');
}

run().catch(error => {
  console.error('❌ Drive-time location filtering regression tests failed');
  console.error(error);
  process.exit(1);
});
