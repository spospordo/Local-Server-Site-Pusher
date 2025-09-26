const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { execSync } = require('child_process');
const githubUpload = require('./github-upload');

let config = null;

// Initialize the espresso module with config
function init(serverConfig) {
  config = serverConfig;
  
  // Initialize GitHub upload module
  githubUpload.init(serverConfig);
  
  // Ensure espresso data file exists
  ensureEspressoDataFile();
  
  // Ensure espresso templates directory exists
  ensureEspressoTemplatesDir();
}

// Ensure the espresso templates directory exists
function ensureEspressoTemplatesDir() {
  const templatesDir = path.join(__dirname, '..', 'uploads', 'espresso', 'templates');
  try {
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
      console.log(`📁 [Espresso] Created templates directory: ${templatesDir}`);
    }
  } catch (error) {
    console.error(`❌ [Espresso] Error creating templates directory: ${error.message}`);
  }
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

// Get template path - prioritize uploaded template over configured path
function getTemplatePath() {
  const espressoConfig = config.espresso || {};
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'espresso', 'templates');
  
  // First check for uploaded template (index.html in uploads directory)
  const uploadedTemplatePath = path.join(uploadsDir, 'index.html');
  if (fs.existsSync(uploadedTemplatePath)) {
    console.log(`📝 [Espresso] Using uploaded template: ${uploadedTemplatePath}`);
    return uploadedTemplatePath;
  }
  
  // Fall back to configured template path
  if (espressoConfig.templatePath && fs.existsSync(espressoConfig.templatePath)) {
    console.log(`📝 [Espresso] Using configured template: ${espressoConfig.templatePath}`);
    return espressoConfig.templatePath;
  }
  
  return null;
}

// Get image paths - prioritize uploaded images over configured paths
function getImagePaths(useGithubUrls = false) {
  const espressoConfig = config.espresso || {};
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'espresso', 'templates');
  const configuredImagePaths = espressoConfig.imagePaths || {};
  const imagePaths = { ...configuredImagePaths };
  
  // Check for uploaded images and override configured paths
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      const fileExt = path.extname(file).toLowerCase();
      
      // Check if it's an image file
      if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(fileExt)) {
        const basename = path.basename(file, fileExt).toLowerCase();
        
        let imagePath;
        if (useGithubUrls && espressoConfig.githubPages?.enabled) {
          // Generate absolute GitHub.io URL for the final deployment
          const githubConfig = espressoConfig.githubPages;
          const repoOwner = githubConfig.repoOwner;
          const repoName = githubConfig.repoName;
          const imageRemotePath = githubConfig.imageRemotePath || 'espresso/images';
          
          if (repoOwner && repoName) {
            imagePath = `https://${repoOwner}.github.io/${repoName}/${imageRemotePath}/${file}`;
          } else {
            // Fallback to relative path if GitHub config is incomplete
            imagePath = `/uploads/espresso/templates/${file}`;
          }
        } else {
          // Use relative path from public directory for local serving
          imagePath = `/uploads/espresso/templates/${file}`;
        }
        
        imagePaths[basename] = imagePath;
        console.log(`🖼️ [Espresso] Found uploaded image: ${basename} -> ${imagePath}`);
      }
    });
  }
  
  return imagePaths;
}

// Get list of uploaded image files for GitHub upload
function getUploadedImageFiles() {
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'espresso', 'templates');
  const imageFiles = [];
  
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    
    files.forEach(file => {
      const filePath = path.join(uploadsDir, file);
      const fileExt = path.extname(file).toLowerCase();
      
      // Check if it's an image file
      if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(fileExt)) {
        imageFiles.push({
          filename: file,
          localPath: filePath
        });
      }
    });
  }
  
  return imageFiles;
}

