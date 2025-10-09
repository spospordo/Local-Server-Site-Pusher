const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let config = null;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16;

// Initialize the finance module with config
function init(serverConfig) {
  config = serverConfig;
  ensureFinanceDataFile();
  ensureEncryptionKey();
}

// Get or create encryption key for finance data
function ensureEncryptionKey() {
  const configDir = path.join(__dirname, '..', 'config');
  const keyPath = path.join(configDir, '.finance_key');
  
  try {
    if (!fs.existsSync(keyPath)) {
      // Generate a new encryption key
      const key = crypto.randomBytes(KEY_LENGTH);
      fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
      console.log('🔐 [Finance] Generated new encryption key');
    }
  } catch (error) {
    console.error('❌ [Finance] Error managing encryption key:', error.message);
  }
}

// Get the encryption key
function getEncryptionKey() {
  const configDir = path.join(__dirname, '..', 'config');
  const keyPath = path.join(configDir, '.finance_key');
  
  try {
    if (fs.existsSync(keyPath)) {
      return Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
    }
  } catch (error) {
    console.error('❌ [Finance] Error reading encryption key:', error.message);
  }
  return null;
}

// Encrypt data
function encrypt(text) {
  try {
    const key = getEncryptionKey();
    if (!key) {
      throw new Error('Encryption key not available');
    }
    
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Return IV + authTag + encrypted data
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('❌ [Finance] Encryption error:', error.message);
    throw error;
  }
}

// Decrypt data
function decrypt(encryptedData) {
  try {
    const key = getEncryptionKey();
    if (!key) {
      throw new Error('Encryption key not available');
    }
    
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ [Finance] Decryption error:', error.message);
    throw error;
  }
}

// Get default finance data structure
function getDefaultFinanceData() {
  return {
    accounts: [],
    demographics: {
      age: null,
      annualIncome: null,
      retirementAge: 65,
      riskTolerance: 'moderate' // conservative, moderate, aggressive
    },
    history: []
  };
}

// Get finance data file path
function getFinanceDataPath() {
  const configDir = path.join(__dirname, '..', 'config');
  return path.join(configDir, '.finance_data');
}

// Ensure finance data file exists
function ensureFinanceDataFile() {
  const dataPath = getFinanceDataPath();
  
  try {
    if (!fs.existsSync(dataPath)) {
      const defaultData = getDefaultFinanceData();
      saveFinanceData(defaultData);
      console.log('📊 [Finance] Created default finance data file');
    }
  } catch (error) {
    console.error('❌ [Finance] Error creating finance data file:', error.message);
  }
}

// Save finance data (encrypted)
function saveFinanceData(data) {
  const dataPath = getFinanceDataPath();
  
  try {
    const jsonData = JSON.stringify(data, null, 2);
    const encryptedData = encrypt(jsonData);
    fs.writeFileSync(dataPath, encryptedData, { mode: 0o600 });
    return { success: true };
  } catch (error) {
    console.error('❌ [Finance] Error saving finance data:', error.message);
    return { success: false, error: error.message };
  }
}

// Load finance data (decrypted)
function loadFinanceData() {
  const dataPath = getFinanceDataPath();
  
  try {
    if (fs.existsSync(dataPath)) {
      const encryptedData = fs.readFileSync(dataPath, 'utf8');
      const decryptedData = decrypt(encryptedData);
      return JSON.parse(decryptedData);
    }
    return getDefaultFinanceData();
  } catch (error) {
    console.error('❌ [Finance] Error loading finance data:', error.message);
    return getDefaultFinanceData();
  }
}

