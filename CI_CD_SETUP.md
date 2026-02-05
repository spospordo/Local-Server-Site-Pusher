# CI/CD Setup and Configuration

This document describes the CI/CD workflows for the Local-Server-Site-Pusher project.

## GitHub Actions Workflows

### 1. Build and Test Workflow (`build.yml`)

**Trigger:** Push or Pull Request to `main` or `develop` branches

**Purpose:** Validate code changes through automated testing and Docker builds

**Jobs:**
- **build**: Tests the application with Node.js 18 and 20
  - Installs dependencies
  - Runs security audit
  - Tests server startup
  - Validates configuration
  
- **docker-build**: Builds and tests Docker container
  - Builds Docker image for multiple platforms
  - Tests container startup and health check
  - Uses Docker layer caching for faster builds

### 2. Deploy Workflow (`deploy.yml`)

**Trigger:** 
- Push of version tags (e.g., `v2.6.12`)
- Manual workflow dispatch

**Purpose:** Build and publish multi-architecture Docker images to Docker Hub

**Features:**
- Multi-platform support (linux/amd64, linux/arm64)
- Automatic versioning from git tags
- Docker Hub description updates
- Layer caching for faster builds

**Required Secrets:**
- `DOCKER_USERNAME`: Docker Hub username
- `DOCKER_PASSWORD`: Docker Hub password or access token

### 3. Version Bump Workflow (`version-bump.yml`)

**Trigger:** Push to `main` branch

**Purpose:** Automatically increment version based on commit messages

See [VERSIONING.md](VERSIONING.md) for commit message conventions.

## Setting Up CI/CD

### Prerequisites

1. **Docker Hub Account** (for deploy workflow)
   - Create account at https://hub.docker.com
   - Generate access token in Account Settings → Security

2. **GitHub Repository Secrets**
   - Go to Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `DOCKER_USERNAME`: Your Docker Hub username
     - `DOCKER_PASSWORD`: Your Docker Hub access token

### Local Testing

Before pushing changes, test locally:

```bash
# Install dependencies
npm install

# Run security audit
npm audit

# Test server startup
npm start
# In another terminal:
curl http://localhost:3000/api/status

# Build Docker image
docker build -t local-server-site-pusher:test .

# Test Docker container
docker run -d --name test-container -p 3000:3000 local-server-site-pusher:test
sleep 10
curl http://localhost:3000/api/status
docker stop test-container && docker rm test-container
```

### Running Tests

```bash
# Run single test
# Run tests
npm test
```

## Workflow Status

Check workflow status:
- Build status: ![Build](https://github.com/spospordo/Local-Server-Site-Pusher/workflows/Build%20and%20Test/badge.svg)
- Deploy status: ![Deploy](https://github.com/spospordo/Local-Server-Site-Pusher/workflows/Build%20and%20Deploy%20Docker%20Image/badge.svg)

## Troubleshooting

### Build Failures

1. **Dependency Issues**
   - Check if `package-lock.json` is up to date
   - Try `npm ci` locally to reproduce
   - Run `npm audit` to check for vulnerabilities

2. **Docker Build Failures**
   - Ensure Dockerfile is valid
   - Check if all required files are included (not in .dockerignore)
   - Test build locally: `docker build -t test .`

3. **Node Version Mismatch**
   - Ensure Dockerfile Node version matches workflow
   - Current setup: Node 20 in Dockerfile, tests with Node 18 and 20

### Deploy Failures

1. **Authentication Errors**
   - Verify DOCKER_USERNAME and DOCKER_PASSWORD secrets are set
   - Regenerate Docker Hub access token if needed

2. **Multi-platform Build Issues**
   - ARM64 builds require QEMU emulation (handled automatically)
   - May take longer than single-platform builds

3. **Tag Issues**
   - Ensure version tags follow semver format: `v1.2.3`
   - Check that tag was created properly: `git tag -l`

## Database Configuration

The application requires the following environment variables for database connectivity:

- **Development/Testing**: Uses in-memory or file-based storage (no external DB required)
- **Production**: Set these environment variables in your deployment:
  - `DB_HOST`: Database host (if using external database)
  - `DB_PORT`: Database port
  - `DB_NAME`: Database name
  - `DB_USER`: Database username
  - `DB_PASSWORD`: Database password

For Docker deployments, pass environment variables via docker-compose.yml or docker run:

```yaml
# docker-compose.yml
environment:
  - DB_HOST=postgres
  - DB_PORT=5432
  - DB_NAME=smartmirror
  - DB_USER=user
  - DB_PASSWORD=password
```

## Security

- All secrets are stored in GitHub Secrets (never in code)
- Dependencies are audited on every build
- Docker images are scanned for vulnerabilities
- Multi-factor authentication recommended for Docker Hub

## Continuous Improvement

- Monitor workflow execution times
- Review and update dependencies regularly
- Add new tests as features are added
- Keep workflows up to date with latest GitHub Actions versions
