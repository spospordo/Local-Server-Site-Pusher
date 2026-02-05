#!/usr/bin/env node

/**
 * Test script for flight validation, deletion, and tracked flights fixes
 * Tests the fixes made for:
 * 1. Flight validation bypass for admin actions
 * 2. Flight deletion functionality
 * 3. Enhanced tracked flights display with cached data
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n[Step ${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
    log(`  ✅ ${message}`, 'green');
}

function logError(message) {
    log(`  ❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`  ⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`  ℹ️  ${message}`, 'blue');
}

async function testFlightValidationDeletionFixes() {
    log('\n╔════════════════════════════════════════════════════════════╗', 'magenta');
    log('║  Testing Flight Validation, Deletion & Tracking Fixes     ║', 'magenta');
    log('╚════════════════════════════════════════════════════════════╝\n', 'magenta');
    
    let passedTests = 0;
    let failedTests = 0;
    
    try {
        // Test 1: Verify aviationstack.js has bypassLimit parameter
        logStep(1, 'Checking aviationstack.js for bypassLimit parameter');
        
        const aviationstackPath = path.join(__dirname, '..', 'modules', 'aviationstack.js');
        if (fs.existsSync(aviationstackPath)) {
            const aviationstackContent = fs.readFileSync(aviationstackPath, 'utf8');
            
            // Check validateFlight function
            if (aviationstackContent.includes('async function validateFlight(apiKey, flightIata, flightDate, bypassLimit = false)')) {
                logSuccess('validateFlight() has bypassLimit parameter');
                passedTests++;
            } else {
                logError('validateFlight() missing bypassLimit parameter');
                failedTests++;
            }
            
            // Check getFlightStatus function
            if (aviationstackContent.includes('async function getFlightStatus(apiKey, flightIata, flightDate, bypassLimit = false)')) {
                logSuccess('getFlightStatus() has bypassLimit parameter');
                passedTests++;
            } else {
                logError('getFlightStatus() missing bypassLimit parameter');
                failedTests++;
            }
            
            // Check bypass logic in validateFlight
            if (aviationstackContent.includes('if (!bypassLimit && isLimitReached())')) {
                logSuccess('validateFlight() correctly uses bypassLimit in limit check');
                passedTests++;
            } else {
                logError('validateFlight() limit check does not use bypassLimit');
                failedTests++;
            }
            
            // Check bypass logic in getFlightStatus
            const getFlightStatusMatch = aviationstackContent.match(/async function getFlightStatus[\s\S]*?(?=async function|module\.exports)/);
            if (getFlightStatusMatch && getFlightStatusMatch[0].includes('if (!bypassLimit && isLimitReached())')) {
                logSuccess('getFlightStatus() correctly uses bypassLimit in limit check');
                passedTests++;
            } else {
                logError('getFlightStatus() limit check does not use bypassLimit');
                failedTests++;
            }
        } else {
            logError('aviationstack.js not found');
            failedTests += 4;
        }
        
        // Test 2: Verify server.js passes bypassLimit=true for admin validation
        logStep(2, 'Checking server.js admin validation endpoint');
        
        const serverPath = path.join(__dirname, '..', 'server.js');
        if (fs.existsSync(serverPath)) {
            const serverContent = fs.readFileSync(serverPath, 'utf8');
            
            // Check if admin validation passes true as the last parameter
            if (serverContent.includes('aviationstack.validateFlight(apiKey, flightNumber, date, true)')) {
                logSuccess('Admin validation endpoint passes bypassLimit: true');
                passedTests++;
            } else {
                logError('Admin validation endpoint does not pass bypassLimit parameter');
                logInfo('Looking for: aviationstack.validateFlight(apiKey, flightNumber, date, true)');
                failedTests++;
            }
        } else {
            logError('server.js not found');
            failedTests++;
        }
        
        // Test 3: Verify dashboard.html flight deletion fix
        logStep(3, 'Checking dashboard.html for flight deletion fix');
        
        const dashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
        if (fs.existsSync(dashboardPath)) {
            const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
            
            // Check removeFlight function
            const removeFlightMatch = dashboardContent.match(/function removeFlight\(flightId\)\s*\{[\s\S]*?\}/);
            if (removeFlightMatch) {
                const removeFlightCode = removeFlightMatch[0];
                
                // Check if it uses getElementById(flightId) directly (correct)
                if (removeFlightCode.includes('document.getElementById(flightId)')) {
                    logSuccess('removeFlight() correctly uses flightId directly (no double prefix)');
                    passedTests++;
                } else if (removeFlightCode.includes('document.getElementById(`flight-${flightId}`)')) {
                    logError('removeFlight() still has incorrect double-prefix bug');
                    failedTests++;
                } else {
                    logWarning('removeFlight() implementation unclear');
                    failedTests++;
                }
            } else {
                logError('removeFlight() function not found');
                failedTests++;
            }
            
            // Check validateFlight function
            const validateFlightMatch = dashboardContent.match(/async function validateFlight\(flightId\)\s*\{[\s\S]*?const flightDiv[\s\S]*?;/);
            if (validateFlightMatch) {
                const validateFlightCode = validateFlightMatch[0];
                
                // Check if it uses getElementById(flightId) directly (correct)
                if (validateFlightCode.includes('document.getElementById(flightId)')) {
                    logSuccess('validateFlight() correctly uses flightId directly (no double prefix)');
                    passedTests++;
                } else if (validateFlightCode.includes('document.getElementById(`flight-${flightId}`)')) {
                    logError('validateFlight() still has incorrect double-prefix bug');
                    failedTests++;
                } else {
                    logWarning('validateFlight() implementation unclear');
                    failedTests++;
                }
            } else {
                logError('validateFlight() function not found');
                failedTests++;
            }
        } else {
            logError('dashboard.html not found');
            failedTests += 2;
        }
        
        // Test 4: Verify tracked flights endpoint enhancement
        logStep(4, 'Checking server.js tracked flights endpoint enhancement');
        
        if (fs.existsSync(serverPath)) {
            const serverContent = fs.readFileSync(serverPath, 'utf8');
            
            // Check if endpoint enhances flights with cached data
            if (serverContent.includes('flightScheduler.getCachedFlightData')) {
                logSuccess('Tracked flights endpoint retrieves cached flight data');
                passedTests++;
            } else {
                logError('Tracked flights endpoint does not retrieve cached data');
                failedTests++;
            }
            
            if (serverContent.includes('enhancedFlights') && serverContent.includes('cachedData')) {
                logSuccess('Tracked flights endpoint includes cached data in response');
                passedTests++;
            } else {
                logError('Tracked flights endpoint does not include cached data');
                failedTests++;
            }
        } else {
            logError('server.js not found');
            failedTests += 2;
        }
        
        // Test 5: Verify frontend displays cached flight data
        logStep(5, 'Checking dashboard.html for enhanced flight data display');
        
        if (fs.existsSync(dashboardPath)) {
            const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
            
            // Find viewTrackedFlights function
            const viewTrackedFlightsMatch = dashboardContent.match(/async function viewTrackedFlights\(\)[\s\S]*?(?=async function|function [a-zA-Z]|<\/script>)/);
            if (viewTrackedFlightsMatch) {
                const viewCode = viewTrackedFlightsMatch[0];
                
                // Check if it displays cached data
                if (viewCode.includes('hasCachedData') || viewCode.includes('cachedData')) {
                    logSuccess('viewTrackedFlights() checks for cached data');
                    passedTests++;
                } else {
                    logError('viewTrackedFlights() does not check cached data');
                    failedTests++;
                }
                
                if (viewCode.includes('flight.cachedData') && 
                    (viewCode.includes('cached.airline') || viewCode.includes('cached.status'))) {
                    logSuccess('viewTrackedFlights() displays detailed cached flight information');
                    passedTests++;
                } else {
                    logError('viewTrackedFlights() does not display cached flight details');
                    failedTests++;
                }
                
                if (viewCode.includes('No cached data available yet')) {
                    logSuccess('viewTrackedFlights() shows appropriate message when no data cached');
                    passedTests++;
                } else {
                    logWarning('viewTrackedFlights() may not handle missing cached data gracefully');
                    failedTests++;
                }
            } else {
                logError('viewTrackedFlights() function not found');
                failedTests += 3;
            }
        } else {
            logError('dashboard.html not found');
            failedTests += 3;
        }
        
        // Test 6: Verify documentation updates
        logStep(6, 'Checking documentation updates');
        
        const docPath = path.join(__dirname, '..', 'AVIATIONSTACK_INTEGRATION.md');
        if (fs.existsSync(docPath)) {
            const docContent = fs.readFileSync(docPath, 'utf8');
            
            // Check for admin bypass documentation
            if (docContent.includes('Admin Action Bypass') || docContent.includes('bypass')) {
                logSuccess('Documentation includes admin action bypass information');
                passedTests++;
            } else {
                logWarning('Documentation may be missing admin bypass information');
                failedTests++;
            }
            
            // Check for tracked flights display documentation
            if (docContent.includes('cached flight data') || docContent.includes('Displays cached flight data')) {
                logSuccess('Documentation describes enhanced tracked flights display');
                passedTests++;
            } else {
                logWarning('Documentation may be missing tracked flights display info');
                failedTests++;
            }
        } else {
            logWarning('AVIATIONSTACK_INTEGRATION.md not found');
            failedTests += 2;
        }
        
        // Summary
        log('\n' + '═'.repeat(60), 'magenta');
        log('Test Summary', 'magenta');
        log('═'.repeat(60) + '\n', 'magenta');
        
        const totalTests = passedTests + failedTests;
        const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
        
        log(`Total Tests: ${totalTests}`, 'cyan');
        log(`Passed: ${passedTests}`, 'green');
        log(`Failed: ${failedTests}`, 'red');
        log(`Pass Rate: ${passRate}%\n`, passRate === 100 ? 'green' : passRate >= 80 ? 'yellow' : 'red');
        
        if (failedTests === 0) {
            log('🎉 All tests passed! Flight validation, deletion, and tracking fixes are working correctly.\n', 'green');
        } else {
            log('⚠️  Some tests failed. Please review the errors above.\n', 'yellow');
        }
        
        // Additional information
        log('Key Changes Implemented:', 'cyan');
        log('  1. Admin flight validation now bypasses rate limits', 'reset');
        log('  2. Flight deletion correctly removes flights from UI', 'reset');
        log('  3. Tracked flights display now shows cached flight data', 'reset');
        log('  4. Admin actions count toward API quota but are never blocked', 'reset');
        log('  5. Documentation updated with new behavior\n', 'reset');
        
        return failedTests === 0 ? 0 : 1;
        
    } catch (error) {
        logError(`Test execution failed: ${error.message}`);
        console.error(error);
        return 1;
    }
}

// Run tests
testFlightValidationDeletionFixes()
    .then(exitCode => {
        process.exit(exitCode);
    })
    .catch(err => {
        logError(`Fatal error: ${err.message}`);
        process.exit(1);
    });
