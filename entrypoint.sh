#!/bin/sh

# Entrypoint script to handle volume permissions and start the application

# Function to check if running as root and switch to node user if needed
check_permissions() {
    # If we're root, we can fix permissions and then switch to node user
    if [ "$(id -u)" = "0" ]; then
        echo "Running as root, fixing permissions and switching to node user..."
        
        # Ensure directories exist with correct permissions
        mkdir -p /app/public /app/config
        chown -R node:node /app/public /app/config
        chmod 755 /app/public /app/config
        
        # Switch to node user using su (available in Alpine by default)
        exec su node -c "cd /app && $*"
    else
        # We're already running as node user
        echo "Running as node user ($(id -u))"
        
        # Check if we can write to config directory
        if [ ! -w /app/config ]; then
            echo "Warning: /app/config is not writable. Config will be stored in memory only."
            echo "To fix this, ensure the mounted config directory has proper permissions:"
            echo "  sudo chown -R \$(id -u):\$(id -g) ./config"
            echo "  or run: docker run --user \$(id -u):\$(id -g) ..."
        fi
        
        # Run the command directly
        exec "$@"
    fi
}

# Handle different ways the container might be run
case "$1" in
    npm|node)
        # Standard npm start or node commands
        check_permissions "$@"
        ;;
    *)
        # Default to npm start if no command specified
        if [ $# -eq 0 ]; then
            check_permissions npm start
        else
            check_permissions "$@"
        fi
        ;;
esac