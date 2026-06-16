import { Cleaner } from "./cleaner";

export const metadata = { title: "Absences — Nettoyeur Lucca → sPAIEctacle" };

export default function AbsencesPage() {
  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Absences — Lucca → sPAIEctacle</h1>
        <p className="text-sm text-gray-500">
          Déposez l&apos;export Lucca : le robot fusionne les lignes multiples
          (une par période) en une seule ligne par collaborateur, dates
          concaténées, prêt à importer dans sPAIEctacle.
        </p>
      </header>
      <Cleaner />
    </main>
  );
}
