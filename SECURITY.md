# Sécurité

## Vulnérabilités connues et acceptées

Audit `npm audit` au 2026-06-16. Les deux entrées ci-dessous sont **acceptées**
en l'état après analyse du risque réel ; elles n'ont pas de correctif applicable
sans casse.

### `xlsx` — Prototype Pollution + ReDoS (high)

- Avis : [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6),
  [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9).
- **Risque pratique : faible.** `XLSX.read()` n'est appelé que dans
  `src/lib/sheet.ts` et `src/lib/matricule.ts`, sur des fichiers téléchargés
  depuis **nos propres Google Sheets** (référentiels BCD / POINTAGE), jamais sur
  des fichiers fournis par un tiers. Les justificatifs reçus par mail (non
  fiables) sont traités en JSON, sans passer par `xlsx`.
- **Pas de correctif npm** : le paquet publié est figé en 0.18.5. Remédiation
  possible si besoin : passer au build officiel SheetJS (CDN, 0.20.x patché).

### `postcss` < 8.5.10 — XSS au stringify (moderate)

- Avis : [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93).
- **Non exploitable ici** : dépendance transitive de `next`, utilisée uniquement
  **au build** sur notre propre CSS. Le `npm audit fix --force` rétrograderait
  `next` 16 → 9.3.3 (cassant) ; on ne l'applique pas.
- Se résoudra quand `next` mettra à jour son `postcss` embarqué.

> ⚠️ Ne **jamais** lancer `npm audit fix --force` sur ce projet : il casse la
> version de Next.js. Mettre à jour les dépendances manuellement.
