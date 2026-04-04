#!/usr/bin/env bash
set -euo pipefail

log()   { echo "[$(date +'%F %T')] $*"; }
warn()  { echo "[$(date +'%F %T')] WARNING: $*"; }
error() { echo "[$(date +'%F %T')] ERROR: $*" >&2; }

if [[ "${EUID}" -ne 0 ]]; then
  error "Run this script as root: sudo bash bootstrap.sh"
  exit 1
fi

APP_USER="${SUDO_USER:-ubuntu}"

if ! id "${APP_USER}" >/dev/null 2>&1; then
  warn "User '${APP_USER}' does not exist. Falling back to 'ubuntu'."
  APP_USER="ubuntu"
fi

APP_HOME="$(eval echo "~${APP_USER}")"
PROJECTS_DIR="${APP_HOME}/projects"
BASHRC="${APP_HOME}/.bashrc"

export DEBIAN_FRONTEND=noninteractive

log "Starting server bootstrap..."
log "Using app user: ${APP_USER}"
log "User home: ${APP_HOME}"

# ---- Update system ----
log "Updating package lists..."
apt-get update -y

log "Upgrading installed packages..."
apt-get upgrade -y

# ---- Install required packages ----
log "Installing base packages..."
apt-get install -y \
  nginx \
  python3 \
  python3-pip \
  python3-venv \
  git \
  curl \
  ufw \
  certbot \
  python3-certbot-nginx \
  ca-certificates \
  fail2ban \
  unzip \
  htop

# ---- Enable and start services ----
log "Enabling and starting services..."
systemctl enable --now nginx
systemctl enable --now fail2ban

# ---- Firewall ----
log "Configuring UFW firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ---- Create project directory ----
log "Creating projects directory..."
mkdir -p "${PROJECTS_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${PROJECTS_DIR}"

# ---- Ensure bashrc exists ----
touch "${BASHRC}"
chown "${APP_USER}:${APP_USER}" "${BASHRC}"

# ---- Safe aliases ----
log "Adding helpful aliases..."
grep -qxF "alias ip='curl -4 ifconfig.me && echo'" "${BASHRC}" || \
  echo "alias ip='curl -4 ifconfig.me && echo'" >> "${BASHRC}"

grep -qxF "alias projects='cd ~/projects'" "${BASHRC}" || \
  echo "alias projects='cd ~/projects'" >> "${BASHRC}"

grep -qxF "alias ll='ls -alF'" "${BASHRC}" || \
  echo "alias ll='ls -alF'" >> "${BASHRC}"

# ---- Permissions sanity ----
log "Fixing ownership for project directory..."
chown -R "${APP_USER}:${APP_USER}" "${PROJECTS_DIR}"

# ---- Final output ----
log "Bootstrap complete."
echo
echo "=================================================="
echo "Server bootstrap finished successfully."
echo "=================================================="
echo
echo "Installed:"
echo "  - nginx"
echo "  - python3 / pip / venv"
echo "  - git"
echo "  - curl"
echo "  - ufw"
echo "  - certbot + python3-certbot-nginx"
echo "  - ca-certificates"
echo "  - fail2ban"
echo "  - unzip"
echo "  - htop"
echo
echo "Next steps:"
echo "  1. SSH into the server as ${APP_USER}"
echo "  2. Go to ${PROJECTS_DIR}"
echo "  3. Clone your repo"
echo "  4. Create a venv"
echo "  5. Install requirements"
echo "  6. Create a systemd service for the app"
echo "  7. Add an nginx site config"
echo "  8. Point your domain to the server"
echo "  9. Run certbot for HTTPS"
echo
echo "Project directory:"
echo "  ${PROJECTS_DIR}"
echo
echo "Firewall status:"
ufw status
echo
echo "Nginx status:"
systemctl --no-pager --full status nginx | sed -n '1,8p'
echo
echo "Fail2ban status:"
systemctl --no-pager --full status fail2ban | sed -n '1,8p'
echo