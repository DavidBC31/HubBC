# Déploiement sur Mac Mini (auto-hébergé)

L'app est un serveur Next.js standard. On la fait tourner en **mode production**
(`next start`) — stable, contrairement au mode dev (bug Turbopack connu).

Pré-requis Google (OAuth + délégation domaine) : voir [SETUP-GOOGLE.md](./SETUP-GOOGLE.md).

---

## 1. Logiciels à installer

```bash
# Node.js >= 20 LTS (22/24 recommandé) — via Homebrew par ex.
brew install node git

# Gestionnaire de process (relance auto + démarrage au boot)
npm install -g pm2
```

Empêcher la mise en veille de la machine (sinon le service s'arrête) :
```bash
sudo pmset -a sleep 0 disksleep 0
```

## 2. Récupérer le code et construire

```bash
cd ~/apps          # ou l'emplacement de ton choix
git clone <URL_DU_REPO> Pointages
cd Pointages
npm ci
npm run build      # build de production (~10 s)
```

## 3. Secrets et configuration

Créer `~/apps/Pointages/.env.local` (jamais commité) :

```bash
# Google service account (délégation domaine)
GOOGLE_APPLICATION_CREDENTIALS=./.secrets/service-account.json
GMAIL_IMPERSONATE=pointage@bleucitron.net
JUSTIF_MAILBOX=azais@bleucitron.net
JUSTIF_DRIVE_FOLDER=15ucT77NBT_30rVagMfpfhZDssmf_NpxU

# Référentiels
BCD_SHEET_FILE_ID=1PXay_SqirJyT1P6IXS2iSVN5J9TMM_ffZdj2ZS6FcTI
POINTAGE_SHEET_FILE_ID=1zsVu3Y4xitX3tULNpwqr5blaeUC6X5ll   # onglet « RELANCES / PIMS A SAISIR »

# SSO Google
AUTH_GOOGLE_ID=...apps.googleusercontent.com
AUTH_GOOGLE_SECRET=...
AUTH_SECRET=$(openssl rand -base64 32)     # clé de signature des cookies
AUTH_HOSTED_DOMAIN=bleucitron.net

# Sécurise les endpoints backend (cron) — METS UN VRAI SECRET
CRON_SECRET=$(openssl rand -hex 32)
```

> Pas de variables PIMS : le logiciel n'expose pas d'API, la saisie y reste
> manuelle. L'app se limite à la détection des réponses aux relances.

Déposer la clé du service account dans `~/apps/Pointages/.secrets/service-account.json`.

> ⚠️ `.env.local` et `.secrets/` sont gitignorés : ils ne doivent **jamais**
> partir dans git. On les copie manuellement sur la machine.

## 4. Lancer en service permanent (pm2)

```bash
cd ~/apps/Pointages
pm2 start "npm run start" --name pointages   # écoute sur le port 3000
pm2 save                                       # mémorise la liste des process
pm2 startup                                    # génère la commande de démarrage au boot
# -> exécuter la commande que pm2 affiche (avec sudo)
```

Commandes utiles : `pm2 logs pointages`, `pm2 restart pointages`, `pm2 status`.

*Alternative native macOS :* un `launchd` plist dans `~/Library/LaunchAgents/`
avec `RunAtLoad` + `KeepAlive` lançant `npm run start`. pm2 est plus simple.

## 5. Exposer en HTTPS (obligatoire pour le SSO Google)

Google OAuth refuse le HTTP (sauf `localhost`). Il faut une **URL https stable**.

### Option recommandée — Cloudflare Tunnel
Pas d'ouverture de port, HTTPS et domaine gérés par Cloudflare, traverse le NAT
de la box.

Un seul serveur Next.js sert **deux domaines** (mêmes routes, usages différents) :
`justif.bleucitron.app` (dépôt des justificatifs) et `pointages.bleucitron.net`
(dashboard des relances). Les deux pointent vers `localhost:3000`.

```bash
brew install cloudflared
cloudflared tunnel login                       # ouvre le navigateur, choisir le domaine
cloudflared tunnel create pointages
# Mapper les DEUX domaines vers le port local 3000 :
cloudflared tunnel route dns pointages justif.bleucitron.app
cloudflared tunnel route dns pointages pointages.bleucitron.net
```
`~/.cloudflared/config.yml` :
```yaml
tunnel: pointages
credentials-file: /Users/<user>/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: justif.bleucitron.app
    service: http://localhost:3000
  - hostname: pointages.bleucitron.net
    service: http://localhost:3000
  - service: http_status:404
```
Lancer le tunnel en service : `cloudflared service install` (ou via pm2).

### Alternative — reverse proxy local
**Caddy** (TLS automatique Let's Encrypt) sur la machine + redirection du port 443
de la box vers le Mac Mini + IP fixe ou DynDNS. Plus de config réseau.

## 6. Mettre à jour la console Google OAuth

Le SSO sert le **dépôt des justificatifs** (`justif.bleucitron.app`). Ajouter
dans le client OAuth (APIs & Services → Credentials) :

- **Authorized redirect URIs** : `https://justif.bleucitron.app/api/auth/callback`
- **Authorized JavaScript origins** : `https://justif.bleucitron.app`

C'est l'URL `https://justif.bleucitron.app/justificatifs` que tu diffuses aux
collaborateurs. (Si le dashboard relances sur `pointages.bleucitron.net` doit
aussi exiger une connexion Google, ajoute son callback de la même façon.)

## 7. Planifier les traitements (remplace les crons Vercel)

Via `crontab -e`. Exemple — archiver les justificatifs chaque nuit à 2 h :
```cron
0 2 * * *  curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" -d '{"archive":true}' https://justif.bleucitron.app/api/justificatifs >> ~/apps/Pointages/cron.log 2>&1
```
Et les relances (côté pointages) le lundi à 7 h :
```cron
0 7 * * 1  curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://pointages.bleucitron.net/api/cron/relances >> ~/apps/Pointages/cron.log 2>&1
```

## 8. Mettre à jour l'app après un changement de code

```bash
cd ~/apps/Pointages
git pull
npm ci
npm run build
pm2 restart pointages
```

## 9. Checklist de vérification

- [ ] `pm2 status` → `pointages` en ligne
- [ ] `curl -I http://localhost:3000/justificatifs` → 307 (redirection SSO)
- [ ] L'URL publique https répond et redirige vers Google
- [ ] Connexion Google `@bleucitron.net` → retour sur le formulaire, identité pré-remplie
- [ ] Dépôt test → mail reçu sur justif@ → `POST /api/justificatifs` (archive) → fichier dans le Drive
- [ ] Machine ne se met pas en veille (`pmset -g | grep sleep`)
