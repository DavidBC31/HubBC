import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 : ex-"middleware". Deux responsabilités :
//  1) routage par domaine — sur justif.bleucitron.app, "/" -> /justificatifs
//     (pointages.bleucitron.net garde "/" = dashboard des relances) ;
//  2) contrôle optimiste de session (présence du cookie) ; la vérification réelle
//     (signature HMAC + domaine) se fait côté page/route via getSession()
//     — cf. src/lib/auth.ts.
//
// Derrière Cloudflare Tunnel, req.url/nextUrl portent l'adresse de bind locale
// (localhost:PORT). On reconstruit l'origine publique depuis x-forwarded-host/proto
// (même logique que publicOrigin() dans src/lib/auth.ts) pour ne jamais rediriger
// vers localhost.

const SESSION_COOKIE = "justif_session"; // doit matcher src/lib/auth.ts
// Accessibles sans session : SSO, et les endpoints backend protégés par CRON_SECRET.
const OPEN = ["/api/auth", "/api/cron", "/api/justificatifs"];
// Domaine(s) dédié(s) au dépôt de justificatifs : la racine y mène au formulaire.
const JUSTIF_HOSTS = new Set(["justif.bleucitron.app"]);

function publicOrigin(req: NextRequest): { origin: string; host: string } {
  // x-forwarded-host peut être une liste « a, b » (chaîne de proxys) → on prend le 1er.
  const fwd = (req.headers.get("x-forwarded-host") ?? "").split(",")[0].trim();
  const raw = (fwd || req.headers.get("host") || "").toLowerCase();
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return {
    origin: raw ? `${proto}://${raw}` : req.nextUrl.origin,
    host: raw.split(":")[0], // sans le port éventuel
  };
}

export function proxy(req: NextRequest) {
  const { origin, host } = publicOrigin(req);
  const { pathname } = req.nextUrl;

  // En-tête de diagnostic : permet de vérifier d'un `curl -sI` quel host le
  // serveur a réellement reçu derrière le tunnel (si la redirection par domaine
  // ne se déclenche pas — cf. docs/DEPLOY-MACSTUDIO.md §Dépannage).
  const tag = (res: NextResponse) => {
    res.headers.set("x-justif-host", host || "(vide)");
    return res;
  };

  // 1) Atterrissage par domaine : justif.* -> formulaire de dépôt.
  if (JUSTIF_HOSTS.has(host) && pathname === "/") {
    return tag(NextResponse.redirect(`${origin}/justificatifs`));
  }

  // 2) SSO actif uniquement si configuré. En dev non configuré → tout ouvert.
  if (!process.env.AUTH_SECRET) return tag(NextResponse.next());
  if (OPEN.some((p) => pathname.startsWith(p))) return tag(NextResponse.next());

  if (!req.cookies.has(SESSION_COOKIE)) {
    if (pathname.startsWith("/api")) {
      return tag(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    }
    return tag(NextResponse.redirect(`${origin}/api/auth/google`));
  }
  return tag(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
