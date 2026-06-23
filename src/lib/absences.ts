/**
 * Nettoyeur d'absences Lucca -> format d'import sPAIEctacle (GHS).
 *
 * Port TypeScript isomorphe de `scripts/absences_clean.py` : sert au dashboard
 * web (transformation 100% côté navigateur — aucune donnée RH n'est envoyée au
 * serveur, cf. exigence RGPD du CdC SI-PRO16.2).
 *
 * Règle métier : 1 ligne par matricule et par type. Quantités sommées, dates
 * concaténées « Début Fin, Début Fin ». Voir le script Python pour le détail.
 */

const ID_COLS = ["matricule", "(nom)", "(prenom)", "nom", "prenom"];

// Décision David (2026-06-15) : famille maladie regroupée dans « AbMa » en V1,
// correction manuelle ensuite (pas de règles carence/forfait pour l'instant).
export const MALADIE_FAMILY = ["AbMa", "AbMaP", "AbMaT"];
export const MALADIE_TARGET = "AbMa";

// Codes numériques internes Lucca -> abréviation sPAIEctacle (fourni par le métier,
// 2026-06). Selon la config d'export, les colonnes peuvent porter ces codes plutôt
// que l'abréviation. Plusieurs codes peuvent viser la même abréviation (millésimes
// de CP/RTT, sous-types maladie) : ils sont alors fusionnés dans la même colonne.
export const LUCCA_CODE_MAP: Record<string, string> = {
  // Congés payés (par millésime)
  "1124": "CPr", "1125": "CPr", "1126": "CPr",
  // RTT (par millésime)
  "1224": "RTT", "1225": "RTT", "1226": "RTT",
  // JRS (par millésime)
  "1325": "JRS", "1326": "JRS",
  // Maladies & accidents
  "5": "AbMa",  // Maladie avec maintien
  "7": "AbMa",  // Maladie sans maintien
  "6": "AbMaP", // Maladie professionnelle
  "1": "AbMaT", // Accident de trajet
  "2": "AbMaT", // Accident de travail
  // Autres absences
  "18": "AbJo", // Absence à justifier
  "21": "AbJo", // Absence injustifiée
};

// Colonnes de sortie sPAIEctacle, dans l'ordre attendu à l'import (= en-tête
// observé des exports Lucca). Chaque type a une colonne quantité CODE et une
// colonne libellé/dates CODE/L.
export const SPCT_TYPES = ["CPr", "AbMa", "AbMaP", "AbJo", "AbMaT", "RTT", "JRS"];

/** En-tête brut d'une colonne de type -> abréviation sPAIEctacle.
 *  Code numérique Lucca connu -> mappé ; sinon renvoyé tel quel (déjà une abréviation). */
function toSpaiectacle(raw: string): string {
  const r = raw.trim();
  return LUCCA_CODE_MAP[r] ?? r;
}

export interface CleanStats {
  lignesEntree: number;
  collaborateurs: number;
  fusions: number;
}

export interface CleanResult {
  header: string[];
  rows: string[][];
  stats: CleanStats;
  warnings: string[];
}

const isLabelCol = (name: string) => name.endsWith("/L");

function remapCode(code: string, collapse: boolean): string {
  return collapse && MALADIE_FAMILY.includes(code) ? MALADIE_TARGET : code;
}

