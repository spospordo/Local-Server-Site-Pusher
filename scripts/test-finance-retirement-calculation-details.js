#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const finance = require('../modules/finance');

const repoRoot = path.join(__dirname, '..');
const configDir = path.join(repoRoot, 'config');
const financeDataPath = path.join(configDir, '.finance_data');
const financeKeyPath = path.join(configDir, '.finance_key');
const managedFiles = [financeDataPath, financeKeyPath];
const originalFiles = new Map();

function snapshotOriginalFiles() {
  managedFiles.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      originalFiles.set(filePath, fs.readFileSync(filePath));
    }
  });
}

function restoreOriginalFiles() {
  managedFiles.forEach((filePath) => {
    if (originalFiles.has(filePath)) {
      fs.writeFileSync(filePath, originalFiles.get(filePath));
    } else if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}

function resetFinanceStorage() {
  managedFiles.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  finance.init({});
}

function assertApprox(actual, expected, tolerance, message) {
  const difference = Math.abs(actual - expected);
  assert(
    difference <= tolerance,
    `${message} (expected ${expected}, got ${actual}, difference ${difference})`
  );
}

function futureValue(startingAssets, annualContribution, annualReturn, years) {
  const growthFactor = Math.pow(1 + annualReturn, years);
  return startingAssets * growthFactor +
    (annualContribution * (growthFactor - 1) / annualReturn);
}

function createAccount(account) {
  const saveResult = finance.saveAccount(account);
  assert.strictEqual(saveResult.success, true, 'account should save successfully');
  const savedAccounts = finance.getAccounts();
  return savedAccounts[savedAccounts.length - 1];
}

function runHistoricalGrowthScenario() {
  resetFinanceStorage();

  finance.updateDemographics({
    age: 40,
    annualIncome: 60000,
    retirementAge: 65,
    annualRetirementSpending: 50000,
    riskTolerance: 'moderate'
  });
  finance.updateAdvancedSettings({
    savingsRate: 0.15,
    monteCarloSimulations: 25
  });

  const account = createAccount({
    name: 'Brokerage',
    type: 'stocks',
    currentValue: 12000
  });

  finance.addHistoryEntry({
    type: 'balance_update',
    accountId: account.id,
    newBalance: 10000,
    balanceDate: '2025-01-01T00:00:00.000Z'
  });
  finance.addHistoryEntry({
    type: 'balance_update',
    accountId: account.id,
    newBalance: 11000,
    balanceDate: '2025-04-01T00:00:00.000Z'
  });
  finance.addHistoryEntry({
    type: 'balance_update',
    accountId: account.id,
    newBalance: 12000,
    balanceDate: '2025-08-01T00:00:00.000Z'
  });

  const result = finance.evaluateRetirementPlan();
  assert.strictEqual(result.success, true, 'historical growth evaluation should succeed');
  assert.strictEqual(result.assumptions.hasHistoricalGrowthData, true, 'historical data flag should stay true');
  assert.strictEqual(result.calculationDetails.expectedAnnualReturn.source, 'historical_growth');

  const expectedAnnualGrowth = ((12000 - 10000) / 10000) * (365 / 212);
  const expectedAnnualGrowthPercent = Math.round(expectedAnnualGrowth * 10000) / 100;
  const expectedProjection = futureValue(12000, 9000, expectedAnnualGrowth, 25);

  assertApprox(
    result.calculationDetails.expectedAnnualReturn.valuePercent,
    expectedAnnualGrowthPercent,
    0.01,
    'historical expected return percent should match annualized growth'
  );
  assertApprox(
    result.calculationDetails.expectedAnnualReturn.historicalAnnualizedGrowthPercent,
    expectedAnnualGrowthPercent,
    0.01,
    'historical annualized growth percent should be reported'
  );
  assertApprox(
    result.calculationDetails.expectedAnnualReturn.historyMonthsUsed,
    Math.round((212 / 30.4375) * 10) / 10,
    0.01,
    'history months used should reflect the qualifying window'
  );
  assert.strictEqual(result.calculationDetails.expectedAnnualReturn.qualifyingAccountsUsed, 1);
  assert.strictEqual(result.calculationDetails.projectedPortfolioAtRetirement.numSimulations, 25);
  assert.strictEqual(
    result.calculationDetails.projectedPortfolioAtRetirement.distributionStatistic,
    'deterministic_future_value_formula'
  );
  assertApprox(
    result.calculationDetails.projectedPortfolioAtRetirement.computedValueBeforeRounding,
    Math.round(expectedProjection * 100) / 100,
    0.01,
    'projected portfolio raw value should match the future-value formula'
  );
  assert.strictEqual(
    result.calculationDetails.projectedPortfolioAtRetirement.displayValueRounded,
    Math.round(expectedProjection),
    'displayed rounded projection should match the rounded raw projection'
  );
  assert.strictEqual(
    result.projections.projectedPortfolioAtRetirement,
    result.calculationDetails.projectedPortfolioAtRetirement.displayValueRounded,
    'legacy projection field should remain aligned with calculation details'
  );
  assert.strictEqual(result.assumptions.expectedReturn.endsWith('%'), true, 'legacy formatted expected return should remain a string');
}

function runFallbackScenario() {
  resetFinanceStorage();

  finance.updateDemographics({
    age: 40,
    annualIncome: 100000,
    retirementAge: 65,
    annualRetirementSpending: 60000,
    riskTolerance: 'aggressive'
  });
  finance.updateAdvancedSettings({
    savingsRate: 0.10,
    monteCarloSimulations: 15,
    aggressiveReturn: 0.0825,
    aggressiveVolatility: 0.175,
    inflationRate: 0.0325
  });

  createAccount({
    name: '401(k)',
    type: '401k',
    currentValue: 50000
  });

  const result = finance.evaluateRetirementPlan();
  assert.strictEqual(result.success, true, 'fallback evaluation should succeed');
  assert.strictEqual(result.assumptions.hasHistoricalGrowthData, false, 'fallback should not claim historical growth');
  assert.strictEqual(result.calculationDetails.expectedAnnualReturn.source, 'risk_profile_assumption');
  assert.strictEqual(result.calculationDetails.expectedAnnualReturn.riskTolerance, 'aggressive');
  assertApprox(
    result.calculationDetails.expectedAnnualReturn.valuePercent,
    8.25,
    0.001,
    'fallback expected return should use configured aggressive return'
  );
  assertApprox(
    result.calculationDetails.expectedAnnualReturn.configuredAssumptionReturnPercent,
    8.25,
    0.001,
    'configured fallback return should be exposed'
  );
  assertApprox(
    result.calculationDetails.expectedAnnualReturn.configuredAssumptionVolatilityPercent,
    17.5,
    0.001,
    'configured fallback volatility should be exposed'
  );

  const expectedProjection = futureValue(50000, 10000, 0.0825, 25);
  assertApprox(
    result.calculationDetails.projectedPortfolioAtRetirement.computedValueBeforeRounding,
    Math.round(expectedProjection * 100) / 100,
    0.01,
    'fallback projected portfolio should use configured return in the deterministic formula'
  );
  assertApprox(
    result.calculationDetails.projectedPortfolioAtRetirement.inflationRatePercent,
    3.25,
    0.001,
    'inflation context should be exposed numerically'
  );
}

function run() {
  snapshotOriginalFiles();

  try {
    runHistoricalGrowthScenario();
    runFallbackScenario();
    console.log('✅ Finance retirement calculation details test passed');
  } finally {
    restoreOriginalFiles();
  }
}

run();
