#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const house = require(path.join(repoRoot, 'modules', 'house.js'));

function log(message) {
  console.log(message);
}

function cleanup(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function testHouseCarsModule() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'house-cars-test-'));
  const dataFilePath = path.join(tempDir, 'house-data.json');

  try {
    house.init({ house: { dataFilePath } });

    const defaultData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
    assert.deepStrictEqual(defaultData.cars, { vehicles: [] }, 'default house data should include cars');
    log('✅ Default house data includes cars');

    let result = house.addCar({
      make: 'Toyota',
      model: 'Camry',
      year: '2021',
      odometer: '42000'
    });
    assert.strictEqual(result.success, true, 'addCar should succeed');

    let carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles.length, 1, 'car should be added');
    const carId = carsData.vehicles[0].id;
    assert.deepStrictEqual(carsData.vehicles[0].maintenance, [], 'new cars should default to empty maintenance');
    assert.deepStrictEqual(carsData.vehicles[0].odometerReadings, [], 'new cars should default to empty odometer readings');
    assert.strictEqual(carsData.vehicles[0].oilChangeIntervalMiles, 5000, 'new cars should default oil change interval to 5000');
    log('✅ addCar stores a vehicle with default maintenance');

    result = house.updateCar(carId, { odometer: '42500', model: 'Camry Hybrid' });
    assert.strictEqual(result.success, true, 'updateCar should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].model, 'Camry Hybrid', 'updateCar should update fields');
    assert.strictEqual(carsData.vehicles[0].odometer, '42500', 'updateCar should update odometer');
    log('✅ updateCar updates existing vehicles');

    result = house.addCar({
      make: '',
      model: 'Missing Make',
      year: '2024'
    });
    assert.strictEqual(result.success, false, 'addCar should reject missing required fields');
    assert.strictEqual(result.error, 'Make is required', 'addCar should report validation errors');
    log('✅ addCar validates required fields');

    result = house.addMaintenanceRecord(carId, {
      date: '2026-05-01',
      description: 'Oil Change',
      mileage: '42500',
      notes: 'Synthetic oil'
    });
    assert.strictEqual(result.success, true, 'addMaintenanceRecord should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].maintenance.length, 1, 'maintenance record should be added');
    const recordId = carsData.vehicles[0].maintenance[0].id;
    log('✅ addMaintenanceRecord stores maintenance entries');

    result = house.updateMaintenanceRecord(carId, recordId, {
      description: 'Full Service',
      notes: 'Oil and filters'
    });
    assert.strictEqual(result.success, true, 'updateMaintenanceRecord should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].maintenance[0].description, 'Full Service', 'maintenance description should update');
    assert.strictEqual(carsData.vehicles[0].maintenance[0].notes, 'Oil and filters', 'maintenance notes should update');
    log('✅ updateMaintenanceRecord updates maintenance entries');

    result = house.addMaintenanceRecord(carId, {
      date: '',
      description: ''
    });
    assert.strictEqual(result.success, false, 'addMaintenanceRecord should reject missing required fields');
    assert.strictEqual(result.error, 'Date is required', 'maintenance validation should require a date first');
    log('✅ addMaintenanceRecord validates required fields');

    result = house.deleteMaintenanceRecord(carId, recordId);
    assert.strictEqual(result.success, true, 'deleteMaintenanceRecord should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].maintenance.length, 0, 'maintenance record should be removed');
    log('✅ deleteMaintenanceRecord removes maintenance entries');

    result = house.addOdometerReading(carId, {
      date: '2026-05-10',
      mileage: '43000',
      notes: 'Week 1'
    });
    assert.strictEqual(result.success, true, 'addOdometerReading should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].odometerReadings.length, 1, 'odometer reading should be added');
    const readingId = carsData.vehicles[0].odometerReadings[0].id;
    assert.strictEqual(carsData.vehicles[0].odometerReadings[0].mileage, 43000, 'odometer mileage should be stored as a number');
    log('✅ addOdometerReading stores dated readings');

    result = house.updateOdometerReading(carId, readingId, {
      mileage: '43100',
      notes: 'Updated'
    });
    assert.strictEqual(result.success, true, 'updateOdometerReading should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].odometerReadings[0].mileage, 43100, 'odometer mileage should update');
    assert.strictEqual(carsData.vehicles[0].odometerReadings[0].notes, 'Updated', 'odometer notes should update');
    log('✅ updateOdometerReading updates readings');

    result = house.addOdometerReading(carId, {
      date: '',
      mileage: '-1'
    });
    assert.strictEqual(result.success, false, 'addOdometerReading should reject invalid values');
    assert.strictEqual(result.error, 'Date is required', 'odometer validation should require date first');
    log('✅ addOdometerReading validates required fields');

    result = house.deleteOdometerReading(carId, readingId);
    assert.strictEqual(result.success, true, 'deleteOdometerReading should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].odometerReadings.length, 0, 'odometer reading should be removed');
    log('✅ deleteOdometerReading removes readings');

    result = house.deleteCar(carId);
    assert.strictEqual(result.success, true, 'deleteCar should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles.length, 0, 'car should be removed');
    log('✅ deleteCar removes vehicles');
  } finally {
    cleanup(tempDir);
  }
}

function testStaticIntegration() {
  const serverContent = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');
  const dashboardContent = fs.readFileSync(path.join(repoRoot, 'admin', 'dashboard.html'), 'utf8');

  [
    "/admin/api/house/cars",
    "/admin/api/house/cars/:id",
    "/admin/api/house/cars/:carId/maintenance",
    "/admin/api/house/cars/:carId/maintenance/:recordId",
    "/admin/api/house/cars/:carId/odometer",
    "/admin/api/house/cars/:carId/odometer/:readingId"
  ].forEach(route => {
    assert(serverContent.includes(route), `server.js should include route ${route}`);
  });
  log('✅ server.js includes Cars API routes');

  [
    "showSubTab('house-cars')",
    'house-cars-section',
    'id="carsList"',
    'function loadCars()',
    'function addCar()',
    'function editCar(id)',
    'function deleteCar(id)',
    'function addMaintenanceRecord(carId)',
    'function editMaintenanceRecord(carId, recordId)',
    'function deleteMaintenanceRecord(carId, recordId)',
    'function loadCarOdometerReadings(carId)',
    'function addOdometerReading(carId)',
    'function editOdometerReading(carId, readingId)',
    'function deleteOdometerReading(carId, readingId)',
    'function computeMileageAnalysis(readings, maintenanceRecords, oilChangeIntervalMiles)',
    'function renderMileageAnalysis(carId, analysis)'
  ].forEach(snippet => {
    assert(dashboardContent.includes(snippet), `dashboard.html should include ${snippet}`);
  });
  log('✅ dashboard.html includes Cars tab markup and JavaScript hooks');
}

try {
  log('Running Cars feature checks...\n');
  testHouseCarsModule();
  testStaticIntegration();
  log('\n🎉 Cars feature checks passed');
} catch (error) {
  console.error('\n❌ Cars feature checks failed');
  console.error(error);
  process.exit(1);
}
