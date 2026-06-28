#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

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

function extractFunction(source, signature) {
  const signatureRegex = new RegExp(`${signature}[\\s\\S]*?\\{`);
  const signatureMatch = source.match(signatureRegex);
  if (!signatureMatch || signatureMatch.index === undefined) {
    throw new Error(`Could not find function signature: ${signature}`);
  }

  const start = signatureMatch.index;
  let depth = 0;

  for (let i = start + signatureMatch[0].length - 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Could not parse function body for: ${signature}`);
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
    assert.deepStrictEqual(carsData.vehicles[0].insurance, [], 'new cars should default to empty insurance policies');
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

    result = house.addInsurancePolicy(carId, {
      provider: 'State Farm',
      policyNumber: 'ABC123',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      monthlyPremium: '120.5',
      annualMileageAllowance: '12000',
      notes: 'Comprehensive'
    });
    assert.strictEqual(result.success, true, 'addInsurancePolicy should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].insurance.length, 1, 'insurance policy should be added');
    const policyId = carsData.vehicles[0].insurance[0].id;
    assert.strictEqual(carsData.vehicles[0].insurance[0].annualMileageAllowance, 12000, 'annual mileage should be stored as a number');
    log('✅ addInsurancePolicy stores policies');

    result = house.updateInsurancePolicy(carId, policyId, {
      monthlyPremium: '135.25',
      notes: 'Updated policy'
    });
    assert.strictEqual(result.success, true, 'updateInsurancePolicy should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].insurance[0].monthlyPremium, 135.25, 'monthly premium should update');
    assert.strictEqual(carsData.vehicles[0].insurance[0].notes, 'Updated policy', 'insurance notes should update');
    log('✅ updateInsurancePolicy updates policies');

    result = house.addInsurancePolicy(carId, {
      provider: '',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      annualMileageAllowance: ''
    });
    assert.strictEqual(result.success, false, 'addInsurancePolicy should reject missing required fields');
    assert.strictEqual(result.error, 'Provider is required', 'insurance validation should require provider first');
    log('✅ addInsurancePolicy validates required fields');

    result = house.deleteInsurancePolicy(carId, policyId);
    assert.strictEqual(result.success, true, 'deleteInsurancePolicy should succeed');
    carsData = house.getCarsData();
    assert.strictEqual(carsData.vehicles[0].insurance.length, 0, 'insurance policy should be removed');
    log('✅ deleteInsurancePolicy removes policies');

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
    "/admin/api/house/cars/:carId/odometer/:readingId",
    "/admin/api/house/cars/:carId/insurance",
    "/admin/api/house/cars/:carId/insurance/:policyId"
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
    'function loadCarInsurance(carId)',
    'function addInsurancePolicy(carId)',
    'function editInsurancePolicy(carId, policyId)',
    'function deleteInsurancePolicy(carId, policyId)',
    'function computeInsuranceMileageCompliance(policy, odometerReadings, avgMilesPerMonth)',
    'function renderInsuranceMileageCompliance(carId, policyId, complianceData)',
    'function computeMileageAnalysis(readings, maintenanceRecords, oilChangeIntervalMiles)',
    'function renderMileageAnalysis(carId, analysis)'
  ].forEach(snippet => {
    assert(dashboardContent.includes(snippet), `dashboard.html should include ${snippet}`);
  });
  log('✅ dashboard.html includes Cars tab markup and JavaScript hooks');
}

function testInsuranceMileageComplianceMessaging() {
  const dashboardContent = fs.readFileSync(path.join(repoRoot, 'admin', 'dashboard.html'), 'utf8');
  const getMileageNumberFn = extractFunction(dashboardContent, 'function getMileageNumber\\s*\\([^)]*\\)\\s*');
  const computeInsuranceMileageComplianceFn = extractFunction(dashboardContent, 'function computeInsuranceMileageCompliance\\s*\\([^)]*\\)\\s*');
  const renderInsuranceMileageComplianceFn = extractFunction(dashboardContent, 'function renderInsuranceMileageCompliance\\s*\\([^)]*\\)\\s*');

  const fixedNowIso = '2026-04-01T00:00:00.000Z';
  const RealDate = Date;
  function MockDate(...args) {
    if (args.length === 0) {
      return new RealDate(fixedNowIso);
    }
    return new RealDate(...args);
  }
  MockDate.now = () => new RealDate(fixedNowIso).getTime();
  MockDate.UTC = RealDate.UTC;
  MockDate.parse = RealDate.parse;
  MockDate.prototype = RealDate.prototype;

  const complianceContainerId = 'insurance-compliance-car-1-policy-1';
  const complianceContainer = { innerHTML: '' };

  const context = {
    Date: MockDate,
    Math,
    Number,
    getMileageNumber: undefined,
    formatMileage: value => (Number.isFinite(value) ? `${Math.round(value)} miles` : 'No data'),
    escapeHtml: value => String(value),
    formatShortMonthYear: value => String(value),
    document: {
      getElementById: id => (id === complianceContainerId ? complianceContainer : null)
    }
  };

  vm.createContext(context);
  vm.runInContext(`${getMileageNumberFn}\n${computeInsuranceMileageComplianceFn}\n${renderInsuranceMileageComplianceFn}`, context);

  const annualMileageAllowance = 1460;
  const avgMilesPerMonth = 130;
  const projectedAnnualMileage = avgMilesPerMonth * 12;

  const policy = {
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.000Z',
    annualMileageAllowance,
    provider: 'State Farm'
  };
  const odometerReadings = [
    { date: '2026-01-01T00:00:00.000Z', mileage: 10000 },
    { date: '2026-04-01T00:00:00.000Z', mileage: 10200 }
  ];

  const result = context.computeInsuranceMileageCompliance(policy, odometerReadings, avgMilesPerMonth);
  assert.strictEqual(Math.round(result.expectedMileageToDate), 360, 'expected-to-date pace should be calculated from elapsed policy days');
  assert.strictEqual(result.actualMilesDriven, 200, 'actual miles driven should be computed from baseline and latest reading');
  assert.strictEqual(Math.round(result.delta), -160, 'difference should compare actual miles against expected-to-date pace');
  assert.strictEqual(result.projectedAnnual, projectedAnnualMileage, 'projected annual should annualize monthly average');
  assert.strictEqual(result.isOverLimit, true, 'projection over annual policy allowance should flag warning status');

  context.renderInsuranceMileageCompliance('car-1', 'policy-1', {
    ...result,
    provider: policy.provider,
    startDate: policy.startDate,
    endDate: policy.endDate,
    annualMileageAllowance: policy.annualMileageAllowance
  });

  assert(complianceContainer.innerHTML.includes('Pace to date:'), 'UI should label short-term signal as pace-to-date');
  assert(complianceContainer.innerHTML.includes('Annual projection status:'), 'UI should label long-term signal as annual projection status');
  assert(complianceContainer.innerHTML.includes('even though you are currently under expected pace'), 'UI should explain why under-pace and over-limit warning can both be true');
  log('✅ insurance mileage compliance messaging distinguishes pace-to-date from annual projection');
}

try {
  log('Running Cars feature checks...\n');
  testHouseCarsModule();
  testStaticIntegration();
  testInsuranceMileageComplianceMessaging();
  log('\n🎉 Cars feature checks passed');
} catch (error) {
  console.error('\n❌ Cars feature checks failed');
  console.error(error);
  process.exit(1);
}
