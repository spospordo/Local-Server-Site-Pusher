#!/bin/sh
# Docker entrypoint script for Local-Server-Site-Pusher
# Handles permission fixes for volume mounts in container environments like Portainer

set -e

STARTUP_TIME=$(date '+%Y-%m-%d %H:%M:%S')
echo "🚀 Local-Server-Site-Pusher Container Starting... [$STARTUP_TIME]"

# Ensure git is available and properly configured
if command -v git >/dev/null 2>&1; then
    echo "📧 Git is available for GitHub operations"
    
    # Check if persistent git config exists and load it
    if [ -f "/app/config/.gitconfig" ]; then
        echo "📧 Loading persistent git configuration..."
        # The application will handle loading the git config on startup
    else
        echo "📧 No persistent git config found - will use defaults"
    fi
else
    echo "⚠️ Git not available - GitHub upload functionality will be limited"
fi

# Function to check if running as root
is_root() {
    [ "$(id -u)" = "0" ]
}

# Function to fix directory permissions
fix_permissions() {
    local dir="$1"
    local user="$2"
    local group="$3"
    
    if [ -d "$dir" ]; then
        echo "📁 Checking permissions for $dir..."
        
        # Get current ownership
        current_owner=$(stat -c "%u:%g" "$dir" 2>/dev/null || echo "unknown")
        target_owner="${user}:${group}"
        
        if [ "$current_owner" != "$target_owner" ]; then
            echo "🔧 Fixing ownership: $current_owner -> $target_owner"
            chown -R "$user:$group" "$dir" 2>/dev/null || {
                echo "⚠️  Cannot change ownership of $dir (this is normal in some environments)"
                echo "   If you see permission errors, ensure the host directory is owned by UID:GID $user:$group"
                return 1
            }
        else
            echo "✅ Ownership correct for $dir"
        fi
        
        # Ensure directory is writable
        if [ ! -w "$dir" ]; then
            echo "🔧 Making $dir writable..."
            chmod 755 "$dir" 2>/dev/null || {
                echo "⚠️  Cannot make $dir writable"
                return 1
            }
        fi
        
        return 0
    else
        echo "📁 Creating directory $dir..."
        mkdir -p "$dir"
        chown "$user:$group" "$dir" 2>/dev/null || true
        chmod 755 "$dir" 2>/dev/null || true
    fi
}

# Get target user and group (default to node user)
TARGET_USER=${CONTAINER_USER:-node}
TARGET_GROUP=${CONTAINER_GROUP:-node}

# Get UID and GID for the target user
if command -v getent >/dev/null 2>&1; then
    USER_INFO=$(getent passwd "$TARGET_USER" 2>/dev/null || echo "")
    if [ -n "$USER_INFO" ]; then
        TARGET_UID=$(echo "$USER_INFO" | cut -d: -f3)
        TARGET_GID=$(echo "$USER_INFO" | cut -d: -f4)
    else
        TARGET_UID=1000
        TARGET_GID=1000
    fi
else
    TARGET_UID=1000
    TARGET_GID=1000
fi

echo "🔍 Target user: $TARGET_USER (UID: $TARGET_UID, GID: $TARGET_GID)"

# Fix permissions for critical directories if running as root
if is_root; then
    echo "🔑 Running as root, attempting to fix permissions..."
    
    # Fix /app/config permissions
    fix_permissions "/app/config" "$TARGET_UID" "$TARGET_GID" || {
        echo "⚠️  Could not fix /app/config permissions"
        echo "   The application will use in-memory configuration"
    }
    
    # Fix /app/public permissions (optional)
    fix_permissions "/app/public" "$TARGET_UID" "$TARGET_GID" || {
        echo "⚠️  Could not fix /app/public permissions"
    }
    
    # Fix /app/uploads permissions (create if needed for client file persistence)
    fix_permissions "/app/uploads" "$TARGET_UID" "$TARGET_GID" || {
        echo "⚠️  Could not fix /app/uploads permissions"
        echo "   Client file uploads may not persist across deployments"
    }
    
    echo "🔄 Switching to user $TARGET_USER..."
    # Use the built-in su command since we can't rely on external packages
    # Convert arguments to a single command string for su -c
    if [ $# -eq 0 ]; then
        exec su -s /bin/sh "$TARGET_USER"
    else
        # Build the command string properly
        cmd=""
        for arg in "$@"; do
            # Escape quotes and build command string
            escaped_arg=$(printf '%s\n' "$arg" | sed 's/[\\"]/\\&/g')
            if [ -z "$cmd" ]; then
                cmd="\"$escaped_arg\""
            else
                cmd="$cmd \"$escaped_arg\""
            fi
        done
        exec su -s /bin/sh "$TARGET_USER" -c "exec $cmd"
    fi
else
    echo "👤 Running as non-root user ($(id -un))"
    
    # Just check if directories are writable
    for dir in "/app/config" "/app/public" "/app/uploads"; do
        if [ -d "$dir" ] && [ ! -w "$dir" ]; then
            echo "⚠️  $dir is not writable by current user"
            echo "   To fix: docker run --user \"\$(id -u):\$(id -g)\" ..."
            echo "   Or: chown -R \$(id -u):\$(id -g) ./config ./public ./uploads"
        fi
    done
    
    exec "$@"
fi