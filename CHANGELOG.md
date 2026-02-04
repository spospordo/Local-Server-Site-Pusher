# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed
- **NFS Network Drive Feature**: Removed NFS (Network File System) network drive functionality due to unreliable container mounting
  - Removed NFS module (`modules/nfs.js`)
  - Removed 15 NFS API endpoints
  - Removed NFS UI components from admin dashboard
  - Removed NFS backup/restore functions
  - Removed NFS-specific error handling
  - Removed NFS client package (`nfs-common`) from Docker image
  - Removed documentation files (`NFS_NETWORK_DRIVE.md`, `NFS_TESTING_GUIDE.md`)
  - **Migration Note**: Users currently using NFS for backups should export their configuration via the admin dashboard's Backup/Restore feature and store backups using alternative methods (local storage, cloud storage services, or manual file transfer)

### Added
- **Finance Module - Account Merging (v2.3.0)**: Merge duplicate or split accounts into a single account
  - Multi-select interface with checkboxes to select accounts for merging
  - Automatically identifies the most recently updated account as the surviving account
  - Transfers all history entries from merged accounts to the surviving account
  - Stores previous account names in `previousNames` array to prevent future re-creation
  - Enhanced fuzzy matching checks both current name and previous names during screenshot uploads
  - Audit trail with `accounts_merged` history entry documenting the merge operation
  - Confirmation dialog showing preview of merge before execution
  - Visual indicator showing "Merged from" badge on accounts that have absorbed others
  - New API endpoint: `POST /admin/api/finance/accounts/merge`
  - Comprehensive documentation in FINANCE_MODULE.md

### Fixed
- **Smart Mirror Dashboard 404 Error**: Fixed issue where `/smart-mirror` route would return 404 Not Found after enabling the dashboard in admin settings
  - Added enabled state check to `/smart-mirror` route
  - Returns helpful 404 page with link to admin settings when Smart Mirror is disabled
  - Serves dashboard HTML when Smart Mirror is enabled in configuration
  - Added proper logging for access attempts (enabled/disabled states)
  - Resolves production deployment issue where dashboard was inaccessible

### Added
- **Magic Mirror - Forecast Widget**: New separate widget for multi-day weather forecasts
  - Displays weather projections for tomorrow and up to 10 days ahead
  - Shows daily temperature ranges (min/max)
  - Configurable forecast duration (1, 3, 5, or 10 days)
  - Weather condition icons for each forecast day
  - Humidity and wind speed information per day
  - New API endpoint: `GET /api/magicmirror/forecast`
- **Magic Mirror - Weather API Testing**: New endpoint `/api/magicmirror/weather/test` for testing OpenWeather API connectivity
  - Tests API key validity with detailed error messages
  - Validates location configuration and provides suggestions for corrections
  - Diagnoses network connectivity issues
  - Provides helpful troubleshooting guidance for common problems
  - Returns actual weather data on successful connection
- **Magic Mirror - Webcal Protocol Support**: Calendar widget now supports `webcal://` and `webcals://` URLs
  - Automatically converts webcal URLs to https for compatibility
  - Fixes "Unsupported protocol webcal:" error
  - Works seamlessly with iCloud and other calendar services using webcal links

### Changed
- **Weather Widget Title**: Changed from "Weather" to "Current Weather" to distinguish from forecast
- Enhanced weather API response to include `condition` field (main weather category)
- Enhanced weather API response to include `unit` field (temperature unit)
- Improved weather widget display with larger weather icons
- Enhanced calendar endpoint to automatically convert webcal:// and webcals:// protocols to https://
- Improved weather API error handling with specific error codes and detailed troubleshooting messages
- Updated Magic Mirror documentation with forecast widget and enhanced weather features

### Fixed
- **Weather Widget Data Rendering**: Fixed 'undefined' values in weather display
  - Corrected API response field mapping (`condition` instead of just `description`)
  - Added missing `unit` field for temperature display
  - Fixed placeholder data to include all required fields
  - All weather data now displays correctly
- Calendar widget now accepts shared calendars with webcal:// protocol links
- Weather API key persistence confirmed working across container restarts (already implemented in v2.2.4)

