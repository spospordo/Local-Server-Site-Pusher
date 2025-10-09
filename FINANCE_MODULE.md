# Finance Module

The Finance Module is a secure, encrypted personal finance tracking system integrated into the Local Server Site Pusher admin dashboard.

## Features

### 🔐 Security
- **AES-256-GCM Encryption**: All financial data is encrypted at rest
- **Secure Key Storage**: Encryption keys stored with 0600 file permissions
- **Admin-Only Access**: Only authenticated administrators can access financial data
- **No External Dependencies**: All data stored locally and encrypted

### 📊 Account Management
Track all your financial accounts and assets in one secure location:

#### Balance Update & Historical Tracking
- **Streamlined Balance Updates**: Quickly update account balances with a single click
- **Historical Tracking**: Every balance change is recorded with the effective date
- **Time-Series Data**: Maintain a complete history of account balances over time
- **Audit Trail**: Track when balances were updated and what they were changed to

#### Supported Account Types

**Cash Accounts**
- Savings Account
- Checking Account

**Investment Accounts**
- Individual Stocks
- Mutual Funds
- ETFs (Exchange Traded Funds)
- Bonds (Government and Corporate)

**Retirement Accounts**
- 401(k) Retirement Plans
- Traditional IRA
- Roth IRA

**Real Estate**
- Primary Residence
- Investment Properties

**Liabilities**
- Credit Card Debt
- Mortgage (can be linked to specific property)

**Future Income**
- Pension Plans (with start age and monthly payment)
- Social Security Benefits (with start age and monthly payment)

### 💡 Smart Recommendations

The module provides personalized portfolio allocation recommendations based on:
- **Your Age**: Adjusts risk profile as you approach retirement
- **Risk Tolerance**: Conservative, Moderate, or Aggressive strategies
- **Current Allocation**: Analyzes your existing portfolio distribution
- **Debt-to-Asset Ratio**: Monitors and provides guidance on liability levels

#### Recommendation Algorithm
- Uses age-based asset allocation (e.g., bonds = age, stocks = 100 - age)
- Adjusts for risk tolerance
- Analyzes debt-to-asset ratios with recommendations when >40%
- Provides actionable insights with current vs. target percentages
- Highlights areas needing rebalancing (when difference > 5%)
- Includes detailed strategy explanations with methodology and rationale

#### New Enhanced Features
- **Detailed Explanations**: Each recommendation includes a comprehensive explanation of the strategy, algorithms used, and reasoning
- **Net Worth Tracking**: Automatically calculates net worth by subtracting liabilities from assets
- **Debt Analysis**: Provides specific guidance on debt management and reduction strategies
- **Asset vs Liability Visualization**: Charts clearly distinguish between assets and liabilities

### 📈 Visualization
- Multiple chart types: Pie, Bar, and Doughnut charts
- Category-based grouping
- Real-time portfolio updates
- Color-coded allocation breakdown

## Usage

### Initial Setup

1. Navigate to the Finance tab in the admin dashboard
2. Fill in your profile information:
   - Current Age
   - Planned Retirement Age
   - Annual Income
   - Risk Tolerance
3. Click "Save Profile"

### Adding Accounts

1. Enter account details:
   - Account Name (e.g., "Chase Savings")
   - Account Type (select from dropdown with descriptions)
   - Current Value
   - Start Date (optional)
   - Notes (optional)

2. For future income accounts (Pension/Social Security):
   - Enter Expected Monthly Payment
   - Enter Starting Age
   - Current value can be $0

3. For mortgages:
   - Enter the outstanding balance as the current value
   - Select which property the mortgage is linked to
   - If no properties exist, add a property account first

4. Click "Add Account"

### Managing Accounts

- **Edit**: Click the "Edit" button on any account to modify details
- **Delete**: Click the "Delete" button to remove an account
- **View**: All accounts display with current values and type badges

### Getting Recommendations

1. Ensure you have:
   - Profile information entered
   - At least one account added
2. Click "Get Recommendations"
3. Review:
   - Total assets, liabilities, and net worth
   - Debt-to-asset ratio analysis
   - Action items with specific percentages
   - Current vs. Target allocation breakdown
   - Detailed strategy explanation including:
     - Algorithm methodology
     - Risk tolerance adjustments
     - Debt management recommendations
     - Overall strategic guidance

## Data Storage

### File Structure
```
config/
  .finance_key      # Encryption key (0600 permissions)
  .finance_data     # Encrypted financial data (0600 permissions)
```

### Data Format
All data is encrypted using AES-256-GCM with:
- Random IV (Initialization Vector) per encryption
- Authentication tag for integrity verification
- Salt-based key derivation

### Security Notes
- Files are automatically created with restricted permissions (0600)
- Data is encrypted before writing to disk
- Decryption only occurs in memory during active sessions
- No plaintext financial data is ever written to disk

## API Endpoints

All endpoints require admin authentication.

### Account Management
- `GET /admin/api/finance/account-types` - Get all account types with descriptions
- `GET /admin/api/finance/accounts` - List all accounts
- `POST /admin/api/finance/accounts` - Create or update account
- `POST /admin/api/finance/accounts/:id/balance` - Update account balance with historical tracking
- `DELETE /admin/api/finance/accounts/:id` - Delete account

### Demographics
- `GET /admin/api/finance/demographics` - Get user demographics
- `POST /admin/api/finance/demographics` - Update demographics

### History & Analysis
- `GET /admin/api/finance/history` - Get historical data
- `POST /admin/api/finance/history` - Add history entry
- `GET /admin/api/finance/recommendations` - Get allocation recommendations

## Technical Details

### Encryption Implementation
- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Length**: 256 bits (32 bytes)
- **IV Length**: 128 bits (16 bytes)
- **Auth Tag**: 128 bits (16 bytes)
- **Format**: `IV:AuthTag:EncryptedData` (all in hex)

### Module Architecture
```
modules/finance.js          # Core finance module with encryption
server.js                   # API endpoints integration
admin/dashboard.html        # UI components and JavaScript
```

### Dependencies
- **crypto** (built-in): For encryption/decryption
- **fs** (built-in): For secure file operations
- **Chart.js** (CDN): For data visualization

## Privacy & Compliance

- All data is stored locally on your server
- No data is sent to external services
- Encryption keys are generated locally
- No telemetry or analytics
- Fully self-contained solution

## Troubleshooting

### Chart.js Not Loading
If charts don't display, the CDN may be blocked. The module continues to work without charts - only visualization is affected.

### Data Recovery
- Keep backups of `config/.finance_key` - without it, data cannot be decrypted
- The encrypted data file can be backed up separately
- Never commit these files to version control (they're in .gitignore)

### Performance
- Supports up to 1000 historical entries (automatically trimmed)
- Encryption/decryption happens in milliseconds
- Real-time updates for all operations

## Future Enhancements

Potential additions for future versions:
- Historical value tracking over time
- Net worth trend analysis
- Import/export functionality (encrypted)
- Budget tracking
- Goal setting and progress tracking
- Multi-currency support

## License

This module is part of Local Server Site Pusher and follows the same MIT license.
