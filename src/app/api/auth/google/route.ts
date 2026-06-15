import { NextRequest, NextResponse } from "next/server";
import { authUrl, isConfigured } from "@/lib/auth";

export const runtime = "nodejs";

/** Démarre le flow SSO Google : redirige vers l'écran de consentement. */
export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "SSO Google non configuré (AUTH_GOOGLE_ID/SECRET/AUTH_SECRET)." }, { status: 503 });
  }
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback`;
  return NextResponse.redirect(authUrl(redirectUri));
}
