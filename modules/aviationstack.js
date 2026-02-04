const axios = require('axios');
const logger = require('./logger');

/**
 * AviationStack API Integration Module
 * Handles flight data retrieval and validation
 * Free tier: 100 API calls per month
 * API Documentation: https://aviationstack.com/documentation
 */

const AVIATIONSTACK_BASE_URL = 'https://api.aviationstack.com/v1';

// API usage tracking
let apiUsage = {
  monthlyLimit: 100,
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  callsThisMonth: 0,
  lastReset: new Date().toISOString()
};

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

    logger.info(logger.categories.SMART_MIRROR, 'Testing AviationStack API connection');
    
    const response = await axios.get(url, { params, timeout: 10000 });
    
    incrementUsage();

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
    const params = {
      access_key: apiKey,
      flight_iata: flightIata,
      flight_date: flightDate
    };

    logger.info(logger.categories.SMART_MIRROR, `Validating flight ${flightIata} on ${flightDate} using AviationStack API (API key present: ${!!apiKey}, key length: ${apiKey.length})`);
    
    const response = await axios.get(url, { params, timeout: 10000 });
    
    incrementUsage();

    if (response.data && response.data.data && response.data.data.length > 0) {
      const flight = response.data.data[0];
      logger.info(logger.categories.SMART_MIRROR, `Flight ${flightIata} validated successfully`);
      
      return {
        success: true,
        message: 'Flight validated successfully',
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
    const params = {
      access_key: apiKey,
      flight_iata: flightIata,
      flight_date: flightDate
    };

    logger.info(logger.categories.SMART_MIRROR, `Fetching flight status for ${flightIata} on ${flightDate} using AviationStack API (API key present: ${!!apiKey})`);
    
    const response = await axios.get(url, { params, timeout: 10000 });
    
    incrementUsage();

    if (response.data && response.data.data && response.data.data.length > 0) {
      const flight = response.data.data[0];
      const status = flight.flight_status || 'scheduled';
      
      logger.info(logger.categories.SMART_MIRROR, `Flight ${flightIata} status: ${status}`);
      
      return {
        success: true,
        flightStatus: {
          flightIata: flight.flight.iata,
          flightNumber: flight.flight.number,
          airline: {
            name: flight.airline.name,
            iata: flight.airline.iata
          },
          status: status,
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
  isLimitReached
};
