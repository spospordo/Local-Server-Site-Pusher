const axios = require('axios');
const logger = require('./logger');

/**
 * AviationStack API Integration Module
 * Handles flight data retrieval and validation
 * Free tier: 100 API calls per month
 * API Documentation: https://aviationstack.com/documentation
 */

// AviationStack Free Plan requires HTTP (not HTTPS).
// HTTPS access is restricted to paid plans (error code 105).
// Always use HTTP for Free Plan compatibility.
// ⚠️  Security note: HTTP transmits the API key and flight data in plaintext.
// For production environments handling sensitive data, consider upgrading to a
// paid AviationStack plan which supports HTTPS.
const AVIATIONSTACK_BASE_URL = 'http://api.aviationstack.com/v1';

// API usage tracking
let apiUsage = {
  monthlyLimit: 100,
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  callsThisMonth: 0,
  lastReset: new Date().toISOString()
};

/**
 * Get API key fingerprint for logging (last 4 characters only)
 * Never logs the full key for security
 * @param {string} apiKey - The API key to fingerprint
 * @returns {string} Fingerprint like "...xyz9" or "none"
 */
function getApiKeyFingerprint(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return 'none';
  }
  if (apiKey.length <= 4) {
    return '...' + apiKey;
  }
  return '...' + apiKey.slice(-4);
}

/**
 * Reset API usage counter if new month
 */
function resetUsageIfNewMonth() {
  const now = new Date();
  if (now.getMonth() !== apiUsage.currentMonth || now.getFullYear() !== apiUsage.currentYear) {
    logger.info(logger.categories.SMART_MIRROR, 'Resetting AviationStack API usage counter for new month');
    apiUsage.currentMonth = now.getMonth();
    apiUsage.currentYear = now.getFullYear();
    apiUsage.callsThisMonth = 0;
    apiUsage.lastReset = now.toISOString();
  }
}

/**
 * Increment API usage counter
 */
function incrementUsage() {
  resetUsageIfNewMonth();
  apiUsage.callsThisMonth++;
  logger.debug(logger.categories.SMART_MIRROR, `AviationStack API calls this month: ${apiUsage.callsThisMonth}/${apiUsage.monthlyLimit}`);
}

/**
 * Get current API usage statistics
 */
function getUsageStats() {
  resetUsageIfNewMonth();
  return {
    ...apiUsage,
    remaining: apiUsage.monthlyLimit - apiUsage.callsThisMonth,
    percentUsed: Math.round((apiUsage.callsThisMonth / apiUsage.monthlyLimit) * 100)
  };
}

/**
 * Check if API call limit has been reached
 */
function isLimitReached() {
  resetUsageIfNewMonth();
  return apiUsage.callsThisMonth >= apiUsage.monthlyLimit;
}

/**
 * Test API connection with provided API key
 * @param {string} apiKey - AviationStack API key
 * @returns {Promise<Object>} Connection test result
 */
