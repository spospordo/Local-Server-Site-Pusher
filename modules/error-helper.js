/**
 * Error Helper Module
 * 
 * Provides enhanced error handling utilities with detailed error messages,
 * context information, and potential solutions for common issues.
 */

const logger = require('./logger');

/**
 * Custom error classes for different error types
 */

class GitHubError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'GitHubError';
    this.code = options.code || 'GITHUB_ERROR';
    this.repository = options.repository;
    this.details = options.details;
    this.solution = options.solution;
    this.documentationUrl = options.documentationUrl;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      repository: this.repository,
      details: this.details,
      solution: this.solution,
      documentationUrl: this.documentationUrl
    };
  }
}

class FileSystemError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'FileSystemError';
    this.code = options.code || 'FS_ERROR';
    this.path = options.path;
    this.operation = options.operation;
    this.details = options.details;
    this.solution = options.solution;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      path: this.path,
      operation: this.operation,
      details: this.details,
      solution: this.solution
    };
  }
}

/**
 * Enhanced error message builders
 */

/**
 * Format file system errors with context and solutions
 */
function formatFileSystemError(error, operation, filePath) {
  const errorCode = error.code || 'UNKNOWN';
  const errorMsg = error.message || String(error);
  
  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return new FileSystemError('Permission denied', {
      code: errorCode,
      path: filePath,
      operation,
      details: `Cannot ${operation} ${filePath} due to insufficient permissions`,
      solution: [
        '1. Check file/directory permissions: ls -la ' + (filePath || ''),
        '2. Verify the application has appropriate access rights',
        '3. If running in Docker, check volume mount permissions',
        '4. Ensure the parent directory is writable if creating files',
        '5. Consider using chmod to adjust permissions if appropriate'
      ].join('\n')
    });
  }
  
  if (errorCode === 'ENOENT') {
    return new FileSystemError('File or directory not found', {
      code: errorCode,
      path: filePath,
      operation,
      details: `Cannot ${operation} ${filePath} - path does not exist`,
      solution: [
        '1. Verify the file path is correct',
        '2. Check if parent directories exist',
        '3. Ensure the file was not deleted by another process',
        '4. If expecting a config file, it may need to be created first',
        '5. Check the application logs for the expected path'
      ].join('\n')
    });
  }
  
  if (errorCode === 'ENOSPC') {
    return new FileSystemError('Disk space full', {
      code: errorCode,
      path: filePath,
      operation,
      details: `Cannot ${operation} ${filePath} - no space left on device`,
      solution: [
        '1. Check disk space: df -h',
        '2. Remove unnecessary files to free up space',
        '3. Check for large log files that can be rotated/deleted',
        '4. If using Docker, check container and host disk space',
        '5. Consider expanding storage or moving to larger volume'
      ].join('\n')
    });
  }
  
  if (errorCode === 'EISDIR') {
    return new FileSystemError('Path is a directory', {
      code: errorCode,
      path: filePath,
      operation,
      details: `Cannot ${operation} ${filePath} as a file - it is a directory`,
      solution: [
        '1. Check if you specified the correct path',
        '2. If trying to read/write, ensure path points to a file not a directory',
        '3. Use appropriate directory operations for directories',
        '4. Verify the path construction in your code'
      ].join('\n')
    });
  }
  
  return new FileSystemError('File system operation failed', {
    code: errorCode,
    path: filePath,
    operation,
    details: errorMsg,
    solution: [
      '1. Check the error code and message for specific issues',
      '2. Verify file path and permissions',
      '3. Check system resources (disk space, inodes)',
      '4. Review application logs for additional context'
    ].join('\n')
  });
}

/**
 * Format GitHub operation errors with context and solutions
 */
