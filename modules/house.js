const fs = require('fs');
const path = require('path');

let config = null;

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
    notes: vacationDate.notes || ""
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
  addDevice,
  updateDevice,
  deleteDevice,
  addConnection,
  updateConnection,
  deleteConnection
};
