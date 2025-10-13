const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const cron = require('node-cron');
const githubUpload = require('./github-upload');

const BASE_URL = 'https://vidiotsfoundation.org';
const url = `${BASE_URL}/coming-soon/`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36',
  'Referer': BASE_URL
};

let config = null;
let cronJob = null;

// Initialize the vidiots module with config
function init(serverConfig) {
  config = serverConfig;
  
  // Initialize GitHub upload module
  githubUpload.init(serverConfig);
  
  // Start the cron job if enabled
  if (config.vidiots?.enabled) {
    startCronJob();
  }
}

function truncateText(text, maxLength = 180) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength).trim() + '…' : text;
}

// Helper function to resolve URLs against the base URL
function resolveUrl(url, baseUrl = BASE_URL) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  
  // Already an absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // Absolute path - prepend base URL
  if (url.startsWith('/')) {
    return baseUrl + url;
  }
  
  // Relative path - resolve against base URL
  return baseUrl + '/' + url;
}

// Helper function to normalize poster base URL
function normalizePosterBaseUrl(posterBaseUrl) {
  if (!posterBaseUrl) {
    return '/vidiots/posters/';
  }
  
  // If it already starts with http:// or https://, use as-is
  if (posterBaseUrl.startsWith('http://') || posterBaseUrl.startsWith('https://')) {
    return posterBaseUrl.endsWith('/') ? posterBaseUrl : posterBaseUrl + '/';
  }
  
  // If it looks like a domain (contains dot but doesn't start with /), add protocol
  if (posterBaseUrl.includes('.') && !posterBaseUrl.startsWith('/')) {
    const normalizedUrl = posterBaseUrl.startsWith('//') ? posterBaseUrl : '//' + posterBaseUrl;
    const finalUrl = 'http:' + normalizedUrl;
    return finalUrl.endsWith('/') ? finalUrl : finalUrl + '/';
  }
  
  // Otherwise treat as relative path
  return posterBaseUrl.endsWith('/') ? posterBaseUrl : posterBaseUrl + '/';
}

