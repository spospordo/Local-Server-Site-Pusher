const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { randomUUID } = require('crypto');
const Tesseract = require('tesseract.js');

let config = null;

function generateId() {
  return randomUUID();
}

// Initialize the house module with config
function init(serverConfig) {
  config = serverConfig;
  
  // Ensure house data file exists
  ensureHouseDataFile();
}

// Get default house data object
function getDefaultHouseData() {
  return {
    vacation: {
      dates: [],
      travelInfo: "",
      emergencyContact: {
        name: "",
        phone: "",
        email: "",
        relationship: ""
      },
      pets: []
    },
    documentation: {
      documents: [],
      diagrams: [],
      instructions: []
    },
    mediaCenter: {
      devices: [],
      connections: []
    },
    cars: {
      vehicles: []
    },
    bills: {
      bills: []
    },
    lists: {
      categories: [],
      lists: []
    }
  };
}

// Get the house data file path
function getHouseDataFilePath() {
  const houseConfig = config?.house || {};
  return houseConfig.dataFilePath || path.join(__dirname, '..', 'config', 'house-data.json');
}

// Create or recreate house data file with default values
function createDefaultHouseDataFile(force = false) {
  const dataFilePath = getHouseDataFilePath();
  
  try {
    // Check if data file exists and force is not set
    if (!force && fs.existsSync(dataFilePath)) {
      return; // File exists and we're not forcing recreation
    }
    
    // Create directory if it doesn't exist
    const dataDir = path.dirname(dataFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Create default house data
    const defaultData = getDefaultHouseData();
    
    fs.writeFileSync(dataFilePath, JSON.stringify(defaultData, null, 2));
    console.log(`📝 [House] Created default data file: ${dataFilePath}`);
  } catch (error) {
    console.error(`❌ [House] Error creating data file: ${error.message}`);
  }
}

// Ensure the house data file exists with default values
function ensureHouseDataFile() {
  createDefaultHouseDataFile(false);
}

// Load house data from file
function loadHouseData() {
  const dataFilePath = getHouseDataFilePath();
  
  try {
    if (fs.existsSync(dataFilePath)) {
      const data = fs.readFileSync(dataFilePath, 'utf8');
      return JSON.parse(data);
    } else {
      // Create default file if it doesn't exist
      createDefaultHouseDataFile(false);
      return getDefaultHouseData();
    }
  } catch (error) {
    console.error(`❌ [House] Error loading data file: ${error.message}`);
    return getDefaultHouseData();
  }
}

// Save house data to file
function saveHouseData(data) {
  const dataFilePath = getHouseDataFilePath();
  
  try {
    // Create directory if it doesn't exist
    const dataDir = path.dirname(dataFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
    console.log(`✅ [House] Data saved successfully: ${dataFilePath}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ [House] Error saving data file: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Get vacation data
function getVacationData() {
  const data = loadHouseData();
  return data.vacation || getDefaultHouseData().vacation;
}

// Save vacation data
function saveVacationData(vacationData) {
  const data = loadHouseData();
  data.vacation = vacationData;
  return saveHouseData(data);
}

// Get documentation data
function getDocumentationData() {
  const data = loadHouseData();
  return data.documentation || getDefaultHouseData().documentation;
}

// Save documentation data
function saveDocumentationData(documentationData) {
  const data = loadHouseData();
  data.documentation = documentationData;
  return saveHouseData(data);
}

// Add a vacation date
function addVacationDate(vacationDate) {
  const vacation = getVacationData();
  vacation.dates.push({
    id: Date.now().toString(),
    startDate: vacationDate.startDate,
    endDate: vacationDate.endDate,
    destination: vacationDate.destination || "",
    destinations: vacationDate.destinations || [],
    notes: vacationDate.notes || "",
    flights: vacationDate.flights || [],
    flightTrackingEnabled: vacationDate.flightTrackingEnabled || false,
    addToDashboardClock: vacationDate.addToDashboardClock || false,
    clockCity: vacationDate.clockCity || "",
    clockTimezone: vacationDate.clockTimezone || "",
    listIds: vacationDate.listIds || [],
    houseSitting: vacationDate.houseSitting || false,
    dogWatching: vacationDate.dogWatching || { enabled: false, location: "", locationDetails: "", petCareInfo: "" }
  });
  return saveVacationData(vacation);
}

// Update a vacation date
function updateVacationDate(id, vacationDate) {
  const vacation = getVacationData();
  const index = vacation.dates.findIndex(d => d.id === id);
  if (index !== -1) {
    vacation.dates[index] = { ...vacation.dates[index], ...vacationDate, id };
    return saveVacationData(vacation);
  }
  return { success: false, error: 'Vacation date not found' };
}

// Delete a vacation date
function deleteVacationDate(id) {
  const vacation = getVacationData();
  vacation.dates = vacation.dates.filter(d => d.id !== id);
  return saveVacationData(vacation);
}

// Add a pet
function addPet(pet) {
  const vacation = getVacationData();
  vacation.pets.push({
    id: Date.now().toString(),
    name: pet.name,
    type: pet.type || "",
    breed: pet.breed || "",
    age: pet.age || "",
    feedingSchedule: pet.feedingSchedule || "",
    medications: pet.medications || "",
    vetContact: pet.vetContact || "",
    specialInstructions: pet.specialInstructions || ""
  });
  return saveVacationData(vacation);
}

// Update a pet
function updatePet(id, pet) {
  const vacation = getVacationData();
  const index = vacation.pets.findIndex(p => p.id === id);
  if (index !== -1) {
    vacation.pets[index] = { ...vacation.pets[index], ...pet, id };
    return saveVacationData(vacation);
  }
  return { success: false, error: 'Pet not found' };
}

// Delete a pet
function deletePet(id) {
  const vacation = getVacationData();
  vacation.pets = vacation.pets.filter(p => p.id !== id);
  return saveVacationData(vacation);
}

// Add a document
function addDocument(document) {
  const documentation = getDocumentationData();
  documentation.documents.push({
    id: Date.now().toString(),
    title: document.title,
    description: document.description || "",
    type: document.type || "document",
    url: document.url || "",
    uploadDate: new Date().toISOString()
  });
  return saveDocumentationData(documentation);
}

// Update a document
function updateDocument(id, document) {
  const documentation = getDocumentationData();
  const index = documentation.documents.findIndex(d => d.id === id);
  if (index !== -1) {
    documentation.documents[index] = { ...documentation.documents[index], ...document, id };
    return saveDocumentationData(documentation);
  }
  return { success: false, error: 'Document not found' };
}

// Delete a document
function deleteDocument(id) {
  const documentation = getDocumentationData();
  documentation.documents = documentation.documents.filter(d => d.id !== id);
  return saveDocumentationData(documentation);
}

// Add an instruction
function addInstruction(instruction) {
  const documentation = getDocumentationData();
  documentation.instructions.push({
    id: Date.now().toString(),
    title: instruction.title,
    content: instruction.content || "",
    category: instruction.category || "",
    createdDate: new Date().toISOString()
  });
  return saveDocumentationData(documentation);
}

// Update an instruction
function updateInstruction(id, instruction) {
  const documentation = getDocumentationData();
  const index = documentation.instructions.findIndex(i => i.id === id);
  if (index !== -1) {
    documentation.instructions[index] = { ...documentation.instructions[index], ...instruction, id };
    return saveDocumentationData(documentation);
  }
  return { success: false, error: 'Instruction not found' };
}

// Delete an instruction
function deleteInstruction(id) {
  const documentation = getDocumentationData();
  documentation.instructions = documentation.instructions.filter(i => i.id !== id);
  return saveDocumentationData(documentation);
}

// Get media center data
function getMediaCenterData() {
  const data = loadHouseData();
  return data.mediaCenter || getDefaultHouseData().mediaCenter;
}

// Save media center data
function saveMediaCenterData(mediaCenterData) {
  const data = loadHouseData();
  data.mediaCenter = mediaCenterData;
  return saveHouseData(data);
}

function normalizeOptionalCarsValue(value) {
  if (value === undefined || value === null || value === '') {
    return "";
  }
  return String(value).trim();
}

function normalizeRequiredCarsValue(value, fieldName) {
  const normalized = normalizeOptionalCarsValue(value);
  if (!normalized) {
    return { error: `${fieldName} is required` };
  }
  return { value: normalized };
}

function normalizeOilChangeIntervalMiles(value) {
  if (value === undefined || value === null || value === '') {
    return { value: 5000 };
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { error: 'Oil change interval miles must be a positive number' };
  }

  return { value: Math.round(numeric) };
}

function normalizeOdometerReadingDate(value) {
  const date = normalizeRequiredCarsValue(value, 'Date');
  if (date.error) {
    return date;
  }

  const parsed = new Date(date.value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: 'Date must be a valid date' };
  }

  return { value: parsed.toISOString() };
}

function normalizeOdometerReadingMileage(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { error: 'Mileage must be a positive number' };
  }

  return { value: Math.round(numeric) };
}

function normalizeInsuranceDate(value, fieldName) {
  const normalized = normalizeRequiredCarsValue(value, fieldName);
  if (normalized.error) {
    return normalized;
  }

  const parsed = new Date(normalized.value);
  if (Number.isNaN(parsed.getTime())) {
    return { error: `${fieldName} must be a valid date` };
  }

  return { value: parsed.toISOString() };
}

function normalizeOptionalInsuranceNumber(value, fieldName, options = {}) {
  const { allowZero = true, round = null } = options;
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || (!allowZero && numeric <= 0) || (allowZero && numeric < 0)) {
    return { error: `${fieldName} must be a ${allowZero ? 'non-negative' : 'positive'} number` };
  }

  if (round === 'int') {
    return { value: Math.round(numeric) };
  }
  if (round === 'cents') {
    return { value: Math.round(numeric * 100) / 100 };
  }

  return { value: numeric };
}

function calculateInsuranceTermMonths(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + (end.getUTCMonth() - start.getUTCMonth());

  if (end.getUTCDate() < start.getUTCDate()) {
    months -= 1;
  }

  return Math.max(0, months);
}

// Get cars data
function getCarsData() {
  const data = loadHouseData();
  const cars = data.cars || getDefaultHouseData().cars;
  if (!Array.isArray(cars.vehicles)) {
    cars.vehicles = [];
    return cars;
  }

  cars.vehicles = cars.vehicles.map(vehicle => ({
    ...vehicle,
    maintenance: Array.isArray(vehicle.maintenance) ? vehicle.maintenance : [],
    odometerReadings: Array.isArray(vehicle.odometerReadings) ? vehicle.odometerReadings : [],
    insurance: Array.isArray(vehicle.insurance) ? vehicle.insurance : [],
    oilChangeIntervalMiles: Number(vehicle.oilChangeIntervalMiles) > 0
      ? Math.round(Number(vehicle.oilChangeIntervalMiles))
      : 5000
  }));

  return cars;
}

// Save cars data
function saveCarsData(carsData) {
  const data = loadHouseData();
  data.cars = carsData;
  return saveHouseData(data);
}

// Add a car
function addCar(car) {
  const make = normalizeRequiredCarsValue(car.make, 'Make');
  const model = normalizeRequiredCarsValue(car.model, 'Model');
  const year = normalizeRequiredCarsValue(car.year, 'Year');
  const interval = normalizeOilChangeIntervalMiles(car.oilChangeIntervalMiles);
  if (make.error || model.error || year.error || interval.error) {
    return { success: false, error: make.error || model.error || year.error || interval.error };
  }

  const cars = getCarsData();
  cars.vehicles.push({
    id: generateId(),
    make: make.value,
    model: model.value,
    year: year.value,
    odometer: normalizeOptionalCarsValue(car.odometer),
    maintenance: Array.isArray(car.maintenance) ? car.maintenance : [],
    odometerReadings: Array.isArray(car.odometerReadings) ? car.odometerReadings : [],
    insurance: Array.isArray(car.insurance) ? car.insurance : [],
    oilChangeIntervalMiles: interval.value
  });
  return saveCarsData(cars);
}

// Update a car
function updateCar(id, car) {
  const cars = getCarsData();
  const index = cars.vehicles.findIndex(vehicle => vehicle.id === id);
  if (index !== -1) {
    const updatedCar = { ...cars.vehicles[index], ...car, id };
    if ('make' in car) {
      const make = normalizeRequiredCarsValue(car.make, 'Make');
      if (make.error) {
        return { success: false, error: make.error };
      }
      updatedCar.make = make.value;
    }
    if ('model' in car) {
      const model = normalizeRequiredCarsValue(car.model, 'Model');
      if (model.error) {
        return { success: false, error: model.error };
      }
      updatedCar.model = model.value;
    }
    if ('year' in car) {
      const year = normalizeRequiredCarsValue(car.year, 'Year');
      if (year.error) {
        return { success: false, error: year.error };
      }
      updatedCar.year = year.value;
    }
    if ('odometer' in car) {
      updatedCar.odometer = normalizeOptionalCarsValue(car.odometer);
    }
    if ('oilChangeIntervalMiles' in car) {
      const interval = normalizeOilChangeIntervalMiles(car.oilChangeIntervalMiles);
      if (interval.error) {
        return { success: false, error: interval.error };
      }
      updatedCar.oilChangeIntervalMiles = interval.value;
    }
    cars.vehicles[index] = updatedCar;
    if (!Array.isArray(cars.vehicles[index].maintenance)) {
      cars.vehicles[index].maintenance = [];
    }
    if (!Array.isArray(cars.vehicles[index].odometerReadings)) {
      cars.vehicles[index].odometerReadings = [];
    }
    if (!Array.isArray(cars.vehicles[index].insurance)) {
      cars.vehicles[index].insurance = [];
    }
    if (!cars.vehicles[index].oilChangeIntervalMiles || Number(cars.vehicles[index].oilChangeIntervalMiles) <= 0) {
      cars.vehicles[index].oilChangeIntervalMiles = 5000;
    }
    return saveCarsData(cars);
  }
  return { success: false, error: 'Car not found' };
}

// Delete a car
function deleteCar(id) {
  const cars = getCarsData();
  cars.vehicles = cars.vehicles.filter(vehicle => vehicle.id !== id);
  return saveCarsData(cars);
}

// Add a maintenance record
function addMaintenanceRecord(carId, record) {
  const cars = getCarsData();
  const car = cars.vehicles.find(vehicle => vehicle.id === carId);
  if (!car) {
    return { success: false, error: 'Car not found' };
  }

  const date = normalizeRequiredCarsValue(record.date, 'Date');
  const description = normalizeRequiredCarsValue(record.description, 'Description');
  if (date.error || description.error) {
    return { success: false, error: date.error || description.error };
  }

  if (!Array.isArray(car.maintenance)) {
    car.maintenance = [];
  }

  car.maintenance.push({
    id: generateId(),
    date: date.value,
    description: description.value,
    mileage: normalizeOptionalCarsValue(record.mileage),
    notes: normalizeOptionalCarsValue(record.notes)
  });

  return saveCarsData(cars);
}

// Update a maintenance record
function updateMaintenanceRecord(carId, recordId, record) {
  const cars = getCarsData();
  const car = cars.vehicles.find(vehicle => vehicle.id === carId);
  if (!car) {
    return { success: false, error: 'Car not found' };
  }

  if (!Array.isArray(car.maintenance)) {
    car.maintenance = [];
  }

  const index = car.maintenance.findIndex(item => item.id === recordId);
  if (index !== -1) {
    const updatedRecord = { ...car.maintenance[index], ...record, id: recordId };
    if ('date' in record) {
      const date = normalizeRequiredCarsValue(record.date, 'Date');
      if (date.error) {
        return { success: false, error: date.error };
      }
      updatedRecord.date = date.value;
    }
    if ('description' in record) {
      const description = normalizeRequiredCarsValue(record.description, 'Description');
      if (description.error) {
        return { success: false, error: description.error };
      }
      updatedRecord.description = description.value;
    }
    if ('mileage' in record) {
      updatedRecord.mileage = normalizeOptionalCarsValue(record.mileage);
    }
    if ('notes' in record) {
      updatedRecord.notes = normalizeOptionalCarsValue(record.notes);
    }
    car.maintenance[index] = updatedRecord;
    return saveCarsData(cars);
  }

  return { success: false, error: 'Maintenance record not found' };
}

// Delete a maintenance record
function deleteMaintenanceRecord(carId, recordId) {
  const cars = getCarsData();
  const car = cars.vehicles.find(vehicle => vehicle.id === carId);
  if (!car) {
    return { success: false, error: 'Car not found' };
  }

  if (!Array.isArray(car.maintenance)) {
    car.maintenance = [];
  }

  car.maintenance = car.maintenance.filter(item => item.id !== recordId);
  return saveCarsData(cars);
}

// Add an odometer reading
function addOdometerReading(carId, reading) {
  const cars = getCarsData();
  const car = cars.vehicles.find(vehicle => vehicle.id === carId);
  if (!car) {
    return { success: false, error: 'Car not found' };
  }

  const date = normalizeOdometerReadingDate(reading.date);
  const mileage = normalizeOdometerReadingMileage(reading.mileage);
  if (date.error || mileage.error) {
    return { success: false, error: date.error || mileage.error };
  }

  if (!Array.isArray(car.odometerReadings)) {
    car.odometerReadings = [];
  }

  car.odometerReadings.push({
    id: generateId(),
    date: date.value,
    mileage: mileage.value,
    notes: normalizeOptionalCarsValue(reading.notes),
    recordedAt: new Date().toISOString()
  });

  return saveCarsData(cars);
}

// Update an odometer reading
function updateOdometerReading(carId, readingId, reading) {
  const cars = getCarsData();
  const car = cars.vehicles.find(vehicle => vehicle.id === carId);
  if (!car) {
    return { success: false, error: 'Car not found' };
  }

  if (!Array.isArray(car.odometerReadings)) {
    car.odometerReadings = [];
  }

  const index = car.odometerReadings.findIndex(item => item.id === readingId);
  if (index === -1) {
    return { success: false, error: 'Odometer reading not found' };
  }

  const updatedReading = { ...car.odometerReadings[index], id: readingId };
  if ('date' in reading) {
    const date = normalizeOdometerReadingDate(reading.date);
    if (date.error) {
      return { success: false, error: date.error };
    }
    updatedReading.date = date.value;
  }
  if ('mileage' in reading) {
    const mileage = normalizeOdometerReadingMileage(reading.mileage);
    if (mileage.error) {
      return { success: false, error: mileage.error };
    }
    updatedReading.mileage = mileage.value;
  }
  if ('notes' in reading) {
    updatedReading.notes = normalizeOptionalCarsValue(reading.notes);
  }
  if (!updatedReading.recordedAt) {
    updatedReading.recordedAt = new Date().toISOString();
  }

  car.odometerReadings[index] = updatedReading;
  return saveCarsData(cars);
}

// Delete an odometer reading
function deleteOdometerReading(carId, readingId) {
  const cars = getCarsData();
  const car = cars.vehicles.find(vehicle => vehicle.id === carId);
  if (!car) {
    return { success: false, error: 'Car not found' };
  }

  if (!Array.isArray(car.odometerReadings)) {
    car.odometerReadings = [];
  }

  car.odometerReadings = car.odometerReadings.filter(item => item.id !== readingId);
  return saveCarsData(cars);
}

// Add an insurance policy
function addInsurancePolicy(carId, policy) {
  const cars = getCarsData();
  const car = cars.vehicles.find(vehicle => vehicle.id === carId);
  if (!car) {
    return { success: false, error: 'Car not found' };
  }

  const provider = normalizeRequiredCarsValue(policy.provider, 'Provider');
  const startDate = normalizeInsuranceDate(policy.startDate, 'Start date');
  const endDate = normalizeInsuranceDate(policy.endDate, 'End date');
  const monthlyPremium = normalizeOptionalInsuranceNumber(policy.monthlyPremium, 'Monthly premium', { allowZero: true, round: 'cents' });
  const termMonths = normalizeOptionalInsuranceNumber(policy.termMonths, 'Term months', { allowZero: true, round: 'int' });
  const annualMileageAllowance = normalizeOptionalInsuranceNumber(policy.annualMileageAllowance, 'Annual mileage allowance', { allowZero: false, round: 'int' });

  if (provider.error || startDate.error || endDate.error || monthlyPremium.error || termMonths.error || annualMileageAllowance.error) {
    return {
      success: false,
      error: provider.error || startDate.error || endDate.error || monthlyPremium.error || termMonths.error || annualMileageAllowance.error
    };
  }

  if (new Date(endDate.value).getTime() < new Date(startDate.value).getTime()) {
    return { success: false, error: 'End date must be on or after start date' };
  }
  if (annualMileageAllowance.value === null) {
    return { success: false, error: 'Annual mileage allowance is required' };
  }

  if (!Array.isArray(car.insurance)) {
    car.insurance = [];
  }

  car.insurance.push({
    id: generateId(),
    provider: provider.value,
    policyNumber: normalizeOptionalCarsValue(policy.policyNumber),
    startDate: startDate.value,
    endDate: endDate.value,
    monthlyPremium: monthlyPremium.value,
    termMonths: termMonths.value ?? calculateInsuranceTermMonths(startDate.value, endDate.value),
    annualMileageAllowance: annualMileageAllowance.value,
    notes: normalizeOptionalCarsValue(policy.notes),
    createdAt: new Date().toISOString()
  });

  return saveCarsData(cars);
}

// Update an insurance policy
function updateInsurancePolicy(carId, policyId, policy) {
  const cars = getCarsData();
  const car = cars.vehicles.find(vehicle => vehicle.id === carId);
  if (!car) {
    return { success: false, error: 'Car not found' };
  }

  if (!Array.isArray(car.insurance)) {
    car.insurance = [];
  }

  const index = car.insurance.findIndex(item => item.id === policyId);
  if (index === -1) {
    return { success: false, error: 'Insurance policy not found' };
  }

  const updatedPolicy = { ...car.insurance[index], id: policyId };
  if ('provider' in policy) {
    const provider = normalizeRequiredCarsValue(policy.provider, 'Provider');
    if (provider.error) {
      return { success: false, error: provider.error };
    }
    updatedPolicy.provider = provider.value;
  }
  if ('policyNumber' in policy) {
    updatedPolicy.policyNumber = normalizeOptionalCarsValue(policy.policyNumber);
  }
  if ('startDate' in policy) {
    const startDate = normalizeInsuranceDate(policy.startDate, 'Start date');
    if (startDate.error) {
      return { success: false, error: startDate.error };
    }
    updatedPolicy.startDate = startDate.value;
  }
  if ('endDate' in policy) {
    const endDate = normalizeInsuranceDate(policy.endDate, 'End date');
    if (endDate.error) {
      return { success: false, error: endDate.error };
    }
    updatedPolicy.endDate = endDate.value;
  }
  if ('monthlyPremium' in policy) {
    const monthlyPremium = normalizeOptionalInsuranceNumber(policy.monthlyPremium, 'Monthly premium', { allowZero: true, round: 'cents' });
    if (monthlyPremium.error) {
      return { success: false, error: monthlyPremium.error };
    }
    updatedPolicy.monthlyPremium = monthlyPremium.value;
  }
  if ('termMonths' in policy) {
    const termMonths = normalizeOptionalInsuranceNumber(policy.termMonths, 'Term months', { allowZero: true, round: 'int' });
    if (termMonths.error) {
      return { success: false, error: termMonths.error };
    }
    updatedPolicy.termMonths = termMonths.value;
  }
  if ('annualMileageAllowance' in policy) {
    const annualMileageAllowance = normalizeOptionalInsuranceNumber(policy.annualMileageAllowance, 'Annual mileage allowance', { allowZero: false, round: 'int' });
    if (annualMileageAllowance.error) {
      return { success: false, error: annualMileageAllowance.error };
    }
    updatedPolicy.annualMileageAllowance = annualMileageAllowance.value;
  }
  if ('notes' in policy) {
    updatedPolicy.notes = normalizeOptionalCarsValue(policy.notes);
  }

  if (!updatedPolicy.provider) {
    return { success: false, error: 'Provider is required' };
  }
  if (!updatedPolicy.startDate) {
    return { success: false, error: 'Start date is required' };
  }
  if (!updatedPolicy.endDate) {
    return { success: false, error: 'End date is required' };
  }
  if (new Date(updatedPolicy.endDate).getTime() < new Date(updatedPolicy.startDate).getTime()) {
    return { success: false, error: 'End date must be on or after start date' };
  }
  const annualMileageValue = Number(updatedPolicy.annualMileageAllowance);
  if (!Number.isFinite(annualMileageValue) || annualMileageValue <= 0) {
    return { success: false, error: 'Annual mileage allowance is required' };
  }
  updatedPolicy.annualMileageAllowance = Math.round(annualMileageValue);

  const hasManualTermMonths = updatedPolicy.termMonths !== null
    && updatedPolicy.termMonths !== undefined
    && updatedPolicy.termMonths !== '';
  if (!hasManualTermMonths) {
    updatedPolicy.termMonths = calculateInsuranceTermMonths(updatedPolicy.startDate, updatedPolicy.endDate);
  } else {
    updatedPolicy.termMonths = Math.round(Number(updatedPolicy.termMonths));
  }
  if (!updatedPolicy.createdAt) {
    updatedPolicy.createdAt = new Date().toISOString();
  }

  car.insurance[index] = updatedPolicy;
  return saveCarsData(cars);
}

// Delete an insurance policy
function deleteInsurancePolicy(carId, policyId) {
  const cars = getCarsData();
  const car = cars.vehicles.find(vehicle => vehicle.id === carId);
  if (!car) {
    return { success: false, error: 'Car not found' };
  }

  if (!Array.isArray(car.insurance)) {
    car.insurance = [];
  }

  car.insurance = car.insurance.filter(item => item.id !== policyId);
  return saveCarsData(cars);
}

// Add a device
function addDevice(device) {
  const mediaCenter = getMediaCenterData();
  mediaCenter.devices.push({
    id: Date.now().toString(),
    name: device.name,
    type: device.type || "other",
    description: device.description || "",
    x: device.x || 100,
    y: device.y || 100,
    color: device.color || "#667eea",
    icon: device.icon || "",
    customIcon: device.customIcon || "",
    createdDate: new Date().toISOString()
  });
  return saveMediaCenterData(mediaCenter);
}

// Update a device
function updateDevice(id, device) {
  const mediaCenter = getMediaCenterData();
  const index = mediaCenter.devices.findIndex(d => d.id === id);
  if (index !== -1) {
    mediaCenter.devices[index] = { ...mediaCenter.devices[index], ...device, id };
    return saveMediaCenterData(mediaCenter);
  }
  return { success: false, error: 'Device not found' };
}

// Delete a device
function deleteDevice(id) {
  const mediaCenter = getMediaCenterData();
  // Remove device
  mediaCenter.devices = mediaCenter.devices.filter(d => d.id !== id);
  // Remove connections that reference this device
  mediaCenter.connections = mediaCenter.connections.filter(c => 
    c.sourceDeviceId !== id && c.targetDeviceId !== id
  );
  return saveMediaCenterData(mediaCenter);
}

// Add a connection
function addConnection(connection) {
  const mediaCenter = getMediaCenterData();
  mediaCenter.connections.push({
    id: Date.now().toString(),
    sourceDeviceId: connection.sourceDeviceId,
    targetDeviceId: connection.targetDeviceId,
    sourcePort: connection.sourcePort || "",
    targetPort: connection.targetPort || "",
    connectionType: connection.connectionType || "HDMI",
    description: connection.description || "",
    createdDate: new Date().toISOString()
  });
  return saveMediaCenterData(mediaCenter);
}

// Update a connection
function updateConnection(id, connection) {
  const mediaCenter = getMediaCenterData();
  const index = mediaCenter.connections.findIndex(c => c.id === id);
  if (index !== -1) {
    mediaCenter.connections[index] = { ...mediaCenter.connections[index], ...connection, id };
    return saveMediaCenterData(mediaCenter);
  }
  return { success: false, error: 'Connection not found' };
}

// Delete a connection
function deleteConnection(id) {
  const mediaCenter = getMediaCenterData();
  mediaCenter.connections = mediaCenter.connections.filter(c => c.id !== id);
  return saveMediaCenterData(mediaCenter);
}


// ── Bills ─────────────────────────────────────────────────────────────────────

function getDefaultBillExtraction() {
  return {
    rawTextPreview: '',
    statementDate: '',
    period: {
      startDate: '',
      endDate: ''
    },
    electric: {
      present: false,
      usageKwh: null,
      rateSchedule: '',
      totalCost: null,
      costBreakdown: [],
      nemCredits: [],
      rawLines: []
    },
    water: {
      present: false,
      usageHcf: null,
      totalCost: null,
      tierUsage: [],
      costBreakdown: [],
      rawLines: []
    },
    sanitation: {
      present: false,
      usageBasis: '',
      totalCost: null,
      costBreakdown: [],
      solidWaste: [],
      rawLines: []
    },
    extractionMeta: {
      method: 'native',
      ocrFallbackUsed: false,
      ocrFallbackAvailable: false,
      textQualityUsable: false,
      warnings: []
    }
  };
}

function normalizeBillDate(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return text;
  }

  const usMatch = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (usMatch) {
    const month = usMatch[1].padStart(2, '0');
    const day = usMatch[2].padStart(2, '0');
    const year = usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString().split('T')[0];
}

function normalizeBillFileMetadata(file) {
  if (!file) {
    return null;
  }
  return {
    filename: String(file.filename || '').trim(),
    originalName: String(file.originalName || file.originalname || '').trim(),
    size: Number(file.size) || 0,
    mimeType: String(file.mimeType || file.mimetype || '').trim()
  };
}

function normalizeBillRecord(bill) {
  const defaultExtraction = getDefaultBillExtraction();
  const extraction = {
    ...defaultExtraction,
    ...(bill.extractedData || {})
  };

  extraction.period = {
    ...defaultExtraction.period,
    ...(bill.extractedData?.period || {})
  };
  extraction.electric = {
    ...defaultExtraction.electric,
    ...(bill.extractedData?.electric || {})
  };
  extraction.water = {
    ...defaultExtraction.water,
    ...(bill.extractedData?.water || {})
  };
  extraction.sanitation = {
    ...defaultExtraction.sanitation,
    ...(bill.extractedData?.sanitation || {})
  };
  extraction.extractionMeta = {
    ...defaultExtraction.extractionMeta,
    ...(bill.extractedData?.extractionMeta || {})
  };
  extraction.extractionMeta.warnings = Array.isArray(extraction.extractionMeta.warnings) ? extraction.extractionMeta.warnings : [];

  extraction.electric.costBreakdown = Array.isArray(extraction.electric.costBreakdown) ? extraction.electric.costBreakdown : [];
  extraction.electric.nemCredits = Array.isArray(extraction.electric.nemCredits) ? extraction.electric.nemCredits : [];
  extraction.electric.rawLines = Array.isArray(extraction.electric.rawLines) ? extraction.electric.rawLines : [];
  extraction.water.tierUsage = Array.isArray(extraction.water.tierUsage) ? extraction.water.tierUsage : [];
  extraction.water.costBreakdown = Array.isArray(extraction.water.costBreakdown) ? extraction.water.costBreakdown : [];
  extraction.water.rawLines = Array.isArray(extraction.water.rawLines) ? extraction.water.rawLines : [];
  extraction.sanitation.costBreakdown = Array.isArray(extraction.sanitation.costBreakdown) ? extraction.sanitation.costBreakdown : [];
  extraction.sanitation.solidWaste = Array.isArray(extraction.sanitation.solidWaste) ? extraction.sanitation.solidWaste : [];
  extraction.sanitation.rawLines = Array.isArray(extraction.sanitation.rawLines) ? extraction.sanitation.rawLines : [];

  return {
    id: String(bill.id || generateId()),
    uploadedAt: bill.uploadedAt || new Date().toISOString(),
    billDate: normalizeBillDate(bill.billDate),
    periodStartDate: normalizeBillDate(bill.periodStartDate || extraction.period.startDate),
    periodEndDate: normalizeBillDate(bill.periodEndDate || extraction.period.endDate),
    notes: String(bill.notes || '').trim(),
    billFile: normalizeBillFileMetadata(bill.billFile),
    attachments: Array.isArray(bill.attachments) ? bill.attachments.map(normalizeBillFileMetadata).filter(Boolean) : [],
    extractedData: extraction
  };
}

function getBillSortValue(bill) {
  return bill.periodEndDate || bill.billDate || bill.periodStartDate || bill.uploadedAt || '';
}

function getBillsData() {
  const data = loadHouseData();
  const bills = data.bills || getDefaultHouseData().bills;
  if (!Array.isArray(bills.bills)) {
    bills.bills = [];
    return bills;
  }

  bills.bills = bills.bills
    .map(normalizeBillRecord)
    .sort((a, b) => String(getBillSortValue(b)).localeCompare(String(getBillSortValue(a))));
  return bills;
}

function saveBillsData(billsData) {
  const data = loadHouseData();
  data.bills = billsData;
  return saveHouseData(data);
}

function getBill(id) {
  const billsData = getBillsData();
  return billsData.bills.find(bill => bill.id === id) || null;
}

function addBill(bill) {
  const billsData = getBillsData();
  const normalized = normalizeBillRecord(bill);
  billsData.bills.push(normalized);
  const result = saveBillsData(billsData);
  return {
    ...result,
    bill: normalized
  };
}

function deleteBill(id) {
  const billsData = getBillsData();
  const existing = billsData.bills.length;
  billsData.bills = billsData.bills.filter(bill => bill.id !== id);
  if (billsData.bills.length === existing) {
    return { success: false, error: 'Bill not found' };
  }
  return saveBillsData(billsData);
}

async function parseUtilityBillFromFile(filePath) {
  const pdfBuffer = fs.readFileSync(filePath);
  const warnings = [];

  const nativeText = extractPdfTextFromBuffer(pdfBuffer);
  const nativeUsable = isExtractedTextUsable(nativeText);

  if (!nativeUsable) {
    warnings.push('Native PDF text extraction produced low-quality or unreadable content; OCR fallback attempted');
    console.log('⚠️ [House Bills] Native extraction low-quality, attempting OCR fallback for:', filePath);
  }

  let extractedText = nativeText;
  let ocrFallbackUsed = false;
  let ocrFallbackAvailable = false;

  if (!nativeUsable) {
    try {
      const ocrText = await runOcrOnPdfBuffer(pdfBuffer);
      ocrFallbackAvailable = true;
      if (ocrText && ocrText.trim().length > 0) {
        extractedText = ocrText;
        ocrFallbackUsed = true;
        console.log('✅ [House Bills] OCR fallback succeeded');
      } else {
        warnings.push('OCR fallback found no readable text in embedded images');
        console.log('⚠️ [House Bills] OCR fallback returned no text');
      }
    } catch (error) {
      warnings.push(`OCR fallback failed: ${error.message}`);
      console.error('❌ [House Bills] OCR fallback error:', error.message);
    }
  }

  const result = parseUtilityBillText(extractedText);
  result.extractionMeta = {
    method: ocrFallbackUsed ? 'ocr' : 'native',
    ocrFallbackUsed,
    ocrFallbackAvailable,
    textQualityUsable: isExtractedTextUsable(extractedText),
    warnings
  };
  return result;
}

// Returns true when a string has enough printable ASCII to be considered readable text
function isTextReadable(text) {
  if (!text || text.length < 4) {
    return false;
  }
  const printable = (text.match(/[\x20-\x7E\t\n\r]/g) || []).length;
  return (printable / text.length) > 0.6;
}

// Keywords used to judge whether extracted text looks like a utility bill
const BILL_QUALITY_KEYWORDS = [
  'electric', 'water', 'sewer', 'bill', 'charge', 'amount', 'due',
  'period', 'kwh', 'hcf', 'account', 'balance', 'payment', 'date'
];

// Returns true when the extracted text contains enough readable bill content
function isExtractedTextUsable(text) {
  if (!text || text.trim().length < 20) {
    return false;
  }
  const lower = text.toLowerCase();
  const keywordMatches = BILL_QUALITY_KEYWORDS.filter(kw => lower.includes(kw)).length;
  const printableRatio = (text.match(/[\x20-\x7E\n]/g) || []).length / text.length;
  // Require both a high printable character ratio AND at least one bill-relevant keyword
  return printableRatio > 0.75 && keywordMatches >= 1;
}

// Attempt OCR on JPEG/image streams embedded in a PDF buffer using tesseract.js
async function runOcrOnPdfBuffer(pdfBuffer) {
  const binary = pdfBuffer.toString('latin1');
  const ocrTexts = [];

  // Match PDF object streams that declare themselves as images
  const objRegex = /\d+\s+\d+\s+obj\s*<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  const imageStreams = [];

  while ((match = objRegex.exec(binary)) !== null) {
    const dict = match[1];
    const streamRaw = match[2];
    if (!/\/Subtype\s*\/Image/i.test(dict)) {
      continue;
    }
    const filterMatch = dict.match(/\/Filter\s*\/([\w]+)/);
    const filter = filterMatch ? filterMatch[1] : '';
    const rawStream = Buffer.from(streamRaw, 'latin1');
    if (filter === 'DCTDecode' || filter === 'JPXDecode') {
      // JPEG-compressed image stream — usable directly
      imageStreams.push(rawStream);
    } else if (filter === 'FlateDecode') {
      try {
        imageStreams.push(zlib.inflateSync(rawStream));
      } catch (_e) {
        // Ignore streams that fail to decompress
      }
    }
  }

  // Also try to detect bare JPEG signatures not in object wrappers
  if (imageStreams.length === 0) {
    let offset = 0;
    while (offset < pdfBuffer.length - 3) {
      if (pdfBuffer[offset] === 0xFF && pdfBuffer[offset + 1] === 0xD8 &&
          pdfBuffer[offset + 2] === 0xFF) {
        const end = pdfBuffer.indexOf(Buffer.from([0xFF, 0xD9]), offset + 2);
        if (end !== -1 && end - offset > 1000) {
          imageStreams.push(pdfBuffer.slice(offset, end + 2));
          offset = end + 2;
          continue;
        }
      }
      offset += 1;
    }
  }

  if (imageStreams.length === 0) {
    return '';
  }

  // Process up to 6 images per PDF: enough to cover all pages of a typical multi-page
  // utility bill while keeping OCR time and memory usage reasonable.
  for (const imgBuffer of imageStreams.slice(0, 6)) {
    try {
      console.log(`📖 [House Bills] Running OCR on embedded image (${imgBuffer.length} bytes)…`);
      let lastLoggedPct = -1;
      const { data: { text } } = await Tesseract.recognize(imgBuffer, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            // Throttle progress logs to 25% milestones to avoid excessive output
            const pct = Math.round(m.progress * 100);
            const milestone = Math.floor(pct / 25) * 25;
            if (milestone > lastLoggedPct) {
              lastLoggedPct = milestone;
              console.log(`📖 [House Bills] OCR progress: ${milestone}%`);
            }
          }
        }
      });
      if (text && text.trim()) {
        ocrTexts.push(text.trim());
      }
    } catch (error) {
      console.error('⚠️ [House Bills] OCR failed for image stream:', error.message);
    }
  }

  return ocrTexts.join('\n');
}

function extractPdfTextFromBuffer(buffer) {
  const segments = [];
  const binary = buffer.toString('latin1');

  // Extract the non-stream portions of the PDF (headers, object dictionaries, cross-reference
  // tables, etc.) which may contain readable literal strings and metadata.
  const nonStreamBinary = binary.replace(/stream\r?\n[\s\S]*?\r?\nendstream/g, '');
  segments.push(nonStreamBinary);

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRegex.exec(binary)) !== null) {
    const rawStream = Buffer.from(match[1], 'latin1');
    if (!rawStream.length) {
      continue;
    }

    // Attempt decompression; the raw (compressed) stream bytes produce garbage text so we
    // never include them directly as a candidate.
    const decompressedCandidates = [];
    try {
      decompressedCandidates.push(zlib.inflateSync(rawStream));
    } catch (_e) {
      // Not a zlib-deflated stream
    }
    try {
      decompressedCandidates.push(zlib.inflateRawSync(rawStream));
    } catch (_e) {
      // Not a raw-deflate stream
    }

    if (decompressedCandidates.length > 0) {
      // Use decompressed content when available
      decompressedCandidates.forEach(candidate => {
        const text = candidate.toString('latin1');
        if (text && isTextReadable(text)) {
          segments.push(text);
        }
      });
    } else {
      // Stream was stored without compression — only include if it reads as text
      const rawText = rawStream.toString('latin1');
      if (rawText && isTextReadable(rawText)) {
        segments.push(rawText);
      }
    }
  }

  const extracted = [];
  const seen = new Set();
  segments.forEach(segment => {
    extractPdfLiteralStrings(segment).forEach(item => {
      const normalized = normalizeExtractedTextLine(item);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        extracted.push(normalized);
      }
    });

    const printableMatches = segment.match(/[A-Za-z0-9][A-Za-z0-9\s,$.%#:&()\/[\]\-+]{6,}/g) || [];
    printableMatches.forEach(item => {
      const normalized = normalizeExtractedTextLine(item);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        extracted.push(normalized);
      }
    });
  });

  return extracted.join('\n');
}

function extractPdfLiteralStrings(segment) {
  const results = [];
  for (let index = 0; index < segment.length; index += 1) {
    if (segment[index] !== '(') {
      continue;
    }

    let depth = 1;
    let current = '';
    let escaped = false;
    for (let cursor = index + 1; cursor < segment.length; cursor += 1) {
      const character = segment[cursor];
      if (escaped) {
        current += `\\${character}`;
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '(') {
        depth += 1;
        current += character;
        continue;
      }
      if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          index = cursor;
          break;
        }
      }
      current += character;
    }

    if (current) {
      results.push(decodePdfString(current));
    }
  }

  const hexRegex = /<([0-9A-Fa-f\s]{6,})>/g;
  let hexMatch;
  while ((hexMatch = hexRegex.exec(segment)) !== null) {
    const hex = hexMatch[1].replace(/\s+/g, '');
    if (hex.length % 2 !== 0) {
      continue;
    }
    try {
      results.push(Buffer.from(hex, 'hex').toString('utf8'));
    } catch (error) {
      // Ignore invalid hex strings
    }
  }

  return results;
}

function decodePdfString(value) {
  return value
    .replace(/\\([\\()])/g, '$1')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function normalizeExtractedTextLine(line) {
  return String(line || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseUtilityBillText(text) {
  const extraction = getDefaultBillExtraction();
  const normalizedText = String(text || '').replace(/\r/g, '\n');
  const lines = Array.from(new Set(
    normalizedText
      .split('\n')
      .map(normalizeExtractedTextLine)
      .filter(line => line.length >= 3)
  ));

  extraction.rawTextPreview = lines.slice(0, 80).join('\n').slice(0, 4000);
  extraction.statementDate = extractStatementDate(normalizedText);
  extraction.period = extractBillingPeriod(normalizedText);
  extraction.electric = parseElectricCharges(lines, normalizedText);
  extraction.water = parseWaterCharges(lines, normalizedText);
  extraction.sanitation = parseSanitationCharges(lines);

  return extraction;
}

function extractStatementDate(text) {
  const patterns = [
    /(?:statement|bill)\s+date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
    /(?:date\s+of\s+bill|issue\s+date)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
    /(?:statement|bill)\s+date\s*[:\-]?\s*([A-Za-z]+\.?\s+\d{1,2},?\s*\d{4})/i,
    /(?:date\s+of\s+bill|issue\s+date)\s*[:\-]?\s*([A-Za-z]+\.?\s+\d{1,2},?\s*\d{4})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const normalized = normalizeBillDate(match[1]);
      if (normalized) {
        return normalized;
      }
    }
  }
  return '';
}

function extractBillingPeriod(text) {
  const patterns = [
    /(?:billing|service)\s+period(?:\s+(?:from|of))?\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:to|through|thru|\-)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
    /(?:services?\s+(?:from|for))\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:to|through|thru|\-)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return {
        startDate: normalizeBillDate(match[1]),
        endDate: normalizeBillDate(match[2])
      };
    }
  }

  return {
    startDate: '',
    endDate: ''
  };
}

function getRelevantLines(lines, keywords) {
  return lines.filter(line => keywords.some(keyword => keyword.test(line)));
}

function parseCurrencyAmount(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  const negative = text.includes('(') || /^-/.test(text);
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return null;
  }
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return negative ? -numeric : numeric;
}

function extractLineAmount(line) {
  const matches = String(line || '').match(/\(?-?\$?\d[\d,]*\.\d{2}\)?/g) || [];
  if (!matches.length) {
    return null;
  }
  return parseCurrencyAmount(matches[matches.length - 1]);
}

function makeBreakdownEntry(line) {
  const amount = extractLineAmount(line);
  if (amount === null) {
    return null;
  }

  const label = normalizeExtractedTextLine(
    String(line)
      .replace(/\(?-?\$?\d[\d,]*\.\d{2}\)?/g, ' ')
      .replace(/\s+/g, ' ')
  );

  if (!label) {
    return null;
  }

  return { label, amount };
}

function extractHighestUsage(text, regex) {
  let highest = null;
  let match;
  const source = new RegExp(regex.source, regex.flags);
  while ((match = source.exec(text)) !== null) {
    const numeric = Number(String(match[1] || '').replace(/,/g, ''));
    if (Number.isFinite(numeric) && (highest === null || numeric > highest)) {
      highest = numeric;
    }
  }
  return highest;
}

function parseElectricCharges(lines, text) {
  const relevantLines = getRelevantLines(lines, [
    /\belectric\b/i,
    /\bkwh\b/i,
    /\brate schedule\b/i,
    /\bdelivery\b/i,
    /\bgeneration\b/i,
    /\bnem\b/i,
    /\bsolar\b/i,
    /\benergy charge\b/i,
    /\bbaseline\b/i,
    /\boff\-peak\b/i,
    /\bon\-peak\b/i,
    /\bcustomer charge\b/i
  ]);

  const breakdown = relevantLines
    .map(makeBreakdownEntry)
    .filter(Boolean);

  const totalLine = relevantLines.find(line => /total.*electric|electric.*total|current electric charges|electric charges/i.test(line));
  const rateMatch = text.match(/rate schedule\s*[:\-]?\s*([A-Z0-9\- ]{2,})/i);
  const nemCredits = breakdown.filter(entry => /nem|solar|credit/i.test(entry.label));
  const usageKwh = extractHighestUsage(text, /(\d+(?:,\d{3})*(?:\.\d+)?)\s*kwh\b/gi);

  return {
    present: relevantLines.length > 0 || usageKwh !== null,
    usageKwh,
    rateSchedule: rateMatch ? normalizeExtractedTextLine(rateMatch[1]) : '',
    totalCost: totalLine ? extractLineAmount(totalLine) : (breakdown.length === 1 ? breakdown[0].amount : null),
    costBreakdown: breakdown.slice(0, 20),
    nemCredits: nemCredits.slice(0, 10),
    rawLines: relevantLines.slice(0, 25)
  };
}

function parseWaterCharges(lines, text) {
  const relevantLines = getRelevantLines(lines, [
    /\bwater\b/i,
    /\bhcf\b/i,
    /\btier\b/i,
    /\bpotable\b/i,
    /\bconsumption\b/i,
    /\busage\b/i
  ]);

  const breakdown = relevantLines
    .map(makeBreakdownEntry)
    .filter(Boolean);
  const totalLine = relevantLines.find(line => /total.*water|water.*total|current water charges|water charges/i.test(line));
  const tierUsage = relevantLines
    .filter(line => /tier/i.test(line) && (/hcf/i.test(line) || /\$/.test(line)))
    .map(line => {
      const tierMatch = line.match(/(tier\s*\d+)/i);
      const usageMatch = line.match(/(\d+(?:\.\d+)?)\s*hcf/i);
      return {
        tier: tierMatch ? normalizeExtractedTextLine(tierMatch[1]) : 'Tier',
        usageHcf: usageMatch ? Number(usageMatch[1]) : null,
        amount: extractLineAmount(line),
        label: line
      };
    });

  return {
    present: relevantLines.length > 0,
    usageHcf: extractHighestUsage(text, /(\d+(?:\.\d+)?)\s*hcf\b/gi),
    totalCost: totalLine ? extractLineAmount(totalLine) : (breakdown.length === 1 ? breakdown[0].amount : null),
    tierUsage: tierUsage.slice(0, 10),
    costBreakdown: breakdown.slice(0, 20),
    rawLines: relevantLines.slice(0, 25)
  };
}

function parseSanitationCharges(lines) {
  const relevantLines = getRelevantLines(lines, [
    /\bsewer\b/i,
    /\bsewage\b/i,
    /\bsanitation\b/i,
    /\bwastewater\b/i,
    /\bsolid waste\b/i,
    /\brefuse\b/i,
    /\btrash\b/i,
    /\brecycling\b/i,
    /\bstormwater\b/i
  ]);

  const breakdown = relevantLines
    .map(makeBreakdownEntry)
    .filter(Boolean);
  const totalLine = relevantLines.find(line => /total.*(?:sewer|sanitation|waste)|(?:sewer|sanitation|waste).*total|current sewer charges|current sanitation charges/i.test(line));
  const usageBasisLine = relevantLines.find(line => /usage|basis|hcf|gallon|dwelling|unit/i.test(line));
  const solidWaste = breakdown.filter(entry => /solid waste|refuse|trash|recycling/i.test(entry.label));

  return {
    present: relevantLines.length > 0,
    usageBasis: usageBasisLine || '',
    totalCost: totalLine ? extractLineAmount(totalLine) : (breakdown.length === 1 ? breakdown[0].amount : null),
    costBreakdown: breakdown.slice(0, 20),
    solidWaste: solidWaste.slice(0, 10),
    rawLines: relevantLines.slice(0, 25)
  };
}

// ── Lists ─────────────────────────────────────────────────────────────────────

// Get lists data
function getListsData() {
  const data = loadHouseData();
  return data.lists || getDefaultHouseData().lists;
}

// Save lists data
function saveListsData(listsData) {
  const data = loadHouseData();
  data.lists = listsData;
  return saveHouseData(data);
}

// Get all categories
function getCategories() {
  return getListsData().categories || [];
}

// Add a category (if it doesn't already exist)
function addCategory(name) {
  const listsData = getListsData();
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { success: false, error: 'Category name is required' };
  }
  if (listsData.categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, error: 'Category already exists' };
  }
  listsData.categories.push({ id: Date.now().toString(), name: trimmed });
  return saveListsData(listsData);
}

// Delete a category
function deleteCategory(id) {
  const listsData = getListsData();
  listsData.categories = listsData.categories.filter(c => c.id !== id);
  return saveListsData(listsData);
}

// Add a list
function addList(list) {
  const listsData = getListsData();
  listsData.lists.push({
    id: Date.now().toString(),
    name: list.name,
    description: list.description || '',
    category: list.category || '',
    items: [],
    createdDate: new Date().toISOString()
  });
  return saveListsData(listsData);
}

// Update a list
function updateList(id, list) {
  const listsData = getListsData();
  const index = listsData.lists.findIndex(l => l.id === id);
  if (index === -1) {
    return { success: false, error: 'List not found' };
  }
  listsData.lists[index] = { ...listsData.lists[index], ...list, id };
  return saveListsData(listsData);
}

// Delete a list
function deleteList(id) {
  const listsData = getListsData();
  listsData.lists = listsData.lists.filter(l => l.id !== id);
  return saveListsData(listsData);
}

// Add an item to a list
function addListItem(listId, item) {
  const listsData = getListsData();
  const list = listsData.lists.find(l => l.id === listId);
  if (!list) {
    return { success: false, error: 'List not found' };
  }
  list.items.push({
    id: Date.now().toString(),
    name: item.name,
    description: item.description || '',
    createdDate: new Date().toISOString()
  });
  return saveListsData(listsData);
}

// Update an item in a list
function updateListItem(listId, itemId, item) {
  const listsData = getListsData();
  const list = listsData.lists.find(l => l.id === listId);
  if (!list) {
    return { success: false, error: 'List not found' };
  }
  const index = list.items.findIndex(i => i.id === itemId);
  if (index === -1) {
    return { success: false, error: 'Item not found' };
  }
  list.items[index] = { ...list.items[index], ...item, id: itemId };
  return saveListsData(listsData);
}

// Delete an item from a list
function deleteListItem(listId, itemId) {
  const listsData = getListsData();
  const list = listsData.lists.find(l => l.id === listId);
  if (!list) {
    return { success: false, error: 'List not found' };
  }
  list.items = list.items.filter(i => i.id !== itemId);
  return saveListsData(listsData);
}

module.exports = {
  init,
  getVacationData,
  saveVacationData,
  getDocumentationData,
  saveDocumentationData,
  addVacationDate,
  updateVacationDate,
  deleteVacationDate,
  addPet,
  updatePet,
  deletePet,
  addDocument,
  updateDocument,
  deleteDocument,
  addInstruction,
  updateInstruction,
  deleteInstruction,
  getMediaCenterData,
  saveMediaCenterData,
  getCarsData,
  saveCarsData,
  getBillsData,
  saveBillsData,
  getBill,
  addBill,
  deleteBill,
  parseUtilityBillFromFile,
  addCar,
  updateCar,
  deleteCar,
  addMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord,
  addOdometerReading,
  updateOdometerReading,
  deleteOdometerReading,
  addInsurancePolicy,
  updateInsurancePolicy,
  deleteInsurancePolicy,
  addDevice,
  updateDevice,
  deleteDevice,
  addConnection,
  updateConnection,
  deleteConnection,
  getListsData,
  saveListsData,
  getCategories,
  addCategory,
  deleteCategory,
  addList,
  updateList,
  deleteList,
  addListItem,
  updateListItem,
  deleteListItem
};