// Generate HTML from espresso data and template
async function generateHTML(espressoData, useGithubUrls = false) {
  const espressoConfig = config.espresso || {};
  const outputPath = espressoConfig.outputPath || './public/espresso/index.html';
  
  // Get template path (uploaded template takes priority over configured path)
  const templatePath = getTemplatePath();
  if (!templatePath) {
    throw new Error('No template found. Please upload a template file or configure a template path.');
  }
  
  // Get image paths (uploaded images take priority over configured paths)
  const imagePaths = getImagePaths(useGithubUrls);
  
  try {
    // Read the template HTML file
    let generatedHTML = fs.readFileSync(templatePath, 'utf8');
    
    // Use JSDOM only to identify elements and get their updated values
    const dom = new JSDOM(generatedHTML, {
      contentType: 'text/html',
      includeNodeLocations: true,
    });
    
    // Remove all <script> tags while preserving formatting
    generatedHTML = generatedHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi, '');
    
    // Update text values by matching element IDs with data keys
    Object.keys(espressoData).forEach(key => {
      // Find the element with this ID and replace its content
      const regex = new RegExp(`(<[^>]*id="${key}"[^>]*>)([^<]*?)(<\\/[^>]*>)`, 'gi');
      generatedHTML = generatedHTML.replace(regex, `$1${espressoData[key]}$3`);
    });
    
    // Update images based on alt text
    if (imagePaths && Object.keys(imagePaths).length > 0) {
      // Find all img tags and update their src attributes
      const imgRegex = /<img([^>]*?)src="([^"]*)"([^>]*?)alt="([^"]*)"([^>]*?)>/gi;
      generatedHTML = generatedHTML.replace(imgRegex, (match, before, currentSrc, middle, altText, after) => {
        const imageKey = altText.toLowerCase().replace(/\s+/g, '').toLowerCase();
        if (imagePaths[imageKey]) {
          return `<img${before}src="${imagePaths[imageKey]}"${middle}alt="${altText}"${after}>`;
        }
        return match;
      });
    }
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save the generated HTML
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
    
    let updatedData;
    
    // Check if this is a reset request
    if (newData.reset === true) {
      console.log(`🔄 [Espresso] Resetting data to defaults`);
      
      // Create default data (same as in ensureEspressoDataFile)
      updatedData = {
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
    } else {
      // Load existing data
      const currentData = loadEspressoData();
      
      // Merge new data with existing data
      updatedData = { ...currentData, ...newData };
    }
    
    // Save updated data
    const saveResult = saveEspressoData(updatedData);
    if (!saveResult) {
      throw new Error('Failed to save espresso data');
    }

    // Try to generate HTML from updated data (local version first) - only if enabled and template exists
    let htmlResult = null;
    let htmlGenerated = false;
    
    const espressoConfig = config.espresso || {};
    if (espressoConfig.enabled) {
      try {
        htmlResult = await generateHTML(updatedData, false);
        if (htmlResult.success) {
          htmlGenerated = true;
          console.log(`✅ [Espresso] HTML generation successful`);
        } else {
          console.log(`⚠️ [Espresso] HTML generation failed (but data saved): ${htmlResult.error}`);
        }
      } catch (htmlError) {
        console.log(`⚠️ [Espresso] HTML generation failed (but data saved): ${htmlError.message}`);
      }
    } else {
      console.log(`ℹ️ [Espresso] HTML generation skipped (module disabled)`);
    }
    
    // Upload to GitHub Pages if enabled and HTML was generated
    if (htmlGenerated && espressoConfig.githubPages?.enabled) {
      try {
        console.log(`🔄 [Espresso] Uploading to GitHub Pages...`);
        
        // Generate GitHub version of HTML with absolute URLs
        const githubHtmlResult = await generateHTML(updatedData, true);
        if (!githubHtmlResult.success) {
          throw new Error(`GitHub HTML generation failed: ${githubHtmlResult.error}`);
        }
        
        // Prepare files for upload
        const filesToUpload = [];
        
        // Add HTML file
        filesToUpload.push({
          localPath: githubHtmlResult.outputPath,
          remotePath: espressoConfig.githubPages.remotePath || 'espresso/index.html'
        });
        
        // Add image files
        const imageFiles = getUploadedImageFiles();
        const imageRemotePath = espressoConfig.githubPages.imageRemotePath || 'espresso/images';
        
        imageFiles.forEach(imageFile => {
          filesToUpload.push({
            localPath: imageFile.localPath,
            remotePath: `${imageRemotePath}/${imageFile.filename}`
          });
        });
        
        console.log(`📋 [Espresso] Uploading ${filesToUpload.length} files (1 HTML + ${imageFiles.length} images)`);
        
        // Upload files using the espresso-specific GitHub configuration
        await githubUpload.uploadFiles(
          filesToUpload, 
          espressoConfig.githubPages.commitMessage || 'Automated espresso update',
          espressoConfig.githubPages
        );
        
        console.log(`✅ [Espresso] Successfully uploaded to GitHub Pages`);
      } catch (uploadError) {
        console.error(`❌ [Espresso] GitHub upload failed: ${uploadError.message}`);
      }
    }
    
    return {
      success: true,
      data: updatedData,
      htmlGenerated: htmlGenerated,
      outputPath: htmlResult?.outputPath || null
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
  
  // Check for uploaded template
  const uploadedTemplatePath = path.join(__dirname, '..', 'uploads', 'espresso', 'templates', 'index.html');
  const hasUploadedTemplate = fs.existsSync(uploadedTemplatePath);
  
  // Check configured template
  const hasConfiguredTemplate = espressoConfig.templatePath && fs.existsSync(espressoConfig.templatePath);
  
  return {
    enabled: espressoConfig.enabled || false,
    dataFile: fs.existsSync(dataFilePath),
    templateFile: hasUploadedTemplate || hasConfiguredTemplate,
    uploadedTemplate: hasUploadedTemplate,
    configuredTemplate: hasConfiguredTemplate,
    outputFile: fs.existsSync(outputPath),
    githubEnabled: espressoConfig.githubPages?.enabled || false,
    lastUpdated: fs.existsSync(dataFilePath) ? fs.statSync(dataFilePath).mtime : null
  };
}

// List uploaded template files
function getUploadedTemplateFiles() {
  const templatesDir = path.join(__dirname, '..', 'uploads', 'espresso', 'templates');
  
  try {
    if (!fs.existsSync(templatesDir)) {
      return [];
    }
    
    const files = fs.readdirSync(templatesDir);
    return files.map(file => {
      const filePath = path.join(templatesDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        uploadDate: stats.mtime.toISOString(),
        type: path.extname(file).toLowerCase().includes(['png', 'jpg', 'jpeg', 'gif', 'svg']) ? 'image' : 'template'
      };
    });
  } catch (error) {
    console.error(`❌ [Espresso] Error listing template files: ${error.message}`);
    return [];
  }
}

// Get available images for configuration UI
function getAvailableImages() {
  const templatesDir = path.join(__dirname, '..', 'uploads', 'espresso', 'templates');
  const images = [];
  
  try {
    if (!fs.existsSync(templatesDir)) {
      return [];
    }
    
    const files = fs.readdirSync(templatesDir);
    files.forEach(file => {
      const filePath = path.join(templatesDir, file);
      const fileExt = path.extname(file).toLowerCase();
      
      // Check if it's an image file
      if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(fileExt)) {
        const stats = fs.statSync(filePath);
        const basename = path.basename(file, fileExt).toLowerCase();
        
        images.push({
          filename: file,
          basename: basename,
          size: stats.size,
          uploadDate: stats.mtime.toISOString(),
          localPath: `/uploads/espresso/templates/${file}`,
          absoluteUrl: '' // Will be filled by UI
        });
      }
    });
    
    return images;
  } catch (error) {
    console.error(`❌ [Espresso] Error getting available images: ${error.message}`);
    return [];
  }
}

// Get current template path for display
function getCurrentTemplatePath() {
  const templatePath = getTemplatePath();
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'espresso', 'templates');
  const uploadedTemplatePath = path.join(uploadsDir, 'index.html');
  
  return {
    currentPath: templatePath,
    isUploaded: templatePath === uploadedTemplatePath,
    uploadedExists: fs.existsSync(uploadedTemplatePath)
  };
}