// Generate HTML content from movies data
function generateHTML(movies, useGithubUrls = false) {
  const vidiots = config.vidiots || {};
  // Normalize the configured poster base URL to handle GitHub Pages URLs properly
  const posterBaseUrl = normalizePosterBaseUrl(vidiots.posterBaseUrl);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Coming Soon — Vidiots</title>
<style>
  html, body {
    width: 800px;
    height: 480px;
    max-width: 800px;
    max-height: 480px;
    min-width: 800px;
    min-height: 480px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #fff;
    color: #000;
    font-family: sans-serif;
  }
  body { padding: 10px; box-sizing: border-box; }
  h1 { text-align: center; font-size: 1.4em; margin: 0 0 8px; }
  .movie { display: flex; flex-direction: row; align-items: flex-start; margin-bottom: 8px; }
  .poster { flex: 0 0 50px; margin-right: 8px; }
  .poster img { height: 75px; object-fit: contain; border: 1px solid #aaa; filter: grayscale(100%); }
  .info { flex: 1; overflow: hidden; }
  .title { font-weight: bold; font-size: 1.05em; margin-bottom: 2px; }
  .minidetails {
    font-size: 0.8em;
    color: #555;
    font-weight: normal;
    margin-left: 0.5em;
    white-space: nowrap;
  }
  .schedule { font-style: italic; font-size: 0.9em; margin-bottom: 3px; }
  .description { font-size: 0.85em; line-height: 1.2em; }
  .pills { font-size: 0.85em; margin-bottom: 2px; color: #fff; background: #444; border-radius: 8px; padding: 2px 8px; display: inline-block; }
</style>
</head>
<body>
  <h1>Coming Soon at Vidiots</h1>
  ${movies.map(m => `
    <div class="movie">
      <div class="poster">
        ${m.posterFilePath && fs.existsSync(m.posterFilePath) ? `<img src="${posterBaseUrl}${m.posterFile}" alt="${m.title} poster">` : ''}
      </div>
      <div class="info">
        <div class="title">${m.title}${m.minidetails || ''}</div>
        <div class="schedule">${m.schedule}</div>
        ${m.pills && m.pills.length > 0 ? `<div class="pills">${m.pills.join(', ')}</div>` : ''}
        <div class="description">${m.description}</div>
      </div>
    </div>`).join('')}
</body>
</html>`;
}

// Generate error HTML when scraping fails
function generateErrorHTML(errorMessage) {
  const timestamp = new Date().toISOString();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Coming Soon — Vidiots (Error)</title>
<style>
  html, body {
    width: 800px;
    height: 480px;
    max-width: 800px;
    max-height: 480px;
    min-width: 800px;
    min-height: 480px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #fff;
    color: #000;
    font-family: sans-serif;
  }
  body { padding: 20px; box-sizing: border-box; text-align: center; }
  h1 { color: #d32f2f; font-size: 1.4em; margin: 0 0 20px; }
  .error-message { background: #ffebee; border: 1px solid #ffcdd2; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
  .timestamp { font-size: 0.9em; color: #666; }
</style>
</head>
<body>
  <h1>Coming Soon at Vidiots</h1>
  <div class="error-message">
    <p><strong>Unable to load movie listings</strong></p>
    <p>Error: ${errorMessage}</p>
  </div>
  <div class="timestamp">Last attempted: ${timestamp}</div>
</body>
</html>`;
}

// Check if file content should be updated
async function shouldUpdateFile(filePath, newContent) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log('📄 [Vidiots] No existing file found, will create new one');
      return true;
    }
    
    // Check if the path is actually a file before trying to read it
    const stats = fs.statSync(filePath);
    
    if (!stats.isFile()) {
      console.log('📄 [Vidiots] Path exists but is not a file (may be directory), will create new one');
      return true;
    }
    
    const vidiots = config.vidiots || {};
    
    if (vidiots.forceUpdate) {
      console.log('📄 [Vidiots] Force update enabled in configuration, updating file');
      return true;
    }
    
    // Check file age
    const fileAgeHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    const maxAgeHours = vidiots.maxAgeHours || 24;
    
    if (fileAgeHours > maxAgeHours) {
      console.log(`📄 [Vidiots] File is ${fileAgeHours.toFixed(1)} hours old (max: ${maxAgeHours}), forcing update`);
      return true;
    }
    
    // Now safe to read the file since we've confirmed it's a file
    const existingContent = fs.readFileSync(filePath, 'utf8');
    
    // Basic content comparison
    console.log(`🔍 [Vidiots] Comparing content: existing ${existingContent.length} chars vs new ${newContent.length} chars, age ${fileAgeHours.toFixed(1)}h`);
    
    const normalizeContent = (content) => {
      return content.trim().replace(/\r\n/g, '\n').replace(/\s+/g, ' ').replace(/\s*\n\s*/g, '\n');
    };
    
    const existingNormalized = normalizeContent(existingContent);
    const newNormalized = normalizeContent(newContent);
    
    if (existingNormalized === newNormalized) {
      console.log('📄 [Vidiots] Content identical, no update needed');
      return false;
    }
    
    console.log('📄 [Vidiots] Content differs, updating file');
    return true;
    
  } catch (error) {
    console.warn(`⚠️ [Vidiots] Error comparing file content: ${error.message}, proceeding with update`);
    return true;
  }
}

