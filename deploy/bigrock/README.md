# BigRock Self-Managed VPS Deployment

Use this folder for deploying Arjun Glass House on a BigRock self-managed VPS.

## Recommended VPS

For this app:

- OS: Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
- CPU: 2 vCPU minimum
- RAM: 4 GB minimum
- Disk: 50 GB SSD minimum
- Root SSH access: required

Avoid 1 GB RAM if you want the app and database/Supabase services on the same VPS.

## What BigRock Self-Managed Means

BigRock gives the server. We manage:

- Node.js
- Nginx
- PM2
- SSL
- firewall
- app deployment
- backups
- database/Supabase if self-hosted
- updates and monitoring

## Recommended First Deployment

For the first stable move:

1. Host the Next.js app on BigRock VPS.
2. Keep current Supabase database hosted for now.
3. After the app is stable, decide whether to self-host Supabase too.

This avoids doing app migration and database migration at the same time.

## DNS

Point your domain to the VPS:

- `A` record: `@` -> VPS public IP
- `A` record: `www` -> VPS public IP

If self-hosting Supabase later:

- `A` record: `api` -> VPS public IP

## One-Time Server Setup

On the VPS:

```bash
sudo bash deploy/bigrock/setup-ubuntu.sh
```

## App Deployment

Clone the repository into:

```bash
/var/www/arjun_glass_house
```

Create production env:

```bash
cp deploy/bigrock/.env.production.example .env.production
nano .env.production
```

Deploy:

```bash
bash deploy/bigrock/deploy-app.sh
```

## Nginx

Edit domain names inside:

```bash
deploy/bigrock/nginx-arjun-glass-house.conf
```

Install config:

```bash
sudo cp deploy/bigrock/nginx-arjun-glass-house.conf /etc/nginx/sites-available/arjun-glass-house
sudo ln -s /etc/nginx/sites-available/arjun-glass-house /etc/nginx/sites-enabled/arjun-glass-house
sudo nginx -t
sudo systemctl reload nginx
```

SSL:

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## Backups

If using hosted Supabase, enable Supabase backups or export periodically.

If self-hosting database on VPS:

```bash
sudo mkdir -p /opt/backups/arjun-glass-house
sudo cp deploy/bigrock/backup-postgres.sh /usr/local/bin/backup-arjun-postgres
sudo chmod +x /usr/local/bin/backup-arjun-postgres
```

Add cron:

```cron
15 2 * * * /usr/local/bin/backup-arjun-postgres >> /var/log/arjun-postgres-backup.log 2>&1
```

## What I Need To Deploy

Send:

1. VPS public IP
2. SSH username, usually `root`
3. SSH password or private key
4. Domain name
5. Whether to keep hosted Supabase initially or self-host Supabase immediately

