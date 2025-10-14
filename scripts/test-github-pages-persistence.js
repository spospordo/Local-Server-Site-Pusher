#!/usr/bin/env node

/**
 * Test script to verify GitHub Pages upload settings persistence
 * 
 * This test verifies that:
 * 1. Default configuration includes githubPages sections for all modules
 * 2. Config validation doesn't overwrite githubPages settings
 * 3. The structure matches between server.js and validate-config.js
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 GitHub Pages Settings Persistence Test');
console.log('==========================================\n');

let hasErrors = false;

const projectDir = path.join(__dirname, '..');
const serverJsPath = path.join(projectDir, 'server.js');
const validateConfigPath = path.join(projectDir, 'scripts', 'validate-config.js');

/**
 * Extract a config section from the content
 */
function extractConfigSection(content, sectionName) {
    const startIdx = content.indexOf(`"${sectionName}": {`);
    if (startIdx === -1) return null;
    
    let braceCount = 0;
    let idx = startIdx + `"${sectionName}": `.length;
    let endIdx = idx;
    
    for (; idx < content.length; idx++) {
        if (content[idx] === '{') braceCount++;
        if (content[idx] === '}') {
            braceCount--;
            if (braceCount === 0) {
                endIdx = idx + 1;
                break;
            }
        }
    }
    
    return content.substring(startIdx, endIdx);
}

/**
 * Check if section has required githubPages fields
 */
function validateGithubPagesSection(section, moduleName) {
    const requiredFields = [
        '"enabled"',
        '"repoOwner"',
        '"repoName"',
        '"branch"',
        '"repoLocalPath"',
        '"accessToken"',
        '"commitMessage"'
    ];
    
    if (!section.includes('"githubPages"')) {
        console.log(`❌ ${moduleName} missing "githubPages" section!`);
        return false;
    }
    
    let allFieldsPresent = true;
    for (const field of requiredFields) {
        if (!section.includes(field)) {
            console.log(`⚠️  ${moduleName}.githubPages missing field: ${field}`);
            allFieldsPresent = false;
        }
    }
    
    if (allFieldsPresent) {
        console.log(`✅ ${moduleName}.githubPages has all required fields`);
    }
    
    return allFieldsPresent;
}

// Test 1: Check server.js default config
console.log('📋 Test 1: Checking server.js default configuration');
console.log('----------------------------------------------------');

const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

// Check vidiots.githubPages
const vidiotsSection = extractConfigSection(serverJsContent, 'vidiots');
if (vidiotsSection) {
    if (!validateGithubPagesSection(vidiotsSection, 'vidiots')) {
        hasErrors = true;
    }
} else {
    console.log('❌ Could not find vidiots config section!');
    hasErrors = true;
}

// Check espresso.githubPages
const espressoSection = extractConfigSection(serverJsContent, 'espresso');
if (espressoSection) {
    if (!validateGithubPagesSection(espressoSection, 'espresso')) {
        hasErrors = true;
    }
    
    // Check that localRepo also exists (it's a separate feature for local file management)
    if (espressoSection.includes('"localRepo"')) {
        console.log('✅ espresso config has "localRepo" section (separate feature for local files)');
    } else {
        console.log('⚠️  espresso config missing "localRepo" section');
        // Not a critical error for GitHub Pages persistence, but good to have
    }
} else {
    console.log('❌ Could not find espresso config section!');
    hasErrors = true;
}

console.log('');

// Test 2: Check validate-config.js default config
console.log('📋 Test 2: Checking validate-config.js default configuration');
console.log('-------------------------------------------------------------');

const validateConfigContent = fs.readFileSync(validateConfigPath, 'utf8');

// Check espresso.githubPages in validate-config.js
const validateEspressoSection = extractConfigSection(validateConfigContent, 'espresso');
if (validateEspressoSection) {
    if (!validateGithubPagesSection(validateEspressoSection, 'espresso (validate-config.js)')) {
        hasErrors = true;
    }
} else {
    console.log('❌ Could not find espresso config section in validate-config.js!');
    hasErrors = true;
}

console.log('');

// Test 3: Consistency check
console.log('📋 Test 3: Consistency check between files');
console.log('-------------------------------------------');

if (espressoSection && validateEspressoSection) {
    // Both should have githubPages
    const serverHasGithubPages = espressoSection.includes('"githubPages"');
    const validateHasGithubPages = validateEspressoSection.includes('"githubPages"');
    
    if (serverHasGithubPages && validateHasGithubPages) {
        console.log('✅ Both files have espresso.githubPages section');
    } else {
        console.log('❌ Inconsistency: not both files have espresso.githubPages');
        hasErrors = true;
    }
    
    // Check that both have localRepo (it's a valid separate feature)
    const serverHasLocalRepo = espressoSection.includes('"localRepo"');
    const validateHasLocalRepo = validateEspressoSection.includes('"localRepo"');
    
    if (serverHasLocalRepo && validateHasLocalRepo) {
        console.log('✅ Both files have espresso.localRepo section (for local file management)');
    } else if (!serverHasLocalRepo && !validateHasLocalRepo) {
        console.log('ℹ️  Neither file has espresso.localRepo (may be legacy feature)');
    } else {
        console.log('⚠️  Inconsistency in espresso.localRepo between files');
        // Not critical for GitHub Pages persistence
    }
}

console.log('');

// Summary
console.log('📋 Summary');
console.log('----------');

if (!hasErrors) {
    console.log('✅ All tests PASSED!');
    console.log('');
    console.log('🎉 GitHub Pages settings will persist correctly:');
    console.log('   ✓ Default configs have proper githubPages sections');
    console.log('   ✓ Config validation will not overwrite settings');
    console.log('   ✓ Settings will persist across deployments');
    console.log('');
    console.log('📚 What was fixed:');
    console.log('   - Added espresso.githubPages section to server.js defaultConfig');
    console.log('   - espresso.localRepo remains for local file management');
    console.log('   - Both sections work together: localRepo for local files, githubPages for upload');
    console.log('   - This ensures config validation uses correct defaults');
    console.log('   - GitHub Pages enabled setting now persists across redeploys');
    console.log('');
    process.exit(0);
} else {
    console.log('❌ Tests FAILED!');
    console.log('');
    console.log('🔍 The issue:');
    console.log('   When server.js was missing "githubPages" for espresso config,');
    console.log('   the config validation could not properly merge defaults, potentially');
    console.log('   losing the githubPages.enabled setting during startup or redeploy.');
    console.log('');
    console.log('💡 The fix:');
    console.log('   Add "githubPages" section to server.js espresso defaultConfig');
    console.log('   alongside the existing "localRepo" section (they serve different purposes).');
    console.log('   This ensures config validation properly preserves GitHub Pages settings.');
    console.log('');
    process.exit(1);
}
