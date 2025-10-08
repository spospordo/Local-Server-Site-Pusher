FROM node:20

# Set working directory
WORKDIR /app

# Install build dependencies for sharp (especially needed for ARM64)
# libvips-dev provides the native libraries that sharp requires
RUN apt-get update && apt-get install -y \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files (package-lock.json is excluded via .dockerignore to avoid platform conflicts)
COPY package*.json ./

# Install dependencies - will use npm install since package-lock.json is excluded
# The --include=optional is critical for sharp's platform-specific binaries
# This ensures correct ARM64 binaries on Raspberry Pi
RUN npm install --include=optional

# Rebuild sharp to ensure correct platform binaries are compiled
# Essential for ARM64 Raspberry Pi deployments  
RUN npm rebuild sharp --verbose

# Copy application files
COPY . .

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create directories and set ownership
RUN mkdir -p /app/public /app/config && \
    chown -R node:node /app && \
    chmod 755 /app/public /app/config

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/status || exit 1

# Set entrypoint to handle permissions
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the application
CMD ["npm", "start"]