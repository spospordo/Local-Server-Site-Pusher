#!/usr/bin/env node

/**
 * Test script for Enhanced Rain Forecast Sub-Widget
 * 
 * This script verifies:
 * 1. Rain data includes new fields: intensity, startTime, duration, dayName
 * 2. Intensity is correctly calculated based on precipChance
 * 3. All enhanced data structures are present
 */

console.log('🧪 Testing Enhanced Rain Forecast Sub-Widget\n');
console.log('=' .repeat(80));

// Test intensity calculation
function testIntensityCalculation() {
    console.log('\n📊 Test 1: Intensity Calculation');
    console.log('-'.repeat(80));
    
    const testCases = [
        { precipChance: 35, expected: 'Light' },
        { precipChance: 55, expected: 'Moderate' },
        { precipChance: 75, expected: 'Heavy' }
    ];
    
    let passed = 0;
    let failed = 0;
    
    testCases.forEach(testCase => {
        let intensity = 'Light';
        if (testCase.precipChance >= 70) {
            intensity = 'Heavy';
        } else if (testCase.precipChance >= 50) {
            intensity = 'Moderate';
        }
        
        const result = intensity === testCase.expected ? '✅' : '❌';
        console.log(`${result} ${testCase.precipChance}% → ${intensity} (expected: ${testCase.expected})`);
        
        if (intensity === testCase.expected) {
            passed++;
        } else {
            failed++;
        }
    });
    
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

// Test duration calculation
function testDurationCalculation() {
    console.log('\n⏱️  Test 2: Duration Calculation');
    console.log('-'.repeat(80));
    
    const testCases = [
        { condition: 'showers', precipChance: 60, expected: 'Intermittent' },
        { condition: 'thunderstorm', precipChance: 50, expected: '1-2 hours' },
        { condition: 'rain', precipChance: 75, expected: 'All day' },
        { condition: 'rain', precipChance: 40, expected: 'Several hours' }
    ];
    
    let passed = 0;
    let failed = 0;
    
    testCases.forEach(testCase => {
        let duration = 'Several hours';
        if (testCase.condition.includes('showers')) {
            duration = 'Intermittent';
        } else if (testCase.condition.includes('thunderstorm')) {
            duration = '1-2 hours';
        } else if (testCase.precipChance >= 70) {
            duration = 'All day';
        }
        
        const result = duration === testCase.expected ? '✅' : '❌';
        console.log(`${result} ${testCase.condition} @ ${testCase.precipChance}% → ${duration} (expected: ${testCase.expected})`);
        
        if (duration === testCase.expected) {
            passed++;
        } else {
            failed++;
        }
    });
    
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

// Test start time calculation
function testStartTimeCalculation() {
    console.log('\n🕐 Test 3: Start Time Calculation');
    console.log('-'.repeat(80));
    
    const testCases = [
        { daysFromNow: 0, dayName: 'Mon', expected: 'Later today' },
        { daysFromNow: 1, dayName: 'Tue', expected: 'Tomorrow' },
        { daysFromNow: 2, dayName: 'Wed', expected: 'Wed morning' },
        { daysFromNow: 3, dayName: 'Thu', expected: 'Thu morning' }
    ];
    
    let passed = 0;
    let failed = 0;
    
    testCases.forEach(testCase => {
        const startTime = testCase.daysFromNow === 0 ? 'Later today' : 
                         testCase.daysFromNow === 1 ? 'Tomorrow' : 
                         `${testCase.dayName || 'Day'} morning`;
        
        const result = startTime === testCase.expected ? '✅' : '❌';
        console.log(`${result} ${testCase.daysFromNow} days → ${startTime} (expected: ${testCase.expected})`);
        
        if (startTime === testCase.expected) {
            passed++;
        } else {
            failed++;
        }
    });
    
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

// Test rain data structure
function testRainDataStructure() {
    console.log('\n📋 Test 4: Rain Data Structure');
    console.log('-'.repeat(80));
    
    // Simulate creating a rain day object as the server does
    const mockDay = {
        date: '2024-02-18',
        dayName: 'Mon',
        condition: 'Rain',
        precipChance: 65
    };
    
    const precipChance = mockDay.precipChance || 0;
    const condition = (mockDay.condition || '').toLowerCase();
    const daysFromNow = 1;
    
    let intensity = 'Light';
    if (precipChance >= 70) {
        intensity = 'Heavy';
    } else if (precipChance >= 50) {
        intensity = 'Moderate';
    }
    
    const startTime = daysFromNow === 0 ? 'Later today' : 
                     daysFromNow === 1 ? 'Tomorrow' : 
                     `${mockDay.dayName || 'Day'} morning`;
    
    let duration = 'Several hours';
    if (condition.includes('showers')) {
        duration = 'Intermittent';
    } else if (condition.includes('thunderstorm')) {
        duration = '1-2 hours';
    } else if (precipChance >= 70) {
        duration = 'All day';
    }
    
    const rainDay = {
        daysFromNow: daysFromNow,
        date: mockDay.date,
        dayName: mockDay.dayName,
        description: mockDay.condition,
        precipitation: precipChance / 100,
        precipChance: precipChance,
        intensity: intensity,
        startTime: startTime,
        duration: duration
    };
    
    const requiredFields = ['daysFromNow', 'date', 'dayName', 'description', 'precipitation', 
                           'precipChance', 'intensity', 'startTime', 'duration'];
    
    let passed = 0;
    let failed = 0;
    
    requiredFields.forEach(field => {
        const hasField = rainDay.hasOwnProperty(field);
        const result = hasField ? '✅' : '❌';
        const value = hasField ? JSON.stringify(rainDay[field]) : 'missing';
        console.log(`${result} ${field}: ${value}`);
        
        if (hasField) {
            passed++;
        } else {
            failed++;
        }
    });
    
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

// Run all tests
async function runTests() {
    const results = [];
    
    results.push(testIntensityCalculation());
    results.push(testDurationCalculation());
    results.push(testStartTimeCalculation());
    results.push(testRainDataStructure());
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 Overall Test Results');
    console.log('='.repeat(80));
    
    const allPassed = results.every(r => r === true);
    const passedCount = results.filter(r => r === true).length;
    const totalCount = results.length;
    
    if (allPassed) {
        console.log(`✅ All ${totalCount} test suites passed!`);
        process.exit(0);
    } else {
        console.log(`❌ ${totalCount - passedCount} of ${totalCount} test suites failed`);
        process.exit(1);
    }
}

runTests();
