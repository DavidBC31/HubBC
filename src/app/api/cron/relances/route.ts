import { NextRequest, NextResponse } from "next/server";
import { buildDrafts, jourDe } from "@/lib/engine";
import { getDataset } from "@/lib/sheet";
import { createDrafts } from "@/lib/gmail";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cron hebdo (Vercel) — crée les brouillons du jour dans pointage@.
 * Sécurisé par CRON_SECRET (Vercel l'envoie en `Authorization: Bearer ...`).
 * Rien n'est ENVOYÉ : l'équipe relit et envoie à la main.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { entries, live } = await getDataset();
  const drafts = buildDrafts(entries, now);

  try {
    const created = await createDrafts(drafts);
    return NextResponse.json({
      ok: true,
      jour: jourDe(now),
      live,
      created: created.length,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
