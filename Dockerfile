FROM node:20

# Set working directory
WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies including optional ones for platform-specific binaries (e.g., sharp for ARM64)
# Try npm ci first (faster), but fall back to npm install for better platform compatibility
# The --include=optional is critical for sharp's platform-specific binaries
RUN npm ci --include=optional || npm install --include=optional

# Explicitly rebuild sharp for the current platform architecture
# This ensures ARM64 binaries are correctly installed when building on Raspberry Pi
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