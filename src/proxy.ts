import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 : ex-"middleware". Deux responsabilités :
//  1) routage par domaine — sur justif.bleucitron.app, "/" -> /justificatifs ;
//  2) contrôle optimiste (présence du cookie bc_session) ; la vérification réelle
//     (signature HMAC + apps[]) se fait côté page/route via getSession()
//     — cf. src/lib/auth.ts.
// Si le cookie est absent, l'utilisateur est redirigé vers le hub SSO.

const BC_SESSION = "bc_session";
const OPEN = ["/api/auth", "/api/cron", "/api/justificatifs"];
const JUSTIF_HOSTS = new Set(["justif.bleucitron.app"]);
const HUB_URL = process.env.HUB_URL ?? "https://hub.bleucitron.app";

function publicOrigin(req: NextRequest): { origin: string; host: string } {
  const fwd = (req.headers.get("x-forwarded-host") ?? "").split(",")[0].trim();
  const raw = (fwd || req.headers.get("host") || "").toLowerCase();
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return {
    origin: raw ? `${proto}://${raw}` : req.nextUrl.origin,
    host: raw.split(":")[0],
  };
}

export function proxy(req: NextRequest) {
  const { origin, host } = publicOrigin(req);
  const { pathname } = req.nextUrl;

  const tag = (res: NextResponse) => {
    res.headers.set("x-justif-host", host || "(vide)");
    return res;
  };

  // 1) Atterrissage par domaine : justif.* -> formulaire de dépôt.
  if (JUSTIF_HOSTS.has(host) && pathname === "/") {
    return tag(NextResponse.redirect(`${origin}/justificatifs`));
  }

  // 2) SSO actif uniquement si configuré. En dev non configuré → tout ouvert.
  if (!process.env.SSO_SECRET) return tag(NextResponse.next());
  if (OPEN.some((p) => pathname.startsWith(p))) return tag(NextResponse.next());

  if (!req.cookies.has(BC_SESSION)) {
    if (pathname.startsWith("/api")) {
      return tag(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    }
    const from = encodeURIComponent(`${origin}${pathname}`);
    return tag(NextResponse.redirect(`${HUB_URL}?from=${from}`));
  }
  return tag(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
