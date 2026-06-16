"use client";
import { useState } from "react";

interface EntryReply {
  id: number;
  email: string | null;
  artiste: string;
  ville: string;
  salle: string;
  responded: boolean;
  lastReplyDate: string | null;
  hasAttachment: boolean;
  snippet: string;
}
interface RepliesResult {
  checkedAt: string;
  days: number;
  replies: EntryReply[];
  summary: { total: number; responded: number; withAttachment: number };
}

function label(r: EntryReply): string {
  const loc = [r.ville, r.salle].filter(Boolean).join(" - ");
  return [r.artiste, loc].filter(Boolean).join(" - ") || r.email || "—";
}

export function RepliesPanel({ disabled }: { disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<RepliesResult | null>(null);

  async function run() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/relances/replies");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "erreur");
      setData(j as RepliesResult);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const responded = data?.replies.filter((r) => r.responded) ?? [];

  return (
    <div className="mt-4">
      <button onClick={run} disabled={disabled || busy} className="btn-cta">
        {busy ? "Vérification…" : "Vérifier les réponses (30 j)"}
      </button>
      {err && <p className="mt-2 text-[13px] text-apple-orange">❌ {err}</p>}

      {data && (
        <div className="mt-4">
          <p className="text-[13px] text-apple-secondary">
            <span className="font-medium text-apple-green">{data.summary.responded}</span> /{" "}
            {data.summary.total} salles ont répondu · {data.summary.withAttachment} avec pièce
            jointe · vérifié à{" "}
            {new Date(data.checkedAt).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>

          {responded.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {responded.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/30 px-4 py-2 text-[13px]"
                >
                  <span className="text-apple-green">✓</span>
                  <span className="font-medium">{label(r)}</span>
                  {r.hasAttachment && (
                    <span className="rounded-full bg-apple-green/15 px-2 py-0.5 text-[11px] font-medium text-apple-green">
                      📎 chiffres reçus
                    </span>
                  )}
                  {r.lastReplyDate && (
                    <span className="ml-auto text-apple-secondary tabular-nums">
                      {r.lastReplyDate}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-apple-secondary">
              Aucune réponse détectée sur la période.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
