# Pointages — automatisation des relances

Automatise les relances hebdomadaires des points de vente concerts (Bleu Citron) :
lit le doc de suivi, génère un mail individuel par destinataire, et crée les
**brouillons** dans `pointage@bleucitron.net` (l'équipe relit et envoie à la main).

## Architecture

```
pointage suivi.xlsx (Drive)
        │  Drive API + SheetJS (live)  ─ ou ─  data/relances.json (snapshot, repli)
        ▼
src/lib/normalize.ts   texte libre → champs explicites (statut, cadence…)
src/lib/engine.ts      sélection du jour + rendu des mails (objet/corps)
src/lib/gmail.ts       service account → création des brouillons (rien n'est envoyé)
        ▼
src/app/page.tsx       dashboard (stats, aperçu, génération, exclusions)
src/app/api/drafts     POST { confirm?, date?, limit?, test? }
src/app/api/cron/...   cron Vercel (lundi) → brouillons du jour
```

## Logique d'aiguillage

`SKIP` si le statut contient : `LIAISON PIMS`, `AUTONOME`, `AUTOMATIQUE`,
`COMPLET`, `NE PAS RELANCER`, `MEV`, « ne veut/donne pas ». Sinon `RELANCE`,
cadence par défaut = **lundi** (cadences spécifiques mardi / 1×semaine reconnues).

## Variables d'environnement

| Var | Rôle |
|---|---|
| `PIMS_BASE_URL` / `PIMS_USERNAME` / `PIMS_PASSWORD` | API PIMS (phase 2) |
| `GOOGLE_APPLICATION_CREDENTIALS` (dev) / `GOOGLE_SA_KEY_B64` (prod) | clé service account |
| `GMAIL_IMPERSONATE` | boîte incarnée (`pointage@bleucitron.net`) |
| `POINTAGE_SHEET_FILE_ID` | id Drive du doc de suivi |
| `CRON_SECRET` | protège l'endpoint cron |

Scopes service account (délégation domaine) : `gmail.modify`, `gmail.send`,
`drive.readonly`.

## Dev

```bash
npm install
python3 scripts/import_sheet.py   # régénère le snapshot data/relances.json
npm run dev                        # http://localhost:3000
```

## Roadmap

- [x] Phase 1 — relances du lundi en brouillons validés
- [ ] Déploiement Vercel + cron hebdo
- [ ] Phase 2 — parsing des réponses entrantes + push PIMS
- [ ] Phase 3 — billets tiers via TAL-API (Aparté)
