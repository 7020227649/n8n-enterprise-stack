#!/bin/bash
set -e

REPO_URL="https://github.com/YOUR_USERNAME/n8n-enterprise-stack.git"
INSTALL_DIR="/opt/n8n-enterprise-stack"

echo "===== n8n Enterprise Stack Installer ====="

if ! command -v git &> /dev/null; then
  apt update -y && apt install git -y
fi

if ! command -v docker &> /dev/null; then
  apt update -y && apt install docker.io docker-compose-plugin -y
  systemctl enable docker
  systemctl start docker
fi

if ! command -v nginx &> /dev/null; then
  apt install nginx certbot python3-certbot-nginx -y
  systemctl enable nginx
  systemctl start nginx
fi

if [ ! -d "$INSTALL_DIR" ]; then
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
chmod +x scripts/setup.sh
bash scripts/setup.sh