### Technical
- Modified `/api/magicmirror/weather` endpoint to include `condition` and `unit` fields
- Added new endpoint: `GET /api/magicmirror/forecast` for multi-day weather forecasts
- Modified `/api/magicmirror/calendar` endpoint to handle webcal protocol conversion
- Added weather icon mapping in both HTML and module files
- Enhanced widget templates to support forecast widget
- Added forecast configuration to DEFAULT_CONFIG in magicmirror.js
- Added comprehensive test suite: `scripts/test-webcal-weather.js`
- Weather and forecast tests passing (7/7)

## [2.6.17] - 2026-02-04

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #435 from spospordo/copilot/update-vacation-widget-support
  - Clean up test data - restore config to original state
  - Add comprehensive implementation documentation for multiple vacations support
  - Update documentation for multiple vacation support
  - Implement multiple vacation support for Smart Widget vacation sub-widget
  - Initial plan


## [2.6.16] - 2026-02-04

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #433 from spospordo/copilot/fix-calendar-widget-holiday-bug
  - Add visual demonstration of calendar fix
  - Address code review feedback: rename function and improve warning message
  - Add test for calendar object property handling
  - Fix calendar widget: handle object-type event properties
  - Initial plan


## [2.6.15] - 2026-02-04

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #431 from spospordo/copilot/fix-collapse-expand-controls
  - Further improve generateSectionKey to ensure uniqueness and prevent duplicate listeners
  - Address code review feedback: extract generateSectionKey helper and use position-based fallback
  - Testing complete: All collapse/expand controls working with state persistence
  - Fix toggleCollapsible to handle both element and ID, add localStorage persistence
  - Initial plan


## [2.6.14] - 2026-02-03

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #429 from spospordo/copilot/add-weather-info-to-party-page
  - Add implementation summary for party weather integration
  - Add documentation for party weather integration
  - Add test script for party weather integration
  - Add weather forecast integration for party scheduling and widget
  - Initial plan


## [2.6.13] - 2026-02-03

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #427 from spospordo/copilot/ui-adjust-timezone-display
  - Complete: Additional timezones display smaller and more secondary
  - Make additional timezones smaller and more secondary in clock widget
  - Initial plan


## [2.6.12] - 2026-02-03

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #425 from spospordo/copilot/fix-party-widget-display
  - Add comprehensive documentation for party widget fix
  - Fix party sub-widget data source bug - access global config instead of smart mirror config
  - Initial analysis of party sub-widget display issue
  - Initial plan


## [2.6.11] - 2026-02-03

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #423 from spospordo/copilot/enhance-party-sub-widget
  - Address code review feedback: add radix to parseInt and extract magic number constant
  - Fix date condition logic for party widget visibility window
  - Update test script with phase-based validation checks
  - Add context-aware party widget with phase-based content display
  - Initial plan


## [2.6.10] - 2026-02-03

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #421 from spospordo/copilot/fix-party-sub-widget-display-again
  - docs: Add comprehensive documentation for wrapper container fix
  - Add test to validate wrapper container fix
  - Fix: Properly wrap sub-widgets in styled container
  - Initial plan


## [2.6.9] - 2026-02-03

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #419 from spospordo/copilot/add-party-scheduling-validation
  - Improve code quality: use browser locale and template literals
  - Add party scheduling validation and widget preview features
  - Initial plan


## [2.6.8] - 2026-02-03

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #417 from spospordo/copilot/fix-party-sub-widget-display
  - Add comprehensive resolution documentation for party widget display fix
  - Address code review: Improve variable naming and error messages
  - Add comprehensive test script for party widget bug fixes
  - Fix party sub-widget display: Add robust data validation and date normalization
  - Initial plan


## [2.6.7] - 2026-02-03

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #415 from spospordo/copilot/update-interactive-grid-editor
  - Fix version number consistency in documentation
  - Update Smart Widget documentation with grid editor usage
  - Add Smart Widget to WIDGET_ICONS for grid editor visibility
  - Initial plan


## [2.6.6] - 2026-02-03

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #413 from spospordo/copilot/fix-smart-widget-party-info
  - Add comprehensive party widget documentation and admin setup guide
  - Add party sub-widget to default smart widget configuration
  - Initial plan


