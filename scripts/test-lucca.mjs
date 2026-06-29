#!/usr/bin/env node
// Diagnostic API Lucca — découverte de la syntaxe de filtre date sur FiggoLeave.
// Usage :
//   node scripts/test-lucca.mjs
//   node scripts/test-lucca.mjs "/api/v3/leaves?ownerId=1&dateFrom=2026-06-01"
import fs from "node:fs";

try {
  for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
  }
} catch { console.warn("⚠️  .env.local introuvable."); }

const BASE = (process.env.LUCCA_URL || "https://bleucitron.ilucca.net").replace(/\/$/, "");
const KEY = process.env.LUCCA_API_KEY;
if (!KEY) { console.error("❌ LUCCA_API_KEY non défini."); process.exit(1); }
const headers = { Authorization: `lucca application=${KEY}`, Accept: "application/json" };

async function call(path) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) { return { ok: false, status: 0, text: String(e?.message || e) }; }
}

const short = (s, n = 600) => s.length > n ? s.slice(0, n) + "…" : s;
const fmt = r => short(r.text, 300).replace(/\n/g, " ");

const arg = process.argv[2];
if (arg) {
  const r = await call(arg);
  console.log(`HTTP ${r.status}\n${short(r.text, 3000)}`);
  process.exit(r.ok ? 0 : 1);
}

// 1) Auth + premier userId
const u = await call("/api/v3/users?limit=2&fields=id,name,employeeNumber");
if (!u.ok) { console.error("❌ Auth KO"); process.exit(1); }
const uid = JSON.parse(u.text)?.data?.items?.[0]?.id ?? 1;
console.log(`✓ Auth OK — ownerId de test : ${uid}`);

const Y = "2026"; const M = "06";
const from = `${Y}-${M}-01`;
const to   = `${Y}-${M}-30`;

// 2) Toutes les variantes de filtre date sur /api/v3/leaves (exige ownerId + date).
console.log(`\n── /api/v3/leaves — variantes de filtre date (ownerId=${uid}) ──`);
const leavesFilters = [
  // Paramètres séparés (style français courant)
  `dateFrom=${from}&dateTo=${to}`,
  `startDate=${from}&endDate=${to}`,
  `dateDebut=${from}&dateFin=${to}`,
  // Syntaxe courte (gte/lte)
  `date.gte=${from}&date.lte=${to}`,
  `date.ge=${from}&date.le=${to}`,
  `date.gt=${from}&date.lt=${to}`,
  // Dot-notation longue alternative
  `date.after=${from}&date.before=${to}`,
  `date.min=${from}&date.max=${to}`,
  `date.since=${from}&date.until=${to}`,
  // Date unique au milieu du mois (pour voir si ça marche du tout)
  `date=${Y}-${M}-15`,
  // Opérateurs entre crochets
  `date[gte]=${from}&date[lte]=${to}`,
];
for (const f of leavesFilters) {
  const r = await call(`/api/v3/leaves?ownerId=${uid}&${f}&paging=0,1`);
  const flag = r.ok ? "✓" : r.status === 404 ? "—" : "⚠️";
  console.log(`  ${flag} ${r.status}  ?${f}`);
  if (r.ok) console.log("       " + fmt(r));
  else if (r.status !== 404) {
    // Extraire juste le message d'erreur
    try { console.log("       " + JSON.parse(r.text)?.detail); } catch { /**/ }
  }
}

// 3) FiggoLeaveRequest — trouver le bon filtre userId/owner + date.
console.log(`\n── /api/v3/leaveRequests — variantes userId + date ──`);
const reqFilters = [
  `userId=${uid}&startDate=${from}&endDate=${to}`,
  `userId=${uid}&dateFrom=${from}&dateTo=${to}`,
  `userId=${uid}&date=${Y}-${M}-15`,
  `ownerId=${uid}&startDate=${from}&endDate=${to}`,  // déjà testée → KO
  `requesterId=${uid}&startDate=${from}&endDate=${to}`,
];
for (const f of reqFilters) {
  const r = await call(`/api/v3/leaveRequests?${f}&paging=0,1`);
  const flag = r.ok ? "✓" : r.status === 404 ? "—" : "⚠️";
  console.log(`  ${flag} ${r.status}  ?${f}`);
  if (r.ok) console.log("       " + fmt(r));
  else if (r.status !== 404) {
    try { console.log("       " + JSON.parse(r.text)?.detail); } catch { /**/ }
  }
}

console.log("\nℹ️  Colle la sortie — la ligne ✓ indique la syntaxe correcte.");
