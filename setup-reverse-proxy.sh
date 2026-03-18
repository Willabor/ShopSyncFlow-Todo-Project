#!/bin/bash

# ShopSyncFlow Reverse Proxy Setup Script
# Run this with: sudo bash setup-reverse-proxy.sh

echo "🔧 Setting up reverse proxy for ShopSyncFlow..."
echo ""

# Configuration
EXTERNAL_PORT=6001
INTERNAL_PORT=6000
CONFIG_FILE="/usr/local/etc/nginx/sites-available/4355744a-3a75-4433-aff3-5dd5c58e492f.w3conf"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Error: This script must be run as root"
  echo "   Please run: sudo bash setup-reverse-proxy.sh"
  exit 1
fi

# Check if configuration already exists
if grep -q "listen $EXTERNAL_PORT" "$CONFIG_FILE"; then
  echo "⚠️  Port $EXTERNAL_PORT already configured in nginx"
  echo "   Skipping configuration..."
else
  echo "📝 Adding ShopSyncFlow reverse proxy configuration..."

  cat >> "$CONFIG_FILE" << 'EOF'

server {
    listen 6001 default_server;
    listen [::]:6001 default_server;

    server_name _;

    proxy_ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;

    location / {
        proxy_connect_timeout 60;
        proxy_read_timeout 60;
        proxy_send_timeout 60;
        proxy_intercept_errors off;
        proxy_http_version 1.1;

        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_pass http://localhost:6000;
    }

    error_page 403 404 500 502 503 504 /dsm_error_page;

    location /dsm_error_page {
        internal;
        root /usr/syno/share/nginx;
        rewrite (.*) /error.html break;
        allow all;
    }
}
EOF

  echo "✅ Configuration added successfully"
fi

# Test nginx configuration
echo ""
echo "🔍 Testing nginx configuration..."
if nginx -t 2>&1 | grep -q "successful"; then
  echo "✅ Nginx configuration is valid"

  # Reload nginx
  echo ""
  echo "♻️  Reloading nginx..."
  synoservicecfg --reload nginx

  if [ $? -eq 0 ]; then
    echo "✅ Nginx reloaded successfully"
  else
    echo "⚠️  Reload command completed with warnings (this may be normal)"
  fi
else
  echo "❌ Nginx configuration test failed"
  echo "   Please check the configuration manually"
  exit 1
fi

# Test if port is listening
echo ""
echo "🔍 Checking if port $EXTERNAL_PORT is listening..."
sleep 2

if netstat -tln | grep -q ":$EXTERNAL_PORT"; then
  echo "✅ Port $EXTERNAL_PORT is now listening"
else
  echo "⚠️  Port $EXTERNAL_PORT not detected (may need a few more seconds)"
fi

# Final summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Reverse Proxy Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📱 Access ShopSyncFlow at:"
echo "   http://192.168.1.26:$EXTERNAL_PORT"
echo ""
echo "🔗 Or from the NAS:"
echo "   http://localhost:$EXTERNAL_PORT"
echo ""
echo "💡 Tip: Make sure ShopSyncFlow is running:"
echo "   cd /volume1/docker/ShopSyncFlow-Todo-Project"
echo "   npm run dev"
echo ""
