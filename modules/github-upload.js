const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let config = null;
let gitConfigPath = null;

// Initialize with config
function init(serverConfig) {
  config = serverConfig;
  
  // Set up persistent git config path
  const configDir = path.dirname(path.dirname(__filename));
  gitConfigPath = path.join(configDir, 'config', '.gitconfig');
  
  // Load persistent git configuration
  loadGitConfig();
}

// Load persistent git configuration
function loadGitConfig() {
  try {
    if (gitConfigPath && fs.existsSync(gitConfigPath)) {
      const gitConfig = JSON.parse(fs.readFileSync(gitConfigPath, 'utf8'));
      
      // Set global git config for the application
      if (gitConfig.user && gitConfig.user.name && gitConfig.user.email) {
        console.log('📧 [GitHub] Loading persistent git identity configuration');
        setGitIdentity(gitConfig.user.name, gitConfig.user.email);
      }
    } else {
      // Set default git identity if none exists
      console.log('📧 [GitHub] No persistent git identity found, setting default');
      setGitIdentity('Local-Server-Site-Pusher', 'noreply@local-server.container');
      saveGitConfig('Local-Server-Site-Pusher', 'noreply@local-server.container');
    }
  } catch (error) {
    console.warn('⚠️ [GitHub] Error loading git config:', error.message);
    // Fallback to default identity
    setGitIdentity('Local-Server-Site-Pusher', 'noreply@local-server.container');
  }
}

