// Contrat SSO partagé Bleu Citron — IDENTIQUE côté Hub (émetteur) et spokes (lecteurs).
//
// Le Hub pose le cookie `bc_session` sur l'apex `.bleucitron.app` après login Google.
// Chaque app le lit et vérifie la signature + l'autorisation (apps[]) en local,
// sans aucun appel réseau. Crypto pur (node:crypto) → zéro dépendance lourde.
//
// Pré-requis : SSO_SECRET STRICTEMENT identique sur le Hub et toutes les apps.
import crypto from "node:crypto"

export const SSO_COOKIE = "bc_session"
export const SESSION_TTL = 60 * 60 * 24 * 7 // 7 jours (secondes)

export interface BcSession {
  email: string
  name: string
  apps: string[] // ids des apps autorisées, ex ["justif", "pointages"]
  exp: number // expiration (epoch secondes)
}

const b64url = (b: Buffer) => b.toString("base64url")

function hmac(payload: string, secret: string): string {
  return b64url(crypto.createHmac("sha256", secret).update(payload).digest())
}

/** Signe une session → valeur du cookie `payload.signature`. */
export function signSession(
  session: BcSession,
  secret = process.env.SSO_SECRET,
): string {
  if (!secret) throw new Error("SSO_SECRET manquant")
  const payload = b64url(Buffer.from(JSON.stringify(session), "utf8"))
  return `${payload}.${hmac(payload, secret)}`
}

/** Vérifie la signature + l'expiration, renvoie la session ou null. */
export function verifySession(
  token: string | undefined | null,
  secret = process.env.SSO_SECRET,
): BcSession | null {
  if (!token || !secret) return null
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  const expected = hmac(payload, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const s = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as BcSession
    if (typeof s.exp !== "number" || s.exp * 1000 < Date.now()) return null
    return s
  } catch {
    return null
  }
}
