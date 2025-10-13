# Advanced Settings Feature - Finance Module

## Overview
Added comprehensive Advanced Settings functionality to the Finance Module, allowing users to configure advanced parameters that influence both retirement planning assessments and allocation recommendations.

## Implementation Details

### 1. Data Structure Enhancement
- Extended finance data structure with `advancedSettings` object containing:
  - Monte Carlo simulation parameters
  - Risk tolerance return assumptions
  - Retirement distribution phase adjustments

### 2. Backend Changes

#### Files Modified:
- `modules/finance.js`: Added advanced settings functions and updated evaluation logic
- `server.js`: Added new API endpoints for advanced settings
- `package.json`: Version bumped to 2.2.2
- `CHANGELOG.md`: Documented new feature

#### New Functions:
```javascript
// modules/finance.js
getAdvancedSettings()        // Retrieve current advanced settings
updateAdvancedSettings()     // Update and persist settings
```

#### New API Endpoints:
- `GET /admin/api/finance/advanced-settings` - Retrieve settings
- `POST /admin/api/finance/advanced-settings` - Update settings

### 3. Frontend Changes

#### Files Modified:
- `admin/dashboard.html`: Added Advanced Settings UI and JavaScript functions

#### UI Components Added:
1. **Advanced Settings Link**: Placed at bottom of "My Data" tab
2. **Advanced Settings Page**: Comprehensive form with sections for:
   - Monte Carlo Simulation Parameters
   - Return Assumptions by Risk Tolerance (Conservative, Moderate, Aggressive)
   - Retirement Distribution Phase adjustments
3. **Action Buttons**: Save Settings and Reset to Defaults

#### JavaScript Functions:
- `loadAdvancedSettings()` - Load settings from API
- `saveAdvancedSettings()` - Save settings to API
- `resetAdvancedSettings()` - Reset to default values
- `showAdvancedSettingsAlert()` - Display success/error messages

### 4. Settings Categories

#### Monte Carlo Simulation Parameters:
- **Number of Simulations**: 1,000 - 100,000 (default: 10,000)
- **Years in Retirement**: 10-50 years (default: 30)
- **Inflation Rate**: 0-10% (default: 3%)
- **Savings Rate**: 0-100% (default: 15%)

#### Return Assumptions by Risk Profile:
- **Conservative**: 5% return, 10% volatility (default)
- **Moderate**: 7% return, 15% volatility (default)
- **Aggressive**: 9% return, 20% volatility (default)

#### Retirement Distribution Phase:
- **Return Adjustment**: 0-1 multiplier (default: 0.7 = 70%)
- **Volatility Adjustment**: 0-1 multiplier (default: 0.8 = 80%)

## Usage

### Accessing Advanced Settings:
1. Navigate to Finance → My Data tab
2. Scroll to bottom of page
3. Click "⚙️ Advanced settings" link
4. Advanced Settings page will open

### Modifying Settings:
1. Adjust desired parameters using form inputs
2. Click "💾 Save Settings" to persist changes
3. Settings are encrypted and stored securely

### Resetting to Defaults:
1. Click "🔄 Reset to Defaults" button
2. Confirm the action in the dialog
3. All settings restored to default values

## Impact on Calculations

### Retirement Planning Evaluation:
- Uses configured number of Monte Carlo simulations
- Applies risk-appropriate return assumptions
- Factors in custom inflation and savings rates
- Adjusts portfolio behavior during retirement phase

### Allocation Recommendations:
- Return assumptions influence portfolio optimization
- Volatility settings affect risk calculations
- All three risk profiles can be customized independently

## Security

- All settings stored in encrypted finance data file (`config/.finance_data`)
- Same encryption mechanism as other financial data (AES-256-GCM)
- Admin-only access via session authentication
- Settings persist across container rebuilds (via volume mounts)

## Testing Performed

### Manual Testing:
✅ Navigation to Advanced Settings page works correctly  
✅ Settings load with proper default values  
✅ Settings save successfully with confirmation message  
✅ Settings persist across page navigation  
✅ Reset to defaults functionality works correctly  
✅ All settings properly influence retirement evaluations  
✅ Demo retirement evaluation respects user settings  

### Test Scenarios:
1. Changed Number of Simulations from 10,000 to 5,000 → Saved successfully
2. Navigated away and back → Setting persisted correctly
3. Reset to defaults → Restored to 10,000 with confirmation

## Version Information

- **Version**: 2.2.2
- **Release Date**: 2025-10-13
- **Previous Version**: 2.2.1

## Future Enhancements

Potential future improvements:
- Preset profiles for different user scenarios
- Historical tracking of settings changes
- Settings import/export functionality
- Advanced validation and range checking
- Tooltips explaining financial concepts
