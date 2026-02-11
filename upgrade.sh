#!/bin/bash
set -e
cd /opt/n8n-enterprise-stack
git pull
docker compose pull
docker compose up -d --build
echo "Upgrade complete."
