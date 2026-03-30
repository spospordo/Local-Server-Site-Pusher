#!/usr/bin/env bash
# install.sh – Install or update the Mirror Daemon on a Raspberry Pi
#
# Usage:
#   sudo bash install.sh
#
# What it does:
#   1. Installs Node.js if not already present (>= 18)
#   2. Copies daemon files to /home/pi/mirror-daemon/
#   3. Creates daemon-config.json from the template if it does not exist
#      (credentials are NEVER overwritten)
#   4. Installs the systemd service
#   5. Configures sudoers for display/reboot/shutdown commands
#   6. Enables and (re)starts the service

set -euo pipefail

DAEMON_USER="${DAEMON_USER:-pi}"
INSTALL_DIR="/home/${DAEMON_USER}/mirror-daemon"
SERVICE_NAME="mirror-daemon"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIN_NODE_MAJOR=18

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

info()    { echo "ℹ️   $*"; }
success() { echo "✅  $*"; }
warn()    { echo "⚠️   $*"; }
error()   { echo "❌  $*" >&2; exit 1; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (use sudo)."
  fi
}

# ---------------------------------------------------------------------------
# Node.js version check / install
# ---------------------------------------------------------------------------

ensure_node() {
  if command -v node &>/dev/null; then
    local ver
    ver=$(node --version | sed 's/v//' | cut -d. -f1)
    if [[ $ver -ge $MIN_NODE_MAJOR ]]; then
      success "Node.js $(node --version) is already installed."
      return
    fi
    warn "Node.js $(node --version) is below minimum v${MIN_NODE_MAJOR}. Upgrading…"
  fi

  info "Installing Node.js v${MIN_NODE_MAJOR} via NodeSource…"
  curl -fsSL "https://deb.nodesource.com/setup_${MIN_NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
  success "Node.js $(node --version) installed."
}

# ---------------------------------------------------------------------------
# Copy daemon files
# ---------------------------------------------------------------------------

install_files() {
  info "Creating install directory: ${INSTALL_DIR}"
  mkdir -p "${INSTALL_DIR}"
  chown "${DAEMON_USER}:${DAEMON_USER}" "${INSTALL_DIR}"

  # Copy daemon script
  cp "${SCRIPT_DIR}/mirror-daemon.js" "${INSTALL_DIR}/mirror-daemon.js"
  chown "${DAEMON_USER}:${DAEMON_USER}" "${INSTALL_DIR}/mirror-daemon.js"
  chmod 755 "${INSTALL_DIR}/mirror-daemon.js"

  # Copy template (never overwrites existing config)
  cp "${SCRIPT_DIR}/daemon-config.template.json" "${INSTALL_DIR}/daemon-config.template.json"
  chown "${DAEMON_USER}:${DAEMON_USER}" "${INSTALL_DIR}/daemon-config.template.json"

  # Only create config if it does not already exist (preserves credentials on update)
  if [[ ! -f "${INSTALL_DIR}/daemon-config.json" ]]; then
    cp "${SCRIPT_DIR}/daemon-config.template.json" "${INSTALL_DIR}/daemon-config.json"
    chown "${DAEMON_USER}:${DAEMON_USER}" "${INSTALL_DIR}/daemon-config.json"
    chmod 600 "${INSTALL_DIR}/daemon-config.json"
    warn "daemon-config.json created from template. Edit it before starting the service:"
    warn "  sudo nano ${INSTALL_DIR}/daemon-config.json"
  else
    success "daemon-config.json already exists – credentials preserved."
  fi

  # Create logs directory
  mkdir -p "${INSTALL_DIR}/logs"
  chown "${DAEMON_USER}:${DAEMON_USER}" "${INSTALL_DIR}/logs"

  success "Daemon files installed to ${INSTALL_DIR}."
}

# ---------------------------------------------------------------------------
# Sudoers entry
# ---------------------------------------------------------------------------

configure_sudoers() {
  local SUDOERS_FILE="/etc/sudoers.d/mirror-daemon"
  if [[ ! -f "${SUDOERS_FILE}" ]]; then
    info "Configuring sudoers for display/reboot/shutdown commands…"
    cat > "${SUDOERS_FILE}" <<SUDOERS
# Allow mirror-daemon to run display control, reboot, and shutdown without a password
${DAEMON_USER} ALL=(ALL) NOPASSWD: /sbin/reboot, /sbin/shutdown, /usr/bin/vcgencmd display_power 0, /usr/bin/vcgencmd display_power 1
SUDOERS
    chmod 440 "${SUDOERS_FILE}"
    success "Sudoers entry created: ${SUDOERS_FILE}"
  else
    success "Sudoers entry already exists: ${SUDOERS_FILE}"
  fi
}

# ---------------------------------------------------------------------------
# Systemd service
# ---------------------------------------------------------------------------

install_service() {
  info "Installing systemd service…"

  # Patch the service file to use the correct user and install dir
  sed \
    -e "s|User=pi|User=${DAEMON_USER}|g" \
    -e "s|/home/pi/mirror-daemon|${INSTALL_DIR}|g" \
    "${SCRIPT_DIR}/mirror-daemon.service" \
    > "/etc/systemd/system/${SERVICE_NAME}.service"

  chmod 644 "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  success "Systemd service ${SERVICE_NAME} installed and enabled."
}

# ---------------------------------------------------------------------------
# Start / restart service
# ---------------------------------------------------------------------------

start_service() {
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    info "Restarting ${SERVICE_NAME}…"
    systemctl restart "${SERVICE_NAME}"
  else
    info "Starting ${SERVICE_NAME}…"
    systemctl start "${SERVICE_NAME}"
  fi
  sleep 2
  if systemctl is-active --quiet "${SERVICE_NAME}"; then
    success "${SERVICE_NAME} is running."
  else
    warn "${SERVICE_NAME} failed to start. Check logs with: journalctl -u ${SERVICE_NAME} -n 50"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

require_root
info "=== Mirror Daemon Installer v1.0.0 ==="
ensure_node
install_files
configure_sudoers
install_service
start_service

echo ""
success "Installation complete!"
echo ""
echo "Next steps:"
echo "  1. Edit your config:  sudo nano ${INSTALL_DIR}/daemon-config.json"
echo "  2. Set serverUrl and deviceToken (from the admin dashboard Device Registration)."
echo "  3. Restart the service:  sudo systemctl restart ${SERVICE_NAME}"
echo "  4. View logs:  journalctl -u ${SERVICE_NAME} -f"
