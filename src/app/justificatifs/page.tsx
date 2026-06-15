import { DepositForm } from "./deposit-form";
import { getSession, isConfigured } from "@/lib/auth";
import { lookupMatricule } from "./actions";

export const metadata = { title: "Justificatifs paie — Dépôt" };
export const dynamic = "force-dynamic";

export default async function JustificatifsPage() {
  const sso = isConfigured();
  const session = await getSession();

  // Si connecté : on tente de pré-résoudre le matricule depuis l'annuaire BCD.
  let matricule = "";
  if (session) {
    const r = await lookupMatricule(session.nom, session.prenom);
    if (r.ok && r.salarie) matricule = r.salarie.matricule;
  }

  return (
    <main className="mx-auto max-w-3xl p-6 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Dépôt de justificatif paie</h1>
        <p className="text-sm text-gray-500">
          Déposez vos justificatifs (téléphone, mobilité, transport). Un email
          standardisé est envoyé au Pôle Social, qui archive les pièces et
          alimente l&apos;import sPAIEctacle.
        </p>
      </header>

      {sso && !session ? (
        <section className="rounded-lg border p-6 text-center">
          <p className="mb-4 text-sm text-gray-600">
            Connectez-vous avec votre compte Google professionnel pour déposer un
            justificatif.
          </p>
          <a
            href="/api/auth/google"
            className="inline-block rounded bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Se connecter avec Google
          </a>
        </section>
      ) : (
        <>
          {session && (
            <div className="mb-4 flex items-center justify-between rounded bg-gray-50 px-3 py-2 text-sm">
              <span>
                Connecté : <strong>{session.prenom} {session.nom}</strong> ({session.email})
              </span>
              <a href="/api/auth/logout" className="text-gray-500 underline">
                Se déconnecter
              </a>
            </div>
          )}
          {!sso && (
            <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              SSO Google non configuré — saisie manuelle de l&apos;identité (mode dev).
            </p>
          )}
          <DepositForm
            initial={
              session
                ? { nom: session.nom, prenom: session.prenom, email: session.email, matricule }
                : undefined
            }
            identityLocked={Boolean(session)}
          />
        </>
      )}
    </main>
  );
}
