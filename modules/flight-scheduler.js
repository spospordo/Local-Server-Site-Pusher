const cron = require('node-cron');
const logger = require('./logger');
const aviationstack = require('./aviationstack');
const house = require('./house');
const smartMirror = require('./smartmirror');
const fs = require('fs');
const path = require('path');

/**
 * Flight Data Scheduler Module
 * Implements intelligent flight data updates based on proximity to departure
 * 
 * Update Schedule:
 * - Default: Once per day at 7am for all flights
 * - 3 days before: 3x daily (7am, noon, 5pm)
 * - Final 6 hours: Hourly updates
 */

// Cache file for storing flight data to minimize API calls
const FLIGHT_CACHE_FILE = path.join(__dirname, '..', 'config', 'flight-cache.json');

// Scheduled jobs registry
const scheduledJobs = {
  daily7am: null,
  daily12pm: null,
  daily5pm: null,
  hourly: null
};

/**
 * Load flight cache from disk
 */
function loadFlightCache() {
  try {
    if (fs.existsSync(FLIGHT_CACHE_FILE)) {
      const data = fs.readFileSync(FLIGHT_CACHE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error(logger.categories.SMART_MIRROR, `Error loading flight cache: ${error.message}`);
  }
  return {};
}

/**
 * Save flight cache to disk
 */
function saveFlightCache(cache) {
  try {
    fs.writeFileSync(FLIGHT_CACHE_FILE, JSON.stringify(cache, null, 2));
    logger.debug(logger.categories.SMART_MIRROR, 'Flight cache saved');
  } catch (error) {
    logger.error(logger.categories.SMART_MIRROR, `Error saving flight cache: ${error.message}`);
  }
}

/**
 * Get cached flight data
 */
function getCachedFlightData(flightKey) {
  const cache = loadFlightCache();
  return cache[flightKey] || null;
}

/**
 * Cache flight data
 */
function cacheFlightData(flightKey, flightData) {
  const cache = loadFlightCache();
  cache[flightKey] = {
    ...flightData,
    cachedAt: new Date().toISOString()
  };
  saveFlightCache(cache);
}

/**
 * Calculate days until flight
 */
function getDaysUntilFlight(flightDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const flight = new Date(flightDate);
  flight.setHours(0, 0, 0, 0);
  
  const diffTime = flight - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Calculate hours until flight
 */
function getHoursUntilFlight(flightDate) {
  const now = new Date();
  const flight = new Date(flightDate);
  
  const diffTime = flight - now;
  const diffHours = diffTime / (1000 * 60 * 60);
  
  return diffHours;
}

/**
 * Determine update frequency needed for a flight
 * @returns {string} 'hourly', 'thriceDaily', or 'daily'
 */
function getUpdateFrequency(flightDate) {
  const hoursUntil = getHoursUntilFlight(flightDate);
  const daysUntil = getDaysUntilFlight(flightDate);
  
  // Hourly for final 6 hours
  if (hoursUntil >= 0 && hoursUntil <= 6) {
    return 'hourly';
  }
  
  // 3x daily for 3 days before
  if (daysUntil >= 0 && daysUntil <= 3) {
    return 'thriceDaily';
  }
  
  // Daily for all other future flights
  if (daysUntil > 3) {
    return 'daily';
  }
  
  // Don't update past flights
  return 'none';
}

/**
 * Get all flights that need tracking
 */
function getTrackedFlights() {
  try {
    const vacationData = house.getVacationData();
    const trackedFlights = [];
    
    if (!vacationData || !vacationData.dates) {
      return trackedFlights;
    }
    
    for (const vacation of vacationData.dates) {
      // Only process vacations with flight tracking enabled
      if (!vacation.flightTrackingEnabled || !vacation.flights) {
        continue;
      }
      
      for (const flight of vacation.flights) {
        // Only track validated flights
        if (!flight.validated) {
          continue;
        }
        
        // Skip past flights (more than 1 day old)
        const daysUntil = getDaysUntilFlight(flight.date);
        if (daysUntil < -1) {
          continue;
        }
        
        trackedFlights.push({
          vacationId: vacation.id,
          flightIata: flight.flightNumber,
          date: flight.date,
          airline: flight.airline,
          updateFrequency: getUpdateFrequency(flight.date)
        });
      }
    }
    
    return trackedFlights;
  } catch (error) {
    logger.error(logger.categories.SMART_MIRROR, `Error getting tracked flights: ${error.message}`);
    return [];
  }
}

/**
 * Update a single flight's data
 */
async function updateFlightData(flight, apiKey) {
  const flightKey = `${flight.flightIata}_${flight.date}`;
  
  try {
    logger.info(logger.categories.SMART_MIRROR, `Updating flight data: ${flight.flightIata} on ${flight.date}`);
    
    // Check if API limit reached
    if (aviationstack.isLimitReached()) {
      logger.warning(logger.categories.SMART_MIRROR, 'AviationStack API limit reached, using cached data');
      return getCachedFlightData(flightKey);
    }
    
    // Fetch fresh data from API
    const result = await aviationstack.getFlightStatus(apiKey, flight.flightIata, flight.date);
    
    if (result.success) {
      // Cache the data
      cacheFlightData(flightKey, result.flightStatus);
      logger.info(logger.categories.SMART_MIRROR, `Flight ${flight.flightIata} data updated successfully`);
      return result.flightStatus;
    } else {
      logger.warning(logger.categories.SMART_MIRROR, `Failed to update flight ${flight.flightIata}: ${result.error}`);
      // Return cached data if available
      return getCachedFlightData(flightKey);
    }
  } catch (error) {
    logger.error(logger.categories.SMART_MIRROR, `Error updating flight ${flight.flightIata}: ${error.message}`);
    // Return cached data on error
    return getCachedFlightData(flightKey);
  }
}

/**
 * Update flights based on frequency requirement
 */
async function updateFlightsByFrequency(frequency) {
  try {
    // Get API key from config
    const config = smartMirror.loadConfig();
    const apiKey = config.flightApi?.apiKey;
    
    if (!apiKey) {
      logger.warning(logger.categories.SMART_MIRROR, 'AviationStack API key not configured');
      return;
    }
    
    // Get all tracked flights
    const flights = getTrackedFlights();
    
    // Filter flights that need this frequency of updates
    const flightsToUpdate = flights.filter(f => {
      if (frequency === 'hourly') {
        return f.updateFrequency === 'hourly';
      } else if (frequency === 'thriceDaily') {
        return f.updateFrequency === 'hourly' || f.updateFrequency === 'thriceDaily';
      } else {
        // Daily updates all flights
        return f.updateFrequency !== 'none';
      }
    });
    
    if (flightsToUpdate.length === 0) {
      logger.debug(logger.categories.SMART_MIRROR, `No flights need ${frequency} updates`);
      return;
    }
    
    logger.info(logger.categories.SMART_MIRROR, `Starting ${frequency} update for ${flightsToUpdate.length} flights`);
    
    // Update each flight
    for (const flight of flightsToUpdate) {
      await updateFlightData(flight, apiKey);
      // Small delay between requests to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.info(logger.categories.SMART_MIRROR, `Completed ${frequency} flight updates`);
  } catch (error) {
    logger.error(logger.categories.SMART_MIRROR, `Error in ${frequency} flight update: ${error.message}`);
  }
}

/**
 * Initialize flight data scheduler
 */
function initScheduler() {
  logger.info(logger.categories.SMART_MIRROR, 'Initializing flight data scheduler');
  
  // Stop any existing jobs
  stopScheduler();
  
  // Schedule daily update at 7am
  // Cron format: minute hour day month weekday
  scheduledJobs.daily7am = cron.schedule('0 7 * * *', async () => {
    logger.info(logger.categories.SMART_MIRROR, 'Running scheduled 7am flight update');
    await updateFlightsByFrequency('daily');
  }, {
    scheduled: true,
    timezone: "America/New_York" // Default timezone - updates are server time. Users should match server timezone.
  });
  
  // Schedule noon update at 12pm (for flights 3 days away)
  scheduledJobs.daily12pm = cron.schedule('0 12 * * *', async () => {
    logger.info(logger.categories.SMART_MIRROR, 'Running scheduled 12pm flight update');
    await updateFlightsByFrequency('thriceDaily');
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });
  
  // Schedule evening update at 5pm (for flights 3 days away)
  scheduledJobs.daily5pm = cron.schedule('0 17 * * *', async () => {
    logger.info(logger.categories.SMART_MIRROR, 'Running scheduled 5pm flight update');
    await updateFlightsByFrequency('thriceDaily');
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });
  
  // Schedule hourly update (for flights within 6 hours)
  scheduledJobs.hourly = cron.schedule('0 * * * *', async () => {
    logger.info(logger.categories.SMART_MIRROR, 'Running scheduled hourly flight update');
    await updateFlightsByFrequency('hourly');
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });
  
  logger.info(logger.categories.SMART_MIRROR, 'Flight data scheduler initialized successfully');
  logger.info(logger.categories.SMART_MIRROR, 'Schedule: Daily at 7am, 3x daily (7am/12pm/5pm) for flights 3 days away, hourly for flights within 6 hours');
}

/**
 * Stop flight data scheduler
 */
function stopScheduler() {
  logger.info(logger.categories.SMART_MIRROR, 'Stopping flight data scheduler');
  
  Object.keys(scheduledJobs).forEach(key => {
    if (scheduledJobs[key]) {
      scheduledJobs[key].stop();
      scheduledJobs[key] = null;
    }
  });
  
  logger.info(logger.categories.SMART_MIRROR, 'Flight data scheduler stopped');
}

/**
 * Manually trigger flight updates (for testing)
 */
async function manualUpdate() {
  logger.info(logger.categories.SMART_MIRROR, 'Manual flight update triggered');
  await updateFlightsByFrequency('daily');
}

/**
 * Get flight data for display (uses cache)
 */
function getFlightDataForDisplay(flightIata, flightDate) {
  const flightKey = `${flightIata}_${flightDate}`;
  return getCachedFlightData(flightKey);
}

module.exports = {
  initScheduler,
  stopScheduler,
  manualUpdate,
  getFlightDataForDisplay,
  getTrackedFlights,
  updateFlightData,
  getCachedFlightData
};
