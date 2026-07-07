# Hostinger VPS Deployment

This app can run on a Hostinger VPS, but it currently uses the Supabase API
shape (`@supabase/supabase-js`) throughout the codebase. A plain PostgreSQL
server is not enough unless the app is refactored to server-only database APIs.

## Recommended Hostinger Plan

- Minimum for testing: KVM 1
- Recommended for app + database services: KVM 2 or higher
- OS: Ubuntu 22.04 or 24.04 LTS

## Deployment Paths

### Path A: Cheapest Simple Production

Host the Next.js app on Hostinger and keep Supabase hosted database.

This is the fastest and most stable route:

- Hostinger replaces Vercel.
- Supabase remains managed.
- Use `deploy-app.sh`, `ecosystem.config.cjs`, and `nginx-arjun-glass-house.conf`.

### Path B: Hostinger Does Both Jobs

Host the Next.js app and a self-hosted Supabase stack on the same VPS.

This is possible, but it needs more RAM, disk, backups, and maintenance:

- Next.js app
- Supabase services: Postgres, PostgREST, Auth, Storage, Kong/API gateway
- Daily backups
- SSL for app domain and Supabase API domain

Use KVM 2 or higher for this. KVM 1 can feel tight once the Supabase stack,
Next.js, images, backups, and logs are running together.

## What I Need From Hostinger

After you buy the VPS, share:

1. VPS public IP address
2. SSH username, usually `root`
3. SSH password or private key
4. Domain name to point to the app, for example `arjunglasshouse.com`
5. Whether you want:
   - app on `arjunglasshouse.com`
   - Supabase API on `api.arjunglasshouse.com`

## Server Setup

Run once on a fresh Ubuntu VPS:

```bash
sudo bash deploy/hostinger/setup-ubuntu.sh
```

Then copy `.env.production.example` to `.env.production` and fill the values.

Deploy or update the app:

```bash
bash deploy/hostinger/deploy-app.sh
```

## Nginx

Copy the Nginx file:

```bash
sudo cp deploy/hostinger/nginx-arjun-glass-house.conf /etc/nginx/sites-available/arjun-glass-house
sudo ln -s /etc/nginx/sites-available/arjun-glass-house /etc/nginx/sites-enabled/arjun-glass-house
sudo nginx -t
sudo systemctl reload nginx
```

Then issue SSL:

```bash
sudo certbot --nginx -d arjunglasshouse.com -d www.arjunglasshouse.com
```

## Backups

If using hosted Supabase, backups are managed by Supabase plan.

If self-hosting Postgres/Supabase on Hostinger, configure:

```bash
sudo mkdir -p /opt/backups/arjun-glass-house
sudo cp deploy/hostinger/backup-postgres.sh /usr/local/bin/backup-arjun-postgres
sudo chmod +x /usr/local/bin/backup-arjun-postgres
```

Cron example:

```cron
15 2 * * * /usr/local/bin/backup-arjun-postgres >> /var/log/arjun-postgres-backup.log 2>&1
```

