# Mise en route Google (SSO + service-account délégué)

Deux mécanismes Google distincts cohabitent dans le projet :

| Mécanisme | Sert à | Identité utilisée |
|---|---|---|
| **OAuth client (SSO)** | Connexion du/de la collaborateurice sur `/justificatifs` | l'utilisateur lui-même |
| **Service-account + délégation domaine** | Lire/envoyer des mails, lire des Sheets, archiver sur Drive côté serveur | une boîte impersonnée (`pointage@`, `azais@`…) |

---

## 1. OAuth client (SSO Google) — US-01

But : récupérer Nom / Prénom / Email du collaborateur à la connexion.

### Création
1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Type d'application : **Web application**.
3. **Écran de consentement** : type **Internal** (réservé au Workspace `bleucitron.net`) → pas de validation Google nécessaire, et seuls les comptes du domaine peuvent se connecter.
4. Scopes : `openid`, `email`, `profile` (par défaut, rien à ajouter).

### Liens à autoriser ⚠️ (ta question)

**Authorized redirect URIs** — la route de callback, pour chaque domaine
(le SSO protège **les deux** applications, dépôt justificatifs **et** dashboard relances) :
```
http://localhost:3000/api/auth/callback                      (dev local)
https://justif.bleucitron.app/api/auth/callback               (dépôt justificatifs)
https://pointages.bleucitron.net/api/auth/callback            (dashboard relances)
```

**Authorized JavaScript origins** — l'origine seule (sans chemin) :
```
http://localhost:3000
https://justif.bleucitron.app
https://pointages.bleucitron.net
```

> Le chemin `/api/auth/callback` est imposé par le code (`src/app/api/auth/callback`). Le `redirect_uri` envoyé à Google est calculé dynamiquement comme `<origin>/api/auth/callback` ; il **doit** figurer à l'identique dans la liste ci-dessus, sinon Google renvoie `redirect_uri_mismatch`.
>
> Les domaines de preview Vercel changent à chaque déploiement : le plus simple est d'ajouter un domaine de preview stable (alias) plutôt que chaque URL générée.

### Variables d'environnement
```
AUTH_GOOGLE_ID=<client_id>.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=<client_secret>
AUTH_SECRET=<openssl rand -base64 32>     # signe le cookie de session
AUTH_HOSTED_DOMAIN=bleucitron.net          # refuse les comptes hors domaine
```

---

## 2. Délégation domaine (service-account) ✅ (ta demande)

But : permettre au service-account d'agir **au nom** de boîtes du domaine, sans
mot de passe, côté serveur. Utilisé pour : lire/écrire dans Gmail, lire les
Sheets (BCD, suivi pointages), archiver sur Drive.

### Étape A — Le service-account
1. Google Cloud Console → **IAM & Admin → Service Accounts → Create**.
2. Une fois créé : onglet **Keys → Add key → JSON**. Télécharge le fichier.
   - En **dev** : place-le hors git (ex. `./.secrets/service-account.json`) et garde `GOOGLE_APPLICATION_CREDENTIALS` qui pointe dessus.
   - En **prod (Vercel)** : encode-le en base64 et mets-le dans `GOOGLE_SA_KEY_B64`
     ```
     base64 -i .secrets/service-account.json | pbcopy
     ```
3. Note le **Client ID** numérique du service-account (onglet *Details*, ou *Unique ID*). Il sert à l'étape B.
4. Active les **APIs** dans le projet Cloud : *Gmail API*, *Google Drive API*, *Google Sheets API*.

### Étape B — Autoriser la délégation dans le Workspace
1. **Admin Console** Google Workspace (admin.google.com) avec un compte super-admin.
2. **Sécurité → Contrôle des données et des accès → Contrôles des API → Délégation au niveau du domaine** (*Domain-wide delegation*).
3. **Ajouter** → renseigne :
   - **Client ID** = le Client ID numérique du service-account (étape A.3).
   - **Scopes OAuth** (exactement ceux utilisés par le code, séparés par des virgules) :
     ```
     https://www.googleapis.com/auth/gmail.modify,
     https://www.googleapis.com/auth/gmail.send,
     https://www.googleapis.com/auth/gmail.readonly,
     https://www.googleapis.com/auth/drive
     ```
4. Valider. La propagation prend quelques minutes.

### Étape C — Vérifier
- Boîtes impersonnées par le code : `pointage@bleucitron.net` (relances) et
  `azais@bleucitron.net` (écoute justificatifs, via `JUSTIF_MAILBOX`).
- Ces boîtes doivent exister dans le domaine. Le dashboard relances affiche déjà
  un voyant « Accès boîte pointage@ » (`checkAccess`) — utile pour tester.

> Sécurité : la délégation donne au service-account un accès large aux boîtes du
> domaine pour les scopes listés. Restreindre aux scopes ci-dessus (pas de `mail.google.com` complet) et garder la clé JSON secrète.

---

## 3. Récapitulatif des variables d'environnement

```bash
# Service-account (un des deux)
GOOGLE_APPLICATION_CREDENTIALS=./.secrets/service-account.json   # dev
GOOGLE_SA_KEY_B64=<base64 du JSON>                               # prod Vercel

# Boîtes impersonnées
GMAIL_IMPERSONATE=pointage@bleucitron.net
JUSTIF_MAILBOX=azais@bleucitron.net

# Sources de données
BCD_SHEET_FILE_ID=1PXay_SqirJyT1P6IXS2iSVN5J9TMM_ffZdj2ZS6FcTI   # annuaire matricule
POINTAGE_SHEET_FILE_ID=...                                        # suivi relances
JUSTIF_DRIVE_FOLDER=15ucT77NBT_30rVagMfpfhZDssmf_NpxU            # archivage justificatifs

# SSO
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_SECRET=...
AUTH_HOSTED_DOMAIN=bleucitron.net

# Divers
CRON_SECRET=...
```
