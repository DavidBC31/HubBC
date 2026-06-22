import { NextRequest, NextResponse } from "next/server";
import { getDataset } from "@/lib/sheet";
import { getSession } from "@/lib/auth";
import { fetchEntryReplies } from "@/lib/relance-replies";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/relances/replies?days=30
 * Détecte, pour les entrées à relancer, les contacts qui ont déjà répondu
 * (lecture seule de pointage@). Ne modifie rien. Protégé par la session SSO.
 */
export async function GET(req: NextRequest) {
  if (process.env.SSO_SECRET && !(await getSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = Number(new URL(req.url).searchParams.get("days")) || 30;
  try {
    const { entries } = await getDataset();
    const result = await fetchEntryReplies(entries, days);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
