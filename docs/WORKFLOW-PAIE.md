# Workflow paie mensuel — fichier d'import sPAIEctacle combiné

> Doc de specs **vivant**. Capture les décisions au fil de l'eau. Statut : en cours
> de cadrage — la brique « justifs » existe, les briques « Lucca » et « assemblage »
> sont à construire.

## Objectif

Produire **un seul fichier d'import sPAIEctacle** par mois, regroupant **par
salarié·e** trois sources :

1. **Justificatifs** (téléphone, transport, mobilité, Navigo) — collectés via le
   module `/justificatifs` (emails sur `justif@bleucitron.net`).
2. **Absences** (CP, RTT, maladies, bientôt récup) — tirées de **Lucca via API**.
3. **Tickets restaurant** — tirés de **Lucca via API**.

Le fichier final est **envoyé par mail** à : `azais@`, `shanti@`,
`laurebessieres@`, `david@bleucitron.net`, prêt à importer.

Déclenchement : **mensuel** (dernier lundi ou mercredi — à fixer), via cron sur
le Mac Studio, avec garde « dernier jour ouvré du type choisi ».

## Format de sortie — LONG / rubrique  ✅ décidé

Une **ligne par (matricule, rubrique)**. Colonnes (cf. `Export_rubrique` et la
CSV TR fournie, partie L→R) :

```
Matricule | (nom salarié) | (prénom salarié) | Code rubrique | Libellé rubrique | Quantité rubrique | Base rubrique
```

- Encodage cible : à confirmer (les exports sPAIEctacle observés sont en **Windows-1252**, séparateur tabulation ou `;`).
- `Base` = montant en euros (décimale **virgule** côté sPAIEctacle).

## Briques

### 1. Justificatifs — ✅ existe

`buildJustificatifsCSV()` (`src/lib/justificatifs.ts`) produit déjà des lignes
rubrique : `matricule ; nom ; prenom ; mois ; code_rubrique ; libelle ; quantite ; base`.

| Type dépôt | Code rubrique | Quantité | Base |
|---|---|---|---|
| Forfait téléphonique | `Ft50` | 1 | **50 %** du montant saisi (plafond saisie 60 €) |
| Pass Navigo | `CNa` | 1 | montant |
| Mobilité douce | `MOBI` | 1 | montant |
| Transport en commun | `CO` | 1 | montant |

> À venir : quelques **codes rubrique sPAIEctacle supplémentaires** (fournis par le métier).

### 2. Absences (Lucca API) — 🔨 à construire

Le moteur `src/lib/absences.ts` sait déjà transformer un export Lucca (large) en
matrice. Pour le fichier combiné il faudra **convertir large → long** : chaque type
devient une ligne rubrique.

- Codes : via `LUCCA_CODE_MAP` (déjà en place) — `1124/1125/1126→CPr`, `1224..→RTT`,
  `1325/1326→JRS`, `5/7→AbMa`, `6→AbMaP`, `1/2→AbMaT`, `18/21→AbJo`.
- Quantité = nombre de jours ; Libellé = phrase Lucca (« Prise(s) de 1 CP entre le… »).
- **Base = ?** *(à confirmer : l'exemple montre CPr base=0 ; les montants maladie semblent calculés par sPAIEctacle → probablement 0 à l'import).*

### 3. Tickets restaurant (Lucca API) — 🔨 à construire

Source Lucca (colonnes A→J de la CSV TR) : `Établissement, Matricule, Nom, Prénom,
Période, Nombre TR, Valeur faciale, Montant total, Part employeur, Part collaborateur`.

Règle de transformation → **2 lignes par salarié·e** :

| Code rubrique | Libellé | Quantité (col Q) | Base (col R) |
|---|---|---|---|
| `TRt` | Ticket restaurant | = **Nombre TR** (col F) | **−10,5** *(= −valeur faciale)* |
| `TRp` | Ticket restaurant part employeur | = **Nombre TR** (col F) | **+5,25** *(= part employeur)* |

> Hypothèse : −10,5 / +5,25 sont la valeur faciale et la part employeur (cols G et I).
> À dériver de ces colonnes pour rester robuste si elles changent — à valider.

### 4. Assemblage + envoi (job mensuel) — 🔨 à construire

`Lucca (absences + TR) + justifs (emails) → fusion par matricule → fichier long → email aux 4 destinataires`.
Réutilise l'envoi Gmail existant (service account délégué).

## Inconnues / à fournir

- [ ] **API Lucca** : URL de l'instance + clé d'API (→ `.env.local`, jamais commitée) + doc/exemple JSON.
- [ ] **Base des lignes d'absence** à l'import (0 ? calculé ?).
- [ ] **Codes rubrique justifs supplémentaires** (métier).
- [ ] **Encodage/séparateur** exact attendu à l'import (Windows-1252 ? tab ? `;`).
- [ ] **Jour de déclenchement** (dernier lundi vs mercredi).

## Clé de jointure

Le **matricule** relie les trois sources (justifs : résolu via l'annuaire BCD ;
Lucca : présent nativement). C'est la clé de regroupement par salarié·e.
