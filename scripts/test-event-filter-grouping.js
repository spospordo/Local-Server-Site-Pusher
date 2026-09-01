#!/usr/bin/env node

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const smartmirrorSource = fs.readFileSync(
  path.join(__dirname, '..', 'modules', 'smartmirror.js'),
  'utf8'
);

function extractFunction(source, name) {
  const pattern = new RegExp(`function ${name}\\s*\\([^)]*\\)\\s*\\{`);
  const match = source.match(pattern);
  if (!match || match.index === undefined) {
    throw new Error(`Could not find function: ${name}`);
  }

  const start = match.index;
  let i = start + match[0].length - 1;
  let depth = 0;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Could not parse function body for: ${name}`);
}

const context = {
  logger: {
    categories: { SMART_MIRROR: 'SMART_MIRROR' },
    debug: () => {},
    info: () => {},
    warning: () => {},
    error: () => {}
  }
};

vm.createContext(context);
vm.runInContext(`${extractFunction(smartmirrorSource, '_applyEventFilters')}\nthis._applyEventFilters = _applyEventFilters;`, context);
const { _applyEventFilters } = context;

function isoDate(daysFromNow) {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString();
}

function createEvent(title, daysFromNow, description = '', location = '') {
  return {
    title,
    start: isoDate(daysFromNow),
    end: isoDate(daysFromNow),
    description,
    location,
    daysFromNow,
    isAllDay: false
  };
}

function groupedDateLabel(daysFromNow) {
  const date = new Date(isoDate(daysFromNow));
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric'
  });
}

function createFilterConfig() {
  return {
    enabled: true,
    rules: [
      {
        id: 'doctor-group',
        keywords: ['doctor'],
        action: 'replace',
        replacementTitle: 'Doc Appointment'
      }
    ]
  };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

console.log('\n📅 Calendar event grouping regression tests\n');

test('groups matching replacement-title events into one summarized entry', () => {
  const result = _applyEventFilters([
    createEvent('Doctor Visit', 15, 'Lab review'),
    createEvent('Doctor Visit', 8, 'Follow-up'),
    createEvent('Doctor Visit', 1, 'Annual physical'),
    createEvent('Doctor Visit', 22, 'Extra appointment')
  ], createFilterConfig());

  assert.strictEqual(result.length, 1);
  assert.strictEqual(
    result[0].title,
    `Doc Appointment ${groupedDateLabel(1)}, ${groupedDateLabel(8)}, ${groupedDateLabel(15)}...`
  );
});

test('applies hide rules independently from grouped replacement entries', () => {
  const result = _applyEventFilters([
    createEvent('Private Meeting', 1, 'Hidden'),
    createEvent('Doctor Visit', 6, 'Follow-up'),
    createEvent('Doctor Visit', 2, 'Checkup')
  ], {
    enabled: true,
    rules: [
      {
        id: 'hide-private',
        keywords: ['private'],
        action: 'hide'
      },
      ...createFilterConfig().rules
    ]
  });

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].title, `Doc Appointment ${groupedDateLabel(2)}, ${groupedDateLabel(6)}`);
});

test('keeps the next upcoming event description on grouped entries', () => {
  const result = _applyEventFilters([
    createEvent('Doctor Visit', 2, 'Keep this description'),
    createEvent('Doctor Visit', 6, 'Later description')
  ], createFilterConfig());

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].description, 'Keep this description');
  assert.strictEqual(result[0].location, '');
});

test('preserves chronological ordering against non-grouped events', () => {
  const result = _applyEventFilters([
    createEvent('Birthday Party', 1, 'Cake'),
    createEvent('Doctor Visit', 2, 'Checkup'),
    createEvent('Doctor Visit', 9, 'Follow-up'),
    createEvent('Dinner', 12, 'Reservation')
  ], createFilterConfig());

  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].title, 'Birthday Party');
  assert.strictEqual(result[1].title, `Doc Appointment ${groupedDateLabel(2)}, ${groupedDateLabel(9)}`);
  assert.strictEqual(result[2].title, 'Dinner');
});

test('leaves single matched events ungrouped and otherwise unchanged', () => {
  const result = _applyEventFilters([
    createEvent('Doctor Visit', 3, 'Single item')
  ], createFilterConfig());

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].title, 'Doc Appointment');
  assert.strictEqual(result[0].description, 'Single item');
});

console.log(`\n${'─'.repeat(60)}`);
if (failed === 0) {
  console.log(`✅ All ${passed} tests passed.\n`);
} else {
  console.error(`❌ ${failed} test(s) failed, ${passed} passed.\n`);
  process.exit(1);
}
