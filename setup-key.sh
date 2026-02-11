#!/bin/bash

# Colorful output
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║      n8n Bot - API Key Setup 🔑        ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "To connect the bot to your n8n instance, we need your API Key."
echo "You can find it in n8n Settings > Developer."
echo ""

# Ask for key
read -p "👉 Paste your API Key here: " API_KEY

if [ -z "$API_KEY" ]; then
    echo -e "${RED}❌ Error: No API Key provided.${NC}"
    exit 1
fi

# Clean up input
API_KEY=$(echo "$API_KEY" | tr -d '[:space:]')

# Helper to update .env
update_env() {
    local key=$1
    local val=$2
    local file=".env"
    
    if grep -q "^${key}=" "$file"; then
        # Key exists, replace it (using a temp file to be safe)
        # Using perl for safe inplace editing, fallback to sed
        if command -v sed &> /dev/null; then
             # Escape special chars in value for sed
             escaped_val=$(printf '%s\n' "$val" | sed -e 's/[\/&]/\\&/g')
             sed -i "s/^${key}=.*/${key}=${escaped_val}/" "$file"
        else
             echo -e "${RED}Error: sed not found.${NC}"
             exit 1
        fi
    else
        # Key doesn't exist, append it
        echo "" >> "$file"
        echo "${key}=${val}" >> "$file"
    fi
}

echo ""
echo -e "${CYAN}🔄 Configure .env file...${NC}"
update_env "N8N_API_KEY" "$API_KEY"
echo -e "${GREEN}✅ API Key saved to .env!${NC}"

echo ""
echo -e "${CYAN}🔄 Restarting the bot...${NC}"
docker compose up -d --force-recreate bot

echo ""
echo -e "${GREEN}🎉 Success! The bot is now using your new API Key.${NC}"
echo "Try sending /workflows to the bot to verify."
