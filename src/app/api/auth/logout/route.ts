import { NextResponse } from "next/server";

export const runtime = "nodejs";

// bc_session est posé sur domain=.bleucitron.app par le hub.
// Seul le hub peut le supprimer proprement : on redirige vers son endpoint logout.
const HUB_URL = process.env.HUB_URL ?? "https://hub.bleucitron.app";

export async function GET() {
  return NextResponse.redirect(`${HUB_URL}/api/auth/logout`);
}
