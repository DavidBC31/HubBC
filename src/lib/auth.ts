/**
 * SSO Google léger (US-01) — sans dépendance lourde, dans le style du repo.
 *
 * Flow authorization-code via google-auth-library. Après consentement, on vérifie
 * l'id_token, on contrôle le domaine (bleucitron.net), et on dépose un cookie de
 * session signé HMAC (on ne persiste PAS les jetons Google).
 *
 * Env : AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET (clé de signature).
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { OAuth2Client } from "google-auth-library";

export const SESSION_COOKIE = "justif_session";
export const HOSTED_DOMAIN = process.env.AUTH_HOSTED_DOMAIN ?? "bleucitron.net";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 jours

export interface Identity {
  nom: string;
  prenom: string;
  email: string;
  exp: number;
}

export function isConfigured(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);
}

export function oauthClient(redirectUri: string): OAuth2Client {
  return new OAuth2Client(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    redirectUri,
  );
}

export function authUrl(redirectUri: string): string {
  return oauthClient(redirectUri).generateAuthUrl({
    scope: ["openid", "email", "profile"],
    hd: HOSTED_DOMAIN, // limite le sélecteur de compte au domaine pro
    prompt: "select_account",
  });
}

/** Échange le code, vérifie l'id_token et le domaine, renvoie l'identité. */
export async function exchangeCode(code: string, redirectUri: string): Promise<Identity> {
  const client = oauthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error("id_token manquant.");
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.AUTH_GOOGLE_ID,
  });
  const p = ticket.getPayload();
  if (!p?.email || !p.email_verified) throw new Error("Email non vérifié.");
  if (p.hd !== HOSTED_DOMAIN) throw new Error(`Compte hors domaine ${HOSTED_DOMAIN}.`);
  return {
    nom: p.family_name ?? "",
    prenom: p.given_name ?? "",
    email: p.email,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE,
  };
}

const b64url = (b: Buffer) => b.toString("base64url");

export function signSession(id: Identity): string {
  const secret = process.env.AUTH_SECRET!;
  const payload = b64url(Buffer.from(JSON.stringify(id), "utf-8"));
  const sig = b64url(crypto.createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifySession(token: string): Identity | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", secret).update(payload).digest());
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const id = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as Identity;
    if (id.exp * 1000 < Date.now()) return null;
    return id;
  } catch {
    return null;
  }
}

/** Identité de la requête courante (Server Component / Server Action), ou null. */
export async function getSession(): Promise<Identity | null> {
  const c = await cookies();
  const tok = c.get(SESSION_COOKIE)?.value;
  return tok ? verifySession(tok) : null;
}
