#!/usr/bin/env bash
# Atualiza produção: build da API + admin, migrações, publica o site estático e reinicia a API.
# Uso: bash deploy/deploy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB=/var/www/oramagames

cd "$ROOT/api"
# cópia do banco (Postgres de DATABASE_URL no api/.env) antes das migrações; guarda as 20 últimas
mkdir -p "$ROOT/api/backups"
DB_URL="$(node -e 'process.loadEnvFile(); process.stdout.write(process.env.DATABASE_URL || "")')"
[[ "$DB_URL" == postgres* ]] || { echo "DATABASE_URL do api/.env não é postgres"; exit 1; }
(umask 077; pg_dump --no-owner --format=custom --file "backups/prod-$(date +%Y%m%d-%H%M%S).dump" "$DB_URL")
ls -1t backups/prod-*.dump 2>/dev/null | tail -n +21 | xargs -r rm --
npm ci
npx prisma migrate deploy
npm run build

cd "$ROOT/admin-app"
npm ci
npm run build   # gera ../admin

# só o site: nada de código da API, .env, fontes do admin, ferramentas ou git
mkdir -p "$WEB"
rsync -a --delete \
  --exclude '.*' --exclude 'api/' --exclude 'admin-app/' --exclude 'deploy/' --exclude 'docs/' \
  --exclude 'tools/' --exclude 'site/' --exclude 'node_modules/' --exclude 'serve.mjs' \
  --exclude 'ecosystem.config.cjs' --exclude '*.md' --exclude '*.db' \
  "$ROOT/" "$WEB/"
chown -R www-data:www-data "$WEB"

cd "$ROOT"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
echo "deploy ok"
