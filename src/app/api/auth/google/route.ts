import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/auth";

export const runtime = "nodejs";

// Le flow OAuth est géré par le hub. On redirige directement vers hub.bleucitron.app
// en passant l'URL courante en paramètre `from` pour le retour post-login.
const HUB_URL = process.env.HUB_URL ?? "https://hub.bleucitron.app";

export async function GET(req: NextRequest) {
  const from = encodeURIComponent(`${publicOrigin(req)}/justificatifs`);
  return NextResponse.redirect(`${HUB_URL}?from=${from}`);
}
