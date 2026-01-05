#!/usr/bin/env node

/**
 * Test script to verify the uptime formatting function
 * Tests various uptime values to ensure correct day/hour/minute formatting
 */

// Format uptime as days/hours/minutes
function formatUptime(uptimeInSeconds) {
    const days = Math.floor(uptimeInSeconds / 86400);
    const hours = Math.floor((uptimeInSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

// Test cases
const tests = [
    { input: 0, expected: '0d 0h 0m', description: 'Zero uptime' },
    { input: 30, expected: '0d 0h 0m', description: '30 seconds (0 minutes)' },
    { input: 60, expected: '0d 0h 1m', description: '1 minute' },
    { input: 120, expected: '0d 0h 2m', description: '2 minutes' },
    { input: 3600, expected: '0d 1h 0m', description: '1 hour' },
    { input: 3660, expected: '0d 1h 1m', description: '1 hour 1 minute' },
    { input: 7200, expected: '0d 2h 0m', description: '2 hours' },
    { input: 86400, expected: '1d 0h 0m', description: '1 day' },
    { input: 90000, expected: '1d 1h 0m', description: '1 day 1 hour' },
    { input: 90061, expected: '1d 1h 1m', description: '1 day 1 hour 1 minute' },
    { input: 172800, expected: '2d 0h 0m', description: '2 days' },
    { input: 259200, expected: '3d 0h 0m', description: '3 days' },
    { input: 604800, expected: '7d 0h 0m', description: '1 week' },
    { input: 2592000, expected: '30d 0h 0m', description: '30 days' },
    { input: 267845, expected: '3d 2h 24m', description: 'Complex time: 3 days 2 hours 24 minutes' },
];

console.log('🧪 Testing uptime formatting function...\n');

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
    const result = formatUptime(test.input);
    const status = result === test.expected ? '✅' : '❌';
    
    if (result === test.expected) {
        passed++;
        console.log(`${status} Test ${index + 1}: ${test.description}`);
        console.log(`   Input: ${test.input}s → Output: ${result}\n`);
    } else {
        failed++;
        console.log(`${status} Test ${index + 1}: ${test.description}`);
        console.log(`   Input: ${test.input}s`);
        console.log(`   Expected: ${test.expected}`);
        console.log(`   Got: ${result}\n`);
    }
});

console.log(`\n${'='.repeat(50)}`);
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

if (failed > 0) {
    console.error('❌ Some tests failed!');
    process.exit(1);
} else {
    console.log('✅ All tests passed!');
    process.exit(0);
}
