import { redirect } from "next/navigation";
import { buildDrafts, selectDue, jourDe } from "@/lib/engine";
import { getDataset } from "@/lib/sheet";
import { checkAccess } from "@/lib/gmail";
import { getSession } from "@/lib/auth";
import { GenerateButton } from "./generate-button";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Gating SSO : si configuré, exige une session valide (vérif HMAC + domaine).
  if (process.env.AUTH_SECRET && !(await getSession())) {
    redirect("/api/auth/google");
  }
  const { entries, generated_at, count, live, warning } = await getDataset();
  const now = new Date();
  const jour = jourDe(now);
  const drafts = buildDrafts(entries, now);
  const due = selectDue(entries, now);
  const access = await checkAccess();

  const skips = entries.filter((e) => e.action === "SKIP");
  const reasons = new Map<string, number>();
  for (const e of skips) reasons.set(e.raison_skip, (reasons.get(e.raison_skip) ?? 0) + 1);
  const reasonRows = [...reasons.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Pointages — Relances</h1>
        <p className="text-sm text-gray-500">
          Aujourd&apos;hui : {now.toLocaleDateString("fr-FR")} ({jour}) ·{" "}
          {count} entrées ·{" "}
          {live ? "source live Drive" : "snapshot"} ·{" "}
          {new Date(generated_at).toLocaleString("fr-FR")}
        </p>
        {warning && (
          <p className="mt-1 text-xs text-amber-600">⚠️ {warning}</p>
        )}
      </header>

      <section className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Entrées suivies" value={count} />
        <Stat label={`Pointages dus (${jour})`} value={due.length} />
        <Stat label="Mails à envoyer" value={drafts.length} />
      </section>

      <section className="mb-6 rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Accès boîte pointage@</h2>
          {access.ok ? (
            <span className="rounded bg-green-100 px-2 py-0.5 text-sm text-green-800">
              ✅ {access.email}
            </span>
          ) : (
            <span className="rounded bg-red-100 px-2 py-0.5 text-sm text-red-800">
              ❌ non disponible
            </span>
          )}
        </div>
        {!access.ok && <p className="text-xs text-red-600">{access.error}</p>}
        <GenerateButton disabled={!access.ok || drafts.length === 0} />
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">
          Brouillons du {jour.toLowerCase()} ({drafts.length})
        </h2>
        <div className="space-y-3">
          {drafts.map((d, i) => (
            <details key={i} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{d.to}</span>{" "}
                <span className="text-gray-500">— {d.subject}</span>
                {d.billetTiers && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-800">
                    billet tiers
                  </span>
                )}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs">
                {d.body}
              </pre>
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Exclus automatiquement ({skips.length})</h2>
        <table className="w-full text-sm">
          <tbody>
            {reasonRows.map(([r, n]) => (
              <tr key={r} className="border-b">
                <td className="py-1">{r}</td>
                <td className="py-1 text-right tabular-nums">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}
