#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────
#  n8n Enterprise Control Platform — One-Shot Installer
#  Usage: curl -fsSL https://raw.githubusercontent.com/7020227649/n8n-enterprise-stack/main/install.sh | bash
# ─────────────────────────────────────────────────────────

REPO_URL="https://github.com/7020227649/n8n-enterprise-stack.git"
INSTALL_DIR="/opt/n8n-enterprise-stack"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  🚀 n8n Enterprise Control Platform Installer   ║${NC}"
  echo -e "${CYAN}║     Telegram-Controlled n8n Infrastructure      ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
}

log() { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✖]${NC} $1"; exit 1; }

# ─── Check root ───────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Please run as root: curl -fsSL ... | sudo bash"
fi

banner

# ─── Step 1: Install Docker ──────────────────────────
echo -e "${CYAN}Step 1/5:${NC} Checking Docker..."

if ! command -v docker &> /dev/null; then
  warn "Docker not found. Installing..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  log "Docker installed."
else
  log "Docker already installed ($(docker --version | cut -d' ' -f3 | tr -d ','))"
fi

# Ensure docker compose is available
if ! docker compose version &> /dev/null; then
  warn "Docker Compose plugin not found. Installing..."
  apt-get update -y && apt-get install -y docker-compose-plugin
  log "Docker Compose installed."
else
  log "Docker Compose available."
fi

# ─── Step 2: Install Git ─────────────────────────────
echo ""
echo -e "${CYAN}Step 2/5:${NC} Checking Git..."

if ! command -v git &> /dev/null; then
  apt-get update -y && apt-get install -y git
  log "Git installed."
else
  log "Git already installed."
fi

# ─── Step 3: Clone Repository ────────────────────────
echo ""
echo -e "${CYAN}Step 3/5:${NC} Cloning repository..."

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
echo -e "${CYAN}Step 4/5:${NC} Configuration"
echo ""

# Check if .env already exists
if [ -f .env ]; then
  echo -e "${YELLOW}Existing .env found. Overwrite? (y/N):${NC}"
  read -r OVERWRITE
  if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
    log "Keeping existing .env"
  else
    rm .env
  fi
fi

if [ ! -f .env ]; then
  echo -e "  Enter your Telegram Bot Token"
  echo -e "  ${YELLOW}(Get from @BotFather on Telegram)${NC}"
  read -p "  → BOT_TOKEN: " BOT_TOKEN

  echo ""
  echo -e "  Enter your Telegram User ID"
  echo -e "  ${YELLOW}(Get from @userinfobot on Telegram)${NC}"
  read -p "  → ADMIN_ID: " ADMIN_ID

  # Validate inputs
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

# ─── Step 5: Deploy ──────────────────────────────────
echo ""
echo -e "${CYAN}Step 5/5:${NC} Deploying with Docker Compose..."
echo ""

docker compose up -d --build

# ─── Done! ────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         🎉 INSTALLATION COMPLETE! 🎉            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}n8n Web UI:${NC}    http://$(curl -s ifconfig.me 2>/dev/null || echo 'your-server-ip'):5678"
echo -e "  ${CYAN}n8n Login:${NC}     admin / $N8N_PASS"
echo -e "  ${CYAN}Telegram Bot:${NC}  Open Telegram → send /start to your bot"
echo ""
echo -e "  ${YELLOW}Save your n8n password:${NC} $N8N_PASS"
echo ""
echo -e "  Useful commands:"
echo -e "    docker compose logs bot -f     # Bot logs"
echo -e "    docker compose logs n8n-main -f # n8n logs"
echo -e "    docker compose ps              # Container status"
echo ""
