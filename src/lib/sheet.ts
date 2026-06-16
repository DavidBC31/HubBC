import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import * as XLSX from "xlsx";
import type { Dataset, Entry } from "./types";
import { normalizeTabs } from "./normalize";

const TABS = {
  relances: "RELANCES / PIMS A SAISIR",
  autonomes: "AUTONOMES / PIMS A SAISIR",
  billetsTiers: "BILLETS TIERS",
};

/** Compare deux noms d'onglet sans tenir compte des espaces/ponctuation (« / », doubles espaces…). */
const normTab = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

function loadKey() {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  throw new Error("Clé service account introuvable.");
}

export async function fetchXlsxBuffer(fileId: string): Promise<Buffer> {
  const key = loadKey();
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    subject: process.env.GMAIL_IMPERSONATE ?? "pointage@bleucitron.net",
  });
  const drive = google.drive({ version: "v3", auth });
  // Deux cas : un Google Sheet natif s'obtient via `export` (conversion xlsx) ;
  // un .xlsx déjà uploadé via `get?alt=media` (téléchargement direct).
  const XLSX_MIME =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const meta = await drive.files.get({
    fileId,
    fields: "mimeType",
    supportsAllDrives: true,
  });
  const isNativeSheet =
    meta.data.mimeType === "application/vnd.google-apps.spreadsheet";
  const res = isNativeSheet
    ? await drive.files.export(
        { fileId, mimeType: XLSX_MIME },
        { responseType: "arraybuffer" },
      )
    : await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" },
      );
  return Buffer.from(res.data as ArrayBuffer);
}

type Row = (string | number | boolean | Date | null)[];

function tabRows(wb: XLSX.WorkBook, name: string): Row[] {
  // Tolérant aux variantes de nom (slash, espaces multiples) — cf. normTab.
  const want = normTab(name);
  const found = wb.SheetNames.find((n) => normTab(n) === want);
  if (!found) {
    console.warn(`[sheet] Onglet absent: "${name}" — ignoré (0 ligne).`);
    return [];
  }
  return XLSX.utils.sheet_to_json(wb.Sheets[found], { header: 1, raw: true, defval: null }) as Row[];
}

/** Snapshot local (data/relances.json) — repli quand Drive indisponible. */
function loadSnapshot(): Dataset {
  const p = path.join(process.cwd(), "data", "relances.json");
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Dataset;
}

/**
 * Source de vérité : lit le doc en live depuis Drive si possible,
 * sinon retombe sur le snapshot committé. Renvoie aussi la provenance.
 */
export async function getDataset(): Promise<Dataset & { live: boolean; warning?: string }> {
  const fileId = process.env.POINTAGE_SHEET_FILE_ID;
  if (fileId) {
    try {
      const buf = await fetchXlsxBuffer(fileId);
      const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
      const entries: Entry[] = normalizeTabs({
        relances: tabRows(wb, TABS.relances),
        autonomes: tabRows(wb, TABS.autonomes),
        billetsTiers: tabRows(wb, TABS.billetsTiers),
      });
      return {
        live: true,
        generated_at: new Date().toISOString(),
        source_file: "Drive (live)",
        count: entries.length,
        entries,
      };
    } catch (e) {
      return { ...loadSnapshot(), live: false, warning: (e as Error).message.slice(0, 200) };
    }
  }
  return { ...loadSnapshot(), live: false, warning: "POINTAGE_SHEET_FILE_ID non défini — snapshot." };
}
