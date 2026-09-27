#!/usr/bin/env bash
# Atualiza produção: build da API + admin, migrações, publica o site estático e reinicia a API.
# Uso: bash deploy/deploy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB=/var/www/oramagames

cd "$ROOT/api"
# cópia do banco antes das migrações (guarda as 20 últimas)
mkdir -p "$ROOT/api/backups"
[ -f prod.db ] && sqlite3 prod.db ".backup backups/prod-$(date +%Y%m%d-%H%M%S).db" 2>/dev/null || cp prod.db "backups/prod-$(date +%Y%m%d-%H%M%S).db"
ls -1t backups/prod-*.db | tail -n +21 | xargs -r rm --
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
