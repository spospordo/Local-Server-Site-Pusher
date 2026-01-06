#!/usr/bin/env node

/**
 * Automated Version Bump Script
 * 
 * Analyzes commit messages since the last version tag to determine
 * the appropriate semantic version bump (major, minor, or patch).
 * 
 * Commit message conventions:
 * - BREAKING CHANGE: or major: -> Major version bump (x.0.0)
 * - feat: or feature: -> Minor version bump (0.x.0)
 * - fix: or patch: or any other -> Patch version bump (0.0.x)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, options = {}) {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options 
    });
    return result ? result.trim() : '';
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

function updatePackageVersion(newVersion) {
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  log(`✓ Updated package.json to version ${newVersion}`, 'green');
}

function getLastVersionTag() {
  // Try to get the last version tag
  const tags = execCommand('git tag --sort=-v:refname', { silent: true, ignoreError: true });
  if (!tags) return null;
  
  const tagList = tags.split('\n').filter(tag => tag.match(/^v?\d+\.\d+\.\d+$/));
  return tagList[0] || null;
}

function getCommitsSinceLastTag(lastTag) {
  let command;
  if (lastTag) {
    command = `git log ${lastTag}..HEAD --pretty=format:"%s"`;
  } else {
    // If no tag exists, get last commit only (to avoid processing entire history)
    command = `git log -1 --pretty=format:"%s"`;
  }
  
  const commits = execCommand(command, { silent: true, ignoreError: true });
  return commits ? commits.split('\n').filter(Boolean) : [];
}

function determineBumpType(commits) {
  if (commits.length === 0) {
    return null; // No commits to process
  }

  let bumpType = 'patch'; // Default to patch

  for (const commit of commits) {
    const lowerCommit = commit.toLowerCase();
    
    // Check for major version indicators
    if (lowerCommit.includes('breaking change') || 
        lowerCommit.startsWith('major:') ||
        lowerCommit.includes('breaking:')) {
      return 'major'; // Major takes precedence
    }
    
    // Check for minor version indicators
    if (lowerCommit.startsWith('feat:') || 
        lowerCommit.startsWith('feature:') ||
        lowerCommit.includes('new feature')) {
      bumpType = 'minor'; // Minor takes precedence over patch
    }
    
    // Patch is default for fix:, patch:, or any other commit
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

function updateChangelog(newVersion, commits, bumpType) {
  const changelogPath = path.join(__dirname, '../CHANGELOG.md');
  let changelog = fs.readFileSync(changelogPath, 'utf8');
  
  const today = new Date().toISOString().split('T')[0];
  const bumpTypeLabel = bumpType.charAt(0).toUpperCase() + bumpType.slice(1);
  
  // Create new version entry
  let newEntry = `\n## [${newVersion}] - ${today}\n\n`;
  newEntry += `### ${bumpTypeLabel} Update\n`;
  newEntry += `- Automated version bump based on recent changes\n`;
  
  // Add commit messages as bullet points
  if (commits.length > 0) {
    newEntry += `- Changes included:\n`;
    commits.slice(0, 10).forEach(commit => { // Limit to 10 commits for brevity
      newEntry += `  - ${commit}\n`;
    });
    if (commits.length > 10) {
      newEntry += `  - ... and ${commits.length - 10} more changes\n`;
    }
  }
  
  newEntry += `\n`;
  
  // Insert after the [Unreleased] section
  const unreleasedIndex = changelog.indexOf('## [Unreleased]');
  if (unreleasedIndex !== -1) {
    // Find the end of the Unreleased section
    const nextSectionIndex = changelog.indexOf('\n## [', unreleasedIndex + 1);
    if (nextSectionIndex !== -1) {
      changelog = 
        changelog.slice(0, nextSectionIndex) + 
        newEntry + 
        changelog.slice(nextSectionIndex);
    } else {
      changelog += newEntry;
    }
  } else {
    // If no Unreleased section, add at the beginning after the header
    const headerEnd = changelog.indexOf('\n## ');
    if (headerEnd !== -1) {
      changelog = 
        changelog.slice(0, headerEnd + 1) + 
        newEntry + 
        changelog.slice(headerEnd + 1);
    } else {
      changelog += newEntry;
    }
  }
  
  fs.writeFileSync(changelogPath, changelog);
  log(`✓ Updated CHANGELOG.md with version ${newVersion}`, 'green');
}

function createGitTag(version) {
  const tagName = `v${version}`;
  execCommand(`git tag -a ${tagName} -m "Release version ${version}"`);
  log(`✓ Created git tag ${tagName}`, 'green');
  return tagName;
}

function commitChanges(version) {
  execCommand('git add package.json CHANGELOG.md');
  execCommand(`git commit -m "chore: bump version to ${version}"`);
  log(`✓ Committed version bump changes`, 'green');
}

function setGitHubOutput(name, value) {
  // Use new GitHub Actions output format
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function main() {
  try {
    log('\n🚀 Starting automated version bump...', 'cyan');
    
    // Get current version
    const currentVersion = getCurrentVersion();
    log(`Current version: ${currentVersion}`, 'blue');
    
    // Get last version tag
    const lastTag = getLastVersionTag();
    if (lastTag) {
      log(`Last version tag: ${lastTag}`, 'blue');
    } else {
      log('No previous version tag found, will analyze last commit only', 'yellow');
    }
    
    // Get commits since last tag
    const commits = getCommitsSinceLastTag(lastTag);
    if (commits.length === 0) {
      log('No new commits to process. Version bump not needed.', 'yellow');
      // Set output for GitHub Actions
      setGitHubOutput('bumped', 'false');
      return;
    }
    
    log(`\nAnalyzing ${commits.length} commit(s):`, 'blue');
    commits.forEach(commit => log(`  - ${commit}`, 'blue'));
    
    // Determine bump type
    const bumpType = determineBumpType(commits);
    if (!bumpType) {
      log('No version bump needed.', 'yellow');
      setGitHubOutput('bumped', 'false');
      return;
    }
    
    log(`\nDetermined bump type: ${bumpType.toUpperCase()}`, 'cyan');
    
    // Calculate new version
    const newVersion = bumpVersion(currentVersion, bumpType);
    log(`New version: ${newVersion}`, 'green');
    
    // Update package.json
    updatePackageVersion(newVersion);
    
    // Update CHANGELOG.md
    updateChangelog(newVersion, commits, bumpType);
    
    // Commit changes
    commitChanges(newVersion);
    
    // Create git tag
    createGitTag(newVersion);
    
    // Set output for GitHub Actions
    setGitHubOutput('bumped', 'true');
    setGitHubOutput('version', newVersion);
    
    log('\n✅ Version bump completed successfully!', 'green');
    log(`Version ${currentVersion} → ${newVersion}`, 'cyan');
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  getCurrentVersion,
  getCommitsSinceLastTag,
  determineBumpType,
  bumpVersion,
};
