#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────
#  n8n Enterprise Control Platform — One-Shot Installer
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/7020227649/n8n-enterprise-stack/main/install.sh | sudo bash
#
#  Supports: Ubuntu 20.04+, Debian 11+, CentOS/RHEL 8+, Amazon Linux 2
# ─────────────────────────────────────────────────────────

REPO_URL="https://github.com/7020227649/n8n-enterprise-stack.git"
INSTALL_DIR="/opt/n8n-enterprise-stack"
MIN_RAM_MB=1024
MIN_DISK_GB=5

# ─── Colors ───────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

banner() {
  clear
  echo ""
  echo -e "${CYAN}╔═══════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║                                                       ║${NC}"
  echo -e "${CYAN}║   🚀  ${BOLD}n8n Enterprise Control Platform${NC}${CYAN}                ║${NC}"
  echo -e "${CYAN}║   ${DIM}Telegram-Controlled n8n Infrastructure${NC}${CYAN}              ║${NC}"
  echo -e "${CYAN}║                                                       ║${NC}"
  echo -e "${CYAN}║   ${DIM}49 Commands • Auto-Backup • Health Monitor${NC}${CYAN}          ║${NC}"
  echo -e "${CYAN}║   ${DIM}Custom Domain • Free SSL • One-Click Deploy${NC}${CYAN}         ║${NC}"
  echo -e "${CYAN}║                                                       ║${NC}"
  echo -e "${CYAN}╚═══════════════════════════════════════════════════════╝${NC}"
  echo ""
}

log()  { echo -e "  ${GREEN}✔${NC}  $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "  ${RED}✖${NC}  $1"; exit 1; }
info() { echo -e "  ${CYAN}ℹ${NC}  $1"; }
step() { echo ""; echo -e "  ${BOLD}━━━ $1 ━━━${NC}"; echo ""; }

# ─── Safe read (works when piped via curl | bash) ─────
# When using curl ... | bash, stdin is the pipe.
# We must read user input from /dev/tty (the actual terminal).
prompt() {
  local var_name=$1
  local prompt_text=$2
  local value
  read -p "$prompt_text" value < /dev/tty
  eval "$var_name=\"$value\""
}

prompt_required() {
  local var_name=$1
  local prompt_text=$2
  local error_text=$3
  local value
  while true; do
    read -p "$prompt_text" value < /dev/tty
    if [ -n "$value" ]; then
      eval "$var_name=\"$value\""
      return
    fi
    echo -e "  ${RED}  ${error_text}${NC}"
  done
}

# ─── Pre-flight Checks ────────────────────────────────

if [ "$EUID" -ne 0 ]; then
  echo ""
  echo -e "  ${RED}✖  This installer must be run as root.${NC}"
  echo ""
  echo -e "  ${BOLD}Run:${NC}  curl -fsSL https://raw.githubusercontent.com/7020227649/n8n-enterprise-stack/main/install.sh | ${BOLD}sudo${NC} bash"
  echo ""
  exit 1
fi

banner

# ─── Ensure curl & openssl exist (needed for install) ──
for cmd in curl openssl; do
  if ! command -v $cmd &> /dev/null; then
    apt-get update -qq 2>/dev/null && apt-get install -y -qq $cmd >/dev/null 2>&1 || \
    yum install -y -q $cmd >/dev/null 2>&1 || \
    dnf install -y -q $cmd >/dev/null 2>&1 || true
  fi
done

# ─── Detect OS ─────────────────────────────────────────
step "Step 1/7: System Check"

if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  OS_VERSION=$VERSION_ID
  OS_NAME=$PRETTY_NAME
else
  OS="unknown"
  OS_NAME="Unknown Linux"
fi

log "OS: ${OS_NAME}"

# Check architecture
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "aarch64" ]; then
  err "Unsupported architecture: $ARCH (need x86_64 or aarch64)"
fi
log "Architecture: ${ARCH}"

# Check RAM
TOTAL_RAM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "0")
if [ "$TOTAL_RAM_MB" -lt "$MIN_RAM_MB" ] 2>/dev/null; then
  warn "Low RAM detected: ${TOTAL_RAM_MB}MB (recommended: ${MIN_RAM_MB}MB+)"
  warn "Creating 2GB swap file for stability..."
  
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null 2>&1
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    log "2GB swap created."
  else
    log "Swap already exists."
  fi
else
  log "RAM: ${TOTAL_RAM_MB}MB ✓"
fi

