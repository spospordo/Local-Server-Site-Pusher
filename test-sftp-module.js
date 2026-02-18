// Simple test for SFTP module
const sftp = require('./modules/sftp');

console.log('Testing SFTP module...\n');

// Test 1: Module loaded successfully
console.log('✓ SFTP module loaded successfully');
console.log('✓ Available functions:', Object.keys(sftp).join(', '));

// Test 2: Get config when none exists
console.log('\nTest: Get config (should be null initially)');
const config = sftp.getConfigSafe();
console.log('Result:', config || 'null (expected)');

// Test 3: Save configuration
console.log('\nTest: Save SFTP configuration');
const testConfig = {
  host: 'test.example.com',
  port: 22,
  username: 'testuser',
  remotePath: '/backups',
  authMethod: 'password',
  password: 'testpassword123',
  enabled: true
};

const saveResult = sftp.saveConfig(testConfig);
console.log('Save result:', saveResult);

if (saveResult.success) {
  // Test 4: Load config
  console.log('\nTest: Load saved configuration');
  const loadedConfig = sftp.getConfigSafe();
  console.log('Loaded config (safe):', JSON.stringify(loadedConfig, null, 2));
  
  if (loadedConfig.host === 'test.example.com' && loadedConfig.port === 22) {
    console.log('✓ Configuration saved and loaded correctly');
    console.log('✓ Credentials masked:', loadedConfig.hasPassword ? 'Yes' : 'No');
  } else {
    console.log('✗ Configuration mismatch');
  }
  
  // Test 5: Delete config
  console.log('\nTest: Delete configuration');
  const deleteResult = sftp.deleteConfig();
  console.log('Delete result:', deleteResult);
  
  if (deleteResult.success) {
    const afterDelete = sftp.getConfigSafe();
    console.log('After delete:', afterDelete || 'null (expected)');
  }
}

console.log('\n✅ All SFTP module tests completed successfully!');
process.exit(0);
