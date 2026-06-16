/**
 * Résolution du matricule paie à partir de l'identité (nom/prénom) — projet #1
 * et clé de voûte du projet #2.
 *
 * V1 (décision David) : fallback Google Sheet « BCD » maintenu par les RH.
 * V2 : API Lucca (à brancher derrière la même interface `resolveMatricule`).
 */
import * as XLSX from "xlsx";
import { fetchXlsxBuffer } from "./sheet";

/** Sheet « BCD » : Matricule | (nom salarié) | (prénom salarié) | ... */
const BCD_FILE_ID = process.env.BCD_SHEET_FILE_ID;

export interface Salarie {
  matricule: string;
  nom: string;
  prenom: string;
}

/** Clé de comparaison insensible à la casse/aux accents/aux espaces. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // supprime les diacritiques combinants
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

type Row = (string | number | null)[];

/** Charge l'annuaire depuis le Sheet BCD. Lève si l'ID n'est pas configuré. */
export async function loadAnnuaire(): Promise<Salarie[]> {
  if (!BCD_FILE_ID) throw new Error("BCD_SHEET_FILE_ID non défini.");
  const buf = await fetchXlsxBuffer(BCD_FILE_ID);
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as Row[];

  // En-tête : repère les colonnes par libellé (robuste au réordonnancement).
  const head = (rows[0] ?? []).map((c) => norm(String(c ?? "")));
  const col = (kw: string) => head.findIndex((h) => h.includes(kw));
  const iMat = col("matricule");
  const iNom = col("nom");
  const iPre = col("prenom") !== -1 ? col("prenom") : col("prénom");
  if (iMat === -1 || iNom === -1) throw new Error("Colonnes BCD introuvables.");

  const out: Salarie[] = [];
  for (const r of rows.slice(1)) {
    const matricule = String(r[iMat] ?? "").trim();
    if (!matricule) continue;
    out.push({
      matricule,
      nom: String(r[iNom] ?? "").trim(),
      prenom: iPre !== -1 ? String(r[iPre] ?? "").trim() : "",
    });
  }
  return out;
}

/**
 * Retrouve le matricule d'un salarié par nom + prénom.
 * Renvoie le `Salarie` complet ou null si aucune correspondance unique.
 */
export function matchSalarie(
  annuaire: Salarie[],
  nom: string,
  prenom: string,
): Salarie | null {
  const n = norm(nom);
  const p = norm(prenom);
  const exact = annuaire.filter((s) => norm(s.nom) === n && norm(s.prenom) === p);
  if (exact.length === 1) return exact[0];
  // Repli : nom seul si non ambigu (homonymes -> on ne devine pas).
  const byNom = annuaire.filter((s) => norm(s.nom) === n);
  return byNom.length === 1 ? byNom[0] : null;
}

/** Helper de bout en bout : annuaire live + matching. */
export async function resolveMatricule(
  nom: string,
  prenom: string,
): Promise<Salarie | null> {
  return matchSalarie(await loadAnnuaire(), nom, prenom);
}