// Save git configuration persistently
function saveGitConfig(userName, userEmail) {
  try {
    if (!gitConfigPath) return;
    
    const configDir = path.dirname(gitConfigPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    const gitConfig = {
      user: {
        name: userName,
        email: userEmail
      },
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(gitConfigPath, JSON.stringify(gitConfig, null, 2));
    console.log('📧 [GitHub] Git configuration saved persistently');
  } catch (error) {
    console.warn('⚠️ [GitHub] Could not save git config:', error.message);
  }
}

// Set git identity for current session and persist it
function setGitIdentity(userName, userEmail) {
  try {
    // Sanitize inputs to prevent command injection
    const sanitizedUserName = userName.replace(/["`\\$]/g, '').trim();
    const sanitizedUserEmail = userEmail.replace(/["`\\$]/g, '').trim();
    
    // Validate input lengths to prevent issues
    if (sanitizedUserName.length === 0 || sanitizedUserEmail.length === 0) {
      return { success: false, error: 'Invalid user name or email after sanitization' };
    }
    
    if (sanitizedUserName.length > 100 || sanitizedUserEmail.length > 100) {
      return { success: false, error: 'User name or email is too long' };
    }
    
    // Set git identity globally for the container using spawnSync for security
    const { spawnSync } = require('child_process');
    
    // Set user name
    const nameResult = spawnSync('git', ['config', '--global', 'user.name', sanitizedUserName], {
      encoding: 'utf8'
    });
    
    if (nameResult.status !== 0) {
      throw new Error(`Failed to set git user name: ${nameResult.stderr || 'Unknown error'}`);
    }
    
    // Set user email  
    const emailResult = spawnSync('git', ['config', '--global', 'user.email', sanitizedUserEmail], {
      encoding: 'utf8'
    });
    
    if (emailResult.status !== 0) {
      throw new Error(`Failed to set git user email: ${emailResult.stderr || 'Unknown error'}`);
    }
    
    console.log(`✅ [GitHub] Git identity configured: ${sanitizedUserName} <${sanitizedUserEmail}>`);
    
    // Save configuration persistently (using original values for storage)
    saveGitConfig(userName, userEmail);
    
    return { success: true };
  } catch (error) {
    console.error('❌ [GitHub] Failed to set git identity:', error.message);
    return { success: false, error: error.message };
  }
}

// Update git identity (called from admin interface)
function updateGitIdentity(userName, userEmail) {
  console.log(`🔧 [GitHub] Updating git identity to: ${userName} <${userEmail}>`);
  return setGitIdentity(userName, userEmail);
}

// Validate GitHub Personal Access Token format
function validateAccessToken(accessToken) {
  if (!accessToken || typeof accessToken !== 'string' || accessToken.trim() === '') {
    return { valid: false, error: 'GitHub Personal Access Token is required for authentication. Please configure it in the admin interface.' };
  }

  const sanitizedToken = accessToken.trim();
  
  // Check for JSON content (common configuration error)
  if (sanitizedToken.startsWith('{') || sanitizedToken.includes('"user"') || sanitizedToken.includes('"name"')) {
    return { 
      valid: false, 
      error: 'Invalid GitHub Personal Access Token format. The token appears to contain configuration data instead of a valid token. Please verify your token in the admin interface.' 
    };
  }

  // Basic format validation for GitHub Personal Access Tokens
  // Classic tokens: ghp_xxxx (40 chars total), Fine-grained: github_pat_xxxx (varies)
  if (sanitizedToken.length < 20 || sanitizedToken.length > 255) {
    return { 
      valid: false, 
      error: 'Invalid GitHub Personal Access Token format. Token should be between 20-255 characters. Please verify your token in the admin interface.' 
    };
  }

  // Check for obviously invalid characters that shouldn't be in tokens
  if (/[{}\[\]"'\s<>]/.test(sanitizedToken)) {
    return { 
      valid: false, 
      error: 'Invalid GitHub Personal Access Token format. Token contains invalid characters. Please verify your token in the admin interface.' 
    };
  }

  return { valid: true, sanitizedToken };
}

async function robustDirectoryCleanup(dirPath, maxRetries = 5, baseDelay = 100) {
  console.log(`🧹 [GitHub] Starting robust cleanup of: ${dirPath}`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // First, try to change permissions if possible (helps with some locked files)
      try {
        if (process.platform !== 'win32') {
          // Use proper escaping to prevent command injection
          const { spawn } = require('child_process');
          const chmod = spawn('chmod', ['-R', '755', dirPath], { stdio: 'ignore' });
          await new Promise((resolve, reject) => {
            chmod.on('close', (code) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`chmod exited with code ${code}`));
              }
            });
            chmod.on('error', reject);
          });
        }
      } catch (chmodError) {
        // Ignore chmod failures, they're not critical
        console.log(`🔧 [GitHub] chmod failed (non-critical): ${chmodError.message}`);
      }
      
      // Try to remove the directory
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`✅ [GitHub] Directory cleanup successful on attempt ${attempt}`);
      return { success: true };
      
    } catch (rmError) {
      console.log(`⚠️ [GitHub] Cleanup attempt ${attempt}/${maxRetries} failed: ${rmError.message}`);
      
      // If it's an EBUSY error and we have retries left, wait and try again
      if ((rmError.code === 'EBUSY' || rmError.code === 'EPERM' || rmError.code === 'ENOTEMPTY') && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`⏳ [GitHub] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If we've exhausted retries or it's a different error, try alternative approaches
      if (attempt === maxRetries) {
        console.log(`🔄 [GitHub] Trying alternative cleanup methods...`);
        
        // Try to clear the directory contents first, then remove the directory
        try {
          if (fs.existsSync(dirPath)) {
            const items = fs.readdirSync(dirPath);
            for (const item of items) {
              const itemPath = path.join(dirPath, item);
              try {
                const stat = fs.lstatSync(itemPath);
                if (stat.isDirectory()) {
                  const subResult = await robustDirectoryCleanup(itemPath, 2, baseDelay);
                  if (!subResult.success) {
                    console.log(`⚠️ [GitHub] Could not clean subdirectory: ${item}`);
                  }
                } else {
                  fs.unlinkSync(itemPath);
                }
              } catch (itemError) {
                console.log(`⚠️ [GitHub] Could not remove item ${item}: ${itemError.message}`);
              }
            }
            
            // Try to remove the now-empty directory
            fs.rmdirSync(dirPath);
            console.log(`✅ [GitHub] Directory cleanup successful using alternative method`);
            return { success: true };
          }
        } catch (altError) {
          console.log(`❌ [GitHub] Alternative cleanup method also failed: ${altError.message}`);
          
          // If the directory is a mounted volume, we might not be able to remove it
          // Check if it's empty and if so, consider it success
          try {
            if (fs.existsSync(dirPath)) {
              const items = fs.readdirSync(dirPath);
              if (items.length === 0) {
                console.log(`ℹ️ [GitHub] Directory is empty but cannot be removed (likely mounted volume)`);
                return { success: true };
              }
            }
          } catch (checkError) {
            // Ignore check errors
          }
        }
      }
      
      // Final failure
      if (attempt === maxRetries) {
        const errorMsg = `Cannot clean up directory ${dirPath}: ${rmError.message}. The directory may be in use or mounted. Please ensure no applications are accessing the directory and try again.`;
        console.error(`❌ [GitHub] ${errorMsg}`);
        return { 
          success: false, 
          error: errorMsg
        };
      }
    }
  }
  
  return { success: false, error: 'Unexpected error in directory cleanup' };
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
    // Validate and sanitize the repository path to prevent path injection
    if (!repoPath || typeof repoPath !== 'string') {
      return { success: false, error: 'Invalid repository path' };
    }
    
    const normalizedRepoPath = path.resolve(repoPath);
    if (!normalizedRepoPath.startsWith('/') || normalizedRepoPath.includes('..')) {
      return { success: false, error: 'Invalid repository path - path traversal not allowed' };
    }
    
    // Sanitize commit message to prevent command injection
    if (typeof commitMessage !== 'string') {
      commitMessage = 'Automated vidiots update';
    }
    const sanitizedCommitMessage = commitMessage.replace(/["\\`$]/g, ''); // Remove dangerous characters
    
    console.log(`🚀 [GitHub] Starting git upload process with message: "${sanitizedCommitMessage}"`);
    console.log(`📁 [GitHub] Repository path: ${normalizedRepoPath}`);
    
    // Ensure git identity is configured before any git operations
    try {
      const currentName = execSync('git config --get user.name', { encoding: 'utf8' }).trim();
      const currentEmail = execSync('git config --get user.email', { encoding: 'utf8' }).trim();
      console.log(`📧 [GitHub] Current git identity: ${currentName} <${currentEmail}>`);
    } catch (identityError) {
      console.warn('⚠️ [GitHub] Git identity not set, applying default configuration');
      loadGitConfig(); // Reload git config to ensure identity is set
    }
    
    if (!hasChanges(normalizedRepoPath)) {
      console.log('📋 [GitHub] No changes to commit or push.');
      return { success: true, message: 'No changes to push' };
    }

    console.log('📝 [GitHub] Changes detected, proceeding with git operations...');

    // Ensure remote origin is configured with the authenticated URL
    try {
      const githubConfig = config.vidiots.githubPages;
      const { repoOwner, repoName, accessToken } = githubConfig;
      
      // Validate access token format
      const tokenValidation = validateAccessToken(accessToken);
      if (!tokenValidation.valid) {
        console.error('❌ [GitHub] GitHub Personal Access Token validation failed');
        return { success: false, error: tokenValidation.error };
      }
      const sanitizedToken = tokenValidation.sanitizedToken;
      
      const authenticatedUrl = `https://${sanitizedToken}@github.com/${repoOwner}/${repoName}.git`;
      console.log(`🔧 [GitHub] Updating remote origin URL with authentication`);
      
      // Sanitize parameters to prevent command injection
      const sanitizedUrl = JSON.stringify(authenticatedUrl);
      
      execSync(`git remote set-url origin ${sanitizedUrl}`, { cwd: normalizedRepoPath });
      console.log('✅ [GitHub] Remote origin URL updated with authentication');
      
    } catch (remoteError) {
      console.error('❌ [GitHub] Failed to update remote URL:', remoteError.message);
      return { success: false, error: `Failed to configure remote URL: ${remoteError.message}` };
    }

    // Check if there are uncommitted changes that need to be added and committed
    const statusOutput = execSync('git status --porcelain', {
      cwd: normalizedRepoPath,
      encoding: 'utf8'
    });

    const hasUncommittedChanges = statusOutput && statusOutput.trim().length > 0;

    if (hasUncommittedChanges) {
      // git add -A
      console.log('📤 [GitHub] Adding files to git...');
      execSync('git add -A', { cwd: normalizedRepoPath });
      console.log('✅ [GitHub] Files added successfully');

      // git commit -m "message"
      console.log('💾 [GitHub] Committing changes...');
      const commitOutput = execSync('git commit -m "' + sanitizedCommitMessage + '"', {
        cwd: normalizedRepoPath,
        encoding: 'utf8'
      });
      console.log('✅ [GitHub] Commit successful:', commitOutput.trim());
    } else {
      console.log('📝 [GitHub] No uncommitted changes, proceeding directly to push...');
    }

    // git push
    console.log('⬆️ [GitHub] Pushing to GitHub...');
    const pushOutput = execSync('git push', {
      cwd: normalizedRepoPath,
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
          cwd: normalizedRepoPath,
          encoding: 'utf8'
        });
        console.log('✅ [GitHub] Pull successful:', pullOutput.trim());
        
        // Retry push after pull
        console.log('🔄 [GitHub] Retrying push after pull...');
        const retryPushOutput = execSync('git push', {
          cwd: normalizedRepoPath,
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
    const accessToken = githubConfig.accessToken;
    
    if (!repoPath) {
      console.error('❌ [GitHub] No repository path configured');
      return { success: false, error: 'No repository path configured' };
    }
    
    // Validate access token format
    const tokenValidation = validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      console.error('❌ [GitHub] GitHub Personal Access Token validation failed');
      return { success: false, error: tokenValidation.error };
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
    const accessToken = githubConfig.accessToken;
    
    if (!repoPath) {
      return { success: false, error: 'No repository path configured' };
    }
    
    // Validate access token format
    const tokenValidation = validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      return { success: false, error: tokenValidation.error };
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
    const { repoOwner, repoName, branch = 'main', repoLocalPath, accessToken } = githubConfig;
    
    if (!repoOwner || !repoName || !repoLocalPath) {
      return { success: false, error: 'Repository configuration incomplete. Need owner, name, and local path.' };
    }
    
    if (!accessToken || typeof accessToken !== 'string' || accessToken.trim() === '') {
      return { success: false, error: 'GitHub Personal Access Token is required for authentication. Please configure it in the admin interface.' };
    }

    // Validate access token format
    const tokenValidation = validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      return { success: false, error: tokenValidation.error };
    }
    const sanitizedToken = tokenValidation.sanitizedToken;
    
    // Validate and sanitize the repository path
    const normalizedPath = path.resolve(repoLocalPath);
    if (!normalizedPath.startsWith('/') || normalizedPath.includes('..')) {
      return { success: false, error: 'Invalid repository path' };
    }
    
    // Sanitize branch name to prevent command injection
    const safeBranch = branch.replace(/[^a-zA-Z0-9._/-]/g, '');
    
    // Construct authenticated GitHub URL using sanitized token
    const repoUrl = `https://${sanitizedToken}@github.com/${repoOwner}/${repoName}.git`;
    console.log(`🔗 [GitHub] Repository URL: https://****@github.com/${repoOwner}/${repoName}.git`); // Don't log the token
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
          const cleanupResult = await robustDirectoryCleanup(normalizedPath);
          if (!cleanupResult.success) {
            return cleanupResult;
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

// Get current Git Identity configuration
function getCurrentGitIdentity() {
  try {
    if (gitConfigPath && fs.existsSync(gitConfigPath)) {
      const gitConfig = JSON.parse(fs.readFileSync(gitConfigPath, 'utf8'));
      
      if (gitConfig.user && gitConfig.user.name && gitConfig.user.email) {
        return {
          success: true,
          userName: gitConfig.user.name,
          userEmail: gitConfig.user.email,
          updatedAt: gitConfig.updatedAt
        };
      }
    }
    
    // Return default values if no config found
    return {
      success: true,
      userName: 'Local-Server-Site-Pusher',
      userEmail: 'noreply@local-server.container',
      updatedAt: null,
      isDefault: true
    };
  } catch (error) {
    console.warn('⚠️ [GitHub] Error reading git config:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Generic file upload function for any module (espresso, vidiots, etc.)
async function uploadFiles(fileList, commitMessage = 'Automated file update', moduleConfig = null) {
  try {
    // Use moduleConfig if provided, otherwise fall back to vidiots config for backward compatibility
    const githubConfig = moduleConfig || config?.vidiots?.githubPages;
    
    if (!githubConfig?.enabled) {
      console.log('📋 [GitHub] GitHub Pages integration disabled');
      return { success: false, error: 'GitHub Pages integration not enabled' };
    }
    
    const repoPath = githubConfig.repoLocalPath;
    const accessToken = githubConfig.accessToken;
    
    if (!repoPath) {
      console.error('❌ [GitHub] No repository path configured');
      return { success: false, error: 'No repository path configured' };
    }
    
    // Validate access token format
    const tokenValidation = validateAccessToken(accessToken);
    if (!tokenValidation.valid) {
      console.error('❌ [GitHub] GitHub Personal Access Token validation failed');
      return { success: false, error: tokenValidation.error };
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
    
    console.log(`🚀 [GitHub] Starting file upload to GitHub Pages...`);
    console.log(`📁 [GitHub] Repository path: ${normalizedPath}`);
    console.log(`📋 [GitHub] Files to upload: ${fileList.length}`);
    
    // Copy files to repository
    for (const file of fileList) {
      if (!file.localPath || !file.remotePath) {
        console.error(`❌ [GitHub] Invalid file object: ${JSON.stringify(file)}`);
        continue;
      }
      
      // Validate local file exists
      if (!fs.existsSync(file.localPath)) {
        console.error(`❌ [GitHub] Local file does not exist: ${file.localPath}`);
        continue;
      }
      
      // Validate remote path (no path traversal)
      if (file.remotePath.includes('..') || file.remotePath.includes('\0')) {
        console.error(`❌ [GitHub] Invalid remote path: ${file.remotePath}`);
        continue;
      }
      
      const destinationPath = path.join(normalizedPath, file.remotePath);
      
      // Ensure destination path is within repository bounds
      if (!destinationPath.startsWith(normalizedPath)) {
        console.error(`❌ [GitHub] Destination path outside repository bounds: ${file.remotePath}`);
        continue;
      }
      
      // Ensure destination directory exists
      const destinationDir = path.dirname(destinationPath);
      if (!fs.existsSync(destinationDir)) {
        fs.mkdirSync(destinationDir, { recursive: true });
        console.log(`📁 [GitHub] Created directory: ${path.relative(normalizedPath, destinationDir)}`);
      }
      
      // Copy file to repository
      try {
        fs.copyFileSync(file.localPath, destinationPath);
        console.log(`📄 [GitHub] Copied file: ${file.localPath} -> ${file.remotePath}`);
      } catch (copyError) {
        console.error(`❌ [GitHub] Failed to copy file ${file.localPath}: ${copyError.message}`);
        continue;
      }
    }
    
    // Push changes to GitHub
    const result = await pushToGitHub(normalizedPath, commitMessage);
    
    if (result.success) {
      console.log('✅ [GitHub] Files uploaded to GitHub Pages successfully');
    } else {
      console.error('❌ [GitHub] Failed to upload files:', result.error);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ [GitHub] Error in uploadFiles:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  init,
  uploadVidiots,
  uploadFiles,
  testConnection,
  pushToGitHub,
  cloneOrPullRepository,
  browseRepository,
  getFileContent,
  updateGitIdentity,
  setGitIdentity,
  getCurrentGitIdentity
};