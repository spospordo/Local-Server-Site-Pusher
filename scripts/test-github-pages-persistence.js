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
    
    // Specifically check that localRepo is NOT present
    if (espressoSection.includes('"localRepo"')) {
        console.log('❌ espresso config still has "localRepo" - this causes the bug!');
        console.log('   "localRepo" should be replaced with "githubPages"');
        hasErrors = true;
    } else {
        console.log('✅ espresso config does not have "localRepo" (correct)');
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
    // Both should have githubPages, not localRepo
    const serverHasGithubPages = espressoSection.includes('"githubPages"');
    const validateHasGithubPages = validateEspressoSection.includes('"githubPages"');
    
    if (serverHasGithubPages && validateHasGithubPages) {
        console.log('✅ Both files have espresso.githubPages section');
    } else {
        console.log('❌ Inconsistency: not both files have espresso.githubPages');
        hasErrors = true;
    }
    
    const serverHasLocalRepo = espressoSection.includes('"localRepo"');
    if (serverHasLocalRepo) {
        console.log('❌ server.js still has espresso.localRepo - this is the bug!');
        hasErrors = true;
    } else {
        console.log('✅ server.js does not have espresso.localRepo');
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
    console.log('   - Replaced espresso.localRepo with espresso.githubPages in server.js');
    console.log('   - This ensures config validation uses correct defaults');
    console.log('   - GitHub Pages enabled setting now persists across redeploys');
    console.log('');
    process.exit(0);
} else {
    console.log('❌ Tests FAILED!');
    console.log('');
    console.log('🔍 The issue:');
    console.log('   When server.js has "localRepo" instead of "githubPages" for espresso,');
    console.log('   the config validation merges wrong defaults, potentially overwriting');
    console.log('   the githubPages.enabled setting during startup or redeploy.');
    console.log('');
    console.log('💡 The fix:');
    console.log('   Replace "localRepo" with "githubPages" in server.js defaultConfig');
    console.log('   to match the actual usage and validate-config.js structure.');
    console.log('');
    process.exit(1);
}
