#!/bin/bash
# Script to easily set/update the n8n API Key after installation

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔑 n8n API Key Utility${NC}"

if [ ! -f .env ]; then
  echo -e "${RED}❌ Error: .env file not found.${NC}"
  echo "Please run this script from the installation directory (usually /opt/n8n-enterprise-stack)."
  exit 1
fi

# Function to update .env
update_env() {
  local key=$1
  local value=$2
  
  if grep -q "^N8N_API_KEY=" .env; then
    # Update existing
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^N8N_API_KEY=.*|N8N_API_KEY=$value|" .env
    else
      sed -i "s|^N8N_API_KEY=.*|N8N_API_KEY=$value|" .env
    fi
  else
    # Append new
    echo "N8N_API_KEY=$value" >> .env
  fi
}

# Check if key argument was provided
API_KEY=$1

if [ -z "$API_KEY" ]; then
  echo ""
  echo -e "Enter your n8n API Key (from Settings > Developer > API Keys):"
  read -p "API Key: " API_KEY
  echo ""
fi

if [ -z "$API_KEY" ]; then
  echo -e "${YELLOW}⚠ Invalid key provided. Exiting.${NC}"
  exit 1
fi

# Clean whitespace
API_KEY=$(echo "$API_KEY" | tr -d '[:space:]')

# Basic validation
if [ ${#API_KEY} -lt 20 ]; then
  echo -e "${YELLOW}⚠ Warning: Key seems too short. Proceeding anyway...${NC}"
fi

echo -e "💾 Saving to .env..."
update_env "N8N_API_KEY" "$API_KEY"

echo -e "🔄 Restarting bot container..."
docker compose restart bot

echo -e "${GREEN}✅ Success! API Key configured.${NC}"