// Delete uploaded template file
function deleteUploadedTemplateFile(filename) {
  const templatesDir = path.join(__dirname, '..', 'uploads', 'espresso', 'templates');
  const filePath = path.join(templatesDir, filename);
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ [Espresso] Deleted template file: ${filename}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ [Espresso] Error deleting template file: ${error.message}`);
    return false;
  }
}

// Clone or pull template repository
async function cloneTemplateRepository(repoConfig) {
  try {
    console.log('📋 [Espresso] Starting template repository clone/pull operation...');
    
    const { repoUrl, branch = 'main', localPath } = repoConfig;
    
    if (!repoUrl || !localPath) {
      throw new Error('Repository URL and local path are required');
    }
    
    // Validate and sanitize the repository path
    const normalizedPath = path.resolve(localPath);
    if (!normalizedPath.startsWith('/') || normalizedPath.includes('..')) {
      throw new Error('Invalid repository path');
    }
    
    // Sanitize branch name to prevent command injection
    const safeBranch = branch.replace(/[^a-zA-Z0-9._/-]/g, '');
    
    console.log(`🔗 [Espresso] Repository URL: ${repoUrl.replace(/:\/\/.*@/, '://****@')}`);
    console.log(`📁 [Espresso] Local path: ${normalizedPath}`);
    console.log(`🌿 [Espresso] Branch: ${safeBranch}`);
    
    // Check if directory exists and has .git folder
    const gitDir = path.join(normalizedPath, '.git');
    
    if (fs.existsSync(gitDir)) {
      // Repository exists, pull latest changes
      console.log('📥 [Espresso] Repository exists, pulling latest changes...');
      
      try {
        // Fetch and pull latest changes
        execSync('git fetch origin', { cwd: normalizedPath });
        
        // Check current branch
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: normalizedPath,
          encoding: 'utf8'
        }).trim();
        
        if (currentBranch !== safeBranch) {
          console.log(`🌿 [Espresso] Switching from ${currentBranch} to ${safeBranch}`);
          execSync('git checkout ' + safeBranch, { cwd: normalizedPath });
        }
        
        const pullOutput = execSync('git pull origin ' + safeBranch, {
          cwd: normalizedPath,
          encoding: 'utf8'
        });
        
        console.log('✅ [Espresso] Repository updated successfully');
        
        // Copy template files to uploads directory
        await copyTemplateFiles(normalizedPath);
        
        return { 
          success: true, 
          action: 'pulled',
          message: 'Repository updated with latest changes',
          output: pullOutput.trim()
        };
        
      } catch (pullError) {
        console.error('❌ [Espresso] Pull failed:', pullError.message);
        return { success: false, error: `Failed to pull repository: ${pullError.message}` };
      }
      
    } else {
      // Repository doesn't exist, clone it
      console.log('📋 [Espresso] Repository not found locally, cloning...');
      
      try {
        // Ensure parent directory exists
        const parentDir = path.dirname(normalizedPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        
        // Remove the target directory if it exists but is not a git repo
        if (fs.existsSync(normalizedPath)) {
          console.log('🗑️ [Espresso] Removing existing non-git directory');
          const cleanupResult = await robustDirectoryCleanup(normalizedPath);
          if (!cleanupResult.success) {
            return cleanupResult;
          }
        }
        
        const cloneOutput = execSync('git clone --branch ' + safeBranch + ' ' + repoUrl + ' ' + JSON.stringify(normalizedPath), {
          encoding: 'utf8'
        });
        
        console.log('✅ [Espresso] Repository cloned successfully');
        
        // Copy template files to uploads directory
        await copyTemplateFiles(normalizedPath);
        
        return { 
          success: true, 
          action: 'cloned',
          message: 'Repository cloned successfully',
          output: cloneOutput.trim()
        };
        
      } catch (cloneError) {
        console.error('❌ [Espresso] Clone failed:', cloneError.message);
        return { success: false, error: `Failed to clone repository: ${cloneError.message}` };
      }
    }
    
  } catch (error) {
    console.error('❌ [Espresso] Error in cloneTemplateRepository:', error.message);
    return { success: false, error: error.message };
  }
}

// Helper function for robust directory cleanup (borrowed from github-upload.js pattern)
async function robustDirectoryCleanup(dirPath) {
  try {
    // Use fs.rmSync with recursive option for Node.js 14.14.0+
    fs.rmSync(dirPath, { recursive: true, force: true });
    console.log(`🗑️ [Espresso] Directory cleanup completed: ${dirPath}`);
    return { success: true };
  } catch (error) {
    console.error(`❌ [Espresso] Directory cleanup failed: ${error.message}`);
    return { success: false, error: `Directory cleanup failed: ${error.message}` };
  }
}

// Copy template files from git repository to uploads directory
async function copyTemplateFiles(repoPath) {
  try {
    const templatesDir = path.join(__dirname, '..', 'uploads', 'espresso', 'templates');
    
    // Ensure uploads directory exists
    if (!fs.existsSync(templatesDir)) {
      fs.mkdirSync(templatesDir, { recursive: true });
    }
    
    // Clear existing uploaded files to avoid conflicts
    if (fs.existsSync(templatesDir)) {
      const existingFiles = fs.readdirSync(templatesDir);
      existingFiles.forEach(file => {
        const filePath = path.join(templatesDir, file);
        fs.unlinkSync(filePath);
      });
      console.log('🗑️ [Espresso] Cleared existing uploaded template files');
    }
    
    // Find and copy template files from repository
    const allowedExtensions = ['.html', '.htm', '.png', '.jpg', '.jpeg', '.gif', '.svg'];
    let filesCopied = 0;
    
    function copyFilesRecursively(srcDir, destDir = templatesDir) {
      const items = fs.readdirSync(srcDir);
      
      items.forEach(item => {
        // Skip .git directory and other hidden directories
        if (item.startsWith('.')) {
          return;
        }
        
        const srcPath = path.join(srcDir, item);
        const stat = fs.statSync(srcPath);
        
        if (stat.isDirectory()) {
          // Recursively search subdirectories
          copyFilesRecursively(srcPath, destDir);
        } else if (stat.isFile()) {
          const fileExt = path.extname(item).toLowerCase();
          if (allowedExtensions.includes(fileExt)) {
            const destPath = path.join(destDir, item);
            
            // Avoid overwriting files with the same name
            let finalDestPath = destPath;
            let counter = 1;
            while (fs.existsSync(finalDestPath)) {
              const name = path.basename(item, fileExt);
              finalDestPath = path.join(destDir, `${name}_${counter}${fileExt}`);
              counter++;
            }
            
            fs.copyFileSync(srcPath, finalDestPath);
            filesCopied++;
            console.log(`📄 [Espresso] Copied template file: ${item} -> ${path.basename(finalDestPath)}`);
          }
        }
      });
    }
    
    copyFilesRecursively(repoPath);
    
    console.log(`✅ [Espresso] Copied ${filesCopied} template files from repository`);
    return { success: true, filesCopied };
    
  } catch (error) {
    console.error('❌ [Espresso] Error copying template files:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  init,
  loadEspressoData,
  saveEspressoData,
  generateHTML,
  updateEspressoData,
  getEspressoData,
  getStatus,
  getUploadedTemplateFiles,
  getUploadedImageFiles,
  deleteUploadedTemplateFile,
  getAvailableImages,
  getCurrentTemplatePath,
  cloneTemplateRepository
};