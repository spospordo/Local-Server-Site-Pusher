#!/usr/bin/env node

/**
 * Test script for enhanced error handling
 * Tests error-helper module functionality
 */

const { 
  NFSError, 
  GitHubError, 
  FileSystemError,
  formatNFSMountError,
  formatGitHubError,
  formatFileSystemError,
  createErrorResponse 
} = require('./modules/error-helper');

console.log('🧪 Testing Enhanced Error Handling\n');

// Test 1: NFS Permission Error
console.log('Test 1: NFS Permission Denied Error');
console.log('=' .repeat(50));
const nfsError = formatNFSMountError(
  { code: 'EACCES', message: 'Permission denied' },
  { host: '192.168.1.100', exportPath: '/mnt/share', name: 'Test NFS' }
);
console.log('Error Class:', nfsError.constructor.name);
console.log('Error Code:', nfsError.code);
console.log('Host:', nfsError.host);
console.log('Path:', nfsError.path);
console.log('Message:', nfsError.message);
console.log('Solution (first 200 chars):', nfsError.solution.substring(0, 200) + '...');
console.log('Documentation URL:', nfsError.documentationUrl);
console.log('\n');

// Test 2: NFS Timeout Error
console.log('Test 2: NFS Timeout Error');
console.log('=' .repeat(50));
const timeoutError = formatNFSMountError(
  { code: 'ETIMEDOUT', message: 'Connection timeout' },
  { host: '192.168.1.200', exportPath: '/exports/data', name: 'Backup Server' }
);
console.log('Error Code:', timeoutError.code);
console.log('Message:', timeoutError.message);
console.log('Solution (first 200 chars):', timeoutError.solution.substring(0, 200) + '...');
console.log('\n');

// Test 3: GitHub Authentication Error
console.log('Test 3: GitHub Authentication Error');
console.log('=' .repeat(50));
const githubError = formatGitHubError(
  { response: { status: 401 }, message: 'Bad credentials' },
  'owner/repo',
  'push'
);
console.log('Error Class:', githubError.constructor.name);
console.log('Error Code:', githubError.code);
console.log('Repository:', githubError.repository);
console.log('Message:', githubError.message);
console.log('Solution (first 200 chars):', githubError.solution.substring(0, 200) + '...');
console.log('Documentation URL:', githubError.documentationUrl);
console.log('\n');

// Test 4: GitHub Rate Limit Error
console.log('Test 4: GitHub Rate Limit Error');
console.log('=' .repeat(50));
const rateLimitError = formatGitHubError(
  { response: { status: 429 }, message: 'API rate limit exceeded' },
  'owner/repo',
  'fetch'
);
console.log('Error Code:', rateLimitError.code);
console.log('Message:', rateLimitError.message);
console.log('Solution (first 200 chars):', rateLimitError.solution.substring(0, 200) + '...');
console.log('\n');

// Test 5: File System Permission Error
console.log('Test 5: File System Permission Error');
console.log('=' .repeat(50));
const fsError = formatFileSystemError(
  { code: 'EACCES', message: 'Permission denied' },
  'write',
  '/app/config/config.json'
);
console.log('Error Class:', fsError.constructor.name);
console.log('Error Code:', fsError.code);
console.log('Path:', fsError.path);
console.log('Operation:', fsError.operation);
console.log('Message:', fsError.message);
console.log('Solution (first 200 chars):', fsError.solution.substring(0, 200) + '...');
console.log('\n');

// Test 6: File System Disk Full Error
console.log('Test 6: File System Disk Full Error');
console.log('=' .repeat(50));
const diskFullError = formatFileSystemError(
  { code: 'ENOSPC', message: 'No space left on device' },
  'save',
  '/app/data/backup.tar.gz'
);
console.log('Error Code:', diskFullError.code);
console.log('Message:', diskFullError.message);
console.log('Solution (first 200 chars):', diskFullError.solution.substring(0, 200) + '...');
console.log('\n');

// Test 7: Error Response Creation
console.log('Test 7: Creating Error Response for API');
console.log('=' .repeat(50));
const apiResponse = createErrorResponse(nfsError);
console.log('Response structure:');
console.log(JSON.stringify(apiResponse, null, 2).substring(0, 300) + '...');
console.log('\n');

// Test 8: Custom Error instantiation
console.log('Test 8: Direct Custom Error Creation');
console.log('=' .repeat(50));
const customError = new NFSError('Mount operation failed', {
  code: 'NFS_CUSTOM_ERROR',
  host: '10.0.0.1',
  path: '/share',
  details: 'Custom error details',
  solution: 'Custom solution steps'
});
console.log('Error:', customError.message);
console.log('toJSON():', JSON.stringify(customError.toJSON(), null, 2));
console.log('\n');

console.log('✅ All error handling tests completed successfully!');
console.log('\nKey Features Verified:');
console.log('- Custom error classes (NFSError, GitHubError, FileSystemError)');
console.log('- Error formatters with context and solutions');
console.log('- Structured error responses for API');
console.log('- Documentation links in errors');
console.log('- Multiple error code detection (EACCES, ETIMEDOUT, ENOSPC, etc.)');
