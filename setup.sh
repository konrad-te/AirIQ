#!/bin/bash
# AirIQ — AWS Ubuntu instance setup script
# Usage: bash setup.sh

DOMAIN="airiq.ddns.net"
APP_DIR="$HOME/airiq"

set -e

# ─── 1. System packages ───────────────────────────────────────────────────────
echo "--- 1. Installing system packages ---"
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl gnupg git certbot

# Node.js 22 (needed to build the React frontend)
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "✅ Node $(node --version), npm $(npm --version)"

# ─── 2. Docker CE ─────────────────────────────────────────────────────────────
echo "--- 2. Installing Docker ---"
if ! command -v docker &>/dev/null; then
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
    sudo usermod -aG docker $USER
fi
echo "✅ $(docker --version)"

# ─── 3. Project code ──────────────────────────────────────────────────────────
echo "--- 3. Project code ---"
if [ -d "$APP_DIR/.git" ]; then
    echo "Repo found — pulling latest..."
    git -C "$APP_DIR" pull
elif [ -d "$APP_DIR" ]; then
    echo "✅ Project folder found at $APP_DIR"
else
    echo "Project not found at $APP_DIR."
    echo "Upload it first with:"
    echo "  scp -r ./AirIQ ubuntu@16.16.188.166:~/airiq"
    exit 1
fi

cd "$APP_DIR"

# ─── 4. Environment file ──────────────────────────────────────────────────────
echo "--- 4. Environment file ---"
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    echo ""
    echo "⚠️  backend/.env needs your real credentials:"
    echo "     DB_HOST, DB_PASSWORD, AIRLY_API, OPEN_AQ, IQAIR_API, GOOGLE_API_KEY"
    read -rp "Open in nano now? [Y/n]: " EDIT_ENV
    if [[ "${EDIT_ENV:-Y}" =~ ^[Yy]$ ]]; then
        nano backend/.env
    fi
else
    echo "✅ backend/.env already exists"
fi

# ─── 5. Build frontend on the host ────────────────────────────────────────────
echo "--- 5. Building frontend ---"
cd "$APP_DIR/frontend2.0"
npm ci
npm run build
cd "$APP_DIR"
echo "✅ Frontend built → frontend2.0/dist/"

# ─── 6. TLS certificate ───────────────────────────────────────────────────────
echo "--- 6. TLS certificate ---"
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "✅ Certificate already exists for $DOMAIN"
else
    read -rp "Email for Let's Encrypt notifications: " LE_EMAIL
    sudo certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email "$LE_EMAIL" \
        -d "$DOMAIN"
    echo "✅ Certificate issued for $DOMAIN"
fi

# ─── 7. Start Docker containers ───────────────────────────────────────────────
echo "--- 7. Starting Docker containers ---"
sudo docker compose down 2>/dev/null || true
sudo docker compose up -d --build
echo "✅ Containers started"

# ─── 8. Aliases ───────────────────────────────────────────────────────────────
echo "--- 8. Setting up aliases ---"
sed -i '/alias appstatus/d' ~/.bashrc
sed -i '/alias applogs/d' ~/.bashrc
sed -i '/alias apprestart/d' ~/.bashrc
echo "alias appstatus='sudo docker compose -f $APP_DIR/docker-compose.yml ps'" >> ~/.bashrc
echo "alias applogs='sudo docker compose -f $APP_DIR/docker-compose.yml logs -f'" >> ~/.bashrc
echo "alias apprestart='sudo docker compose -f $APP_DIR/docker-compose.yml restart'" >> ~/.bashrc

# ─── 9. Cert renewal cron ─────────────────────────────────────────────────────
echo "--- 9. Cert renewal cron ---"
CRON_JOB="0 0,12 * * * certbot renew --quiet && sudo docker compose -f $APP_DIR/docker-compose.yml exec nginx nginx -s reload"
if sudo crontab -l 2>/dev/null | grep -qF "certbot renew"; then
    echo "✅ Renewal cron already set"
else
    ( sudo crontab -l 2>/dev/null; echo "$CRON_JOB" ) | sudo crontab -
    echo "✅ Renewal cron added"
fi

# ─── 10. Verify ───────────────────────────────────────────────────────────────
echo "--- 10. Verification ---"
sleep 5
if sudo docker compose ps | grep -q "Up"; then
    echo "===================================================="
    echo "  ✅ AirIQ is running!"
    echo ""
    echo "  https://$DOMAIN"
    echo ""
    echo "  Run 'source ~/.bashrc' to use aliases:"
    echo "    appstatus   — container status"
    echo "    applogs     — stream logs"
    echo "    apprestart  — restart all containers"
    echo "===================================================="
else
    echo "❌ Something went wrong. Check logs:"
    echo "   sudo docker compose logs"
fi
