#!/bin/bash
# ☢️ NUCLEAR OPTION: Completely wipes n8n stack and reinstalls from scratch ☢️

echo " "
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          ⚠  WARNING: NUCLEAR OPTION INITIATED  ⚠           ║"
echo "║                                                            ║"
echo "║  This will DELETE ALL n8n data, workflows, and credentials.║"
echo "║  It will remove containers, volumes, and networks.         ║"
echo "║  The system will be returned to a fresh state.             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo " "

# Confirm again to be safe
read -p "Type 'DELETE' to confirm destruction of all data: " CONFIRM
if [ "$CONFIRM" != "DELETE" ]; then
  echo "❌ Aborted. No changes made."
  exit 1
fi

echo " "
echo "💥 Destroying old stack..."

# 1. Stop Containers
if [ -d "/opt/n8n-enterprise-stack" ]; then
  cd /opt/n8n-enterprise-stack
  docker compose down -v >/dev/null 2>&1
fi

# 2. Force Remove Containers (just in case)
docker ps -a | grep "n8n-enterprise-stack" | awk '{print $1}' | xargs -r docker rm -f >/dev/null 2>&1

# 3. Force Remove Volumes (The most important part)
docker volume ls | grep "n8n-enterprise-stack" | awk '{print $2}' | xargs -r docker volume rm -f >/dev/null 2>&1

# 4. Remove Networks
docker network ls | grep "n8n-enterprise-stack" | awk '{print $2}' | xargs -r docker network rm >/dev/null 2>&1

# 5. Delete Files
cd /tmp
rm -rf /opt/n8n-enterprise-stack

echo "✅ Destruction complete. System generated clean."
echo " "
echo "🚀 Starting fresh installation..."
echo " "

# 6. Run Standard Installer
curl -fsSL https://raw.githubusercontent.com/7020227649/n8n-enterprise-stack/main/install.sh | sudo bash

exit 0
