import { redirect } from "next/navigation";
import { buildDrafts, selectDue, jourDe } from "@/lib/engine";
import { getDataset } from "@/lib/sheet";
import { checkAccess } from "@/lib/gmail";
import { getSession } from "@/lib/auth";
import { GenerateButton } from "./generate-button";
import { RepliesPanel } from "./replies-panel";

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
    <div className="mx-auto w-full max-w-[1100px] px-6 py-5">
      {/* Navbar pill */}
      <nav className="navbar-pill mb-8 flex items-center justify-between px-5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">🍋</span>
          <span className="text-[15px] font-semibold tracking-tight">Pointages</span>
        </div>
        <AccessChip ok={access.ok} email={access.email} />
      </nav>

      <main className="fade-in space-y-6">
        {/* En-tête */}
        <header>
          <h1 className="text-[28px] font-semibold tracking-tight">Relances du {jour.toLowerCase()}</h1>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-apple-secondary">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-apple-green" />
            {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}
            {count} entrées · {live ? "source live Drive" : "snapshot"} · maj{" "}
            {new Date(generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {warning && <p className="mt-1 text-xs text-apple-orange">⚠️ {warning}</p>}
        </header>

        {/* Stats */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Entrées suivies" value={count} />
          <Stat label={`Pointages dus (${jour.toLowerCase()})`} value={due.length} accent />
          <Stat label="Mails à envoyer" value={drafts.length} />
        </section>

        {/* Génération */}
        <section className="glass-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[18px] font-semibold tracking-tight">Génération des brouillons</h2>
              <p className="mt-0.5 text-[13px] text-apple-secondary">
                Crée un brouillon par destinataire dans la boîte pointage@. Rien n&apos;est envoyé.
              </p>
            </div>
          </div>
          {!access.ok && <p className="mt-2 text-xs text-apple-orange">{access.error}</p>}
          <GenerateButton disabled={!access.ok || drafts.length === 0} />
        </section>

        {/* Réponses des salles */}
        <section className="glass-card p-5">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight">Réponses des salles</h2>
            <p className="mt-0.5 text-[13px] text-apple-secondary">
              Repère les contacts à relancer qui ont déjà répondu dans pointage@ (lecture
              seule, rien n&apos;est modifié).
            </p>
          </div>
          {!access.ok && <p className="mt-2 text-xs text-apple-orange">{access.error}</p>}
          <RepliesPanel disabled={!access.ok} />
        </section>

        {/* Brouillons */}
        <section className="glass-card p-5">
          <h2 className="mb-3 text-[18px] font-semibold tracking-tight">
            Aperçu ({drafts.length})
          </h2>
          <div className="space-y-2">
            {drafts.map((d, i) => (
              <details
                key={i}
                className="rounded-xl border border-white/40 bg-white/30 px-4 py-3"
              >
                <summary className="cursor-pointer list-none text-[14px]">
                  <span className="font-medium">{d.to}</span>{" "}
                  <span className="text-apple-secondary">— {d.subject}</span>
                  {d.billetTiers && (
                    <span className="ml-2 rounded-full bg-apple-orange/15 px-2 py-0.5 text-[11px] font-medium text-apple-orange">
                      billet tiers
                    </span>
                  )}
                </summary>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/[0.03] p-4 font-sans text-[13px] leading-relaxed text-apple-text">
                  {d.body}
                </pre>
              </details>
            ))}
          </div>
        </section>

        {/* Exclusions */}
        <section className="glass-card p-5">
          <h2 className="mb-3 text-[18px] font-semibold tracking-tight">
            Exclus automatiquement ({skips.length})
          </h2>
          <table className="w-full text-[13px]">
            <tbody>
              {reasonRows.map(([r, n]) => (
                <tr key={r} className="border-b border-apple-separator/40 last:border-0">
                  <td className="py-1.5 text-apple-text">{r}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="glass-card p-5">
      <div
        className={`text-[34px] font-semibold leading-none tracking-tight tabular-nums ${
          accent ? "text-apple-blue" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-2 text-[13px] text-apple-secondary">{label}</div>
    </div>
  );
}

function AccessChip({ ok, email }: { ok: boolean; email?: string }) {
  return (
    <span
      className={`glass-pill flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ${
        ok ? "text-apple-green" : "text-apple-orange"
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          ok ? "bg-apple-green" : "bg-apple-orange"
        }`}
      />
      {ok ? (email ?? "connecté") : "boîte indispo"}
    </span>
  );
}
