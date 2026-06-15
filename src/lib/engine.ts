import fs from "node:fs";
import path from "node:path";
import type { Dataset, Entry, DraftMail, Jour } from "./types";

const JOURS: Jour[] = [
  "LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE",
];

export function jourDe(date: Date): Jour {
  // getDay(): 0 = dimanche … 6 = samedi
  return JOURS[(date.getDay() + 6) % 7];
}

export function loadDataset(): Dataset {
  const p = path.join(process.cwd(), "data", "relances.json");
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Dataset;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Première adresse exploitable d'une cellule MAIL (souvent plusieurs / des liens). */
function firstEmail(mail: string): string | null {
  const tok = mail.split(/[\s,;]+/).find((t) => t.includes("@") && !t.includes("/"));
  return tok ? tok.trim().toLowerCase() : null;
}

/** Entrées à relancer pour une date donnée (par défaut : aujourd'hui). */
export function selectDue(entries: Entry[], runDate = new Date()): Entry[] {
  const jour = jourDe(runDate);
  return entries.filter(
    (e) =>
      e.action === "RELANCE" &&
      e.cadence.includes(jour) &&
      firstEmail(e.mail) !== null,
  );
}

/** Regroupe les entrées dues par destinataire -> un mail individuel chacun. */
export function buildDrafts(entries: Entry[], runDate = new Date()): DraftMail[] {
  const due = selectDue(entries, runDate);
  const groups = new Map<string, Entry[]>();
  for (const e of due) {
    const to = firstEmail(e.mail)!;
    (groups.get(to) ?? groups.set(to, []).get(to)!).push(e);
  }
  return [...groups.entries()].map(([to, items]) => renderDraft(to, items));
}

// Signature reprise des vrais mails de pointage@ (modifiable).
const SIGNATURE =
  `Bonne journée,\n\n` +
  `L'équipe Billetterie 🍋\n` +
  `Bleu Citron Production & Tournée\n` +
  `Toulouse : 28, rue Dupont - 31500\n` +
  `Paris : 2 rue Henri Chevreau - 75020 Paris\n` +
  `Retrouvez-nous sur Linkedin, X, Facebook, Instagram\n` +
  `mais surtout sur www.bleucitron.net !\n` +
  `40 ! BLEU CITRON ANNIVERSAIRE • 1986-2026`;

function ligneItem(i: Entry): string {
  const loc = [i.ville, i.salle].filter(Boolean).join(" - ");
  return [i.artiste, loc || i.spectacles, fmtDate(i.date_concert)]
    .filter(Boolean)
    .join(" - ");
}

export function renderDraft(to: string, items: Entry[]): DraftMail {
  const billetTiers = items.some((i) => i.billet_tiers);
  const prefixe = billetTiers ? "POINTAGE BILLET TIERS : " : "POINTAGE : ";

  // Objet : convention réelle "POINTAGE : ARTISTE - DATE - VILLE - SALLE".
  // Mono-date -> détaillé ; multi-dates -> liste des artistes.
  const subject =
    items.length === 1
      ? prefixe + ligneItem(items[0])
      : prefixe + [...new Set(items.map((i) => i.artiste).filter(Boolean))].join(", ");

  let demande: string;
  if (items.length === 1) {
    demande = `Pourriez-vous nous transmettre votre point de vente à jour pour ${ligneItem(items[0])} ?`;
  } else {
    const lignes = items.map((i) => {
      const last = i.dernier_recu ? ` (dernier point reçu : ${fmtDate(i.dernier_recu)})` : "";
      return `  • ${ligneItem(i)}${last}`;
    });
    demande =
      `Pourriez-vous nous transmettre vos points de vente à jour pour :\n\n` +
      lignes.join("\n");
  }

  let body = `Bonjour,\n\n${demande}\n\nMerci d'avance,\n\n${SIGNATURE}`;
  if (billetTiers) {
    body += `\n\n— Billet tiers : à reporter manuellement dans Aparté / PIMS.`;
  }
  return { to, subject, body, items, billetTiers };
}