function parseQty(v: string): number {
  const s = (v ?? "").trim().replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fmtQty(x: number): string {
  if (x === 0) return "";
  return Number.isInteger(x) ? String(x) : String(x);
}

/** Découpe un texte délimité en lignes de cellules.
 *
 * Lucca exporte en TSV (tabulations), mais selon la config d'export on peut
 * recevoir du CSV `;` (Excel FR) ou `,`. On détecte le séparateur sur la ligne
 * d'en-tête (le plus fréquent l'emporte, tab prioritaire à égalité). Gère le BOM
 * et les fins de ligne CRLF/LF. Les fichiers .xlsx binaires sont convertis en
 * texte tabulé en amont (cf. cleaner.tsx, SheetJS) puis passent ici.
 */
export function detectDelimiter(headerLine: string): "\t" | ";" | "," {
  const count = (ch: string) => headerLine.split(ch).length - 1;
  const tabs = count("\t");
  const semis = count(";");
  const commas = count(",");
  if (tabs >= semis && tabs >= commas) return "\t";
  return semis >= commas ? ";" : ",";
}

export function parseTSV(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const delim = detectDelimiter(lines[0]);
  return lines.map((line) => line.split(delim));
}

interface Bucket {
  qty: number;
  dates: string[];
}
interface Group {
  matricule: string;
  nom: string;
  prenom: string;
  types: Map<string, Bucket>;
  rowsFusionnees: number;
}

export function cleanAbsences(text: string, collapseMaladie = true): CleanResult {
  const all = parseTSV(text);
  if (all.length === 0) {
    return { header: [], rows: [], stats: { lignesEntree: 0, collaborateurs: 0, fusions: 0 }, warnings: [] };
  }
  const header = all[0];
  const body = all.slice(1);
  const warnings: string[] = [];

  // Garde-fou : la 1re colonne doit être le matricule (clé de fusion). Sinon le
  // fichier n'est pas un export Lucca attendu et le résultat serait faux.
  if ((header[0] ?? "").trim().toLowerCase() !== "matricule") {
    warnings.push(
      `Première colonne « ${header[0] ?? ""} » au lieu de « matricule » : vérifie que c'est bien un export Lucca.`,
    );
  }

  // Colonnes de type en entrée -> abréviation sPAIEctacle (+ index quantité et /L).
  // Gère les en-têtes en abréviations (CPr…) comme en codes Lucca (1124, 5…).
  const inputCols: { qi: number; li: number | null; abbr: string }[] = [];
  const ignored = new Set<string>();
  header.forEach((h, i) => {
    if (ID_COLS.includes(h) || isLabelCol(h)) return;
    const abbr = toSpaiectacle(h);
    if (!SPCT_TYPES.includes(abbr)) {
      ignored.add(h); // type hors périmètre paie -> ignoré (comme le mapping métier)
      return;
    }
    const li = header.indexOf(h + "/L");
    inputCols.push({ qi: i, li: li === -1 ? null : li, abbr });
  });
  if (inputCols.length === 0) {
    warnings.push("Aucune colonne de type d'absence reconnue (CPr/1124, AbMa/5, RTT…).");
  }
  if (ignored.size > 0) {
    warnings.push(`Colonne(s) de type non gérée(s), ignorée(s) : ${[...ignored].join(", ")}.`);
  }

  // Clé de bucket = abréviation après regroupement maladie éventuel.
  const tgtOf = (abbr: string) => remapCode(abbr, collapseMaladie);

  const groups = new Map<string, Group>();
  const order: string[] = [];

  for (const r of body) {
    const mat = (r[0] ?? "").trim();
    if (!mat) continue;
    let g = groups.get(mat);
    if (!g) {
      const types = new Map<string, Bucket>();
      for (const t of SPCT_TYPES) {
        const k = tgtOf(t);
        if (!types.has(k)) types.set(k, { qty: 0, dates: [] });
      }
      g = {
        matricule: mat,
        nom: (r[1] ?? "").trim(),
        prenom: (r[2] ?? "").trim(),
        types,
        rowsFusionnees: 0,
      };
      groups.set(mat, g);
      order.push(mat);
    }
    g.rowsFusionnees += 1;
    if (!g.nom && r[1]) g.nom = r[1].trim();
    if (!g.prenom && r[2]) g.prenom = r[2].trim();
    for (const { qi, li, abbr } of inputCols) {
      const q = parseQty(r[qi] ?? "");
      // La date/libellé n'est retenu·e que s'il y a réellement une quantité pour
      // ce type sur cette ligne. Indispensable au format Lucca verbeux, où une
      // cellule « vide » est en fait un gabarit non vide
      // (« Prise(s) de  Maladie entre le  et le ») qu'il ne faut pas concaténer.
      if (!q) continue;
      const bucket = g.types.get(tgtOf(abbr))!;
      bucket.qty += q;
      const d = li !== null && r[li] ? r[li].trim() : "";
      if (d) bucket.dates.push(d);
    }
  }

  // Sortie canonique : colonnes sPAIEctacle dans l'ordre attendu, quel que soit
  // l'ordre/format des colonnes d'entrée.
  const outHeader = ["matricule", "(nom)", "(prenom)"];
  for (const t of SPCT_TYPES) outHeader.push(t, `${t}/L`);

  const rows: string[][] = order.map((mat) => {
    const g = groups.get(mat)!;
    const line = [g.matricule, g.nom, g.prenom];
    for (const t of SPCT_TYPES) {
      const k = tgtOf(t);
      if (k !== t) {
        line.push("", ""); // type d'une famille regroupée, non cible -> colonnes vidées
        continue;
      }
      const bucket = g.types.get(k)!;
      line.push(fmtQty(bucket.qty), bucket.dates.join(", "));
    }
    return line;
  });

  return {
    header: outHeader,
    rows,
    stats: {
      lignesEntree: body.filter((r) => (r[0] ?? "").trim()).length,
      collaborateurs: order.length,
      fusions: order.filter((m) => groups.get(m)!.rowsFusionnees > 1).length,
    },
    warnings,
  };
}

export function toTSV(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.join("\t")).join("\r\n") + "\r\n";
}
