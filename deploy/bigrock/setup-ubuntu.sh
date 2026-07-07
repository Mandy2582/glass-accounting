#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root: sudo bash deploy/bigrock/setup-ubuntu.sh"
  exit 1
fi

apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl git nginx ufw certbot python3-certbot-nginx build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

npm install -g pm2

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

mkdir -p /var/www /opt/backups/arjun-glass-house

systemctl enable nginx
systemctl restart nginx

echo "BigRock VPS base setup complete."

