#!/usr/bin/env node

/**
 * Test script to verify deep merge configuration functionality
 * Tests that nested GitHub Pages settings are properly preserved across config merges
 */

console.log('🧪 Testing Deep Merge Configuration Preservation\n');
console.log('='.repeat(80));

// Deep merge function (copy from server.js for testing)
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // If both target and source have object at this key, merge recursively
        if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = deepMerge(result[key], source[key]);
        } else if (!result.hasOwnProperty(key)) {
          // If target doesn't have this key, use source value
          result[key] = JSON.parse(JSON.stringify(source[key])); // Deep clone
        }
        // Otherwise keep the target value (user's value takes precedence)
      } else if (!result.hasOwnProperty(key)) {
        // If target doesn't have this key and it's not an object, use source value
        result[key] = source[key];
      }
      // Otherwise keep the target value (user's value takes precedence)
    }
  }
  
  return result;
}

// Test 1: Basic nested merge
console.log('\n📋 Test 1: Basic nested object merge');
console.log('-'.repeat(80));
const userConfig1 = {
  vidiots: {
    enabled: true,
    githubPages: {
      enabled: true,
      repoOwner: 'myuser',
      repoName: 'myrepo',
      accessToken: 'secret-token'
    }
  }
};

const defaultConfig1 = {
  vidiots: {
    enabled: false,
    outputFile: './public/vidiots/index.html',
    githubPages: {
      enabled: false,
      repoOwner: '',
      repoName: '',
      branch: 'main',
      repoLocalPath: '',
      accessToken: '',
      commitMessage: 'Automated vidiots update'
    }
  }
};

const merged1 = deepMerge(userConfig1.vidiots, defaultConfig1.vidiots);
console.log('User config (partial):');
console.log(JSON.stringify(userConfig1.vidiots, null, 2));
console.log('\nDefault config (complete):');
console.log(JSON.stringify(defaultConfig1.vidiots, null, 2));
console.log('\nMerged result:');
console.log(JSON.stringify(merged1, null, 2));

// Verify critical fields are preserved
const test1Pass = 
  merged1.enabled === true && // User value preserved
  merged1.githubPages.enabled === true && // User value preserved
  merged1.githubPages.repoOwner === 'myuser' && // User value preserved
  merged1.githubPages.accessToken === 'secret-token' && // User value preserved
  merged1.githubPages.branch === 'main' && // Default value added
  merged1.githubPages.commitMessage === 'Automated vidiots update' && // Default value added
  merged1.outputFile === './public/vidiots/index.html'; // Default value added

console.log(`\n${test1Pass ? '✅' : '❌'} Test 1: ${test1Pass ? 'PASSED' : 'FAILED'}`);
if (!test1Pass) {
  console.log('   Expected: User values preserved, missing default values added');
}

// Test 2: GitHub Pages enabled flag preservation
console.log('\n📋 Test 2: GitHub Pages enabled flag preservation');
console.log('-'.repeat(80));
const userConfig2 = {
  espresso: {
    enabled: true,
    githubPages: {
      enabled: true,
      repoOwner: 'testuser',
      repoName: 'test-repo'
    }
  }
};

const defaultConfig2 = {
  espresso: {
    enabled: false,
    dataFilePath: './config/espresso-data.json',
    localRepo: {
      enabled: false,
      outputPath: 'espresso/index.html'
    },
    githubPages: {
      enabled: false,
      repoOwner: '',
      repoName: '',
      branch: 'main',
      repoLocalPath: '',
      accessToken: '',
      remotePath: 'espresso/index.html',
      imageRemotePath: 'espresso/images',
      commitMessage: 'Automated espresso update'
    }
  }
};

const merged2 = deepMerge(userConfig2.espresso, defaultConfig2.espresso);
console.log('User config (partial):');
console.log(JSON.stringify(userConfig2.espresso, null, 2));
console.log('\nMerged result:');
console.log(JSON.stringify(merged2, null, 2));

