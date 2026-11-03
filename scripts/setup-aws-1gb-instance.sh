#!/usr/bin/env bash
# ==============================================================================
# SetupMint — AWS 1GB Instance Setup & Optimization Script
# Compatible with: Ubuntu 22.04 / 24.04 LTS (AWS EC2 / Lightsail 1GB RAM)
# ==============================================================================

set -e

echo "=========================================================="
echo "  SetupMint — AWS 1GB Server Setup & Memory Optimization   "
echo "=========================================================="

# 1. Configure 2GB Swap Space (CRITICAL for 1GB AWS Instances)
# Without swap, running node/npm operations on 1GB RAM will trigger OOM killer.
if [ ! -f /swapfile ]; then
  echo "==> Configuring 2GB swap space to protect 1GB RAM..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  sudo sysctl vm.swappiness=20
  echo 'vm.swappiness=20' | sudo tee -a /etc/sysctl.conf
  echo "✅ 2GB Swap space successfully created and enabled."
else
  echo "==> Swap file already exists. Skipping swap creation."
fi

# 2. Update System Packages
echo "==> Updating apt packages..."
sudo apt update -y
sudo apt install -y curl git nginx ufw htop

# 3. Install Node.js 20 LTS (if not installed)
if ! command -v node &> /dev/null; then
  echo "==> Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  echo "✅ Node.js $(node -v) and npm $(npm -v) installed."
else
  echo "==> Node.js $(node -v) is already installed."
fi

# 4. Install PM2 Globally
if ! command -v pm2 &> /dev/null; then
  echo "==> Installing PM2 process manager..."
  sudo npm install -g pm2
  sudo pm2 startup systemd -u $USER --hp $HOME
fi

# 5. Create Application Directory
APP_DIR="/var/www/setupmint"
echo "==> Setting up application directory at $APP_DIR..."
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

# 6. Configure Nginx Reverse Proxy
NGINX_CONF="/etc/nginx/sites-available/setupmint"
echo "==> Writing Nginx configuration to $NGINX_CONF..."
sudo tee $NGINX_CONF > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    # Gzip Compression for fast delivery
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Frontend Single Page App (Static files served directly by Nginx)
    location / {
        root /var/www/setupmint/apps/web/dist;
        try_files $uri $uri/ /index.html;
        expires 1d;
        add_header Cache-Control "public, max-age=86400";
    }

    # Backend API Reverse Proxy (Port 4000)
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
    }

    # API Health Check Endpoint
    location /health {
        proxy_pass http://127.0.0.1:4000/api/health;
    }
}
EOF

# Enable Nginx Site
sudo ln -sf /etc/nginx/sites-available/setupmint /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
echo "✅ Nginx reverse proxy configured and started."

echo "=========================================================="
echo "  Setup Complete! Your AWS 1GB Server is Optimized.       "
echo "=========================================================="
echo "Next Steps:"
echo "1. Clone your repo: git clone https://github.com/Rohsh00/SetupMint.git /var/www/setupmint"
echo "2. Add your .env in /var/www/setupmint/apps/api/.env"
echo "3. Run: cd /var/www/setupmint && npm ci && npm run build"
echo "4. Start API: pm2 start apps/api/dist/server.js --name setupmint-api && pm2 save"
echo "=========================================================="

