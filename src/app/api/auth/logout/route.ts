import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** Déconnexion : supprime le cookie de session. */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(`${req.nextUrl.origin}/justificatifs`);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
