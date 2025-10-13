#!/usr/bin/env node

/**
 * Magic Mirror Layout System Test Suite
 * Tests the new area-based widget placement and sizing functionality
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

    // Test 1: HTML contains new grid layout CSS
    await test('HTML contains 3x3 grid layout CSS', async () => {
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

    // Test 2: HTML contains widget-area containers
    await test('HTML contains widget-area containers', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('widget-area')) {
            throw new Error('Missing widget-area class');
        }
        
        const areas = ['upper-left', 'upper-center', 'upper-right', 
                      'middle-left', 'middle-center', 'middle-right',
                      'bottom-left', 'bottom-center', 'bottom-right'];
        
        for (const area of areas) {
            if (!htmlContent.includes(`id="area-${area}"`)) {
                throw new Error(`Missing area container: ${area}`);
            }
        }
    });

    // Test 3: HTML contains size classes
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

    // Test 5: HTML contains createWidgets function
    await test('HTML contains createWidgets function', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('function createWidgets()')) {
            throw new Error('Missing createWidgets function');
        }
        
        if (!htmlContent.includes('widgetConfig.area')) {
            throw new Error('createWidgets does not handle area configuration');
        }
        
        if (!htmlContent.includes('widgetConfig.size')) {
            throw new Error('createWidgets does not handle size configuration');
        }
    });

    // Test 6: API returns new widget format
    await test('API returns widgets in new object format', async () => {
        const response = await makeRequest('/api/magicmirror/data');
        
        if (response.statusCode !== 200 && response.statusCode !== 403) {
            throw new Error(`Unexpected status code: ${response.statusCode}`);
        }
        
        // If enabled, check widget format
        if (response.statusCode === 200) {
            const config = response.body;
            
            if (!config.widgets) {
                throw new Error('Response missing widgets property');
            }
            
            // Check if at least one widget uses new format
            const widgetKeys = Object.keys(config.widgets);
            if (widgetKeys.length === 0) {
                throw new Error('No widgets configured');
            }
            
            // Check first enabled widget has new format properties
            for (const key of widgetKeys) {
                const widget = config.widgets[key];
                if (typeof widget === 'object') {
                    if (!widget.hasOwnProperty('enabled')) {
                        throw new Error(`Widget ${key} missing 'enabled' property`);
                    }
                    if (!widget.hasOwnProperty('area')) {
                        throw new Error(`Widget ${key} missing 'area' property`);
                    }
                    if (!widget.hasOwnProperty('size')) {
                        throw new Error(`Widget ${key} missing 'size' property`);
                    }
                    break; // Only check one widget
                }
            }
        }
    });

    // Test 7: Flexbox layout for vertical stacking
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
    await test('Mobile layout adapts to single column', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        if (!htmlContent.includes('@media (max-width: 768px)')) {
            throw new Error('Missing mobile media query');
        }
        
        // Check that mobile layout uses single column
        const mobileSection = htmlContent.substring(
            htmlContent.indexOf('@media (max-width: 768px)'),
            htmlContent.indexOf('@media (max-width: 768px)') + 500
        );
        
        if (!mobileSection.includes('grid-template-columns: 1fr')) {
            throw new Error('Mobile layout does not use single column');
        }
    });

    // Test 9: Widget placement prevents overlap
    await test('Widget areas prevent widget overlap', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        // Check that widget-area has gap for spacing
        if (!htmlContent.includes('gap: 1rem') && !htmlContent.includes('gap: 2rem')) {
            throw new Error('Widget areas missing gap property for spacing');
        }
    });

    // Test 10: Bar size widgets span full width
    await test('Bar size widgets span full width', async () => {
        const htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
        
        const barSection = htmlContent.substring(
            htmlContent.indexOf('.widget.size-bar'),
            htmlContent.indexOf('.widget.size-bar') + 200
        );
        
        if (!barSection.includes('width: 100%')) {
            throw new Error('Bar size widgets do not span full width');
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
