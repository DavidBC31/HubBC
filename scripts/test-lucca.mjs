#!/usr/bin/env node
// Diagnostic API Lucca (hors app). Vérifie l'authentification, lit un utilisateur,
// puis SONDE les endpoints absences et tickets resto avec les bons paramètres.
//
// À lancer là où le réseau atteint Lucca (Mac Studio), après avoir mis dans .env.local :
//   LUCCA_URL=https://bleucitron.ilucca.net
//   LUCCA_API_KEY=...        # NE JAMAIS committer
// Usage :
//   node scripts/test-lucca.mjs
//   node scripts/test-lucca.mjs /api/v3/leaves?ownerId=1   # tester un endpoint précis
import fs from "node:fs";

// Charge .env.local sans dépendance (lignes KEY=VALUE).
try {
  for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
  }
} catch {
  console.warn("⚠️  .env.local introuvable — on s'appuie sur les variables d'environnement.");
}

const BASE = (process.env.LUCCA_URL || "https://bleucitron.ilucca.net").replace(/\/$/, "");
const KEY = process.env.LUCCA_API_KEY;
if (!KEY) { console.error("❌ LUCCA_API_KEY non défini (dans .env.local)."); process.exit(1); }

const headers = { Authorization: `lucca application=${KEY}`, Accept: "application/json" };

async function call(path) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: String(e?.message || e) };
  }
}

const short = (s) => (s.length > 600 ? s.slice(0, 600) + "…" : s);

console.log(`→ Instance : ${BASE}`);

// Endpoint explicite passé en argument ?
const arg = process.argv[2];
if (arg) {
  const r = await call(arg);
  console.log(`\n${arg}\n  HTTP ${r.status}\n  ${short(r.text)}`);
  process.exit(r.ok ? 0 : 1);
}

// 1) Auth + récupération du premier user ID (pour les sondes filtrées).
const usersRes = await call("/api/v3/users?limit=3&fields=id,name,mail,employeeNumber");
console.log(`\n[auth] /api/v3/users → HTTP ${usersRes.status}`);
if (usersRes.status === 401 || usersRes.status === 403) {
  console.error("❌ Authentification refusée."); process.exit(1);
}
if (!usersRes.ok) { console.error("❌ " + short(usersRes.text)); process.exit(1); }
console.log("✓ Clé valide.");
let firstUserId = null;
try {
  const parsed = JSON.parse(usersRes.text);
  const items = parsed?.data?.items ?? parsed?.data ?? [];
  firstUserId = items[0]?.id ?? null;
  console.log("  Users:", items.map(u => `${u.id} ${u.name} (matricule: ${u.employeeNumber ?? "?"})`).join(", "));
} catch { /**/ }

// Mois courant pour les filtres de dates.
const now = new Date();
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, "0");
const dateFrom = `${y}-${m}-01`;
const dateTo = `${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`;
console.log(`  Période de test : ${dateFrom} → ${dateTo}`);

// 2) Absences — avec les paramètres requis (date range ou ownerId).
console.log("\n[sonde] absences :");
const absencesCandidates = [
  // Avec date range (paramètre vraisemblablement obligatoire)
  `/api/v3/leaves?date.between=${dateFrom},${dateTo}&fields=id,ownerId,startDate,endDate,duration`,
  `/api/v3/leaveRequests?date.between=${dateFrom},${dateTo}&fields=id,ownerId,startDate,endDate,duration`,
  // Avec ownerId seul
  firstUserId ? `/api/v3/leaves?ownerId=${firstUserId}&fields=id,ownerId,startDate,endDate,duration` : null,
  firstUserId ? `/api/v3/leaveRequests?ownerId=${firstUserId}&fields=id,ownerId,startDate,endDate,duration` : null,
  // Format paging Lucca (offset,limit)
  `/api/v3/leaves?date.between=${dateFrom},${dateTo}&paging=0,5`,
  // Timmi Absences (module séparé)
  `/timmi-absences/api/v1/leavePeriods?startDate=${dateFrom}&endDate=${dateTo}&limit=5`,
].filter(Boolean);

for (const path of absencesCandidates) {
  const r = await call(path);
  const flag = r.ok ? "✓" : (r.status === 404 ? "—" : "⚠️");
  console.log(`  ${flag} HTTP ${String(r.status).padEnd(3)}  ${path}`);
  if (r.ok) console.log("       " + short(r.text).replace(/\n/g, " "));
  else if (r.status !== 404) console.log("       " + short(r.text).replace(/\n/g, " "));
}

// 3) Tickets restaurant — module Figgo + variantes.
console.log("\n[sonde] tickets restaurant :");
const trCandidates = [
  `/figgo/api/v1/lunchVoucherOrders?date.between=${dateFrom},${dateTo}&limit=5`,
  `/figgo/api/lunchVouchers?limit=5`,
  `/api/v3/mealVoucherSummaries?date.between=${dateFrom},${dateTo}`,
  `/api/v3/mealVouchers?date.between=${dateFrom},${dateTo}`,
  `/api/v3/lunchVoucherSummaries?date.between=${dateFrom},${dateTo}`,
  `/api/v3/lunchVouchers?date.between=${dateFrom},${dateTo}`,
  `/pagga/api/mealVouchers?limit=5`,
];
for (const path of trCandidates) {
  const r = await call(path);
  const flag = r.ok ? "✓" : (r.status === 404 ? "—" : "⚠️");
  console.log(`  ${flag} HTTP ${String(r.status).padEnd(3)}  ${path}`);
  if (r.ok) console.log("       " + short(r.text).replace(/\n/g, " "));
  else if (r.status !== 404) console.log("       " + short(r.text).replace(/\n/g, " "));
}

console.log("\nℹ️  Colle la sortie complète ici.");
