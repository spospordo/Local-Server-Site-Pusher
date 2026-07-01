#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunction(source, signature) {
  const signatureRegex = new RegExp(`${signature}[\\s\\S]*?\\{`);
  const signatureMatch = source.match(signatureRegex);
  if (!signatureMatch || signatureMatch.index === undefined) {
    throw new Error(`Could not find function signature: ${signature}`);
  }

  const start = signatureMatch.index;
  let i = start + signatureMatch[0].length - 1;
  let depth = 0;

  for (; i < source.length; i++) {
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

function extractNamedFunction(source, name) {
  return extractFunction(source, `function ${name}\\s*\\([^)]*\\)\\s*`);
}

function run() {
  const dashboardPath = path.join(__dirname, '..', 'admin', 'dashboard.html');
  const dashboard = fs.readFileSync(dashboardPath, 'utf8');

  const script = [
    extractNamedFunction(dashboard, 'escapeHtml'),
    extractNamedFunction(dashboard, 'formatRetirementNumber'),
    extractNamedFunction(dashboard, 'formatRetirementCurrency'),
    extractNamedFunction(dashboard, 'formatRetirementPercent'),
    extractNamedFunction(dashboard, 'describeRetirementProjectionStatistic'),
    extractNamedFunction(dashboard, 'renderRetirementCalculationDetails')
  ].join('\n');

  const context = {
    console,
    Number,
    parseFloat,
    String,
    Math,
    document: {
      createElement() {
        return {
          _textContent: '',
          set textContent(value) {
            this._textContent = String(value)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          },
          get textContent() {
            return this._textContent;
          },
          get innerHTML() {
            return this._textContent;
          }
        };
      }
    }
  };

  vm.createContext(context);
  vm.runInContext(script, context);

  const html = context.renderRetirementCalculationDetails({
    calculationDetails: {
      expectedAnnualReturn: {
        source: 'historical_growth',
        valuePercent: 8.12,
        historyMonthsUsed: 6.9,
        historicalAnnualizedGrowthPercent: 8.12,
        growthFloorPercent: -50,
        growthCeilingPercent: 200,
        qualifyingAccountsUsed: 2
      },
      projectedPortfolioAtRetirement: {
        startingAssets: 100000,
        annualContribution: 12000,
        yearsUntilRetirement: 20,
        numSimulations: 10000,
        returnMeanPercent: 8.12,
        returnVolatilityPercent: 15,
        inflationRatePercent: 3,
        distributionStatistic: 'deterministic_future_value_formula',
        computedValueBeforeRounding: 712345.67,
        displayValueRounded: 712346
      }
    }
  });

  assert(html.includes('Calculation Details'), 'calculation details heading should render');
  assert(html.includes('Historical path'), 'historical expected return explanation should render');
  assert(html.includes('Displayed statistic'), 'projection statistic explanation should render');
  assert(html.includes('Computed value before rounding'), 'rounding explanation should render');

  const fallbackHtml = context.renderRetirementCalculationDetails({});
  assert(
    fallbackHtml.includes('Detailed calculation fields are not available'),
    'helper should degrade gracefully when payload details are missing'
  );

  console.log('✅ Finance retirement dashboard calculation details test passed');
}

run();
