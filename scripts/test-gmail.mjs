#!/usr/bin/env node
// Diagnostic d'envoi Gmail (délégation domaine) : reproduit l'étape qui échoue
// dans /justificatifs avec « unauthorized_client … scopes requested ». Confirme,
// en une commande, si la Domain-Wide Delegation est bien autorisée pour les
// scopes Gmail, et impersonne la boîte JUSTIF_MAILBOX pour lire son profil.
//
// À lancer sur la machine de prod (après .env.local + .secrets/service-account.json) :
//   node scripts/test-gmail.mjs
// Par défaut il N'ENVOIE PAS de mail. Pour tester un envoi réel à blanc :
//   node scripts/test-gmail.mjs --send destinataire@bleucitron.net
import fs from "node:fs";
import { google } from "googleapis";

// Charge .env.local sans dépendance (lignes KEY=VALUE).
try {
  for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, "").trim();
  }
} catch {
  console.warn("⚠️  .env.local introuvable — on s'appuie sur les variables d'environnement.");
}

// Mêmes scopes que src/lib/gmail.ts (c'est l'envoi qui échoue côté /justificatifs).
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
];

function loadKey() {
  const b64 = process.env.GOOGLE_SA_KEY_B64;
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./.secrets/service-account.json";
  if (!fs.existsSync(p)) {
    console.error(`❌ Clé service account introuvable (${p}). Renseigne GOOGLE_APPLICATION_CREDENTIALS ou GOOGLE_SA_KEY_B64.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

const sendTo = process.argv.includes("--send") ? process.argv[process.argv.indexOf("--send") + 1] : null;
const key = loadKey();
const mailbox = process.env.JUSTIF_MAILBOX ?? "justif@bleucitron.net";

console.log("→ Service account :", key.client_email);
console.log("  Client ID (à inscrire en délégation domaine) :", key.client_id);
console.log("  Boîte impersonnée (JUSTIF_MAILBOX) :", mailbox);
console.log("  Scopes demandés :", SCOPES.join(", "));
console.log("");

const auth = new google.auth.JWT({ email: key.client_email, key: key.private_key, scopes: SCOPES, subject: mailbox });

function diagnose(err) {
  const msg = String(err?.response?.data?.error_description || err?.message || err);
  console.error("❌ Échec :", msg);
  if (/unauthorized_client|not authorized for any of the scopes/i.test(msg)) {
    console.error("\n   → La délégation domaine n'est pas (ou mal) autorisée pour ces scopes.");
    console.error("     Admin Console → Sécurité → Commandes des API → Délégation au niveau du domaine.");
    console.error(`     Client ID = ${key.client_id}`);
    console.error("     Scopes (séparés par des virgules, SANS espaces) :");
    console.error("     " + SCOPES.concat([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/drive",
    ]).join(","));
    console.error("     Puis attendre 5–15 min (propagation).");
  } else if (/invalid_grant|account not found|Invalid email/i.test(msg)) {
    console.error(`\n   → La boîte impersonnée « ${mailbox} » n'existe pas dans le Workspace, ou n'est pas accessible.`);
  } else if (/insufficient|accessNotConfigured|has not been used|disabled/i.test(msg)) {
    console.error("\n   → L'API Gmail n'est pas activée dans le projet Cloud du service account.");
  }
}

try {
  // 1) Demande de jeton : c'est ICI qu'« unauthorized_client » apparaît si la DWD est KO.
  await auth.authorize();
  console.log("✓ Jeton obtenu — la délégation domaine autorise bien ces scopes.");

  // 2) Confirme l'accès à la boîte impersonnée.
  const gmail = google.gmail({ version: "v1", auth });
  const prof = await gmail.users.getProfile({ userId: "me" });
  console.log(`✓ Accès boîte ${prof.data.emailAddress} (${prof.data.messagesTotal} messages).`);

  // 3) Envoi réel optionnel.
  if (sendTo) {
    const raw = Buffer.from(
      `From: ${mailbox}\r\nTo: ${sendTo}\r\nSubject: [TEST] diagnostic délégation\r\n\r\n` +
      `Test d'envoi depuis test-gmail.mjs — la délégation domaine fonctionne.`,
      "utf-8",
    ).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
    const sent = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    console.log(`✓ Mail de test envoyé à ${sendTo} (id ${sent.data.id}).`);
  } else {
    console.log("\nℹ️  Aucun mail envoyé. Pour un envoi réel : node scripts/test-gmail.mjs --send toi@bleucitron.net");
  }
  console.log("\n✅ La chaîne d'envoi des justificatifs devrait fonctionner.");
} catch (err) {
  diagnose(err);
  process.exit(1);
}
