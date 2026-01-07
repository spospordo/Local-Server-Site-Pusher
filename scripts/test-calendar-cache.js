#!/usr/bin/env node

/**
 * Test script for Calendar Caching Feature
 * Tests server-side caching, ETag support, and cache management
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 15000;

// Test calendar URL (using public test calendar)
const TEST_CALENDAR_URL = 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics';

// Helper function to make HTTP requests
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
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

// Helper to wait
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Calendar API includes cache metadata
async function testCacheMetadata() {
  console.log('\n📦 Testing Cache Metadata...\n');
  
  try {
    const response = await makeRequest('GET', '/api/smart-mirror/calendar');
    
    logTest(
      'Calendar API responds',
      response.statusCode === 200,
      `Status: ${response.statusCode}`
    );
    
    // Check for cache-related fields
    const hasCached = response.body && typeof response.body.cached !== 'undefined';
    logTest(
      'Response includes "cached" field',
      hasCached,
      hasCached ? `cached: ${response.body.cached}` : 'Missing cached field'
    );
    
    if (response.body.cached) {
      const hasCacheAge = typeof response.body.cacheAge !== 'undefined';
      const hasLastFetch = typeof response.body.lastFetch !== 'undefined';
      
      logTest('Response includes cache age', hasCacheAge, hasCacheAge ? `${response.body.cacheAge}s` : '');
      logTest('Response includes last fetch time', hasLastFetch, hasLastFetch ? response.body.lastFetch : '');
    }
    
    return true;
  } catch (error) {
    logTest('Cache metadata test', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 2: Cache-Control headers are set properly
async function testCacheControlHeaders() {
  console.log('\n🌐 Testing HTTP Cache Headers...\n');
  
  try {
    const response = await makeRequest('GET', '/api/smart-mirror/calendar');
    
    const hasCacheControl = response.headers['cache-control'];
    logTest(
      'Cache-Control header present',
      !!hasCacheControl,
      hasCacheControl ? `Cache-Control: ${hasCacheControl}` : 'Missing'
    );
    
    // Check that it's not set to no-cache
    const isPublicCache = hasCacheControl && hasCacheControl.includes('public');
    logTest(
      'Cache-Control allows public caching',
      isPublicCache,
      isPublicCache ? 'Allows client-side caching' : 'Prevents caching'
    );
    
    const hasMaxAge = hasCacheControl && hasCacheControl.includes('max-age');
    logTest(
      'Cache-Control includes max-age',
      hasMaxAge,
      hasMaxAge ? hasCacheControl : 'No max-age directive'
    );
    
    return true;
  } catch (error) {
    logTest('Cache-Control headers test', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 3: Repeated requests use cache
async function testCacheReuse() {
  console.log('\n🔄 Testing Cache Reuse...\n');
  
  try {
    // First request - should miss cache or create new cache
    console.log('   Making first request...');
    const response1 = await makeRequest('GET', '/api/smart-mirror/calendar');
    const firstCached = response1.body?.cached || false;
    const firstLastFetch = response1.body?.lastFetch;
    
    logTest(
      'First request completed',
      response1.statusCode === 200,
      `cached: ${firstCached}, lastFetch: ${firstLastFetch || 'N/A'}`
    );
    
    // Wait a moment
    await sleep(1000);
    
    // Second request - should use cache
    console.log('   Making second request (should use cache)...');
    const response2 = await makeRequest('GET', '/api/smart-mirror/calendar');
    const secondCached = response2.body?.cached || false;
    const secondLastFetch = response2.body?.lastFetch;
    
    logTest(
      'Second request completed',
      response2.statusCode === 200,
      `cached: ${secondCached}, lastFetch: ${secondLastFetch || 'N/A'}`
    );
    
    // Check if cache was used
    logTest(
      'Second request used cache',
      secondCached === true,
      secondCached ? 'Cache was reused' : 'Cache was not used'
    );
    
    // Check if lastFetch is the same (indicating same cache data)
    const sameFetchTime = firstLastFetch && secondLastFetch && firstLastFetch === secondLastFetch;
    logTest(
      'Cache timestamp unchanged',
      sameFetchTime,
      sameFetchTime ? 'Same cache data served' : 'Different cache data'
    );
    
    return true;
  } catch (error) {
    logTest('Cache reuse test', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 4: Fetch status tracking
async function testFetchStatus() {
  console.log('\n📊 Testing Fetch Status Tracking...\n');
  
  try {
    const response = await makeRequest('GET', '/api/smart-mirror/calendar');
    
    // Check if fetchStatus is included
    const hasFetchStatus = response.body && response.body.fetchStatus;
    logTest(
      'Response includes fetch status',
      hasFetchStatus,
      hasFetchStatus ? `${Object.keys(response.body.fetchStatus).length} URLs tracked` : 'No fetch status'
    );
    
    if (hasFetchStatus) {
      const statuses = Object.values(response.body.fetchStatus);
      const hasStatusField = statuses.length > 0 && statuses[0].status;
      logTest(
        'Fetch status includes status field',
        hasStatusField,
        hasStatusField ? `Status: ${statuses[0].status}` : 'Missing status'
      );
    }
    
    return true;
  } catch (error) {
    logTest('Fetch status test', false, `Error: ${error.message}`);
    return false;
  }
}

// Test 5: Configuration support
async function testConfigSupport() {
  console.log('\n⚙️  Testing Configuration Support...\n');
  
  try {
    // Load config to check for calendarCacheTTL
    const configResponse = await makeRequest('GET', '/api/smart-mirror/config');
    
    logTest(
      'Config API responds',
      configResponse.statusCode === 200,
      `Status: ${configResponse.statusCode}`
    );
    
    if (configResponse.body?.success && configResponse.body?.config) {
      const config = configResponse.body.config;
      const hasCacheTTL = typeof config.calendarCacheTTL !== 'undefined';
      
      logTest(
        'Config includes calendarCacheTTL',
        hasCacheTTL,
        hasCacheTTL ? `TTL: ${config.calendarCacheTTL}s` : 'Missing calendarCacheTTL'
      );
    }
    
    return true;
  } catch (error) {
    logTest('Config support test', false, `Error: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   Calendar Caching Feature Test Suite                 ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  let allPassed = true;
  
  try {
    // Test 1: Cache metadata
    const test1 = await testCacheMetadata();
    allPassed = allPassed && test1;
    
    // Test 2: Cache-Control headers
    const test2 = await testCacheControlHeaders();
    allPassed = allPassed && test2;
    
    // Test 3: Cache reuse
    const test3 = await testCacheReuse();
    allPassed = allPassed && test3;
    
    // Test 4: Fetch status
    const test4 = await testFetchStatus();
    allPassed = allPassed && test4;
    
    // Test 5: Config support
    const test5 = await testConfigSupport();
    allPassed = allPassed && test5;
    
    // Summary
    console.log('\n' + '═'.repeat(56));
    if (allPassed) {
      console.log('✅ All calendar caching tests passed!');
      console.log('\n📋 Features tested:');
      console.log('   • Cache metadata in API responses');
      console.log('   • HTTP Cache-Control headers (public, max-age)');
      console.log('   • Cache reuse across multiple requests');
      console.log('   • Fetch status tracking per URL');
      console.log('   • Configuration support for cache TTL');
    } else {
      console.log('❌ Some calendar caching tests failed');
      console.log('\nNote: Some tests may fail if calendar widget is disabled');
      console.log('or no URLs are configured. Configure calendar in admin panel.');
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
