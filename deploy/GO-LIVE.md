# Checklist de mise en ligne

Procédure condensée pour passer en production sur le Mac Mini. Détails complets :
[../docs/DEPLOY-MACMINI.md](../docs/DEPLOY-MACMINI.md) et
[../docs/SETUP-GOOGLE.md](../docs/SETUP-GOOGLE.md).

Les fichiers de ce dossier (`deploy/`) sont des **gabarits** : remplace les
placeholders `<user>`, `<TUNNEL_ID>`, `<CRON_SECRET>` par les vraies valeurs.

## 1. Machine prête
- [ ] Node ≥ 20, `git`, `pm2`, `cloudflared` installés (`brew install …`).
- [ ] Mise en veille désactivée : `sudo pmset -a sleep 0 disksleep 0`.

## 2. Code + secrets
- [ ] `git clone` puis `npm ci && npm run build` (le build passe en ~25 s).
- [ ] `.env.local` rempli (copier depuis `../.env.local.example`).
- [ ] Clé service account déposée dans `.secrets/service-account.json`.

## 3. Service applicatif (pm2)
- [ ] `pm2 start deploy/ecosystem.config.js` (adapter `cwd` au chemin réel).
- [ ] `pm2 save` puis `pm2 startup` (exécuter la commande affichée, avec `sudo`).
- [ ] `pm2 status` → `pointages` en ligne ; `curl -I http://localhost:3000/justificatifs` → 307.

## 4. HTTPS public (Cloudflare Tunnel)
- [ ] Tunnel créé et DNS routé (cf. DEPLOY-MACMINI.md §5).
- [ ] `~/.cloudflared/config.yml` copié depuis `deploy/cloudflared-config.example.yml`.
- [ ] Tunnel lancé en service (`cloudflared service install`).
- [ ] L'URL publique répond et redirige vers Google.

## 5. Console Google OAuth
- [ ] Redirect URI : `https://justif.bleucitron.net/api/auth/callback`.
- [ ] JavaScript origin : `https://justif.bleucitron.net`.

## 6. Traitements planifiés
- [ ] `crontab deploy/crontab.example` (après avoir renseigné `<CRON_SECRET>`).
- [ ] Vérifier une exécution dans `~/apps/Pointages/cron.log`.

## 7. Recette finale
- [ ] Connexion Google `@bleucitron.net` → formulaire `/justificatifs`, identité pré-remplie.
- [ ] Dépôt test → mail sur `justif@` → archivage Drive OK.
- [ ] **Diffuser le lien `https://justif.bleucitron.net/justificatifs`** aux collaborateurs.
