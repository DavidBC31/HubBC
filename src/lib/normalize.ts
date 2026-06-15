import type { Entry, Action, Jour } from "./types";

// Port TS de scripts/import_sheet.py — toute la logique "texte libre -> champs".

const SKIP_KEYWORDS = [
  "LIAISON PIMS", "AUTONOME", "AUTOMATIQUE", "COMPLET",
  "NE PAS RELANCER", "NE DONNE PAS", "NE VEUT PAS", "NE NOUS LE DONNE",
];
const CADENCE_JOURS: Record<string, Jour[]> = {
  LUNDI: ["LUNDI"], MARDI: ["MARDI"], MERCREDI: ["MERCREDI"],
  MERCRDI: ["MERCREDI"], JEUDI: ["JEUDI"], VENDREDI: ["VENDREDI"],
};

type Cell = string | number | boolean | Date | null | undefined;
type Row = Cell[];

function cell(r: Row, i: number): Cell {
  return i < r.length ? r[i] : null;
}
function txt(v: Cell): string {
  if (v === null || v === undefined || v instanceof Date) return "";
  return String(v).trim();
}
/** Excel stocke souvent les dates en nombre série ; SheetJS les rend en Date si cellDates. */
function asIso(v: Cell): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

function classify(commentaire: Cell, relanceRaw: Cell): {
  action: Action; cadence: Jour[]; raison: string;
} {
  const blob = `${txt(commentaire)} ${txt(relanceRaw)}`.toUpperCase();
  for (const kw of SKIP_KEYWORDS) {
    if (blob.includes(kw)) return { action: "SKIP", cadence: [], raison: kw };
  }
  if (blob.includes("MEV"))
    return { action: "SKIP", cadence: [], raison: "MEV (pas encore en vente)" };
  let jours: Jour[] = [];
  for (const [kw, js] of Object.entries(CADENCE_JOURS)) {
    if (blob.includes(kw)) for (const j of js) if (!jours.includes(j)) jours.push(j);
  }
  if ((blob.includes("SEMAINE") || blob.includes("HEBDO")) && jours.length === 0)
    jours = ["LUNDI"];
  if (blob.includes("MOIS"))
    return { action: "MENSUEL", cadence: [], raison: "1 fois / mois" };
  if (jours.length === 0) jours = ["LUNDI"];
  return { action: "RELANCE", cadence: jours, raison: "" };
}

function parseGrouped(rows: Row[], source: Entry["source"]): Entry[] {
  const out: Entry[] = [];
  let artist = "";
  for (const r of rows.slice(1)) {
    const manif = cell(r, 0), ville = cell(r, 1);
    if (txt(manif) && !txt(ville)) { artist = txt(manif); continue; }
    if (r.every((c) => c === null || c === undefined || c === "") || !txt(ville)) continue;
    const { action, cadence, raison } = classify(cell(r, 6), cell(r, 7));
    out.push({
      id: 0, source, artiste: artist || txt(manif),
      ville: txt(ville), salle: txt(cell(r, 2)),
      date_concert: asIso(cell(r, 3)), mail: txt(cell(r, 4)),
      commentaire: txt(cell(r, 6)),
      relance_raw: txt(cell(r, 7)) || asIso(cell(r, 7)) || "",
      dernier_recu: asIso(cell(r, 8)),
      identifiant: txt(cell(r, 10)), mdp: txt(cell(r, 11)),
      action, cadence, raison_skip: raison, billet_tiers: false, spectacles: "",
    });
  }
  return out;
}

function parseBilletsTiers(rows: Row[]): Entry[] {
  const out: Entry[] = [];
  for (const r of rows.slice(1)) {
    const nom = cell(r, 0);
    if (!txt(nom)) continue;
    if (txt(nom).toUpperCase().startsWith("ARCHIVE")) break;
    const { action, cadence, raison } = classify(cell(r, 5), cell(r, 3));
    out.push({
      id: 0, source: "BILLETS TIERS", artiste: txt(nom),
      ville: "", salle: "", date_concert: null,
      mail: txt(cell(r, 1)), commentaire: txt(cell(r, 5)),
      relance_raw: txt(cell(r, 3)), dernier_recu: asIso(cell(r, 4)),
      identifiant: txt(cell(r, 6)), mdp: txt(cell(r, 7)),
      action, cadence, raison_skip: raison, billet_tiers: true,
      spectacles: txt(cell(r, 2)),
    });
  }
  return out;
}

/** Normalise les 3 onglets en entrées propres (avec id séquentiel). */
export function normalizeTabs(tabs: {
  relances: Row[]; autonomes: Row[]; billetsTiers: Row[];
}): Entry[] {
  const entries = [
    ...parseGrouped(tabs.relances, "RELANCES"),
    ...parseGrouped(tabs.autonomes, "AUTONOMES"),
    ...parseBilletsTiers(tabs.billetsTiers),
  ];
  entries.forEach((e, i) => (e.id = i + 1));
  return entries;
}