function formatGitHubError(error, repository, operation) {
  const errorMsg = error.message || String(error);
  const statusCode = error.response?.status;
  
  if (statusCode === 401 || errorMsg.includes('Bad credentials') || errorMsg.includes('authentication')) {
    return new GitHubError('GitHub authentication failed', {
      code: 'GITHUB_AUTH_FAILED',
      repository,
      details: `Authentication to GitHub failed for repository: ${repository}`,
      solution: [
        '1. Verify your GitHub Personal Access Token is correct',
        '2. Check if the token has expired (tokens can have expiration dates)',
        '3. Ensure the token has the required scopes/permissions:',
        '   - "repo" scope for private repositories',
        '   - "public_repo" scope for public repositories',
        '4. Generate a new token if needed: https://github.com/settings/tokens',
        '5. Update the token in Settings > GitHub Configuration'
      ].join('\n'),
      documentationUrl: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token'
    });
  }
  
  if (statusCode === 403) {
    return new GitHubError('GitHub access forbidden', {
      code: 'GITHUB_FORBIDDEN',
      repository,
      details: `Access denied for repository: ${repository}`,
      solution: [
        '1. Verify you have push access to the repository',
        '2. Check if the repository exists and the name is correct',
        '3. Ensure your token has the required scopes/permissions',
        '4. Check if the repository is private and token has "repo" scope',
        '5. Verify branch protection rules are not blocking pushes',
        '6. If using organization repo, ensure your account has appropriate role'
      ].join('\n'),
      documentationUrl: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository'
    });
  }
  
  if (statusCode === 404) {
    return new GitHubError('GitHub repository not found', {
      code: 'GITHUB_NOT_FOUND',
      repository,
      details: `Repository not found: ${repository}`,
      solution: [
        '1. Verify the repository name is correct (owner/repo format)',
        '2. Check if the repository exists: https://github.com/' + (repository || ''),
        '3. Ensure your token has access to the repository (especially for private repos)',
        '4. If repository was renamed, update the configuration with new name',
        '5. Verify you are using the correct GitHub account/organization'
      ].join('\n')
    });
  }
  
  if (errorMsg.includes('rate limit') || statusCode === 429) {
    return new GitHubError('GitHub API rate limit exceeded', {
      code: 'GITHUB_RATE_LIMIT',
      repository,
      details: 'GitHub API rate limit has been exceeded',
      solution: [
        '1. Wait for the rate limit to reset (usually within an hour)',
        '2. Authenticated requests have higher limits - ensure token is configured',
        '3. Check rate limit status: https://docs.github.com/en/rest/rate-limit',
        '4. Consider reducing the frequency of operations',
        '5. For high-volume usage, review GitHub API rate limit documentation'
      ].join('\n'),
      documentationUrl: 'https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting'
    });
  }
  
  if (errorMsg.includes('large') || errorMsg.includes('size') || statusCode === 413) {
    return new GitHubError('File too large for GitHub', {
      code: 'GITHUB_FILE_TOO_LARGE',
      repository,
      details: 'File exceeds GitHub size limits',
      solution: [
        '1. GitHub has a 100MB file size limit and 1GB repository size warning',
        '2. Consider using Git LFS for large files: https://git-lfs.github.com/',
        '3. Compress large files if possible',
        '4. Split large files into smaller chunks',
        '5. Use .gitignore to exclude large build artifacts or media files',
        '6. Review what files are being committed and remove unnecessary large files'
      ].join('\n'),
      documentationUrl: 'https://docs.github.com/en/repositories/working-with-files/managing-large-files'
    });
  }
  
  return new GitHubError(`GitHub ${operation} failed`, {
    code: 'GITHUB_OPERATION_FAILED',
    repository,
    details: errorMsg,
    solution: [
      '1. Check the error message above for specific details',
      '2. Verify repository name and access permissions',
      '3. Check your internet connection and GitHub status',
      '4. Review GitHub status page: https://www.githubstatus.com/',
      '5. Check application logs for additional context'
    ].join('\n'),
    documentationUrl: 'https://docs.github.com/en/rest'
  });
}

/**
 * Log error with enhanced context
 */
function logError(category, error, context = {}) {
  let errorDetails = {
    message: error.message || String(error),
    code: error.code,
    ...context
  };
  
  // Format error message with context
  let logMessage = error.message || String(error);
  
  if (error instanceof GitHubError || error instanceof FileSystemError) {
    // Custom error classes have structured information
    const errorData = error.toJSON();
    if (errorData.details) {
      logMessage += `\nDetails: ${errorData.details}`;
    }
    if (errorData.solution) {
      logMessage += `\nSolution:\n${errorData.solution}`;
    }
    if (errorData.documentationUrl) {
      logMessage += `\nDocumentation: ${errorData.documentationUrl}`;
    }
  } else if (context.operation) {
    logMessage = `${context.operation} failed: ${logMessage}`;
  }
  
  logger.error(category, logMessage);
  
  return errorDetails;
}

/**
 * Create error response with enhanced information
 */
function createErrorResponse(error, includeStack = false) {
  if (error instanceof GitHubError || error instanceof FileSystemError) {
    const response = error.toJSON();
    if (includeStack && error.stack) {
      response.stack = error.stack;
    }
    return response;
  }
  
  // Standard error
  const response = {
    error: error.message || String(error)
  };
  
  if (error.code) {
    response.code = error.code;
  }
  
  if (includeStack && error.stack) {
    response.stack = error.stack;
  }
  
  return response;
}

module.exports = {
  // Error classes
  GitHubError,
  FileSystemError,
  
  // Formatters
  formatFileSystemError,
  formatGitHubError,
  
  // Utilities
  logError,
  createErrorResponse
};
