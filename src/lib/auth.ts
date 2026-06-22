// Auth SSO spoke HubBC (justif) — lit le cookie bc_session émis par hub.bleucitron.app.
// Aucun flow OAuth propre : authentification et autorisation gérées par le hub.
// Pré-requis : SSO_SECRET identique au hub dans .env.local.
import { cookies } from "next/headers"
import type { NextRequest } from "next/server"
import { verifySession, SSO_COOKIE } from "./session"

export const SESSION_COOKIE = SSO_COOKIE
const APP_ID = "justif"

/** Identité exposée aux pages/actions (compatible avec les consommateurs existants). */
export interface Identity {
  nom: string
  prenom: string
  email: string
  exp: number
}

export function isConfigured(): boolean {
  return Boolean(process.env.SSO_SECRET)
}

/** Identité de la requête courante (Server Component / Server Action), ou null.
 *  Retourne null si le cookie est absent, la signature invalide, ou si l'app
 *  "justif" n'est pas dans la liste apps[] du cookie. */
export async function getSession(): Promise<Identity | null> {
  const c = await cookies()
  const tok = c.get(SESSION_COOKIE)?.value
  if (!tok) return null
  const s = verifySession(tok)
  if (!s || !s.apps.includes(APP_ID)) return null
  // Adapte BcSession (name = prénom complet Google) vers Identity (nom/prenom).
  const [prenom = "", ...rest] = s.name.split(" ")
  return { prenom, nom: rest.join(" "), email: s.email, exp: s.exp }
}

/** Origine publique réelle de la requête (derrière Cloudflare Tunnel). */
export function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  if (!host) return req.nextUrl.origin
  const proto =
    req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")
  return `${proto}://${host}`
}
