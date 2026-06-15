import { NextRequest, NextResponse } from "next/server";
import { buildDrafts } from "@/lib/engine";
import { getDataset } from "@/lib/sheet";
import { createDrafts } from "@/lib/gmail";

export const runtime = "nodejs";

/**
 * POST /api/drafts
 * body: { date?: "yyyy-mm-dd", confirm?: boolean }
 * - sans confirm : renvoie l'aperçu (dry-run, ne touche pas Gmail)
 * - confirm=true : crée réellement les brouillons dans pointage@
 */
export async function POST(req: NextRequest) {
  const { date, confirm, limit, test } = await req.json().catch(() => ({}));
  const runDate = date ? new Date(date + "T12:00:00") : new Date();
  const { entries } = await getDataset();
  let drafts = buildDrafts(entries, runDate);

  if (typeof limit === "number") drafts = drafts.slice(0, limit);
  if (test) drafts = drafts.map((d) => ({ ...d, subject: `[TEST] ${d.subject}` }));

  if (!confirm) {
    return NextResponse.json({ dryRun: true, count: drafts.length, drafts });
  }
  try {
    const created = await createDrafts(drafts);
    return NextResponse.json({ dryRun: false, created });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message }, { status: 500 },
    );
  }
}
