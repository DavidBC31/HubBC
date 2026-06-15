import { DepositForm } from "./deposit-form";
import { getSession, isConfigured } from "@/lib/auth";

export const metadata = { title: "Justificatifs paie — Bleu Citron" };
export const dynamic = "force-dynamic";

export default async function JustificatifsPage() {
  const sso = isConfigured();
  const session = await getSession();

  return (
    <>
      <header style={{ marginBottom: 24 }}>
        <h1 className="j-title">Déposer un justificatif</h1>
        <p className="j-sub">
          Forfait téléphonique, mobilité douce, transport en commun ou Pass
          Navigo. Votre justificatif est transmis directement au Pôle Social.
        </p>
      </header>

      {sso && !session ? (
        <div className="glass-card" style={{ textAlign: "center" }}>
          <p className="j-sub" style={{ marginBottom: 16 }}>
            Connectez-vous avec votre compte Google professionnel pour commencer.
          </p>
          <a href="/api/auth/google" className="j-cta" style={{ display: "inline-block", width: "auto", textDecoration: "none", padding: "13px 28px" }}>
            Se connecter avec Google
          </a>
        </div>
      ) : (
        <>
          {session && (
            <div className="j-sub" style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <span>{session.prenom} {session.nom}</span>
              <a href="/api/auth/logout" style={{ color: "var(--text-2)", textDecoration: "underline" }}>
                Se déconnecter
              </a>
            </div>
          )}
          {!sso && (
            <p className="j-alert ko" style={{ marginBottom: 16 }}>
              SSO Google non configuré — saisie manuelle de l&apos;identité (mode dev).
            </p>
          )}
          <DepositForm
            initial={
              session
                ? { nom: session.nom, prenom: session.prenom, email: session.email }
                : undefined
            }
            identityLocked={Boolean(session)}
          />
        </>
      )}
    </>
  );
}
