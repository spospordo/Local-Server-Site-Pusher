#!/usr/bin/env node

/**
 * Simple test to verify clock widget additionalTimezones fix
 * Tests that the additionalTimezones field is included in the public config API
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      timeout: 10000
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(body)
          });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function checkServer() {
  try {
    await makeRequest('GET', '/');
    return true;
  } catch (error) {
    console.log('❌ Server is not running. Please start it with: npm start');
    return false;
  }
}

async function testAdditionalTimezonesFix() {
  console.log('\n🔍 Testing Clock Widget Additional Timezones Fix\n');
  
  try {
    const result = await makeRequest('GET', '/api/smart-mirror/config');
    
    if (result.statusCode !== 200 || !result.body?.success) {
      console.log('❌ Config API request failed');
      return false;
    }
    
    const config = result.body.config;
    
    // Check if clock widget exists
    if (!config.widgets?.clock) {
      console.log('❌ Clock widget not found in config');
      return false;
    }
    
    console.log('✅ Clock widget found in config');
    
    // The key fix: check if additionalTimezones is present
    if ('additionalTimezones' in config.widgets.clock) {
      console.log('✅ SUCCESS: additionalTimezones field is present in public API');
      
      const timezones = config.widgets.clock.additionalTimezones;
      if (Array.isArray(timezones) && timezones.length > 0) {
        console.log(`\n📍 Additional timezones configured (${timezones.length}):`);
        timezones.forEach(tz => {
          console.log(`   • ${tz.city}: ${tz.timezone}`);
        });
      } else {
        console.log('\n ℹ️  No additional timezones currently configured (but field is available)');
      }
      
      console.log('\n✅ Fix verified: The server now includes additionalTimezones in public config');
      return true;
    } else {
      console.log('❌ FAILED: additionalTimezones field not found in public config');
      console.log('   The fix in modules/smartmirror.js may not be working correctly');
      return false;
    }
  } catch (error) {
    console.log('❌ Error during test:', error.message);
    return false;
  }
}

(async () => {
  if (await checkServer()) {
    const success = await testAdditionalTimezonesFix();
    process.exit(success ? 0 : 1);
  } else {
    process.exit(1);
  }
})();
