"use client";

import { useActionState, useState, useTransition } from "react";
import {
  buildPivotEmail,
  DOC_TYPES,
  type DocType,
  type Submission,
} from "@/lib/justificatifs";
import { lookupMatricule, submitJustificatif, type SubmitState } from "./actions";

const moisCourant = () => new Date().toISOString().slice(0, 7);

interface InitialIdentity {
  nom: string;
  prenom: string;
  email: string;
  matricule: string;
}

export function DepositForm({
  initial,
  identityLocked = false,
}: {
  initial?: InitialIdentity;
  identityLocked?: boolean;
}) {
  // Identité : pré-remplie par le SSO Google (US-01), sinon saisie manuelle (dev).
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [prenom, setPrenom] = useState(initial?.prenom ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [matricule, setMatricule] = useState(initial?.matricule ?? "");
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState<DocType>("TRANSPORT");
  const [montant, setMontant] = useState("");
  const [mois, setMois] = useState(moisCourant());
  const [fichiers, setFichiers] = useState<string[]>([]);
  const [sendState, sendAction, sending] = useActionState<SubmitState, FormData>(
    submitJustificatif,
    {},
  );

  function onLookup() {
    setLookupMsg(null);
    startTransition(async () => {
      const res = await lookupMatricule(nom, prenom);
      if (res.ok && res.salarie) {
        setMatricule(res.salarie.matricule);
        setNom(res.salarie.nom);
        setPrenom(res.salarie.prenom);
        setLookupMsg(`✅ Matricule trouvé : ${res.salarie.matricule}`);
      } else {
        setLookupMsg(`⚠️ ${res.error} — saisissez votre matricule manuellement.`);
      }
    });
  }

  const montantNum = Number(montant.replace(",", "."));
  const valid =
    matricule && nom && Number.isFinite(montantNum) && montantNum > 0 && mois;

  const submission: Submission | null = valid
    ? { matricule, nom, prenom, email, type, montant: montantNum, mois, fichiers }
    : null;
  const preview = submission ? buildPivotEmail(submission) : null;

  return (
    <form action={sendAction} className="space-y-6">
      {/* Valeurs contrôlées transmises à la server action (l'identité de confiance
          est ré-injectée côté serveur depuis la session quand elle existe). */}
      <input type="hidden" name="matricule" value={matricule} />
      <input type="hidden" name="nom" value={nom} />
      <input type="hidden" name="prenom" value={prenom} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="montant" value={montant} />
      <input type="hidden" name="mois" value={mois} />

      <fieldset className="rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Identité</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom" value={nom} onChange={setNom} readOnly={identityLocked} />
          <Field label="Prénom" value={prenom} onChange={setPrenom} readOnly={identityLocked} />
          <Field label="Email pro" value={email} onChange={setEmail} type="email" readOnly={identityLocked} />
          <Field label="Matricule" value={matricule} onChange={setMatricule} readOnly={identityLocked && !!matricule} />
        </div>
        {/* Matricule introuvable depuis l'annuaire : on propose une recherche / saisie manuelle. */}
        {!matricule && (
          <>
            <button
              type="button"
              onClick={onLookup}
              disabled={pending || !nom}
              className="mt-3 rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {pending ? "Recherche…" : "Retrouver mon matricule"}
            </button>
            {lookupMsg && <p className="mt-2 text-xs">{lookupMsg}</p>}
          </>
        )}
      </fieldset>

      <fieldset className="rounded-lg border p-4">
        <legend className="px-1 text-sm font-semibold">Justificatif</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Type de document
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DocType)}
              className="mt-1 w-full rounded border px-2 py-1.5"
            >
              {DOC_TYPES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <Field label="Montant (€)" value={montant} onChange={setMontant} />
          <label className="text-sm">
            Mois de paie
            <input
              type="month"
              value={mois}
              onChange={(e) => setMois(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            Pièces justificatives
            <input
              type="file"
              name="fichiers"
              multiple
              onChange={(e) =>
                setFichiers(Array.from(e.target.files ?? []).map((f) => f.name))
              }
              className="mt-1 w-full text-xs"
            />
          </label>
        </div>
      </fieldset>

      <section>
        <h2 className="mb-2 font-semibold">Aperçu de l&apos;email envoyé à Azaïs</h2>
        {preview ? (
          <div className="rounded-lg border">
            <div className="border-b bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-500">Objet :</span> {preview.subject}
            </div>
            <pre className="whitespace-pre-wrap p-3 text-xs">{preview.body}</pre>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Renseignez matricule, nom et montant pour voir l&apos;aperçu.
          </p>
        )}
      </section>

      <div className="space-y-2">
        <button
          type="submit"
          disabled={!valid || fichiers.length === 0 || sending}
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {sending ? "Envoi…" : "Soumettre à Azaïs"}
        </button>
        {fichiers.length === 0 && (
          <p className="text-xs text-gray-400">Joignez au moins une pièce justificative.</p>
        )}
        {sendState.ok && (
          <p className="rounded bg-green-100 px-3 py-2 text-sm text-green-800">
            ✅ {sendState.message}
          </p>
        )}
        {sendState.error && (
          <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">
            ⚠️ {sendState.error}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="text-sm">
      {label}
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className={
          "mt-1 w-full rounded border px-2 py-1.5" +
          (readOnly ? " bg-gray-100 text-gray-600" : "")
        }
      />
    </label>
  );
}
