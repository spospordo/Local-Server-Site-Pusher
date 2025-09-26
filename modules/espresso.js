const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const githubUpload = require('./github-upload');

let config = null;

// Initialize the espresso module with config
function init(serverConfig) {
  config = serverConfig;
  
  // Initialize GitHub upload module
  githubUpload.init(serverConfig);
  
  // Ensure espresso data file exists
  ensureEspressoDataFile();
}

// Ensure the espresso data file exists with default values
function ensureEspressoDataFile() {
  const espressoConfig = config.espresso || {};
  const dataFilePath = espressoConfig.dataFilePath || './config/espresso-data.json';
  
  try {
    // Check if data file exists
    if (!fs.existsSync(dataFilePath)) {
      // Create directory if it doesn't exist
      const dataDir = path.dirname(dataFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Create default espresso data
      const defaultData = {
        weight1: "15g",
        grind1: ".5", 
        tempIn1: "90",
        soak1: "yes",
        notes1: "None",
        time1: "32s",
        weightOut1: "40g",
        weight2: "15g",
        grind2: ".9",
        tempIn2: "88", 
        soak2: "Yes",
        notes2: "Mild, rich, balanced, citrus",
        time2: "25s",
        weightOut2: "40g",
        weight3: "14g",
        grind3: "2.75",
        tempIn3: "90",
        soak3: "Yes", 
        notes3: "Balanced, rich, bitter",
        time3: "32s",
        weightOut3: "40g",
        beanName1: "Sample Bean 1",
        roastDate1: "Jan 2025",
        beanName2: "Sample Bean 2", 
        roastDate2: "Jan 2025",
        beanName3: "Sample Bean 3",
        roastDate3: "Jan 2025"
      };
      
      fs.writeFileSync(dataFilePath, JSON.stringify(defaultData, null, 2));
      console.log(`📝 [Espresso] Created default data file: ${dataFilePath}`);
    }
  } catch (error) {
    console.error(`❌ [Espresso] Error ensuring data file: ${error.message}`);
  }
}

// Load espresso data from JSON file
function loadEspressoData() {
  const espressoConfig = config.espresso || {};
  const dataFilePath = espressoConfig.dataFilePath || './config/espresso-data.json';
  
  try {
    const data = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ [Espresso] Error loading data: ${error.message}`);
    return {};
  }
}

// Save espresso data to JSON file
function saveEspressoData(data) {
  const espressoConfig = config.espresso || {};
  const dataFilePath = espressoConfig.dataFilePath || './config/espresso-data.json';
  
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
    console.log(`💾 [Espresso] Data saved successfully`);
    return true;
  } catch (error) {
    console.error(`❌ [Espresso] Error saving data: ${error.message}`);
    return false;
  }
}

// Generate HTML from espresso data and template
async function generateHTML(espressoData) {
  const espressoConfig = config.espresso || {};
  let templatePath = espressoConfig.templatePath;
  const outputPath = espressoConfig.outputPath || './public/espresso/index.html';
  const imagePaths = espressoConfig.imagePaths || {};
  
  if (!templatePath) {
    throw new Error('Template path not configured for espresso HTML generation');
  }
  
  // Convert relative path to absolute if needed
  if (!path.isAbsolute(templatePath)) {
    templatePath = path.resolve(templatePath);
  }
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }
  
  try {
    // Read the template HTML file
    const htmlContent = fs.readFileSync(templatePath, 'utf8');
    
    // Create DOM from HTML
    const dom = new JSDOM(htmlContent, {
      contentType: 'text/html',
      includeNodeLocations: true,
    });
    
    // Remove all <script> tags for static output
    const scripts = dom.window.document.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // Update text values by matching element IDs with data keys
    Object.keys(espressoData).forEach(key => {
      const element = dom.window.document.getElementById(key);
      if (element) {
        element.textContent = espressoData[key];
      }
    });
    
    // Update images based on alt text
    const imageElements = dom.window.document.querySelectorAll('img');
    imageElements.forEach((imgElement) => {
      const altText = imgElement.alt?.toLowerCase() || '';
      const imageKey = altText.replace(/\s+/g, '').toLowerCase();
      if (imagePaths && imagePaths[imageKey]) {
        imgElement.src = imagePaths[imageKey];
      }
    });
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save the generated HTML
    const generatedHTML = dom.serialize();
    fs.writeFileSync(outputPath, generatedHTML);
    
    console.log(`✅ [Espresso] HTML generated successfully: ${outputPath}`);
    return { success: true, outputPath, generatedHTML };
    
  } catch (error) {
    console.error(`❌ [Espresso] Error generating HTML: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Update espresso data and trigger HTML generation
async function updateEspressoData(newData) {
  try {
    // Validate input data
    if (!newData || typeof newData !== 'object') {
      throw new Error('Invalid espresso data provided');
    }
    
    // Load existing data
    const currentData = loadEspressoData();
    
    // Merge new data with existing data
    const updatedData = { ...currentData, ...newData };
    
    // Save updated data
    const saveResult = saveEspressoData(updatedData);
    if (!saveResult) {
      throw new Error('Failed to save espresso data');
    }
    
    // Generate HTML from updated data
    const htmlResult = await generateHTML(updatedData);
    if (!htmlResult.success) {
      throw new Error(`HTML generation failed: ${htmlResult.error}`);
    }
    
    // Upload to GitHub Pages if enabled
    const espressoConfig = config.espresso || {};
    if (espressoConfig.githubPages?.enabled) {
      try {
        console.log(`🔄 [Espresso] Uploading to GitHub Pages...`);
        await githubUpload.uploadFiles([{
          localPath: htmlResult.outputPath,
          remotePath: espressoConfig.githubPages.remotePath || 'espresso/index.html'
        }], espressoConfig.githubPages.commitMessage || 'Automated espresso update');
        
        console.log(`✅ [Espresso] Successfully uploaded to GitHub Pages`);
      } catch (uploadError) {
        console.error(`❌ [Espresso] GitHub upload failed: ${uploadError.message}`);
      }
    }
    
    return {
      success: true,
      data: updatedData,
      htmlGenerated: true,
      outputPath: htmlResult.outputPath
    };
    
  } catch (error) {
    console.error(`❌ [Espresso] Update failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get current espresso data
function getEspressoData() {
  return loadEspressoData();
}

// Get espresso module status
function getStatus() {
  const espressoConfig = config.espresso || {};
  const dataFilePath = espressoConfig.dataFilePath || './config/espresso-data.json';
  const outputPath = espressoConfig.outputPath || './public/espresso/index.html';
  
  return {
    enabled: espressoConfig.enabled || false,
    dataFile: fs.existsSync(dataFilePath),
    templateFile: espressoConfig.templatePath && fs.existsSync(espressoConfig.templatePath),
    outputFile: fs.existsSync(outputPath),
    githubEnabled: espressoConfig.githubPages?.enabled || false,
    lastUpdated: fs.existsSync(dataFilePath) ? fs.statSync(dataFilePath).mtime : null
  };
}

module.exports = {
  init,
  loadEspressoData,
  saveEspressoData,
  generateHTML,
  updateEspressoData,
  getEspressoData,
  getStatus
};