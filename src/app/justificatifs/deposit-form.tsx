"use client";

import { useActionState, useRef, useState } from "react";
import {
  DOC_TYPES,
  PLAFONDS,
  validateMontant,
  type DocType,
} from "@/lib/justificatifs";
import { submitJustificatif, type SubmitState } from "./actions";

const moisCourant = () => new Date().toISOString().slice(0, 7);

interface InitialIdentity {
  nom: string;
  prenom: string;
  email: string;
}

export function DepositForm({
  initial,
  identityLocked = false,
}: {
  initial?: InitialIdentity;
  identityLocked?: boolean;
}) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [prenom, setPrenom] = useState(initial?.prenom ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");

  const [type, setType] = useState<DocType>("TELEPHONE");
  const [montant, setMontant] = useState("");
  const [mois, setMois] = useState(moisCourant());
  const [fichiers, setFichiers] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [sendState, sendAction, sending] = useActionState<SubmitState, FormData>(
    submitJustificatif,
    {},
  );

  const montantNum = Number(montant.replace(",", "."));
  const montantErr = montant ? validateMontant(type, montantNum) : null;
  const plafond = PLAFONDS[type];
  const valid = Boolean(nom && email && montant && !montantErr && mois && fichiers.length);

  function refreshNames() {
    setFichiers(Array.from(fileRef.current?.files ?? []).map((f) => f.name));
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    if (fileRef.current && e.dataTransfer.files.length) {
      fileRef.current.files = e.dataTransfer.files;
      refreshNames();
    }
  }

  return (
    <form action={sendAction} className="glass-card" style={{ display: "grid", gap: 18 }}>
      <input type="hidden" name="nom" value={nom} />
      <input type="hidden" name="prenom" value={prenom} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="montant" value={montant} />
      <input type="hidden" name="mois" value={mois} />

      {/* Identité : éditable seulement en mode dev (sans SSO). */}
      {!identityLocked && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label className="j-label">Nom</label>
            <input className="j-input" value={nom} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div>
            <label className="j-label">Prénom</label>
            <input className="j-input" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="j-label">Email pro</label>
            <input className="j-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
      )}

      <div>
        <label className="j-label">Type de justificatif</label>
        <select className="j-select" value={type} onChange={(e) => setType(e.target.value as DocType)}>
          {DOC_TYPES.map((d) => (
            <option key={d.id} value={d.id}>{d.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="j-label">
            Montant (€){plafond != null && <span> · max {plafond} €</span>}
          </label>
          <input
            className={"j-input" + (montantErr ? " err" : "")}
            type="number" inputMode="decimal" min="0" step="0.01" max={plafond}
            value={montant} onChange={(e) => setMontant(e.target.value)}
            placeholder="0,00"
          />
          {montantErr && (
            <span style={{ fontSize: 12, color: "var(--orange)" }}>{montantErr}</span>
          )}
        </div>
        <div>
          <label className="j-label">Mois de la dépense</label>
          <input className="j-input" type="month" value={mois} onChange={(e) => setMois(e.target.value)} />
        </div>
      </div>

      {/* Zone de dépôt claire */}
      <div>
        <label className="j-label">Justificatif (facture, reçu…)</label>
        <label
          className={"dropzone" + (drag ? " drag" : "")}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4m0 0L7 9m5-5l5 5" />
            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            Glissez votre fichier ici, ou <span style={{ color: "var(--blue)" }}>cliquez pour choisir</span>
          </span>
          <span style={{ fontSize: 12, color: "var(--text-2)" }}>PDF, JPG ou PNG</span>
          <input
            ref={fileRef}
            type="file"
            name="fichiers"
            multiple
            accept="image/*,application/pdf"
            style={{ display: "none" }}
            onChange={refreshNames}
          />
        </label>
        {fichiers.length > 0 && (
          <ul className="dropzone-files" style={{ listStyle: "none", padding: 0 }}>
            {fichiers.map((f) => (
              <li key={f}>📎 {f}</li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit" className="j-cta" disabled={!valid || sending}>
        {sending ? "Envoi en cours…" : "Envoyer mon justificatif"}
      </button>

      {sendState.ok && <p className="j-alert ok">✓ {sendState.message}</p>}
      {sendState.error && <p className="j-alert ko">{sendState.error}</p>}
    </form>
  );
}
