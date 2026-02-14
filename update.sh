#!/bin/bash
# Script to update the n8n Enterprise Stack from GitHub

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔄 n8n Enterprise Stack Updater${NC}"

# Check for Git
if ! command -v git &> /dev/null; then
  echo -e "${RED}❌ Error: Git is not installed.${NC}"
  exit 1
fi

echo -e "📥 Pulling latest changes from GitHub..."
git fetch origin main
git reset --hard origin/main

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✔ Code updated successfully.${NC}"
else
  echo -e "${RED}❌ Error: Failed to pull changes.${NC}"
  exit 1
fi

echo -e "🏗️  Rebuilding and restarting containers..."
docker compose down
docker compose up -d --build

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Update Complete!${NC}"
  echo -e "The stack has been updated and restarted."
else
  echo -e "${RED}❌ Error: Docker Compose failed.${NC}"
  exit 1
fi
