const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let config = null;

// Initialize with config
function init(serverConfig) {
  config = serverConfig;
}

// Function to check if there are changes to commit or if local is ahead of remote
function hasChanges(repoPath) {
  console.log(`🔍 [GitHub] Checking for changes in: ${repoPath}`);
  
  // First, check for uncommitted local changes
  const statusResult = execSync('git status --porcelain', {
    cwd: repoPath,
    encoding: 'utf8'
  });

  const hasLocalChanges = statusResult && statusResult.trim().length > 0;
  if (hasLocalChanges) {
    console.log('📋 [GitHub] Local working directory changes detected');
    return true;
  }

  // Check if local repository is ahead of remote (has commits that haven't been pushed)
  console.log('🔍 [GitHub] Checking if local repository is ahead of remote...');
  
  try {
    // Get current branch name
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath,
      encoding: 'utf8'
    }).trim();
    
    console.log(`📊 [GitHub] Current branch: ${currentBranch}`);
    
    // Check if we have any remotes configured
    const remotes = execSync('git remote', {
      cwd: repoPath,
      encoding: 'utf8'
    }).trim().split('\n').filter(r => r.trim());
    
    if (remotes.length > 0) {
      const defaultRemote = remotes[0]; // Use first remote (usually 'origin')
      console.log(`📊 [GitHub] Found remote: ${defaultRemote}`);
      
      // Check if remote branch exists and if we're ahead
      try {
        const aheadCount = parseInt(execSync(`git rev-list --count ${defaultRemote}/${currentBranch}..HEAD`, {
          cwd: repoPath,
          encoding: 'utf8'
        }).trim()) || 0;
        
        console.log(`📊 [GitHub] Local repository is ${aheadCount} commits ahead of ${defaultRemote}/${currentBranch}`);
        
        if (aheadCount > 0) {
          console.log('📋 [GitHub] Local repository has unpushed commits, push needed');
          return true;
        }
      } catch (err) {
        // Remote branch doesn't exist, so we definitely need to push
        console.log(`📊 [GitHub] Remote branch ${defaultRemote}/${currentBranch} doesn't exist, push needed`);
        return true;
      }
    } else {
      // No remotes configured
      console.log('📊 [GitHub] No remotes configured in repository');
      const commitCount = parseInt(execSync('git rev-list --count HEAD', {
        cwd: repoPath,
        encoding: 'utf8'
      }).trim()) || 0;
      
      if (commitCount > 0) {
        console.log('⚠️ [GitHub] Repository has commits but no remote configured');
        return false; // Can't push without a remote
      }
    }
  } catch (err) {
    console.warn(`⚠️ [GitHub] Error checking repository status: ${err.message}`);
  }

  console.log('📋 [GitHub] No changes detected');
  return false;
}