## [2.6.5] - 2026-02-02

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #411 from spospordo/copilot/add-party-sub-widget
  - Add party widget demo HTML for visual reference
  - Add comprehensive documentation for party sub-widget
  - Fix code review issues: date parsing and formatting
  - Add test script for party sub-widget
  - Add party sub-widget configuration to admin dashboard
  - Add party sub-widget to smart mirror
  - Initial plan


## [2.6.4] - 2026-02-02

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #409 from spospordo/copilot/add-scheduling-sub-tab-party
  - Use property shorthand for cleaner code
  - Fix code review issues: remove redundant fallback and improve ID generation
  - Complete Party scheduling sub-tab implementation with full testing
  - Add Party scheduling sub-tab with all features
  - Initial plan


## [2.6.3] - 2026-02-02

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #407 from spospordo/copilot/add-apis-and-connections-section
  - Fix JavaScript errors by updating to use centralized API key fields
  - Changes before error encountered
  - Initial plan


## [2.6.2] - 2026-02-02

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #403 from spospordo/copilot/fix-clock-widget-timezones
  - Remove runtime config file and reset unrelated package-lock changes
  - Fix clock widget: include additionalTimezones in public config and pass config to updateClockWidget
  - Initial plan


## [2.6.1] - 2026-02-02

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #405 from spospordo/copilot/fix-admin-portal-hanging
  - Fix: Rename duplicate const entityIds variables to resolve admin portal hang
  - Initial plan


## [2.6.0] - 2026-02-02

### Minor Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #401 from spospordo/copilot/add-smart-widget-display
  - docs: Add detailed implementation summary for Smart Widget
  - docs: Add Smart Widget documentation and update README
  - feat: Add Smart Widget admin interface configuration
  - feat: Add Smart Widget backend and frontend rendering
  - Initial plan


## [2.5.0] - 2026-02-01

### Minor Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #399 from spospordo/copilot/fix-widget-appearance-editor
  - fix: Update test to only check for correct vacation emoji
  - feat: Add vacation widget to grid editor WIDGET_ICONS
  - Initial plan


## [2.4.4] - 2026-02-01

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #397 from spospordo/copilot/update-clock-widget-timezones
  - Remove test clock widget file
  - Remove test files from public directory
  - Complete multi-timezone clock widget implementation with UI testing
  - Add multi-timezone support to clock widget
  - Initial plan


## [2.4.3] - 2026-01-27

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #393 from spospordo/copilot/add-upcoming-vacations-widget-again
  - Fix vacation widget grid constraints to match 4×6 portrait grid
  - Update test to verify vacation widget admin integration
  - Add vacation widget configuration to admin dashboard
  - Initial plan


## [2.4.2] - 2026-01-27

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #391 from spospordo/copilot/add-upcoming-vacation-widget
  - Improve error handling logic in weather fallback
  - Fix potential runtime errors in weather data handling
  - Fix documentation to match implementation (5-day forecast)
  - Fix weather forecast fallback logic and improve code readability
  - Add vacation widget test script and comprehensive documentation
  - Add vacation widget frontend implementation and admin UI validation
  - Add backend API endpoints and vacation widget configuration
  - Initial plan


## [2.4.1] - 2026-01-23

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #387 from spospordo/revert-386-copilot/support-nfs-storage-locations
  - Revert "feat: Add NFS storage support for network-attached storage devices"


## [2.4.0] - 2026-01-23

### Minor Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #386 from spospordo/copilot/support-nfs-storage-locations
  - refactor: Address final code review feedback - cache initialization and constants
  - docs: Add comprehensive implementation summary
  - fix: Address code review feedback - race conditions, caching, and performance
  - test: Add comprehensive tests for NFS storage functionality
  - feat: Add NFS storage support with health monitoring and API endpoints
  - Initial plan


## [2.3.4] - 2026-01-23

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #384 from spospordo/copilot/remove-nfs-feature-code
  - Final cleanup: update .gitignore for NFS directories
  - Remove remaining NFS documentation from README
  - Remove NFS UI, documentation, and Docker dependencies
  - Remove NFS module, API endpoints, and core functionality
  - Initial plan


