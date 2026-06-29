#!/usr/bin/env bash
# Met à jour l'app Pointages déjà déployée : récupère le code, réinstalle
# les dépendances, reconstruit et redémarre le service pm2.
#
# Usage : ./deploy/update.sh   (depuis la racine du dépôt sur la machine de prod)
set -euo pipefail

# Se place à la racine du dépôt, peu importe d'où le script est lancé.
cd "$(dirname "$0")/.."

echo "→ git pull"
git pull --ff-only

echo "→ npm ci (dépendances)"
npm ci

echo "→ npm run build"
npm run build

echo "→ pm2 restart pointages-app"
# Le process pm2 de HubBC s'appelle « pointages-app » (port 3002).
# NE PAS confondre avec « pointages » (projet relances voisin, ~/Projets/pointages, port 3001).
pm2 restart pointages-app

echo "✓ Mise à jour terminée."
