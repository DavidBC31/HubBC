import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 : ex-"middleware". Contrôle optimiste (présence du cookie) ;
// la vérification réelle (signature HMAC + domaine) se fait côté page/route
// via getSession() — cf. src/lib/auth.ts.

const SESSION_COOKIE = "justif_session"; // doit matcher src/lib/auth.ts
// Accessibles sans session : SSO, et les endpoints backend protégés par CRON_SECRET.
const OPEN = ["/api/auth", "/api/cron", "/api/justificatifs"];

export function proxy(req: NextRequest) {
  // SSO actif uniquement si configuré. En dev non configuré → tout ouvert.
  if (!process.env.AUTH_SECRET) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (OPEN.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!req.cookies.has(SESSION_COOKIE)) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/api/auth/google", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
