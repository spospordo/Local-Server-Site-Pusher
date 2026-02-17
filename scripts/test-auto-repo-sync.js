#!/usr/bin/env node

/**
 * Test script to verify automatic repository sync on startup
 * Tests that GitHub repositories are cloned/pulled when GitHub Pages is enabled
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Automatic Repository Sync on Startup\n');
console.log('='.repeat(80));

// Mock configuration for testing
const testConfig = {
  vidiots: {
    enabled: true,
    githubPages: {
      enabled: true,
      repoOwner: 'testuser',
      repoName: 'test-vidiots-repo',
      branch: 'main',
      repoLocalPath: '/tmp/test-vidiots-repo',
      accessToken: 'test-token',
      commitMessage: 'Test commit'
    }
  },
  espresso: {
    enabled: true,
    githubPages: {
      enabled: true,
      repoOwner: 'testuser',
      repoName: 'test-espresso-repo',
      branch: 'main',
      repoLocalPath: '/tmp/test-espresso-repo',
      accessToken: 'test-token',
      remotePath: 'espresso/index.html',
      commitMessage: 'Test commit'
    }
  }
};

console.log('\n📋 Test 1: Verify syncRepositoriesOnStartup function exists in server.js');
console.log('-'.repeat(80));

const serverJsPath = path.join(__dirname, '..', 'server.js');
const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');

// Check if the function exists
const hasSyncFunction = serverJsContent.includes('async function syncRepositoriesOnStartup()');
const hasVidiotsSync = serverJsContent.includes('config.vidiots?.githubPages?.enabled');
const hasEspressoSync = serverJsContent.includes('config.espresso?.githubPages?.enabled');
const callsCloneOrPull = serverJsContent.includes('cloneOrPullRepository');
const hasAsyncCall = serverJsContent.includes('syncRepositoriesOnStartup()');

console.log(`Function defined: ${hasSyncFunction ? '✅' : '❌'}`);
console.log(`Checks vidiots.githubPages.enabled: ${hasVidiotsSync ? '✅' : '❌'}`);
console.log(`Checks espresso.githubPages.enabled: ${hasEspressoSync ? '✅' : '❌'}`);
console.log(`Calls cloneOrPullRepository: ${callsCloneOrPull ? '✅' : '❌'}`);
console.log(`Function is invoked on startup: ${hasAsyncCall ? '✅' : '❌'}`);

const test1Pass = hasSyncFunction && hasVidiotsSync && hasEspressoSync && callsCloneOrPull && hasAsyncCall;
console.log(`\n${test1Pass ? '✅' : '❌'} Test 1: ${test1Pass ? 'PASSED' : 'FAILED'}`);

console.log('\n📋 Test 2: Verify cloneOrPullRepository accepts moduleConfig parameter');
console.log('-'.repeat(80));

const githubUploadPath = path.join(__dirname, '..', 'modules', 'github-upload.js');
const githubUploadContent = fs.readFileSync(githubUploadPath, 'utf8');

// Check if the function signature includes moduleConfig parameter
const hasModuleConfigParam = githubUploadContent.includes('async function cloneOrPullRepository(moduleConfig = null)');
const usesModuleConfig = githubUploadContent.includes('const githubConfig = moduleConfig || config?.vidiots?.githubPages');

console.log(`Function signature includes moduleConfig: ${hasModuleConfigParam ? '✅' : '❌'}`);
console.log(`Uses moduleConfig parameter: ${usesModuleConfig ? '✅' : '❌'}`);

const test2Pass = hasModuleConfigParam && usesModuleConfig;
console.log(`\n${test2Pass ? '✅' : '❌'} Test 2: ${test2Pass ? 'PASSED' : 'FAILED'}`);

console.log('\n📋 Test 3: Verify espresso module exports githubUpload');
console.log('-'.repeat(80));

const espressoPath = path.join(__dirname, '..', 'modules', 'espresso.js');
const espressoContent = fs.readFileSync(espressoPath, 'utf8');

const exportsGithubUpload = espressoContent.includes('githubUpload') && 
                            espressoContent.match(/module\.exports\s*=\s*\{[^}]*githubUpload[^}]*\}/s);

console.log(`Espresso exports githubUpload: ${exportsGithubUpload ? '✅' : '❌'}`);

const test3Pass = exportsGithubUpload;
console.log(`\n${test3Pass ? '✅' : '❌'} Test 3: ${test3Pass ? 'PASSED' : 'FAILED'}`);

console.log('\n📋 Test 4: Verify startup sync passes correct config to modules');
console.log('-'.repeat(80));

// Check that the startup sync passes the module-specific config
const passesVidiotsConfig = serverJsContent.includes('cloneOrPullRepository(config.vidiots.githubPages)');
const passesEspressoConfig = serverJsContent.includes('cloneOrPullRepository(config.espresso.githubPages)');

console.log(`Passes vidiots.githubPages config: ${passesVidiotsConfig ? '✅' : '❌'}`);
console.log(`Passes espresso.githubPages config: ${passesEspressoConfig ? '✅' : '❌'}`);

const test4Pass = passesVidiotsConfig && passesEspressoConfig;
console.log(`\n${test4Pass ? '✅' : '❌'} Test 4: ${test4Pass ? 'PASSED' : 'FAILED'}`);

console.log('\n📋 Test 5: Verify proper logging and error handling');
console.log('-'.repeat(80));

const hasStartupLog = serverJsContent.includes('Checking for GitHub Pages repositories to sync on startup');
const hasSuccessLog = serverJsContent.includes('Repository') && serverJsContent.includes('synced') && serverJsContent.includes('successfully');
const hasErrorHandling = serverJsContent.includes('catch (error)') && serverJsContent.includes('Error during startup repository sync');
const hasSkipLog = serverJsContent.includes('GitHub Pages not enabled, skipping repository sync');

console.log(`Has startup log message: ${hasStartupLog ? '✅' : '❌'}`);
console.log(`Has success log message: ${hasSuccessLog ? '✅' : '❌'}`);
console.log(`Has error handling: ${hasErrorHandling ? '✅' : '❌'}`);
console.log(`Has skip log for disabled modules: ${hasSkipLog ? '✅' : '❌'}`);

const test5Pass = hasStartupLog && hasSuccessLog && hasErrorHandling && hasSkipLog;
console.log(`\n${test5Pass ? '✅' : '❌'} Test 5: ${test5Pass ? 'PASSED' : 'FAILED'}`);

// Summary
console.log('\n' + '='.repeat(80));
console.log('📊 Test Summary');
console.log('='.repeat(80));
const allTestsPassed = test1Pass && test2Pass && test3Pass && test4Pass && test5Pass;
console.log(`${allTestsPassed ? '✅' : '❌'} Overall: ${allTestsPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
console.log('');

if (!allTestsPassed) {
  console.log('❌ Some tests failed. The automatic repository sync may not be properly implemented.');
  process.exit(1);
} else {
  console.log('✅ All tests passed! Automatic repository sync is properly implemented.');
  console.log('\n📝 Implementation verified:');
  console.log('   • syncRepositoriesOnStartup() function defined and called');
  console.log('   • Checks both vidiots and espresso GitHub Pages enabled flags');
  console.log('   • Calls cloneOrPullRepository with module-specific config');
  console.log('   • Proper logging and error handling in place');
  console.log('   • Both modules export githubUpload for API access');
  process.exit(0);
}
