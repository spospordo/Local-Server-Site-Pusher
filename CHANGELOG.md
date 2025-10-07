# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2025-01-07

### Fixed
- Fixed sharp module ARM64 compatibility when deploying via Portainer from Git repository
- Added `node_modules` to `.dockerignore` to prevent build context conflicts
- Improved npm install fallback logic: `npm ci || npm install` for better platform compatibility

### Changed
- Updated Dockerfile to use `npm ci || npm install --include=optional` for more robust dependency installation
- Enhanced PORTAINER.md with ARM64-specific troubleshooting guide
- Updated DEPLOYMENT.md and SHARP_ARM64_FIX.md with clearer ARM64 build instructions

### Documentation
- Added detailed troubleshooting section for "Could not load sharp module using linux-arm64 runtime" error
- Clarified that ARM64 users must build images on ARM64 devices or use ARM64-specific image tags
- Added note about Docker build cache clearing for Raspberry Pi deployments

## [1.1.0] - 2025-01-07

### Fixed
- Fixed sharp module ARM64 runtime loading issue on Raspberry Pi
- Removed `--omit=dev` flag from npm install in Dockerfile to ensure all optional dependencies are properly installed
- Removed redundant `npm rebuild sharp` command that was ineffective

### Changed
- Updated npm ci to use `--include=optional` only for better compatibility with platform-specific binaries
- Updated DEPLOYMENT.md to reflect the fix for ARM64 compatibility

### Technical Details
The issue was caused by `--omit=dev` flag preventing npm from properly installing platform-specific optional dependencies for sharp. By removing this flag and keeping `--include=optional`, npm correctly installs the linux-arm64 native bindings for sharp during the Docker build process.

## [1.0.3] - Previous Version
- Previous stable release