// Account types with descriptions
const ACCOUNT_TYPES = {
  'savings': {
    name: 'Savings Account',
    description: 'A standard bank savings account for storing cash with minimal interest',
    category: 'cash'
  },
  'checking': {
    name: 'Checking Account',
    description: 'A bank account for daily transactions and bill payments',
    category: 'cash'
  },
  'stocks': {
    name: 'Stocks',
    description: 'Individual company stocks or equity investments',
    category: 'investments'
  },
  'mutual_funds': {
    name: 'Mutual Funds',
    description: 'Pooled investment funds managed by professionals',
    category: 'investments'
  },
  'etf': {
    name: 'ETF (Exchange Traded Fund)',
    description: 'Index funds that trade like stocks on exchanges',
    category: 'investments'
  },
  'bonds': {
    name: 'Bonds',
    description: 'Fixed-income securities including government and corporate bonds',
    category: 'investments'
  },
  '401k': {
    name: '401(k) Retirement',
    description: 'Employer-sponsored retirement account with tax benefits',
    category: 'retirement'
  },
  'ira': {
    name: 'IRA (Individual Retirement Account)',
    description: 'Personal retirement savings account with tax advantages',
    category: 'retirement'
  },
  'roth_ira': {
    name: 'Roth IRA',
    description: 'Retirement account with tax-free withdrawals in retirement',
    category: 'retirement'
  },
  'home': {
    name: 'Primary Residence',
    description: 'The home you live in - real estate equity',
    category: 'real_estate'
  },
  'investment_property': {
    name: 'Investment Property',
    description: 'Real estate owned for rental income or appreciation',
    category: 'real_estate'
  },
  'credit_card': {
    name: 'Credit Card',
    description: 'Credit card debt - enter as a positive number representing amount owed',
    category: 'liabilities'
  },
  'mortgage': {
    name: 'Mortgage',
    description: 'Home loan - enter as a positive number representing outstanding balance',
    category: 'liabilities',
    requiresPropertyLink: true
  },
  'pension': {
    name: 'Pension (Future)',
    description: 'Expected pension payments starting at a future date',
    category: 'future_income'
  },
  'social_security': {
    name: 'Social Security (Future)',
    description: 'Expected Social Security benefits at retirement age',
    category: 'future_income'
  }
};

// Get all accounts
function getAccounts() {
  const data = loadFinanceData();
  return data.accounts || [];
}

// Add or update account
function saveAccount(accountData) {
  const data = loadFinanceData();
  
  if (!accountData.id) {
    accountData.id = Date.now().toString();
    accountData.createdAt = new Date().toISOString();
  }
  
  accountData.updatedAt = new Date().toISOString();
  
  const existingIndex = data.accounts.findIndex(a => a.id === accountData.id);
  if (existingIndex >= 0) {
    data.accounts[existingIndex] = accountData;
  } else {
    data.accounts.push(accountData);
  }
  
  return saveFinanceData(data);
}

// Delete account
function deleteAccount(accountId) {
  const data = loadFinanceData();
  const initialLength = data.accounts.length;
  data.accounts = data.accounts.filter(a => a.id !== accountId);
  
  if (data.accounts.length === initialLength) {
    return { success: false, error: 'Account not found' };
  }
  
  return saveFinanceData(data);
}

