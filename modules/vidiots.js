const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const cron = require('node-cron');

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
  
  // Start the cron job if enabled
  if (config.vidiots?.enabled) {
    startCronJob();
  }
}

function truncateText(text, maxLength = 180) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength).trim() + '…' : text;
}

// Generate HTML content from movies data
function generateHTML(movies) {
  const vidiots = config.vidiots || {};
  const posterBaseUrl = vidiots.posterBaseUrl || '/vidiots/posters/';
  
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
        ${m.posterUrl ? `<img src="${posterBaseUrl}${m.posterFile}" alt="${m.title} poster">` : ''}
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
    
    const vidiots = config.vidiots || {};
    
    if (vidiots.forceUpdate) {
      console.log('📄 [Vidiots] Force update enabled in configuration, updating file');
      return true;
    }
    
    // Check file age
    const stats = fs.statSync(filePath);
    const fileAgeHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    const maxAgeHours = vidiots.maxAgeHours || 24;
    
    if (fileAgeHours > maxAgeHours) {
      console.log(`📄 [Vidiots] File is ${fileAgeHours.toFixed(1)} hours old (max: ${maxAgeHours}), forcing update`);
      return true;
    }
    
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
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true });
      console.log(`📁 [Vidiots] Created poster directory: ${posterDir}`);
      return;
    }
    
    const files = fs.readdirSync(posterDir);
    const posterFiles = files.filter(file => file.match(/^vidiotsPoster\d+\.jpg$/));
    
    if (posterFiles.length > 0) {
      console.log(`🧹 [Vidiots] Cleaning up ${posterFiles.length} old poster image(s) from ${posterDir}...`);
      posterFiles.forEach(file => {
        const filePath = path.join(posterDir, file);
        fs.unlinkSync(filePath);
        console.log(`🗑️ [Vidiots] Removed: ${file}`);
      });
    } else {
      console.log(`🧹 [Vidiots] No old poster images to clean up in ${posterDir}`);
    }
  } catch (err) {
    console.error(`❌ [Vidiots] Error during cleanup: ${err.message}`);
  }
}

async function downloadAndResizeImage(imageUrl, localFile) {
  try {
    console.log(`⬇️ [Vidiots] Downloading: ${imageUrl}`);
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: HEADERS });
    if (!response.headers['content-type'] || !response.headers['content-type'].startsWith('image')) {
      throw new Error('Not an image content-type: ' + response.headers['content-type']);
    }
    
    // Ensure directory exists
    const dir = path.dirname(localFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    await sharp(response.data)
      .resize(100, 150, { fit: 'inside', withoutEnlargement: true })
      .toFile(localFile);
    console.log(`✅ [Vidiots] Image saved and resized: ${localFile}`);
    return true;
  } catch (err) {
    console.error(`❌ [Vidiots] Download/resize failed for ${imageUrl}: ${err.message}`);
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
          if (img) posterUrl = img;
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
        const outputDir = path.dirname(outputFile);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(outputFile, htmlContent.trim());
        console.log(`📝 [Vidiots] HTML updated: ${outputFile} (${movies.length} movies, ${htmlContent.length} characters)`);
        
        console.log('🎬 [Vidiots] Updated movies:');
        movies.forEach((movie, index) => {
          console.log(`   ${index + 1}. ${movie.title} - ${movie.schedule || 'No schedule'}`);
        });
        
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
    cronJob.destroy();
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
      scheduled: false
    });
    
    cronJob.start();
    console.log(`⏰ [Vidiots] Cron job started with schedule: ${schedule}`);
  }
}

function stopCronJob() {
  if (cronJob) {
    cronJob.destroy();
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
    cronSchedule: vidiots.cronSchedule || '0 6,12 * * *',
    outputFile,
    fileExists,
    lastModified: fileStats ? fileStats.mtime : null,
    fileSize: fileStats ? fileStats.size : 0,
    isRunning: cronJob !== null
  };
}

module.exports = {
  init,
  scrapeComingSoon,
  triggerScrape,
  startCronJob,
  stopCronJob,
  getStatus
};