## [2.3.3] - 2026-01-23

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #382 from spospordo/copilot/refine-nfs-feature-support
  - Fix regex patterns for precise SMB/NFS version detection and option matching
  - Refine validation: fix vers regex, make uid/gid warnings, clarify Synology guidance
  - Fix validation logic to avoid false positives and correctly handle NFS options
  - Add NFS mount option validation and Synology-specific guidance
  - Initial plan


## [2.3.2] - 2026-01-22

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #378 from spospordo/copilot/display-nfs-error-messages
  - Fix XSS vulnerability in NFS error display
  - Add detailed NFS error display in admin UI
  - Initial plan


## [2.3.1] - 2026-01-22

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #376 from spospordo/copilot/improve-error-handling
  - Add feature summary documentation
  - Address code review feedback: move imports and improve documentation
  - Enhance finance.js error handling and add comprehensive ERROR_HANDLING.md documentation
  - Enhance server.js error handling with logger integration
  - Add error-helper module and enhance NFS/GitHub error handling
  - Initial plan


## [2.3.0] - 2026-01-22

### Minor Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #374 from spospordo/copilot/add-nfs-network-drive-connection
  - docs: add comprehensive NFS testing guide
  - docs: add NFS documentation and update README
  - feat: add NFS UI to admin dashboard
  - feat: add NFS module and server-side API endpoints
  - Initial plan


## [2.2.16] - 2026-01-22

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #372 from spospordo/copilot/improve-device-name-display
  - Final code quality improvements: eliminate duplication and improve robustness
  - Address code review feedback: improve custom icon handling and error handling
  - Complete implementation and testing of media center improvements
  - Add color and icon customization support to media center devices
  - Initial plan


## [2.2.15] - 2026-01-21

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #370 from spospordo/copilot/allow-rearranging-devices
  - Optimize cursor updates and add debounced save for device dragging
  - Implement individual device dragging on Media Center connection diagram
  - Initial plan


## [2.2.14] - 2026-01-21

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #368 from spospordo/copilot/fix-device-list-display
  - Change amplifier icon to control knobs (🎛️) for better distinction
  - Fix Media Center device list display and add amplifier type
  - Initial plan for Media Center fix and amplifier type addition
  - Initial plan


## [2.2.13] - 2026-01-21

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #366 from spospordo/copilot/add-media-center-sub-tab
  - Complete Media Center sub-tab implementation - all features working
  - Add Media Center frontend - UI, modals, and JavaScript functions
  - Add Media Center backend support - module and API endpoints
  - Initial plan


## [2.2.12] - 2026-01-21

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #364 from spospordo/copilot/create-house-page-for-info
  - Complete House Page implementation with testing
  - Add House module with Vacation and Documentation tabs
  - Initial plan


## [2.2.11] - 2026-01-20

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #362 from spospordo/copilot/move-account-sections-to-sub-tab
  - Fix version number in documentation (v2.2.10)
  - Update FINANCE_MODULE.md documentation for Account sub-tab
  - Add Account sub-tab to Finance module and reorganize sections
  - Initial plan


## [2.2.10] - 2026-01-20

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #360 from spospordo/copilot/allow-admin-unmerge-accounts
  - Address code review feedback: use crypto.randomUUID and consistent date format
  - Update documentation for account unmerge feature
  - Add account unmerge feature implementation
  - Initial plan


## [2.2.9] - 2026-01-20

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #358 from spospordo/copilot/add-merge-split-accounts-feature
  - Address code review feedback
  - Add test script for account merge functionality
  - Implement account merge feature for Finance module
  - Initial plan


## [2.2.8] - 2026-01-07

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #354 from spospordo/copilot/implement-server-side-caching
  - Address code review feedback - improve maintainability
  - Add comprehensive documentation for calendar caching feature
  - Add test script for calendar caching functionality
  - Add admin UI for calendar cache configuration and status
  - Implement server-side calendar caching with ETag support
  - Initial plan


## [2.2.7] - 2026-01-07

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #350 from spospordo/copilot/reduce-failed-login-logs
  - Address final nitpicks - extract all magic values to constants
  - Extract constants and use package.json version for maintainability
  - Address code review feedback - improve code quality and test coverage
  - Fix version mismatch in documentation (2.2.6 not 2.2.7)
  - Add comprehensive documentation for HA login logs fix
  - Add User-Agent headers, request caching, and rate limiting to fix HA login logs
  - Initial plan


