import fs from "node:fs";
import { google } from "googleapis";
import type { DraftMail } from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

interface SAKey {
  client_email: string;
  private_key: string;
}

function loadKey(): SAKey {
  // Prod (Vercel) : clé JSON encodée en base64 dans GOOGLE_SA_KEY_B64
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (b64) {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  }
  // Dev local : fichier pointé par GOOGLE_APPLICATION_CREDENTIALS
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p && fs.existsSync(p)) {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  }
  throw new Error(
    "Clé service account introuvable (GOOGLE_SA_KEY_B64 ou GOOGLE_APPLICATION_CREDENTIALS).",
  );
}

function gmailClient() {
  const key = loadKey();
  const subject = process.env.GMAIL_IMPERSONATE ?? "pointage@bleucitron.net";
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
    subject,
  });
  return { gmail: google.gmail({ version: "v1", auth }), subject };
}

/** Encode un mail RFC 2822 simple en base64url pour l'API Gmail. */
function toRaw(from: string, to: string, subject: string, body: string): string {
  const enc = (s: string) =>
    `=?utf-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
  const msg =
    `From: ${from}\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${enc(subject)}\r\n` +
    `Content-Type: text/plain; charset="utf-8"\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    Buffer.from(body, "utf-8").toString("base64");
  return Buffer.from(msg, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Crée les brouillons dans la boîte impersonnée. Rien n'est envoyé. */
export async function createDrafts(
  drafts: DraftMail[],
): Promise<{ to: string; draftId: string }[]> {
  const { gmail, subject } = gmailClient();
  const out: { to: string; draftId: string }[] = [];
  for (const d of drafts) {
    const raw = toRaw(subject, d.to, d.subject, d.body);
    const res = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } },
    });
    out.push({ to: d.to, draftId: res.data.id ?? "" });
  }
  return out;
}

export interface MailAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/** Encode un mail multipart/mixed (corps texte + pièces jointes) en base64url. */
function toRawMultipart(
  from: string,
  to: string,
  subject: string,
  body: string,
  attachments: MailAttachment[],
): string {
  const enc = (s: string) => `=?utf-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
  const boundary = `bnd_${Date.now().toString(36)}`;
  const parts: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${enc(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf-8").toString("base64"),
  ];
  for (const a of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.mimeType}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      a.content.toString("base64"),
    );
  }
  parts.push(`--${boundary}--`, "");
  return Buffer.from(parts.join("\r\n"), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Envoie (US-04) l'email pivot à Azaïs avec ses pièces jointes.
 * Le message est expédié au nom du/de la collaborateurice (`from`) via la
 * délégation domaine ; il faut donc que le service-account puisse l'impersonner.
 */
export async function sendJustificatif(args: {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachments: MailAttachment[];
}): Promise<{ id: string }> {
  const key = loadKey();
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: SCOPES,
    subject: args.from, // impersonne l'expéditeur
  });
  const gmail = google.gmail({ version: "v1", auth });
  const raw = toRawMultipart(args.from, args.to, args.subject, args.body, args.attachments);
  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return { id: res.data.id ?? "" };
}

/** Vérifie l'accès délégué (utilisé par le dashboard). */
export async function checkAccess(): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const { gmail } = gmailClient();
    const prof = await gmail.users.getProfile({ userId: "me" });
    return { ok: true, email: prof.data.emailAddress ?? undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}
