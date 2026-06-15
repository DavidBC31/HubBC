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

export interface CleanStats {
  lignesEntree: number;
  collaborateurs: number;
  fusions: number;
}

export interface CleanResult {
  header: string[];
  rows: string[][];
  stats: CleanStats;
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

/** Découpe un TSV (gère le BOM et les fins de ligne CRLF/LF). */
export function parseTSV(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  return clean
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
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
  if (all.length === 0) return { header: [], rows: [], stats: { lignesEntree: 0, collaborateurs: 0, fusions: 0 } };
  const header = all[0];
  const body = all.slice(1);

  // code brut -> [idx quantité, idx dates|null]
  const typeCols = new Map<string, [number, number | null]>();
  header.forEach((h, i) => {
    if (ID_COLS.includes(h) || isLabelCol(h)) return;
    const li = header.indexOf(h + "/L");
    typeCols.set(h, [i, li === -1 ? null : li]);
  });

  const groups = new Map<string, Group>();
  const order: string[] = [];

  for (const r of body) {
    const mat = (r[0] ?? "").trim();
    if (!mat) continue;
    let g = groups.get(mat);
    if (!g) {
      const types = new Map<string, Bucket>();
      for (const code of typeCols.keys()) {
        const tgt = remapCode(code, collapseMaladie);
        if (!types.has(tgt)) types.set(tgt, { qty: 0, dates: [] });
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
    for (const [code, [qi, li]] of typeCols) {
      const tgt = remapCode(code, collapseMaladie);
      const bucket = g.types.get(tgt)!;
      const q = parseQty(r[qi] ?? "");
      const d = li !== null && r[li] ? r[li].trim() : "";
      if (q) bucket.qty += q;
      if (d) bucket.dates.push(d);
    }
  }

  const rows: string[][] = order.map((mat) => {
    const g = groups.get(mat)!;
    const line = [g.matricule, g.nom, g.prenom];
    for (const h of header.slice(3)) {
      const code = isLabelCol(h) ? h.slice(0, -2) : h;
      const tgt = remapCode(code, collapseMaladie);
      if (tgt !== code) {
        line.push(""); // colonne d'une famille regroupée, non cible -> vidée
        continue;
      }
      const bucket = g.types.get(tgt)!;
      line.push(isLabelCol(h) ? bucket.dates.join(", ") : fmtQty(bucket.qty));
    }
    return line;
  });

  return {
    header,
    rows,
    stats: {
      lignesEntree: body.filter((r) => (r[0] ?? "").trim()).length,
      collaborateurs: order.length,
      fusions: order.filter((m) => groups.get(m)!.rowsFusionnees > 1).length,
    },
  };
}

export function toTSV(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.join("\t")).join("\r\n") + "\r\n";
}
