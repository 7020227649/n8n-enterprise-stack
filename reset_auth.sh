#!/bin/bash
# EMERGECY FIX: Resets n8n API Key in .env to empty to force Basic Auth fallback

echo "🚑 Starting Emergency Auth Reset..."

if [ ! -f .env ]; then
  echo "❌ No .env file found!"
  exit 1
fi

echo "📦 Backing up .env to .env.corrupt_backup..."
cp .env .env.corrupt_backup

echo "🧹 Stripping corrupt API Key..."
# Replace strictly the N8N_API_KEY line with an empty value
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' 's/^N8N_API_KEY=.*/N8N_API_KEY=/' .env
else
  sed -i 's/^N8N_API_KEY=.*/N8N_API_KEY=/' .env
fi

echo "✅ API Key removed from configuration."

echo "🔄 Restarting Bot..."
docker compose restart bot

echo "✨ Done!"
echo "👉 Try the bot now. It should switch to 'Basic Auth' mode automatically."
echo "👉 Once working, use /setkey <your-new-key> in the bot to set a real key."
