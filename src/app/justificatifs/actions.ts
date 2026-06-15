"use server";

import { resolveMatricule, type Salarie } from "@/lib/matricule";
import { getSession } from "@/lib/auth";
import { sendJustificatif, type MailAttachment } from "@/lib/gmail";
import {
  buildPivotEmail,
  DOC_TYPES,
  type DocType,
  type Submission,
} from "@/lib/justificatifs";

export interface LookupResult {
  ok: boolean;
  salarie?: Salarie;
  error?: string;
}

/**
 * Résout le matricule depuis l'annuaire BCD (Drive).
 * Dégrade proprement si les credentials / BCD_SHEET_FILE_ID ne sont pas
 * encore configurés : l'utilisateur peut alors saisir son matricule à la main.
 */
export async function lookupMatricule(
  nom: string,
  prenom: string,
): Promise<LookupResult> {
  try {
    const salarie = await resolveMatricule(nom, prenom);
    if (!salarie) return { ok: false, error: "Aucun matricule trouvé pour ce nom." };
    return { ok: true, salarie };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface SubmitState {
  ok?: boolean;
  message?: string;
  error?: string;
}

/**
 * Envoie l'email pivot à Azaïs avec les pièces jointes (US-04).
 * L'identité est prise de la SESSION quand elle existe (source sûre), sinon des
 * champs du formulaire (mode dev sans SSO).
 */
export async function submitJustificatif(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const session = await getSession();
  const str = (k: string) => String(formData.get(k) ?? "").trim();

  const type = str("type") as DocType;
  if (!DOC_TYPES.some((d) => d.id === type)) return { error: "Type de document invalide." };
  const montant = Number(str("montant").replace(",", "."));
  if (!Number.isFinite(montant) || montant <= 0) return { error: "Montant invalide." };
  const mois = str("mois");
  if (!/^\d{4}-\d{2}$/.test(mois)) return { error: "Mois invalide." };

  const matricule = session ? str("matricule") : str("matricule");
  const nom = session?.nom ?? str("nom");
  const prenom = session?.prenom ?? str("prenom");
  const email = session?.email ?? str("email");
  if (!matricule || !nom || !email) return { error: "Identité ou matricule manquant." };

  // Pièces jointes
  const attachments: MailAttachment[] = [];
  for (const f of formData.getAll("fichiers")) {
    if (f instanceof File && f.size > 0) {
      attachments.push({
        filename: f.name,
        mimeType: f.type || "application/octet-stream",
        content: Buffer.from(await f.arrayBuffer()),
      });
    }
  }
  if (attachments.length === 0) return { error: "Joignez au moins une pièce justificative." };

  const submission: Submission = {
    matricule, nom, prenom, email, type, montant, mois,
    fichiers: attachments.map((a) => a.filename),
  };
  const { subject, body } = buildPivotEmail(submission);
  const to = process.env.JUSTIF_MAILBOX ?? "azais@bleucitron.net";

  try {
    await sendJustificatif({ from: email, to, subject, body, attachments });
    return { ok: true, message: `Justificatif envoyé à ${to}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
