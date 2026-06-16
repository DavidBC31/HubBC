import { NextRequest, NextResponse } from "next/server";
import { buildCSVForMonth, fetchPivotMessages, archiveToDrive } from "@/lib/justif-mailbox";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Côté Pôle Social (US-06).
 * GET  ?mois=yyyy-mm           -> dry-run : liste des justificatifs parsés + CSV (ne touche à rien)
 * POST { mois, archive:true }  -> archive les pièces sur le Drive du mois (US-05)
 *
 * Sécurisé par CRON_SECRET (Authorization: Bearer ...) — même convention que le cron relances.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const mois = req.nextUrl.searchParams.get("mois") ?? undefined;
  try {
    const msgs = await fetchPivotMessages(mois);
    const { csv } = await buildCSVForMonth(mois);
    return NextResponse.json({
      dryRun: true,
      mois: mois ?? "tous",
      count: msgs.length,
      justificatifs: msgs.map((m) => ({ ...m.submission, pieces: m.attachments.length })),
      csv,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { mois, archive } = await req.json().catch(() => ({}));
  if (!archive) return NextResponse.json({ error: "archive:true requis" }, { status: 400 });
  try {
    const res = await archiveToDrive(mois);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
