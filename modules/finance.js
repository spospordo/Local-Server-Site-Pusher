const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Tesseract = require('tesseract.js');
const { formatFileSystemError, logError, createErrorResponse } = require('./error-helper');
const logger = require('./logger');

let config = null;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16;
const MAX_HISTORY_ENTRIES = 1000; // Maximum history entries to keep

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
    logError(logger.categories.FINANCE, error, {
      operation: 'Manage encryption key',
      keyPath
    });
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
    logError(logger.categories.FINANCE, error, {
      operation: 'Read encryption key',
      keyPath
    });
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
    logError(logger.categories.FINANCE, error, {
      operation: 'Encrypt finance data'
    });
    throw new Error('Failed to encrypt finance data. Ensure encryption key is properly configured.');
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
    logError(logger.categories.FINANCE, error, {
      operation: 'Decrypt finance data'
    });
    throw new Error('Failed to decrypt finance data. The data may be corrupted or the encryption key may have changed.');
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
      retirementYear: null,
      annualRetirementSpending: null,
      riskTolerance: 'moderate' // conservative, moderate, aggressive
    },
    advancedSettings: {
      // Monte Carlo Simulation Settings
      monteCarloSimulations: 10000,
      yearsInRetirement: 30,
      inflationRate: 0.03, // 3%
      savingsRate: 0.15, // 15%
      
      // Return Assumptions by Risk Tolerance
      conservativeReturn: 0.05, // 5%
      conservativeVolatility: 0.10, // 10%
      moderateReturn: 0.07, // 7%
      moderateVolatility: 0.15, // 15%
      aggressiveReturn: 0.09, // 9%
      aggressiveVolatility: 0.20, // 20%
      
      // Retirement Distribution Adjustments
      retirementReturnAdjustment: 0.7, // 70% of accumulation return
      retirementVolatilityAdjustment: 0.8 // 80% of accumulation volatility
    },
    history: [],
    apartments: [] // Investment property tracking
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
    const enhancedError = formatFileSystemError(error, 'create', dataPath);
    logError(logger.categories.FINANCE, enhancedError, {
      operation: 'Create finance data file',
      dataPath
    });
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
    const enhancedError = formatFileSystemError(error, 'save', dataPath);
    logError(logger.categories.FINANCE, enhancedError, {
      operation: 'Save finance data',
      dataPath
    });
    
    return { 
      success: false, 
      error: error.message,
      solution: 'Check that the config directory is writable and has sufficient disk space. Verify the encryption key is properly configured.'
    };
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
    const enhancedError = formatFileSystemError(error, 'load', dataPath);
    logError(logger.categories.FINANCE, enhancedError, {
      operation: 'Load finance data',
      dataPath,
      fallback: 'Using default finance data'
    });
    
    console.warn('⚠️ [Finance] Using default finance data due to load error. Your saved data may be inaccessible.');
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

// Update account display name
function updateAccountDisplayName(accountId, displayName) {
  const data = loadFinanceData();
  
  const accountIndex = data.accounts.findIndex(a => a.id === accountId);
  if (accountIndex < 0) {
    return { success: false, error: 'Account not found' };
  }
  
  const account = data.accounts[accountIndex];
  
  // Set display name (empty or whitespace-only strings become null)
  account.displayName = (typeof displayName === 'string' && displayName.trim() !== '') 
    ? displayName.trim() 
    : null;
  account.updatedAt = new Date().toISOString();
  
  return saveFinanceData(data);
}

