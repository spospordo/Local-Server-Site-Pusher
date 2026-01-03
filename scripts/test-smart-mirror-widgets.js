#!/usr/bin/env node

/**
 * Test script for Smart Mirror Widget Enhancement
 * Tests calendar, news, weather, and forecast API endpoints
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 15000;

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

// Test functions
async function testConfigEndpoint() {
  console.log('\n🧪 Test 1: Smart Mirror config endpoint');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode === 200 && result.body?.success) {
      const config = result.body.config;
      console.log('✅ Config endpoint working');
      console.log('   - Dashboard enabled:', config.enabled);
      console.log('   - Widgets:', Object.keys(config.widgets || {}).join(', '));
      
      // Check for forecast widget
      if (config.widgets?.forecast) {
        console.log('   - Forecast widget found ✓');
      } else {
        console.log('   - ⚠️  Forecast widget not in config');
      }
      
      // Verify no API keys exposed
      const configStr = JSON.stringify(config);
      if (configStr.includes('apiKey') && config.widgets?.weather?.apiKey) {
        console.log('   - ❌ API keys are exposed in public config!');
        return false;
      } else {
        console.log('   - ✓ API keys properly sanitized');
      }
      
      return true;
    } else {
      console.log('❌ Config endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testCalendarEndpoint() {
  console.log('\n🧪 Test 2: Calendar data endpoint');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/calendar');
    
    if (result.statusCode === 200 && result.body) {
      console.log('✅ Calendar endpoint responding');
      
      if (result.body.success) {
        console.log('   - Events found:', result.body.events?.length || 0);
        if (result.body.events && result.body.events.length > 0) {
          const event = result.body.events[0];
          console.log('   - Sample event:', event.title);
          console.log('   - Event date:', new Date(event.start).toLocaleDateString());
        }
      } else {
        console.log('   - No calendar configured or error:', result.body.error);
      }
      return true;
    } else {
      console.log('❌ Calendar endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testNewsEndpoint() {
  console.log('\n🧪 Test 3: News data endpoint');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/news');
    
    if (result.statusCode === 200 && result.body) {
      console.log('✅ News endpoint responding');
      
      if (result.body.success) {
        console.log('   - News items found:', result.body.items?.length || 0);
        if (result.body.items && result.body.items.length > 0) {
          const item = result.body.items[0];
          console.log('   - Sample headline:', item.title?.substring(0, 60) + '...');
          console.log('   - Source:', item.source);
        }
      } else {
        console.log('   - No news feeds configured or error:', result.body.error);
      }
      return true;
    } else {
      console.log('❌ News endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testWeatherEndpoint() {
  console.log('\n🧪 Test 4: Weather data endpoint');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/weather');
    
    if (result.statusCode === 200 && result.body) {
      console.log('✅ Weather endpoint responding');
      
      if (result.body.success) {
        const weather = result.body.data;
        console.log('   - Location:', weather.location);
        console.log('   - Temperature:', weather.temp + '°' + (weather.units === 'imperial' ? 'F' : 'C'));
        console.log('   - Condition:', weather.condition);
        console.log('   - Humidity:', weather.humidity + '%');
        console.log('   - Wind:', weather.windSpeed + (weather.units === 'imperial' ? ' mph' : ' m/s'));
      } else {
        console.log('   - Weather not configured or error:', result.body.error);
      }
      return true;
    } else {
      console.log('❌ Weather endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testForecastEndpoint() {
  console.log('\n🧪 Test 5: Forecast data endpoint');
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/forecast');
    
    if (result.statusCode === 200 && result.body) {
      console.log('✅ Forecast endpoint responding');
      
      if (result.body.success) {
        console.log('   - Location:', result.body.location);
        console.log('   - Forecast days:', result.body.days?.length || 0);
        if (result.body.days && result.body.days.length > 0) {
          result.body.days.forEach(day => {
            console.log(`   - ${day.dayName}: ${day.tempHigh}°/${day.tempLow}° ${day.condition}`);
          });
        }
      } else {
        console.log('   - Forecast not configured or error:', result.body.error);
      }
      return true;
    } else {
      console.log('❌ Forecast endpoint failed');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

async function testDashboardPage() {
  console.log('\n🧪 Test 6: Dashboard page accessibility');
  try {
    const result = await makeRequest('GET', '/smart-mirror');
    
    if (result.statusCode === 200) {
      console.log('✅ Dashboard page accessible');
      
      // Check for key content
      const body = result.body;
      if (typeof body === 'string') {
        const hasTitle = body.includes('Smart Mirror Dashboard');
        const hasWeather = body.includes('weather');
        const hasForecast = body.includes('forecast');
        const hasCalendar = body.includes('calendar');
        const hasNews = body.includes('news');
        
        console.log('   - Page title:', hasTitle ? '✓' : '✗');
        console.log('   - Weather widget code:', hasWeather ? '✓' : '✗');
        console.log('   - Forecast widget code:', hasForecast ? '✓' : '✗');
        console.log('   - Calendar widget code:', hasCalendar ? '✓' : '✗');
        console.log('   - News widget code:', hasNews ? '✓' : '✗');
        
        return hasTitle && hasWeather && hasForecast && hasCalendar && hasNews;
      }
      return true;
    } else {
      console.log('❌ Dashboard page not accessible');
      return false;
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Smart Mirror Widget Enhancement Test Suite');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Testing server at:', BASE_URL);
  
  const results = {
    passed: 0,
    failed: 0,
    total: 6
  };
  
  // Run tests
  if (await testConfigEndpoint()) results.passed++; else results.failed++;
  if (await testCalendarEndpoint()) results.passed++; else results.failed++;
  if (await testNewsEndpoint()) results.passed++; else results.failed++;
  if (await testWeatherEndpoint()) results.passed++; else results.failed++;
  if (await testForecastEndpoint()) results.passed++; else results.failed++;
  if (await testDashboardPage()) results.passed++; else results.failed++;
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Test Results Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Tests: ${results.total}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (results.failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
    process.exit(1);
  }
}

// Check if server is running before starting tests
async function checkServer() {
  console.log('\nChecking if server is running...');
  try {
    await makeRequest('GET', '/');
    console.log('✅ Server is running\n');
    return true;
  } catch (error) {
    console.log('❌ Server is not running or not accessible');
    console.log('   Please start the server with: npm start');
    console.log('   Error:', error.message);
    return false;
  }
}

// Main execution
(async () => {
  if (await checkServer()) {
    await runTests();
  } else {
    process.exit(1);
  }
})();