// Function to push changes to GitHub
async function pushToGitHub(repoPath, commitMessage = 'Automated vidiots update') {
  try {
    console.log(`🚀 [GitHub] Starting git upload process with message: "${commitMessage}"`);
    console.log(`📁 [GitHub] Repository path: ${repoPath}`);
    
    if (!hasChanges(repoPath)) {
      console.log('📋 [GitHub] No changes to commit or push.');
      return { success: true, message: 'No changes to push' };
    }

    console.log('📝 [GitHub] Changes detected, proceeding with git operations...');

    // Check if there are uncommitted changes that need to be added and committed
    const statusOutput = execSync('git status --porcelain', {
      cwd: repoPath,
      encoding: 'utf8'
    });

    const hasUncommittedChanges = statusOutput && statusOutput.trim().length > 0;

    if (hasUncommittedChanges) {
      // git add -A
      console.log('📤 [GitHub] Adding files to git...');
      execSync('git add -A', { cwd: repoPath });
      console.log('✅ [GitHub] Files added successfully');

      // git commit -m "message"
      console.log('💾 [GitHub] Committing changes...');
      const sanitizedMessage = commitMessage.replace(/["\\]/g, ''); // Remove quotes and backslashes
      const commitOutput = execSync('git commit -m "' + sanitizedMessage + '"', {
        cwd: repoPath,
        encoding: 'utf8'
      });
      console.log('✅ [GitHub] Commit successful:', commitOutput.trim());
    } else {
      console.log('📝 [GitHub] No uncommitted changes, proceeding directly to push...');
    }

    // git push
    console.log('⬆️ [GitHub] Pushing to GitHub...');
    const pushOutput = execSync('git push', {
      cwd: repoPath,
      encoding: 'utf8'
    });
    
    console.log('🎉 [GitHub] Successfully pushed changes to GitHub!');
    if (pushOutput && pushOutput.trim()) {
      console.log('📊 [GitHub] Push output:', pushOutput.trim());
    }
    
    return { success: true, message: 'Changes pushed successfully to GitHub' };
    
  } catch (error) {
    console.error('❌ [GitHub] Push failed:', error.message);
    
    // Check if this is a "fetch first" error (remote has newer commits)
    if (error.message.includes('fetch first') || error.message.includes('Updates were rejected')) {
      console.log('🔄 [GitHub] Detected remote changes, attempting to pull first...');
      
      try {
        const pullOutput = execSync('git pull', {
          cwd: repoPath,
          encoding: 'utf8'
        });
        console.log('✅ [GitHub] Pull successful:', pullOutput.trim());
        
        // Retry push after pull
        console.log('🔄 [GitHub] Retrying push after pull...');
        const retryPushOutput = execSync('git push', {
          cwd: repoPath,
          encoding: 'utf8'
        });
        
        console.log('🎉 [GitHub] Successfully pushed changes to GitHub after pull!');
        return { success: true, message: 'Changes pushed successfully after resolving conflicts' };
        
      } catch (pullError) {
        console.error('❌ [GitHub] Pull and retry failed:', pullError.message);
        return { success: false, error: `Failed to resolve conflicts: ${pullError.message}` };
      }
    }
    
    return { success: false, error: error.message };
  }
}

// Main function to handle vidiots GitHub upload
async function uploadVidiots() {
  try {
    if (!config?.vidiots?.githubPages?.enabled) {
      console.log('📋 [GitHub] GitHub Pages integration disabled for vidiots');
      return { success: false, error: 'GitHub Pages integration not enabled' };
    }
    
    const githubConfig = config.vidiots.githubPages;
    const repoPath = githubConfig.repoLocalPath;
    
    if (!repoPath) {
      console.error('❌ [GitHub] No repository path configured');
      return { success: false, error: 'No repository path configured' };
    }
    
    // Validate and sanitize the repository path
    const normalizedPath = path.resolve(repoPath);
    if (!normalizedPath.startsWith('/') || normalizedPath.includes('..')) {
      console.error('❌ [GitHub] Invalid repository path');
      return { success: false, error: 'Invalid repository path' };
    }
    
    // Check if the directory exists
    if (!fs.existsSync(normalizedPath)) {
      console.error(`❌ [GitHub] Repository path does not exist: ${normalizedPath}`);
      return { success: false, error: `Repository path does not exist: ${normalizedPath}` };
    }
    
    // Check if it's a git repository
    const gitDir = path.join(normalizedPath, '.git');
    if (!fs.existsSync(gitDir)) {
      console.error(`❌ [GitHub] Directory is not a git repository: ${normalizedPath}`);
      return { success: false, error: `Directory is not a git repository: ${normalizedPath}` };
    }
    
    const commitMessage = githubConfig.commitMessage || 'Automated vidiots update';
    
    console.log('🚀 [GitHub] Starting vidiots upload to GitHub Pages...');
    const result = await pushToGitHub(normalizedPath, commitMessage);
    
    if (result.success) {
      console.log('✅ [GitHub] Vidiots content uploaded to GitHub Pages successfully');
    } else {
      console.error('❌ [GitHub] Failed to upload vidiots content:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ [GitHub] Error in uploadVidiots:', error.message);
    return { success: false, error: error.message };
  }
}

// Test GitHub connection
async function testConnection() {
  try {
    if (!config?.vidiots?.githubPages?.enabled) {
      return { success: false, error: 'GitHub Pages integration not enabled' };
    }
    
    const githubConfig = config.vidiots.githubPages;
    const repoPath = githubConfig.repoLocalPath;
    
    if (!repoPath) {
      return { success: false, error: 'No repository path configured' };
    }
    
    // Validate and sanitize the repository path
    const normalizedPath = path.resolve(repoPath);
    if (!normalizedPath.startsWith('/') || normalizedPath.includes('..')) {
      return { success: false, error: 'Invalid repository path' };
    }
    
    if (!fs.existsSync(normalizedPath)) {
      return { success: false, error: `Repository path does not exist: ${normalizedPath}` };
    }
    
    const gitDir = path.join(normalizedPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return { success: false, error: `Directory is not a git repository: ${normalizedPath}` };
    }
    
    // Test git status
    const statusOutput = execSync('git status', {
      cwd: normalizedPath,
      encoding: 'utf8'
    });
    
    // Test remote connectivity
    const remoteOutput = execSync('git remote -v', {
      cwd: normalizedPath,
      encoding: 'utf8'
    });
    
    return { 
      success: true, 
      message: 'Git repository connection successful',
      status: statusOutput.trim(),
      remotes: remoteOutput.trim()
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Function to clone or pull GitHub repository
async function cloneOrPullRepository() {
  try {
    if (!config?.vidiots?.githubPages?.enabled) {
      return { success: false, error: 'GitHub Pages integration not enabled' };
    }
    
    const githubConfig = config.vidiots.githubPages;
    const { repoOwner, repoName, branch = 'main', repoLocalPath } = githubConfig;
    
    if (!repoOwner || !repoName || !repoLocalPath) {
      return { success: false, error: 'Repository configuration incomplete. Need owner, name, and local path.' };
    }
    
    // Validate and sanitize the repository path
    const normalizedPath = path.resolve(repoLocalPath);
    if (!normalizedPath.startsWith('/') || normalizedPath.includes('..')) {
      return { success: false, error: 'Invalid repository path' };
    }
    
    // Sanitize branch name to prevent command injection
    const safeBranch = branch.replace(/[^a-zA-Z0-9._/-]/g, '');
    
    const repoUrl = `https://github.com/${repoOwner}/${repoName}.git`;
    console.log(`🔗 [GitHub] Repository URL: ${repoUrl}`);
    console.log(`📁 [GitHub] Local path: ${normalizedPath}`);
    
    // Check if directory exists and has .git folder
    const gitDir = path.join(normalizedPath, '.git');
    
    if (fs.existsSync(gitDir)) {
      // Repository exists, pull latest changes
      console.log('📥 [GitHub] Repository exists, pulling latest changes...');
      
      try {
        // Fetch and pull latest changes
        execSync('git fetch origin', { cwd: normalizedPath });
        
        // Check current branch
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: normalizedPath,
          encoding: 'utf8'
        }).trim();
        
        if (currentBranch !== safeBranch) {
          console.log(`🌿 [GitHub] Switching from ${currentBranch} to ${safeBranch}`);
          execSync('git checkout ' + safeBranch, { cwd: normalizedPath });
        }
        
        const pullOutput = execSync('git pull origin ' + safeBranch, {
          cwd: normalizedPath,
          encoding: 'utf8'
        });
        
        console.log('✅ [GitHub] Repository updated successfully');
        return { 
          success: true, 
          action: 'pulled',
          message: 'Repository updated with latest changes',
          output: pullOutput.trim()
        };
        
      } catch (pullError) {
        console.error('❌ [GitHub] Pull failed:', pullError.message);
        return { success: false, error: `Failed to pull repository: ${pullError.message}` };
      }
      
    } else {
      // Repository doesn't exist, clone it
      console.log('📋 [GitHub] Repository not found locally, cloning...');
      
      try {
        // Ensure parent directory exists
        const parentDir = path.dirname(normalizedPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        
        // Remove the target directory if it exists but is not a git repo
        if (fs.existsSync(normalizedPath)) {
          console.log('🗑️ [GitHub] Removing existing non-git directory');
          try {
            fs.rmSync(normalizedPath, { recursive: true, force: true });
          } catch (rmError) {
            // Handle EBUSY or other filesystem errors more gracefully
            console.warn('⚠️ [GitHub] Warning: Could not remove existing directory:', rmError.message);
            return { success: false, error: `Cannot clean up directory ${normalizedPath}: ${rmError.message}. The directory may be in use. Please ensure no applications are accessing the directory and try again.` };
          }
        }
        
        const cloneOutput = execSync('git clone --branch ' + safeBranch + ' ' + repoUrl + ' ' + JSON.stringify(normalizedPath), {
          encoding: 'utf8'
        });
        
        console.log('✅ [GitHub] Repository cloned successfully');
        return { 
          success: true, 
          action: 'cloned',
          message: 'Repository cloned successfully',
          output: cloneOutput.trim()
        };
        
      } catch (cloneError) {
        console.error('❌ [GitHub] Clone failed:', cloneError.message);
        return { success: false, error: `Failed to clone repository: ${cloneError.message}` };
      }
    }
    
  } catch (error) {
    console.error('❌ [GitHub] Error in cloneOrPullRepository:', error.message);
    return { success: false, error: error.message };
  }
}

// Function to browse repository file structure
function browseRepository(relativePath = '') {
  try {
    if (!config?.vidiots?.githubPages?.enabled) {
      return { success: false, error: 'GitHub Pages integration not enabled' };
    }
    
    const githubConfig = config.vidiots.githubPages;
    const repoPath = githubConfig.repoLocalPath;
    
    if (!repoPath) {
      return { success: false, error: 'No repository path configured' };
    }
    
    // Validate and sanitize paths
    const normalizedRepoPath = path.resolve(repoPath);
    if (!normalizedRepoPath.startsWith('/') || normalizedRepoPath.includes('..')) {
      return { success: false, error: 'Invalid repository path' };
    }
    
    // Validate relative path to prevent directory traversal
    if (relativePath.includes('..') || relativePath.includes('\0')) {
      return { success: false, error: 'Invalid browse path' };
    }
    
    const browsePath = path.join(normalizedRepoPath, relativePath);
    
    // Ensure browse path is within repository bounds
    if (!browsePath.startsWith(normalizedRepoPath)) {
      return { success: false, error: 'Path outside repository bounds' };
    }
    
    if (!fs.existsSync(browsePath)) {
      return { success: false, error: 'Path does not exist' };
    }
    
    const stat = fs.statSync(browsePath);
    
    if (stat.isFile()) {
      // Return file info
      return {
        success: true,
        type: 'file',
        name: path.basename(browsePath),
        path: relativePath,
        size: stat.size,
        modified: stat.mtime,
        isDownloadable: true
      };
    } else if (stat.isDirectory()) {
      // Return directory contents
      const items = fs.readdirSync(browsePath).map(item => {
        const itemPath = path.join(browsePath, item);
        const itemStat = fs.statSync(itemPath);
        const itemRelativePath = path.join(relativePath, item);
        
        return {
          name: item,
          path: itemRelativePath,
          type: itemStat.isDirectory() ? 'directory' : 'file',
          size: itemStat.isFile() ? itemStat.size : null,
          modified: itemStat.mtime,
          isDownloadable: itemStat.isFile()
        };
      });
      
      // Sort directories first, then files
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      return {
        success: true,
        type: 'directory',
        path: relativePath,
        items: items
      };
    }
    
  } catch (error) {
    console.error('❌ [GitHub] Error browsing repository:', error.message);
    return { success: false, error: error.message };
  }
}

// Function to get file content for download
function getFileContent(relativePath) {
  try {
    if (!config?.vidiots?.githubPages?.enabled) {
      return { success: false, error: 'GitHub Pages integration not enabled' };
    }
    
    const githubConfig = config.vidiots.githubPages;
    const repoPath = githubConfig.repoLocalPath;
    
    if (!repoPath) {
      return { success: false, error: 'No repository path configured' };
    }
    
    // Validate and sanitize paths
    const normalizedRepoPath = path.resolve(repoPath);
    if (!normalizedRepoPath.startsWith('/') || normalizedRepoPath.includes('..')) {
      return { success: false, error: 'Invalid repository path' };
    }
    
    // Validate relative path
    if (relativePath.includes('..') || relativePath.includes('\0')) {
      return { success: false, error: 'Invalid file path' };
    }
    
    const filePath = path.join(normalizedRepoPath, relativePath);
    
    // Ensure file path is within repository bounds
    if (!filePath.startsWith(normalizedRepoPath)) {
      return { success: false, error: 'Path outside repository bounds' };
    }
    
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File does not exist' };
    }
    
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return { success: false, error: 'Path is not a file' };
    }
    
    // Read file content
    const content = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    
    return {
      success: true,
      filename: filename,
      content: content,
      size: stat.size,
      mimeType: getMimeType(filename)
    };
    
  } catch (error) {
    console.error('❌ [GitHub] Error reading file:', error.message);
    return { success: false, error: error.message };
  }
}

// Simple MIME type detection
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.xml': 'application/xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
  init,
  uploadVidiots,
  testConnection,
  pushToGitHub,
  cloneOrPullRepository,
  browseRepository,
  getFileContent
};