#!/usr/bin/env node
// Diagnostic API Lucca (hors app). Vérifie l'authentification, lit un utilisateur,
// puis SONDE quelques endpoints candidats (absences, tickets resto) pour découvrir
// la forme exacte de l'API de l'instance.
//
// À lancer là où le réseau atteint Lucca (Mac Studio), après avoir mis dans .env.local :
//   LUCCA_URL=https://bleucitron.ilucca.net
//   LUCCA_API_KEY=...        # NE JAMAIS committer
// Usage :
//   node scripts/test-lucca.mjs
//   node scripts/test-lucca.mjs /api/v3/leaves?limit=1   # tester un endpoint précis
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

// Auth Lucca : en-tête « Authorization: lucca application=<clé> ».
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

const short = (s) => (s.length > 400 ? s.slice(0, 400) + "…" : s);

console.log(`→ Instance : ${BASE}`);

// Endpoint explicite passé en argument ?
const arg = process.argv[2];
if (arg) {
  const r = await call(arg);
  console.log(`\n${arg}\n  HTTP ${r.status}\n  ${short(r.text)}`);
  process.exit(r.ok ? 0 : 1);
}

// 1) Auth : lecture d'un utilisateur (endpoint le plus stable de Lucca).
const me = await call("/api/v3/users?limit=1&fields=id,name,mail");
console.log(`\n[auth] /api/v3/users → HTTP ${me.status}`);
if (me.status === 401 || me.status === 403) {
  console.error("❌ Authentification refusée. Vérifie LUCCA_API_KEY et les droits associés à la clé.");
  console.error("   " + short(me.text));
  process.exit(1);
}
if (!me.ok) { console.error("❌ Réponse inattendue : " + short(me.text)); process.exit(1); }
console.log("✓ Clé valide. " + short(me.text));

// 2) Sonde des endpoints candidats (découverte). On n'interprète pas encore le contenu.
console.log("\n[sonde] endpoints candidats — absences :");
const absencesCandidates = [
  "/timmi-absences/api/leaves?limit=1",
  "/api/v3/leaves?limit=1",
  "/api/v3/leaveRequests?limit=1",
  "/api/v3/leaveAccounts?limit=1",
  "/api/v3/users/me",
];
for (const path of absencesCandidates) {
  const r = await call(path);
  const flag = r.ok ? "✓" : (r.status === 404 ? "—" : "⚠️");
  console.log(`  ${flag} HTTP ${String(r.status).padEnd(3)}  ${path}`);
  if (r.ok) console.log("       " + short(r.text).replace(/\n/g, " "));
}

console.log("\n[sonde] endpoints candidats — tickets restaurant :");
const trCandidates = [
  "/lunch-vouchers/api/summary?limit=1",
  "/api/v3/lunchVoucherSummaries?limit=1",
  "/api/v3/lunchVouchers?limit=1",
];
for (const path of trCandidates) {
  const r = await call(path);
  const flag = r.ok ? "✓" : (r.status === 404 ? "—" : "⚠️");
  console.log(`  ${flag} HTTP ${String(r.status).padEnd(3)}  ${path}`);
  if (r.ok) console.log("       " + short(r.text).replace(/\n/g, " "));
}

console.log("\nℹ️  Colle la sortie complète ici : on en déduit les endpoints exacts à câbler.");
