#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────
#  n8n Enterprise Control Platform — One-Shot Installer
#  Usage: curl -fsSL https://raw.githubusercontent.com/7020227649/n8n-enterprise-stack/main/install.sh | sudo bash
# ─────────────────────────────────────────────────────────

REPO_URL="https://github.com/7020227649/n8n-enterprise-stack.git"
INSTALL_DIR="/opt/n8n-enterprise-stack"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  🚀 n8n Enterprise Control Platform Installer   ║${NC}"
  echo -e "${CYAN}║     Telegram-Controlled n8n Infrastructure      ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
}

log() { echo -e "  ${GREEN}[✔]${NC} $1"; }
warn() { echo -e "  ${YELLOW}[!]${NC} $1"; }
err() { echo -e "  ${RED}[✖]${NC} $1"; exit 1; }

# ─── Check root ───────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Please run as root: curl -fsSL ... | sudo bash"
fi

banner

# ─── Step 1: Install Docker ──────────────────────────
echo -e "${BOLD}Step 1/6: Checking Docker...${NC}"

if ! command -v docker &> /dev/null; then
  warn "Docker not found. Installing..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  log "Docker installed."
else
  log "Docker already installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
fi

if ! docker compose version &> /dev/null; then
  warn "Docker Compose plugin not found. Installing..."
  apt-get update -y && apt-get install -y docker-compose-plugin
  log "Docker Compose installed."
else
  log "Docker Compose available."
fi

# ─── Step 2: Install Git ─────────────────────────────
echo ""
echo -e "${BOLD}Step 2/6: Checking Git...${NC}"

if ! command -v git &> /dev/null; then
  apt-get update -y && apt-get install -y git
  log "Git installed."
else
  log "Git already installed."
fi

# ─── Step 3: Clone Repository ────────────────────────
echo ""
echo -e "${BOLD}Step 3/6: Cloning repository...${NC}"

if [ -d "$INSTALL_DIR" ]; then
  warn "Directory $INSTALL_DIR exists. Pulling latest..."
  cd "$INSTALL_DIR"
  git pull origin main || true
else
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

log "Repository ready at $INSTALL_DIR"

# ─── Step 4: Configure ───────────────────────────────
echo ""
echo -e "${BOLD}Step 4/6: Configuration${NC}"
echo ""

if [ -f .env ]; then
  echo -e "  ${YELLOW}Existing .env found. Overwrite? (y/N):${NC}"
  read -r OVERWRITE
  if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
    log "Keeping existing .env"
    SKIP_ENV=true
  else
    rm .env
  fi
fi

if [ "${SKIP_ENV}" != "true" ]; then
  echo -e "  ${CYAN}Telegram Bot Token${NC}"
  echo -e "  ${YELLOW}(Get from @BotFather on Telegram)${NC}"
  read -p "  → BOT_TOKEN: " BOT_TOKEN

  echo ""
  echo -e "  ${CYAN}Telegram User ID${NC}"
  echo -e "  ${YELLOW}(Get from @userinfobot on Telegram)${NC}"
  read -p "  → ADMIN_ID: " ADMIN_ID

  if [ -z "$BOT_TOKEN" ] || [ -z "$ADMIN_ID" ]; then
    err "BOT_TOKEN and ADMIN_ID are required!"
  fi

  # Auto-generate secure passwords
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  N8N_PASS=$(openssl rand -hex 12)

  cat > .env <<EOF
BOT_TOKEN=$BOT_TOKEN
ADMIN_ID=$ADMIN_ID
N8N_USER=admin
N8N_PASS=$N8N_PASS
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
N8N_VERSION=latest
EOF

  log ".env created with auto-generated secure passwords."
fi

# ─── Step 5: Domain & SSL (Optional) ─────────────────
echo ""
echo -e "${BOLD}Step 5/6: Domain & SSL Setup${NC}"
echo ""
echo -e "  Do you want to connect a custom domain with free SSL?"
echo -e "  ${YELLOW}(Your domain's A record must point to this server's IP)${NC}"
echo ""
read -p "  → Enter domain (or press Enter to skip): " DOMAIN

if [ -n "$DOMAIN" ]; then
  echo ""
  read -p "  → Email for SSL certificate: " SSL_EMAIL

  if [ -z "$SSL_EMAIL" ]; then
    err "Email is required for SSL certificate."
  fi

  # Install Nginx & Certbot
  log "Installing Nginx & Certbot..."
  apt-get update -y
  apt-get install -y nginx certbot python3-certbot-nginx
  systemctl enable nginx
  systemctl start nginx

  # Create Nginx config
  cat > /etc/nginx/sites-available/n8n <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 50M;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default

  # Test and reload
  nginx -t
  systemctl reload nginx

  log "Nginx configured for ${DOMAIN}"

  # Get SSL certificate
  log "Obtaining SSL certificate..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect

  log "SSL certificate installed! ✨"
  DOMAIN_CONFIGURED=true
else
  warn "Skipped domain setup. n8n accessible via IP:5678"
fi

# ─── Step 6: Deploy ──────────────────────────────────
echo ""
echo -e "${BOLD}Step 6/6: Deploying with Docker Compose...${NC}"
echo ""

cd "$INSTALL_DIR"
docker compose up -d --build

# ─── Done! ────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo 'your-server-ip')
N8N_PASS_DISPLAY=${N8N_PASS:-$(grep N8N_PASS .env 2>/dev/null | cut -d'=' -f2)}

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         🎉 INSTALLATION COMPLETE! 🎉            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DOMAIN_CONFIGURED" = "true" ]; then
  echo -e "  ${CYAN}n8n Web UI:${NC}    ${GREEN}https://${DOMAIN}${NC}"
else
  echo -e "  ${CYAN}n8n Web UI:${NC}    http://${SERVER_IP}:5678"
fi

echo -e "  ${CYAN}n8n Login:${NC}     admin / ${N8N_PASS_DISPLAY}"
echo -e "  ${CYAN}Telegram Bot:${NC}  Open Telegram → send /start to your bot"
echo ""

if [ "$DOMAIN_CONFIGURED" = "true" ]; then
  echo -e "  ${GREEN}🔒 SSL:${NC}        Enabled (auto-renews via Certbot)"
fi

echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "    cd /opt/n8n-enterprise-stack"
echo -e "    docker compose logs bot -f       # Bot logs"
echo -e "    docker compose logs n8n-main -f  # n8n logs"
echo -e "    docker compose ps                # Container status"
echo ""
echo -e "  ${YELLOW}⚠️  Save your n8n password: ${N8N_PASS_DISPLAY}${NC}"
echo ""
