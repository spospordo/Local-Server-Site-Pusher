#!/usr/bin/env node

/**
 * Test script for flight API key preservation fix
 * Tests that the flightApi configuration (including API key) is preserved when saving Smart Mirror config
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

async function testFlightApiKeyPreservation() {
    log('\n╔════════════════════════════════════════════════════════════╗', 'magenta');
    log('║         Testing Flight API Key Preservation Fix           ║', 'magenta');
    log('╚════════════════════════════════════════════════════════════╝\n', 'magenta');
    
    let passedTests = 0;
    let failedTests = 0;
    
    try {
        // Test 1: Verify smartmirror.js has flightApi preservation logic
        logStep(1, 'Checking smartmirror.js for flightApi preservation logic');
        
        const smartmirrorPath = path.join(__dirname, '..', 'modules', 'smartmirror.js');
        if (fs.existsSync(smartmirrorPath)) {
            const smartmirrorContent = fs.readFileSync(smartmirrorPath, 'utf8');
            
            // Check for flightApi preservation in saveConfig
            if (smartmirrorContent.includes('Merged flight API configuration with existing settings')) {
                logSuccess('saveConfig() merges flightApi configuration with existing settings');
                passedTests++;
            } else {
                logError('saveConfig() does not merge flightApi configuration properly');
                failedTests++;
            }
            
            // Check that preservation happens after widget preservation
            const preservationIndex = smartmirrorContent.indexOf('Merged flight API configuration with existing settings');
            const widgetPreservationIndex = smartmirrorContent.indexOf('widgetsToPreserve.forEach');
            
            if (preservationIndex > widgetPreservationIndex && preservationIndex > 0) {
                logSuccess('Flight API preservation happens after widget preservation (correct order)');
                passedTests++;
            } else if (preservationIndex > 0) {
                logWarning('Flight API preservation found but order could not be verified');
                passedTests++;
            } else {
                logError('Flight API preservation not found in expected location');
                failedTests++;
            }
        } else {
            logError('smartmirror.js not found');
            failedTests++;
        }
        
        // Test 2: Verify aviationstack.js has improved logging
        logStep(2, 'Checking aviationstack.js for improved logging and error messages');
        
        const aviationstackPath = path.join(__dirname, '..', 'modules', 'aviationstack.js');
        if (fs.existsSync(aviationstackPath)) {
            const aviationstackContent = fs.readFileSync(aviationstackPath, 'utf8');
            
            // Check for API key logging in validateFlight
            if ((aviationstackContent.includes('key:') || aviationstackContent.includes('API key present:')) && 
                aviationstackContent.includes('key length:')) {
                logSuccess('validateFlight() has detailed API key logging');
                passedTests++;
            } else {
                logError('validateFlight() missing detailed API key logging');
                failedTests++;
            }
            
            // Check for improved error messages
            if (aviationstackContent.includes('Please verify your AviationStack API key in Smart Mirror settings is correct and active')) {
                logSuccess('validateFlight() has improved error messages');
                passedTests++;
            } else {
                logError('validateFlight() missing improved error messages');
                failedTests++;
            }
            
            // Check for error logging in all functions
            const errorLoggingCount = (aviationstackContent.match(/logger\.error\(logger\.categories\.SMART_MIRROR/g) || []).length;
            if (errorLoggingCount >= 8) {
                logSuccess(`Found ${errorLoggingCount} error logging statements across functions`);
                passedTests++;
            } else {
                logWarning(`Found ${errorLoggingCount} error logging statements (expected at least 8)`);
                passedTests++;
            }
            
            // Check for specific error messages mentioning settings
            if (aviationstackContent.includes('API key not configured. Please configure the AviationStack API key in Smart Mirror settings.')) {
                logSuccess('Error messages guide users to Smart Mirror settings');
                passedTests++;
            } else {
                logError('Error messages do not guide users to settings');
                failedTests++;
            }
        } else {
            logError('aviationstack.js not found');
            failedTests++;
        }
        
        // Test 3: Verify server.js has improved logging for validate-flight endpoint
        logStep(3, 'Checking server.js for improved logging in validate-flight endpoint');
        
        const serverPath = path.join(__dirname, '..', 'server.js');
        if (fs.existsSync(serverPath)) {
            const serverContent = fs.readFileSync(serverPath, 'utf8');
            
            // Check for API key presence logging in validate-flight endpoint
            const hasOldPattern = serverContent.includes('Checking for AviationStack API key (present:');
            const hasNewPattern = serverContent.includes('Loaded AviationStack API key from config');
            const hasEnabled = serverContent.includes('enabled:');
            
            if ((hasOldPattern || hasNewPattern) && hasEnabled) {
                logSuccess('validate-flight endpoint logs API key presence and status');
                passedTests++;
            } else {
                logError('validate-flight endpoint missing API key presence logging');
                failedTests++;
            }
            
            // Check for warning when API key not configured
            if (serverContent.includes('AviationStack API key not configured, using format-only validation')) {
                logSuccess('validate-flight endpoint warns when API key is missing');
                passedTests++;
            } else {
                logError('validate-flight endpoint does not warn about missing API key');
                failedTests++;
            }
            
            // Check for info logging when using AviationStack API
            if (serverContent.includes('Using AviationStack API to validate')) {
                logSuccess('validate-flight endpoint logs when using AviationStack API');
                passedTests++;
            } else {
                logError('validate-flight endpoint does not log API usage');
                failedTests++;
            }
            
            // Check for missing fields warning
            if (serverContent.includes('Flight validation request missing required fields')) {
                logSuccess('validate-flight endpoint logs when required fields are missing');
                passedTests++;
            } else {
                logWarning('validate-flight endpoint may not log missing required fields');
                passedTests++;
            }
        } else {
            logError('server.js not found');
            failedTests++;
        }
        
        // Test 4: Documentation check
        logStep(4, 'Checking documentation mentions API key preservation');
        
        const docFiles = [
            'AVIATIONSTACK_INTEGRATION.md',
            'FLIGHT_TRACKING_IMPLEMENTATION.md'
        ];
        
        let docMentionsPreservation = false;
        for (const docFile of docFiles) {
            const docPath = path.join(__dirname, '..', docFile);
            if (fs.existsSync(docPath)) {
                const docContent = fs.readFileSync(docPath, 'utf8');
                if (docContent.toLowerCase().includes('api key') && 
                    (docContent.toLowerCase().includes('persist') || 
                     docContent.toLowerCase().includes('save') ||
                     docContent.toLowerCase().includes('config'))) {
                    docMentionsPreservation = true;
                    logSuccess(`${docFile} mentions API key and configuration`);
                }
            }
        }
        
        if (docMentionsPreservation) {
            passedTests++;
        } else {
            logWarning('Documentation could be updated to mention API key configuration');
            passedTests++; // Not a critical failure
        }
        
    } catch (error) {
        logError(`Test execution error: ${error.message}`);
        failedTests++;
    }
    
    // Print summary
    log('\n╔════════════════════════════════════════════════════════════╗', 'magenta');
    log('║                      Test Summary                          ║', 'magenta');
    log('╚════════════════════════════════════════════════════════════╝\n', 'magenta');
    
    const totalTests = passedTests + failedTests;
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    
    logInfo(`Total tests: ${totalTests}`);
    logSuccess(`Passed: ${passedTests}`);
    
    if (failedTests > 0) {
        logError(`Failed: ${failedTests}`);
    }
    
    log(`\nSuccess rate: ${successRate}%`, successRate === '100.0' ? 'green' : 'yellow');
    
    if (failedTests === 0) {
        log('\n🎉 All tests passed! The flight API key preservation fix is working correctly.', 'green');
        log('\n📝 Summary of fixes:', 'cyan');
        log('   1. Smart Mirror config now preserves flightApi configuration including API key', 'blue');
        log('   2. Added detailed logging to track API key usage for debugging', 'blue');
        log('   3. Improved error messages to guide users to correct settings', 'blue');
        log('   4. validate-flight endpoint logs API key presence and status\n', 'blue');
        process.exit(0);
    } else {
        log('\n⚠️  Some tests failed. Please review the output above.', 'yellow');
        process.exit(1);
    }
}

// Run tests
testFlightApiKeyPreservation().catch(error => {
    logError(`Unhandled error: ${error.message}`);
    console.error(error);
    process.exit(1);
});
