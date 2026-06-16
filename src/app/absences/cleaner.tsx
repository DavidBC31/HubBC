"use client";

import { useState } from "react";
import { cleanAbsences, toTSV, type CleanResult } from "@/lib/absences";

export function Cleaner() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<CleanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setFileName(f.name);
    try {
      const text = await f.text();
      const res = cleanAbsences(text);
      if (res.header.length === 0) throw new Error("Fichier vide ou illisible.");
      setResult(res);
    } catch (err) {
      setResult(null);
      setError((err as Error).message);
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
            Choisir l&apos;export Lucca (.tsv / .csv / .xls)
          </span>
          <input
            type="file"
            accept=".tsv,.csv,.txt,.xls,text/plain"
            className="hidden"
            onChange={onFile}
          />
        </label>
        {fileName && (
          <p className="mt-2 text-sm text-gray-500">Fichier : {fileName}</p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          Traitement 100 % local — aucune donnée n&apos;est envoyée au serveur.
        </p>
      </div>

      {error && (
        <p className="rounded bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {result && (
        <>
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
