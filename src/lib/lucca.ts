/**
 * Client Lucca API — absences (Timmi Absences) et tickets resto.
 *
 * Auth : en-tête `Authorization: lucca application=<LUCCA_API_KEY>`.
 * Toutes les requêtes partent du serveur Next.js ; la clé n'est jamais exposée
 * au navigateur. Les données RH transitent par le serveur (contrairement au
 * nettoyeur fichier qui est 100 % navigateur), ce qui est conforme au RGPD
 * puisque la source est Lucca, système RH autorisé.
 *
 * Endpoint validé : à confirmer via `node scripts/test-lucca.mjs` sur Mac Studio
 * (le conteneur cloud ne peut pas atteindre bleucitron.ilucca.net).
 */

import { LUCCA_CODE_MAP, SPCT_TYPES, cleanAbsences, toTSV } from "./absences";

const BASE = (process.env.LUCCA_URL || "https://bleucitron.ilucca.net").replace(/\/$/, "");

function luccaHeaders(): Record<string, string> {
  const key = process.env.LUCCA_API_KEY;
  if (!key) throw new Error("LUCCA_API_KEY non défini dans .env.local");
  return { Authorization: `lucca application=${key}`, Accept: "application/json" };
}

// ─── Types Lucca ─────────────────────────────────────────────────────────────

interface LuccaOwner {
  id: number;
  employeeNumber?: string;
  lastName?: string;
  firstName?: string;
  name?: string;
}

interface LuccaLeaveType {
  id: number;
  name?: string;
}

interface LuccaLeave {
  id: number | string;
  ownerId?: number;
  owner?: LuccaOwner;
  leavePeriodType?: LuccaLeaveType;
  leaveAccount?: { leaveType?: LuccaLeaveType; code?: string };
  startDate?: string;
  endDate?: string;
  duration?: number;
}

interface LuccaResponse<T> {
  data?: { items?: T[]; count?: number } | T[];
  items?: T[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lastDay(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().split("T")[0];
}

function isoToFr(iso: string): string {
  // "2024-06-03T00:00:00" ou "2024-06-03" → "03/06/2024"
  const d = iso.slice(0, 10).split("-");
  return `${d[2]}/${d[1]}/${d[0]}`;
}

function leaveTypeId(leave: LuccaLeave): number | null {
  if (leave.leavePeriodType?.id != null) return leave.leavePeriodType.id;
  if (leave.leaveAccount?.leaveType?.id != null) return leave.leaveAccount.leaveType.id;
  return null;
}

function extractItems<T>(res: LuccaResponse<T>): T[] {
  if (!res) return [];
  if (Array.isArray(res)) return res as unknown as T[];
  if (res.data) {
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data.items)) return res.data.items;
  }
  if (Array.isArray(res.items)) return res.items;
  return [];
}

// ─── Fetch absences ──────────────────────────────────────────────────────────

/**
 * Récupère les absences Lucca pour un mois donné (YYYY-MM).
 * Retourne une chaîne TSV au format que `cleanAbsences()` sait parser,
 * avec les colonnes canoniques sPAIEctacle.
 *
 * L'endpoint principal est /timmi-absences/api/leaves. Si Lucca répond 404,
 * on bascule sur /api/v3/leaves (variante Pagga/legacy). Valider avec
 * `node scripts/test-lucca.mjs` sur Mac Studio.
 */
export async function fetchAbsencesToTSV(
  mois: string,
  collapseMaladie = true,
): Promise<string> {
  const [year, month] = mois.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = lastDay(year, month);

  const hdrs = luccaHeaders();

  // Champs communs aux deux endpoints.
  const fields =
    "id,ownerId,owner.id,owner.employeeNumber,owner.lastName,owner.firstName," +
    "leavePeriodType.id,leavePeriodType.name,startDate,endDate,duration";

  // Essai 1 : Timmi Absences (module moderne).
  let items = await tryFetchLeaves(
    `${BASE}/timmi-absences/api/leaves?date.between=${start},${end}&fields=${fields}&paging=0,500`,
    hdrs,
  );

  // Essai 2 : Lucca v3 legacy.
  if (items === null) {
    items = await tryFetchLeaves(
      `${BASE}/api/v3/leaves?date.between=${start},${end}&fields=${fields}&paging=0,500`,
      hdrs,
    );
  }

  if (items === null) {
    throw new Error(
      "Impossible d'atteindre l'API Lucca. Vérifiez LUCCA_URL, LUCCA_API_KEY et " +
        "que le réseau autorise l'accès à ilucca.net. " +
        "Lancez `node scripts/test-lucca.mjs` sur Mac Studio pour diagnostiquer.",
    );
  }

  return luccaItemsToTSV(items, collapseMaladie);
}

