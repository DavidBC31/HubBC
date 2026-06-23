# Guide utilisateur — Outils paie Bleu Citron

Ce projet regroupe **trois petits outils** qui font gagner du temps au Pôle Social
avant chaque clôture de paie. Voici à quoi ils servent, comment ils marchent, et
comment les tester.

---

## 🧾 1. Dépôt de justificatifs (pour tous les collaborateurs)

**À quoi ça sert :** permettre à chacun d'envoyer ses justificatifs de frais
(téléphone, transport…) en 30 secondes, sans email manuel ni pièce jointe perdue.

### Comment ça marche, côté collaborateur
1. J'ouvre le lien de l'outil.
2. Je me connecte avec **mon compte Google Bleu Citron** (mon nom est reconnu
   automatiquement).
3. Je choisis le **type** de justificatif :
   - Forfait téléphonique *(remboursement plafonné à 30 €)*
   - Mobilité douce
   - Transport en commun
   - Pass Navigo
4. Je saisis le **montant** et le **mois** concerné.
5. Je **glisse ma facture** (ou je clique pour la choisir).
6. Je clique sur **« Envoyer mon justificatif »**. C'est tout.

### Ce qui se passe ensuite, côté Pôle Social
- Un email standardisé arrive automatiquement sur **justif@bleucitron.net**, avec
  la facture en pièce jointe. L'objet contient déjà le mois, le type et le nom :
  > `[JUSTIF-PAIE] 2026-06 — Forfait téléphonique — Chloé Courtois`
- Un traitement automatique range les pièces dans le **Drive du mois** et prépare
  un **fichier prêt à importer dans sPAIEctacle**.

> En clair : le collaborateur n'a qu'un formulaire à remplir, et le Pôle Social
> reçoit tout déjà trié.

---

## 📅 2. Nettoyeur d'absences (pour le Pôle Social)

**À quoi ça sert :** transformer l'export d'absences de Lucca au format strict
exigé par sPAIEctacle, sans manipulation Excel.

### Comment ça marche
1. J'exporte les absences depuis **Lucca** (le fichier habituel : `.txt`/`.tsv`
   tabulé, ou `.csv`, ou `.xlsx` — l'outil détecte le format tout seul).
2. J'ouvre l'outil et je **dépose ce fichier**.
3. L'outil fusionne automatiquement les lignes : **une seule ligne par personne
   et par type d'absence**, avec les dates mises bout à bout
   (`10/05 11/05, 20/05 20/05`).
4. Je vérifie l'aperçu (nb de collaborateurs, lignes fusionnées, éventuels
   avertissements), puis je **télécharge** le fichier `absences_spaiectacle.tsv`,
   prêt à importer dans sPAIEctacle.

**Regroupement maladie** : par défaut, les sous-types maladie/accident
(`AbMa`, `AbMaP`, `AbMaT`) sont regroupés dans `AbMa` (décision V1 — Azaïs
ajuste à la main si besoin). Une case à cocher permet de **conserver le détail**.

> Le fichier est traité **directement dans le navigateur** : aucune donnée RH
> n'est envoyée sur un serveur.

---

## 📈 3. Relances pointages (existant)

Outil interne qui prépare les emails de relance aux salles pour récupérer les
chiffres de billetterie. (Déjà en place, hors périmètre de ce guide.)

---

## ✅ Comment tester en local

> Le serveur de développement de Next.js a un bug connu (il plante au bout de
> quelques secondes). On lance donc en **mode “production locale”**, stable.

Dans un terminal, à la racine du projet :

```bash
npm run build      # construit l'app (~10 s)
npm run start      # démarre le serveur (port 3000 en local ; 3002 sur le Mac Studio)
npm test           # lance les tests unitaires (nettoyeur d'absences)
```

Puis dans le navigateur :

| Outil | En local | En production |
|---|---|---|
| Dépôt justificatifs | http://localhost:3000/justificatifs | https://justif.bleucitron.app/justificatifs |
| Nettoyeur d'absences | http://localhost:3000/absences | https://justif.bleucitron.app/absences |

- Sur **/justificatifs**, tu seras redirigé vers la connexion Google
  (compte `@bleucitron.net`) puis ramené sur le formulaire, ton nom pré-rempli.
- Sur **/absences**, dépose un export Lucca et récupère le fichier nettoyé.

Pour tester un **envoi réel** de justificatif, il faut que la délégation Google
soit active (voir `docs/SETUP-GOOGLE.md`). Sinon le formulaire fonctionne mais
l'envoi affiche un message d'erreur propre.

---

## 🔧 Ce qu'il reste à finaliser

- **2 codes de rubrique sPAIEctacle** à confirmer par Azaïs (Mobilité douce et
  Transport en commun) — en attendant, ces lignes sortent avec le libellé mais
  sans code.
- **Mise en ligne** : une fois déployé sur Vercel, le lien `/justificatifs` sera
  l'URL à diffuser aux collaborateurs.
