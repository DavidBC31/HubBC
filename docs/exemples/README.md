# Exemples — format sPAIEctacle (absences)

Fichiers **synthétiques** (aucune donnée réelle) servant de référence de format
pour le nettoyeur d'absences Lucca → sPAIEctacle (`/absences`).

| Fichier | Rôle |
|---|---|
| `absences_lucca_exemple.txt` | Entrée type, telle qu'exportée par **Lucca** (TSV tabulé). Plusieurs lignes par personne, une par période. |
| `absences_spaiectacle_exemple.tsv` | Sortie type, prête à **importer dans sPAIEctacle**. Une seule ligne par matricule, quantités sommées, dates concaténées. |

## Le format en bref

- **TSV** (séparateur = tabulation), encodage **UTF-8**, fins de ligne **CRLF**.
- Colonnes d'identité : `matricule`, `(nom)`, `(prenom)`.
- Puis, pour **chaque type d'absence**, deux colonnes :
  - `CODE` → quantité en jours (`1`, `0.5`, `1.5`…) ;
  - `CODE/L` → dates de la/les période(s) au format `JJ/MM JJ/MM`, plusieurs
    périodes séparées par `, `.
- Codes utilisés (déjà au format sPAIEctacle dans l'export Lucca) :
  `CPr` (congés payés), `AbMa`/`AbMaP`/`AbMaT` (famille maladie), `AbJo`
  (absence non payée), `RTT`, `JRS`.

## Règle de transformation

1. **Fusion** : une seule ligne par `matricule` ; les quantités d'un même type
   sont **sommées**, les dates **concaténées** (`05/05 05/05, 06/05 06/05`).
2. **Regroupement maladie** (activé par défaut, réversible dans l'UI) : `AbMa`,
   `AbMaP`, `AbMaT` sont fusionnés dans `AbMa` ; les colonnes d'origine sont vidées.

> ⚠️ L'export Lucca matérialise les cellules vides par une **espace** (`" "`) ;
> le parseur la neutralise. Voir `src/lib/absences.ts` et les tests
> `src/lib/absences.test.ts`.
