#!/usr/bin/env bash
# Pousse les variables d'env du projet vers Vercel (production + preview).
# À LANCER TOI-MÊME : ce sont tes secrets, ils partent vers le store Vercel.
#   bash scripts/push_vercel_env.sh
#
# Pré-requis : `vercel whoami` = bon compte, projet lié (.vercel/project.json).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] || { echo "❌ .env.local introuvable"; exit 1; }
[ -f .secrets/service-account.json ] || { echo "❌ clé SA introuvable"; exit 1; }

get() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2-; }

# Valeurs depuis .env.local
GMAIL_IMPERSONATE=$(get GMAIL_IMPERSONATE)
POINTAGE_SHEET_FILE_ID=$(get POINTAGE_SHEET_FILE_ID)
AUTH_SECRET=$(get AUTH_SECRET)
AUTH_HOSTED_DOMAIN=$(get AUTH_HOSTED_DOMAIN)
AUTH_GOOGLE_ID=$(get AUTH_GOOGLE_ID)
AUTH_GOOGLE_SECRET=$(get AUTH_GOOGLE_SECRET)

# Dérivés
CRON_SECRET=$(openssl rand -hex 32)
GOOGLE_SA_KEY_B64=$(base64 < .secrets/service-account.json | tr -d '\n')

add() { # NAME VALUE ENV
  [ -n "$2" ] || { echo "  · $1 [$3] vide, ignoré"; return; }
  printf '%s' "$2" | vercel env add "$1" "$3" >/dev/null 2>&1 \
    && echo "  ✔ $1 [$3]" || echo "  ✖ $1 [$3] (existe déjà ? -> vercel env rm $1 $3)"
}

for E in production preview; do
  echo "=== $E ==="
  add GMAIL_IMPERSONATE      "$GMAIL_IMPERSONATE"      "$E"
  add POINTAGE_SHEET_FILE_ID "$POINTAGE_SHEET_FILE_ID" "$E"
  add CRON_SECRET            "$CRON_SECRET"            "$E"
  add GOOGLE_SA_KEY_B64      "$GOOGLE_SA_KEY_B64"      "$E"
  add AUTH_SECRET            "$AUTH_SECRET"            "$E"
  add AUTH_HOSTED_DOMAIN     "$AUTH_HOSTED_DOMAIN"     "$E"
  add AUTH_GOOGLE_ID         "$AUTH_GOOGLE_ID"         "$E"
  add AUTH_GOOGLE_SECRET     "$AUTH_GOOGLE_SECRET"     "$E"
done
echo "✅ Terminé. Vérifie avec : vercel env ls"
