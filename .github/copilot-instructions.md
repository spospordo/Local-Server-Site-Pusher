# Local-Server-Site-Pusher

A container-based system to run custom server code for building websites and pushing content out to the web or self-hosted sites.

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Project Status

**IMPORTANT**: This repository is in early development stage. The core implementation does not exist yet - only basic project files (README.md, LICENSE) are present.

## Working Effectively

### Initial Repository State
- Repository contains only foundational files: README.md and LICENSE
- No build system, dependencies, or implementation code exists yet
- Project goal: Create a containerized system for website building and deployment

### Expected Technology Stack (To Be Implemented)
Based on the project description, expect the following technologies:
- **Containers**: Docker/Podman for containerized execution
- **Web Technologies**: Likely Node.js, Python, or Go for server implementation
- **Build Systems**: To be determined (npm, make, or language-specific tools)
- **Deployment**: Integration with web hosting and self-hosted solutions

### Development Setup (Future Implementation)
Until implementation begins, these are placeholder instructions for expected patterns:

```bash
# Expected future commands (NOT YET AVAILABLE):
# git clone <repository>
# cd Local-Server-Site-Pusher
# docker build -t local-server-site-pusher .
# docker run -p 8080:8080 local-server-site-pusher
```

**CRITICAL**: Do not attempt to run build commands yet - no implementation exists.

## Validation Scenarios (To Be Implemented)

When implementation is added, always test these scenarios after making changes:

### Container Functionality
- Build the container image successfully
- Run the container without errors
- Verify server starts and listens on expected port
- Test container can access mounted volumes for site content

### Website Building Workflow
- Create a sample website source directory
- Execute build process within container
- Verify output website is generated correctly
- Test deployment to mock/test destination

### Integration Testing
- Mount source code directory to container
- Build a simple static site (HTML/CSS/JS)
- Verify built site is accessible via HTTP
- Test push/deployment functionality to target destination

## Common Tasks

### Current Repository Structure
```
.
├── .github/
│   └── copilot-instructions.md    (this file)
├── LICENSE                        (MIT License)
├── README.md                      (Basic project description)
└── .git/                          (Git repository)
```

### Key Files to Monitor
- **README.md**: Project overview and basic description
- **LICENSE**: MIT License for the project
- **Future files to watch for**:
  - `Dockerfile` or `Containerfile` for container definition
  - `package.json`, `requirements.txt`, or `go.mod` for dependencies
  - `docker-compose.yml` for multi-container setup
  - Build scripts (`build.sh`, `Makefile`, etc.)
  - Configuration files for web server and deployment

## Future Development Guidelines

### When Adding Implementation
1. **Choose Technology Stack**: Decide on primary language (Node.js, Python, Go, etc.)
2. **Add Container Definition**: Create Dockerfile with appropriate base image
3. **Implement Core Server**: Basic HTTP server to handle build requests
4. **Add Build Pipeline**: System to process website source code
5. **Implement Deployment**: Integration with hosting providers or self-hosted solutions

### Expected Build Process (To Be Defined)
- **NEVER CANCEL**: Container builds may take 5-10 minutes initially. Set timeout to 15+ minutes.
- **NEVER CANCEL**: Website builds may take 2-5 minutes per site. Set timeout to 10+ minutes.
- **NEVER CANCEL**: Integration tests may take 5-15 minutes. Set timeout to 30+ minutes.

### Validation Requirements
When implementation exists:
- Always test with sample website source
- Verify container starts without errors
- Test HTTP endpoints respond correctly
- Validate output website is properly generated
- Test deployment process with mock destination

## Security Considerations
- Container should run with non-root user
- Validate and sanitize all input source code
- Secure handling of deployment credentials
- Proper isolation between build environments

## Performance Expectations
- Container startup: < 30 seconds
- Small website build: < 2 minutes
- Large website build: < 10 minutes
- Deployment process: < 5 minutes

## Troubleshooting
Since no implementation exists yet, common issues will be:
- "Command not found" errors: Expected until implementation is added
- Missing dependencies: Add package management files first
- Container build failures: Create Dockerfile first
- Port binding issues: Implement HTTP server first

## Next Steps for Contributors
1. Define the technology stack and create package management files
2. Create Dockerfile for containerization
3. Implement basic HTTP server for handling requests
4. Add website building logic
5. Integrate deployment mechanisms
6. Add comprehensive testing
7. Update these instructions with actual build/test commands

**Remember**: This project is in planning/early development phase. Focus on establishing the foundation before optimizing performance or adding advanced features.