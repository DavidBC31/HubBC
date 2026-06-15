/**
 * Projet #1 — Justificatifs paie (CdC SI-PRO16.1).
 *
 * « EMAIL PIVOT » : décision actée du CdC — l'interface web n'écrit PAS le CSV.
 * Elle envoie à Azaïs un email standardisé (trace écrite) ; un script backend
 * surveille la boîte, identifie ces mails par l'OBJET prédéfini, archive les
 * pièces jointes sur le Drive et alimente le CSV d'import sPAIEctacle.
 *
 * Ce module définit le CONTRAT de cet email (builder + parseur, round-trip
 * testé) et la génération du CSV. Aucune I/O ici : pur, isomorphe, testable.
 */

export type DocType = "TELEPHONE" | "MOBILITE" | "TRANSPORT";

export const DOC_TYPES: { id: DocType; label: string }[] = [
  { id: "TELEPHONE", label: "Forfait téléphone" },
  { id: "MOBILITE", label: "Forfait mobilité durable" },
  { id: "TRANSPORT", label: "Transport (abonnement)" },
];

/** Préfixe d'objet prédéfini : sert au filtrage de la boîte par le backend. */
export const SUBJECT_PREFIX = "[JUSTIF-PAIE]";

export interface Submission {
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  type: DocType;
  /** Montant en euros (saisi manuellement en V1 ; OCR en V2). */
  montant: number;
  /** Mois de paie concerné, format ISO court "yyyy-mm". */
  mois: string;
  /** Noms des fichiers joints (les pièces justificatives elles-mêmes). */
  fichiers?: string[];
}

const labelOf = (t: DocType) => DOC_TYPES.find((d) => d.id === t)?.label ?? t;

function fmtMontant(n: number): string {
  return n.toFixed(2); // point décimal, 2 décimales — stable pour le parseur
}

// Délimiteurs du bloc machine. Volontairement explicites pour survivre au
// reformatage des clients mail et rester lisibles par Azaïs.
const BLOCK_START = "--- DONNÉES PAIE (ne pas modifier) ---";
const BLOCK_END = "--- FIN ---";

/** Construit l'objet + le corps de l'email pivot pour une soumission. */
export function buildPivotEmail(s: Submission): { subject: string; body: string } {
  const subject = `${SUBJECT_PREFIX} ${s.matricule} — ${labelOf(s.type)}`;
  const body =
    `Bonjour Azaïs,\n\n` +
    `${s.prenom} ${s.nom} dépose un justificatif pour la paie :\n` +
    `  • Type : ${labelOf(s.type)}\n` +
    `  • Montant : ${fmtMontant(s.montant)} €\n` +
    `  • Mois : ${s.mois}\n` +
    `  • Matricule : ${s.matricule}\n\n` +
    `Les pièces justificatives sont en pièce jointe.\n\n` +
    `${BLOCK_START}\n` +
    `matricule: ${s.matricule}\n` +
    `nom: ${s.nom}\n` +
    `prenom: ${s.prenom}\n` +
    `email: ${s.email}\n` +
    `type: ${s.type}\n` +
    `montant: ${fmtMontant(s.montant)}\n` +
    `mois: ${s.mois}\n` +
    `${BLOCK_END}\n`;
  return { subject, body };
}

/**
 * Parseur backend : extrait la soumission du corps de l'email pivot.
 * Renvoie null si le mail n'est pas un email pivot valide (objet ou bloc absent).
 */
export function parsePivotEmail(subject: string, body: string): Submission | null {
  if (!subject.includes(SUBJECT_PREFIX)) return null;
  const start = body.indexOf(BLOCK_START);
  const end = body.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return null;

  const block = body.slice(start + BLOCK_START.length, end);
  const kv = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    kv.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }

  const type = kv.get("type") as DocType | undefined;
  const matricule = kv.get("matricule");
  const montantRaw = kv.get("montant");
  if (!matricule || !type || !DOC_TYPES.some((d) => d.id === type) || montantRaw == null) {
    return null;
  }
  const montant = Number(montantRaw.replace(",", "."));
  if (!Number.isFinite(montant)) return null;

  return {
    matricule,
    nom: kv.get("nom") ?? "",
    prenom: kv.get("prenom") ?? "",
    email: kv.get("email") ?? "",
    type,
    montant,
    mois: kv.get("mois") ?? "",
  };
}

const CSV_HEADER = ["matricule", "nom", "prenom", "type", "montant", "mois"];

/**
 * CSV d'import sPAIEctacle (séparateur « ; », point-virgule = standard FR).
 * ⚠️ Colonnes PROVISOIRES — à caler sur la trame exacte qu'Azaïs doit fournir.
 */
export function buildJustificatifsCSV(subs: Submission[]): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [CSV_HEADER.join(";")];
  for (const s of subs) {
    lines.push(
      [s.matricule, s.nom, s.prenom, s.type, fmtMontant(s.montant), s.mois]
        .map((v) => esc(String(v)))
        .join(";"),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
