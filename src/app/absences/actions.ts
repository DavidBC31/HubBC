"use server";

import { fetchAbsencesToTSV } from "@/lib/lucca";

export interface FetchAbsencesResult {
  ok: boolean;
  tsv?: string;
  error?: string;
}

export async function fetchAbsencesFromLucca(
  mois: string,
  collapseMaladie: boolean,
): Promise<FetchAbsencesResult> {
  try {
    const tsv = await fetchAbsencesToTSV(mois, collapseMaladie);
    return { ok: true, tsv };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