async function tryFetchLeaves(
  url: string,
  hdrs: Record<string, string>,
): Promise<LuccaLeave[] | null> {
  try {
    const res = await fetch(url, {
      headers: hdrs,
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (res.status === 404) return null; // endpoint inexistant → essayer le suivant
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Lucca HTTP ${res.status} — ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as LuccaResponse<LuccaLeave>;
    return extractItems(json);
  } catch (e) {
    if ((e as Error).message.includes("Lucca HTTP")) throw e;
    return null; // réseau inaccessible → essayer le suivant
  }
}

// ─── Conversion JSON Lucca → TSV ─────────────────────────────────────────────

/**
 * Convertit les items JSON Lucca directement en TSV sPAIEctacle via cleanAbsences().
 * Produit une ligne par (matricule, période) — cleanAbsences() s'occupe de la fusion.
 */
function luccaItemsToTSV(items: LuccaLeave[], collapseMaladie: boolean): string {
  if (items.length === 0) {
    // Aucune absence ce mois : retourne un TSV avec seulement l'en-tête.
    const header = ["matricule", "(nom)", "(prenom)"];
    for (const t of SPCT_TYPES) header.push(t, `${t}/L`);
    return header.join("\t") + "\r\n";
  }

  // Construire le même format tabular qu'un export Lucca pour réutiliser cleanAbsences().
  // En-tête : matricule, (nom), (prenom), puis une colonne par type connu + /L.
  const allCodes = new Set<string>();
  for (const item of items) {
    const tid = leaveTypeId(item);
    if (tid != null) {
      const abbr = LUCCA_CODE_MAP[String(tid)];
      if (abbr) allCodes.add(abbr);
    }
  }
  const usedTypes = SPCT_TYPES.filter((t) => allCodes.has(t));

  const hdr = ["matricule", "(nom)", "(prenom)"];
  for (const t of usedTypes) hdr.push(t, `${t}/L`);

  const lines: string[] = [hdr.join("\t")];

  for (const item of items) {
    const owner = item.owner;
    const mat = owner?.employeeNumber?.trim() || String(item.ownerId ?? "");
    if (!mat) continue;

    const tid = leaveTypeId(item);
    const abbr = tid != null ? LUCCA_CODE_MAP[String(tid)] : undefined;
    if (!abbr) continue; // code hors périmètre → ignoré

    const qty = item.duration ?? 0;
    const start = item.startDate ? isoToFr(item.startDate) : "";
    const end = item.endDate ? isoToFr(item.endDate) : "";
    const label = start && end && start !== end ? `${start} - ${end}` : start;

    const row: string[] = [
      mat,
      owner?.lastName ?? "",
      owner?.firstName ?? "",
    ];
    for (const t of usedTypes) {
      if (t === abbr) {
        row.push(String(qty), label);
      } else {
        row.push("", "");
      }
    }
    lines.push(row.join("\t"));
  }

  const rawTSV = lines.join("\r\n") + "\r\n";
  const result = cleanAbsences(rawTSV, collapseMaladie);
  return toTSV(result.header, result.rows);
}

// ─── Fetch tickets restaurant ─────────────────────────────────────────────────

export interface TRLine {
  matricule: string;
  nom: string;
  prenom: string;
  nombreTR: number;
  valeurFaciale: number;
  partEmployeur: number;
}

/**
 * Récupère les tickets restaurant Lucca pour un mois donné (YYYY-MM).
 * Endpoint à valider via `node scripts/test-lucca.mjs`.
 */
export async function fetchTicketsResto(mois: string): Promise<TRLine[]> {
  const [year, month] = mois.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = lastDay(year, month);

  const hdrs = luccaHeaders();
  const fields =
    "ownerId,owner.employeeNumber,owner.lastName,owner.firstName," +
    "count,faceValue,employerContribution,collaboratorContribution,period";

  const candidates = [
    `${BASE}/lunch-vouchers/api/summary?period.between=${start},${end}&fields=${fields}&paging=0,500`,
    `${BASE}/api/v3/lunchVoucherSummaries?period.between=${start},${end}&fields=${fields}&paging=0,500`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: hdrs,
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      if (res.status === 404) continue;
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Lucca TR HTTP ${res.status} — ${text.slice(0, 300)}`);
      }
      const json = (await res.json()) as LuccaResponse<Record<string, unknown>>;
      const items = extractItems(json) as Record<string, unknown>[];
      return items.map((it) => {
        const owner = (it.owner ?? {}) as LuccaOwner;
        return {
          matricule: String(owner.employeeNumber ?? it.ownerId ?? ""),
          nom: String(owner.lastName ?? ""),
          prenom: String(owner.firstName ?? ""),
          nombreTR: Number(it.count ?? it.nombreTR ?? 0),
          valeurFaciale: Number(it.faceValue ?? it.valeurFaciale ?? 0),
          partEmployeur: Number(it.employerContribution ?? it.partEmployeur ?? 0),
        };
      });
    } catch (e) {
      if ((e as Error).message.includes("Lucca TR HTTP")) throw e;
      continue;
    }
  }

  throw new Error(
    "Impossible de récupérer les tickets restaurant depuis Lucca. " +
      "Endpoint inconnu — valider avec `node scripts/test-lucca.mjs`.",
  );
}
