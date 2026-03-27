#!/usr/bin/env bash
# AirIQ — Fresh Ubuntu AWS instance setup script
# Run as a non-root user with sudo access (e.g. ubuntu on EC2)
# Usage: bash setup.sh

set -euo pipefail

DOMAIN="airiq.ddns.net"
APP_DIR="$HOME/airiq"
BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ─── 1. System packages ───────────────────────────────────────────────────────
info "Updating system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg git certbot

# ─── 2. Docker CE ─────────────────────────────────────────────────────────────
if command -v docker &>/dev/null; then
    success "Docker already installed: $(docker --version)"
else
    info "Installing Docker CE..."
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    success "Docker installed: $(docker --version)"
fi

# Allow current user to run docker without sudo
if ! groups | grep -q docker; then
    info "Adding $USER to the docker group..."
    sudo usermod -aG docker "$USER"
    warn "Group change requires a new shell session. Script will use 'sudo docker' for remaining steps."
    DOCKER="sudo docker"
else
    DOCKER="docker"
fi

# ─── 3. Project code ──────────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
    info "Repo already present at $APP_DIR — pulling latest..."
    git -C "$APP_DIR" pull
elif [ -d "$APP_DIR" ]; then
    warn "$APP_DIR exists but is not a git repo. Assuming code was uploaded manually."
else
    echo ""
    echo "How would you like to get the project code?"
    echo "  1) Clone from a Git repository"
    echo "  2) I will upload it manually via scp (script will wait)"
    read -rp "Choice [1/2]: " CODE_CHOICE

    case "$CODE_CHOICE" in
        1)
            read -rp "Git repository URL: " REPO_URL
            git clone "$REPO_URL" "$APP_DIR"
            success "Repository cloned to $APP_DIR"
            ;;
        2)
            warn "Upload your project now. Run on your local machine:"
            warn "  scp -r ./AirIQ ubuntu@16.16.188.166:~/airiq"
            echo ""
            read -rp "Press ENTER when the files are in place at $APP_DIR..."
            [ -d "$APP_DIR" ] || die "Directory $APP_DIR not found. Upload the project first."
            ;;
        *)
            die "Invalid choice."
            ;;
    esac
fi

cd "$APP_DIR"

# ─── 4. Environment file ──────────────────────────────────────────────────────
ENV_FILE="backend/.env"

if [ -f "$ENV_FILE" ]; then
    success ".env already exists — skipping."
else
    info "Creating backend/.env from .env.example..."
    [ -f "backend/.env.example" ] || die "backend/.env.example not found in $APP_DIR."
    cp backend/.env.example "$ENV_FILE"

    echo ""
    echo "────────────────────────────────────────────────────────────"
    warn "You must fill in backend/.env before the app will start."
    echo "Required values:"
    echo "  DB_HOST, DB_PASSWORD       — your AWS RDS endpoint & password"
    echo "  AIRLY_API, OPEN_AQ         — air quality API keys"
    echo "  IQAIR_API, GOOGLE_API_KEY  — more API keys"
    echo "────────────────────────────────────────────────────────────"
    read -rp "Open backend/.env in nano to edit now? [Y/n]: " EDIT_ENV
    if [[ "${EDIT_ENV:-Y}" =~ ^[Yy]$ ]]; then
        nano "$ENV_FILE"
    else
        warn "Remember to edit backend/.env before running 'docker compose up'."
    fi
fi

# ─── 5. Build images ──────────────────────────────────────────────────────────
info "Building Docker images (this may take a few minutes)..."
$DOCKER compose build

# ─── 6. Start backend only (port 80 must stay free for certbot) ───────────────
info "Starting backend container..."
$DOCKER compose up -d backend

# ─── 7. TLS certificate via Certbot ──────────────────────────────────────────
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

if [ -f "$CERT_PATH" ]; then
    success "Certificate already exists for $DOMAIN — skipping certbot."
else
    info "Obtaining TLS certificate for $DOMAIN..."
    read -rp "Enter your email address for Let's Encrypt notifications: " LE_EMAIL

    sudo certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$LE_EMAIL" \
        -d "$DOMAIN"

    success "Certificate issued for $DOMAIN."
fi

# ─── 8. Start frontend (now that certs exist) ─────────────────────────────────
info "Starting frontend container..."
$DOCKER compose up -d frontend

# ─── 9. Auto-renewal cron job ─────────────────────────────────────────────────
CRON_JOB="0 0,12 * * * certbot renew --quiet && $DOCKER compose -f $APP_DIR/docker-compose.yml restart frontend"
if sudo crontab -l 2>/dev/null | grep -qF "certbot renew"; then
    success "Certbot renewal cron already set."
else
    info "Adding certbot renewal cron job (runs twice daily)..."
    ( sudo crontab -l 2>/dev/null; echo "$CRON_JOB" ) | sudo crontab -
    success "Renewal cron job added."
fi

# ─── 10. Health check ─────────────────────────────────────────────────────────
info "Waiting for backend to become healthy..."
for i in $(seq 1 24); do
    if curl -sf http://localhost:8000/docs > /dev/null 2>&1; then
        success "Backend is up."
        break
    fi
    sleep 5
    [ "$i" -eq 24 ] && warn "Backend did not respond after 2 minutes. Check: docker compose logs backend"
done

echo ""
echo "════════════════════════════════════════════════════════════"
success "AirIQ is running."
echo ""
echo "  Frontend : https://$DOMAIN"
echo "  Backend  : http://localhost:8000/docs  (not public — internal only)"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f          # stream all logs"
echo "    docker compose logs -f backend  # backend only"
echo "    docker compose down             # stop"
echo "    docker compose up -d            # start"
echo "    docker compose up --build -d    # rebuild & start"
echo "    certbot renew --dry-run         # test cert renewal"
echo "════════════════════════════════════════════════════════════"

if ! groups | grep -q docker; then
    echo ""
    warn "Run 'newgrp docker' or start a new SSH session to use docker without sudo."
fi
