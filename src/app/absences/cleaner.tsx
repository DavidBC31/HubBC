"use client";

import { useState } from "react";
import { cleanAbsences, toTSV, type CleanResult } from "@/lib/absences";

/** Transforme le fichier déposé en texte tabulé, quel que soit son format.
 *  - .xlsx/.xls binaire  -> SheetJS (import dynamique, 100 % navigateur)
 *  - .tsv/.csv/.txt      -> texte brut (le parseur détecte le séparateur)
 *  Aucune donnée n'est envoyée au serveur (exigence RGPD SI-PRO16.2). */
async function fileToText(f: File): Promise<string> {
  const isBinaryXlsx = /\.xlsx?$/i.test(f.name);
  if (!isBinaryXlsx) return f.text();
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // FS = "\t" : on réémet du tabulé, ce que cleanAbsences sait lire nativement.
  return XLSX.utils.sheet_to_csv(ws, { FS: "\t", blankrows: false });
}

export function Cleaner() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [collapse, setCollapse] = useState(true);
  const [result, setResult] = useState<CleanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function run(text: string, collapseMaladie: boolean) {
    const res = cleanAbsences(text, collapseMaladie);
    if (res.header.length === 0) throw new Error("Fichier vide ou illisible.");
    setResult(res);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setFileName(f.name);
    setBusy(true);
    try {
      const text = await fileToText(f);
      setRawText(text);
      run(text, collapse);
    } catch (err) {
      setResult(null);
      setRawText(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleCollapse(next: boolean) {
    setCollapse(next);
    if (rawText) {
      try {
        run(rawText, next);
      } catch (err) {
        setError((err as Error).message);
      }
    }
  }

  function download() {
    if (!result) return;
    const tsv = toTSV(result.header, result.rows);
    const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "absences_spaiectacle.tsv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-dashed p-6 text-center">
        <label className="cursor-pointer">
          <span className="rounded bg-black px-4 py-2 text-sm font-medium text-white">
            Choisir l&apos;export Lucca (.txt / .tsv / .csv / .xlsx)
          </span>
          <input
            type="file"
            accept=".tsv,.csv,.txt,.xlsx,.xls,text/plain,text/tab-separated-values"
            className="hidden"
            onChange={onFile}
          />
        </label>
        {fileName && (
          <p className="mt-2 text-sm text-gray-500">
            Fichier : {fileName}
            {busy && " — lecture…"}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Traitement 100 % local — aucune donnée n&apos;est envoyée au serveur.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={collapse}
          onChange={(e) => toggleCollapse(e.target.checked)}
        />
        Regrouper la famille maladie (AbMa, AbMaP, AbMaT) dans <code>AbMa</code>
        <span className="text-gray-400">— décocher pour conserver le détail</span>
      </label>

      {error && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {result && (
        <>
          {result.warnings.length > 0 && (
            <ul className="space-y-1 rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
              {result.warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          )}

          <section className="grid grid-cols-3 gap-4">
            <Stat label="Lignes en entrée" value={result.stats.lignesEntree} />
            <Stat label="Collaborateurs" value={result.stats.collaborateurs} />
            <Stat label="Lignes fusionnées" value={result.stats.fusions} />
          </section>

          <button
            onClick={download}
            className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Télécharger le fichier sPAIEctacle
          </button>

          <section>
            <h2 className="mb-2 font-semibold">
              Aperçu ({result.rows.length} lignes)
            </h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    {result.header.map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, ri) => (
                    <tr key={ri} className="border-t">
                      {r.map((c, ci) => (
                        <td key={ci} className="whitespace-nowrap px-2 py-1 tabular-nums">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
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