## [2.2.6] - 2026-01-06

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #344 from spospordo/copilot/add-webhooks-display-dashboard
  - Complete webhook dashboard display and navigation fixes
  - Fix webhook back to dashboard link and add webhook list display on dashboard
  - Initial plan


## [2.2.5] - 2026-01-06

### Patch Update
- Automated version bump based on recent changes
- Changes included:
  - Merge pull request #342 from spospordo/copilot/fix-typeerror-bump-version


## [2.2.4] - 2025-10-13

### Added
- **Complete Magic Mirror Implementation**: Fully functional magic mirror dashboard with real data integration
  - Weather widget now fetches live weather data from OpenWeather API
  - Calendar widget parses and displays iCal/ICS feeds with upcoming events
  - News widget fetches and displays RSS feed items
  - Backend API endpoints for weather, calendar, and news data
  - Graceful fallbacks when API keys or feeds are not configured
  - Real-time updates for all widgets (weather: 10 min, calendar: 1 hour, news: 15 min)
  - Comprehensive error handling and user-friendly error messages
  
### Changed
- Magic Mirror weather widget now displays live weather data with temperature, conditions, humidity, and wind speed
- Magic Mirror calendar widget now shows actual upcoming events from iCal feeds
- Magic Mirror news widget now displays real RSS feed items with titles and timestamps
- Enhanced magic mirror HTML with improved weather display including weather icons
- Improved error handling for all magic mirror API endpoints

### Fixed
- Magic mirror placeholder implementations replaced with fully functional integrations
- Weather API now properly handles both configured and unconfigured API key states
- Calendar parsing now correctly filters and sorts upcoming events
- News feed parsing now properly extracts RSS items

### Technical
- Added `node-ical` dependency for iCal/ICS calendar parsing
- New API endpoints:
  - `GET /api/magicmirror/weather` - Fetch weather data
  - `GET /api/magicmirror/calendar` - Fetch calendar events
  - `GET /api/magicmirror/news` - Fetch news feed items
- Added comprehensive test suite: `scripts/test-magic-mirror.js`
- All tests passing (14/14)

## [2.2.3] - 2025-10-13

### Added
- **Magic Mirror Dashboard**: New tab in Server section for configurable information dashboard
  - Admin interface to enable/disable Magic Mirror dashboard
  - Widget configuration (Clock, Weather, Calendar, News)
  - Weather settings with location and optional API key support
  - Calendar integration via iCal/ICS URL
  - News feed integration via RSS URL
  - Public dashboard page accessible at `/magic-mirror`
  - Secure encrypted storage for configuration (AES-256-GCM)
  - New backend module `modules/magicmirror.js` for configuration management
  - API endpoints:
    - `GET /admin/api/magicmirror/config` - Get configuration (admin only)
    - `POST /admin/api/magicmirror/config` - Update configuration (admin only)
    - `GET /api/magicmirror/data` - Get dashboard data (public, enabled check)

### Changed
- Added Magic Mirror sub-tab to Server section in admin dashboard
- Enhanced server configuration capabilities with dashboard display functionality

## [2.2.2] - 2025-10-13

### Added
- **Advanced Settings for Finance Module**: New Advanced Settings page accessible from "My Data" tab
  - Configure Monte Carlo simulation parameters (number of simulations, years in retirement)
  - Customize inflation rate and savings rate assumptions
  - Adjust expected returns and volatility for each risk profile (conservative, moderate, aggressive)
  - Set retirement phase adjustments for return and volatility
  - All settings influence both retirement assessment and allocation recommendations
  - Reset to defaults option available
- "Advanced settings" link at the bottom of the Finance "My Data" tab
- New API endpoints:
  - `GET /admin/api/finance/advanced-settings` - Get advanced settings
  - `POST /admin/api/finance/advanced-settings` - Update advanced settings

### Changed
- Retirement evaluation now uses configurable advanced settings instead of hardcoded values
- Demo retirement evaluation also respects user's advanced settings
- Finance module default data structure now includes advancedSettings object

## [2.2.1] - 2025-10-13

