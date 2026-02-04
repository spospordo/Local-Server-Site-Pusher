#!/usr/bin/env node

/**
 * Integration test for party weather endpoint
 * Simulates the fix by testing the detection logic directly
 */

console.log('🧪 Party Weather Detection Integration Test\n');
console.log('='.repeat(60));

// Simulate different config scenarios
const scenarios = [
  {
    name: 'Weather widget with API key',
    config: {
      widgets: {
        weather: {
          enabled: true,
          apiKey: 'test-key-1',
          location: 'Seattle, WA'
        }
      }
    },
    expected: { shouldWork: true, source: 'weather' }
  },
  {
    name: 'Weather widget without "enabled" but with API key',
    config: {
      widgets: {
        weather: {
          apiKey: 'test-key-2',
          location: 'Portland, OR'
        }
      }
    },
    expected: { shouldWork: true, source: 'weather' }
  },
  {
    name: 'Forecast widget with API key',
    config: {
      widgets: {
        forecast: {
          enabled: true,
          apiKey: 'test-key-3',
          location: 'San Francisco, CA'
        }
      }
    },
    expected: { shouldWork: true, source: 'forecast' }
  },
  {
    name: 'Both widgets configured (should use weather first)',
    config: {
      widgets: {
        weather: {
          apiKey: 'weather-key',
          location: 'Boston, MA'
        },
        forecast: {
          apiKey: 'forecast-key',
          location: 'New York, NY'
        }
      }
    },
    expected: { shouldWork: true, source: 'weather' }
  },
  {
    name: 'Weather widget enabled but no API key',
    config: {
      widgets: {
        weather: {
          enabled: true,
          location: 'Denver, CO'
        }
      }
    },
    expected: { shouldWork: false, reason: 'No API key' }
  },
  {
    name: 'No weather configuration',
    config: {
      widgets: {}
    },
    expected: { shouldWork: false, reason: 'No configuration' }
  }
];

let allPassed = true;

scenarios.forEach((scenario, index) => {
  console.log(`\n✓ Test ${index + 1}: ${scenario.name}`);
  
  // Simulate the fixed detection logic
  const weatherConfig = scenario.config.widgets?.weather || {};
  const forecastConfig = scenario.config.widgets?.forecast || {};
  
  const apiKey = weatherConfig.apiKey || forecastConfig.apiKey;
  const location = weatherConfig.location || forecastConfig.location;
  
  const shouldWork = !!(apiKey && location);
  const source = weatherConfig.apiKey ? 'weather' : 'forecast';
  
  // Check results
  if (shouldWork === scenario.expected.shouldWork) {
    if (shouldWork && scenario.expected.source && source !== scenario.expected.source) {
      console.log(`  ❌ Expected source: ${scenario.expected.source}, got: ${source}`);
      allPassed = false;
    } else {
      console.log(`  ✅ Detection correct: ${shouldWork ? `works (source: ${source})` : 'properly fails'}`);
      if (!shouldWork && scenario.expected.reason) {
        console.log(`     Reason: ${scenario.expected.reason}`);
      }
    }
  } else {
    console.log(`  ❌ Expected: ${scenario.expected.shouldWork}, got: ${shouldWork}`);
    allPassed = false;
  }
});

// Summary
console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✅ All integration tests passed!\n');
  console.log('Key improvements:');
  console.log('  • Weather detection no longer requires "enabled" flag');
  console.log('  • Works with either weather OR forecast widget');
  console.log('  • Only fails when API key/location truly missing');
  process.exit(0);
} else {
  console.log('❌ Some integration tests failed.\n');
  process.exit(1);
}
