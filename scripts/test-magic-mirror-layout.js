#!/usr/bin/env node

/**
 * Magic Mirror Layout System Test Suite
 * Tests the area-based and grid-based widget placement and sizing functionality
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const HTML_PATH = path.join(__dirname, '..', 'public', 'magic-mirror.html');

let testsPassed = 0;
let testsFailed = 0;

function log(message, type = 'info') {
    const colors = {
        success: '\x1b[32m',
        error: '\x1b[31m',
        info: '\x1b[36m',
        warn: '\x1b[33m',
        reset: '\x1b[0m'
    };
    console.log(`${colors[type]}${message}${colors.reset}`);
}

function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsedBody = body ? JSON.parse(body) : {};
                    resolve({ statusCode: res.statusCode, body: parsedBody, rawBody: body });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: body, rawBody: body });
                }
            });
        });

        req.on('error', reject);
        if (data) req.write(JSON.stringify(data));
        req.end();
    });
}

async function test(name, testFn) {
    try {
        await testFn();
        log(`✅ ${name}`, 'success');
        testsPassed++;
    } catch (error) {
        log(`❌ ${name}: ${error.message}`, 'error');
        testsFailed++;
    }
}

async function runTests() {
    log('\n🧪 Magic Mirror Layout System Test Suite\n', 'info');

    // Test 1: HTML contains legacy 3x3 grid layout CSS
    await test('HTML contains legacy 3x3 grid layout CSS', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('grid-template-columns: repeat(3, 1fr)')) {
            throw new Error('Missing 3-column grid layout');
        }
        
        if (!htmlContent.includes('grid-template-areas')) {
            throw new Error('Missing grid template areas');
        }
        
        const areas = ['upper-left', 'upper-center', 'upper-right', 
                      'middle-left', 'middle-center', 'middle-right',
                      'bottom-left', 'bottom-center', 'bottom-right'];
        
        for (const area of areas) {
            if (!htmlContent.includes(`"${area}"`)) {
                throw new Error(`Missing area definition: ${area}`);
            }
        }
    });

    // Test 2: HTML contains flexible 12-column grid CSS
    await test('HTML contains flexible 12-column grid CSS', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('grid-template-columns: repeat(12, 1fr)')) {
            throw new Error('Missing 12-column flexible grid layout');
        }
        
        if (!htmlContent.includes('widget-grid-flexible')) {
            throw new Error('Missing widget-grid-flexible class');
        }
    });

    // Test 3: HTML contains widget size classes
    await test('HTML contains widget size classes', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('size-box')) {
            throw new Error('Missing size-box class definition');
        }
        
        if (!htmlContent.includes('size-bar')) {
            throw new Error('Missing size-bar class definition');
        }
    });

    // Test 4: HTML contains responsive layout
    await test('HTML contains responsive layout for portrait', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('@media (orientation: portrait)')) {
            throw new Error('Missing portrait orientation media query');
        }
    });

    // Test 5: HTML contains createWidgets function that handles grid positioning
    await test('HTML contains createWidgets function with grid support', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('function createWidgets()')) {
            throw new Error('Missing createWidgets function');
        }
        
        // Check for grid position handling
        if (!htmlContent.includes('gridPosition')) {
            throw new Error('createWidgets does not handle gridPosition');
        }
        
        // Check for flexible grid creation
        if (!htmlContent.includes('useFlexibleGrid')) {
            throw new Error('createWidgets does not handle flexible grid mode');
        }
    });

    // Test 6: HTML contains area-based placement for backward compatibility
    await test('HTML contains area-based placement for backward compatibility', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        // Check that code handles area property for widgets
        if (!htmlContent.includes('widgetConfig.area')) {
            throw new Error('Missing area configuration handling');
        }
    });

    // Test 7: Widget areas use flexbox for vertical stacking
    await test('Widget areas use flexbox for vertical stacking', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('display: flex')) {
            throw new Error('Widget areas missing flexbox display');
        }
        
        if (!htmlContent.includes('flex-direction: column')) {
            throw new Error('Widget areas missing column direction');
        }
    });

    // Test 8: Mobile responsive layout
    await test('Mobile layout adapts to smaller screens', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('@media (max-width: 768px)')) {
            throw new Error('Missing mobile media query');
        }
    });

    // Test 9: Widget grid has proper gap spacing
    await test('Widget grid has proper gap spacing', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('gap: 1rem') && !htmlContent.includes('gap: 1.5rem') && !htmlContent.includes('gap: 2rem')) {
            throw new Error('Widget grid missing gap property for spacing');
        }
    });

    // Test 10: Dynamic grid placement with col/row/span
    await test('Dynamic grid placement with CSS Grid properties', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        // Check for grid-column and grid-row assignment
        if (!htmlContent.includes('gridPos.col') || !htmlContent.includes('gridPos.row')) {
            throw new Error('Missing dynamic grid position handling');
        }
        
        if (!htmlContent.includes('colSpan') || !htmlContent.includes('rowSpan')) {
            throw new Error('Missing span handling for widget sizing');
        }
    });

    // Summary
    log('\n📊 Test Summary', 'info');
    log(`✅ Passed: ${testsPassed}`, 'success');
    if (testsFailed > 0) {
        log(`❌ Failed: ${testsFailed}`, 'error');
    }
    log(`Total: ${testsPassed + testsFailed}\n`, 'info');

    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    log(`Fatal error: ${error.message}`, 'error');
    process.exit(1);
});