# Check disk space
DISK_AVAIL_GB=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')
if [ "$DISK_AVAIL_GB" -lt "$MIN_DISK_GB" ] 2>/dev/null; then
  err "Not enough disk space: ${DISK_AVAIL_GB}GB available (need ${MIN_DISK_GB}GB+)"
fi
log "Disk: ${DISK_AVAIL_GB}GB available ✓"

# ─── Install Docker ──────────────────────────────────
step "Step 2/7: Docker"

if ! command -v docker &> /dev/null; then
  info "Installing Docker..."
  
  case $OS in
    ubuntu|debian)
      apt-get update -qq
      apt-get install -y -qq ca-certificates curl gnupg >/dev/null 2>&1
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL "https://download.docker.com/linux/${OS}/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS} $(lsb_release -cs 2>/dev/null || echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
      ;;
    centos|rhel|rocky|almalinux|fedora)
      dnf install -y -q dnf-plugins-core >/dev/null 2>&1 || yum install -y -q yum-utils >/dev/null 2>&1
      dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null
      dnf install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1 || yum install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null 2>&1
      ;;
    amzn)
      yum install -y -q docker >/dev/null 2>&1
      curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
      chmod +x /usr/local/bin/docker-compose
      ;;
    *)
      info "Using generic Docker install script..."
      curl -fsSL https://get.docker.com | sh
      ;;
  esac

  systemctl enable docker >/dev/null 2>&1
  systemctl start docker
  log "Docker installed."
else
  log "Docker: $(docker --version | cut -d' ' -f3 | tr -d ',') ✓"
fi

# Verify Docker Compose
if ! docker compose version &> /dev/null; then
  if command -v docker-compose &> /dev/null; then
    log "Docker Compose (standalone) available."
  else
    err "Docker Compose not found. Please install manually."
  fi
else
  log "Docker Compose: $(docker compose version --short 2>/dev/null || echo 'available') ✓"
fi

# ─── Install Git ─────────────────────────────────────
step "Step 3/7: Git"

if ! command -v git &> /dev/null; then
  case $OS in
    ubuntu|debian)  apt-get install -y -qq git >/dev/null 2>&1 ;;
    centos|rhel|rocky|almalinux|fedora|amzn) yum install -y -q git >/dev/null 2>&1 ;;
    *) apt-get install -y git 2>/dev/null || yum install -y git 2>/dev/null ;;
  esac
  log "Git installed."
else
  log "Git: $(git --version | cut -d' ' -f3) ✓"
fi

# ─── Clone Repository ────────────────────────────────
step "Step 4/7: Repository"

if [ -d "$INSTALL_DIR/.git" ]; then
  warn "Existing installation found at $INSTALL_DIR"
  cd "$INSTALL_DIR"
  git fetch origin main --quiet 2>/dev/null || true
  git reset --hard origin/main --quiet 2>/dev/null || true
  log "Updated to latest version."
else
  rm -rf "$INSTALL_DIR" 2>/dev/null || true
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" --quiet
  cd "$INSTALL_DIR"
  log "Cloned to $INSTALL_DIR"
fi

# ─── Configure Environment ───────────────────────────
step "Step 5/7: Configuration"

# Check for existing PostgreSQL volume (prevents 502 Bad Gateway on reinstall)
# Check for existing PostgreSQL volume (prevents 502 Bad Gateway on reinstall)
if docker volume inspect n8n-enterprise-stack_postgres_data >/dev/null 2>&1; then
  if [ ! -f .env ]; then
    echo ""
    warn "Existing database found but no configuration (.env)."
    info "Removing orphaned database volume to ensure a clean text install..."
    docker volume rm n8n-enterprise-stack_postgres_data >/dev/null 2>&1 || true
    log "Orphaned database removed."
  fi
fi

# Detect public IP (needed for both new and existing configs)
SERVER_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s --connect-timeout 5 icanhazip.com 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo '127.0.0.1')