async function testConnection(apiKey) {
  if (!apiKey) {
    return {
      success: false,
      error: 'API key is required'
    };
  }

  try {
    // Use a simple endpoint to test the connection
    // Flights endpoint with a common airline
    const url = `${AVIATIONSTACK_BASE_URL}/flights`;
    const params = {
      access_key: apiKey,
      limit: 1 // Minimal request to save quota
    };

    const keyFingerprint = getApiKeyFingerprint(apiKey);
    logger.info(logger.categories.SMART_MIRROR, `Testing AviationStack API connection with key ${keyFingerprint}`);
    
    const response = await axios.get(url, { params, timeout: 10000 });
    
    incrementUsage();

    // Check for AviationStack error in response body (API returns HTTP 200 with error object)
    if (response.data && response.data.success === false && response.data.error) {
      const errCode = parseInt(response.data.error.code, 10);
      const errInfo = response.data.error.info || response.data.error.message;
      logger.error(logger.categories.SMART_MIRROR, `AviationStack connection test error in response body: code=${errCode}, info=${errInfo}`);
      if (errCode === 106) {
        // Plan restriction — key is valid but Free Plan does not support this endpoint/filter
        logger.warning(logger.categories.SMART_MIRROR, 'AviationStack Free Plan detected: API key is valid but plan has restrictions');
        return {
          success: true,
          freePlan: true,
          message: 'AviationStack Free Plan detected. Your API key is valid. Basic flight format validation is available; real-time flight tracking requires a paid plan.',
          data: { apiActive: true, freePlan: true }
        };
      }
      return {
        success: false,
        error: errInfo || 'AviationStack API error'
      };
    }

    if (response.data && response.data.data !== undefined) {
      logger.info(logger.categories.SMART_MIRROR, 'AviationStack API connection successful');
      return {
        success: true,
        message: 'Connection successful',
        data: {
          apiActive: true,
          quotaInfo: response.data.pagination || {}
        }
      };
    } else {
      return {
        success: false,
        error: 'Unexpected API response format'
      };
    }
  } catch (error) {
    logger.error(logger.categories.SMART_MIRROR, `AviationStack connection test failed: ${error.message}`);
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401 || status === 403) {
        // Check AviationStack error body before returning generic message
        if (data && data.error) {
          const errCode = parseInt(data.error.code, 10);
          const errInfo = data.error.info || data.error.message;
          logger.error(logger.categories.SMART_MIRROR, `AviationStack API error (HTTP ${status}): code=${errCode}, info=${errInfo}`);
          if (errCode === 106) {
            logger.warning(logger.categories.SMART_MIRROR, 'AviationStack Free Plan detected: API key is valid but plan has restrictions');
            return {
              success: true,
              freePlan: true,
              message: 'AviationStack Free Plan detected. Your API key is valid. Basic flight format validation is available; real-time flight tracking requires a paid plan.',
              data: { apiActive: true, freePlan: true }
            };
          }
          if (errInfo) {
            return { success: false, error: errInfo };
          }
        }
        logger.error(logger.categories.SMART_MIRROR, `AviationStack API authentication failed: HTTP ${status}`);
        return {
          success: false,
          error: 'Invalid API key or unauthorized access. Please verify your API key is correct and active.'
        };
      } else if (status === 429) {
        logger.error(logger.categories.SMART_MIRROR, 'AviationStack API rate limit exceeded');
        return {
          success: false,
          error: 'API rate limit exceeded. Please try again later.'
        };
      } else if (data && data.error) {
        logger.error(logger.categories.SMART_MIRROR, `AviationStack API error: ${data.error.message || data.error.info}`);
        return {
          success: false,
          error: data.error.message || data.error.info || 'API error'
        };
      }
    }
    
    logger.error(logger.categories.SMART_MIRROR, `Unexpected connection test error: ${error.message}`);
    return {
      success: false,
      error: error.message || 'Connection failed'
    };
  }
}

/**
 * Validate a flight number with real-time API check
 * @param {string} apiKey - AviationStack API key
 * @param {string} flightIata - Flight IATA code (e.g., "AA123")
 * @param {string} flightDate - Flight date in YYYY-MM-DD format
 * @param {boolean} bypassLimit - If true, bypasses limit check (for admin actions)
 * @returns {Promise<Object>} Validation result
 */
