#!/bin/bash
# Fixes corrupted N8N_API_KEY in .env

echo "🔍 Inspecting .env file..."

if [ ! -f .env ]; then
  echo "❌ Error: .env file not found in $(pwd)"
  exit 1
fi

CURRENT_KEY=$(grep "N8N_API_KEY=" .env | cut -d'=' -f2- | tr -d '\r')
LEN=${#CURRENT_KEY}

echo "   Current Key Length: $LEN characters"

if [ "$LEN" -gt 50 ]; then
  echo ""
  echo "⚠️  PROBLEM DETECTED: The API Key is too long!"
  echo "   It appears to be encrypted or a JWT token (267+ chars)."
  echo "   A valid n8n API Key is usually ~30-40 characters."
  echo ""
  echo "   👉 Please go to n8n (Settings > Developer > API Keys) and copy a fresh key."
  echo ""
  # Read from /dev/tty because script is likely piped from curl
  read -p "   Paste the REAL API Key here: " NEW_KEY < /dev/tty

  # Trim whitespace
  NEW_KEY=$(echo "$NEW_KEY" | xargs)

  if [ -n "$NEW_KEY" ]; then
    # Backup .env
    cp .env .env.bak
    echo "   (Backup saved to .env.bak)"

    # Replace key using safe sed format
    # We use | as delimiter assuming key typically doesn't contain it
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|N8N_API_KEY=.*|N8N_API_KEY=$NEW_KEY|" .env
    else
      sed -i "s|N8N_API_KEY=.*|N8N_API_KEY=$NEW_KEY|" .env
    fi

    echo "✅ .env updated successfully."
    echo ""
    echo "🔄 Restarting n8n and bot to apply changes..."
    docker compose down && docker compose up -d
    
    echo ""
    echo "✅ Done! Please run /debug in the bot again."
  else
    echo "❌ No key provided. Aborting."
    exit 1
  fi
else
  echo "✅ Key length looks normal. No changes needed."
fi
