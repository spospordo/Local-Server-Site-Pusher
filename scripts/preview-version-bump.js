#!/usr/bin/env node

/**
 * Preview Version Bump Script
 * 
 * Analyzes commit messages and shows what version bump would occur
 * WITHOUT making any changes to files or git repository.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, options = {}) {
  try {
    return execSync(command, { 
      encoding: 'utf8', 
      stdio: 'pipe',
      ...options 
    }).trim();
  } catch (error) {
    if (!options.ignoreError) {
      throw error;
    }
    return '';
  }
}

function getCurrentVersion() {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
  );
  return packageJson.version;
}

function getLastVersionTag() {
  const tags = execCommand('git tag --sort=-v:refname', { ignoreError: true });
  if (!tags) return null;
  
  const tagList = tags.split('\n').filter(tag => tag.match(/^v?\d+\.\d+\.\d+$/));
  return tagList[0] || null;
}

function getCommitsSinceLastTag(lastTag) {
  let command;
  if (lastTag) {
    command = `git log ${lastTag}..HEAD --pretty=format:"%s"`;
  } else {
    command = `git log -10 --pretty=format:"%s"`;
  }
  
  const commits = execCommand(command, { ignoreError: true });
  return commits ? commits.split('\n').filter(Boolean) : [];
}

function determineBumpType(commits) {
  if (commits.length === 0) {
    return null;
  }

  let bumpType = 'patch';

  for (const commit of commits) {
    const lowerCommit = commit.toLowerCase();
    
    if (lowerCommit.includes('breaking change') || 
        lowerCommit.startsWith('major:') ||
        lowerCommit.includes('breaking:')) {
      return 'major';
    }
    
    if (lowerCommit.startsWith('feat:') || 
        lowerCommit.startsWith('feature:') ||
        lowerCommit.includes('new feature')) {
      bumpType = 'minor';
    }
  }

  return bumpType;
}

function bumpVersion(currentVersion, bumpType) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid bump type: ${bumpType}`);
  }
}

function getBumpTypeIcon(bumpType) {
  switch (bumpType) {
    case 'major': return '💥';
    case 'minor': return '✨';
    case 'patch': return '🔧';
    default: return '📦';
  }
}

function main() {
  log('\n🔍 Version Bump Preview\n', 'cyan');
  log('This tool previews what version bump would occur based on commits.', 'blue');
  log('No changes will be made to your repository.\n', 'blue');
  
  // Get current version
  const currentVersion = getCurrentVersion();
  log(`📌 Current version: ${currentVersion}`, 'yellow');
  
  // Get last version tag
  const lastTag = getLastVersionTag();
  if (lastTag) {
    log(`🏷️  Last version tag: ${lastTag}`, 'yellow');
  } else {
    log('🏷️  No previous version tag found', 'yellow');
  }
  
  log(''); // Empty line
  
  // Get commits since last tag
  const commits = getCommitsSinceLastTag(lastTag);
  
  if (commits.length === 0) {
    log('ℹ️  No new commits found since last version.', 'cyan');
    log('⏭️  Version bump would be skipped.', 'yellow');
    return;
  }
  
  log(`📝 Commits to analyze (${commits.length}):\n`, 'cyan');
  
  // Analyze each commit and show what it would trigger
  commits.forEach((commit, index) => {
    const lowerCommit = commit.toLowerCase();
    let icon = '  ';
    let typeLabel = '';
    
    if (lowerCommit.includes('breaking change') || 
        lowerCommit.startsWith('major:') ||
        lowerCommit.includes('breaking:')) {
      icon = '💥';
      typeLabel = ' [MAJOR]';
    } else if (lowerCommit.startsWith('feat:') || 
               lowerCommit.startsWith('feature:')) {
      icon = '✨';
      typeLabel = ' [MINOR]';
    } else if (lowerCommit.startsWith('fix:') || 
               lowerCommit.startsWith('patch:')) {
      icon = '🔧';
      typeLabel = ' [PATCH]';
    } else {
      icon = '📄';
      typeLabel = ' [PATCH (default)]';
    }
    
    log(`${icon} ${commit}`, 'blue');
    log(`   ${typeLabel}`, 'magenta');
  });
  
  log(''); // Empty line
  
  // Determine bump type
  const bumpType = determineBumpType(commits);
  
  if (!bumpType) {
    log('⚠️  Could not determine bump type.', 'red');
    return;
  }
  
  const icon = getBumpTypeIcon(bumpType);
  log(`${icon} Determined bump type: ${bumpType.toUpperCase()}`, 'cyan');
  
  // Calculate new version
  const newVersion = bumpVersion(currentVersion, bumpType);
  
  log(''); // Empty line
  log('━'.repeat(50), 'cyan');
  log(`${currentVersion} → ${newVersion}`, 'green');
  log('━'.repeat(50), 'cyan');
  log(''); // Empty line
  
  // Show what would happen
  log('📋 Actions that would be performed:', 'yellow');
  log('   1. Update package.json version', 'blue');
  log('   2. Add entry to CHANGELOG.md', 'blue');
  log('   3. Commit changes', 'blue');
  log(`   4. Create git tag: v${newVersion}`, 'blue');
  log('   5. Push changes and tag to remote', 'blue');
  
  log(''); // Empty line
  log('💡 Tip: Run the actual bump with:', 'cyan');
  log('   node scripts/bump-version.js', 'yellow');
  log(''); // Empty line
}

// Run the script
if (require.main === module) {
  try {
    main();
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    process.exit(1);
  }
}