// Update account balance (with historical tracking)
function updateAccountBalance(accountId, newBalance, balanceDate = null) {
  const data = loadFinanceData();
  
  const accountIndex = data.accounts.findIndex(a => a.id === accountId);
  if (accountIndex < 0) {
    return { success: false, error: 'Account not found' };
  }
  
  const account = data.accounts[accountIndex];
  const oldBalance = account.currentValue || 0;
  
  // Update the account balance
  account.currentValue = parseFloat(newBalance);
  account.updatedAt = new Date().toISOString();
  
  // Add history entry for balance change
  const timestamp = balanceDate ? new Date(balanceDate).toISOString() : new Date().toISOString();
  data.history.push({
    accountId: accountId,
    accountName: account.name,
    type: 'balance_update',
    oldBalance: parseFloat(oldBalance),
    newBalance: parseFloat(newBalance),
    balanceDate: timestamp,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 1000 entries to prevent file bloat
  if (data.history.length > 1000) {
    data.history = data.history.slice(-1000);
  }
  
  return saveFinanceData(data);
}

// Get demographics
function getDemographics() {
  const data = loadFinanceData();
  return data.demographics || getDefaultFinanceData().demographics;
}

// Update demographics
function updateDemographics(demographics) {
  const data = loadFinanceData();
  data.demographics = { ...data.demographics, ...demographics };
  return saveFinanceData(data);
}

// Add historical data point
function addHistoryEntry(entry) {
  const data = loadFinanceData();
  
  if (!entry.timestamp) {
    entry.timestamp = new Date().toISOString();
  }
  
  data.history.push(entry);
  
  // Keep only last 1000 entries to prevent file bloat
  if (data.history.length > 1000) {
    data.history = data.history.slice(-1000);
  }
  
  return saveFinanceData(data);
}

// Get historical data
function getHistory(accountId = null, startDate = null, endDate = null) {
  const data = loadFinanceData();
  let history = data.history || [];
  
  if (accountId) {
    history = history.filter(h => h.accountId === accountId);
  }
  
  if (startDate) {
    history = history.filter(h => new Date(h.timestamp) >= new Date(startDate));
  }
  
  if (endDate) {
    history = history.filter(h => new Date(h.timestamp) <= new Date(endDate));
  }
  
  return history;
}

// Calculate portfolio allocation recommendations
function getRecommendations() {
  const data = loadFinanceData();
  const demographics = data.demographics;
  const accounts = data.accounts;
  
  // Calculate current allocation
  const allocation = {
    cash: 0,
    investments: 0,
    retirement: 0,
    real_estate: 0,
    future_income: 0,
    liabilities: 0
  };
  
  let totalAssets = 0;
  let totalLiabilities = 0;
  
  accounts.forEach(account => {
    const type = ACCOUNT_TYPES[account.type];
    if (type && account.currentValue) {
      const value = parseFloat(account.currentValue) || 0;
      allocation[type.category] += value;
      
      if (type.category === 'liabilities') {
        totalLiabilities += value;
      } else {
        totalAssets += value;
      }
    }
  });
  
  const totalValue = totalAssets;
  
  // Calculate percentages
  const currentAllocation = {};
  Object.keys(allocation).forEach(key => {
    currentAllocation[key] = totalValue > 0 ? (allocation[key] / totalValue * 100).toFixed(1) : 0;
  });
  
  // Generate recommended allocation based on age and risk tolerance
  const age = demographics.age || 30;
  const riskTolerance = demographics.riskTolerance || 'moderate';
  
  let recommendedAllocation = {};
  
  // Rule of thumb: Bond allocation = age, Stock allocation = 100 - age
  // Adjusted for risk tolerance
  if (riskTolerance === 'conservative') {
    recommendedAllocation = {
      cash: Math.min(20, age * 0.3),
      investments: Math.max(30, 100 - age - 20),
      retirement: Math.min(40, age * 0.5),
      real_estate: 10,
      future_income: 0,
      liabilities: 0
    };
  } else if (riskTolerance === 'moderate') {
    recommendedAllocation = {
      cash: Math.min(15, age * 0.2),
      investments: Math.max(40, 100 - age - 10),
      retirement: Math.min(35, age * 0.4),
      real_estate: 10,
      future_income: 0,
      liabilities: 0
    };
  } else { // aggressive
    recommendedAllocation = {
      cash: Math.min(10, age * 0.1),
      investments: Math.max(50, 110 - age),
      retirement: Math.min(30, age * 0.3),
      real_estate: 10,
      future_income: 0,
      liabilities: 0
    };
  }
  
  // Normalize to 100%
  const total = Object.values(recommendedAllocation).reduce((a, b) => a + b, 0);
  Object.keys(recommendedAllocation).forEach(key => {
    recommendedAllocation[key] = (recommendedAllocation[key] / total * 100).toFixed(1);
  });
  
  // Generate recommendations
  const recommendations = [];
  
  Object.keys(allocation).forEach(category => {
    if (category === 'liabilities') return; // Handle liabilities separately
    
    const current = parseFloat(currentAllocation[category]);
    const recommended = parseFloat(recommendedAllocation[category]);
    const diff = current - recommended;
    
    if (Math.abs(diff) > 5) { // Only recommend if difference > 5%
      if (diff > 0) {
        recommendations.push({
          category,
          message: `Consider reducing ${category.replace('_', ' ')} allocation by ${Math.abs(diff).toFixed(1)}%`,
          current: current.toFixed(1),
          recommended: recommended.toFixed(1)
        });
      } else {
        recommendations.push({
          category,
          message: `Consider increasing ${category.replace('_', ' ')} allocation by ${Math.abs(diff).toFixed(1)}%`,
          current: current.toFixed(1),
          recommended: recommended.toFixed(1)
        });
      }
    }
  });
  
  // Calculate debt-to-asset ratio
  const debtToAssetRatio = totalAssets > 0 ? (totalLiabilities / totalAssets * 100).toFixed(1) : 0;
  const netWorth = totalAssets - totalLiabilities;
  
  // Add debt recommendations if applicable
  if (totalLiabilities > 0) {
    if (debtToAssetRatio > 40) {
      recommendations.push({
        category: 'liabilities',
        message: `Your debt-to-asset ratio is ${debtToAssetRatio}%. Consider prioritizing debt reduction.`,
        current: debtToAssetRatio,
        recommended: '< 40'
      });
    }
  }
  
  // Generate detailed explanation
  const explanation = generateRecommendationExplanation({
    age,
    riskTolerance,
    totalAssets,
    totalLiabilities,
    debtToAssetRatio,
    currentAllocation,
    recommendedAllocation,
    recommendations,
    accounts
  });
  
  return {
    currentAllocation,
    recommendedAllocation,
    recommendations,
    totalValue,
    totalAssets,
    totalLiabilities,
    netWorth,
    debtToAssetRatio,
    accountCount: accounts.length,
    explanation
  };
}

// Generate detailed explanation for recommendations
function generateRecommendationExplanation(data) {
  const { age, riskTolerance, totalAssets, totalLiabilities, debtToAssetRatio, currentAllocation, recommendedAllocation, recommendations, accounts } = data;
  
  let explanation = '<div style="background: #f8f9fa; padding: 1.5rem; border-radius: 8px; border-left: 4px solid #007bff; margin-top: 1.5rem;">';
  explanation += '<h4 style="margin-top: 0; color: #007bff;">📖 Recommendation Strategy & Methodology</h4>';
  
  // Algorithm explanation
  explanation += '<p><strong>Algorithm Used:</strong> Age-Based Asset Allocation with Risk Adjustment</p>';
  explanation += '<p>Our recommendation engine employs a modern portfolio theory approach combined with age-based allocation strategies. ';
  
  // Age-based strategy
  explanation += `At age ${age}, we use a balanced approach where bond allocation generally equals your age (${age}%), `;
  explanation += `and equity allocation equals 100 minus your age (${100 - age}%). This classic rule helps reduce risk as you approach retirement.</p>`;
  
  // Risk tolerance explanation
  explanation += `<p><strong>Risk Tolerance Adjustment:</strong> Based on your <em>${riskTolerance}</em> risk profile, `;
  if (riskTolerance === 'conservative') {
    explanation += 'we recommend higher allocations to cash and bonds for capital preservation, with reduced exposure to volatile equities.';
  } else if (riskTolerance === 'moderate') {
    explanation += 'we balance growth potential with stability, maintaining moderate exposure to both equities and fixed-income securities.';
  } else {
    explanation += 'we emphasize growth-oriented investments with higher equity allocations, accepting increased volatility for potential higher returns.';
  }
  explanation += '</p>';
  
  // Real Estate explanation (clarify primary residence treatment)
  explanation += '<p><strong>Real Estate Treatment:</strong> Real estate assets (including your primary residence) are recommended at approximately 10% of your portfolio. ';
  explanation += 'Both primary residences and investment properties are categorized as "real estate" in the allocation model. ';
  explanation += 'The algorithm treats home equity as part of your net worth but recommends keeping it as a smaller percentage to maintain portfolio liquidity and diversification.</p>';
  
  // Debt analysis
  if (totalLiabilities > 0) {
    explanation += `<p><strong>Debt Analysis:</strong> Your current debt-to-asset ratio is ${debtToAssetRatio}%. `;
    if (debtToAssetRatio > 40) {
      explanation += 'This is above the recommended threshold of 40%. High debt levels can limit financial flexibility and increase risk. ';
      explanation += 'Prioritizing debt reduction, especially high-interest debt like credit cards, should be a key focus before increasing investment allocations.';
    } else if (debtToAssetRatio > 20) {
      explanation += 'This is within acceptable range but monitoring debt levels is important. Focus on maintaining or reducing this ratio over time.';
    } else {
      explanation += 'This is a healthy debt level, indicating good financial management and allowing for more aggressive investment strategies if desired.';
    }
    explanation += '</p>';
  }
  
  // Diagnostic analysis for large discrepancies (>15%)
  const largeDiscrepancies = [];
  Object.keys(currentAllocation).forEach(category => {
    if (category === 'liabilities') return;
    const current = parseFloat(currentAllocation[category]);
    const recommended = parseFloat(recommendedAllocation[category]);
    const diff = Math.abs(current - recommended);
    if (diff > 15) {
      largeDiscrepancies.push({ category, current, recommended, diff });
    }
  });
  
  if (largeDiscrepancies.length > 0) {
    explanation += '<div style="background: #fff3cd; padding: 1rem; border-radius: 6px; border-left: 4px solid #ffc107; margin: 1rem 0;">';
    explanation += '<h5 style="margin-top: 0; color: #856404;">⚠️ Significant Allocation Discrepancies Detected</h5>';
    explanation += '<p style="margin-bottom: 0.5rem;">The following categories differ by more than 15% from recommendations:</p>';
    
    largeDiscrepancies.forEach(disc => {
      explanation += `<div style="margin: 0.75rem 0; padding-left: 1rem; border-left: 3px solid #ffc107;">`;
      explanation += `<strong>${disc.category.replace('_', ' ').toUpperCase()}:</strong> ${disc.current.toFixed(1)}% (current) vs ${disc.recommended.toFixed(1)}% (target) - ${disc.diff.toFixed(1)}% difference<br>`;
      
      // Category-specific diagnostic explanations
      if (disc.category === 'real_estate') {
        explanation += `<em style="font-size: 0.9rem;">Possible causes:</em> `;
        if (disc.current > disc.recommended) {
          explanation += `Your real estate holdings (including primary residence) may represent a large portion of your wealth. This is common for homeowners but can lead to concentration risk. `;
          explanation += `Consider: (1) Your primary residence equity is being counted - this is standard practice but may seem high if home is paid off or highly appreciated. `;
          explanation += `(2) If you have investment properties, ensure they're providing adequate returns. (3) Consider building up liquid investments for better diversification.`;
        } else {
          explanation += `You may have limited real estate exposure. This could be intentional for liquidity, or you may want to consider real estate investments if appropriate for your situation.`;
        }
      } else if (disc.category === 'cash') {
        explanation += `<em style="font-size: 0.9rem;">Possible causes:</em> `;
        if (disc.current > disc.recommended) {
          explanation += `High cash allocation may indicate: (1) Recent liquidity event or saving period. (2) Market uncertainty leading to defensive positioning. (3) Cash earmarked for major purchase. `;
          explanation += `Consider deploying excess cash into investments aligned with your risk tolerance.`;
        } else {
          explanation += `Low cash allocation may leave you vulnerable to emergencies. Ensure you maintain 3-6 months of expenses in liquid savings.`;
        }
      } else if (disc.category === 'investments') {
        explanation += `<em style="font-size: 0.9rem;">Possible causes:</em> `;
        if (disc.current > disc.recommended) {
          explanation += `High investment allocation suggests aggressive positioning. Verify this aligns with your risk tolerance and time horizon.`;
        } else {
          explanation += `Low investment allocation may limit growth potential. Consider whether you have adequate funds in growth-oriented investments for long-term goals.`;
        }
      } else if (disc.category === 'retirement') {
        explanation += `<em style="font-size: 0.9rem;">Possible causes:</em> `;
        if (disc.current > disc.recommended) {
          explanation += `High retirement account allocation is generally positive. Ensure you're also maintaining adequate liquidity for pre-retirement needs.`;
        } else {
          explanation += `Low retirement savings allocation. If you're under-utilizing tax-advantaged retirement accounts (401k, IRA), consider increasing contributions to maximize tax benefits.`;
        }
      } else if (disc.category === 'future_income') {
        explanation += `<em style="font-size: 0.9rem;">Note:</em> Future income (pensions, Social Security) is tracked for planning but doesn't affect allocation percentages until received. This category will always show 0% allocation.`;
      }
      explanation += `</div>`;
    });
    
    explanation += '</div>';
  }
  
  // Account breakdown by category
  if (accounts && accounts.length > 0) {
    const accountsByCategory = {};
    accounts.forEach(account => {
      const type = ACCOUNT_TYPES[account.type];
      if (type) {
        const category = type.category;
        if (!accountsByCategory[category]) {
          accountsByCategory[category] = [];
        }
        accountsByCategory[category].push({
          name: account.name,
          type: type.name,
          value: parseFloat(account.currentValue || 0)
        });
      }
    });
    
    explanation += '<div style="margin-top: 1rem;">';
    explanation += '<h5 style="margin-bottom: 0.5rem;">📂 Your Accounts by Category</h5>';
    explanation += '<div style="font-size: 0.9rem;">';
    
    Object.keys(accountsByCategory).sort().forEach(category => {
      const categoryAccounts = accountsByCategory[category];
      const categoryTotal = categoryAccounts.reduce((sum, acc) => sum + acc.value, 0);
      
      explanation += `<div style="margin: 0.5rem 0; padding: 0.5rem; background: white; border-radius: 4px;">`;
      explanation += `<strong>${category.replace('_', ' ').toUpperCase()}:</strong> $${categoryTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<br>`;
      categoryAccounts.forEach(acc => {
        explanation += `<span style="margin-left: 1rem; font-size: 0.85rem; color: #666;">• ${acc.name} (${acc.type}): $${acc.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><br>`;
      });
      explanation += `</div>`;
    });
    
    explanation += '</div></div>';
  }
  
  // Strategy summary
  explanation += '<p style="margin-top: 1rem;"><strong>Recommended Strategy:</strong> ';
  if (recommendations.length === 0) {
    explanation += 'Your current portfolio allocation is well-balanced and aligns with your age and risk tolerance. Continue monitoring and rebalancing quarterly to maintain these targets.';
  } else {
    explanation += 'We recommend rebalancing your portfolio to align with the suggested allocations above. ';
    explanation += 'This involves gradually shifting assets over time to avoid market timing risks. ';
    explanation += 'Consider tax implications and transaction costs when rebalancing, and aim to review your allocation quarterly or when it deviates by more than 5%.';
  }
  explanation += '</p>';
  
  explanation += '</div>';
  
  return explanation;
}

// Get account types with descriptions
function getAccountTypes() {
  return ACCOUNT_TYPES;
}

module.exports = {
  init,
  getAccounts,
  saveAccount,
  deleteAccount,
  updateAccountBalance,
  getDemographics,
  updateDemographics,
  addHistoryEntry,
  getHistory,
  getRecommendations,
  getAccountTypes
};