function cleanupOldPosterImages() {
  try {
    const vidiots = config.vidiots || {};
    const posterDir = vidiots.posterDirectory || './public/vidiots/posters';
    
    // Validate and normalize the poster directory path
    const normalizedPath = path.resolve(posterDir);
    if (normalizedPath.includes('..')) {
      console.error('❌ [Vidiots] Invalid poster directory path');
      return;
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(normalizedPath)) {
      fs.mkdirSync(normalizedPath, { recursive: true });
      console.log(`📁 [Vidiots] Created poster directory: ${normalizedPath}`);
      return;
    }
    
    const files = fs.readdirSync(normalizedPath);
    const posterFiles = files.filter(file => file.match(/^vidiotsPoster\d+\.jpg$/));
    
    if (posterFiles.length > 0) {
      console.log(`🧹 [Vidiots] Cleaning up ${posterFiles.length} old poster image(s) from ${normalizedPath}...`);
      posterFiles.forEach(file => {
        const filePath = path.join(normalizedPath, file);
        fs.unlinkSync(filePath);
        console.log(`🗑️ [Vidiots] Removed: ${file}`);
      });
    } else {
      console.log(`🧹 [Vidiots] No old poster images to clean up in ${normalizedPath}`);
    }
  } catch (err) {
    console.error(`❌ [Vidiots] Error during cleanup: ${err.message}`);
  }
}