### Fixed
- **CRITICAL: Persistence Bug Fixed**: Config files no longer copied into Docker image, ensuring settings persist across container rebuilds
- Added all persistent config files to .dockerignore to prevent them from being baked into the image
- Finance module profile data now properly persists (was already working, now documented)
- Vidiots scraper enable/disable state now properly persists across redeploys
- GitHub upload enable/disable state now properly persists across redeploys

### Changed
- Updated .dockerignore to exclude all persistent configuration files:
  - config/config.json (main configuration)
  - config/.client_auth (client passwords)
  - config/.finance_key and config/.finance_data (finance module)
  - config/.gitconfig (git identity)
  - config/ollama-config.json.enc and config/.ollama-key (Ollama AI)
  - config/config.json.backup and backups/ (backup files)

### Documentation
- Enhanced PERSISTENCE.md with complete list of all persistent data points:
  - Added Vidiots scraper configuration section
  - Added Finance module data section with encryption details
  - Added Ollama AI integration section
  - Added GitHub integration settings section
  - Added Espresso data section
- All data persistence mechanisms now documented with locations and auto-persist status

## [2.2.0] - 2025-10-10

### Added
- Finance tab now includes three sub-tabs: Demo, My Data, and Spending
- Demo sub-tab: Empty placeholder for future content
- My Data sub-tab: Contains all existing Finance module functionality (accounts, demographics, retirement planning, etc.)
- Spending sub-tab: Admin interface for Ollama LLM integration via Open WebUI
  - **Backend integration completed**: Real API communication with Ollama/Open WebUI instances
  - Connection configuration UI for Ollama LLM instances on TrueNAS or local network
  - Secure AES-256-GCM encrypted storage for API keys and configuration
  - Connection status display with real-time testing (connected/disconnected, error messages)
  - Live AI chat with prompt/response interface
  - Conversation history tracking (currently localStorage, server-side storage planned)
  - Performance metrics display (actual response time from Ollama)
  - Comprehensive error handling with user-friendly suggestions
  - Support for all Ollama models (llama2, mistral, codellama, etc.)
  - Admin-only access with session-based authentication
  - New API endpoints:
    - `GET /admin/api/ollama/config` - Get Ollama configuration
    - `POST /admin/api/ollama/config` - Save Ollama configuration
    - `POST /admin/api/ollama/test-connection` - Test connection to Open WebUI
    - `POST /admin/api/ollama/chat` - Send prompt and receive AI response
    - `GET /admin/api/ollama/models` - Get available models
- Sub-tab navigation follows same pattern as Party and Server tabs
- New documentation: `OLLAMA_INTEGRATION.md` with comprehensive setup and API guide

### Changed
- Reorganized Finance tab to use sub-tab architecture
- All existing Finance functionality moved to "My Data" sub-tab
- Spending tab now uses real backend API instead of UI mockup
- Configuration stored server-side with encryption instead of browser localStorage

## [1.1.5] - 2025-10-08

### Fixed
- **DEFINITIVE ARM64 FIX**: Resolved sharp module ARM64 runtime error by excluding package-lock.json from Docker builds
- Sharp now correctly installs platform-specific binaries on Raspberry Pi ARM64 deployments
- Fixed platform binary mismatch that occurred when package-lock.json contained x64-specific dependencies

### Added
- Timestamp logging in server startup (shows version, date/time when server starts)
- Timestamp logging in container startup (shows date/time when container initializes)
- Added package-lock.json to .dockerignore to prevent cross-platform binary conflicts

### Changed
- Dockerfile now uses `npm install` instead of `npm ci` to ensure correct platform detection
- Package-lock.json is excluded from Docker builds to avoid locked platform-specific packages
- Container startup and server startup now display timestamps for easier log tracking

### Technical Details
The root cause of the persistent ARM64 sharp error was package-lock.json containing locked platform-specific binaries (often from x64 development environments). When copied into the Docker build context and used with `npm ci`, it forced installation of wrong-platform binaries even when building on ARM64.

**The Fix:**
1. Added `package-lock.json` to `.dockerignore` - prevents platform-locked dependencies from entering Docker build
2. Docker build now uses `npm install` (not `npm ci`) - ensures platform detection works correctly
3. Sharp is rebuilt after installation - guarantees ARM64 binaries are compiled correctly

