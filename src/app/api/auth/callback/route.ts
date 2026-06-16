import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, signSession, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** Retour de Google : échange le code, pose le cookie de session, revient au dépôt. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const err = req.nextUrl.searchParams.get("error");
  if (err || !code) {
    return NextResponse.redirect(`${req.nextUrl.origin}/justificatifs?error=${err ?? "no_code"}`);
  }
  try {
    const redirectUri = `${req.nextUrl.origin}/api/auth/callback`;
    const id = await exchangeCode(code, redirectUri);
    const res = NextResponse.redirect(`${req.nextUrl.origin}/justificatifs`);
    res.cookies.set(SESSION_COOKIE, signSession(id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/justificatifs?error=${encodeURIComponent((e as Error).message)}`,
    );
  }
}
