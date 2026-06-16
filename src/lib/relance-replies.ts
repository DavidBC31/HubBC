/**
 * Phase 2 — détection des réponses aux relances (sans push PIMS).
 *
 * Surveille la boîte `pointage@` (déléguée) et repère, pour chaque entrée à
 * relancer, si le contact a répondu récemment. Sert à « marquer » dans le
 * dashboard les salles qui ont déjà donné suite, pour ne pas les relancer à vide.
 *
 * Réutilise le pattern service-account à délégation domaine du repo
 * (cf. src/lib/gmail.ts, src/lib/sheet.ts). Lecture seule : scope gmail.readonly.
 * Configuré par GMAIL_IMPERSONATE (boîte surveillée, défaut "pointage@bleucitron.net").
 *
 * Heuristique assumée : tout message entrant récent provenant de l'adresse du
 * contact compte comme « réponse ». La présence d'une pièce jointe est remontée
 * comme indice de « chiffres reçus ». Aucune écriture dans le Sheet (read-only).
 */
import fs from "node:fs";
import { google } from "googleapis";
import type { Entry } from "./types";
import { firstEmail } from "./engine";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function loadKey(): { client_email: string; private_key: string } {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  throw new Error(
    "Clé service account introuvable (GOOGLE_SA_KEY_B64 / GOOGLE_APPLICATION_CREDENTIALS).",
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
  return google.gmail({ version: "v1", auth });
}

export interface ReplyInfo {
  responded: boolean;
  lastReplyDate: string | null; // ISO yyyy-mm-dd
  hasAttachment: boolean;
  snippet: string;
}

export interface EntryReply extends ReplyInfo {
  id: number;
  email: string | null;
  artiste: string;
  ville: string;
  salle: string;
}

/** Message entrant déjà aplati (testable sans Gmail). */
export interface InboundMsg {
  from: string;
  dateMs: number;
  hasAttachment: boolean;
  snippet: string;
}

/** Extrait l'adresse d'un en-tête `From` ("Nom <a@b>" ou "a@b"). */
export function extractEmail(from: string): string | null {
  const m = from.match(/<([^>]+)>/);
  const raw = (m ? m[1] : from).trim().toLowerCase();
  return raw.includes("@") ? raw : null;
}

/** Regroupe les messages par expéditeur -> dernière réponse connue (pur, testable). */
export function summarize(messages: InboundMsg[]): Map<string, ReplyInfo> {
  const acc = new Map<string, ReplyInfo & { dateMs: number }>();
  for (const m of messages) {
    const email = extractEmail(m.from);
    if (!email) continue;
    const prev = acc.get(email);
    if (!prev) {
      acc.set(email, {
        responded: true,
        lastReplyDate: new Date(m.dateMs).toISOString().slice(0, 10),
        hasAttachment: m.hasAttachment,
        snippet: m.snippet,
        dateMs: m.dateMs,
      });
      continue;
    }
    prev.hasAttachment = prev.hasAttachment || m.hasAttachment; // un indice suffit
    if (m.dateMs > prev.dateMs) {
      prev.dateMs = m.dateMs;
      prev.lastReplyDate = new Date(m.dateMs).toISOString().slice(0, 10);
      prev.snippet = m.snippet;
    }
  }
  const out = new Map<string, ReplyInfo>();
  for (const [email, v] of acc) {
    out.set(email, {
      responded: v.responded,
      lastReplyDate: v.lastReplyDate,
      hasAttachment: v.hasAttachment,
      snippet: v.snippet,
    });
  }
  return out;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

type Part = {
  filename?: string | null;
  body?: { attachmentId?: string | null } | null;
  parts?: Part[] | null;
};
function hasAttachment(part: Part | null | undefined): boolean {
  if (!part) return false;
  if (part.filename && part.body?.attachmentId) return true;
  return (part.parts ?? []).some(hasAttachment);
}

type Gmail = ReturnType<typeof gmailClient>;

/** Interroge Gmail pour les messages entrants récents des adresses données. */
async function searchInbound(
  gmail: Gmail,
  emails: string[],
  days: number,
): Promise<InboundMsg[]> {
  const out: InboundMsg[] = [];
  for (const grp of chunk(emails, 25)) {
    // Gmail : `{a b}` = OR ; le `newer_than` hors accolades reste en AND.
    const q = `newer_than:${days}d {${grp.map((e) => `from:${e}`).join(" ")}}`;
    let pageToken: string | undefined;
    do {
      const list = await gmail.users.messages.list({
        userId: "me",
        q,
        maxResults: 100,
        pageToken,
      });
      for (const ref of list.data.messages ?? []) {
        if (!ref.id) continue;
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: ref.id,
          format: "full",
        });
        const headers = msg.data.payload?.headers ?? [];
        const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
        out.push({
          from,
          dateMs: Number(msg.data.internalDate ?? 0),
          hasAttachment: hasAttachment(msg.data.payload as Part),
          snippet: msg.data.snippet ?? "",
        });
      }
      pageToken = list.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return out;
}

export interface RepliesResult {
  checkedAt: string;
  days: number;
  replies: EntryReply[];
  summary: { total: number; responded: number; withAttachment: number };
}

/** Détecte, par entrée à relancer, si le contact a répondu sur les `days` derniers jours. */
export async function fetchEntryReplies(
  entries: Entry[],
  days = 30,
): Promise<RepliesResult> {
  const relances = entries.filter((e) => e.action === "RELANCE");
  const emailByEntry = new Map<number, string | null>();
  const emails = new Set<string>();
  for (const e of relances) {
    const em = firstEmail(e.mail);
    emailByEntry.set(e.id, em);
    if (em) emails.add(em);
  }

  const byEmail =
    emails.size > 0
      ? summarize(await searchInbound(gmailClient(), [...emails], days))
      : new Map<string, ReplyInfo>();

  const replies: EntryReply[] = relances.map((e) => {
    const em = emailByEntry.get(e.id) ?? null;
    const info = em ? byEmail.get(em) : undefined;
    return {
      id: e.id,
      email: em,
      artiste: e.artiste,
      ville: e.ville,
      salle: e.salle,
      responded: info?.responded ?? false,
      lastReplyDate: info?.lastReplyDate ?? null,
      hasAttachment: info?.hasAttachment ?? false,
      snippet: info?.snippet ?? "",
    };
  });

  return {
    checkedAt: new Date().toISOString(),
    days,
    replies,
    summary: {
      total: replies.length,
      responded: replies.filter((r) => r.responded).length,
      withAttachment: replies.filter((r) => r.hasAttachment).length,
    },
  };
}