async function downloadAndResizeImage(imageUrl, localFile) {
  try {
    // Validate the URL
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new Error('Invalid image URL provided');
    }
    
    // Log the full URL being downloaded
    console.log(`⬇️ [Vidiots] Downloading: ${imageUrl}`);
    console.log(`📁 [Vidiots] Saving to: ${localFile}`);
    
    const response = await axios.get(imageUrl, { 
      responseType: 'arraybuffer', 
      headers: HEADERS,
      timeout: 30000, // 30 second timeout
      validateStatus: function (status) {
        return status >= 200 && status < 300; // Accept only 2xx status codes
      }
    });
    
    // Check response content type
    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image')) {
      throw new Error(`Not an image content-type: ${contentType}. URL: ${imageUrl}`);
    }
    
    // Ensure directory exists
    const dir = path.dirname(localFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 [Vidiots] Created directory: ${dir}`);
    }
    
    // Process and save image
    await sharp(response.data)
      .resize(100, 150, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 }) // Ensure output is JPEG
      .toFile(localFile);
    
    console.log(`✅ [Vidiots] Image saved and resized: ${localFile}`);
    return true;
  } catch (err) {
    console.error(`❌ [Vidiots] Download/resize failed for ${imageUrl}`);
    console.error(`❌ [Vidiots] Error details: ${err.message}`);
    if (err.response) {
      console.error(`❌ [Vidiots] HTTP Status: ${err.response.status}`);
      console.error(`❌ [Vidiots] Response headers:`, err.response.headers);
    }
    return false;
  }
}

async function scrapeComingSoon() {
  let retryCount = 0;
  const maxRetries = 3;
  
  if (!config || !config.vidiots) {
    throw new Error('Vidiots configuration not found');
  }
  
  const vidiots = config.vidiots;
  const outputFile = vidiots.outputFile || './public/vidiots/index.html';
  
  while (retryCount < maxRetries) {
    try {
      if (retryCount === 0) {
        cleanupOldPosterImages();
      }
      
      console.log(`🌐 [Vidiots] Fetching: ${url} (attempt ${retryCount + 1}/${maxRetries})`);
      const { data: html } = await axios.get(url, { 
        headers: HEADERS,
        timeout: 30000
      });
      
      if (!html || html.trim().length === 0) {
        throw new Error('Received empty HTML response');
      }
      
      const $ = cheerio.load(html);
      const movies = [];
      
      console.log(`📊 [Vidiots] Parsing HTML content (${html.length} characters)`);
      
      const showElements = $('div.showtimes-description');
      console.log(`🎬 [Vidiots] Found ${showElements.length} show elements on page`);
      
      if (showElements.length === 0) {
        throw new Error('No movie show elements found - website structure may have changed');
      }

      $('div.showtimes-description').slice(0, 6).each((i, el) => {
        const title = $(el).find('h2.show-title a.title').text().trim();
        
        if (!title) {
          console.log(`⚠️ [Vidiots] Skipping element ${i + 1}: no title found`);
          return;
        }
        
        console.log(`🎭 [Vidiots] Processing movie ${i + 1}: "${title}"`);

        // Find poster image
        let posterUrl = '';
        let parentShowDetails = $(el).closest('.show-details');
        if (parentShowDetails.length) {
          const img = parentShowDetails.find('.show-poster-inner img').attr('src');
          if (img) {
            // Resolve relative URLs against the base URL
            posterUrl = resolveUrl(img);
          }
        }
        if (posterUrl) {
          console.log(`🖼 [Vidiots] Poster URL for "${title}": ${posterUrl}`);
        } else {
          console.log(`⚠️ [Vidiots] No poster found for "${title}"`);
        }
        const posterFile = `vidiotsPoster${i + 1}.jpg`;
        const posterDir = vidiots.posterDirectory || './public/vidiots/posters';
        const posterFilePath = path.join(posterDir, posterFile);

        // Extract dates and times
        const uniqueDates = new Set();
        parentShowDetails.find('ul.datelist li.show-date span').each((j, span) => {
          const dateTxt = $(span).text().replace(/\s+/g, ' ').replace(' ,', ',').trim();
          if (dateTxt) uniqueDates.add(dateTxt);
        });
        parentShowDetails.find('.selected-date.show-datelist.single-date span').each((j, span) => {
          const dateTxt = $(span).text().replace(/\s+/g, ' ').replace(' ,', ',').trim();
          if (dateTxt) uniqueDates.add(dateTxt);
        });

        const uniqueTimes = new Set();
        parentShowDetails.find('a.showtime').each((j, a) => {
          const timeTxt = $(a).text().trim();
          if (timeTxt) uniqueTimes.add(timeTxt);
        });

        let schedule = '';
        if (uniqueDates.size && uniqueTimes.size) {
          schedule = Array.from(uniqueDates).join(', ') + ' — ' + Array.from(uniqueTimes).join(', ');
        } else if (uniqueDates.size) {
          schedule = Array.from(uniqueDates).join(', ');
        } else if (uniqueTimes.size) {
          schedule = Array.from(uniqueTimes).join(', ');
        }

        // Extract movie details
        let director = '', format = '', runtime = '', year = '';
        let showSpecs = parentShowDetails.find('.show-description .show-specs');
        if (!showSpecs.length) {
          showSpecs = $(el).find('.show-specs');
        }
        showSpecs.find('span').each((_, span) => {
          const labelSpan = $(span).find('.show-spec-label');
          if (labelSpan.length) {
            const label = labelSpan.text().trim().replace(':', '').toLowerCase();
            const cloned = $(span).clone();
            cloned.find('.show-spec-label').remove();
            const value = cloned.text().replace(/^[\s:]+/, '').trim();
            if (/director/.test(label)) director = value;
            if (/format/.test(label)) format = value;
            if (/run\s*time/.test(label)) runtime = value;
            if (/release\s*year/.test(label)) year = value;
          }
        });
        const detailsArr = [director, format, runtime, year].filter(Boolean);
        let minidetails = '';
        if (detailsArr.length) minidetails = `<span class="minidetails">${detailsArr.join(' &middot; ')}</span>`;

        // Description
        let description = $(el).find('div.show-content p').first().text().trim();
        description = truncateText(description, 180);

        // Pills
        const pillsSet = new Set();
        $(el).find('.pill-container .pill').each((_, pill) => {
          const pillText = $(pill).text().trim();
          if (pillText) pillsSet.add(pillText);
        });
        const pills = Array.from(pillsSet);
        
        console.log(`📄 [Vidiots] Movie details - Schedule: "${schedule}", Description: ${description.length} chars, Pills: ${pills.length}`);

        if (title) {
          movies.push({
            title,
            minidetails,
            schedule,
            description,
            posterUrl,
            posterFile,
            posterFilePath,
            pills
          });
        }
      });
      
      console.log(`🎬 [Vidiots] Successfully parsed ${movies.length} movies`);
      
      if (movies.length === 0) {
        throw new Error('No movies were successfully parsed from the page');
      }

      // Download posters
      let successCount = 0;
      let failureCount = 0;
      
      for (const m of movies) {
        if (m.posterUrl) {
          console.log(`⬇️ [Vidiots] Downloading poster for "${m.title}" -> ${m.posterUrl}`);
          const success = await downloadAndResizeImage(m.posterUrl, m.posterFilePath);
          if (success) {
            successCount++;
          } else {
            failureCount++;
          }
        } else {
          console.log(`⚠️ [Vidiots] No poster URL for "${m.title}"`);
          failureCount++;
        }
      }
      
      console.log(`📊 [Vidiots] Download summary: ${successCount} successful, ${failureCount} failed`);

      // Build HTML content
      const htmlContent = generateHTML(movies);
      
      // Check if we should update the file
      const shouldUpdate = await shouldUpdateFile(outputFile, htmlContent);
      
      if (shouldUpdate) {
        // Ensure output directory exists
        const normalizedOutputFile = path.resolve(outputFile);
        if (normalizedOutputFile.includes('..')) {
          throw new Error('Invalid output file path');
        }
        
        const outputDir = path.dirname(normalizedOutputFile);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(normalizedOutputFile, htmlContent.trim());
        console.log(`📝 [Vidiots] HTML updated: ${normalizedOutputFile} (${movies.length} movies, ${htmlContent.length} characters)`);
        
        console.log('🎬 [Vidiots] Updated movies:');
        movies.forEach((movie, index) => {
          console.log(`   ${index + 1}. ${movie.title} - ${movie.schedule || 'No schedule'}`);
        });
        
        // Trigger GitHub upload if enabled and content was updated
        const githubConfig = config.vidiots?.githubPages;
        if (githubConfig?.enabled) {
          console.log('📤 [Vidiots] Content updated, triggering GitHub Pages upload...');
          try {
            // Generate GitHub-specific HTML with absolute URLs
            const githubHtmlContent = generateHTML(movies, true);
            
            // Write GitHub version to repository
            if (githubConfig.repoLocalPath) {
              const githubOutputPath = path.join(githubConfig.repoLocalPath, 'vidiots', 'index.html');
              const githubOutputDir = path.dirname(githubOutputPath);
              
              // Ensure GitHub output directory exists
              if (!fs.existsSync(githubOutputDir)) {
                fs.mkdirSync(githubOutputDir, { recursive: true });
                console.log(`📁 [Vidiots] Created GitHub output directory: ${githubOutputDir}`);
              }
              
              fs.writeFileSync(githubOutputPath, githubHtmlContent.trim());
              console.log(`📝 [Vidiots] GitHub HTML written: ${githubOutputPath}`);
              
              // Copy poster images to GitHub repository
              const githubPosterDir = path.join(githubConfig.repoLocalPath, 'vidiots');
              if (!fs.existsSync(githubPosterDir)) {
                fs.mkdirSync(githubPosterDir, { recursive: true });
              }
              
              const localPosterDir = vidiots.posterDirectory || './public/vidiots/posters';
              if (fs.existsSync(localPosterDir)) {
                const posterFiles = fs.readdirSync(localPosterDir).filter(file => file.match(/^vidiotsPoster\d+\.jpg$/));
                let copiedCount = 0;
                
                for (const posterFile of posterFiles) {
                  const sourcePath = path.join(localPosterDir, posterFile);
                  const destPath = path.join(githubPosterDir, posterFile);
                  
                  try {
                    fs.copyFileSync(sourcePath, destPath);
                    copiedCount++;
                  } catch (copyError) {
                    console.warn(`⚠️ [Vidiots] Failed to copy poster ${posterFile}: ${copyError.message}`);
                  }
                }
                
                console.log(`📸 [Vidiots] Copied ${copiedCount} poster images to GitHub repository`);
              }
            }
            
            const uploadResult = await githubUpload.uploadVidiots();
            if (uploadResult.success) {
              console.log('✅ [Vidiots] Successfully uploaded to GitHub Pages');
            } else {
              console.error('❌ [Vidiots] Failed to upload to GitHub Pages:', uploadResult.error);
            }
          } catch (error) {
            console.error('❌ [Vidiots] Error uploading to GitHub Pages:', error.message);
          }
        }
        
        return { success: true, updated: true, movies, outputFile };
      } else {
        console.log(`📝 [Vidiots] No changes detected, keeping existing file: ${outputFile}`);
        return { success: true, updated: false, movies, outputFile };
      }
      
    } catch (err) {
      console.error(`❌ [Vidiots] Scraping attempt ${retryCount + 1} failed:`, err.message);
      
      if (retryCount < maxRetries - 1) {
        const delayMs = (retryCount + 1) * 5000;
        console.log(`⏳ [Vidiots] Retrying in ${delayMs/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        retryCount++;
        continue;
      } else {
        console.error('❌ [Vidiots] All retry attempts exhausted.');
        
        const outputFile = config.vidiots.outputFile || './public/vidiots/index.html';
        if (fs.existsSync(outputFile)) {
          console.log(`📂 [Vidiots] Existing file preserved: ${outputFile}`);
          return { success: false, error: err.message, preserved: true };
        } else {
          const errorHTML = generateErrorHTML(err.message);
          const outputDir = path.dirname(outputFile);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          fs.writeFileSync(outputFile, errorHTML);
          console.log(`📝 [Vidiots] Error file created: ${outputFile}`);
          return { success: false, error: err.message, preserved: false };
        }
      }
    }
  }
}

