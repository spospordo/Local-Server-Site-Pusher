FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create public and config directories with proper permissions
RUN mkdir -p /app/public /app/config && \
    chown -R node:node /app && \
    chmod 755 /app/public /app/config

# Create entrypoint script to handle volume permissions
COPY --chown=node:node entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Note: We don't switch to node user here - let entrypoint handle it
# This allows the container to fix volume permissions if running as root

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/status || exit 1

# Start the application
CMD ["entrypoint.sh"]