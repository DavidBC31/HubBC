#!/usr/bin/env node
// Diagnostic API Lucca — absences Figgo.
// Usage :
//   node scripts/test-lucca.mjs
//   node scripts/test-lucca.mjs /api/v3/leaves?ownerId=1   # endpoint précis
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
  } catch (e) {
    return { ok: false, status: 0, text: String(e?.message || e) };
  }
}

const short = (s, n = 800) => (s.length > n ? s.slice(0, n) + "…" : s);

const arg = process.argv[2];
if (arg) {
  const r = await call(arg);
  console.log(`\n${arg}\n  HTTP ${r.status}\n  ${short(r.text, 2000)}`);
  process.exit(r.ok ? 0 : 1);
}

// 1) Auth + premier userId
const usersRes = await call("/api/v3/users?limit=2&fields=id,name,employeeNumber");
if (!usersRes.ok) { console.error("❌ Auth KO:", usersRes.text); process.exit(1); }
const usersJson = JSON.parse(usersRes.text);
const users = usersJson?.data?.items ?? usersJson?.data ?? [];
const firstUserId = users[0]?.id;
console.log(`✓ Auth OK — premier user id=${firstUserId} (${users[0]?.name})`);

const now = new Date();
const y = now.getFullYear();
const mo = String(now.getMonth() + 1).padStart(2, "0");
const from = `${y}-${mo}-01`;
const to = `${y}-${mo}-${new Date(y, now.getMonth() + 1, 0).getDate()}`;
console.log(`Période : ${from} → ${to}\n`);

// 2) Trouver les bons opérateurs de filtre date pour FiggoLeave.
console.log("─── Filtre date sur /api/v3/leaves ───");
const dateFilters = [
  `date.greaterThanOrEqual=${from}&date.lowerThanOrEqual=${to}`,
  `date.greaterThan=${y}-${mo}-00&date.lowerThan=${y}-${String(now.getMonth() + 2).padStart(2, "0")}-01`,
  `startDate.greaterThanOrEqual=${from}&startDate.lowerThanOrEqual=${to}`,
  `from.greaterThanOrEqual=${from}&from.lowerThanOrEqual=${to}`,
];
for (const f of dateFilters) {
  const r = await call(`/api/v3/leaves?${f}&paging=0,3`);
  const flag = r.ok ? "✓" : (r.status === 404 ? "—" : "⚠️");
  console.log(`  ${flag} HTTP ${r.status}  ?${f}`);
  if (r.ok || r.status !== 404) console.log("    " + short(r.text, 300).replace(/\n/g, " "));
}

// 3) Structure réelle de FiggoLeave (sans filtre champs, limité à 1 résultat).
console.log("\n─── Structure FiggoLeave (ownerId + sans fields) ───");
const raw = await call(`/api/v3/leaves?ownerId=${firstUserId}&paging=0,1`);
console.log(`  HTTP ${raw.status}`);
console.log("  " + short(raw.text, 800).replace(/\n/g, " "));

// 4) Structure FiggoLeaveRequest.
console.log("\n─── Structure FiggoLeaveRequest (ownerId + sans fields) ───");
const rawReq = await call(`/api/v3/leaveRequests?ownerId=${firstUserId}&paging=0,1`);
console.log(`  HTTP ${rawReq.status}`);
console.log("  " + short(rawReq.text, 800).replace(/\n/g, " "));

// 5) LeaveAccounts (comptes de congés — structure du type).
console.log("\n─── FiggoLeaveAccount ───");
const acc = await call(`/api/v3/leaveAccounts?ownerId=${firstUserId}&paging=0,3`);
console.log(`  HTTP ${acc.status}`);
console.log("  " + short(acc.text, 800).replace(/\n/g, " "));

console.log("\nℹ️  Colle la sortie complète ici.");