async function validateFlight(apiKey, flightIata, flightDate, bypassLimit = false) {
  if (!apiKey) {
    logger.error(logger.categories.SMART_MIRROR, 'Flight validation failed: API key not configured');
    return {
      success: false,
      error: 'API key not configured. Please configure the AviationStack API key in Smart Mirror settings.'
    };
  }

  if (!flightIata || !flightDate) {
    logger.error(logger.categories.SMART_MIRROR, 'Flight validation failed: Missing flight number or date');
    return {
      success: false,
      error: 'Flight number and date are required'
    };
  }

  if (!bypassLimit && isLimitReached()) {
    logger.warning(logger.categories.SMART_MIRROR, 'AviationStack API monthly limit reached');
    return {
      success: false,
      error: 'Monthly API call limit reached. Flight validation unavailable.'
    };
  }

  try {
    const url = `${AVIATIONSTACK_BASE_URL}/flights`;
    // Free Plan does not support the flight_date filter (returns 403 function_access_restricted).
    // Request by flight_iata only and match the desired date client-side.
    const params = {
      access_key: apiKey,
      flight_iata: flightIata,
      limit: 10
    };

    const keyFingerprint = getApiKeyFingerprint(apiKey);
    logger.info(logger.categories.SMART_MIRROR, `Validating flight ${flightIata} on ${flightDate} using AviationStack API (key: ${keyFingerprint}, key length: ${apiKey.length})`);
    
    const response = await axios.get(url, { params, timeout: 10000 });
    
    incrementUsage();

    if (response.data && response.data.data && response.data.data.length > 0) {
      // Try to find the record matching the requested date; fall back to the first result
      const allFlights = response.data.data;
      const flight = allFlights.find(f => f.flight_date === flightDate) || allFlights[0];
      const dateNote = flight.flight_date !== flightDate
        ? ` (closest available record is for ${flight.flight_date}; real-time data for ${flightDate} may not be in the schedule yet)`
        : '';
      logger.info(logger.categories.SMART_MIRROR, `Flight ${flightIata} validated successfully${dateNote}`);
      
      return {
        success: true,
        message: `Flight validated successfully${dateNote}`,
        flightInfo: {
          flightIata: flight.flight.iata,
          flightNumber: flight.flight.number,
          airline: {
            name: flight.airline.name,
            iata: flight.airline.iata
          },
          departure: {
            airport: flight.departure.airport,
            timezone: flight.departure.timezone,
            iata: flight.departure.iata,
            scheduledTime: flight.departure.scheduled
          },
          arrival: {
            airport: flight.arrival.airport,
            timezone: flight.arrival.timezone,
            iata: flight.arrival.iata,
            scheduledTime: flight.arrival.scheduled
          },
          date: flightDate,
          validated: true
        }
      };
    } else if (response.data && response.data.success === false && response.data.error) {
      // AviationStack returned an error in the response body (HTTP 200 with error object)
      const rawCode = response.data.error.code;
      const errCode = parseInt(rawCode, 10);
      const errInfo = response.data.error.info || response.data.error.message;
      logger.error(logger.categories.SMART_MIRROR, `AviationStack API error in response body: code=${rawCode}, info=${errInfo}`);
      if (errCode === 101) {
        return { success: false, error: 'Invalid API key. Please verify your AviationStack API key in Smart Mirror settings is correct and active.' };
      } else if (errCode === 102) {
        return { success: false, error: 'AviationStack account is inactive. Please check your account status at aviationstack.com.' };
      } else if (errCode === 105) {
        return { success: false, error: 'HTTPS access is restricted on the Free Plan. The application is configured to use HTTP — if you see this error, please ensure no proxy or network layer is forcing HTTPS for api.aviationstack.com.' };
      } else if (errCode === 106 || rawCode === 'function_access_restricted') {
        logger.warning(logger.categories.SMART_MIRROR, `AviationStack plan restriction for flight_iata filter, falling back to format-only validation`);
        return {
          success: true,
          message: 'Flight format validated (your AviationStack Free Plan does not support this query parameter; flight format is valid)',
          flightInfo: {
            flightNumber: flightIata.toUpperCase(),
            date: flightDate,
            validated: true,
            limitedValidation: true
          }
        };
      } else {
        return { success: false, error: errInfo || 'AviationStack API error. Please try again.' };
      }
    } else {
      logger.warning(logger.categories.SMART_MIRROR, `Flight ${flightIata} not found on ${flightDate}`);
      return {
        success: false,
        error: 'Flight not found. Please check the flight number and date.'
      };
    }
  } catch (error) {
    logger.error(logger.categories.SMART_MIRROR, `Flight validation error: ${error.message}`);
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401 || status === 403) {
        // Check AviationStack error body before returning generic message
        if (data && data.error) {
          const rawCode = data.error.code;
          const errCode = parseInt(rawCode, 10);
          const errInfo = data.error.info || data.error.message;
          logger.error(logger.categories.SMART_MIRROR, `AviationStack API error (HTTP ${status}): code=${rawCode}, info=${errInfo}`);
          if (errCode === 105) {
            return { success: false, error: 'HTTPS access is restricted on the Free Plan. The application is configured to use HTTP — if you see this error, please ensure no proxy or network layer is forcing HTTPS for api.aviationstack.com.' };
          } else if (errCode === 106 || rawCode === 'function_access_restricted') {
            // Plan restriction - fall back to format-only validation instead of showing an error
            logger.warning(logger.categories.SMART_MIRROR, `AviationStack plan restriction (HTTP ${status}), falling back to format-only validation`);
            return {
              success: true,
              message: 'Flight format validated (your AviationStack Free Plan does not support this query parameter; flight format is valid)',
              flightInfo: {
                flightNumber: flightIata.toUpperCase(),
                date: flightDate,
                validated: true,
                limitedValidation: true
              }
            };
          } else if (errInfo) {
            return { success: false, error: errInfo };
          }
        }
        logger.error(logger.categories.SMART_MIRROR, `AviationStack API authentication failed: HTTP ${status}`);
        return {
          success: false,
          error: 'Invalid API key or unauthorized access. Please verify your AviationStack API key in Smart Mirror settings is correct and active.'
        };
      } else if (status === 429) {
        logger.error(logger.categories.SMART_MIRROR, 'AviationStack API rate limit exceeded');
        return {
          success: false,
          error: 'API rate limit exceeded. Please try again later or upgrade your AviationStack plan.'
        };
      } else if (data && data.error) {
        logger.error(logger.categories.SMART_MIRROR, `AviationStack API error: ${data.error.message || data.error.info}`);
        return {
          success: false,
          error: data.error.message || data.error.info || 'API error'
        };
      }
    }
    
    logger.error(logger.categories.SMART_MIRROR, `Unexpected flight validation error: ${error.message}`);
    return {
      success: false,
      error: error.message || 'Flight validation failed'
    };
  }
}