// Manual trigger function
async function triggerScrape() {
  try {
    console.log('🚀 [Vidiots] Manual scrape triggered');
    const result = await scrapeComingSoon();
    return result;
  } catch (error) {
    console.error('❌ [Vidiots] Error in manual trigger:', error.message);
    return { success: false, error: error.message };
  }
}

// Start/stop cron job
function startCronJob() {
  if (cronJob) {
    cronJob.stop();
  }
  
  const vidiots = config.vidiots || {};
  const schedule = vidiots.cronSchedule || '0 6,12 * * *'; // Default: 6 AM and 12 PM
  
  if (vidiots.enabled) {
    cronJob = cron.schedule(schedule, () => {
      console.log('⏰ [Vidiots] Running scheduled scrape...');
      scrapeComingSoon().catch(err => {
        console.error('❌ [Vidiots] Scheduled scrape failed:', err.message);
      });
    }, {
      scheduled: true
    });
    
    console.log(`⏰ [Vidiots] Cron job started with schedule: ${schedule}`);
  }
}

function stopCronJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('⏹️ [Vidiots] Cron job stopped');
  }
}

// Get status
function getStatus() {
  const vidiots = config?.vidiots || {};
  const outputFile = vidiots.outputFile || './public/vidiots/index.html';
  
  let fileStats = null;
  let fileExists = false;
  if (fs.existsSync(outputFile)) {
    fileStats = fs.statSync(outputFile);
    fileExists = true;
  }
  
  return {
    enabled: vidiots.enabled || false,
    schedule: vidiots.schedule || null, // Include the user-friendly schedule
    cronSchedule: vidiots.cronSchedule || '0 6,12 * * *',
    outputFile,
    fileExists,
    lastModified: fileStats ? fileStats.mtime : null,
    fileSize: fileStats ? fileStats.size : 0,
    isRunning: cronJob !== null,
    githubPages: {
      enabled: vidiots.githubPages?.enabled || false,
      repoOwner: vidiots.githubPages?.repoOwner || '',
      repoName: vidiots.githubPages?.repoName || '',
      repoLocalPath: vidiots.githubPages?.repoLocalPath || ''
    }
  };
}

module.exports = {
  init,
  scrapeComingSoon,
  triggerScrape,
  startCronJob,
  stopCronJob,
  getStatus,
  githubUpload
};