This ensures that when Portainer builds the image on Raspberry Pi, npm detects ARM64 and installs the correct linux-arm64 sharp binaries, eliminating the runtime error.

## [1.1.3] - 2025-01-08

### Fixed
- **CRITICAL FIX**: Resolved persistent sharp module ARM64 runtime error on Raspberry Pi deployments
- Added libvips-dev build dependency installation in Dockerfile for ARM64 compatibility
- Sharp now correctly builds and loads on ARM64 architecture (Raspberry Pi, etc.)

### Added
- docker-compose.portainer.yml - Dedicated compose file optimized for Portainer Git repository deployments
- Installation of libvips-dev native library in Dockerfile for sharp module support on ARM64

### Changed
- Updated Dockerfile to install libvips-dev before npm install for proper ARM64 sharp compilation
- Improved Portainer deployment documentation with correct Git repository deployment method

### Technical Details
The root cause of the persistent "Could not load the sharp module using the linux-arm64 runtime" error was the absence of libvips native libraries. The sharp npm module requires platform-specific native bindings, and on ARM64 (Raspberry Pi), it needs libvips-dev to be installed during the Docker build process. Without these libraries, even `npm rebuild sharp --verbose` cannot compile/download the correct binaries.

**What changed:**
- Added `apt-get install libvips-dev` before npm dependencies installation
- This ensures the native libraries are available when sharp builds its ARM64 binaries
- The npm rebuild step can now properly compile sharp for linux-arm64 runtime

This fix enables successful Portainer deployment on Raspberry Pi by ensuring all required build dependencies are present during the Docker image build process.

## [1.1.2] - 2025-01-08

### Fixed
- Fixed sharp module ARM64 deployment issue when deploying from Portainer Git repository
- Added explicit `npm rebuild sharp --verbose` step to ensure platform-specific binaries are correctly installed
- Ensures sharp works correctly on Raspberry Pi ARM64 architecture

### Changed
- Updated Dockerfile to include explicit sharp rebuild step after npm install
- This forces sharp to compile/download the correct ARM64 binaries during Docker build on Raspberry Pi

### Technical Details
The issue persisted in v1.1.1 because npm install alone wasn't sufficient to get the correct ARM64 binaries for sharp in all deployment scenarios (especially Portainer Git builds). By adding an explicit `npm rebuild sharp --verbose` step after the dependency installation, we ensure that sharp is rebuilt for the exact platform where the Docker image is being built. This guarantees that the linux-arm64 runtime binaries are present when the container starts.

## [1.1.1] - 2025-01-07

### Fixed
- Fixed sharp module ARM64 compatibility when deploying via Portainer from Git repository
- Added `node_modules` to `.dockerignore` to prevent build context conflicts
- Improved npm install fallback logic: `npm ci || npm install` for better platform compatibility

### Changed
- Updated Dockerfile to use `npm ci || npm install --include=optional` for more robust dependency installation
- Enhanced PORTAINER.md with ARM64-specific troubleshooting guide
- Updated DEPLOYMENT.md and SHARP_ARM64_FIX.md with clearer ARM64 build instructions

### Documentation
- Added detailed troubleshooting section for "Could not load sharp module using linux-arm64 runtime" error
- Clarified that ARM64 users must build images on ARM64 devices or use ARM64-specific image tags
- Added note about Docker build cache clearing for Raspberry Pi deployments

## [1.1.0] - 2025-01-07

### Fixed
- Fixed sharp module ARM64 runtime loading issue on Raspberry Pi
- Removed `--omit=dev` flag from npm install in Dockerfile to ensure all optional dependencies are properly installed
- Removed redundant `npm rebuild sharp` command that was ineffective

### Changed
- Updated npm ci to use `--include=optional` only for better compatibility with platform-specific binaries
- Updated DEPLOYMENT.md to reflect the fix for ARM64 compatibility

### Technical Details
The issue was caused by `--omit=dev` flag preventing npm from properly installing platform-specific optional dependencies for sharp. By removing this flag and keeping `--include=optional`, npm correctly installs the linux-arm64 native bindings for sharp during the Docker build process.

## [1.0.3] - Previous Version
- Previous stable release
