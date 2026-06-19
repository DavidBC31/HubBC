# Déploiement sur Mac Studio (auto-hébergé)

Procédure adaptée au Mac Studio de l'équipe Bleu Citron.
Chemins spécifiques : `~/Projets/HubBC`.

Pour le contexte complet (Google, Cloudflare, pm2) : voir [DEPLOY-MACMINI.md](./DEPLOY-MACMINI.md) et [SETUP-GOOGLE.md](./SETUP-GOOGLE.md).

---

## Place de HubBC dans le Mac Studio

Le Mac Studio héberge **plusieurs projets indépendants**, chacun sur son port et
son sous-domaine, derrière un seul Cloudflare Tunnel. Un portail `hub` ne fait
que centraliser les liens. **HubBC est le projet « justificatifs »** ; il sert
le domaine `justif.bleucitron.app` sur le port **3002**.

> ⚠️ Le code de ce dépôt contient aussi un dashboard de relances (route `/`),
> mais en production les relances sont servies par un **autre** projet
> (`~/Projets/pointages`, port 3001). Sur le domaine justif, la racine `/`
> redirige de toute façon vers `/justificatifs` : le dashboard relances de
> HubBC est donc dormant et ne doit pas être confondu avec celui en prod.

### Plan des ports (à garder à jour — un décalage ici = bug de routage)

| Port | Domaine | Projet | pm2 |
|---|---|---|---|
| 3000 | `hub.bleucitron.app` | portail hub | `hub` |
| 3001 | `pointages.bleucitron.app` | `~/Projets/pointages` (relances) | `pointages` |
| **3002** | **`justif.bleucitron.app`** | **`~/Projets/HubBC` (justif)** | **`pointages-app`** |
| 3003 | `findash.bleucitron.app` | findash | `findash` |

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

Le process pm2 de HubBC s'appelle **`pointages-app`** et écoute sur le port
**3002** (`next start -p 3002`), `cwd = ~/Projets/HubBC`. Adapter `deploy/ecosystem.config.js`
en conséquence (nom, port, cwd) avant de lancer :

```bash
cd ~/Projets/HubBC
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup   # exécuter la commande affichée avec sudo
```

Vérification : `pm2 status` → `pointages-app` en ligne.

> Après chaque `git pull` + `npm run build`, **redémarrer le bon process** :
> `pm2 restart pointages-app` (pas `pointages`, qui est le projet relances
> voisin sur 3001). `./deploy/update.sh` s'en charge.

## 5. Cloudflare Tunnel (HubBC = un domaine, un port)

HubBC n'occupe **qu'une** entrée du tunnel : `justif.bleucitron.app → localhost:3002`.
Les autres projets (hub, pointages, findash) ont leurs propres entrées — voir le
plan des ports en tête de ce document. Le tunnel est partagé ; on **ajoute** juste
l'entrée justif à `~/.cloudflared/config.yml` :

```yaml
  - hostname: justif.bleucitron.app
    service: http://localhost:3002
    originRequest:
      # Présente le vrai hostname public à l'app (sinon elle voit localhost:3002
      # et construit un mauvais redirect_uri OAuth / ne déclenche pas la
      # redirection par domaine du proxy).
      httpHostHeader: justif.bleucitron.app
```

Router le DNS une fois, puis recharger le tunnel :

```bash
cloudflared tunnel route dns <tunnel> justif.bleucitron.app
cloudflared service restart   # ou: pm2 restart cloudflared, selon le lancement
```

`deploy/cloudflared-config.example.yml` montre un exemple de tunnel multi-projets complet.

## 6. Console Google OAuth

HubBC ne sert qu'un domaine. Dans **APIs & Services → Credentials → ton client OAuth** :

**Authorized redirect URIs** :
- `https://justif.bleucitron.app/api/auth/callback`

**Authorized JavaScript origins** :
- `https://justif.bleucitron.app`

## 7. Crontab

```bash
# Copier le modèle, remplacer <CRON_SECRET> par la valeur de .env.local
crontab ~/Projets/HubBC/deploy/crontab.example
```

Tâche planifiée côté HubBC :
- **2 h chaque nuit** — archivage des justificatifs → `https://justif.bleucitron.app/api/justificatifs`

> Les relances (lundi 7 h) relèvent du projet voisin `~/Projets/pointages`, pas
> de HubBC : leur cron vit dans ce dépôt-là.

Logs : `~/Projets/HubBC/cron.log`.

## 8. Mettre à jour après un commit

```bash
cd ~/Projets/HubBC
./deploy/update.sh
```

Le script fait `git pull --ff-only && npm ci && npm run build && pm2 restart pointages-app`.

## 9. Diagnostic accès Sheets

```bash
cd ~/Projets/HubBC
node scripts/test-sheet.mjs
```

Affiche les onglets du classeur et le nombre de lignes. Utile pour vérifier la délégation domaine.

## 10. Checklist de vérification

- [ ] `pm2 status` → `pointages-app` en ligne (port 3002)
- [ ] `curl -sI -H "Host: justif.bleucitron.app" http://localhost:3002/` → 307 + `x-justif-host: justif.bleucitron.app`
- [ ] `curl -I http://localhost:3002/justificatifs` → 307 (redirection SSO)
- [ ] `https://justif.bleucitron.app/` → redirige vers `/justificatifs` → redirige vers Google SSO
- [ ] Connexion Google `@bleucitron.net` → identité pré-remplie sur le formulaire
- [ ] Dépôt test → mail reçu sur `azais@bleucitron.net` → archivage Drive OK → CSV exportable
- [ ] Machine ne se met pas en veille : `pmset -g | grep sleep`

## 11. Dépannage — « justif.bleucitron.app affiche les relances »

Symptôme : sur `https://justif.bleucitron.app/` on voit le dashboard des
relances au lieu d'être redirigé vers le formulaire `/justificatifs`.

La redirection par domaine du proxy se base sur le **host** reçu par le serveur.
Derrière le tunnel, le serveur expose un en-tête de diagnostic `x-justif-host`
qui indique le host réellement vu. Diagnostiquer :

```bash
# Public (via le tunnel)
curl -sI https://justif.bleucitron.app/ | grep -i -E 'HTTP/|location|x-justif-host'
# Local (le vrai HubBC est sur 3002, PAS 3000 qui est le portail hub)
curl -sI -H "Host: justif.bleucitron.app" http://localhost:3002/ | grep -i -E 'HTTP/|location|x-justif-host'
```

Interprétation :

- **`307` + `location: …/justificatifs`** → tout est bon (vide le cache du
  navigateur si tu vois encore l'ancienne page : `Cmd+Shift+R`).
- **Le test local 3002 ne renvoie pas 307 / pas de `x-justif-host`** → pm2 sert
  un ancien build. Reconstruire **et redémarrer le bon process** :
  `npm run build && pm2 restart pointages-app` (⚠️ `pointages-app`, pas
  `pointages` qui est le projet relances voisin sur 3001). `./deploy/update.sh`
  enchaîne pull + build + restart.
- **Le local 3002 est OK mais le public ne l'est pas, avec `x-justif-host:
  localhost`** → le tunnel ne présente pas le bon host. L'entrée
  `justif.bleucitron.app` de `~/.cloudflared/config.yml` doit cibler
  `http://localhost:3002` **et** forcer `originRequest.httpHostHeader:
  justif.bleucitron.app` (voir §5). Recharger ensuite : `cloudflared service restart`.