/**
 * Get real-time flight status
 * @param {string} apiKey - AviationStack API key
 * @param {string} flightIata - Flight IATA code (e.g., "AA123")
 * @param {string} flightDate - Flight date in YYYY-MM-DD format
 * @param {boolean} bypassLimit - If true, bypasses limit check (for admin actions)
 * @returns {Promise<Object>} Flight status data
 */
async function getFlightStatus(apiKey, flightIata, flightDate, bypassLimit = false) {
  if (!apiKey) {
    logger.error(logger.categories.SMART_MIRROR, 'Flight status fetch failed: API key not configured');
    return {
      success: false,
      error: 'API key not configured. Please configure the AviationStack API key in Smart Mirror settings.'
    };
  }

  if (!flightIata || !flightDate) {
    logger.error(logger.categories.SMART_MIRROR, 'Flight status fetch failed: Missing flight number or date');
    return {
      success: false,
      error: 'Flight number and date are required'
    };
  }

  if (!bypassLimit && isLimitReached()) {
    logger.warning(logger.categories.SMART_MIRROR, 'AviationStack API monthly limit reached');
    return {
      success: false,
      error: 'Monthly API call limit reached. Flight status unavailable.'
    };
  }

  try {
    const url = `${AVIATIONSTACK_BASE_URL}/flights`;
    // Free Plan does not support the flight_date filter (returns 403 function_access_restricted).
    // Request by flight_iata only and match the desired date client-side.
    const params = {
      access_key: apiKey,
      flight_iata: flightIata,
      limit: 10
    };

    const keyFingerprint = getApiKeyFingerprint(apiKey);
    logger.info(logger.categories.SMART_MIRROR, `Fetching flight status for ${flightIata} on ${flightDate} using AviationStack API (key: ${keyFingerprint})`);
    
    const response = await axios.get(url, { params, timeout: 10000 });
    
    incrementUsage();

    if (response.data && response.data.data && response.data.data.length > 0) {
      // Find record matching the requested date; fall back to first result
      const allFlights = response.data.data;
      const flight = allFlights.find(f => f.flight_date === flightDate) || allFlights[0];
      const flightStatus = flight.flight_status || 'scheduled';
      
      logger.info(logger.categories.SMART_MIRROR, `Flight ${flightIata} status: ${flightStatus} (record date: ${flight.flight_date})`);
      
      return {
        success: true,
        flightStatus: {
          flightIata: flight.flight.iata,
          flightNumber: flight.flight.number,
          airline: {
            name: flight.airline.name,
            iata: flight.airline.iata
          },
          status: flightStatus,
          departure: {
            airport: flight.departure.airport,
            iata: flight.departure.iata,
            terminal: flight.departure.terminal,
            gate: flight.departure.gate,
            scheduledTime: flight.departure.scheduled,
            estimatedTime: flight.departure.estimated,
            actualTime: flight.departure.actual,
            delay: flight.departure.delay
          },
          arrival: {
            airport: flight.arrival.airport,
            iata: flight.arrival.iata,
            terminal: flight.arrival.terminal,
            gate: flight.arrival.gate,
            baggage: flight.arrival.baggage,
            scheduledTime: flight.arrival.scheduled,
            estimatedTime: flight.arrival.estimated,
            actualTime: flight.arrival.actual,
            delay: flight.arrival.delay
          },
          lastUpdated: new Date().toISOString()
        }
      };
    } else if (response.data && response.data.success === false && response.data.error) {
      // AviationStack returned an error in the response body (HTTP 200 with error object)
      const rawCode = response.data.error.code;
      const errCode = parseInt(rawCode, 10);
      const errInfo = response.data.error.info || response.data.error.message;
      logger.error(logger.categories.SMART_MIRROR, `AviationStack API error in response body: code=${rawCode}, info=${errInfo}`);
      if (errCode === 106 || rawCode === 'function_access_restricted') {
        // Plan restriction — Free Plan does not support this filter
        logger.warning(logger.categories.SMART_MIRROR, `AviationStack plan restriction for getFlightStatus, returning limited status`);
        return {
          success: true,
          freePlan: true,
          flightStatus: {
            flightNumber: flightIata.toUpperCase(),
            status: 'unknown',
            limited: true,
            limitedReason: 'Your AviationStack Free Plan does not support this query. Upgrade your plan for full real-time flight status.',
            lastUpdated: new Date().toISOString()
          }
        };
      }
      return {
        success: false,
        error: errInfo || 'AviationStack API error. Please check your API key and plan settings.'
      };
    } else {
      logger.warning(logger.categories.SMART_MIRROR, `Flight ${flightIata} not found on ${flightDate}`);
      return {
        success: false,
        error: 'Flight not found'
      };
    }
  } catch (error) {
    logger.error(logger.categories.SMART_MIRROR, `Flight status fetch error: ${error.message}`);
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 401 || status === 403) {
        // Check AviationStack error body before returning generic message
        if (data && data.error) {
          const rawCode = data.error.code;
          const errCode = parseInt(rawCode, 10);
          const errInfo = data.error.info || data.error.message;
          logger.error(logger.categories.SMART_MIRROR, `AviationStack API error (HTTP ${status}): code=${rawCode}, info=${errInfo}`);
          if (errCode === 106 || rawCode === 'function_access_restricted') {
            logger.warning(logger.categories.SMART_MIRROR, `AviationStack plan restriction (HTTP ${status}), returning limited flight status`);
            return {
              success: true,
              freePlan: true,
              flightStatus: {
                flightNumber: flightIata.toUpperCase(),
                status: 'unknown',
                limited: true,
                limitedReason: 'Your AviationStack Free Plan does not support this query. Upgrade your plan for full real-time flight status.',
                lastUpdated: new Date().toISOString()
              }
            };
          }
          if (errInfo) {
            return { success: false, error: errInfo };
          }
        }
        logger.error(logger.categories.SMART_MIRROR, `AviationStack API authentication failed: HTTP ${status}`);
        return {
          success: false,
          error: 'Invalid API key or unauthorized access. Please verify your AviationStack API key in Smart Mirror settings is correct and active.'
        };
      } else if (status === 429) {
        logger.error(logger.categories.SMART_MIRROR, 'AviationStack API rate limit exceeded');
        return {
          success: false,
          error: 'API rate limit exceeded. Please try again later or upgrade your AviationStack plan.'
        };
      } else if (data && data.error) {
        logger.error(logger.categories.SMART_MIRROR, `AviationStack API error: ${data.error.message || data.error.info}`);
        return {
          success: false,
          error: data.error.message || data.error.info || 'API error'
        };
      }
    }
    
    logger.error(logger.categories.SMART_MIRROR, `Unexpected flight status fetch error: ${error.message}`);
    return {
      success: false,
      error: error.message || 'Failed to fetch flight status'
    };
  }
}

module.exports = {
  testConnection,
  validateFlight,
  getFlightStatus,
  getUsageStats,
  isLimitReached,
  getApiKeyFingerprint
};
