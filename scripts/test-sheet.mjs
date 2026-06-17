#!/usr/bin/env node
// Diagnostic d'accès au classeur de suivi (hors app) : vérifie que le
// service-account peut lire POINTAGE_SHEET_FILE_ID et liste les onglets trouvés
// avec leur nb de lignes. À lancer sur la machine de prod après avoir rempli
// .env.local et déposé .secrets/service-account.json :
//   node scripts/test-sheet.mjs
import fs from "node:fs";
import { google } from "googleapis";
import * as XLSX from "xlsx";

// Charge .env.local sans dépendance (lignes KEY=VALUE).
for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
}

const fileId = process.env.POINTAGE_SHEET_FILE_ID;
if (!fileId) { console.error("❌ POINTAGE_SHEET_FILE_ID non défini dans .env.local"); process.exit(1); }

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./.secrets/service-account.json";
const key = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
const subject = process.env.GMAIL_IMPERSONATE ?? "pointage@bleucitron.net";

const auth = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  subject,
});
const drive = google.drive({ version: "v3", auth });

console.log(`→ Fichier ${fileId}, impersonation ${subject}`);
const meta = await drive.files.get({ fileId, fields: "name,mimeType", supportsAllDrives: true });
console.log(`  nom: ${meta.data.name}\n  type: ${meta.data.mimeType}`);

const isNative = meta.data.mimeType === "application/vnd.google-apps.spreadsheet";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const res = isNative
  ? await drive.files.export({ fileId, mimeType: XLSX_MIME }, { responseType: "arraybuffer" })
  : await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });

const wb = XLSX.read(Buffer.from(res.data), { type: "buffer", cellDates: true });
console.log(`  mode lecture: ${isNative ? "export (Sheet natif)" : "alt=media (.xlsx uploadé)"}`);
console.log("→ Onglets trouvés:");
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
  console.log(`  • "${name}" — ${rows.length} lignes`);
}
console.log("✓ Accès OK. Si tu vois l'onglet des relances ci-dessus, l'app le lira en live.");
