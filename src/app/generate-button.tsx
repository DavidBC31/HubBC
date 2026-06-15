"use client";
import { useState } from "react";

export function GenerateButton({ disabled }: { disabled: boolean }) {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!confirm("Créer les brouillons dans la boîte pointage@ ? (rien n'est envoyé)")) return;
    setBusy(true);
    setStatus("Création des brouillons…");
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      setStatus(
        res.ok
          ? `✅ ${data.created?.length ?? 0} brouillons créés dans pointage@. À relire puis envoyer manuellement.`
          : `❌ ${data.error}`,
      );
    } catch (e) {
      setStatus(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button onClick={run} disabled={disabled || busy} className="btn-cta">
        {busy ? "…" : "Générer les brouillons dans pointage@"}
      </button>
      {status && <p className="mt-2 text-[13px] text-apple-secondary">{status}</p>}
    </div>
  );
}
