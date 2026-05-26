const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

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
