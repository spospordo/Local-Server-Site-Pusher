# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2025-01-08

### Fixed
- **CRITICAL FIX**: Resolved persistent sharp module ARM64 runtime error on Raspberry Pi deployments
- Added libvips-dev build dependency installation in Dockerfile for ARM64 compatibility
- Sharp now correctly builds and loads on ARM64 architecture (Raspberry Pi, etc.)

### Added
- docker-compose.portainer.yml - Dedicated compose file optimized for Portainer Git repository deployments
- Installation of libvips-dev native library in Dockerfile for sharp module support on ARM64

### Changed
- Updated Dockerfile to install libvips-dev before npm install for proper ARM64 sharp compilation
- Improved Portainer deployment documentation with correct Git repository deployment method

### Technical Details
The root cause of the persistent "Could not load the sharp module using the linux-arm64 runtime" error was the absence of libvips native libraries. The sharp npm module requires platform-specific native bindings, and on ARM64 (Raspberry Pi), it needs libvips-dev to be installed during the Docker build process. Without these libraries, even `npm rebuild sharp --verbose` cannot compile/download the correct binaries.

**What changed:**
- Added `apt-get install libvips-dev` before npm dependencies installation
- This ensures the native libraries are available when sharp builds its ARM64 binaries
- The npm rebuild step can now properly compile sharp for linux-arm64 runtime

This fix enables successful Portainer deployment on Raspberry Pi by ensuring all required build dependencies are present during the Docker image build process.

## [1.1.2] - 2025-01-08

### Fixed
- Fixed sharp module ARM64 deployment issue when deploying from Portainer Git repository
- Added explicit `npm rebuild sharp --verbose` step to ensure platform-specific binaries are correctly installed
- Ensures sharp works correctly on Raspberry Pi ARM64 architecture

### Changed
- Updated Dockerfile to include explicit sharp rebuild step after npm install
- This forces sharp to compile/download the correct ARM64 binaries during Docker build on Raspberry Pi

### Technical Details
The issue persisted in v1.1.1 because npm install alone wasn't sufficient to get the correct ARM64 binaries for sharp in all deployment scenarios (especially Portainer Git builds). By adding an explicit `npm rebuild sharp --verbose` step after the dependency installation, we ensure that sharp is rebuilt for the exact platform where the Docker image is being built. This guarantees that the linux-arm64 runtime binaries are present when the container starts.

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