if [ -f .env ]; then
  echo -e "  ${YELLOW}Existing configuration found.${NC}"
  echo ""
  prompt KEEP_ENV "  → Keep existing config? (Y/n): "
  
  if [ "$KEEP_ENV" != "n" ] && [ "$KEEP_ENV" != "n" ]; then
    log "Keeping existing configuration."
    SKIP_ENV=true
    
    # ─── New: Sanitize existing configuration ───
    # Many users have a corrupted 267-char key. Let's fix it silently or with a warning.
    EXISTING_KEY=$(grep "N8N_API_KEY=" .env | cut -d'=' -f2- | tr -d '\r')
    if [ ${#EXISTING_KEY} -gt 60 ]; then
       echo ""
       warn "CORRUPTION DETECTED: Your existing API key is too long (${#EXISTING_KEY} chars)."
       info "This usually means it contains an encrypted blob instead of a plain key."
       prompt CLEAR_BAD_KEY "  → Clear this corrupted key and use Basic Auth? (Y/n): "
       if [ "$CLEAR_BAD_KEY" != "n" ] && [ "$CLEAR_BAD_KEY" != "N" ]; then
          sed -i "s|^N8N_API_KEY=.*|N8N_API_KEY=|" .env
          log "Corrupted key cleared. Bot will now use Basic Auth fallback."
       fi
    fi
  fi
fi

if [ "${SKIP_ENV}" != "true" ]; then
  echo -e "  ${CYAN}${BOLD}Telegram Bot Setup${NC}"
  echo -e "  ${DIM}You need a Telegram bot token and your user ID.${NC}"
  echo ""
  echo -e "  ${DIM}1. Open Telegram → search @BotFather → /newbot${NC}"
  echo -e "  ${DIM}2. Open Telegram → search @userinfobot → get your ID${NC}"
  echo ""

  prompt_required BOT_TOKEN "  → Bot Token: " "Bot Token is required!"

  echo ""

  prompt_required ADMIN_ID "  → Admin ID (your Telegram user ID): " "Admin ID is required!"

  # API Key prompt removed (User should set it via bot after install)
  N8N_API_KEY=""

  # Auto-generate secure passwords and secrets
  # Use deterministic password generation based on BOT_TOKEN
  # This allows recovering the DB password if .env is lost but BOT_TOKEN is known
  POSTGRES_PASSWORD=$(echo "db_pwd_${BOT_TOKEN}" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-24)
  # ─── n8n Credentials ──────────────────────────────────
  echo ""
  echo -e "  ${CYAN}${BOLD}n8n Login Credentials${NC}"
  echo -e "  ${DIM}These will be used to create your n8n owner account and for the bot to connect.${NC}"
  echo ""
  
  prompt_required N8N_USER "  → Email (e.g. admin@example.com): " "Email is required!"
  
  while true; do
    echo -n "  → Password: "
    read -s N8N_PASS < /dev/tty
    echo ""
    echo -n "  → Confirm Password: "
    read -s N8N_PASS_CONFIRM < /dev/tty
    echo ""
    
    if [ "$N8N_PASS" = "$N8N_PASS_CONFIRM" ] && [ -n "$N8N_PASS" ]; then
      break
    else
      echo -e "  ${RED}Passwords do not match or are empty. Try again.${NC}"
    fi
  done
  
  # Auto-generate secure secrets
  POSTGRES_PASSWORD=$(echo "db_pwd_${BOT_TOKEN}" | openssl dgst -sha256 | awk '{print $2}' | cut -c1-24)
  WEBHOOK_SECRET=$(openssl rand -hex 32)
  N8N_API_KEY=${N8N_API_KEY:-}

  cat > .env <<EOF
BOT_TOKEN=$BOT_TOKEN
ADMIN_ID=$ADMIN_ID
N8N_USER=$N8N_USER
N8N_PASS=$N8N_PASS
N8N_API_KEY=$N8N_API_KEY
N8N_BASE_URL=http://n8n-main:5678
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
N8N_VERSION=latest
WEBHOOK_SECRET=$WEBHOOK_SECRET
WEBHOOK_URL=http://${SERVER_IP}:5678
EOF

  chmod 600 .env
  log "Configuration saved (passwords auto-generated)."
fi

# Ensure WEBHOOK_URL exists (even if keeping old config)
if ! grep -q "WEBHOOK_URL=" .env; then
  echo "" >> .env
  echo "# Auto-added by installer" >> .env
  echo "WEBHOOK_URL=http://${SERVER_IP}:5678" >> .env
  log "Added missing WEBHOOK_URL to .env"
fi

# ─── Domain & SSL (Optional) ─────────────────────────
step "Step 6/7: Domain & SSL (Optional)"

echo -e "  Connect a custom domain with free SSL certificate?"
echo -e "  ${DIM}Requirement: Domain's A/AAAA record must point to this server.${NC}"
echo ""
prompt DOMAIN "  → Domain (or press Enter to skip): "

DOMAIN_CONFIGURED=false

if [ -n "$DOMAIN" ]; then
  echo ""

  prompt_required SSL_EMAIL "  → Email for SSL (Let's Encrypt): " "Email is required for SSL certificate!"

  info "Installing Nginx & Certbot..."

  case $OS in
    ubuntu|debian)
      apt-get update -qq
      apt-get install -y -qq nginx certbot python3-certbot-nginx >/dev/null 2>&1
      ;;
    centos|rhel|rocky|almalinux|fedora)
      dnf install -y -q nginx certbot python3-certbot-nginx >/dev/null 2>&1 || yum install -y -q nginx certbot python3-certbot-nginx >/dev/null 2>&1
      ;;
    *)
      apt-get install -y nginx certbot python3-certbot-nginx 2>/dev/null || yum install -y nginx certbot python3-certbot-nginx 2>/dev/null
      ;;
  esac

  systemctl enable nginx >/dev/null 2>&1
  systemctl start nginx

  # Nginx reverse proxy config
  # Nginx reverse proxy config
  NGINX_CONF_CONTENT=$(cat <<'EOF'
server {
    listen 80;
    server_name $DOMAIN_VAR;

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
EOF
)
  # Replace variable manually or use expanded heredoc? 
  # Using expanded heredoc in variable assignment is tricky if not careful with $.
  # Let's stick to duplicative if-else for robustness.

  if [ -d /etc/nginx/sites-available ]; then
      cat > /etc/nginx/sites-available/n8n <<EOF
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
EOF
  else
      cat > /etc/nginx/conf.d/n8n.conf <<EOF
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
EOF
  fi

  # Enable site (Debian/Ubuntu style)
  if [ -d /etc/nginx/sites-enabled ]; then
    ln -sf /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
  fi

  nginx -t >/dev/null 2>&1
  systemctl reload nginx

  log "Nginx configured for ${DOMAIN}"

  # SSL certificate
  info "Obtaining SSL certificate (this may take a minute)..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$SSL_EMAIL" --redirect 2>&1 | tail -3

  log "SSL certificate installed! 🔒"
  
  # Update WEBHOOK_URL to use the secure domain
  if [ "$OS" = "darwin" ]; then
    sed -i '' "s|WEBHOOK_URL=.*|WEBHOOK_URL=https://${DOMAIN}|" .env
  else
    sed -i "s|WEBHOOK_URL=.*|WEBHOOK_URL=https://${DOMAIN}|" .env
  fi
  
  DOMAIN_CONFIGURED=true
else
  warn "Skipped. n8n will be accessible via IP address."
fi

# ─── Firewall ─────────────────────────────────────────
if command -v ufw &> /dev/null; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  
  if [ "$DOMAIN_CONFIGURED" = "false" ]; then
    ufw allow 5678/tcp >/dev/null 2>&1 || true
  fi
  
  log "Firewall rules configured."
fi

# ─── Deploy ──────────────────────────────────────────
step "Step 7/7: Deploying"

cd "$INSTALL_DIR"

info "Building and starting containers (this may take 2-5 minutes)..."
echo ""

docker compose up -d --build 2>&1 | while IFS= read -r line; do
  echo -e "  ${DIM}  ${line}${NC}"
done

echo ""

# Wait for containers to be healthy
info "Waiting for services to start..."
sleep 10

# ─── Diagnostics & Self-Healing ──────────────────────
step "Diagnostics"

wait_for_n8n() {
  local retries=30
  local wait_time=2
  local url="http://127.0.0.1:5678"
  
  info "Checking n8n connectivity..."
  
  for ((i=1; i<=retries; i++)); do
    # Check if we get ANY response from n8n (status 200, 302, 401 are all good signs it's running)
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [[ "$status_code" =~ ^(2|3|4) ]]; then
      log "n8n is up and running! (Status: $status_code)"
      return 0
    fi
    echo -ne "  ${DIM}Waiting for n8n... ($i/$retries) [Status: $status_code]${NC}\r"
    sleep $wait_time
  done
  
  echo ""
  warn "n8n failed to start within 60 seconds."
  return 1
}

if ! wait_for_n8n; then
  echo ""
  warn "n8n is not responding. Checking logs for common errors..."
  echo ""
  
  # Check for password mismatch
  if docker compose logs n8n-main | grep -q "password authentication failed"; then
    echo -e "  ${RED}${BOLD}✖  CRITICAL ERROR: Database Password Mismatch${NC}"
    echo -e "  The database password in .env does not match the existing database volume."
    echo ""
    echo -e "  ${YELLOW}Auto-Fix Attempt:${NC}"
    echo -e "  We can wipe the database volume to allow it to be recreated with the correct password."
    echo -e "  ${BOLD}THIS WILL DELETE ALL N8N DATA.${NC}"
    echo ""
    prompt FIX_DB "  → Wipe Database and Restart? (Y/n): "
    
    if [ "$FIX_DB" != "n" ] && [ "$FIX_DB" != "N" ]; then
      info "Stopping containers..."
      docker compose down >/dev/null 2>&1
      info "Removing corrupted volume..."
      docker volume rm n8n-enterprise-stack_postgres_data >/dev/null 2>&1
      info "Restarting..."
      docker compose up -d --build
      
      # Wait again
      if wait_for_n8n; then
        log "Fix successful! n8n is running."
      else
        err "Fix failed. Please check logs manually: docker compose logs"
      fi
    else
      warn "Aborting. You will need to fix the .env file manually."
    fi
  else
    echo -e "  ${YELLOW}Last 20 lines of logs:${NC}"
    docker compose logs --tail=20 n8n-main
    echo ""
    warn "Please check the logs above for errors."
  fi
fi

# Check if containers are running
RUNNING=$(docker compose ps --format "{{.State}}" 2>/dev/null | grep -c "running" || echo "0")
TOTAL=$(docker compose ps --format "{{.State}}" 2>/dev/null | wc -l || echo "0")

if [ "$RUNNING" -gt 0 ]; then
  log "Containers running: ${RUNNING}/${TOTAL}"
  
  # ─── New: Auto-Create Owner Account ───
  # This prevents the bot from failing 401 on fresh installs
  step "Account Setup"
  info "Auto-creating n8n owner account..."
  
  # Ensure we have credentials
  CREAT_USER=${N8N_USER:-$(grep N8N_USER .env | cut -d'=' -f2)}
  CREAT_PASS=${N8N_PASS:-$(grep N8N_PASS .env | cut -d'=' -f2)}
  
  docker compose exec n8n-main n8n user:management:owner:create --email "$CREAT_USER" --password "$CREAT_PASS" --firstName "Admin" --lastName "User" >/dev/null 2>&1 || true
  log "Owner account configured."
  
else
  warn "Containers may still be starting. Check: docker compose ps"
fi

# ─── Completion ──────────────────────────────────────
# IP detected earlier
N8N_PASS_DISPLAY=${N8N_PASS:-$(grep N8N_PASS .env 2>/dev/null | cut -d'=' -f2)}

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}║   🚀  ${BOLD}n8n Enterprise Stack Installed!${NC}${GREEN}                ║${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$DOMAIN_CONFIGURED" = "true" ]; then
  echo -e "  ${BOLD}🌐 Web Interface:${NC}   ${GREEN}https://${DOMAIN}${NC}"
else
  echo -e "  ${BOLD}🌐 Web Interface:${NC}   ${GREEN}http://${SERVER_IP}:5678${NC}"
fi

echo -e "  ${BOLD}👤 Admin Login:${NC}     Username: ${CYAN}${N8N_USER:-admin}${NC} / Password: ${CYAN}${N8N_PASS_DISPLAY}${NC}"
echo ""
echo -e "  ${BOLD}🤖 Telegram Bot:${NC}    Search for your bot and click ${CYAN}START${NC}"
echo ""

step "👉 First Steps Guide"

echo -e "  ${BOLD}1. Login to n8n${NC}"
echo -e "     Open the URL above and use the admin credentials."
echo ""
echo -e "  ${BOLD}2. Activate your Bot${NC}"
echo -e "     Go to Telegram, find your bot, and tap ${BOLD}Start${NC}."
echo -e "     It will guide you through the features."
echo ""
  echo -e "  ${BOLD}3. Secure your Data${NC}"
  echo -e "     The bot will suggest enabling daily backups."
  echo ""
  echo -e "  ${BOLD}4. Unlock Full Power (Optional)${NC}"
  echo -e "     Generate an API Key in n8n (Settings > Developer)."
  echo -e "     Send it to the bot: ${CYAN}/setkey <your_key>${NC}"
  echo ""
  echo -e "  ${DIM}────────────────────────────────────────────────────${NC}"
  echo -e "  ${RED}${BOLD}⚠️  IMPORTANT: Save your password now!${NC}"
  echo -e "  ${DIM}────────────────────────────────────────────────────${NC}"
echo ""
