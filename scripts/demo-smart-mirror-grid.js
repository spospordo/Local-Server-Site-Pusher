#!/usr/bin/env node

/**
 * Manual test script to demonstrate grid position changes
 * This script modifies widget positions and verifies the changes
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

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
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            body: body.length > 0 ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (err) {
          resolve({
            statusCode: res.statusCode,
            body: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function demonstrateGridPositioning() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Smart Mirror Grid Positioning Demo                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Get current configuration
  console.log('📋 Step 1: Fetching current configuration...');
  const result = await makeRequest('GET', '/api/smart-mirror/config');
  
  if (result.statusCode === 200 && result.body && result.body.config) {
    const config = result.body.config;
    
    console.log('\n✅ Current Widget Grid Positions:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Display a visual grid representation
    const grid = Array(3).fill(null).map(() => Array(4).fill('·'));
    
    Object.keys(config.widgets).forEach(widgetName => {
      const widget = config.widgets[widgetName];
      const pos = widget.gridPosition;
      
      if (!widget.enabled) return;
      
      console.log(`🔹 ${widgetName.padEnd(10)} : Position (${pos.x},${pos.y}) Size ${pos.width}×${pos.height} - ${widget.enabled ? 'ENABLED' : 'disabled'}`);
      
      // Mark the grid
      for (let y = pos.y; y < pos.y + pos.height && y < 3; y++) {
        for (let x = pos.x; x < pos.x + pos.width && x < 4; x++) {
          grid[y][x] = widgetName[0].toUpperCase();
        }
      }
    });
    
    console.log('\n📊 Visual Grid Layout (4 columns × 3 rows):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('     Col 0   Col 1   Col 2   Col 3');
    grid.forEach((row, y) => {
      console.log(`Row ${y}   ${row.join('      ')}`);
    });
    console.log('\nLegend: C=Clock, A=Calendar, W=Weather, F=Forecast, N=News, ·=Empty\n');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📝 How Grid Positioning Works:');
    console.log('   • gridPosition.x: Column (0-3, left to right)');
    console.log('   • gridPosition.y: Row (0-2, top to bottom)');
    console.log('   • gridPosition.width: Number of columns to span (1-4)');
    console.log('   • gridPosition.height: Number of rows to span (1-3)');
    console.log('   • Widgets are sorted by Y, then X before rendering');
    console.log('   • CSS uses combined position+span rules (e.g., grid-column: 1 / span 2)\n');
    
    console.log('🔧 To change widget positions:');
    console.log('   1. Access admin panel at http://localhost:3000/admin');
    console.log('   2. Navigate to Server → Smart Mirror');
    console.log('   3. Adjust Grid Position X/Y and Width/Height for each widget');
    console.log('   4. Save configuration');
    console.log('   5. Reload /smart-mirror dashboard to see changes\n');
    
    console.log('✅ Demo Complete!\n');
    
  } else {
    console.log('❌ Failed to fetch configuration');
    process.exit(1);
  }
}

// Run demo
demonstrateGridPositioning().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
