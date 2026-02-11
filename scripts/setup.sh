#!/bin/bash
set -e

echo "=== Configuration Wizard ==="

read -p "Domain: " DOMAIN
read -p "Email for SSL: " EMAIL
read -p "Telegram Bot Token: " BOT_TOKEN
read -p "Telegram Admin ID: " ADMIN_ID

POSTGRES_PASSWORD=$(openssl rand -hex 16)
N8N_PASS=$(openssl rand -hex 16)

cat > .env <<EOF
DOMAIN=$DOMAIN
EMAIL=$EMAIL
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
N8N_USER=admin
N8N_PASS=$N8N_PASS
N8N_VERSION=1.82.1
BOT_TOKEN=$BOT_TOKEN
ADMIN_ID=$ADMIN_ID
EOF

docker compose up -d --build

cat > /etc/nginx/sites-available/n8n <<NGINX
server {
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX

ln -sf /etc/nginx/sites-available/n8n /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect

echo "INSTALL COMPLETE"
echo "URL: https://$DOMAIN"
echo "User: admin"
echo "Pass: $N8N_PASS"
