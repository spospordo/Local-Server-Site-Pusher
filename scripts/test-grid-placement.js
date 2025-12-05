#!/usr/bin/env node

/**
 * Grid-based Widget Placement Test Suite
 * Tests the new flexible grid placement and resizing functionality for Magic Mirror
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const MAGICMIRROR_MODULE_PATH = path.join(__dirname, '..', 'modules', 'magicmirror.js');

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

// Helper function to get a fresh module instance
function getFreshMagicMirrorModule() {
    delete require.cache[require.resolve(MAGICMIRROR_MODULE_PATH)];
    return require(MAGICMIRROR_MODULE_PATH);
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
    log('\n🧪 Grid-based Widget Placement Test Suite\n', 'info');

    // Test 1: Module exports grid configuration constants
    await test('Module exports GRID_CONFIG constants', async () => {
        const magicMirror = require(MAGICMIRROR_MODULE_PATH);
        
        if (!magicMirror.GRID_CONFIG) {
            throw new Error('GRID_CONFIG not exported');
        }
        
        if (magicMirror.GRID_CONFIG.columns !== 12) {
            throw new Error(`Expected 12 columns, got ${magicMirror.GRID_CONFIG.columns}`);
        }
        
        if (magicMirror.GRID_CONFIG.rows !== 6) {
            throw new Error(`Expected 6 rows, got ${magicMirror.GRID_CONFIG.rows}`);
        }
    });

    // Test 2: Module exports area to grid mapping
    await test('Module exports AREA_TO_GRID mapping', async () => {
        const magicMirror = require(MAGICMIRROR_MODULE_PATH);
        
        if (!magicMirror.AREA_TO_GRID) {
            throw new Error('AREA_TO_GRID not exported');
        }
        
        const areas = ['upper-left', 'upper-center', 'upper-right',
                      'middle-left', 'middle-center', 'middle-right',
                      'bottom-left', 'bottom-center', 'bottom-right'];
        
        for (const area of areas) {
            if (!magicMirror.AREA_TO_GRID[area]) {
                throw new Error(`Missing area mapping: ${area}`);
            }
            
            const mapping = magicMirror.AREA_TO_GRID[area];
            if (!mapping.col || !mapping.row || !mapping.colSpan || !mapping.rowSpan) {
                throw new Error(`Incomplete mapping for ${area}`);
            }
        }
    });

    // Test 3: areaToGridPosition helper function
    await test('areaToGridPosition converts area to grid position', async () => {
        const magicMirror = require(MAGICMIRROR_MODULE_PATH);
        
        if (!magicMirror.areaToGridPosition) {
            throw new Error('areaToGridPosition function not exported');
        }
        
        // Test upper-left area
        const pos = magicMirror.areaToGridPosition('upper-left', 'box');
        if (pos.col !== 1 || pos.row !== 1) {
            throw new Error(`upper-left should be at col=1, row=1, got col=${pos.col}, row=${pos.row}`);
        }
        
        // Test bar size spans full width
        const barPos = magicMirror.areaToGridPosition('bottom-left', 'bar');
        if (barPos.colSpan !== 12) {
            throw new Error(`bar size should span 12 columns, got ${barPos.colSpan}`);
        }
    });

    // Test 4: gridPositionToArea helper function
    await test('gridPositionToArea converts grid position to area', async () => {
        const magicMirror = require(MAGICMIRROR_MODULE_PATH);
        
        if (!magicMirror.gridPositionToArea) {
            throw new Error('gridPositionToArea function not exported');
        }
        
        // Test upper-left region (columns 1-4, rows 1-2)
        const area1 = magicMirror.gridPositionToArea({ col: 1, row: 1 });
        if (area1 !== 'upper-left') {
            throw new Error(`Expected upper-left, got ${area1}`);
        }
        
        // Test middle-center region (columns 5-8, rows 3-4)
        const area2 = magicMirror.gridPositionToArea({ col: 5, row: 3 });
        if (area2 !== 'middle-center') {
            throw new Error(`Expected middle-center, got ${area2}`);
        }
        
        // Test bottom-right region (columns 9-12, rows 5-6)
        const area3 = magicMirror.gridPositionToArea({ col: 9, row: 5 });
        if (area3 !== 'bottom-right') {
            throw new Error(`Expected bottom-right, got ${area3}`);
        }
    });

    // Test 5: Default config includes gridLayout settings
    await test('Default config includes gridLayout settings', async () => {
        const magicMirror = getFreshMagicMirrorModule();
        
        const config = magicMirror.getConfig();
        
        if (!config.gridLayout) {
            throw new Error('gridLayout not in config');
        }
        
        if (config.gridLayout.columns !== 12) {
            throw new Error(`Expected 12 columns in gridLayout, got ${config.gridLayout.columns}`);
        }
    });

    // Test 6: Widgets include gridPosition property
    await test('Widgets include gridPosition property', async () => {
        const magicMirror = getFreshMagicMirrorModule();
        
        const config = magicMirror.getConfig();
        
        const widgets = ['clock', 'weather', 'forecast', 'calendar', 'news', 'media'];
        
        for (const widget of widgets) {
            if (!config.widgets[widget]) {
                throw new Error(`Widget ${widget} not in config`);
            }
            
            if (!config.widgets[widget].gridPosition) {
                throw new Error(`Widget ${widget} missing gridPosition`);
            }
            
            const pos = config.widgets[widget].gridPosition;
            if (!pos.col || !pos.row || !pos.colSpan || !pos.rowSpan) {
                throw new Error(`Widget ${widget} has incomplete gridPosition`);
            }
        }
    });

    // Test 7: SIZE_TO_SPANS mapping
    await test('SIZE_TO_SPANS mapping defines size to span conversions', async () => {
        const magicMirror = require(MAGICMIRROR_MODULE_PATH);
        
        if (!magicMirror.SIZE_TO_SPANS) {
            throw new Error('SIZE_TO_SPANS not exported');
        }
        
        if (!magicMirror.SIZE_TO_SPANS.box) {
            throw new Error('box size not defined');
        }
        
        if (!magicMirror.SIZE_TO_SPANS.bar) {
            throw new Error('bar size not defined');
        }
        
        // Bar should span more columns than box
        if (magicMirror.SIZE_TO_SPANS.bar.colSpan <= magicMirror.SIZE_TO_SPANS.box.colSpan) {
            throw new Error('bar should span more columns than box');
        }
    });

    // Test 8: Grid positions don't exceed boundaries
    await test('Grid positions stay within 12x6 grid boundaries', async () => {
        const magicMirror = getFreshMagicMirrorModule();
        
        const config = magicMirror.getConfig();
        
        for (const [name, widget] of Object.entries(config.widgets)) {
            const pos = widget.gridPosition;
            
            // Check column bounds
            if (pos.col < 1 || pos.col > 12) {
                throw new Error(`Widget ${name} col (${pos.col}) out of bounds`);
            }
            if (pos.col + pos.colSpan - 1 > 12) {
                throw new Error(`Widget ${name} extends past column 12`);
            }
            
            // Check row bounds
            if (pos.row < 1 || pos.row > 6) {
                throw new Error(`Widget ${name} row (${pos.row}) out of bounds`);
            }
            if (pos.row + pos.rowSpan - 1 > 6) {
                throw new Error(`Widget ${name} extends past row 6`);
            }
        }
    });

    // Test 9: Admin dashboard includes grid position inputs
    await test('Admin dashboard includes grid position input fields', async () => {
        const dashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
        const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
        
        const widgets = ['Clock', 'Weather', 'Forecast', 'Calendar', 'News', 'Media'];
        
        for (const widget of widgets) {
            // Check for grid position inputs
            if (!dashboardContent.includes(`widget${widget}Col`)) {
                throw new Error(`Missing Column input for ${widget}`);
            }
            if (!dashboardContent.includes(`widget${widget}Row`)) {
                throw new Error(`Missing Row input for ${widget}`);
            }
            if (!dashboardContent.includes(`widget${widget}ColSpan`)) {
                throw new Error(`Missing ColSpan input for ${widget}`);
            }
            if (!dashboardContent.includes(`widget${widget}RowSpan`)) {
                throw new Error(`Missing RowSpan input for ${widget}`);
            }
        }
    });

    // Test 10: Admin dashboard includes grid layout mode toggle
    await test('Admin dashboard includes grid layout mode toggle', async () => {
        const dashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
        const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
        
        if (!dashboardContent.includes('gridLayoutEnabled')) {
            throw new Error('Missing grid layout mode toggle');
        }
        
        if (!dashboardContent.includes('toggleGridLayoutMode')) {
            throw new Error('Missing toggleGridLayoutMode function');
        }
        
        if (!dashboardContent.includes('visualGridEditor')) {
            throw new Error('Missing visual grid editor container');
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
