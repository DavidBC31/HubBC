/**
 * Projet #1 — « cerveau » du script d'écoute (Pôle Social, US-05/US-06).
 *
 * Surveille la boîte d'Azaïs, identifie les emails pivot par leur OBJET prédéfini
 * ([[SUBJECT_PREFIX]]), parse les données paie, télécharge les pièces jointes,
 * les archive sur le Drive du mois, et produit le CSV d'import sPAIEctacle.
 *
 * Réutilise le pattern service-account à délégation domaine du repo
 * (cf. src/lib/gmail.ts, src/lib/sheet.ts). Activé par configuration :
 *   JUSTIF_MAILBOX        boîte surveillée (déléguée), défaut "azais@bleucitron.net"
 *   JUSTIF_DRIVE_FOLDER   dossier Drive racine où archiver (US-05)
 */
import fs from "node:fs";
import { google } from "googleapis";
import {
  buildJustificatifsCSV,
  parsePivotEmail,
  SUBJECT_PREFIX,
  type Submission,
} from "./justificatifs";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive",
];

function loadKey(): { client_email: string; private_key: string } {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  throw new Error("Clé service account introuvable (GOOGLE_SA_KEY_B64 / GOOGLE_APPLICATION_CREDENTIALS).");
}

function clients() {
  const key = loadKey();
  const mailbox = process.env.JUSTIF_MAILBOX ?? "justif@bleucitron.net";
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
    subject: mailbox,
  });
  return {
    gmail: google.gmail({ version: "v1", auth }),
    drive: google.drive({ version: "v3", auth }),
    mailbox,
  };
}

const b64urlDecode = (data: string) =>
  Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");

interface AttachmentRef {
  filename: string;
  mimeType: string;
  attachmentId: string;
}

/** Parcourt récursivement le payload pour extraire texte brut + pièces jointes. */
type Part = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; attachmentId?: string | null } | null;
  parts?: Part[] | null;
};
function walk(part: Part, acc: { text: string; atts: AttachmentRef[] }) {
  if (part.filename && part.body?.attachmentId) {
    acc.atts.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      attachmentId: part.body.attachmentId,
    });
  } else if (part.mimeType === "text/plain" && part.body?.data) {
    acc.text += b64urlDecode(part.body.data).toString("utf-8");
  }
  for (const p of part.parts ?? []) walk(p, acc);
}

export interface PivotMessage {
  messageId: string;
  submission: Submission;
  attachments: AttachmentRef[];
}

/** Plage Gmail (after:/before:) pour un mois "yyyy-mm", sinon chaîne vide. */
function monthQuery(mois?: string): string {
  if (!mois || !/^\d{4}-\d{2}$/.test(mois)) return "";
  const [y, m] = mois.split("-").map(Number);
  const start = `${y}/${m}/1`;
  const next = m === 12 ? `${y + 1}/1/1` : `${y}/${m + 1}/1`;
  return ` after:${start} before:${next}`;
}

/** Liste et parse les emails pivot de la boîte (filtrés par objet, et mois optionnel). */
export async function fetchPivotMessages(mois?: string): Promise<PivotMessage[]> {
  const { gmail } = clients();
  const q = `subject:"${SUBJECT_PREFIX}"${monthQuery(mois)}`;
  const list = await gmail.users.messages.list({ userId: "me", q, maxResults: 200 });
  const out: PivotMessage[] = [];
  for (const m of list.data.messages ?? []) {
    const full = await gmail.users.messages.get({ userId: "me", id: m.id!, format: "full" });
    const headers = full.data.payload?.headers ?? [];
    const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
    const acc = { text: "", atts: [] as AttachmentRef[] };
    if (full.data.payload) walk(full.data.payload as Part, acc);
    const submission = parsePivotEmail(subject, acc.text);
    if (submission) {
      submission.fichiers = acc.atts.map((a) => a.filename);
      out.push({ messageId: m.id!, submission, attachments: acc.atts });
    }
  }
  return out;
}

/** Génère le CSV d'import à partir des emails pivot d'un mois. */
export async function buildCSVForMonth(mois?: string): Promise<{ csv: string; count: number }> {
  const msgs = await fetchPivotMessages(mois);
  return { csv: buildJustificatifsCSV(msgs.map((m) => m.submission)), count: msgs.length };
}

/** Sous-dossier Drive du mois (créé au besoin) sous le dossier racine configuré. */
async function ensureMonthFolder(driveApi: ReturnType<typeof clients>["drive"], parentId: string, mois: string) {
  const q =
    `'${parentId}' in parents and name='${mois}' and ` +
    `mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await driveApi.files.list({ q, fields: "files(id)", supportsAllDrives: true });
  if (found.data.files?.[0]?.id) return found.data.files[0].id;
  const created = await driveApi.files.create({
    requestBody: { name: mois, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  return created.data.id!;
}

/**
 * Archive les pièces jointes des emails pivot sur le Drive (US-05).
 * Range chaque pièce dans <JUSTIF_DRIVE_FOLDER>/<mois>/ avec un nom préfixé du matricule.
 */
export async function archiveToDrive(mois?: string): Promise<{ archived: number }> {
  const parentId = process.env.JUSTIF_DRIVE_FOLDER;
  if (!parentId) throw new Error("JUSTIF_DRIVE_FOLDER non défini.");
  const { gmail, drive } = clients();
  const msgs = await fetchPivotMessages(mois);
  let archived = 0;
  for (const msg of msgs) {
    const folderId = await ensureMonthFolder(drive, parentId, msg.submission.mois || (mois ?? "sans-mois"));
    for (const att of msg.attachments) {
      const data = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: msg.messageId,
        id: att.attachmentId,
      });
      const buf = b64urlDecode(data.data.data ?? "");
      const { Readable } = await import("node:stream");
      await drive.files.create({
        requestBody: {
          name: `${msg.submission.matricule}_${att.filename}`,
          parents: [folderId],
        },
        media: { mimeType: att.mimeType, body: Readable.from(buf) },
        fields: "id",
        supportsAllDrives: true,
      });
      archived += 1;
    }
  }
  return { archived };
}
