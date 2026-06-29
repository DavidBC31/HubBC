#!/usr/bin/env node
// Diagnostic API Lucca — syntaxe filtre date FiggoLeave (demi-journées).
// Usage :
//   node scripts/test-lucca.mjs
//   node scripts/test-lucca.mjs "/api/v3/leaves?ownerId=1&date=2026-06-01/2026-06-30"
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

const short = (s, n = 500) => s.length > n ? s.slice(0, n) + "…" : s;
const detail = r => {
  if (r.ok) return short(r.text, 600);
  try { return JSON.parse(r.text)?.detail ?? r.text.slice(0, 200); } catch { return r.text.slice(0, 200); }
};

const arg = process.argv[2];
if (arg) {
  const r = await call(arg);
  console.log(`HTTP ${r.status}\n${short(r.text, 3000)}`);
  process.exit(r.ok ? 0 : 1);
}

// Auth
const u = await call("/api/v3/users?limit=2&fields=id,name,employeeNumber");
if (!u.ok) { console.error("❌ Auth KO"); process.exit(1); }
const uid = JSON.parse(u.text)?.data?.items?.[0]?.id ?? 1;
console.log(`✓ Auth OK — ownerId de test : ${uid}\n`);

async function probe(label, paths) {
  console.log(`── ${label} ──`);
  for (const p of paths) {
    const r = await call(p);
    const flag = r.ok ? "✓" : r.status === 404 ? "—" : `⚠️ ${r.status}`;
    console.log(`  ${flag}  ${p.replace(BASE, "")}`);
    if (r.ok || r.status !== 404) console.log(`         ${detail(r).replace(/\n/g, " ")}`);
  }
  console.log();
}

const from = "2026-06-01"; const to = "2026-06-30";

// 1) Valeur-range dans le paramètre date (/, |, ..)
await probe("date= valeur-range", [
  `${BASE}/api/v3/leaves?ownerId=${uid}&date=${from}/${to}&paging=0,3`,
  `${BASE}/api/v3/leaves?ownerId=${uid}&date=${from}|${to}&paging=0,3`,
  `${BASE}/api/v3/leaves?ownerId=${uid}&date=${from},${to}&paging=0,3`,
  `${BASE}/api/v3/leaves?ownerId=${uid}&date=[${from},${to}]&paging=0,3`,
]);

// 2) Endpoint sub-resource user
await probe("sous-ressource /api/v3/users/{id}/leaves", [
  `${BASE}/api/v3/users/${uid}/leaves?paging=0,3`,
  `${BASE}/api/v3/users/${uid}/leaves?year=2026&month=6&paging=0,3`,
  `${BASE}/api/v3/users/${uid}/leaves?from=${from}&to=${to}&paging=0,3`,
]);

// 3) Endpoints alternatifs Figgo
await probe("endpoints alternatifs Figgo", [
  `${BASE}/api/v3/leaveSummaries?ownerId=${uid}&year=2026&month=6`,
  `${BASE}/api/v3/leaveUsages?ownerId=${uid}&year=2026&month=6`,
  `${BASE}/api/v3/leaveTransactions?ownerId=${uid}&paging=0,3`,
  `${BASE}/api/v3/figgoLeaves?ownerId=${uid}&paging=0,3`,
  `${BASE}/figgo/api/v1/leaves?ownerId=${uid}&paging=0,3`,
  `${BASE}/figgo/api/leaves?ownerId=${uid}&paging=0,3`,
]);

// 4) Récupérer UN enregistrement connu via son ID formaté.
// ID format : {ownerId}-{yyyyMMdd}-{AM|PM} → essayer une date récente.
await probe("accès direct par ID (format {uid}-{date}-{AM|PM})", [
  `${BASE}/api/v3/leaves/${uid}-20260601-AM`,
  `${BASE}/api/v3/leaves/${uid}-20260610-AM`,
  `${BASE}/api/v3/leaves/${uid}-20260610-PM`,
]);

// 5) leaveAccounts sans le champ code (pour voir la structure disponible).
await probe("leaveAccounts (sans code)", [
  `${BASE}/api/v3/leaveAccounts?ownerId=${uid}&paging=0,3&fields=id,name`,
  `${BASE}/api/v3/leaveAccounts?paging=0,3&fields=id,name`,
]);

console.log("ℹ️  Colle la sortie complète.");
