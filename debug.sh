#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}━━━ n8n Enterprise Stack Debugger ━━━${NC}"
echo ""

# 1. System Info
echo -e "${GREEN}[1] System Info${NC}"
echo "OS: $(grep PRETTY_NAME /etc/os-release | cut -d'"' -f2)"
echo "Memory: $(free -h | awk '/^Mem:/{print $2}')"
echo "Disk: $(df -h / | awk 'NR==2{print $4}')"
echo ""

# 2. Docker Status
echo -e "${GREEN}[2] Docker Containers${NC}"
cd /opt/n8n-enterprise-stack || exit
docker compose ps
echo ""

# 3. Connectivity Check (Internal)
echo -e "${GREEN}[3] Internal Connectivity (from host)${NC}"
echo -n "Checking http://127.0.0.1:5678 ... "
status_code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5678)
if [[ "$status_code" =~ ^(2|3|4) ]]; then
    echo -e "${GREEN}UP ($status_code)${NC}"
else
    echo -e "${RED}DOWN ($status_code)${NC}"
fi
echo ""

# 4. Nginx Status
echo -e "${GREEN}[4] Nginx Status${NC}"
systemctl status nginx --no-pager | head -n 3
echo ""

# 5. Logs (n8n)
echo -e "${GREEN}[5] n8n-main Logs (Last 20 lines)${NC}"
docker compose logs --tail=20 n8n-main
echo ""

# 6. Logs (Postgres)
echo -e "${GREEN}[6] Postgres Logs (Last 10 lines)${NC}"
docker compose logs --tail=10 postgres
echo ""

echo -e "${YELLOW}━━━ End of Report ━━━${NC}"
