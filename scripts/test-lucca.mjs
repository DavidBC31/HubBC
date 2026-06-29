#!/usr/bin/env node
// Diagnostic API Lucca — recherche exhaustive de la syntaxe de filtre date Figgo.
// Usage :
//   node scripts/test-lucca.mjs
//   node scripts/test-lucca.mjs "/api/v3/leaves?ownerId=1&date=2026-06-01"
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
  for (const path of paths.filter(Boolean)) {
    const r = await call(path);
    const flag = r.ok ? "✓" : r.status === 404 ? "—" : `⚠️ ${r.status}`;
    const detail = r.ok
      ? short(r.text, 400)
      : (() => { try { return JSON.parse(r.text)?.detail ?? r.text.slice(0, 200); } catch { return r.text.slice(0, 200); } })();
    console.log(`  ${flag}  ${path.replace(BASE, "")}`);
    if (r.ok || r.status !== 404) console.log(`         ${detail.replace(/\n/g, " ")}`);
  }
  console.log();
}

const oid = `ownerId=${uid}`;

// 1) Opérateurs PascalCase (la plupart des APIs Lucca v3 les utilisent ainsi).
await probe("/api/v3/leaves — PascalCase operators", [
  `${BASE}/api/v3/leaves?${oid}&date.Between=2026-06-01,2026-06-30&paging=0,1`,
  `${BASE}/api/v3/leaves?${oid}&date.GreaterThanOrEqual=2026-06-01&date.LowerThanOrEqual=2026-06-30&paging=0,1`,
  `${BASE}/api/v3/leaves?${oid}&date.GreaterThan=2026-05-31&date.LowerThan=2026-07-01&paging=0,1`,
]);

// 2) Paramètres période (year/month ou yearMonth).
await probe("/api/v3/leaves — params période", [
  `${BASE}/api/v3/leaves?${oid}&year=2026&month=6&paging=0,1`,
  `${BASE}/api/v3/leaves?${oid}&year=2026&month=06&paging=0,1`,
  `${BASE}/api/v3/leaves?${oid}&period=2026-06&paging=0,1`,
  `${BASE}/api/v3/leaves?${oid}&yearMonth=2026-06&paging=0,1`,
  `${BASE}/api/v3/leaves?${oid}&dateRange=2026-06-01,2026-06-30&paging=0,1`,
  `${BASE}/api/v3/leaves?${oid}&date=2026-06&paging=0,1`,
]);

// 3) Séparer les champs date (peut-être que FiggoLeave a startDate et endDate sous un autre nom).
await probe("/api/v3/leaves — champs de dates alternatifs", [
  `${BASE}/api/v3/leaves?${oid}&startOn=2026-06-01&endOn=2026-06-30&paging=0,1`,
  `${BASE}/api/v3/leaves?${oid}&start=2026-06-01&end=2026-06-30&paging=0,1`,
  `${BASE}/api/v3/leaves?${oid}&beginDate=2026-06-01&endDate=2026-06-30&paging=0,1`,
]);

// 4) Découverte de schéma Lucca (OpenAPI / Swagger / OData $metadata).
await probe("Découverte schéma", [
  `${BASE}/api/v3/$metadata`,
  `${BASE}/swagger/v1/swagger.json`,
  `${BASE}/api/docs/swagger.json`,
  `${BASE}/api/v3/leaves/$metadata`,
  `${BASE}/api/v3/leaveAccounts?paging=0,5&fields=id,name,code`,
]);

console.log("ℹ️  Colle la sortie complète.");