// Get display name for an account (falls back to original name)
function getAccountDisplayName(account) {
  return account.displayName || account.name;
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

// Merge multiple accounts into one
function mergeAccounts(accountIds) {
  if (!Array.isArray(accountIds) || accountIds.length < 2) {
    return { success: false, error: 'At least 2 accounts are required for merging' };
  }

  const data = loadFinanceData();
  
  // Find all accounts to merge
  const accountsToMerge = accountIds
    .map(id => data.accounts.find(a => a.id === id))
    .filter(a => a !== undefined);
  
  if (accountsToMerge.length < 2) {
    return { success: false, error: 'Could not find all accounts to merge' };
  }
  
  if (accountsToMerge.length !== accountIds.length) {
    return { success: false, error: 'Some account IDs were not found' };
  }
  
  // Find the most recently updated account (this becomes the surviving account)
  const survivingAccount = accountsToMerge.reduce((latest, current) => {
    const latestTime = new Date(latest.updatedAt || latest.createdAt || 0);
    const currentTime = new Date(current.updatedAt || current.createdAt || 0);
    return currentTime > latestTime ? current : latest;
  });
  
  // Collect accounts to be merged (all except surviving)
  const mergedAccounts = accountsToMerge.filter(a => a.id !== survivingAccount.id);
  
  // Initialize previousNames array if it doesn't exist
  if (!survivingAccount.previousNames) {
    survivingAccount.previousNames = [];
  }
  
  // Collect all previous names from merged accounts
  const allPreviousNames = new Set(survivingAccount.previousNames);
  
  mergedAccounts.forEach(account => {
    // Add the account's current name as a previous name
    if (account.name && account.name !== survivingAccount.name) {
      allPreviousNames.add(account.name);
    }
    
    // Add any existing previous names from this account
    if (account.previousNames && Array.isArray(account.previousNames)) {
      account.previousNames.forEach(name => allPreviousNames.add(name));
    }
  });
  
  // Update surviving account with all previous names
  survivingAccount.previousNames = Array.from(allPreviousNames);
  survivingAccount.updatedAt = new Date().toISOString();
  
  // Transfer all history entries from merged accounts to surviving account
  const mergedAccountIds = mergedAccounts.map(a => a.id);
  data.history.forEach(entry => {
    if (mergedAccountIds.includes(entry.accountId)) {
      entry.accountId = survivingAccount.id;
      // Keep original accountName for audit trail, but mark as transferred
      if (!entry.originalAccountName) {
        entry.originalAccountName = entry.accountName;
      }
      entry.accountName = survivingAccount.name;
      entry.transferredToAccount = survivingAccount.id;
    }
  });
  
  // Create audit log entry for the merge
  const mergeAuditEntry = {
    accountId: survivingAccount.id,
    accountName: survivingAccount.name,
    type: 'accounts_merged',
    timestamp: new Date().toISOString(),
    mergedAccountIds: mergedAccountIds,
    mergedAccountNames: mergedAccounts.map(a => a.name),
    survivingAccountId: survivingAccount.id,
    survivingAccountName: survivingAccount.name,
    previousNames: Array.from(allPreviousNames)
  };
  
  data.history.push(mergeAuditEntry);
  
  // Keep only last MAX_HISTORY_ENTRIES entries to prevent file bloat
  if (data.history.length > MAX_HISTORY_ENTRIES) {
    data.history = data.history.slice(-MAX_HISTORY_ENTRIES);
  }
  
  // Remove merged accounts from accounts array
  data.accounts = data.accounts.filter(a => !mergedAccountIds.includes(a.id));
  
  // Save the updated data
  const saveResult = saveFinanceData(data);
  
  if (saveResult.success) {
    return {
      success: true,
      survivingAccount: survivingAccount,
      mergedCount: mergedAccounts.length,
      mergedAccountNames: mergedAccounts.map(a => a.name),
      previousNames: survivingAccount.previousNames
    };
  } else {
    return saveResult;
  }
}

// Unmerge a previously merged account
function unmergeAccount(accountId, manualBalances = {}) {
  const data = loadFinanceData();
  
  // Find the account to unmerge
  const mergedAccount = data.accounts.find(a => a.id === accountId);
  if (!mergedAccount) {
    return { success: false, error: 'Account not found' };
  }
  
  // Check if this account has merge history
  if (!mergedAccount.previousNames || mergedAccount.previousNames.length === 0) {
    return { success: false, error: 'This account has no merge history' };
  }
  
  // Find the merge audit entry
  const mergeEntry = data.history.find(h => 
    h.type === 'accounts_merged' && 
    h.survivingAccountId === accountId
  );
  
  if (!mergeEntry) {
    return { success: false, error: 'Merge audit trail not found' };
  }
  
  // Create new accounts for each previously merged account
  const recreatedAccounts = [];
  const mergedAccountNames = mergeEntry.mergedAccountNames || [];
  const mergedAccountIds = mergeEntry.mergedAccountIds || [];
  
  for (let i = 0; i < mergedAccountNames.length; i++) {
    const originalName = mergedAccountNames[i];
    const originalId = mergedAccountIds[i];
    
    // Generate new ID for recreated account using crypto for better uniqueness
    const newAccountId = crypto.randomUUID();
    
    // Determine the balance for this account
    let accountBalance = 0;
    
    // Check if manual balance is provided
    if (manualBalances[originalName] !== undefined) {
      accountBalance = parseFloat(manualBalances[originalName]);
    } else {
      // Try to find the last balance before merge from history
      const accountHistory = data.history.filter(h => 
        h.originalAccountName === originalName ||
        (h.accountName === originalName && h.transferredToAccount)
      );
      
      if (accountHistory.length > 0) {
        // Find the last entry before the merge
        const lastEntry = accountHistory
          .filter(h => h.type === 'balance_update' && h.timestamp < mergeEntry.timestamp)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        if (lastEntry && lastEntry.newBalance !== undefined) {
          accountBalance = parseFloat(lastEntry.newBalance);
        }
      }
    }
    
    // Create the recreated account
    const recreatedAccount = {
      id: newAccountId,
      name: originalName,
      type: mergedAccount.type, // Use same type as merged account
      currentValue: accountBalance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: `Unmerged from "${mergedAccount.displayName || mergedAccount.name}" on ${new Date().toISOString().split('T')[0]}`,
      originalMergedAccountId: originalId // Track original ID for reference
    };
    
    data.accounts.push(recreatedAccount);
    recreatedAccounts.push(recreatedAccount);
    
    // Restore history entries for this account
    const historyToRestore = data.history.filter(h => 
      h.originalAccountName === originalName ||
      (h.accountId === accountId && h.originalAccountName === originalName)
    );
    
    // Create copies of history entries with the new account ID
    historyToRestore.forEach(entry => {
      if (entry.type === 'balance_update' && entry.timestamp < mergeEntry.timestamp) {
        const restoredEntry = {
          ...entry,
          accountId: newAccountId,
          accountName: originalName,
          restoredFromMerge: true,
          restoredAt: new Date().toISOString()
        };
        // Remove the transferred flag
        delete restoredEntry.transferredToAccount;
        data.history.push(restoredEntry);
      }
    });
    
    // Add initial balance history entry for the recreated account
    const initialHistoryEntry = {
      accountId: newAccountId,
      accountName: originalName,
      type: 'balance_update',
      timestamp: new Date().toISOString(),
      newBalance: accountBalance,
      oldBalance: accountBalance,
      change: 0,
      note: `Account recreated from unmerge operation${manualBalances[originalName] !== undefined ? ' (manual balance set)' : ' (balance restored from history)'}`
    };
    data.history.push(initialHistoryEntry);
  }
  
  // Clear the previousNames from the surviving account
  mergedAccount.previousNames = [];
  mergedAccount.updatedAt = new Date().toISOString();
  
  // Create audit log entry for the unmerge
  const unmergeAuditEntry = {
    accountId: accountId,
    accountName: mergedAccount.displayName || mergedAccount.name,
    type: 'accounts_unmerged',
    timestamp: new Date().toISOString(),
    originalMergeTimestamp: mergeEntry.timestamp,
    recreatedAccountIds: recreatedAccounts.map(a => a.id),
    recreatedAccountNames: recreatedAccounts.map(a => a.name),
    manualBalancesUsed: Object.keys(manualBalances).length > 0,
    sourceAccountId: accountId,
    sourceAccountName: mergedAccount.displayName || mergedAccount.name
  };
  
  data.history.push(unmergeAuditEntry);
  
  // Keep only last MAX_HISTORY_ENTRIES entries to prevent file bloat
  if (data.history.length > MAX_HISTORY_ENTRIES) {
    data.history = data.history.slice(-MAX_HISTORY_ENTRIES);
  }
  
  // Save the updated data
  const saveResult = saveFinanceData(data);
  
  if (saveResult.success) {
    return {
      success: true,
      sourceAccount: mergedAccount,
      recreatedAccounts: recreatedAccounts,
      recreatedAccountIds: recreatedAccounts.map(a => a.id),
      recreatedCount: recreatedAccounts.length,
      recreatedAccountNames: recreatedAccounts.map(a => a.name)
    };
  } else {
    return saveResult;
  }
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
  
  // Keep only last MAX_HISTORY_ENTRIES entries to prevent file bloat
  if (data.history.length > MAX_HISTORY_ENTRIES) {
    data.history = data.history.slice(-MAX_HISTORY_ENTRIES);
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

// Get advanced settings
function getAdvancedSettings() {
  const data = loadFinanceData();
  return data.advancedSettings || getDefaultFinanceData().advancedSettings;
}

// Update advanced settings
function updateAdvancedSettings(settings) {
  const data = loadFinanceData();
  data.advancedSettings = { ...data.advancedSettings, ...settings };
  return saveFinanceData(data);
}

// Add historical data point
function addHistoryEntry(entry) {
  const data = loadFinanceData();
  
  if (!entry.timestamp) {
    entry.timestamp = new Date().toISOString();
  }
  
  data.history.push(entry);
  
  // Keep only last MAX_HISTORY_ENTRIES entries to prevent file bloat
  if (data.history.length > MAX_HISTORY_ENTRIES) {
    data.history = data.history.slice(-MAX_HISTORY_ENTRIES);
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

// Calculate retirement planning evaluation using Monte Carlo simulation
function evaluateRetirementPlan() {
  const data = loadFinanceData();
  const demographics = data.demographics;
  const accounts = data.accounts;
  const history = data.history || [];
  const advancedSettings = data.advancedSettings || getDefaultFinanceData().advancedSettings;
  
  // Validate required inputs
  const currentAge = demographics.age;
  const retirementAge = demographics.retirementAge || 65;
  const annualRetirementSpending = demographics.annualRetirementSpending;
  const annualIncome = demographics.annualIncome;
  
  if (!currentAge) {
    return { 
      success: false, 
      error: 'Current age is required for retirement planning' 
    };
  }
  
  if (!annualRetirementSpending || annualRetirementSpending <= 0) {
    return { 
      success: false, 
      error: 'Annual retirement spending goal is required' 
    };
  }
  
  if (currentAge >= retirementAge) {
    return { 
      success: false, 
      error: 'Current age must be less than retirement age' 
    };
  }
  
  // Calculate current total assets (excluding liabilities and future income)
  let totalAssets = 0;
  let retirementAccounts = 0;
  let investmentAccounts = 0;
  let cashAccounts = 0;
  let futureIncome = 0;
  
  accounts.forEach(account => {
    const type = ACCOUNT_TYPES[account.type];
    if (type) {
      const value = parseFloat(account.currentValue) || 0;
      
      if (type.category === 'retirement') {
        retirementAccounts += value;
        totalAssets += value;
      } else if (type.category === 'investments') {
        investmentAccounts += value;
        totalAssets += value;
      } else if (type.category === 'cash') {
        cashAccounts += value;
        totalAssets += value;
      } else if (type.category === 'real_estate') {
        totalAssets += value;
      } else if (type.category === 'future_income') {
        // Calculate present value of future income streams
        const monthlyPayment = parseFloat(account.expectedMonthlyPayment) || 0;
        const startAge = parseFloat(account.startAge) || retirementAge;
        if (monthlyPayment > 0 && startAge >= retirementAge) {
          // Assume 25 years of payments (to age 90)
          const yearsOfPayments = Math.max(0, 90 - startAge);
          futureIncome += monthlyPayment * 12 * yearsOfPayments;
        }
      }
    }
  });
  
  // Calculate historical growth rate if we have at least 3 months of data
  let annualGrowthRate = 0.07; // Default 7% nominal return
  let hasHistoricalData = false;
  
  if (history.length >= 3) {
    const balanceUpdates = history.filter(h => h.type === 'balance_update');
    
    if (balanceUpdates.length >= 3) {
      // Group by account and calculate growth
      const accountGrowth = {};
      
      balanceUpdates.forEach(update => {
        if (!accountGrowth[update.accountId]) {
          accountGrowth[update.accountId] = [];
        }
        accountGrowth[update.accountId].push({
          date: new Date(update.balanceDate || update.timestamp),
          balance: update.newBalance
        });
      });
      
      // Calculate growth rate for accounts with multiple data points
      let totalGrowthRate = 0;
      let accountsWithGrowth = 0;
      
      Object.keys(accountGrowth).forEach(accountId => {
        const updates = accountGrowth[accountId].sort((a, b) => a.date - b.date);
        
        if (updates.length >= 2) {
          const firstUpdate = updates[0];
          const lastUpdate = updates[updates.length - 1];
          const daysDiff = (lastUpdate.date - firstUpdate.date) / (1000 * 60 * 60 * 24);
          
          if (daysDiff > 30 && firstUpdate.balance > 0) {
            const growth = (lastUpdate.balance - firstUpdate.balance) / firstUpdate.balance;
            const annualizedGrowth = growth * (365 / daysDiff);
            
            // Cap extreme values
            if (annualizedGrowth >= -0.5 && annualizedGrowth <= 2.0) {
              totalGrowthRate += annualizedGrowth;
              accountsWithGrowth++;
            }
          }
        }
      });
      
      if (accountsWithGrowth > 0) {
        annualGrowthRate = totalGrowthRate / accountsWithGrowth;
        hasHistoricalData = true;
      }
    }
  }
  
  // Set return assumptions based on risk tolerance and historical data
  let expectedReturn = annualGrowthRate;
  let returnVolatility = 0.15; // 15% standard deviation
  
  const riskTolerance = demographics.riskTolerance || 'moderate';
  
  if (!hasHistoricalData) {
    // Use standard assumptions if no historical data
    if (riskTolerance === 'conservative') {
      expectedReturn = advancedSettings.conservativeReturn || 0.05; // 5%
      returnVolatility = advancedSettings.conservativeVolatility || 0.10; // 10%
    } else if (riskTolerance === 'moderate') {
      expectedReturn = advancedSettings.moderateReturn || 0.07; // 7%
      returnVolatility = advancedSettings.moderateVolatility || 0.15; // 15%
    } else { // aggressive
      expectedReturn = advancedSettings.aggressiveReturn || 0.09; // 9%
      returnVolatility = advancedSettings.aggressiveVolatility || 0.20; // 20%
    }
  } else {
    // Adjust volatility based on risk tolerance even with historical data
    if (riskTolerance === 'conservative') {
      returnVolatility = advancedSettings.conservativeVolatility || 0.10;
    } else if (riskTolerance === 'moderate') {
      returnVolatility = advancedSettings.moderateVolatility || 0.15;
    } else {
      returnVolatility = advancedSettings.aggressiveVolatility || 0.20;
    }
  }
  
  // Calculate savings needed
  const yearsUntilRetirement = retirementAge - currentAge;
  const yearsInRetirement = advancedSettings.yearsInRetirement || 30; // Assume 30 years in retirement (to age 95)
  const inflationRate = advancedSettings.inflationRate || 0.03; // 3% inflation
  
  // Annual contribution (from income if provided)
  const annualContribution = annualIncome ? Math.max(0, annualIncome * (advancedSettings.savingsRate || 0.15)) : 0; // Use savings rate from settings
  
  // Monte Carlo Simulation
  const numSimulations = advancedSettings.monteCarloSimulations || 10000;
  let successfulSimulations = 0;
  
  // Helper function for normal distribution (Box-Muller transform)
  function randomNormal(mean, stdDev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
  
  for (let sim = 0; sim < numSimulations; sim++) {
    let portfolioValue = totalAssets;
    
    // Accumulation phase (until retirement)
    for (let year = 0; year < yearsUntilRetirement; year++) {
      // Random return for this year
      const yearReturn = randomNormal(expectedReturn, returnVolatility);
      portfolioValue = portfolioValue * (1 + yearReturn) + annualContribution;
    }
    
    // Add future income present value at retirement
    portfolioValue += futureIncome * Math.pow(1 / (1 + inflationRate), yearsUntilRetirement);
    
    // Distribution phase (retirement)
    let retirementSpending = annualRetirementSpending;
    let remainingValue = portfolioValue;
    
    for (let year = 0; year < yearsInRetirement; year++) {
      // Withdraw annual spending (adjusted for inflation)
      remainingValue -= retirementSpending;
      
      if (remainingValue <= 0) {
        break; // Ran out of money
      }
      
      // Random return for this year
      const yearReturn = randomNormal(expectedReturn * (advancedSettings.retirementReturnAdjustment || 0.7), returnVolatility * (advancedSettings.retirementVolatilityAdjustment || 0.8)); // Lower returns in retirement (bonds)
      remainingValue = remainingValue * (1 + yearReturn);
      
      // Increase spending for inflation
      retirementSpending *= (1 + inflationRate);
    }
    
    // Simulation successful if money remains after 30 years
    if (remainingValue > 0) {
      successfulSimulations++;
    }
  }
  
  const successProbability = (successfulSimulations / numSimulations * 100).toFixed(1);
  
  // Calculate additional metrics
  const projectedPortfolioAtRetirement = totalAssets * Math.pow(1 + expectedReturn, yearsUntilRetirement) + 
    (annualContribution * (Math.pow(1 + expectedReturn, yearsUntilRetirement) - 1) / expectedReturn);
  
  const totalNeeded = annualRetirementSpending * yearsInRetirement * Math.pow(1 + inflationRate, yearsUntilRetirement / 2);
  const shortfall = Math.max(0, totalNeeded - projectedPortfolioAtRetirement);
  
  // Generate recommendation based on success probability
  let recommendation = '';
  let status = 'good';
  
  if (parseFloat(successProbability) >= 80) {
    status = 'excellent';
    recommendation = 'Your retirement plan shows a high likelihood of success. Continue with your current savings strategy and review annually.';
  } else if (parseFloat(successProbability) >= 60) {
    status = 'good';
    recommendation = 'Your retirement plan is on track but has some risk. Consider increasing savings or adjusting spending expectations.';
  } else if (parseFloat(successProbability) >= 40) {
    status = 'concerning';
    recommendation = 'Your retirement plan shows moderate risk of running out of money. Consider significantly increasing savings, delaying retirement, or reducing spending expectations.';
  } else {
    status = 'critical';
    recommendation = 'Your retirement plan shows high risk of failure. Urgent action needed: increase savings dramatically, plan to work longer, or substantially reduce retirement spending expectations.';
  }
  
  return {
    success: true,
    successProbability: parseFloat(successProbability),
    status,
    recommendation,
    assumptions: {
      currentAge,
      retirementAge,
      yearsUntilRetirement,
      currentAssets: totalAssets,
      annualContribution,
      expectedReturn: (expectedReturn * 100).toFixed(1) + '%',
      returnVolatility: (returnVolatility * 100).toFixed(1) + '%',
      inflationRate: (inflationRate * 100).toFixed(1) + '%',
      annualRetirementSpending,
      yearsInRetirement,
      hasHistoricalGrowthData: hasHistoricalData
    },
    projections: {
      projectedPortfolioAtRetirement: Math.round(projectedPortfolioAtRetirement),
      totalNeededForRetirement: Math.round(totalNeeded),
      shortfall: Math.round(shortfall),
      futureIncomeValue: Math.round(futureIncome)
    },
    methodology: 'Monte Carlo simulation with ' + numSimulations + ' iterations'
  };
}

// Generate demo data with proper allocation and historical data
function getDemoData() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  // Calculate 6 months ago from current date
  const sixMonthsAgo = new Date(currentYear, currentMonth - 6, 1);
  
  // Demo demographics - Age 40, Retirement 65, SS $3000/month
  const demographics = {
    age: 40,
    annualIncome: 120000,
    retirementAge: 65,
    retirementYear: currentYear + 25,
    annualRetirementSpending: 80000,
    riskTolerance: 'moderate'
  };
  
  // Target allocations for age 40, moderate risk
  // Based on getRecommendations() logic:
  // Normalized: cash: 9.5%, investments: 59.5%, retirement: 19.0%, real_estate: 11.9%
  // We'll set balances to be within ±10% of these targets
  // Actual: cash: 11% (+1.5%), investments: 62% (+2.5%), retirement: 27% (+8.0%)
  
  const totalAssets = 450000; // Total portfolio value
  
  // Cash: 11% = $49,500 (within +10% of 9.5% target)
  const checkingBalance = 12375;
  const savingsBalance = 32175;
  const hsaBalance = 4950;
  
  // Investments: 62% = $279,000 (within +10% of 59.5% target)
  const brokerageBalance = 279000;
  
  // Retirement: 27% = $121,500 (within +10% of 19.0% target)
  const ira401kBalance = 75330;
  const rothIraBalance = 46170;
  
  // Social Security - future income
  const socialSecurityMonthly = 3000;
  
  const demoAccounts = [
    {
      id: 'demo-checking',
      name: 'Demo Checking Account',
      type: 'checking',
      currentValue: checkingBalance,
      startDate: new Date(currentYear - 5, 0, 1).toISOString(),
      notes: 'Primary checking account for daily expenses',
      updatedAt: now.toISOString()
    },
    {
      id: 'demo-savings',
      name: 'Demo High-Yield Savings',
      type: 'savings',
      currentValue: savingsBalance,
      startDate: new Date(currentYear - 5, 0, 1).toISOString(),
      notes: 'Emergency fund and short-term savings',
      updatedAt: now.toISOString()
    },
    {
      id: 'demo-401k',
      name: 'Demo 401(k) Retirement',
      type: '401k',
      currentValue: ira401kBalance,
      startDate: new Date(currentYear - 10, 0, 1).toISOString(),
      notes: 'Employer-sponsored retirement account',
      updatedAt: now.toISOString()
    },
    {
      id: 'demo-roth-ira',
      name: 'Demo Roth IRA',
      type: 'roth_ira',
      currentValue: rothIraBalance,
      startDate: new Date(currentYear - 8, 0, 1).toISOString(),
      notes: 'Tax-advantaged retirement savings',
      updatedAt: now.toISOString()
    },
    {
      id: 'demo-brokerage',
      name: 'Demo Brokerage Account',
      type: 'stocks',
      currentValue: brokerageBalance,
      startDate: new Date(currentYear - 7, 0, 1).toISOString(),
      notes: 'Individual stock and ETF investments',
      updatedAt: now.toISOString()
    },
    {
      id: 'demo-hsa',
      name: 'Demo Health Savings Account',
      type: 'savings',
      currentValue: hsaBalance,
      startDate: new Date(currentYear - 3, 0, 1).toISOString(),
      notes: 'HSA for medical expenses',
      updatedAt: now.toISOString()
    },
    {
      id: 'demo-social-security',
      name: 'Social Security Benefits',
      type: 'social_security',
      currentValue: 0,
      monthlyPayment: socialSecurityMonthly,
      startAge: 67,
      startDate: new Date(currentYear, 0, 1).toISOString(),
      notes: 'Expected Social Security benefits at full retirement age',
      updatedAt: now.toISOString()
    }
  ];
  
  // Generate 6 months of historical data with realistic growth
  const history = [];
  const accounts = [...demoAccounts].filter(acc => acc.type !== 'social_security'); // Exclude future income from history
  
  for (let i = 6; i >= 0; i--) {
    const historyDate = new Date(currentYear, currentMonth - i, 1);
    
    accounts.forEach(account => {
      // Calculate historical value with slight growth/fluctuation
      // More recent = closer to current value
      const growthFactor = 1 - (i * 0.008); // ~0.8% decline per month backwards
      const randomFluctuation = 0.98 + (Math.random() * 0.04); // ±2% random
      const historicalValue = account.currentValue * growthFactor * randomFluctuation;
      
      history.push({
        accountId: account.id,
        balance: Math.round(historicalValue * 100) / 100,
        timestamp: historyDate.toISOString()
      });
    });
  }
  
  return {
    accounts: demoAccounts,
    demographics: demographics,
    history: history
  };
}

// Get demo accounts
function getDemoAccounts() {
  const demoData = getDemoData();
  return demoData.accounts;
}

// Get demo demographics
function getDemoDemographics() {
  const demoData = getDemoData();
  return demoData.demographics;
}

// Get demo history
function getDemoHistory(accountId = null, startDate = null, endDate = null) {
  const demoData = getDemoData();
  let history = demoData.history;
  
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

// Get demo recommendations
function getDemoRecommendations() {
  const demoData = getDemoData();
  const demographics = demoData.demographics;
  const accounts = demoData.accounts;
  
  // Calculate current allocation using same logic as getRecommendations()
  const age = demographics.age;
  const riskTolerance = demographics.riskTolerance;
  
  // Calculate totals by category
  const categoryTotals = {
    cash: 0,
    investments: 0,
    retirement: 0,
    real_estate: 0,
    future_income: 0,
    liabilities: 0
  };
  
  let totalValue = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  
  accounts.forEach(account => {
    const type = ACCOUNT_TYPES[account.type];
    if (!type) return;
    
    const value = parseFloat(account.currentValue) || 0;
    
    if (type.category === 'liabilities') {
      totalLiabilities += value;
      categoryTotals.liabilities += value;
    } else {
      totalAssets += value;
      if (type.category !== 'future_income') {
        totalValue += value;
      }
    }
    
    if (categoryTotals.hasOwnProperty(type.category)) {
      categoryTotals[type.category] += value;
    }
  });
  
  const netWorth = totalAssets - totalLiabilities;
  
  // Calculate current allocation percentages
  const currentAllocation = {};
  Object.keys(categoryTotals).forEach(key => {
    if (totalValue > 0 && key !== 'liabilities' && key !== 'future_income') {
      currentAllocation[key] = (categoryTotals[key] / totalValue) * 100;
    } else {
      currentAllocation[key] = 0;
    }
  });
  
  // Calculate recommended allocation (same logic as getRecommendations)
  let recommendedAllocation = {};
  
  if (riskTolerance === 'conservative') {
    recommendedAllocation = {
      cash: Math.min(20, age * 0.3),
      investments: Math.max(30, 90 - age),
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
  } else {
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
    recommendedAllocation[key] = (recommendedAllocation[key] / total) * 100;
  });
  
  // Generate recommendations
  const recommendations = [];
  Object.keys(currentAllocation).forEach(category => {
    if (category === 'future_income' || category === 'liabilities') return;
    
    const current = currentAllocation[category];
    const recommended = recommendedAllocation[category];
    const diff = current - recommended;
    
    if (Math.abs(diff) > 5) {
      const categoryName = category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      if (diff > 0) {
        recommendations.push(`${categoryName}: ${diff.toFixed(1)}% over-allocated. Consider rebalancing.`);
      } else {
        recommendations.push(`${categoryName}: ${Math.abs(diff).toFixed(1)}% under-allocated. Consider increasing allocation.`);
      }
    }
  });
  
  const explanation = generateRecommendationExplanation({
    demographics,
    currentAllocation,
    recommendedAllocation,
    recommendations,
    accounts
  });
  
  const debtToAssetRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
  
  return {
    currentAllocation,
    recommendedAllocation,
    recommendations: recommendations.length > 0 ? recommendations : ['Your portfolio allocation looks good!'],
    totalValue,
    totalAssets,
    totalLiabilities,
    netWorth,
    debtToAssetRatio,
    accountCount: accounts.length,
    explanation
  };
}

// Evaluate demo retirement plan
function evaluateDemoRetirementPlan() {
  const demoData = getDemoData();
  const demographics = demoData.demographics;
  const accounts = demoData.accounts;
  const history = demoData.history;
  
  // Get advanced settings from user's data (or use defaults for demo)
  const userData = loadFinanceData();
  const advancedSettings = userData.advancedSettings || getDefaultFinanceData().advancedSettings;
  
  // Use same logic as evaluateRetirementPlan but with demo data
  const age = demographics.age;
  const retirementAge = demographics.retirementAge || 65;
  const annualIncome = demographics.annualIncome || 0;
  const annualRetirementSpending = demographics.annualRetirementSpending || annualIncome * 0.8;
  const riskTolerance = demographics.riskTolerance || 'moderate';
  
  if (!age || age >= retirementAge) {
    return {
      success: false,
      error: 'Please set your current age and planned retirement age in the profile section above.'
    };
  }
  
  const yearsUntilRetirement = retirementAge - age;
  const yearsInRetirement = advancedSettings.yearsInRetirement || 30; // Assume retirement lasts until age 95
  
  // Calculate current assets
  let currentAssets = 0;
  let futureIncome = 0;
  
  accounts.forEach(account => {
    const type = ACCOUNT_TYPES[account.type];
    if (!type) return;
    
    const value = parseFloat(account.currentValue) || 0;
    
    if (type.category === 'future_income') {
      const monthlyPayment = parseFloat(account.monthlyPayment) || 0;
      const startAge = parseInt(account.startAge) || retirementAge;
      const yearsReceiving = Math.max(0, 95 - startAge);
      futureIncome += (monthlyPayment * 12 * yearsReceiving);
    } else if (type.category !== 'liabilities') {
      currentAssets += value;
    }
  });
  
  // Expected return and volatility based on risk tolerance
  let expectedReturn = advancedSettings.moderateReturn || 0.07;
  let returnVolatility = advancedSettings.moderateVolatility || 0.15;
  
  if (riskTolerance === 'conservative') {
    expectedReturn = advancedSettings.conservativeReturn || 0.05;
    returnVolatility = advancedSettings.conservativeVolatility || 0.10;
  } else if (riskTolerance === 'aggressive') {
    expectedReturn = advancedSettings.aggressiveReturn || 0.09;
    returnVolatility = advancedSettings.aggressiveVolatility || 0.20;
  }
  
  const inflationRate = advancedSettings.inflationRate || 0.03;
  const realReturn = expectedReturn - inflationRate;
  const annualContribution = annualIncome * (advancedSettings.savingsRate || 0.15); // Use savings rate from settings
  
  // Monte Carlo simulation
  const numSimulations = advancedSettings.monteCarloSimulations || 10000;
  let successCount = 0;
  
  for (let sim = 0; sim < numSimulations; sim++) {
    let portfolio = currentAssets;
    
    // Growth phase (until retirement)
    for (let year = 0; year < yearsUntilRetirement; year++) {
      const randomReturn = expectedReturn + (returnVolatility * (Math.random() * 2 - 1));
      portfolio = portfolio * (1 + randomReturn) + annualContribution;
    }
    
    // Drawdown phase (retirement)
    let retirementPortfolio = portfolio;
    let survived = true;
    
    for (let year = 0; year < yearsInRetirement; year++) {
      const randomReturn = expectedReturn + (returnVolatility * (Math.random() * 2 - 1));
      const inflationAdjustedSpending = annualRetirementSpending * Math.pow(1 + inflationRate, year);
      
      retirementPortfolio = retirementPortfolio * (1 + randomReturn) - inflationAdjustedSpending;
      
      if (retirementPortfolio < 0) {
        survived = false;
        break;
      }
    }
    
    if (survived) {
      successCount++;
    }
  }
  
  const successProbability = Math.round((successCount / numSimulations) * 100);
  
  // Calculate projected values
  const projectedPortfolioAtRetirement = currentAssets * Math.pow(1 + realReturn, yearsUntilRetirement) + 
    annualContribution * ((Math.pow(1 + realReturn, yearsUntilRetirement) - 1) / realReturn);
  
  const totalNeeded = annualRetirementSpending * ((1 - Math.pow(1 + realReturn, -yearsInRetirement)) / realReturn);
  const shortfall = Math.max(0, totalNeeded - projectedPortfolioAtRetirement - futureIncome);
  
  // Determine status and recommendation
  let status = 'unknown';
  let recommendation = '';
  
  if (successProbability >= 90) {
    status = 'excellent';
    recommendation = 'Your retirement plan is on excellent track! Keep up the good work.';
  } else if (successProbability >= 75) {
    status = 'good';
    recommendation = 'Your retirement plan looks good, but consider increasing savings for more security.';
  } else if (successProbability >= 50) {
    status = 'concerning';
    recommendation = 'Your retirement plan needs attention. Consider increasing savings or adjusting retirement age.';
  } else {
    status = 'critical';
    recommendation = 'Your retirement plan requires immediate action. Significantly increase savings or延後 retirement.';
  }
  
  return {
    success: true,
    successProbability,
    status,
    recommendation,
    assumptions: {
      currentAge: age,
      retirementAge,
      yearsUntilRetirement,
      currentAssets: Math.round(currentAssets),
      annualContribution: Math.round(annualContribution),
      expectedReturn: (expectedReturn * 100).toFixed(1) + '%',
      returnVolatility: (returnVolatility * 100).toFixed(1) + '%',
      inflationRate: (inflationRate * 100).toFixed(1) + '%',
      annualRetirementSpending,
      yearsInRetirement,
      hasHistoricalGrowthData: true
    },
    projections: {
      projectedPortfolioAtRetirement: Math.round(projectedPortfolioAtRetirement),
      totalNeededForRetirement: Math.round(totalNeeded),
      shortfall: Math.round(shortfall),
      futureIncomeValue: Math.round(futureIncome)
    },
    methodology: 'Monte Carlo simulation with ' + numSimulations + ' iterations'
  };
}

// Process uploaded screenshot and extract account data
async function processAccountScreenshot(imagePath, asOfDate = null) {
  try {
    console.log('🔍 [Finance] Processing account screenshot with OCR...');
    
    // If no asOfDate provided, use current date
    const effectiveDate = asOfDate || new Date().toISOString().split('T')[0];
    console.log(`📅 [Finance] Using As Of date: ${effectiveDate}`);
    
    // Perform OCR on the image
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`📖 [Finance] OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    console.log('✅ [Finance] OCR completed, parsing account data...');
    
    // Parse the extracted text to find accounts and balances
    const parseResult = parseAccountsFromText(text);
    
    // Delete the uploaded image file for security
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
        console.log('🗑️ [Finance] Deleted uploaded image for security');
      }
    } catch (err) {
      console.error('⚠️ [Finance] Failed to delete image:', err.message);
    }
    
    if (!parseResult.success) {
      return parseResult;
    }
    
    // Update or create accounts from parsed data with the specified date
    const result = await updateAccountsFromParsedData(parseResult.accounts, parseResult.groups, parseResult.netWorth, effectiveDate);
    
    return result;
  } catch (error) {
    console.error('❌ [Finance] Error processing screenshot:', error.message);
    
    // Try to clean up the image file even on error
    try {
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    } catch (err) {
      // Ignore cleanup errors
    }
    
    return {
      success: false,
      error: 'Failed to process image: ' + error.message
    };
  }
}

// Parse account information from OCR text
function parseAccountsFromText(text) {
  try {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Extract net worth (usually at the top with $ sign and larger amount)
    let netWorth = null;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const match = lines[i].match(/\$\s*(\d{1,3}(?:,\d{3})+)/);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (amount > 10000) { // Likely net worth if > $10k
          netWorth = amount;
          break;
        }
      }
    }
    
    // Category/group keywords to identify sections
    const categoryKeywords = {
      'cash': ['cash'],
      'investments': ['investments', 'investment'],
      'real_estate': ['real estate', 'real-estate'],
      'liabilities': ['liabilities']
    };
    
    const accounts = [];
    const groups = {};
    let currentCategory = null;
    
    // Skip words that are common UI elements, not account names
    // Note: Removed 'individual' from skipWords to allow accounts like "Individual Cash Account"
    const skipWords = ['today', 'april', 'march', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
                       'goals', 'days ago', 'day ago', 'hours ago', 'hour ago', 
                       'temporarily down', 'temporarily', 'apy', 'employer plan', 'build your', 'wealthfront'];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      
      // Skip common UI elements and very short lines
      if (skipWords.some(word => lowerLine.includes(word)) || line.length < 3) {
        continue;
      }
      
      // Check if this line is a category header (exact match preferred)
      let foundCategory = false;
      for (const [category, keywords] of Object.entries(categoryKeywords)) {
        // Check for exact or very close match
        if (keywords.some(keyword => {
          const normalized = lowerLine.replace(/[^a-z\s]/g, '').trim();
          return normalized === keyword || normalized.startsWith(keyword + ' ');
        })) {
          currentCategory = category;
          foundCategory = true;
          
          // Try to extract group total from same line or nearby lines
          const amountMatch = line.match(/\$\s*(\d{1,3}(?:,\d{3})*)/);
          if (amountMatch) {
            groups[category] = parseFloat(amountMatch[1].replace(/,/g, ''));
          } else {
            // Look ahead a few lines for the total
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
              const nextAmountMatch = lines[j].match(/^\$?\s*(\d{1,3}(?:,\d{3})*)\s*$/);
              if (nextAmountMatch) {
                groups[category] = parseFloat(nextAmountMatch[1].replace(/,/g, ''));
                break;
              }
            }
          }
          break;
        }
      }
      
      if (foundCategory) {
        continue; // Skip to next line after identifying category
      }
      
      // Only process lines if we're in a category
      if (!currentCategory) {
        continue;
      }
      
      // Try to extract account name and balance
      let accountName = null;
      let balance = null;
      
      // Check if line contains a dollar amount
      const dollarMatch = line.match(/\$(\d{1,3}(?:,\d{3})*)/);
      const numberMatch = line.match(/(\d{1,3}(?:,\d{3})*)\s*$/);
      
      if (dollarMatch || numberMatch) {
        // Extract the amount
        const amountStr = dollarMatch ? dollarMatch[1] : (numberMatch ? numberMatch[1] : null);
        if (amountStr) {
          balance = parseFloat(amountStr.replace(/,/g, ''));
          
          // Extract account name (everything before the amount)
          let nameStr = line;
          if (dollarMatch) {
            nameStr = line.substring(0, dollarMatch.index).trim();
          } else if (numberMatch) {
            nameStr = line.substring(0, numberMatch.index).trim();
          }
          
          // Clean up the name
          accountName = nameStr
            .replace(/\$+/g, '') // Remove any dollar signs
            .replace(/^\d+\s*/, '') // Remove leading numbers
            .replace(/^[a-z]{1,3}(?=[A-Z])/, '') // Remove lowercase icon prefix (e.g., "an", "ab")
            .replace(/[^\w\s\-&()\/]/g, ' ') // Remove special chars except basic ones
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
          
          // Remove single uppercase letter icon prefix (e.g., "G"), but not common words like "A", "I"
          // Note: Add more common single-letter words to this list if needed (e.g., 'u' for U.S.)
          const singleLetterMatch = accountName.match(/^([A-Z])\s/);
          if (singleLetterMatch) {
            const letter = singleLetterMatch[1].toLowerCase();
            const commonWords = ['a', 'i']; // Common single-letter words that are valid account name prefixes
            if (!commonWords.includes(letter)) {
              accountName = accountName.replace(/^[A-Z]\s/, '');
            }
          }
        }
      }
      
      // If no amount on this line, check if next line has just an amount
      if (!accountName && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextMatch = nextLine.match(/^\$?\s*(\d{1,3}(?:,\d{3})*)\s*$/);
        
        if (nextMatch) {
          accountName = line
            .replace(/^[a-z]{1,3}(?=[A-Z])/, '') // Remove lowercase icon prefix
            .replace(/[^\w\s\-&()\/]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          // Remove single uppercase letter icon prefix (e.g., "G"), but not common words like "A", "I"
          // Note: Add more common single-letter words to this list if needed (e.g., 'u' for U.S.)
          const singleLetterMatch = accountName.match(/^([A-Z])\s/);
          if (singleLetterMatch) {
            const letter = singleLetterMatch[1].toLowerCase();
            const commonWords = ['a', 'i']; // Common single-letter words that are valid account name prefixes
            if (!commonWords.includes(letter)) {
              accountName = accountName.replace(/^[A-Z]\s/, '');
            }
          }
          
          balance = parseFloat(nextMatch[1].replace(/,/g, ''));
          i++; // Skip the next line
        }
      }
      
      if (accountName && balance !== null && accountName.length >= 3 && accountName.length <= 100) {
        // Filter out category names and skip words
        // Only reject if accountName IS a category keyword, not just contains it
        const isCategoryName = Object.values(categoryKeywords).flat().some(kw => 
          accountName.toLowerCase() === kw || accountName.toLowerCase() === kw.replace('-', ' ')
        );
        const isSkipWord = skipWords.some(word => accountName.toLowerCase().includes(word));
        
        // Allow all account names unless they're category names or skip words
        // Removed isGenericName filter to allow accounts like "Individual Cash Account"
        if (!isCategoryName && !isSkipWord && balance >= 0) {
          // Check for duplicates
          const duplicate = accounts.find(a => 
            a.name.toLowerCase() === accountName.toLowerCase() && Math.abs(a.balance - balance) < 1
          );
          
          if (!duplicate) {
            accounts.push({
              name: accountName,
              balance: balance,
              category: currentCategory
            });
          }
        }
      }
    }
    
    if (accounts.length === 0) {
      return {
        success: false,
        error: 'Could not extract any account information from the image. Please ensure the image is clear and contains account details.',
        rawText: text.substring(0, 1000) // Return more text for debugging
      };
    }
    
    console.log(`📊 [Finance] Parsed ${accounts.length} accounts from screenshot`);
    
    return {
      success: true,
      accounts: accounts,
      groups: groups,
      netWorth: netWorth,
      rawText: text.substring(0, 500) // Include snippet for debugging
    };
  } catch (error) {
    console.error('❌ [Finance] Error parsing account text:', error.message);
    return {
      success: false,
      error: 'Failed to parse account data: ' + error.message
    };
  }
}

// Update or create accounts from parsed data
async function updateAccountsFromParsedData(parsedAccounts, groups, netWorth, asOfDate = null) {
  try {
    const data = loadFinanceData();
    const existingAccounts = data.accounts || [];
    
    // If no asOfDate provided, use current date
    const effectiveDate = asOfDate || new Date().toISOString().split('T')[0];
    
    // Create date object at midnight UTC to represent the date consistently
    // This ensures the date is stored uniformly regardless of server timezone
    const effectiveDateObj = new Date(effectiveDate + 'T00:00:00.000Z');
    const effectiveDateISO = effectiveDateObj.toISOString();
    
    console.log(`📅 [Finance] Processing accounts with As Of date: ${effectiveDate} (stored as ${effectiveDateISO})`);
    
    let accountsUpdated = 0;
    let accountsCreated = 0;
    const updatedAccountIds = [];
    
    // Map category to default account type
    const categoryToType = {
      'cash': 'checking',
      'investments': 'stocks',
      'real_estate': 'home',
      'liabilities': 'credit_card'
    };
    
    // Helper function for fuzzy name matching
    function fuzzyMatch(str1, str2) {
      const s1 = str1.toLowerCase().trim();
      const s2 = str2.toLowerCase().trim();
      
      // Exact match
      if (s1 === s2) return true;
      
      // Check if one contains the other (for truncated names)
      if (s1.includes(s2) || s2.includes(s1)) return true;
      
      // Remove common OCR variations and compare
      const normalize = (s) => s
        .replace(/[^\w\s]/g, '') // Remove special chars
        .replace(/\s+/g, ' ')     // Normalize whitespace
        .trim();
      
      const n1 = normalize(s1);
      const n2 = normalize(s2);
      
      if (n1 === n2) return true;
      if (n1.includes(n2) || n2.includes(n1)) return true;
      
      return false;
    }
    
    for (const parsedAccount of parsedAccounts) {
      // Try to find existing account by name (with fuzzy matching)
      // Match on original name, and also check previousNames for merged accounts
      const existingAccount = existingAccounts.find(acc => {
        // Check current name
        if (acc.name && fuzzyMatch(acc.name, parsedAccount.name)) {
          return true;
        }
        
        // Check previous names (from merged accounts)
        if (acc.previousNames && Array.isArray(acc.previousNames)) {
          return acc.previousNames.some(prevName => 
            fuzzyMatch(prevName, parsedAccount.name)
          );
        }
        
        return false;
      });
      
      if (existingAccount) {
        // Update existing account
        const oldBalance = existingAccount.currentValue || 0;
        
        // Determine if we should update the current balance
        // Only update if asOfDate is today or later than the last update
        const lastUpdated = existingAccount.updatedAt ? new Date(existingAccount.updatedAt) : new Date(0);
        const shouldUpdateCurrentBalance = effectiveDateObj >= lastUpdated;
        
        if (shouldUpdateCurrentBalance) {
          existingAccount.currentValue = parsedAccount.balance;
          existingAccount.updatedAt = effectiveDateISO;
          console.log(`✅ [Finance] Updated current balance for ${existingAccount.name}: $${parsedAccount.balance}`);
        } else {
          console.log(`ℹ️ [Finance] Preserved newer balance for ${existingAccount.name} (As Of ${effectiveDate} is older than last update)`);
        }
        
        // Always add history entry with the specified date
        data.history.push({
          accountId: existingAccount.id,
          accountName: existingAccount.name,
          type: 'balance_update',
          oldBalance: parseFloat(oldBalance),
          newBalance: parsedAccount.balance,
          balanceDate: effectiveDateISO,
          timestamp: new Date().toISOString(),
          source: 'screenshot_upload'
        });
        
        accountsUpdated++;
        updatedAccountIds.push(existingAccount.id);
      } else {
        // Create new account
        const accountType = categoryToType[parsedAccount.category] || 'checking';
        const newAccount = {
          id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
          name: parsedAccount.name,
          type: accountType,
          currentValue: parsedAccount.balance,
          createdAt: effectiveDateISO,
          updatedAt: effectiveDateISO,
          notes: `Auto-created from screenshot upload on ${new Date().toLocaleDateString()} (As Of: ${effectiveDate})`
        };
        
        data.accounts.push(newAccount);
        
        // Add history entry for new account
        data.history.push({
          accountId: newAccount.id,
          accountName: newAccount.name,
          type: 'account_created',
          newBalance: parsedAccount.balance,
          balanceDate: effectiveDateISO,
          timestamp: new Date().toISOString(),
          source: 'screenshot_upload'
        });
        
        accountsCreated++;
        updatedAccountIds.push(newAccount.id);
        console.log(`✅ [Finance] Created new account ${newAccount.name}: $${parsedAccount.balance}`);
      }
    }
    
    // Keep only last MAX_HISTORY_ENTRIES history entries
    if (data.history.length > MAX_HISTORY_ENTRIES) {
      data.history = data.history.slice(-MAX_HISTORY_ENTRIES);
    }
    
    // Save updated data
    const saveResult = saveFinanceData(data);
    
    if (!saveResult.success) {
      return saveResult;
    }
    
    console.log(`✅ [Finance] Screenshot processing complete: ${accountsCreated} created, ${accountsUpdated} updated`);
    
    return {
      success: true,
      accountsCreated: accountsCreated,
      accountsUpdated: accountsUpdated,
      totalAccounts: parsedAccounts.length,
      updatedAccountIds: updatedAccountIds,
      groups: groups,
      netWorth: netWorth
    };
  } catch (error) {
    console.error('❌ [Finance] Error updating accounts from parsed data:', error.message);
    return {
      success: false,
      error: 'Failed to update accounts: ' + error.message
    };
  }
}

// Get historical balance data aggregated by account type
function getHistoryByAccountType(startDate = null, endDate = null) {
  const data = loadFinanceData();
  let history = data.history || [];
  
  // Filter by date range
  if (startDate) {
    history = history.filter(h => new Date(h.timestamp) >= new Date(startDate));
  }
  if (endDate) {
    history = history.filter(h => new Date(h.timestamp) <= new Date(endDate));
  }
  
  // Group by account type and timestamp
  const typeHistory = {};
  const accounts = data.accounts || [];
  
  history.forEach(entry => {
    if (entry.type === 'balance_update' && entry.accountId && entry.newBalance != null && !isNaN(entry.newBalance)) {
      const account = accounts.find(a => a.id === entry.accountId);
      if (account) {
        const accountType = ACCOUNT_TYPES[account.type];
        if (accountType) {
          const category = accountType.category;
          if (!typeHistory[category]) {
            typeHistory[category] = [];
          }
          typeHistory[category].push({
            timestamp: entry.balanceDate || entry.timestamp,
            balance: parseFloat(entry.newBalance),
            accountId: entry.accountId,
            accountName: entry.accountName
          });
        }
      }
    }
  });
  
  return typeHistory;
}

// Get net worth history over time
function getNetWorthHistory(startDate = null, endDate = null) {
  const data = loadFinanceData();
  let history = data.history || [];
  const accounts = data.accounts || [];
  
  // Filter by date range
  if (startDate) {
    history = history.filter(h => new Date(h.timestamp) >= new Date(startDate));
  }
  if (endDate) {
    history = history.filter(h => new Date(h.timestamp) <= new Date(endDate));
  }
  
  // Sort history by timestamp
  history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Calculate net worth at each point in time
  const netWorthData = [];
  const accountBalances = {};
  
  // Process history entries in chronological order
  // Build up balances from scratch rather than starting with current values
  history.forEach(entry => {
    if (entry.type === 'balance_update' && entry.accountId && entry.newBalance != null && !isNaN(entry.newBalance)) {
      accountBalances[entry.accountId] = parseFloat(entry.newBalance);
      
      // Calculate net worth at this point
      let netWorth = 0;
      let assets = 0;
      let liabilities = 0;
      
      Object.keys(accountBalances).forEach(accountId => {
        const account = accounts.find(a => a.id === accountId);
        if (account) {
          const accountType = ACCOUNT_TYPES[account.type];
          if (accountType && accountType.category === 'liabilities') {
            liabilities += accountBalances[accountId];
          } else if (accountType && accountType.category !== 'future_income') {
            assets += accountBalances[accountId];
          }
        }
      });
      
      netWorth = assets - liabilities;
      
      netWorthData.push({
        timestamp: entry.balanceDate || entry.timestamp,
        netWorth: netWorth,
        assets: assets,
        liabilities: liabilities
      });
    }
  });
  
  return netWorthData;
}

// Get account balance history with snapshots
function getAccountBalanceHistory(accountId, startDate = null, endDate = null) {
  const data = loadFinanceData();
  let history = data.history || [];
  
  // Filter by account
  history = history.filter(h => h.accountId === accountId && h.type === 'balance_update');
  
  // Filter by date range
  if (startDate) {
    history = history.filter(h => new Date(h.timestamp) >= new Date(startDate));
  }
  if (endDate) {
    history = history.filter(h => new Date(h.timestamp) <= new Date(endDate));
  }
  
  // Sort by timestamp
  history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Map to balance snapshots, filtering out entries with invalid balances
  return history
    .filter(entry => entry.newBalance != null && !isNaN(entry.newBalance))
    .map(entry => ({
      timestamp: entry.balanceDate || entry.timestamp,
      balance: parseFloat(entry.newBalance),
      accountName: entry.accountName
    }));
}

// ============================================================================
// Apartment Investment Property Tracking Functions
// ============================================================================

/**
 * Get all apartments
 */
function getApartments() {
  const data = loadFinanceData();
  return data.apartments || [];
}

/**
 * Get a single apartment by ID
 */
function getApartment(apartmentId) {
  const apartments = getApartments();
  return apartments.find(apt => apt.id === apartmentId);
}

/**
 * Save or update an apartment
 */
function saveApartment(apartmentData) {
  try {
    const data = loadFinanceData();
    
    if (!data.apartments) {
      data.apartments = [];
    }
    
    if (apartmentData.id) {
      // Update existing apartment
      const index = data.apartments.findIndex(apt => apt.id === apartmentData.id);
      if (index >= 0) {
        data.apartments[index] = {
          ...data.apartments[index],
          ...apartmentData,
          updatedAt: new Date().toISOString()
        };
      } else {
        return { success: false, error: 'Apartment not found' };
      }
    } else {
      // Create new apartment
      const newApartment = {
        id: 'apt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        name: apartmentData.name || 'Untitled Property',
        address: apartmentData.address || '',
        purchasePrice: parseFloat(apartmentData.purchasePrice) || 0,
        purchaseDate: apartmentData.purchaseDate || new Date().toISOString(),
        mortgageAmount: parseFloat(apartmentData.mortgageAmount) || 0,
        mortgageRate: parseFloat(apartmentData.mortgageRate) || 0,
        mortgageTermMonths: parseInt(apartmentData.mortgageTermMonths) || 360,
        mortgageAccountId: apartmentData.mortgageAccountId || null,
        propertyAccountId: apartmentData.propertyAccountId || null,
        expenses: apartmentData.expenses || [],
        incomeEntries: apartmentData.incomeEntries || [],
        forecastedRent: apartmentData.forecastedRent || [],
        rentIncreaseMonth: apartmentData.rentIncreaseMonth || null,
        reconcileDate: apartmentData.reconcileDate || null,
        financialGoal: apartmentData.financialGoal || { type: 'breakeven', targetAmount: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.apartments.push(newApartment);
      apartmentData.id = newApartment.id;
    }
    
    const result = saveFinanceData(data);
    if (result.success) {
      return { success: true, apartment: apartmentData };
    } else {
      return result;
    }
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Save apartment',
      apartmentData
    });
    return { success: false, error: error.message };
  }
}

/**
 * Delete an apartment
 */
function deleteApartment(apartmentId) {
  try {
    const data = loadFinanceData();
    
    if (!data.apartments) {
      return { success: false, error: 'No apartments found' };
    }
    
    const index = data.apartments.findIndex(apt => apt.id === apartmentId);
    if (index < 0) {
      return { success: false, error: 'Apartment not found' };
    }
    
    data.apartments.splice(index, 1);
    
    const result = saveFinanceData(data);
    return result;
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Delete apartment',
      apartmentId
    });
    return { success: false, error: error.message };
  }
}

/**
 * Add an expense to an apartment
 */
function addApartmentExpense(apartmentId, expenseData) {
  try {
    const data = loadFinanceData();
    const apartment = data.apartments?.find(apt => apt.id === apartmentId);
    
    if (!apartment) {
      return { success: false, error: 'Apartment not found' };
    }
    
    if (!apartment.expenses) {
      apartment.expenses = [];
    }
    
    const newExpense = {
      id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: expenseData.name || 'Untitled Expense',
      amount: parseFloat(expenseData.amount) || 0,
      type: expenseData.type || 'one-time', // 'one-time', 'monthly', 'annual'
      category: expenseData.category || 'other', // 'mortgage', 'property-tax', 'insurance', 'maintenance', 'hoa', 'utilities', 'other'
      date: expenseData.date || new Date().toISOString(),
      notes: expenseData.notes || '',
      annualIncreasePercent: parseFloat(expenseData.annualIncreasePercent) || 0, // Annual percentage increase (e.g., 3.0 for 3%)
      originalAmount: parseFloat(expenseData.amount) || 0, // Track original amount for history
      lastIncreaseDate: null, // Track when last increase was applied
      createdAt: new Date().toISOString()
    };
    
    apartment.expenses.push(newExpense);
    apartment.updatedAt = new Date().toISOString();
    
    const result = saveFinanceData(data);
    if (result.success) {
      return { success: true, expense: newExpense };
    } else {
      return result;
    }
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Add apartment expense',
      apartmentId,
      expenseData
    });
    return { success: false, error: error.message };
  }
}

/**
 * Delete an expense from an apartment
 */
function deleteApartmentExpense(apartmentId, expenseId) {
  try {
    const data = loadFinanceData();
    const apartment = data.apartments?.find(apt => apt.id === apartmentId);
    
    if (!apartment) {
      return { success: false, error: 'Apartment not found' };
    }
    
    if (!apartment.expenses) {
      return { success: false, error: 'No expenses found' };
    }
    
    const index = apartment.expenses.findIndex(exp => exp.id === expenseId);
    if (index < 0) {
      return { success: false, error: 'Expense not found' };
    }
    
    apartment.expenses.splice(index, 1);
    apartment.updatedAt = new Date().toISOString();
    
    const result = saveFinanceData(data);
    return result;
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Delete apartment expense',
      apartmentId,
      expenseId
    });
    return { success: false, error: error.message };
  }
}

/**
 * Apply annual increase to recurring expenses
 * This function is called automatically on January 1st each year
 */
function applyAnnualExpenseIncreases() {
  try {
    const data = loadFinanceData();
    let updatedCount = 0;
    const currentYear = new Date().getFullYear();
    const currentDate = new Date().toISOString();
    
    if (!data.apartments || data.apartments.length === 0) {
      return { success: true, message: 'No apartments to process', updatedCount: 0 };
    }
    
    // Process each apartment
    data.apartments.forEach(apartment => {
      if (!apartment.expenses || apartment.expenses.length === 0) {
        return;
      }
      
      // Process each expense
      apartment.expenses.forEach(expense => {
        // Only apply increases to recurring expenses (monthly or annual)
        if ((expense.type === 'monthly' || expense.type === 'annual') && 
            expense.annualIncreasePercent > 0) {
          
          // Check if we need to apply an increase
          // Skip if already increased this year
          const lastIncreaseYear = expense.lastIncreaseDate 
            ? new Date(expense.lastIncreaseDate).getFullYear() 
            : 0;
          
          if (lastIncreaseYear < currentYear) {
            // Apply the percentage increase
            const increaseMultiplier = 1 + (expense.annualIncreasePercent / 100);
            expense.amount = parseFloat((expense.amount * increaseMultiplier).toFixed(2));
            expense.lastIncreaseDate = currentDate;
            updatedCount++;
            
            logger.info(logger.categories.FINANCE, 
              `Applied annual increase to expense ${expense.name} (${apartment.name}): ${expense.annualIncreasePercent}% -> $${expense.amount}`);
          }
        }
      });
      
      apartment.updatedAt = currentDate;
    });
    
    // Save the updated data
    if (updatedCount > 0) {
      const result = saveFinanceData(data);
      if (result.success) {
        return { 
          success: true, 
          message: `Successfully applied annual increases to ${updatedCount} expense(s)`,
          updatedCount 
        };
      } else {
        return result;
      }
    } else {
      return { 
        success: true, 
        message: 'No expenses needed annual increases',
        updatedCount: 0 
      };
    }
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Apply annual expense increases'
    });
    return { success: false, error: error.message };
  }
}

/**
 * Add an income entry to an apartment
 */
function addApartmentIncome(apartmentId, incomeData) {
  try {
    const data = loadFinanceData();
    const apartment = data.apartments?.find(apt => apt.id === apartmentId);
    
    if (!apartment) {
      return { success: false, error: 'Apartment not found' };
    }
    
    if (!apartment.incomeEntries) {
      apartment.incomeEntries = [];
    }
    
    const newIncome = {
      id: 'inc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      amount: parseFloat(incomeData.amount) || 0,
      type: incomeData.type || 'collected', // 'collected', 'forecasted'
      month: incomeData.month || new Date().toISOString().substring(0, 7), // YYYY-MM format
      notes: incomeData.notes || '',
      createdAt: new Date().toISOString()
    };
    
    apartment.incomeEntries.push(newIncome);
    apartment.updatedAt = new Date().toISOString();
    
    const result = saveFinanceData(data);
    if (result.success) {
      return { success: true, income: newIncome };
    } else {
      return result;
    }
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Add apartment income',
      apartmentId,
      incomeData
    });
    return { success: false, error: error.message };
  }
}

/**
 * Delete an income entry from an apartment
 */
function deleteApartmentIncome(apartmentId, incomeId) {
  try {
    const data = loadFinanceData();
    const apartment = data.apartments?.find(apt => apt.id === apartmentId);
    
    if (!apartment) {
      return { success: false, error: 'Apartment not found' };
    }
    
    if (!apartment.incomeEntries) {
      return { success: false, error: 'No income entries found' };
    }
    
    const index = apartment.incomeEntries.findIndex(inc => inc.id === incomeId);
    if (index < 0) {
      return { success: false, error: 'Income entry not found' };
    }
    
    apartment.incomeEntries.splice(index, 1);
    apartment.updatedAt = new Date().toISOString();
    
    const result = saveFinanceData(data);
    return result;
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Delete apartment income',
      apartmentId,
      incomeId
    });
    return { success: false, error: error.message };
  }
}

/**
 * Update forecasted rent for an apartment
 */
function updateForecastedRent(apartmentId, forecastedRentData) {
  try {
    const data = loadFinanceData();
    const apartment = data.apartments?.find(apt => apt.id === apartmentId);
    
    if (!apartment) {
      return { success: false, error: 'Apartment not found' };
    }
    
    // forecastedRentData should be an array of objects: [{ startMonth: 'YYYY-MM', endMonth: 'YYYY-MM', amount: 1000 }]
    apartment.forecastedRent = forecastedRentData || [];
    apartment.updatedAt = new Date().toISOString();
    
    const result = saveFinanceData(data);
    return result;
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Update forecasted rent',
      apartmentId,
      forecastedRentData
    });
    return { success: false, error: error.message };
  }
}

/**
 * Calculate monthly mortgage payment
 */
function calculateMortgagePayment(principal, annualRate, termMonths) {
  if (principal <= 0 || termMonths <= 0) return 0;
  if (annualRate <= 0) return principal / termMonths;
  
  const monthlyRate = annualRate / 12 / 100;
  const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
                  (Math.pow(1 + monthlyRate, termMonths) - 1);
  return payment;
}

/**
 * Calculate mortgage breakdown (principal vs interest)
 */
function calculateMortgageBreakdown(principal, annualRate, termMonths, monthNumber) {
  if (principal <= 0 || termMonths <= 0) return { principal: 0, interest: 0, remaining: 0 };
  
  const monthlyRate = annualRate / 12 / 100;
  const monthlyPayment = calculateMortgagePayment(principal, annualRate, termMonths);
  
  let remainingPrincipal = principal;
  let totalPrincipalPaid = 0;
  let totalInterestPaid = 0;
  
  for (let i = 1; i <= monthNumber && i <= termMonths; i++) {
    const interestPayment = remainingPrincipal * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    
    totalInterestPaid += interestPayment;
    totalPrincipalPaid += principalPayment;
    remainingPrincipal -= principalPayment;
  }
  
  return {
    principal: totalPrincipalPaid,
    interest: totalInterestPaid,
    remaining: remainingPrincipal,
    monthlyPayment: monthlyPayment
  };
}

/**
 * Calculate suggested rent to meet financial goal
 */
function calculateSuggestedRent(apartmentId) {
  try {
    const apartment = getApartment(apartmentId);
    if (!apartment) {
      return { success: false, error: 'Apartment not found' };
    }
    
    // Calculate monthly expenses
    let monthlyExpenses = 0;
    let annualExpenses = 0;
    let oneTimeExpenses = 0;
    
    if (apartment.expenses) {
      apartment.expenses.forEach(expense => {
        if (expense.type === 'monthly') {
          monthlyExpenses += expense.amount;
        } else if (expense.type === 'annual') {
          annualExpenses += expense.amount;
        } else if (expense.type === 'one-time') {
          oneTimeExpenses += expense.amount;
        }
      });
    }
    
    // Calculate mortgage payment
    let mortgagePayment = 0;
    let mortgagePrincipal = 0;
    let mortgageInterest = 0;
    
    if (apartment.mortgageAmount > 0) {
      const purchaseDate = new Date(apartment.purchaseDate);
      const currentDate = new Date();
      const monthsSincePurchase = (currentDate.getFullYear() - purchaseDate.getFullYear()) * 12 
        + (currentDate.getMonth() - purchaseDate.getMonth());
      
      const breakdown = calculateMortgageBreakdown(
        apartment.mortgageAmount,
        apartment.mortgageRate,
        apartment.mortgageTermMonths,
        monthsSincePurchase
      );
      mortgagePayment = breakdown.monthlyPayment;
      
      // Calculate current month's principal and interest
      const monthlyRate = apartment.mortgageRate / 12 / 100;
      mortgageInterest = breakdown.remaining * monthlyRate;
      mortgagePrincipal = mortgagePayment - mortgageInterest;
    }
    
    // Total monthly cost
    const totalMonthlyCost = monthlyExpenses + mortgagePayment + (annualExpenses / 12);
    const totalMonthlyCostExcludingPrincipal = monthlyExpenses + mortgageInterest + (annualExpenses / 12);
    
    // Calculate suggested rent based on financial goal
    const goal = apartment.financialGoal || { type: 'breakeven', targetAmount: 0 };
    let suggestedRent = 0;
    
    switch (goal.type) {
      case 'breakeven':
        suggestedRent = totalMonthlyCost;
        break;
      case 'breakeven-excluding-principal':
        suggestedRent = totalMonthlyCostExcludingPrincipal;
        break;
      case 'profit':
        suggestedRent = totalMonthlyCost + (goal.targetAmount || 0);
        break;
      default:
        suggestedRent = totalMonthlyCost;
    }
    
    // Calculate current average monthly income
    let currentMonthlyIncome = 0;
    if (apartment.incomeEntries && apartment.incomeEntries.length > 0) {
      const recentIncome = apartment.incomeEntries
        .filter(inc => inc.type === 'collected')
        .slice(-12); // Last 12 months
      if (recentIncome.length > 0) {
        const totalIncome = recentIncome.reduce((sum, inc) => sum + inc.amount, 0);
        currentMonthlyIncome = totalIncome / recentIncome.length;
      }
    }
    
    return {
      success: true,
      suggestedRent: Math.round(suggestedRent * 100) / 100,
      breakdown: {
        monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
        annualExpensesMonthly: Math.round((annualExpenses / 12) * 100) / 100,
        mortgagePayment: Math.round(mortgagePayment * 100) / 100,
        mortgagePrincipal: Math.round(mortgagePrincipal * 100) / 100,
        mortgageInterest: Math.round(mortgageInterest * 100) / 100,
        totalMonthlyCost: Math.round(totalMonthlyCost * 100) / 100,
        totalMonthlyCostExcludingPrincipal: Math.round(totalMonthlyCostExcludingPrincipal * 100) / 100,
        currentMonthlyIncome: Math.round(currentMonthlyIncome * 100) / 100,
        targetProfit: goal.type === 'profit' ? (goal.targetAmount || 0) : 0
      },
      goal: goal
    };
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Calculate suggested rent',
      apartmentId
    });
    return { success: false, error: error.message };
  }
}

/**
 * Get apartment profitability analysis
 * If reconcileDate is set, analysis starts from that date and includes 24-month forecast
 * Otherwise, shows historical data from purchase date to now
 */
function getApartmentAnalysis(apartmentId, startDate = null, endDate = null) {
  try {
    const apartment = getApartment(apartmentId);
    if (!apartment) {
      return { success: false, error: 'Apartment not found' };
    }
    
    const now = new Date();
    
    // Determine the actual start date
    // If reconcileDate is set, use that as the start date and include forecast
    // Otherwise, use provided startDate, purchase date, or now
    let analysisStartDate;
    let shouldIncludeForecast = false;
    
    if (apartment.reconcileDate) {
      // Reconcile date is set - start from there and include 24-month forecast
      analysisStartDate = new Date(apartment.reconcileDate);
      shouldIncludeForecast = true;
    } else if (startDate) {
      analysisStartDate = new Date(startDate);
    } else {
      analysisStartDate = new Date(apartment.purchaseDate);
    }
    
    // Determine the end date
    let analysisEndDate;
    if (shouldIncludeForecast) {
      // Show 24 months forward from reconcile date
      analysisEndDate = new Date(analysisStartDate);
      analysisEndDate.setMonth(analysisEndDate.getMonth() + 24);
    } else if (endDate) {
      analysisEndDate = new Date(endDate);
    } else {
      analysisEndDate = now;
    }
    
    // Generate monthly analysis
    const monthlyData = [];
    const currentDate = new Date(analysisStartDate);
    currentDate.setDate(1); // Start of month
    
    while (currentDate <= analysisEndDate) {
      const monthKey = currentDate.toISOString().substring(0, 7);
      const isFutureMonth = currentDate > now;
      
      // Calculate income for this month
      let income = 0;
      
      if (isFutureMonth && shouldIncludeForecast) {
        // For future months with reconcile date, use forecasted rent
        if (apartment.forecastedRent && apartment.forecastedRent.length > 0) {
          for (const forecast of apartment.forecastedRent) {
            if (monthKey >= forecast.startMonth && monthKey <= forecast.endMonth) {
              income = forecast.amount;
              break;
            }
          }
        }
      } else {
        // For past months, use collected income
        if (apartment.incomeEntries) {
          const monthIncome = apartment.incomeEntries.filter(inc => 
            inc.month === monthKey && inc.type === 'collected'
          );
          income = monthIncome.reduce((sum, inc) => sum + inc.amount, 0);
        }
      }
      
      // Calculate expenses for this month (both recurring and one-time)
      let expenses = 0;
      if (apartment.expenses) {
        apartment.expenses.forEach(expense => {
          if (expense.type === 'monthly') {
            // Monthly recurring expenses apply to all months
            // Apply annual increase for future forecasts
            let amount = expense.amount;
            if (isFutureMonth && expense.annualIncreasePercent > 0) {
              // Calculate how many years from the expense creation date (or last increase)
              // Note: We use full year comparison (not month-precise) because increases
              // are applied on January 1st. This means forecasts assume increases happen
              // at the start of each calendar year, which aligns with the cron job behavior.
              const referenceDate = expense.lastIncreaseDate 
                ? new Date(expense.lastIncreaseDate) 
                : new Date(expense.createdAt);
              const yearsElapsed = currentDate.getFullYear() - referenceDate.getFullYear();
              
              if (yearsElapsed > 0) {
                // Apply compound increase for each year elapsed
                amount = expense.amount * Math.pow(1 + expense.annualIncreasePercent / 100, yearsElapsed);
              }
            }
            expenses += amount;
          } else if (expense.type === 'annual') {
            // Annual recurring expenses spread across 12 months
            // Apply annual increase for future forecasts
            let amount = expense.amount;
            if (isFutureMonth && expense.annualIncreasePercent > 0) {
              // Calculate how many years from the expense creation date (or last increase)
              // Note: We use full year comparison (not month-precise) because increases
              // are applied on January 1st. This means forecasts assume increases happen
              // at the start of each calendar year, which aligns with the cron job behavior.
              const referenceDate = expense.lastIncreaseDate 
                ? new Date(expense.lastIncreaseDate) 
                : new Date(expense.createdAt);
              const yearsElapsed = currentDate.getFullYear() - referenceDate.getFullYear();
              
              if (yearsElapsed > 0) {
                // Apply compound increase for each year elapsed
                amount = expense.amount * Math.pow(1 + expense.annualIncreasePercent / 100, yearsElapsed);
              }
            }
            expenses += amount / 12;
          } else if (expense.type === 'one-time') {
            // One-time expenses: include if they occurred within the analysis period
            const expenseMonth = new Date(expense.date).toISOString().substring(0, 7);
            const expenseDate = new Date(expense.date);
            // Include if expense is in this month and within our analysis period
            if (expenseMonth === monthKey && expenseDate >= analysisStartDate && expenseDate <= currentDate) {
              expenses += expense.amount;
            }
          }
        });
      }
      
      // Add mortgage payment (applies to all months within mortgage term)
      if (apartment.mortgageAmount > 0) {
        const purchaseDate = new Date(apartment.purchaseDate);
        const monthsSincePurchase = (currentDate.getFullYear() - purchaseDate.getFullYear()) * 12 
          + (currentDate.getMonth() - purchaseDate.getMonth());
        
        // Include mortgage payment if current month is within the mortgage term
        if (monthsSincePurchase >= 0 && monthsSincePurchase < apartment.mortgageTermMonths) {
          const breakdown = calculateMortgageBreakdown(
            apartment.mortgageAmount,
            apartment.mortgageRate,
            apartment.mortgageTermMonths,
            monthsSincePurchase
          );
          expenses += breakdown.monthlyPayment;
        }
      }
      
      monthlyData.push({
        month: monthKey,
        income: Math.round(income * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        cashFlow: Math.round((income - expenses) * 100) / 100,
        isForecast: isFutureMonth
      });
      
      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    // Calculate totals (only from actual/realized data, excluding forecasts)
    const actualData = monthlyData.filter(m => !m.isForecast);
    const totals = {
      income: actualData.reduce((sum, m) => sum + m.income, 0),
      expenses: actualData.reduce((sum, m) => sum + m.expenses, 0),
      cashFlow: actualData.reduce((sum, m) => sum + m.cashFlow, 0)
    };
    
    return {
      success: true,
      monthlyData: monthlyData,
      totals: {
        income: Math.round(totals.income * 100) / 100,
        expenses: Math.round(totals.expenses * 100) / 100,
        cashFlow: Math.round(totals.cashFlow * 100) / 100
      },
      reconcileDate: apartment.reconcileDate,
      hasForecast: shouldIncludeForecast
    };
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Get apartment analysis',
      apartmentId,
      startDate,
      endDate
    });
    return { success: false, error: error.message };
  }
}

/**
 * Get equity overview for an apartment
 * Shows mortgage balance, property value, and calculated equity
 */
function getApartmentEquityOverview(apartmentId) {
  try {
    const apartment = getApartment(apartmentId);
    if (!apartment) {
      return { success: false, error: 'Apartment not found' };
    }

    const accounts = getAccounts();
    let mortgageBalance = null;
    let propertyValue = null;
    let mortgageAccountName = null;
    let propertyAccountName = null;

    // Get mortgage account balance if linked
    if (apartment.mortgageAccountId) {
      const mortgageAccount = accounts.find(acc => acc.id === apartment.mortgageAccountId);
      if (mortgageAccount) {
        // Mortgage accounts store balance as positive numbers per account type description
        mortgageBalance = Math.abs(parseFloat(mortgageAccount.amount) || 0);
        mortgageAccountName = getAccountDisplayName(mortgageAccount);
      }
    }

    // Get property account value if linked
    if (apartment.propertyAccountId) {
      const propertyAccount = accounts.find(acc => acc.id === apartment.propertyAccountId);
      if (propertyAccount) {
        propertyValue = Math.abs(parseFloat(propertyAccount.amount) || 0);
        propertyAccountName = getAccountDisplayName(propertyAccount);
      }
    }

    // Calculate equity if both values are available
    let equity = null;
    if (propertyValue !== null && mortgageBalance !== null) {
      equity = propertyValue - mortgageBalance;
    }

    return {
      success: true,
      data: {
        mortgageBalance,
        propertyValue,
        equity,
        mortgageAccountId: apartment.mortgageAccountId,
        propertyAccountId: apartment.propertyAccountId,
        mortgageAccountName,
        propertyAccountName,
        hasLinkedMortgage: apartment.mortgageAccountId != null,
        hasLinkedProperty: apartment.propertyAccountId != null
      }
    };
  } catch (error) {
    logError(logger.categories.FINANCE, error, {
      operation: 'Get apartment equity overview',
      apartmentId
    });
    return { success: false, error: error.message };
  }
}

module.exports = {
  init,
  getAccounts,
  saveAccount,
  deleteAccount,
  mergeAccounts,
  unmergeAccount,
  updateAccountBalance,
  updateAccountDisplayName,
  getAccountDisplayName,
  getDemographics,
  updateDemographics,
  getAdvancedSettings,
  updateAdvancedSettings,
  addHistoryEntry,
  getHistory,
  getRecommendations,
  getAccountTypes,
  evaluateRetirementPlan,
  getDemoAccounts,
  getDemoDemographics,
  getDemoHistory,
  getDemoRecommendations,
  evaluateDemoRetirementPlan,
  processAccountScreenshot,
  getHistoryByAccountType,
  getNetWorthHistory,
  getAccountBalanceHistory,
  // Apartment functions
  getApartments,
  getApartment,
  saveApartment,
  deleteApartment,
  addApartmentExpense,
  deleteApartmentExpense,
  applyAnnualExpenseIncreases,
  addApartmentIncome,
  deleteApartmentIncome,
  updateForecastedRent,
  calculateSuggestedRent,
  getApartmentAnalysis,
  getApartmentEquityOverview,
  // Export for testing
  parseAccountsFromText
};
