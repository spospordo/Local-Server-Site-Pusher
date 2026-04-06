#!/usr/bin/env node
/**
 * Unit tests for the regional news search helper functions:
 *   _classifyAddress, _extractAddressComponents, _extractState, _buildRegionNewsQuery
 *
 * Run with:  node scripts/test-regional-news-search.js
 */

'use strict';

const smartMirror = require('../modules/smartmirror');

const {
  _classifyAddress,
  _extractAddressComponents,
  _extractState,
  _buildRegionNewsQuery
} = smartMirror;

// ── Tiny test harness ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

function assertEqual(actual, expected, description) {
  if (actual === expected) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(60 - title.length)}`);
}

// ── _classifyAddress ──────────────────────────────────────────────────────────

section('_classifyAddress');

assertEqual(_classifyAddress('123 Main St, Springfield, IL 62701'), 'residential', 'street-number address → residential');
assertEqual(_classifyAddress('456 Oak Ave, Dallas, TX 75201'),       'residential', 'street-number address (Ave) → residential');
assertEqual(_classifyAddress('1600 Pennsylvania Ave NW, Washington, DC 20500'), 'residential', 'famous street address → residential');

assertEqual(_classifyAddress('Fenway Park, Boston, MA'),             'landmark', 'park keyword → landmark');
assertEqual(_classifyAddress('Madison Square Garden, New York, NY'), 'landmark', 'garden keyword → landmark');
assertEqual(_classifyAddress('Dallas/Fort Worth Airport, TX'),       'landmark', 'airport keyword → landmark');
assertEqual(_classifyAddress('Ritz-Carlton Hotel, Chicago, IL'),     'landmark', 'hotel keyword → landmark');
assertEqual(_classifyAddress('University of Texas, Austin, TX'),     'landmark', 'university keyword → landmark');
assertEqual(_classifyAddress('Soldier Field Stadium, Chicago, IL'),  'landmark', 'stadium keyword → landmark');

assertEqual(_classifyAddress('Paris, France'),   'city', 'city + country → city');
assertEqual(_classifyAddress('New York, NY'),     'city', 'city + state abbreviation → city');
assertEqual(_classifyAddress('Springfield, IL'),  'city', 'city + state → city');
assertEqual(_classifyAddress('Austin, TX'),       'city', 'simple city + state → city');
assertEqual(_classifyAddress(''),                 'city', 'empty string → city (safe default)');

// ── _extractAddressComponents ─────────────────────────────────────────────────

section('_extractAddressComponents');

{
  const c = _extractAddressComponents('123 Main St, Springfield, IL 62701');
  assert(c.city === 'Springfield', 'residential: city extracted');
  assert(c.state === 'IL', 'residential: state extracted');
  assert(c.zip === '62701', 'residential: ZIP extracted');
}

{
  const c = _extractAddressComponents('Springfield, IL 62701');
  assert(c.city === 'Springfield', 'city+state+ZIP in last part: city correct');
  assert(c.state === 'IL', 'city+state+ZIP in last part: state correct');
  assert(c.zip === '62701', 'city+state+ZIP in last part: ZIP correct');
}

{
  const c = _extractAddressComponents('Dallas, TX');
  assert(c.city === 'Dallas', 'city+state (no ZIP): city correct');
  assert(c.state === 'TX', 'city+state (no ZIP): state correct');
}

{
  const c = _extractAddressComponents('Paris, France');
  assert(c.city === 'Paris', 'city+country: city correct');
  assert(c.country === 'France', 'city+country: country correct');
  assert(!c.state, 'city+country: no state');
}

{
  const c = _extractAddressComponents('');
  assert(Object.keys(c).length === 0, 'empty string → empty object');
}

// ── _extractState ─────────────────────────────────────────────────────────────

section('_extractState');

assertEqual(_extractState('123 Main St, Springfield, IL 62701'), 'IL', 'full US address → IL');
assertEqual(_extractState('Dallas, TX'),                          'TX', 'city + state → TX');
assertEqual(_extractState('Paris, France'),                       null, 'city + country → null');
assertEqual(_extractState(''),                                    null, 'empty string → null');
assertEqual(_extractState(null),                                  null, 'null → null');

// ── _buildRegionNewsQuery ─────────────────────────────────────────────────────

section('_buildRegionNewsQuery');

// Residential: street number stripped, city+state kept
assertEqual(
  _buildRegionNewsQuery('123 Oak St, Austin, TX 78701', ''),
  'Austin, TX 78701',
  'residential: street stripped, city+state+ZIP kept'
);
assertEqual(
  _buildRegionNewsQuery('456 Elm Ave, Dallas, TX', ''),
  'Dallas, TX',
  'residential: street stripped, city+state kept'
);

// Residential with home address in same state
assertEqual(
  _buildRegionNewsQuery('789 Pine Rd, Chicago, IL 60601', '100 Home St, Springfield, IL 62701'),
  'Chicago, IL 60601',
  'residential: same-state home address does not change query'
);

// Residential with home address in different state
assertEqual(
  _buildRegionNewsQuery('22 Broadway, New York, NY 10004', '100 Home St, Chicago, IL 60601'),
  'New York, NY 10004',
  'residential: cross-state — city+state+ZIP returned for disambiguation'
);

// Landmark: quoted name + city context
assertEqual(
  _buildRegionNewsQuery('Fenway Park, Boston, MA', ''),
  '"Fenway Park" Boston, MA',
  'landmark: quoted name + city context'
);
assertEqual(
  _buildRegionNewsQuery('Madison Square Garden, New York, NY', ''),
  '"Madison Square Garden" New York, NY',
  'landmark: MSG with city context'
);

// Landmark with only one part (no city)
assertEqual(
  _buildRegionNewsQuery('The Arena', ''),
  'The Arena',
  'landmark: single-part landmark returned as-is'
);

// City type: returned verbatim
assertEqual(
  _buildRegionNewsQuery('Paris, France', ''),
  'Paris, France',
  'city: city+country returned as-is'
);
assertEqual(
  _buildRegionNewsQuery('Springfield, IL', ''),
  'Springfield, IL',
  'city: city+state returned as-is'
);
assertEqual(
  _buildRegionNewsQuery('', ''),
  '',
  'empty string → empty string'
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(70)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(70));

if (failed > 0) {
  process.exit(1);
}
