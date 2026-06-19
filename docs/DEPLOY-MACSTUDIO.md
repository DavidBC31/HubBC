# Déploiement sur Mac Studio (auto-hébergé)

Procédure adaptée au Mac Studio de l'équipe Bleu Citron.
Chemins spécifiques : `~/Projets/HubBC`.

Pour le contexte complet (Google, Cloudflare, pm2) : voir [DEPLOY-MACMINI.md](./DEPLOY-MACMINI.md) et [SETUP-GOOGLE.md](./SETUP-GOOGLE.md).

---

## Architecture deux domaines

Un seul serveur Next.js (`localhost:3000`), deux domaines via Cloudflare Tunnel :

| Domaine | Usage |
|---|---|
| `justif.bleucitron.app` | Formulaire de dépôt de justificatifs (collaborateurs) |
| `pointages.bleucitron.net` | Dashboard des relances automatisées |

La racine `/` de `justif.bleucitron.app` redirige automatiquement vers `/justificatifs`.

---

## 1. Préparation machine

```bash
brew install node git cloudflared
npm install -g pm2
sudo pmset -a sleep 0 disksleep 0   # empêche la mise en veille
```

## 2. Récupérer le code et construire

```bash
mkdir -p ~/Projets
cd ~/Projets
git clone <URL_DU_REPO> HubBC
cd HubBC
npm ci
npm run build
```

## 3. Secrets

Créer `~/Projets/HubBC/.env.local` à partir du gabarit :

```bash
cp .env.local.example .env.local
# éditer avec les vraies valeurs
```

Variables obligatoires (voir `.env.local.example` pour la liste complète) :

```bash
GOOGLE_APPLICATION_CREDENTIALS=./.secrets/service-account.json
GMAIL_IMPERSONATE=pointage@bleucitron.net
JUSTIF_MAILBOX=azais@bleucitron.net
JUSTIF_DRIVE_FOLDER=15ucT77NBT_30rVagMfpfhZDssmf_NpxU
BCD_SHEET_FILE_ID=1PXay_SqirJyT1P6IXS2iSVN5J9TMM_ffZdj2ZS6FcTI
POINTAGE_SHEET_FILE_ID=1zsVu3Y4xitX3tULNpwqr5blaeUC6X5ll
AUTH_GOOGLE_ID=...apps.googleusercontent.com
AUTH_GOOGLE_SECRET=...
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_HOSTED_DOMAIN=bleucitron.net
CRON_SECRET=$(openssl rand -hex 32)
```

Déposer la clé service account :

```bash
mkdir -p ~/Projets/HubBC/.secrets
# copier le fichier JSON téléchargé depuis Google Cloud Console
cp /chemin/vers/service-account.json ~/Projets/HubBC/.secrets/service-account.json
chmod 600 ~/Projets/HubBC/.secrets/service-account.json
```

> `.env.local` et `.secrets/` sont gitignorés — ils ne doivent **jamais** partir dans git.

## 4. Service pm2

Adapter le `cwd` dans `deploy/ecosystem.config.js` avant de lancer :

```bash
# Éditer deploy/ecosystem.config.js : remplacer /Users/<user>/apps/Pointages
# par /Users/<user_macstudio>/Projets/HubBC

cd ~/Projets/HubBC
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup   # exécuter la commande affichée avec sudo
```

Vérification : `pm2 status` → `pointages` en ligne.

## 5. Cloudflare Tunnel (deux domaines)

```bash
cloudflared tunnel login
cloudflared tunnel create pointages
cloudflared tunnel route dns pointages justif.bleucitron.app
cloudflared tunnel route dns pointages pointages.bleucitron.net
```

Copier et adapter la configuration :

```bash
cp ~/Projets/HubBC/deploy/cloudflared-config.example.yml ~/.cloudflared/config.yml
# Remplacer <user> et <TUNNEL_ID> par les valeurs réelles
```

La config pointe les **deux** hostnames vers `http://localhost:3000`.

Lancer en service permanent :

```bash
cloudflared service install
```

## 6. Console Google OAuth

Dans **APIs & Services → Credentials → ton client OAuth** :

**Authorized redirect URIs** (les deux) :
- `https://justif.bleucitron.app/api/auth/callback`
- `https://pointages.bleucitron.net/api/auth/callback`

**Authorized JavaScript origins** (les deux) :
- `https://justif.bleucitron.app`
- `https://pointages.bleucitron.net`

## 7. Crontab

```bash
# Copier le modèle, remplacer <CRON_SECRET> par la valeur de .env.local
crontab ~/Projets/HubBC/deploy/crontab.example
```

Deux tâches planifiées :
- **2 h chaque nuit** — archivage des justificatifs → `justif.bleucitron.app`
- **7 h chaque lundi** — relances pima → `pointages.bleucitron.net`

Logs : `~/Projets/HubBC/cron.log`.

## 8. Mettre à jour après un commit

```bash
cd ~/Projets/HubBC
./deploy/update.sh
```

Le script fait `git pull --ff-only && npm ci && npm run build && pm2 restart pointages`.

## 9. Diagnostic accès Sheets

```bash
cd ~/Projets/HubBC
node scripts/test-sheet.mjs
```

Affiche les onglets du classeur et le nombre de lignes. Utile pour vérifier la délégation domaine.

## 10. Checklist de vérification

- [ ] `pm2 status` → `pointages` en ligne
- [ ] `curl -I http://localhost:3000/justificatifs` → 307 (redirection SSO)
- [ ] `https://justif.bleucitron.app/` → redirige vers `/justificatifs` → redirige vers Google SSO
- [ ] `https://pointages.bleucitron.net/` → dashboard relances (après SSO)
- [ ] Connexion Google `@bleucitron.net` → identité pré-remplie sur le formulaire
- [ ] Dépôt test → mail reçu sur `azais@bleucitron.net` → archivage Drive OK → CSV exportable
- [ ] Machine ne se met pas en veille : `pmset -g | grep sleep`