const test2Pass = 
  merged2.enabled === true && // User value preserved
  merged2.githubPages.enabled === true && // User value preserved (CRITICAL)
  merged2.githubPages.repoOwner === 'testuser' && // User value preserved
  merged2.githubPages.branch === 'main' && // Default value added
  merged2.githubPages.remotePath === 'espresso/index.html' && // Default value added
  merged2.dataFilePath === './config/espresso-data.json' && // Default value added
  merged2.localRepo.enabled === false; // Default value added for nested localRepo

console.log(`\n${test2Pass ? '✅' : '❌'} Test 2: ${test2Pass ? 'PASSED' : 'FAILED'}`);
if (!test2Pass) {
  console.log('   Expected: githubPages.enabled=true preserved, all defaults added');
}

// Test 3: Multiple nested levels
console.log('\n📋 Test 3: Multiple nested levels with mixed user/default values');
console.log('-'.repeat(80));
const userConfig3 = {
  module: {
    level1: {
      level2: {
        userValue: 'kept',
        level3: {
          deepUserValue: 'preserved'
        }
      }
    }
  }
};

const defaultConfig3 = {
  module: {
    level1: {
      defaultValue: 'added',
      level2: {
        userValue: 'replaced',
        defaultValue2: 'added',
        level3: {
          deepUserValue: 'replaced',
          deepDefaultValue: 'added'
        },
        level3default: {
          onlyDefault: true
        }
      }
    }
  }
};

const merged3 = deepMerge(userConfig3.module, defaultConfig3.module);
console.log('Merged result:');
console.log(JSON.stringify(merged3, null, 2));

const test3Pass = 
  merged3.level1.level2.userValue === 'kept' && // User value preserved
  merged3.level1.level2.level3.deepUserValue === 'preserved' && // Deep user value preserved
  merged3.level1.defaultValue === 'added' && // Default value added
  merged3.level1.level2.defaultValue2 === 'added' && // Default value added
  merged3.level1.level2.level3.deepDefaultValue === 'added' && // Deep default value added
  merged3.level1.level2.level3default.onlyDefault === true; // Entirely new nested object added

console.log(`\n${test3Pass ? '✅' : '❌'} Test 3: ${test3Pass ? 'PASSED' : 'FAILED'}`);
if (!test3Pass) {
  console.log('   Expected: All user values preserved at any depth, all defaults added');
}

// Test 4: Edge case - empty user config
console.log('\n📋 Test 4: Edge case - empty user config merges to complete defaults');
console.log('-'.repeat(80));
const userConfig4 = {
  vidiots: {}
};

const defaultConfig4 = {
  vidiots: {
    enabled: false,
    githubPages: {
      enabled: false,
      repoOwner: ''
    }
  }
};

const merged4 = deepMerge(userConfig4.vidiots, defaultConfig4.vidiots);
const test4Pass = 
  merged4.enabled === false &&
  merged4.githubPages.enabled === false &&
  merged4.githubPages.repoOwner === '';

console.log('Merged result:');
console.log(JSON.stringify(merged4, null, 2));
console.log(`\n${test4Pass ? '✅' : '❌'} Test 4: ${test4Pass ? 'PASSED' : 'FAILED'}`);

// Summary
console.log('\n' + '='.repeat(80));
console.log('📊 Test Summary');
console.log('='.repeat(80));
const allTestsPassed = test1Pass && test2Pass && test3Pass && test4Pass;
console.log(`${allTestsPassed ? '✅' : '❌'} Overall: ${allTestsPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
console.log('');

if (!allTestsPassed) {
  console.log('❌ Some tests failed. The deep merge function may not properly preserve nested settings.');
  process.exit(1);
} else {
  console.log('✅ All tests passed! Deep merge properly preserves user settings while adding defaults.');
  process.exit(0);
}
